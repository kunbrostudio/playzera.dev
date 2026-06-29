import { navigate } from '../core/router.js'
import { poseEngine } from '../core/pose.js'
import * as channel from '../core/channel.js'
import { MSG, MAX_DEVICES } from '../core/channel.js'
import { save as saveResult, getTodayResults } from '../core/gameResult.js'
import { GAME_REGISTRY } from '../games/registry.js'
import * as sound from '../core/sound.js'

function genSession() {
  const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const N = () => Math.floor(Math.random() * 10)
  return `${L()}${L()}${L()}-${N()}${N()}${N()}`
}

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

  // ── STEP 1: 플레이 방식 선택 ───────────────────────────────
  const mode = await showModeSelection(app, entry.manifest)
  if (!mode) { navigate('/'); return }

  if (mode === 'solo') {
    // ── 1대 모드 ─────────────────────────────────────────────
    if (_isMobile()) {
      const ok = await showOrientationCoach(app)
      if (!ok) { navigate('/'); return }
    }
    await showSoloGame(app, gameId, entry)
    return
  }

  // ── 여러 대 모드 ──────────────────────────────────────────
  const sessionId = query.session?.toUpperCase()
    || await showSessionEntry(app, entry.manifest)
  if (!sessionId) { navigate('/'); return }

  await channel.join(sessionId)
  await channel.trackPresence({ role: 'connecting', ts: Date.now() })

  const role = await showRoleSelection(app, sessionId)
  if (!role) { channel.leave(); navigate('/'); return }

  channel.trackPresence({ role, ts: Date.now() })

  let _gameRef = null
  const cleanup = () => {
    _gameRef?.destroy()
    _gameRef = null
    poseEngine.destroy()
    channel.leave()
  }
  window.addEventListener('hashchange', cleanup, { once: true })

  if (role === 'monitor') {
    showMonitorView(app, gameId, sessionId, entry, g => { _gameRef = g }, cleanup)
  } else if (role === 'controller') {
    showControllerView(app, sessionId, cleanup)
  } else if (role === 'webcam') {
    showWebcamView(app, sessionId, cleanup)
  }
}

// ═══════════════════════════════════════════════════════════════
// 플레이 방식 선택
// ═══════════════════════════════════════════════════════════════
function showModeSelection(app, manifest) {
  return new Promise(resolve => {
    app.innerHTML = `
      <style>
        #mode-root {
          position: fixed;
          inset: 0;
          background: url('/assets/image/poop_game_bg.jpg') center/cover no-repeat;
          display: flex;
          align-items: center;
          justify-content: center;
          font-family: var(--font-main);
          overflow: hidden;
        }

        /* 중앙 카드 패널 — 더 넓고 연보라 테두리 */
        #mode-card {
          position: relative;
          background: #F7F0FF;
          border: 5px solid #c4a8f5;
          border-radius: 36px;
          padding: clamp(16px, 3vw, 32px) clamp(24px, 5vw, 52px) clamp(24px, 3.5vw, 36px);
          width: clamp(320px, 90vw, 620px);
          max-height: 94vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(8px, 1.6vh, 16px);
          box-shadow: 0 6px 0 #a78bda, 0 16px 56px rgba(0,0,0,0.32);
        }

        /* PLAY ZERA 간판 (크라운 포함 버전) — 카드 상단에 크게 걸침 */
        #mode-signboard {
          position: absolute;
          top: clamp(-48px, -7vw, -36px);
          left: 50%;
          transform: translateX(-50%);
          width: clamp(180px, 46%, 280px);
          object-fit: contain;
          filter: drop-shadow(0 4px 12px rgba(0,0,0,0.30));
          pointer-events: none;
        }

        /* 별 + 캐릭터 행 */
        #mode-char-row {
          display: flex;
          align-items: center;
          gap: clamp(8px, 2vw, 18px);
          margin-top: clamp(28px, 5vw, 48px);
        }
        .mode-star {
          font-size: clamp(1.2rem, 3vw, 1.8rem);
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.15));
        }

        /* 똥 캐릭터 */
        #mode-char {
          width: clamp(72px, 16vw, 110px);
          object-fit: contain;
        }

        /* 게임 타이틀 — "똥" 초록, "피하기" 노랑, 보라 외곽선 */
        #mode-title {
          font-size: clamp(2.4rem, 8vw, 3.8rem);
          font-weight: 900;
          line-height: 1;
          text-align: center;
          margin: 0;
          letter-spacing: 0.02em;
        }
        .t-green {
          color: #4ecb52;
          -webkit-text-stroke: 3px #5b21b6;
          paint-order: stroke fill;
          text-shadow: 3px 3px 0 #5b21b6;
        }
        .t-yellow {
          color: #FFD020;
          -webkit-text-stroke: 3px #5b21b6;
          paint-order: stroke fill;
          text-shadow: 3px 3px 0 #5b21b6;
        }

        /* 소제목 */
        #mode-sub {
          color: #7c3aed;
          font-size: clamp(0.9rem, 2.4vw, 1.1rem);
          font-weight: 700;
          margin: 0;
          text-align: center;
        }

        /* 플레이 버튼 이미지 — 더 넓게 */
        .mode-play-btn {
          width: clamp(220px, 82%, 400px);
          cursor: pointer;
          transition: transform 0.1s;
          -webkit-tap-highlight-color: transparent;
          user-select: none;
          display: block;
        }
        .mode-play-btn:hover  { transform: scale(1.05); }
        .mode-play-btn:active { transform: scale(0.94); }

        /* 홈으로 버튼 — 보라 CSS 버튼 (btn_home.png가 작아서 CSS로 대체) */
        #mode-home-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: clamp(160px, 50%, 260px);
          padding: clamp(10px, 1.8vh, 15px) 0;
          background: linear-gradient(180deg, #a259f7 0%, #7c3aed 100%);
          border: none;
          border-radius: 9999px;
          box-shadow: 0 5px 0 #5b21b6, 0 8px 24px rgba(92,33,182,0.3);
          color: #fff;
          font-family: var(--font-main);
          font-size: clamp(1rem, 2.6vw, 1.3rem);
          font-weight: 800;
          letter-spacing: 0.06em;
          cursor: pointer;
          transition: transform 0.1s, box-shadow 0.1s;
          -webkit-tap-highlight-color: transparent;
          margin-top: 4px;
        }
        #mode-home-btn:hover  { transform: scale(1.05); box-shadow: 0 6px 0 #5b21b6, 0 12px 30px rgba(92,33,182,0.35); }
        #mode-home-btn:active { transform: scale(0.94) translateY(3px); box-shadow: 0 2px 0 #5b21b6; }

        @media (max-width: 400px) {
          #mode-card { padding: 14px 14px 22px; }
          .mode-play-btn { width: 90%; }
          #mode-home-btn { width: 58%; }
        }
      </style>

      <div id="mode-root">
        <div id="mode-card">
          <!-- PLAY ZERA 간판 (크라운 포함 이미지) -->
          <img id="mode-signboard" src="/assets/image/tit_signboard_main.png" alt="PLAY ZERA" />

          <!-- 별 + 캐릭터 행 -->
          <div id="mode-char-row">
            <span class="mode-star">⭐</span>
            <img id="mode-char" src="/assets/image/poop02_smile.png" alt="" />
            <span class="mode-star">⭐</span>
          </div>

          <!-- 타이틀: 똥(초록) + 피하기(노랑) -->
          <p id="mode-title">
            <span class="t-green">똥 </span><span class="t-yellow">피하기</span>
          </p>

          <p id="mode-sub">어떻게 플레이할까요?</p>

          <img class="mode-play-btn" id="btn-solo"  src="/assets/image/btn_play_one.png"     alt="1대로 진행하기" />
          <img class="mode-play-btn" id="btn-multi" src="/assets/image/btn_play_several.png" alt="여러 대로 진행하기" />

          <button id="mode-home-btn">← 홈으로</button>
        </div>
      </div>
    `

    // 이미지 로드 실패 대비
    app.querySelectorAll('#mode-root img').forEach(img => {
      img.addEventListener('error', () => { img.style.display = 'none' })
    })

    app.querySelector('#btn-solo').addEventListener('click',     () => { sound.activate(); resolve('solo') })
    app.querySelector('#btn-multi').addEventListener('click',    () => { sound.activate(); resolve('multi') })
    app.querySelector('#mode-home-btn').addEventListener('click', () => resolve(null))
  })
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
      #_rotateIcon { animation:_phoneRotate 2s ease-in-out infinite; display:inline-block; }
    `
    document.head.appendChild(styleEl)

    app.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100vh;gap:20px;text-align:center;padding:24px;
        font-family:var(--font-main);background:var(--color-bg);
      ">
        <div id="_rotateIcon" style="font-size:5rem;">📱</div>
        <h2 style="font-size:1.6rem;font-weight:800;color:var(--color-text);margin:0;">기기를 가로로 돌려주세요</h2>
        <p style="color:var(--color-sub);margin:0;">게임은 가로 화면에 최적화되어 있어요</p>
        <button id="btn-skip" class="btn-ghost" style="margin-top:12px;">건너뛰기 (세로 유지)</button>
        <button id="btn-home-coach" class="btn-ghost" style="font-size:0.82rem;margin-top:4px;">← 홈으로</button>
      </div>
    `

    const done = result => {
      styleEl.remove()
      window.removeEventListener('resize', checkLandscape)
      resolve(result)
    }

    const checkLandscape = () => {
      if (window.innerWidth > window.innerHeight) done(true)
    }
    window.addEventListener('resize', checkLandscape)

    app.querySelector('#btn-skip').addEventListener('click', () => done(true))
    app.querySelector('#btn-home-coach').addEventListener('click', () => done(false))
  })
}

