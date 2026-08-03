import { navigate, onLeave } from '../core/router.js'
import { poseEngine } from '../core/pose/index.js'
import { createPipOverlay } from '../core/pose/pipOverlay.js'
import { isArmsUpCircle, isArmsUpCross, GestureHold } from '../core/pose/gesture.js'
import { GESTURE } from '../core/pose/tuning.js'
import { saveResult } from '../core/gameResult.js'
import { getCurrentPlayerName } from '../core/player.js'
import { handSession } from '../core/handSession.js'
import { GAME_REGISTRY } from '../games/registry.js'
import * as sound from '../core/sound.js'
import * as bgm   from '../core/bgm.js'

// STEP 3 — 멀티디바이스(여러 대 연결) 제거됨.
//
// 원래 이 파일에는 세션 코드 입력 · 역할 선택(모니터/컨트롤러/웹캠) · Supabase Realtime
// presence 동기화가 함께 있었다. 한 대에서 카메라와 화면을 모두 처리하는 지금 구조에서는
// 쓰이지 않는 코드였고, 남겨두면 STEP 4의 포즈 엔진 교체가 그만큼 넓어진다.
//
// 지운 것: showModeSelection · showSessionEntry · showRoleSelection · showMonitorView ·
//          showControllerView · showWebcamView · _askPlayerName ·
//          core/channel.js · pages/control.js · pages/camera.js
// 남긴 것: 모바일 가로 코치마크 · 솔로 게임

function _isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || window.innerWidth < 768
}

// ═══════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════
export async function gamePage(app, query) {
  const gameId = query.id ?? 'poop-dodge'
  const entry  = GAME_REGISTRY[gameId]
  if (!entry) { navigate('/'); return }

  // 뒤로 나갈 곳은 허브가 아니라 이 게임의 인트로다. 한 단계씩 되짚어야
  // "잘못 눌렀다" 싶을 때 되돌아가는 비용이 작다.
  const backTo = entry.entry ?? '/'

  // 플레이 중에는 손 커서를 숨긴다. 몸으로 조종하는 화면이라 커서가 계속 따라다니면
  // 시야를 가리고, 버튼 위를 스쳐 머무르기가 걸릴 수도 있다. 종료는 O/X로 한다.
  // 카메라는 그대로 둔다 — 세션이 들고 있는 스트림을 이 게임도 빌려 쓴다.
  handSession.setPointerActive(false)

  await bgm.load(gameId)
  await sound.load(gameId)
  bgm.play()

  if (_isMobile()) {
    const ok = await showOrientationCoach(app)
    if (!ok) { navigate(backTo); return }
  }

  await showSoloGame(app, gameId, entry)
}