// ═══════════════════════════════════════════════════════════════
// 1대 모드 (솔로)
// ═══════════════════════════════════════════════════════════════
async function showSoloGame(app, gameId, entry) {
  const { manifest } = entry
  const soloSessionId = `solo-${Date.now()}`

  const playerName = await _askPlayerName(app, manifest)
  if (!playerName) { navigate('/'); return }

  const rounds = manifest.rounds ?? 5

  app.innerHTML = `
    <div id="game-wrap" style="position:relative;width:100%;height:100vh;overflow:hidden;background:#0d1b2a;">
      <canvas id="game-canvas" style="display:block;width:100%;height:100%;"></canvas>

      <div id="game-overlay" style="
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        pointer-events:none;font-family:var(--font-main);font-weight:800;
        text-shadow:0 2px 16px rgba(0,0,0,0.7);transition:opacity 0.2s;opacity:0;
      "></div>

      <!-- HUD -->
      <div style="
        position:absolute;top:0;left:0;right:0;
        display:flex;align-items:center;justify-content:space-between;
        padding:12px 20px;background:rgba(13,27,42,0.85);font-family:var(--font-main);
      ">
        <div id="hud-rounds" style="display:flex;gap:6px;"></div>
        <div style="display:flex;align-items:center;gap:20px;">
          <div id="hud-timer" style="font-size:1.4rem;font-weight:800;color:var(--color-accent2);min-width:40px;text-align:center;"></div>
          <div style="font-size:1rem;color:var(--color-sub);">
            점수 <span id="score-val" style="color:var(--color-text);font-weight:700;">0</span>
          </div>
        </div>
        <!-- 우측: 하트 + 음소거 + 햄버거 -->
        <div style="display:flex;align-items:center;gap:10px;">
          <div id="hud-lives" style="display:flex;gap:4px;font-size:1.4rem;"></div>
          <button id="btn-mute" style="
            background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
            color:rgba(255,255,255,0.7);font-size:1rem;
            cursor:pointer;padding:4px 8px;border-radius:8px;
            line-height:1;flex-shrink:0;
          ">🔊</button>
          <button id="btn-menu" style="
            background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);
            color:rgba(255,255,255,0.7);font-size:1.2rem;
            cursor:pointer;padding:4px 10px;border-radius:8px;
            line-height:1;flex-shrink:0;
          ">☰</button>
        </div>
      </div>

      <!-- PIP 카메라 -->
      <video id="pip-video" playsinline style="
        position:absolute;bottom:100px;right:12px;width:120px;height:90px;
        border-radius:10px;border:2px solid rgba(0,207,0,0.4);
        object-fit:cover;transform:scaleX(-1);display:none;
      "></video>

      <!-- 카메라 소스 표시 -->
      <div id="source-badge" style="
        position:absolute;top:58px;left:12px;
        background:rgba(0,0,0,0.6);padding:4px 10px;border-radius:50px;
        font-size:0.72rem;font-family:var(--font-main);pointer-events:none;
        color:rgba(255,255,255,0.35);transition:color 0.3s;
      ">⌨️ 키보드</div>

      <!-- 햄버거 메뉴 패널 -->
      <div id="menu-panel" style="
        position:absolute;inset:0;z-index:20;
        background:rgba(0,0,0,0.82);
        display:none;align-items:center;justify-content:center;
        font-family:var(--font-main);
      ">
        <div style="
          background:var(--color-panel);border-radius:var(--radius-card);
          padding:32px 28px;display:flex;flex-direction:column;
          gap:12px;min-width:280px;text-align:center;
        ">
          <div style="font-size:1.3rem;font-weight:800;color:var(--color-text);margin-bottom:6px;">⏸ 일시정지</div>
          <button id="btn-resume" class="btn-primary" style="font-size:1.1rem;padding:18px;">▶ 계속하기</button>
          <button id="btn-restart" class="btn-ghost" style="padding:14px;">⏹ 다시 시작</button>
          <button id="menu-btn-mute" class="btn-ghost" style="padding:14px;">🔊 소리 켜짐</button>
          <button id="btn-menu-exit" style="
            padding:14px;font-size:0.9rem;font-weight:700;
            background:transparent;border:1px solid rgba(255,71,87,0.3);
            color:rgba(255,71,87,0.7);border-radius:var(--radius-btn);
            cursor:pointer;font-family:var(--font-main);transition:all 0.15s;
          ">🚪 게임 종료</button>
        </div>
      </div>

      <!-- 게임 오버 -->
      <div id="gameover-overlay" style="
        position:absolute;inset:0;display:none;flex-direction:column;
        align-items:center;justify-content:center;gap:16px;
        background:rgba(13,27,42,0.92);font-family:var(--font-main);
      ">
        <div style="font-size:4rem;">💩</div>
        <div id="go-title" style="font-size:2rem;font-weight:800;"></div>
        <div id="go-stats" style="color:var(--color-sub);font-size:1rem;text-align:center;line-height:2;"></div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button id="btn-retry" class="btn-primary">다시 하기</button>
          <button id="btn-home-go" class="btn-ghost">홈으로</button>
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
        `<span style="font-size:1.1rem;color:${i < round ? '#00CF00' : 'rgba(255,255,255,0.2)'};">●</span>`
      ).join(''))
  const updateLives  = n =>
    (app.querySelector('#hud-lives').innerHTML =
      Array.from({ length: 3 }, (_, i) =>
        `<span style="opacity:${i < n ? 1 : 0.2};">❤️</span>`
      ).join(''))
  const updateScore  = s => { app.querySelector('#score-val').textContent = s }
  const updateTimer  = ms => { app.querySelector('#hud-timer').textContent = Math.ceil(ms / 1000) }
  const resetHUD     = () => { updateLives(3); updateScore(0); updateRoundPips(0); app.querySelector('#hud-timer').textContent = '' }
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
          await saveResult({ sessionId: soloSessionId, gameId, playerName,
            score: stats.score, roundsCleared: stats.roundsCleared,
            dodgeCount: stats.dodgeCount, hitCount: stats.hitCount, reactionAvgMs: null })
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
    app.querySelector('#go-title').textContent = cleared ? '🎉 게임 클리어!' : '게임 오버'
    app.querySelector('#go-title').style.color = cleared ? '#00CF00' : '#ff4757'
    app.querySelector('#go-stats').innerHTML =
      `최종 점수: <strong style="color:#fff;">${stats.score}점</strong><br>` +
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
    app.querySelector('#btn-mute').textContent       = muted ? '🔇' : '🔊'
    app.querySelector('#menu-btn-mute').textContent  = muted ? '🔇 소리 꺼짐' : '🔊 소리 켜짐'
  }
  app.querySelector('#btn-mute').addEventListener('click', () => { sound.toggle(); syncMute() })
  app.querySelector('#menu-btn-mute').addEventListener('click', () => { sound.toggle(); syncMute() })
  syncMute()  // 초기 상태 반영

  app.querySelector('#btn-menu').addEventListener('click', openMenu)
  app.querySelector('#btn-resume').addEventListener('click', closeMenu)
  app.querySelector('#btn-restart').addEventListener('click', () => {
    menuPanel.style.display = 'none'
    startGame()
  })
  app.querySelector('#btn-menu-exit').addEventListener('click', () => {
    window.removeEventListener('keydown', onKey)
    poseEngine.destroy()
    game?.destroy()
    navigate('/')
  })

  // ── 로컬 카메라 ───────────────────────────────────────────
  const pipVideo = app.querySelector('#pip-video')
  poseEngine.init(pipVideo, {
    onZoneChange: zone => game?.setPlayerZone(zone),
  }).then(() => {
    if (poseEngine.isRunning) {
      pipVideo.style.display = 'block'
      updateSourceBadge('local')
    }
  })

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
  window.addEventListener('hashchange', () => {
    window.removeEventListener('keydown', onKey)
    poseEngine.destroy()
    game?.destroy()
  }, { once: true })

  // ── 버튼 ──────────────────────────────────────────────────
  app.querySelector('#btn-retry').addEventListener('click', () => startGame())
  app.querySelector('#btn-home-go').addEventListener('click', () => {
    window.removeEventListener('keydown', onKey)
    poseEngine.destroy()
    game?.destroy()
    navigate('/')
  })

  // 게임 즉시 시작
  startGame()
}

// ═══════════════════════════════════════════════════════════════
// 세션 코드 입력
// ═══════════════════════════════════════════════════════════════
function showSessionEntry(app, manifest) {
  return new Promise(resolve => {
    app.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100vh;gap:18px;padding:24px;font-family:var(--font-main);
      ">
        <div style="font-size:4rem;">${manifest.emoji}</div>
        <h2 style="font-size:1.8rem;font-weight:800;color:var(--color-accent);margin:0;">${manifest.title}</h2>

        <button id="btn-create" class="btn-primary" style="
          width:100%;max-width:320px;font-size:1.1rem;padding:18px 24px;margin-top:8px;
        ">🏠 방 만들기</button>

        <div style="display:flex;align-items:center;gap:12px;width:100%;max-width:320px;">
          <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
          <span style="color:var(--color-sub);font-size:0.82rem;">또는</span>
          <div style="flex:1;height:1px;background:rgba(255,255,255,0.1);"></div>
        </div>

        <div style="width:100%;max-width:320px;">
          <div style="color:var(--color-sub);font-size:0.78rem;margin-bottom:8px;">세션 코드 입력</div>
          <div style="display:flex;gap:8px;">
            <input id="code-input" type="text" maxlength="7" placeholder="ABC-123" style="
              flex:1;background:rgba(255,255,255,0.07);
              border:1px solid rgba(255,255,255,0.15);border-radius:12px;
              padding:14px 16px;color:#fff;font-size:1.1rem;
              font-family:var(--font-main);outline:none;
              letter-spacing:0.12em;text-transform:uppercase;
            ">
            <button id="btn-join" class="btn-primary" style="padding:14px 20px;font-size:0.95rem;">
              입장
            </button>
          </div>
        </div>

        <button id="btn-cancel" class="btn-ghost" style="font-size:0.85rem;margin-top:4px;">취소</button>
      </div>
    `

    const input = app.querySelector('#code-input')
    app.querySelector('#btn-create').addEventListener('click', () => resolve(genSession()))

    const doJoin = () => {
      const v = input.value.trim().toUpperCase()
      if (v.length < 3) { input.style.borderColor = '#ff4757'; return }
      resolve(v)
    }
    app.querySelector('#btn-join').addEventListener('click', doJoin)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin() })
    input.addEventListener('input',   () => { input.style.borderColor = 'rgba(255,255,255,0.15)' })
    app.querySelector('#btn-cancel').addEventListener('click', () => resolve(null))
  })
}

// ═══════════════════════════════════════════════════════════════
// 역할 선택
// ═══════════════════════════════════════════════════════════════
function showRoleSelection(app, sessionId) {
  return new Promise(resolve => {
    app.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100vh;gap:18px;padding:20px;font-family:var(--font-main);
      ">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:1.4rem;font-weight:800;letter-spacing:0.1em;color:var(--color-accent);">${sessionId}</span>
          <span id="count-badge" style="
            background:rgba(255,255,255,0.08);padding:3px 10px;border-radius:20px;
            font-size:0.75rem;color:var(--color-sub);
          ">... / ${MAX_DEVICES}</span>
        </div>

        <p style="color:var(--color-sub);font-size:0.95rem;margin:0;">역할을 선택하세요</p>

        <div style="display:flex;flex-direction:column;gap:10px;width:100%;max-width:360px;">
          ${_roleCard('monitor',    '📺', '모니터',   'TV · 노트북에서 게임 화면 표시 (내장 카메라 있으면 웹캠 불필요)')}
          ${_roleCard('controller', '🎮', '컨트롤러', '선생님 폰 — 게임을 시작하고 멈춥니다', '필수')}
          ${_roleCard('webcam',     '📸', '웹캠',     '아이 동작 인식 후 모니터로 전송 (모니터에 카메라 없을 때)')}
        </div>

        <button id="btn-back" class="btn-ghost" style="font-size:0.85rem;margin-top:4px;">← 세션 변경</button>
      </div>
    `

    const badge = app.querySelector('#count-badge')
    const updateCount = n => {
      badge.textContent = `${n} / ${MAX_DEVICES} 접속중`
      badge.style.color = n >= MAX_DEVICES ? '#ff4757' : 'var(--color-sub)'
    }
    updateCount(channel.getPresenceCount())
    channel.onPresenceSync(updateCount)

    app.querySelectorAll('.role-card').forEach(card => {
      card.addEventListener('mouseenter', () => {
        card.style.borderColor = 'var(--color-accent)'
        card.style.background  = 'rgba(0,207,0,0.07)'
      })
      card.addEventListener('mouseleave', () => {
        card.style.borderColor = 'transparent'
        card.style.background  = 'var(--color-panel)'
      })
      card.addEventListener('click', () => {
        if (channel.getPresenceCount() > MAX_DEVICES) {
          alert(`최대 ${MAX_DEVICES}명이 입장해 있습니다. 잠시 후 다시 시도해 주세요.`)
          return
        }
        resolve(card.dataset.role)
      })
    })

    app.querySelector('#btn-back').addEventListener('click', () => resolve(null))
  })
}

function _roleCard(role, emoji, title, desc, badge = null) {
  const badgeHtml = badge
    ? `<span style="
        background:#ffe600;color:#000;padding:2px 8px;border-radius:50px;
        font-size:0.65rem;font-weight:800;letter-spacing:0.04em;
       ">${badge}</span>`
    : ''
  return `
    <div class="role-card" data-role="${role}" style="
      display:flex;align-items:center;gap:16px;
      padding:18px 20px;background:var(--color-panel);
      border-radius:var(--radius-card);cursor:pointer;
      border:2px solid transparent;transition:border-color 0.15s,background 0.15s;
    ">
      <div style="font-size:2.2rem;min-width:44px;text-align:center;">${emoji}</div>
      <div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          <div style="font-size:1rem;font-weight:700;color:var(--color-text);">${title}</div>
          ${badgeHtml}
        </div>
        <div style="font-size:0.78rem;color:var(--color-sub);margin-top:3px;">${desc}</div>
      </div>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════
// 모니터 (게임 화면)
// ═══════════════════════════════════════════════════════════════
async function showMonitorView(app, gameId, sessionId, entry, onSetGame, cleanup) {
  const { manifest } = entry

  const playerName = await _askPlayerName(app, manifest)
  if (!playerName) { cleanup(); navigate('/'); return }

  const rounds = manifest.rounds ?? 5

  app.innerHTML = `
    <div id="game-wrap" style="position:relative;width:100%;height:100vh;overflow:hidden;background:#0d1b2a;">
      <canvas id="game-canvas" style="display:block;width:100%;height:100%;"></canvas>

      <div id="game-overlay" style="
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        pointer-events:none;font-family:var(--font-main);font-weight:800;
        text-shadow:0 2px 16px rgba(0,0,0,0.7);transition:opacity 0.2s;opacity:0;
      "></div>

      <!-- HUD -->
      <div style="
        position:absolute;top:0;left:0;right:0;
        display:flex;align-items:center;justify-content:space-between;
        padding:12px 20px;background:rgba(13,27,42,0.85);font-family:var(--font-main);
      ">
        <div id="hud-rounds" style="display:flex;gap:6px;"></div>
        <div style="display:flex;align-items:center;gap:20px;">
          <div id="hud-timer" style="font-size:1.4rem;font-weight:800;color:var(--color-accent2);min-width:40px;text-align:center;"></div>
          <div style="font-size:1rem;color:var(--color-sub);">
            점수 <span id="score-val" style="color:var(--color-text);font-weight:700;">0</span>
          </div>
        </div>
        <div id="hud-lives" style="display:flex;gap:4px;font-size:1.4rem;"></div>
      </div>

      <!-- 전체화면 -->
      <button id="btn-fs" style="
        position:absolute;top:12px;right:16px;background:transparent;border:none;
        color:rgba(255,255,255,0.4);font-size:1.1rem;cursor:pointer;padding:4px 8px;
      " title="전체화면">⛶</button>

      <!-- PIP 카메라 -->
      <video id="pip-video" playsinline style="
        position:absolute;bottom:100px;right:12px;width:120px;height:90px;
        border-radius:10px;border:2px solid rgba(0,207,0,0.4);
        object-fit:cover;transform:scaleX(-1);display:none;
      "></video>

      <!-- 카메라 소스 표시 -->
      <div id="source-badge" style="
        position:absolute;top:58px;left:12px;
        background:rgba(0,0,0,0.6);padding:4px 10px;border-radius:50px;
        font-size:0.72rem;font-family:var(--font-main);pointer-events:none;
        color:rgba(255,255,255,0.35);transition:color 0.3s;
      ">⌨️ 키보드</div>

      <!-- 대기 화면 -->
      <div id="waiting-overlay" style="
        position:absolute;inset:0;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:14px;
        background:rgba(13,27,42,0.96);font-family:var(--font-main);
      ">
        <div style="font-size:3.5rem;">🎮</div>
        <div id="wait-status" style="font-size:1.1rem;font-weight:700;color:var(--color-accent2);">⚠️ 컨트롤러를 연결해주세요</div>
        <div style="font-size:1.8rem;font-weight:800;letter-spacing:0.1em;color:var(--color-accent);">${sessionId}</div>
        <div style="color:var(--color-sub);font-size:0.9rem;">
          안녕하세요, <strong style="color:var(--color-text);">${playerName}</strong>님!
        </div>
      </div>

      <!-- 게임 오버 -->
      <div id="gameover-overlay" style="
        position:absolute;inset:0;display:none;flex-direction:column;
        align-items:center;justify-content:center;gap:16px;
        background:rgba(13,27,42,0.92);font-family:var(--font-main);
      ">
        <div style="font-size:4rem;">💩</div>
        <div id="go-title" style="font-size:2rem;font-weight:800;"></div>
        <div id="go-stats" style="color:var(--color-sub);font-size:1rem;text-align:center;line-height:2;"></div>
        <div style="display:flex;gap:12px;margin-top:8px;">
          <button id="btn-retry" class="btn-primary">다시 하기</button>
          <button id="btn-home-go" class="btn-ghost">홈으로</button>
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
        `<span style="font-size:1.1rem;color:${i < round ? '#00CF00' : 'rgba(255,255,255,0.2)'};">●</span>`
      ).join(''))
  const updateLives  = n =>
    (app.querySelector('#hud-lives').innerHTML =
      Array.from({ length: 3 }, (_, i) =>
        `<span style="opacity:${i < n ? 1 : 0.2};">❤️</span>`
      ).join(''))
  const updateScore  = s => { app.querySelector('#score-val').textContent = s }
  const updateTimer  = ms => { app.querySelector('#hud-timer').textContent = Math.ceil(ms / 1000) }
  const resetHUD     = () => { updateLives(3); updateScore(0); updateRoundPips(0); app.querySelector('#hud-timer').textContent = '' }
  resetHUD()

  // ── 카메라 소스 추적 ──────────────────────────────────────
  let _webcamActive = false
  const sourceBadge = app.querySelector('#source-badge')
  function updateSourceBadge(src) {
    const configs = {
      webcam:   ['📸 웹캠 연결됨',  '#00CF00'],
      local:    ['📷 내장 카메라', '#ffe600'],
      keyboard: ['⌨️ 키보드',     'rgba(255,255,255,0.35)'],
    }
    const [label, color] = configs[src] ?? configs.keyboard
    sourceBadge.textContent = label
    sourceBadge.style.color = color
  }

  // ── 게임 빌드 ─────────────────────────────────────────────
  const { default: GameClass } = await entry.load()
  let game = null

  function buildGame() {
    game?.destroy()
    game = new GameClass(canvas, {
      onRoundEnd:    round => { updateRoundPips(round); channel.send(MSG.ROUND_CHANGE, { round }) },
      onGameEnd:     async stats => {
        showGameOver(stats)
        try {
          await saveResult({ sessionId, gameId, playerName,
            score: stats.score, roundsCleared: stats.roundsCleared,
            dodgeCount: stats.dodgeCount, hitCount: stats.hitCount, reactionAvgMs: null })
        } catch (e) { console.error('[game] 결과 저장 실패:', e) }
      },
      onScoreUpdate: updateScore,
      onLifeUpdate:  updateLives,
    })
    game.init()
    onSetGame(game)
    const origUpdate = game.update.bind(game)
    game.update = dt => { origUpdate(dt); if (game._roundTimer > 0) updateTimer(game._roundTimer) }
  }

  function startGame() {
    app.querySelector('#waiting-overlay').style.display = 'none'
    app.querySelector('#gameover-overlay').style.display = 'none'
    resetHUD()
    buildGame()
    game.startRound(1)
  }

  function showGameOver(stats) {
    const cleared = stats.roundsCleared === rounds
    app.querySelector('#go-title').textContent = cleared ? '🎉 게임 클리어!' : '게임 오버'
    app.querySelector('#go-title').style.color = cleared ? '#00CF00' : '#ff4757'
    app.querySelector('#go-stats').innerHTML =
      `최종 점수: <strong style="color:#fff;">${stats.score}점</strong><br>` +
      `클리어 라운드: ${stats.roundsCleared} / ${rounds}<br>` +
      `회피: ${stats.dodgeCount}회 · 피격: ${stats.hitCount}회`
    app.querySelector('#gameover-overlay').style.display = 'flex'
  }

  // ── 채널 수신 ─────────────────────────────────────────────
  channel.on(MSG.GAME_START,  () => startGame())
  channel.on(MSG.GAME_PAUSE,  () => game?.pause())
  channel.on(MSG.GAME_STOP,   () => {
    game?.destroy()
    app.querySelector('#waiting-overlay').style.display = 'flex'
    app.querySelector('#gameover-overlay').style.display = 'none'
  })
  channel.on(MSG.POSE_UPDATE, ({ zone }) => {
    if (!_webcamActive) {
      _webcamActive = true
      updateSourceBadge('webcam')
    }
    game?.setPlayerZone(zone)
  })
  channel.on(MSG.GAME_EXIT, () => exitView())

  // ── 로컬 카메라 (PIP) ─────────────────────────────────────
  const pipVideo = app.querySelector('#pip-video')
  poseEngine.init(pipVideo, {
    onZoneChange: zone => {
      if (_webcamActive) return
      game?.setPlayerZone(zone)
    },
  }).then(() => {
    if (poseEngine.isRunning) {
      pipVideo.style.display = 'block'
      if (!_webcamActive) updateSourceBadge('local')
    }
  })

  // 웹캠 디바이스 접속/퇴장 감지
  channel.onPresenceSync(() => {
    // 컨트롤러 상태 업데이트
    const ctrlCount = channel.getPresenceByRole('controller')
    const waitStatus = app.querySelector('#wait-status')
    if (waitStatus) {
      if (ctrlCount > 0) {
        waitStatus.textContent = '게임 시작을 기다리는 중...'
        waitStatus.style.color = 'var(--color-accent)'
      } else {
        waitStatus.textContent = '⚠️ 컨트롤러를 연결해주세요'
        waitStatus.style.color = 'var(--color-accent2)'
      }
    }

    // 웹캠 퇴장 감지
    const webcamCount = channel.getPresenceByRole('webcam')
    if (webcamCount === 0 && _webcamActive) {
      _webcamActive = false
      sourceBadge.textContent = '📸 웹캠 연결 끊김'
      sourceBadge.style.color = '#ff4757'
      setTimeout(() => updateSourceBadge(poseEngine.isRunning ? 'local' : 'keyboard'), 3000)
    } else if (webcamCount > 0 && !_webcamActive) {
      sourceBadge.textContent = '📸 웹캠 연결 대기'
      sourceBadge.style.color = 'rgba(0,207,0,0.5)'
    }
  })

  // ── 키보드 폴백 ───────────────────────────────────────────
  const onKey = e => {
    if (!game) return
    if (e.key === 'ArrowLeft')  game.setPlayerZone(0)
    if (e.key === ' ')          game.setPlayerZone(1)
    if (e.key === 'ArrowRight') game.setPlayerZone(2)
  }
  window.addEventListener('keydown', onKey)

  buildGame()

  // ── 종료 헬퍼 ─────────────────────────────────────────────
  const exitView = () => {
    window.removeEventListener('keydown', onKey)
    cleanup()
    navigate('/')
  }

  // ── 버튼 ──────────────────────────────────────────────────
  app.querySelector('#btn-fs').addEventListener('click', () => {
    if (!document.fullscreenElement) app.querySelector('#game-wrap').requestFullscreen?.()
    else document.exitFullscreen?.()
  })
  app.querySelector('#btn-retry').addEventListener('click', () => startGame())
  app.querySelector('#btn-home-go').addEventListener('click', exitView)
}