// ═══════════════════════════════════════════════════════════════
// 모바일 가로 코치마크
// ═══════════════════════════════════════════════════════════════
function showOrientationCoach(app) {
  return new Promise(resolve => {
    if (window.innerWidth > window.innerHeight) { resolve(true); return }

    const styleEl = document.createElement('style')
    styleEl.textContent = `
      @keyframes _phoneRotate {
        0%,30%  { transform:rotate(0deg); }
        60%,90% { transform:rotate(-90deg); }
        100%    { transform:rotate(0deg); }
      }
      #_rotateIcon { animation:_phoneRotate 2.4s ease-in-out infinite; display:inline-block; font-size:4rem; }
      #orient-root {
        position:fixed;inset:0;
        background:url('/assets/image/poop_game_bg.jpg') center/cover no-repeat;
        display:flex;align-items:center;justify-content:center;
        font-family:var(--font-main);
      }
      #orient-outer {
        position:relative;display:flex;flex-direction:column;align-items:center;
      }
      #orient-signboard {
        position:relative;z-index:10;
        width:clamp(180px,48vw,280px);object-fit:contain;
        filter:drop-shadow(0 6px 16px rgba(0,0,0,0.32));pointer-events:none;
        margin-bottom:clamp(-40px,-6vw,-28px);
      }
      #orient-card {
        position:relative;z-index:1;
        background:#F7F0FF;
        border:10px solid #c4a8f5;outline:10px solid #fff;
        border-radius:90px;
        padding:clamp(44px,7vw,64px) clamp(24px,6vw,48px) clamp(24px,4vw,36px);
        width:clamp(280px,86vw,440px);
        display:flex;flex-direction:column;align-items:center;
        gap:clamp(10px,2vh,16px);
        box-shadow:0 6px 0 #a78bda,0 16px 56px rgba(0,0,0,0.28);
        text-align:center;
      }
      #orient-title {
        color:#7c3aed;font-size:clamp(1.15rem,4.5vw,1.4rem);font-weight:800;margin:0;
      }
      #orient-sub {
        color:#a78bda;font-size:clamp(0.85rem,3vw,1rem);margin:0;
      }
      #btn-skip-orient {
        width:100%;padding:clamp(12px,2vh,16px) 0;
        background:linear-gradient(180deg,#6ee75a,#3cb544);
        border:none;border-radius:9999px;
        box-shadow:0 5px 0 #2a8a30;
        color:#fff;font-family:var(--font-main);
        font-size:clamp(1rem,3.2vw,1.2rem);font-weight:800;
        cursor:pointer;transition:transform 0.1s,box-shadow 0.1s;
        -webkit-tap-highlight-color:transparent;
      }
      #btn-skip-orient:active { transform:scale(0.95) translateY(3px);box-shadow:0 2px 0 #2a8a30; }
      #btn-home-coach {
        width:100%;padding:clamp(12px,2vh,16px) 0;
        background:linear-gradient(180deg,#b0b8c1,#8a9199);
        border:none;border-radius:9999px;
        box-shadow:0 5px 0 #626a71;
        color:#fff;font-family:var(--font-main);
        font-size:clamp(1rem,3.2vw,1.2rem);font-weight:800;
        cursor:pointer;transition:transform 0.1s,box-shadow 0.1s;
        -webkit-tap-highlight-color:transparent;
      }
      #btn-home-coach:active { transform:scale(0.95) translateY(3px);box-shadow:0 2px 0 #626a71; }
      @media (max-height: 560px) {
        #orient-root { overflow-y:auto; align-items:flex-start; }
        #orient-outer {
          width:100%; min-height:100vh; min-height:100dvh;
          display:flex; flex-direction:column;
          align-items:center; justify-content:center;
          padding:16px 0; box-sizing:border-box;
        }
        #orient-signboard { display:none; }
        #orient-card {
          border-radius:40px; gap:8px;
          padding:18px 20px 14px;
          width:clamp(280px,86vw,440px);
        }
        #_rotateIcon { font-size:2.4rem; }
        #orient-title { font-size:1.1rem; }
        #orient-sub { font-size:0.85rem; }
        #btn-skip-orient, #btn-home-coach { padding:10px 0; font-size:0.95rem; }
      }
    `
    document.head.appendChild(styleEl)

    app.innerHTML = `
      <div id="orient-root">
        <div id="orient-outer">
          <img id="orient-signboard" src="/assets/image/tit_signboard_playzera.png" alt="PLAY ZERA" />
          <div id="orient-card">
            <div id="_rotateIcon">📱</div>
            <h2 id="orient-title">기기를 가로로 돌려주세요</h2>
            <p id="orient-sub">게임은 가로 화면에 최적화되어 있어요</p>
            <button id="btn-skip-orient">건너뛰기 (세로 유지)</button>
            <button id="btn-home-coach">← 홈으로</button>
          </div>
        </div>
      </div>
    `

    app.querySelector('#orient-signboard')?.addEventListener('error', e => { e.target.style.display='none' })

    const done = result => {
      styleEl.remove()
      window.removeEventListener('resize', checkLandscape)
      resolve(result)
    }

    const checkLandscape = () => {
      if (window.innerWidth > window.innerHeight) done(true)
    }
    window.addEventListener('resize', checkLandscape)

    app.querySelector('#btn-skip-orient').addEventListener('click', () => done(true))
    app.querySelector('#btn-home-coach').addEventListener('click', () => done(false))
  })
}