// ═══════════════════════════════════════════════════════════════
// 컨트롤러
// ═══════════════════════════════════════════════════════════════
function showControllerView(app, sessionId, cleanup) {
  let gameState = 'idle'

  app.innerHTML = `
    <div style="
      min-height:100vh;display:flex;flex-direction:column;
      font-family:var(--font-main);background:var(--color-bg);
      max-width:480px;margin:0 auto;
    ">
      <!-- 헤더 -->
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:14px 20px;background:var(--color-panel);
        border-bottom:1px solid rgba(255,255,255,0.08);
      ">
        <span style="font-weight:700;color:var(--color-accent2);">🎮 컨트롤러</span>
        <button id="btn-home" style="background:transparent;border:none;color:var(--color-sub);cursor:pointer;font-size:0.85rem;">✕ 홈</button>
      </div>

      <div style="padding:20px;display:flex;flex-direction:column;gap:14px;flex:1;">

        <!-- 세션 + 인원 -->
        <div style="text-align:center;">
          <div style="color:var(--color-sub);font-size:0.72rem;margin-bottom:4px;">세션</div>
          <div style="font-size:2.6rem;font-weight:800;letter-spacing:0.1em;color:var(--color-accent);">${sessionId}</div>
          <div id="count-badge" style="font-size:0.8rem;color:var(--color-sub);margin-top:4px;">... / ${MAX_DEVICES} 접속중</div>
        </div>

        <!-- 상태 -->
        <div style="
          display:flex;align-items:center;justify-content:space-between;
          padding:12px 16px;background:var(--color-panel);border-radius:12px;
        ">
          <div style="display:flex;align-items:center;gap:8px;">
            <span id="state-dot" style="width:10px;height:10px;border-radius:50%;background:var(--color-sub);display:inline-block;transition:background 0.3s;"></span>
            <span id="state-label" style="font-size:0.95rem;">대기중</span>
          </div>
          <div style="color:var(--color-sub);font-size:0.85rem;">
            라운드 <span id="round-label" style="color:var(--color-text);font-weight:700;">-</span> / 5
          </div>
        </div>

        <!-- 컨트롤 버튼 -->
        <button id="btn-start" style="
          padding:22px;font-size:1.2rem;font-weight:800;
          background:var(--color-accent);color:#000;
          border:none;border-radius:var(--radius-btn);cursor:pointer;
          transition:opacity 0.15s;font-family:var(--font-main);
        ">▶ 게임 시작</button>

        <div style="display:flex;gap:12px;">
          <button id="btn-pause" style="
            flex:1;padding:18px;font-size:1rem;font-weight:700;
            background:var(--color-accent2);color:#000;
            border:none;border-radius:var(--radius-btn);cursor:pointer;
            opacity:0.35;transition:opacity 0.15s;font-family:var(--font-main);
          ">⏸ 일시정지</button>
          <button id="btn-stop" style="
            flex:1;padding:18px;font-size:1rem;font-weight:700;
            background:var(--color-danger);color:#fff;
            border:none;border-radius:var(--radius-btn);cursor:pointer;
            opacity:0.35;transition:opacity 0.15s;font-family:var(--font-main);
          ">⏹ 정지</button>
        </div>

        <!-- 게임 종료 버튼 -->
        <button id="btn-exit" style="
          padding:16px;font-size:0.95rem;font-weight:700;
          background:rgba(255,255,255,0.04);color:rgba(255,255,255,0.45);
          border:1px solid rgba(255,255,255,0.12);border-radius:var(--radius-btn);
          cursor:pointer;transition:all 0.15s;font-family:var(--font-main);
        ">🚪 게임 종료 (전체)</button>

        <!-- 기록 버튼 -->
        <button id="btn-records" class="btn-ghost" style="margin-top:4px;">📊 오늘 기록 보기</button>

        <!-- 기록 뷰 (인라인) -->
        <div id="records-view" style="display:none;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <button id="btn-records-back" style="background:transparent;border:none;color:var(--color-sub);cursor:pointer;font-size:1.2rem;">←</button>
            <span style="font-weight:700;">오늘 기록</span>
          </div>
          <div id="records-list"></div>
        </div>
      </div>
    </div>
  `

  channel.onPresenceSync(n => {
    app.querySelector('#count-badge').textContent = `${n} / ${MAX_DEVICES} 접속중`
  })

  channel.on(MSG.ROUND_CHANGE, ({ round }) => {
    app.querySelector('#round-label').textContent = round
  })

  const dotEl    = app.querySelector('#state-dot')
  const labelEl  = app.querySelector('#state-label')
  const pauseBtn = app.querySelector('#btn-pause')
  const stopBtn  = app.querySelector('#btn-stop')

  function setState(s) {
    gameState = s
    const map = {
      idle:    { label: '대기중',   color: 'var(--color-sub)' },
      running: { label: '게임중',   color: 'var(--color-accent)' },
      paused:  { label: '일시정지', color: 'var(--color-accent2)' },
    }
    const { label, color } = map[s] ?? map.idle
    labelEl.textContent    = label
    dotEl.style.background = color
    pauseBtn.style.opacity = s === 'running' ? '1' : '0.35'
    stopBtn.style.opacity  = s !== 'idle'    ? '1' : '0.35'
  }

  app.querySelector('#btn-start').addEventListener('click', () => {
    channel.send(MSG.GAME_START, {})
    setState('running')
    app.querySelector('#round-label').textContent = '1'
  })
  app.querySelector('#btn-pause').addEventListener('click', () => {
    if (gameState === 'idle') return
    if (gameState === 'running') { channel.send(MSG.GAME_PAUSE, {}); setState('paused') }
    else                         { channel.send(MSG.GAME_START, {}); setState('running') }
  })
  app.querySelector('#btn-stop').addEventListener('click', () => {
    if (gameState === 'idle') return
    channel.send(MSG.GAME_STOP, {})
    setState('idle')
    app.querySelector('#round-label').textContent = '-'
  })

  // 종료 버튼
  const exitBtn = app.querySelector('#btn-exit')
  exitBtn.addEventListener('mouseenter', () => {
    exitBtn.style.background  = 'rgba(255,71,87,0.12)'
    exitBtn.style.color       = '#ff4757'
    exitBtn.style.borderColor = 'rgba(255,71,87,0.35)'
  })
  exitBtn.addEventListener('mouseleave', () => {
    exitBtn.style.background  = 'rgba(255,255,255,0.04)'
    exitBtn.style.color       = 'rgba(255,255,255,0.45)'
    exitBtn.style.borderColor = 'rgba(255,255,255,0.12)'
  })
  exitBtn.addEventListener('click', () => {
    if (!confirm('정말 게임을 종료하시겠어요?\n모든 화면이 메인으로 돌아갑니다.')) return
    channel.send(MSG.GAME_EXIT, {})
    cleanup()
    navigate('/')
  })

  channel.on(MSG.GAME_EXIT, () => { cleanup(); navigate('/') })

  // 오늘 기록
  app.querySelector('#btn-records').addEventListener('click', async () => {
    const view = app.querySelector('#records-view')
    const list = app.querySelector('#records-list')
    view.style.display = 'block'
    list.innerHTML = `<p style="color:var(--color-sub);text-align:center;">불러오는 중...</p>`
    try {
      const results = await getTodayResults(sessionId)
      if (!results?.length) {
        list.innerHTML = `<p style="color:var(--color-sub);text-align:center;">오늘 기록이 없습니다</p>`
        return
      }
      list.innerHTML = results.map(r => `
        <div style="
          display:flex;justify-content:space-between;align-items:center;
          padding:12px 16px;margin-bottom:8px;
          background:var(--color-panel);border-radius:12px;
        ">
          <div>
            <div style="font-weight:700;">${r.player_name}</div>
            <div style="font-size:0.75rem;color:var(--color-sub);margin-top:2px;">
              ${r.rounds_cleared}/5라운드 · 회피 ${r.dodge_count} · 피격 ${r.hit_count}
            </div>
          </div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--color-accent);">${r.score}점</div>
        </div>
      `).join('')
    } catch (e) {
      list.innerHTML = `<p style="color:var(--color-danger);">불러오기 실패: ${e.message}</p>`
    }
  })
  app.querySelector('#btn-records-back').addEventListener('click', () => {
    app.querySelector('#records-view').style.display = 'none'
  })

  app.querySelector('#btn-home').addEventListener('click', () => { cleanup(); navigate('/') })
}