// ═══════════════════════════════════════════════════════════════
// 1대 모드 (솔로)
// ═══════════════════════════════════════════════════════════════
async function showSoloGame(app, gameId, entry) {
  const { manifest } = entry
  const backTo = entry.entry ?? '/'   // 이 게임의 인트로

  // 이름 입력 화면은 뺐다 — 웜업도 물어보지 않는다.
  // 시작 버튼과 게임 사이에 키보드 입력을 끼워 넣으면 4~8세에게는 그게 벽이다.
  // 누가 했는지는 계정이 정할 몫이라 core/player.js 한 곳만 본다.
  const playerName = getCurrentPlayerName()

  const rounds = manifest.rounds ?? 5

  app.innerHTML = `
    <style>
      /* ── 솔로 HUD (개별 배경) ── */
      #solo-hud {
        position: absolute; top: 0; left: 0; right: 0; z-index: 5;
        display: flex; align-items: center; justify-content: space-between;
        padding: clamp(8px,1.4vh,12px) clamp(12px,2vw,20px);
        font-family: var(--font-main);
      }
      #hud-rounds {
        display: flex; gap: 7px; align-items: center;
        background: rgba(10,6,22,0.65); backdrop-filter: blur(10px);
        border-radius: 50px; padding: 7px 14px;
      }
      .hud-pip {
        width: clamp(10px,1.4vw,15px); height: clamp(10px,1.4vw,15px);
        border-radius: 50%; background: rgba(255,255,255,0.18);
        flex-shrink: 0; transition: background 0.3s, box-shadow 0.3s;
      }
      .hud-pip.done { background: #7c3aed; box-shadow: 0 0 7px rgba(124,58,237,0.75); }
      #hud-timer {
        background: linear-gradient(180deg,#ffe94d,#f0c000);
        color: #5a3c00; font-size: clamp(1rem,2.4vw,1.4rem); font-weight: 900;
        min-width: clamp(36px,4.5vw,52px); text-align: center;
        padding: 3px 14px; border-radius: 50px;
        box-shadow: 0 3px 0 #b88e00, 0 4px 12px rgba(240,192,0,0.3);
        line-height: 1.35;
      }
      #hud-score-wrap {
        background: rgba(10,6,22,0.65); backdrop-filter: blur(10px);
        border-radius: 50px; padding: 6px 16px;
        font-size: clamp(0.78rem,1.8vw,0.95rem); color: rgba(255,255,255,0.5); font-weight: 700;
      }
      #score-val {
        color: #6ee75a; font-size: clamp(1rem,2.4vw,1.3rem); font-weight: 900; margin-left: 4px;
      }
      #hud-lives {
        background: rgba(10,6,22,0.65); backdrop-filter: blur(10px);
        border-radius: 50px; padding: 6px 12px;
        display: flex; gap: clamp(2px,0.5vw,6px); font-size: clamp(1.1rem,2.6vw,1.5rem);
      }
      .hud-icon-btn {
        background: none; border: none; padding: 0;
        cursor: pointer; flex-shrink: 0;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.12s; line-height: 1;
      }
      .hud-icon-btn img { display: block; width: clamp(36px, 4.5vw, 54px); height: auto; }
      .hud-icon-btn:hover  { transform: scale(1.12); }
      .hud-icon-btn:active { transform: scale(0.90); }
      /* ── 메뉴 카드 ── */
      #menu-card {
        background: #F7F0FF;
        border: 10px solid #c4a8f5; outline: 10px solid #fff;
        border-radius: 80px;
        padding: clamp(28px,4vw,40px) clamp(32px,5vw,52px);
        display: flex; flex-direction: column;
        gap: clamp(10px,1.6vh,14px); min-width: clamp(260px,36vw,360px);
        text-align: center;
        box-shadow: 0 6px 0 #a78bda, 0 16px 56px rgba(0,0,0,0.4);
      }
      #menu-title { font-size: clamp(1.2rem,2.8vw,1.5rem); font-weight: 900; color: #7c3aed; margin-bottom: 2px; }
      .menu-btn {
        width: 100%; padding: clamp(12px,2vh,16px) 0;
        border: none; border-radius: 9999px;
        font-family: var(--font-main); font-size: clamp(0.95rem,2.4vw,1.15rem); font-weight: 800;
        cursor: pointer; transition: transform 0.1s; -webkit-tap-highlight-color: transparent;
      }
      .menu-btn:active { transform: scale(0.96) translateY(2px); }
      .menu-btn.green { background: linear-gradient(180deg,#6ee75a,#3cb544); color:#fff; box-shadow:0 5px 0 #2a8a30; }
      .menu-btn.gray  { background: linear-gradient(180deg,#b0b8c1,#8a9199); color:#fff; box-shadow:0 5px 0 #626a71; }
      .menu-btn.danger {
        background: linear-gradient(180deg,#ff6b6b,#e53935); color:#fff; box-shadow:0 5px 0 #b71c1c;
      }
      /* ── 솔로 게임오버 카드 ── */
      #go-outer-solo { position:relative; display:flex; flex-direction:column; align-items:center; }
      #go-signboard-solo {
        position:relative; z-index:10;
        width:clamp(200px,52vw,320px); object-fit:contain;
        filter:drop-shadow(0 6px 16px rgba(0,0,0,0.32)); pointer-events:none;
        margin-bottom:clamp(-44px,-6.5vw,-32px);
      }
      #go-card-solo {
        position:relative; z-index:1; background:#F7F0FF;
        border:10px solid #c4a8f5; outline:10px solid #fff; border-radius:90px;
        padding:clamp(48px,7vw,64px) clamp(32px,6vw,60px) clamp(28px,4vw,40px);
        width:clamp(300px,88vw,500px); display:flex; flex-direction:column; align-items:center;
        gap:clamp(10px,2vh,16px); box-shadow:0 6px 0 #a78bda, 0 16px 56px rgba(0,0,0,0.32);
      }
      #go-emoji-solo { font-size:clamp(2.4rem,6vw,3.6rem); line-height:1; }
      #go-title-solo { font-size:clamp(1.4rem,4vw,2rem); font-weight:900; text-align:center; }
      #go-stats-solo {
        font-size:clamp(0.82rem,2vw,1rem); color:#9d6ed8; text-align:center; line-height:2;
        background:#ede5ff; border-radius:20px; padding:12px 20px; width:100%;
      }
      #go-stats-solo strong { color:#3b0764; }
      .go-btn-row-solo { display:flex; gap:12px; width:100%; }
      #btn-retry {
        flex:1; padding:clamp(13px,2.2vh,18px) 0;
        background:linear-gradient(180deg,#6ee75a,#3cb544); border:none; border-radius:9999px;
        box-shadow:0 5px 0 #2a8a30; color:#fff; font-family:var(--font-main);
        font-size:clamp(1rem,2.6vw,1.2rem); font-weight:800; cursor:pointer; transition:transform 0.1s;
      }
      #btn-home-go {
        flex:1; padding:clamp(13px,2.2vh,18px) 0;
        background:linear-gradient(180deg,#b0b8c1,#8a9199); border:none; border-radius:9999px;
        box-shadow:0 5px 0 #626a71; color:#fff; font-family:var(--font-main);
        font-size:clamp(1rem,2.6vw,1.2rem); font-weight:800; cursor:pointer; transition:transform 0.1s;
      }
    </style>

    <div id="game-wrap" style="position:relative;width:100%;height:100vh;height:100dvh;overflow:hidden;">
      <canvas id="game-canvas" style="display:block;width:100%;height:100%;"></canvas>

      <div id="game-overlay" style="
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        pointer-events:none;font-family:var(--font-main);font-weight:800;
        transition:opacity 0.2s;opacity:0;
      "></div>

      <!-- HUD (배경 없음 — 각 요소에 개별 배경) -->
      <div id="solo-hud">
        <div id="hud-rounds"></div>
        <div style="display:flex;align-items:center;gap:10px;">
          <div id="hud-timer"></div>
          <div id="hud-score-wrap">점수<span id="score-val">0</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <div id="hud-lives"></div>
          <button id="btn-mute" class="hud-icon-btn">
            <img id="hud-mute-img" src="/assets/image/btn_main_audio.png" alt="소리" />
          </button>
          <button id="btn-menu" class="hud-icon-btn">
            <img src="/assets/image/ico_menu.png" alt="메뉴" />
          </button>
        </div>
      </div>

      <!-- PIP 카메라 — 영상 위에 스켈레톤과 3분할 라인을 겹쳐 그린다.
           내가 지금 어느 칸에 서 있는지가 이 작은 화면에서 바로 읽혀야
           "옆으로 피한다"는 규칙이 몸으로 이해된다. -->
      <div id="pip-wrap" style="
        position:absolute;bottom:120px;right:12px;
        width:200px;height:150px;display:none;
        border-radius:12px;overflow:hidden;
        border:2px solid rgba(196,168,245,0.5);
        box-shadow:0 4px 16px rgba(0,0,0,0.4);
      ">
        <video id="pip-video" playsinline muted style="
          position:absolute;inset:0;width:100%;height:100%;
          object-fit:cover;transform:scaleX(-1);
        "></video>
        <!-- 오버레이는 반전하지 않는다. poseEngine이 거울 좌표로 내보내므로
             그대로 그리면 반전된 영상과 자리가 맞는다. 여기에 scaleX(-1)을
             또 걸면 좌우가 뒤집힌다 — 가장 흔한 실수 지점. -->
        <canvas id="pip-overlay" style="
          position:absolute;inset:0;width:100%;height:100%;
        "></canvas>
      </div>

      <!-- 손동작 안내 + 게이지.
           일시정지 메뉴(z-index 20)와 게임오버 위에도 떠야 하므로 z-index를 더 높게 둔다.
           화면마다 따로 만들지 않고 문구만 바꿔 하나로 쓴다. -->
      <div id="gesture-hint" style="
        position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:30;
        display:none;flex-direction:column;align-items:center;gap:6px;
        background:rgba(10,6,22,0.78);backdrop-filter:blur(8px);
        padding:8px 18px;border-radius:50px;border:1px solid rgba(196,168,245,0.25);
        font-family:var(--font-main);font-size:0.85rem;color:#ffe27a;
        pointer-events:none;white-space:nowrap;
      ">
        <div id="gesture-hint-text"></div>
        <div style="width:150px;height:7px;background:rgba(255,255,255,0.16);border-radius:999px;overflow:hidden;">
          <div id="gesture-gauge" style="height:100%;width:0%;background:linear-gradient(90deg,#ff8a8a,#ffd23e);"></div>
        </div>
      </div>

      <!-- 카메라 소스 표시 -->
      <div id="source-badge" style="
        position:absolute;top:58px;left:12px;
        background:rgba(10,6,22,0.72);backdrop-filter:blur(8px);
        padding:4px 12px;border-radius:50px;border:1px solid rgba(196,168,245,0.18);
        font-size:0.72rem;font-family:var(--font-main);pointer-events:none;
        color:rgba(255,255,255,0.35);transition:color 0.3s;
      ">⌨️ 키보드</div>

      <!-- 일시정지 메뉴 -->
      <div id="menu-panel" style="
        position:absolute;inset:0;z-index:20;
        background:rgba(0,0,0,0.45);backdrop-filter:blur(4px);
        display:none;align-items:center;justify-content:center;
        font-family:var(--font-main);
      ">
        <div id="menu-card">
          <div id="menu-title">⏸ 일시정지</div>
          <button id="btn-resume"    class="menu-btn green">▶ 계속하기</button>
          <button id="btn-restart"   class="menu-btn gray">⏹ 다시 시작</button>
          <button id="menu-btn-bgm"  class="menu-btn gray">🎵 음악 켜짐</button>
          <button id="menu-btn-mute" class="menu-btn gray">🔊 소리 켜짐</button>
          <button id="btn-menu-exit" class="menu-btn danger">🚪 게임 나가기</button>
          <button id="btn-menu-hub"  class="menu-btn gray">🏠 게임 목록으로</button>
        </div>
      </div>

      <!-- 게임 오버 -->
      <div id="gameover-overlay" style="
        position:absolute;inset:0;display:none;align-items:center;justify-content:center;
        background:url('/assets/image/poop_game_bg.jpg') center/cover no-repeat;
        font-family:var(--font-main);
      ">
        <div id="go-outer-solo">
          <img id="go-signboard-solo" src="/assets/image/tit_signboard_playzera.png" alt="PLAY ZERA"
               onerror="this.style.display='none'" />
          <div id="go-card-solo">
            <div id="go-emoji-solo">💩</div>
            <div id="go-title-solo"></div>
            <div id="go-stats-solo"></div>
            <div class="go-btn-row-solo">
              <button id="btn-retry">다시 하기</button>
              <button id="btn-home-go">그만하기</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  const canvas = app.querySelector('#game-canvas')
  canvas.width  = canvas.offsetWidth
  canvas.height = canvas.offsetHeight

  // ── HUD ──────────────────────────────────────────────────
  const updateRoundPips = round =>
    (app.querySelector('#hud-rounds').innerHTML =
      Array.from({ length: rounds }, (_, i) =>
        `<span class="hud-pip${i < round ? ' done' : ''}"></span>`
      ).join(''))
  const updateLives = n =>
    (app.querySelector('#hud-lives').innerHTML =
      Array.from({ length: 3 }, (_, i) =>
        `<span style="opacity:${i < n ? 1 : 0.18};transition:opacity 0.2s;">❤️</span>`
      ).join(''))
  const updateScore = s => { app.querySelector('#score-val').textContent = s }
  const updateTimer = ms => {
    const el  = app.querySelector('#hud-timer')
    const sec = Math.ceil(ms / 1000)
    el.textContent      = sec
    el.style.background = sec <= 3 ? 'linear-gradient(180deg,#ff6b6b,#e53935)' : 'linear-gradient(180deg,#ffe94d,#f0c000)'
    el.style.boxShadow  = sec <= 3 ? '0 3px 0 #b71c1c' : '0 3px 0 #b88e00'
    el.style.color      = sec <= 3 ? '#fff' : '#5a3c00'
  }
  const resetHUD = () => {
    updateLives(3); updateScore(0); updateRoundPips(0)
    const el = app.querySelector('#hud-timer')
    el.textContent = ''; el.style.background = 'linear-gradient(180deg,#ffe94d,#f0c000)'
    el.style.boxShadow = '0 3px 0 #b88e00'; el.style.color = '#5a3c00'
  }
  resetHUD()

  // ── 소스 배지 ─────────────────────────────────────────────
  const sourceBadge = app.querySelector('#source-badge')
  function updateSourceBadge(src) {
    const c = { local: ['📷 내장 카메라', '#ffe600'], keyboard: ['⌨️ 키보드', 'rgba(255,255,255,0.35)'] }
    const [label, color] = c[src] ?? c.keyboard
    sourceBadge.textContent = label
    sourceBadge.style.color = color
  }

  // ── 게임 빌드 ─────────────────────────────────────────────
  const { default: GameClass } = await entry.load()
  let game = null

  function buildGame() {
    game?.destroy()
    game = new GameClass(canvas, {
      onRoundEnd:    round => updateRoundPips(round),
      onGameEnd:     async stats => {
        showGameOver(stats)
        try {
          // session_id는 여러 대를 묶던 값이다. 한 대로 도는 지금은 넣을 것이 없다.
          // (002 마이그레이션에서 nullable로 완화해둬서 null로 저장된다.)
          await saveResult({
            sessionId: null, gameId, playerName,
            score: stats.score, roundsCleared: stats.roundsCleared,
            extraData: { dodge_count: stats.dodgeCount, hit_count: stats.hitCount, reaction_avg_ms: null },
          })
        } catch (e) { console.error('[game] 결과 저장 실패:', e) }
      },
      onScoreUpdate: updateScore,
      onLifeUpdate:  updateLives,
    })
    game.init()
    const origUpdate = game.update.bind(game)
    game.update = dt => { origUpdate(dt); if (game._roundTimer > 0) updateTimer(game._roundTimer) }
  }

  function startGame() {
    app.querySelector('#gameover-overlay').style.display = 'none'
    resetHUD()
    buildGame()
    game.startRound(1)
  }

  function showGameOver(stats) {
    const cleared = stats.roundsCleared === rounds
    app.querySelector('#go-emoji-solo').textContent = cleared ? '🎉' : '💩'
    const titleEl = app.querySelector('#go-title-solo')
    titleEl.textContent = cleared ? '게임 클리어!' : '게임 오버'
    titleEl.style.color = cleared ? '#3cb544' : '#e53935'
    app.querySelector('#go-stats-solo').innerHTML =
      `최종 점수: <strong>${stats.score}점</strong><br>` +
      `클리어 라운드: ${stats.roundsCleared} / ${rounds}<br>` +
      `회피: ${stats.dodgeCount}회 · 피격: ${stats.hitCount}회`
    app.querySelector('#gameover-overlay').style.display = 'flex'
  }

  // ── 햄버거 메뉴 ───────────────────────────────────────────
  const menuPanel = app.querySelector('#menu-panel')

  function openMenu() {
    if (!game || !game._running) return
    game.pause()
    menuPanel.style.display = 'flex'
  }
  function closeMenu() {
    menuPanel.style.display = 'none'
    game?.resume()
  }

  // ── 음소거 동기화 ─────────────────────────────────────────
  function syncMute() {
    const muted = sound.isMuted()
    const hudImg = app.querySelector('#hud-mute-img')
    if (hudImg) hudImg.src = muted ? '/assets/image/btn_main_audio_off.png' : '/assets/image/btn_main_audio.png'
    app.querySelector('#menu-btn-mute').textContent = muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'
  }
  function syncBgmBtn() {
    const el = app.querySelector('#menu-btn-bgm')
    if (el) el.textContent = bgm.isMuted() ? '🎵 음악 꺼짐' : '🎵 음악 켜짐'
  }
  app.querySelector('#btn-mute').addEventListener('click', () => { sound.toggle(); syncMute() })
  app.querySelector('#menu-btn-mute').addEventListener('click', () => { sound.toggle(); syncMute() })
  app.querySelector('#menu-btn-bgm').addEventListener('click', () => { bgm.toggleMute(); syncBgmBtn() })
  syncMute()
  syncBgmBtn()

  app.querySelector('#btn-menu').addEventListener('click', openMenu)
  app.querySelector('#btn-resume').addEventListener('click', closeMenu)
  app.querySelector('#btn-restart').addEventListener('click', () => {
    menuPanel.style.display = 'none'
    startGame()
  })
  // 정리는 onLeave가 맡는다 — 여기서는 나가기만 하면 된다.
  //
  // 나가는 곳이 두 군데다.
  //   · 게임 나가기 → 이 게임의 인트로. "한 판 더?"가 여기서 끝난다.
  //   · 게임 목록으로 → 허브. 다른 게임을 고르러 갈 때만 쓴다.
  // 게임을 그만둘 때마다 허브까지 튕겨나가면 다시 하려고 매번 두 단계를 되짚어야 한다.
  app.querySelector('#btn-menu-exit').addEventListener('click', () => navigate(backTo))
  app.querySelector('#btn-menu-hub').addEventListener('click', () => navigate('/'))

  // ── 로컬 카메라 ───────────────────────────────────────────
  const pipVideo = app.querySelector('#pip-video')
  const pipWrap  = app.querySelector('#pip-wrap')
  const overlay  = createPipOverlay(app.querySelector('#pip-overlay'))
  let camZone = 1

  let lastLandmarks = null

  poseEngine.init(pipVideo, {
    onZoneChange: zone => {
      camZone = zone
      game?.setPlayerZone(zone)
    },
    // 프레임마다 들어오는 랜드마크를 그대로 오버레이에 넘긴다 (내부에서 rAF로 한 번만 그림)
    onPoseUpdate: landmarks => {
      lastLandmarks = landmarks
      overlay.draw(landmarks, camZone)
    },
  }).then(() => {
    if (poseEngine.isRunning) {
      pipWrap.style.display = 'block'
      updateSourceBadge('local')
      startGestureLoop()
    }
  }).catch(err => {
    // 카메라가 안 열려도 게임은 키보드로 계속 돌아간다. 다만 왜 안 열렸는지는 알려준다 —
    // 이유마다 할 일이 다르고(권한/다른 앱이 점유/HTTPS), 뭉뚱그리면 매번 콘솔을 봐야 한다.
    console.warn('[game] 카메라 시작 실패:', err?.name, err?.message)
    const byName = {
      NotAllowedError:      '카메라 권한 꺼짐',
      NotFoundError:        '카메라 없음',
      NotReadableError:     '다른 앱이 카메라 사용 중',
      OverconstrainedError: '카메라 화질 미지원',
      SecurityError:        'HTTPS 필요',
    }
    sourceBadge.textContent = `⌨️ 키보드 (${byName[err?.name] ?? '카메라 사용 불가'})`
    sourceBadge.style.color = '#ff9f43'
  })

  // ── 손동작(O/X) ───────────────────────────────────────────
  //
  // 똥 피하기는 **몸 위치**로 조종하는 게임이라 플레이 중 손동작은 최소로 둔다.
  // 팔로 X를 유지하면 잠시 멈춤 — 팔을 벌려도 골반은 안 움직이니 칸 판정과 겹치지 않는다.
  // 그 외 O/X는 게임이 멈춰 있을 때(일시정지·게임오버)만 받는다.
  //
  // 판정과 튜닝값은 웜업과 같은 것을 쓴다(core/pose/gesture.js · tuning.js).
  // 게임마다 감각이 다르면 아이가 매번 다시 배워야 한다.
  const hintEl = app.querySelector('#gesture-hint')
  const hintText = app.querySelector('#gesture-hint-text')
  const gaugeEl = app.querySelector('#gesture-gauge')

  const oHold = new GestureHold(lms => isArmsUpCircle(lms, GESTURE), GESTURE.confirmHoldSec)
  const xHold = new GestureHold(lms => isArmsUpCross(lms, GESTURE), GESTURE.confirmHoldSec)
  const playExitHold = new GestureHold(lms => isArmsUpCross(lms, GESTURE), GESTURE.duringPlayExitHoldSec)

  let gestureRaf = null
  let gestureLast = 0

  const isMenuOpen = () => menuPanel.style.display === 'flex'
  const isGameOver = () => app.querySelector('#gameover-overlay').style.display === 'flex'

  function showHint(text, progress) {
    hintEl.style.display = 'flex'
    hintText.textContent = text
    gaugeEl.style.width = `${Math.round(progress * 100)}%`
  }
  function hideHint() {
    hintEl.style.display = 'none'
    gaugeEl.style.width = '0%'
  }

  function resetHolds() { oHold.reset(); xHold.reset(); playExitHold.reset() }

  // 손동작이 한 번 발동하면 잠깐 입력을 닫는다.
  //
  // 없으면 이렇게 된다 — 플레이 중 X를 1.5초 유지해서 일시정지가 열렸는데, 팔은 아직
  // 엇갈린 채다. 다음 프레임부터 메뉴의 X(게임 나가기)가 다시 쌓여 1.5초 뒤 그대로
  // 나가버린다. 팔을 내릴 시간을 주고, 내리라고 말해준다.
  let graceUntil = 0
  const armGrace = (ms = 1200) => { graceUntil = performance.now() + ms; resetHolds() }

  function gestureTick(now) {
    gestureRaf = requestAnimationFrame(gestureTick)
    const dt = Math.min(0.05, (now - gestureLast) / 1000)
    gestureLast = now
    const lms = lastLandmarks

    if (now < graceUntil) {
      resetHolds()
      showHint('✋ 팔을 내려주세요', 0)
      return
    }

    if (isGameOver()) {
      playExitHold.reset()
      const oDone = oHold.update(dt, lms)
      const xDone = xHold.update(dt, lms)
      showHint('✋ O = 다시 하기 · X = 그만하기', Math.max(oHold.progress, xHold.progress))
      if (oDone) { armGrace(); startGame() }
      else if (xDone) { resetHolds(); navigate(backTo) }
      return
    }

    if (isMenuOpen()) {
      playExitHold.reset()
      const oDone = oHold.update(dt, lms)
      const xDone = xHold.update(dt, lms)
      showHint('✋ O = 계속하기 · X = 게임 나가기', Math.max(oHold.progress, xHold.progress))
      if (oDone) { armGrace(); closeMenu() }
      else if (xDone) { resetHolds(); navigate(backTo) }
      return
    }

    oHold.reset()
    xHold.reset()

    // 플레이 중에만 — 라운드 배너·카운트다운 중에는 받지 않는다
    if (game?._running) {
      const done = playExitHold.update(dt, lms)
      showHint('✋ 팔로 X → 잠시 멈추기', playExitHold.progress)
      if (done) { armGrace(); openMenu() }
    } else {
      playExitHold.reset()
      hideHint()
    }
  }

  function startGestureLoop() {
    if (gestureRaf) return
    gestureLast = performance.now()
    gestureRaf = requestAnimationFrame(gestureTick)
  }
  function stopGestureLoop() {
    if (gestureRaf) cancelAnimationFrame(gestureRaf)
    gestureRaf = null
    hideHint()
  }

  // ── 키보드 폴백 ───────────────────────────────────────────
  const onKey = e => {
    if (!game) return
    if (e.key === 'ArrowLeft')  game.setPlayerZone(0)
    if (e.key === ' ')          game.setPlayerZone(1)
    if (e.key === 'ArrowRight') game.setPlayerZone(2)
    if (e.key === 'Escape') {
      if (menuPanel.style.display === 'flex') closeMenu()
      else openMenu()
    }
  }
  window.addEventListener('keydown', onKey)

  // 정리는 라우터의 onLeave로 받는다.
  //
  // 페이지가 hashchange를 직접 듣는 방식은 등록 순서에 의존한다 — 라우터 리스너가 먼저
  // 걸려 있어서 이미 #app을 비운 뒤에 정리가 돈다. 웹캠을 늦게 끊으면 다음 화면에서
  // 카메라 표시등이 켜진 채로 남는다. 라우터가 렌더 직전에 부르면 순서가 확실하다.
  const cleanup = () => {
    window.removeEventListener('keydown', onKey)
    stopGestureLoop()
    poseEngine.destroy()
    overlay.destroy()
    game?.destroy()
    game = null
  }
  onLeave(cleanup)

  // ── 버튼 ──────────────────────────────────────────────────
  app.querySelector('#btn-retry').addEventListener('click', () => startGame())
  // 게임이 끝나도 허브가 아니라 인트로로 돌아간다 — 같은 게임을 한 판 더 하는 게
  // 다른 게임을 고르는 것보다 훨씬 잦다.
  app.querySelector('#btn-home-go').addEventListener('click', () => navigate(backTo))

  // 게임 즉시 시작
  startGame()
}