// ═══════════════════════════════════════════════════════════════
// 웹캠 (동작 인식 + POSE_UPDATE 송신)
// ═══════════════════════════════════════════════════════════════
async function showWebcamView(app, sessionId, cleanup) {
  const THROTTLE   = 100
  const ZONE_LABEL = ['← 왼쪽', '가운데', '오른쪽 →']
  const ZONE_COLOR = ['#00CF00', '#ffe600', '#00CF00']
  const ZONE_FILL  = ['rgba(0,207,0,0.25)', 'rgba(255,230,0,0.15)', 'rgba(0,207,0,0.25)']
  const PERSON_TIMEOUT = 3000

  let lastPoseSendMs  = 0
  let latestLandmarks = null
  let latestHipX      = null
  let rafId           = null
  let _personTimer    = null

  app.innerHTML = `
    <div style="position:relative;width:100%;height:100vh;background:#000;overflow:hidden;">
      <video id="pose-video" style="display:none;" playsinline></video>
      <canvas id="pose-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;"></canvas>

      <!-- 세션 + 송신 상태 -->
      <div style="position:absolute;top:14px;left:14px;display:flex;gap:8px;pointer-events:none;">
        <div style="
          background:rgba(0,0,0,0.72);padding:5px 12px;border-radius:50px;
          font-size:0.78rem;font-weight:700;color:var(--color-accent);letter-spacing:0.08em;
        ">${sessionId}</div>
        <div style="
          background:rgba(0,207,0,0.2);border:1px solid rgba(0,207,0,0.4);
          padding:5px 12px;border-radius:50px;font-size:0.78rem;color:#00CF00;
        ">📡 송신중</div>
      </div>

      <!-- 구역 상태 -->
      <div style="position:absolute;top:14px;left:0;width:100%;display:flex;justify-content:center;pointer-events:none;">
        <div id="zone-status" style="
          background:rgba(0,0,0,0.75);padding:8px 28px;border-radius:50px;
          font-size:1rem;font-weight:700;color:rgba(255,255,255,0.6);
          text-align:center;max-width:80%;
        ">아이가 화면에 보이도록 폰을 세워주세요</div>
      </div>

      <!-- 하단 안내 -->
      <div style="
        position:absolute;bottom:72px;left:0;width:100%;
        text-align:center;font-size:0.8rem;color:rgba(255,255,255,0.3);
        font-family:var(--font-main);pointer-events:none;
      ">아이 전신이 보이게 1~2m 거리에서 사용하세요</div>

      <button id="btn-home" class="btn-ghost" style="position:absolute;bottom:20px;left:50%;transform:translateX(-50%);">홈으로</button>
    </div>
  `

  const video    = app.querySelector('#pose-video')
  const canvas   = app.querySelector('#pose-canvas')
  const ctx      = canvas.getContext('2d')
  const statusEl = app.querySelector('#zone-status')

  function resizeCanvas() { canvas.width = app.offsetWidth; canvas.height = app.offsetHeight }
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  function drawFrame() {
    const cw = canvas.width, ch = canvas.height
    ctx.clearRect(0, 0, cw, ch)

    ctx.save(); ctx.translate(cw, 0); ctx.scale(-1, 1)
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, cw, ch)
    ctx.restore()

    const zone = poseEngine.currentZone
    const zw   = cw / 3

    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === zone ? ZONE_FILL[i] : 'transparent'
      ctx.fillRect(i * zw, 0, zw, ch)
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.2)'; ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(zw, 0);     ctx.lineTo(zw, ch)
    ctx.moveTo(zw * 2, 0); ctx.lineTo(zw * 2, ch)
    ctx.stroke()

    ctx.font = 'bold 1rem Pretendard, sans-serif'; ctx.textAlign = 'center'
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === zone ? ZONE_COLOR[i] : 'rgba(255,255,255,0.25)'
      ctx.fillText(ZONE_LABEL[i], zw * i + zw / 2, ch / 2)
    }

    if (latestLandmarks && latestHipX !== null) {
      const lh = latestLandmarks[23], rh = latestLandmarks[24]
      const px = latestHipX * cw, py = ((lh.y + rh.y) / 2) * ch
      ctx.beginPath(); ctx.arc(px, py, 14, 0, Math.PI * 2)
      ctx.fillStyle = ZONE_COLOR[zone]; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke()
    }
    rafId = requestAnimationFrame(drawFrame)
  }
  rafId = requestAnimationFrame(drawFrame)

  await poseEngine.init(video, {
    onZoneChange: zone => {
      statusEl.textContent  = ZONE_LABEL[zone]
      statusEl.style.color  = ZONE_COLOR[zone]
      statusEl.style.fontSize = '1.2rem'
      const now = Date.now()
      if (now - lastPoseSendMs >= THROTTLE) {
        lastPoseSendMs = now
        channel.send(MSG.POSE_UPDATE, { zone })
      }
    },
    onPoseUpdate: (landmarks, hipX) => {
      latestLandmarks = landmarks
      latestHipX      = hipX
      clearTimeout(_personTimer)
      _personTimer = setTimeout(() => {
        statusEl.textContent  = '사람이 인식되지 않습니다'
        statusEl.style.color  = 'rgba(255,255,255,0.5)'
        statusEl.style.fontSize = '0.9rem'
      }, PERSON_TIMEOUT)
    },
  })

  if (!poseEngine.isRunning) {
    statusEl.textContent  = '카메라 없음 — 키보드 ← / Space / → 로 테스트'
    statusEl.style.color  = 'rgba(255,255,255,0.5)'
    statusEl.style.fontSize = '0.85rem'
  } else {
    _personTimer = setTimeout(() => {
      statusEl.textContent  = '사람이 인식되지 않습니다'
      statusEl.style.color  = 'rgba(255,255,255,0.5)'
      statusEl.style.fontSize = '0.9rem'
    }, PERSON_TIMEOUT)
  }

  // GAME_EXIT 수신
  channel.on(MSG.GAME_EXIT, exitView)

  // 키보드 폴백
  const onKey = e => {
    let zone = -1
    if (e.key === 'ArrowLeft')  zone = 0
    if (e.key === ' ')          zone = 1
    if (e.key === 'ArrowRight') zone = 2
    if (zone < 0) return
    poseEngine.currentZone = zone
    statusEl.textContent   = ZONE_LABEL[zone]
    statusEl.style.color   = ZONE_COLOR[zone]
    statusEl.style.fontSize = '1.2rem'
    const now = Date.now()
    if (now - lastPoseSendMs >= THROTTLE) {
      lastPoseSendMs = now
      channel.send(MSG.POSE_UPDATE, { zone })
    }
  }
  window.addEventListener('keydown', onKey)

  function exitView() {
    clearTimeout(_personTimer)
    cancelAnimationFrame(rafId)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', resizeCanvas)
    cleanup()
    navigate('/')
  }

  app.querySelector('#btn-home').addEventListener('click', exitView)
}

// ═══════════════════════════════════════════════════════════════
// 이름 입력 모달
// ═══════════════════════════════════════════════════════════════
function _askPlayerName(app, manifest) {
  return new Promise(resolve => {
    app.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100vh;gap:20px;font-family:var(--font-main);
      ">
        <div style="font-size:4rem;">${manifest.emoji}</div>
        <h2 style="font-size:1.8rem;font-weight:800;color:var(--color-accent);margin:0;">${manifest.title}</h2>
        <p style="color:var(--color-sub);margin:0;">${manifest.description ?? ''}</p>
        <div class="card" style="display:flex;flex-direction:column;gap:16px;min-width:280px;">
          <label style="color:var(--color-sub);font-size:0.82rem;">아이 이름 또는 번호</label>
          <input id="name-input" type="text" maxlength="10" placeholder="예: 민준, 1번" style="
            background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);
            border-radius:10px;padding:12px 16px;color:var(--color-text);
            font-size:1rem;font-family:var(--font-main);outline:none;
          ">
          <button id="btn-start" class="btn-primary">시작!</button>
          <button id="btn-cancel" class="btn-ghost" style="font-size:0.85rem;">취소</button>
        </div>
      </div>
    `
    const input = app.querySelector('#name-input')
    input.focus()
    app.querySelector('#btn-start').addEventListener('click', () => {
      const v = input.value.trim()
      if (!v) { input.style.borderColor = '#ff4757'; return }
      resolve(v)
    })
    input.addEventListener('keydown', e => { if (e.key === 'Enter') app.querySelector('#btn-start').click() })
    app.querySelector('#btn-cancel').addEventListener('click', () => resolve(null))
  })
}
