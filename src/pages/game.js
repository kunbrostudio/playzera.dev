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

  // ── STEP 1: 플레이 방식 선택 (세션 URL 직접 진입 시 건너뜀) ──
  const mode = query.session ? 'multi' : await showModeSelection(app, entry.manifest)
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

        /* 카드 + 간판을 감싸는 외부 래퍼 */
        #mode-outer {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
        }

        /* PLAYZERA 간판 — 카드 밖에서 아래로 겹침 */
        #mode-signboard {
          position: relative;
          z-index: 10;
          width: clamp(200px, 52vw, 340px);
          object-fit: contain;
          filter: drop-shadow(0 6px 16px rgba(0,0,0,0.32));
          pointer-events: none;
          /* 카드 위 경계선 위로 올라와 겹치게 */
          margin-bottom: clamp(-44px, -6.5vw, -32px);
        }

        /* 중앙 카드 패널 */
        #mode-card {
          position: relative;
          z-index: 1;
          background: #F7F0FF;
          border: 10px solid #c4a8f5;
          outline: 10px solid #fff;
          border-radius: 90px;
          /* 상단 패딩: 간판이 겹쳐들어오는 공간 확보 */
          padding: clamp(44px, 7vw, 64px) clamp(24px, 5vw, 52px) clamp(24px, 3.5vw, 36px);
          width: clamp(320px, 90vw, 620px);
          max-height: 90vh;
          overflow-y: auto;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: clamp(8px, 1.6vh, 16px);
          box-shadow: 0 6px 0 #a78bda, 0 16px 56px rgba(0,0,0,0.32);
        }

        /* 게임 타이틀 간판 이미지 */
        #mode-title-img {
          width: clamp(220px, 80%, 420px);
          object-fit: contain;
        }

        /* 플레이 버튼 이미지 */
        .mode-play-btn {
          width: clamp(240px, 88%, 440px);
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
        <div id="mode-outer">
          <!-- PLAYZERA 간판: 카드 밖에 위치, 카드 위로 겹쳐 튀어나옴 -->
          <img id="mode-signboard" src="/assets/image/tit_signboard_playzera.png" alt="PLAY ZERA" />

          <div id="mode-card">
            <!-- 게임 타이틀 간판 이미지 -->
            <img id="mode-title-img" src="/assets/image/tit_signboard.png" alt="똥 피하기" />

            <img class="mode-play-btn" id="btn-solo"  src="/assets/image/btn_play_one.png"     alt="1대로 진행하기" />
            <img class="mode-play-btn" id="btn-multi" src="/assets/image/btn_play_several.png" alt="여러 대로 진행하기" />

            <button id="mode-home-btn">← 홈으로</button>
          </div>
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
      <style>
        #sess-root {
          position: fixed; inset: 0;
          background: url('/assets/image/poop_game_bg.jpg') center/cover no-repeat;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-main);
        }
        #sess-outer {
          position: relative;
          display: flex; flex-direction: column; align-items: center;
        }
        #sess-signboard {
          position: relative; z-index: 10;
          width: clamp(200px, 52vw, 320px);
          object-fit: contain;
          filter: drop-shadow(0 6px 16px rgba(0,0,0,0.32));
          pointer-events: none;
          margin-bottom: clamp(-44px, -6.5vw, -32px);
        }
        #sess-card {
          position: relative; z-index: 1;
          background: #F7F0FF;
          border: 10px solid #c4a8f5;
          outline: 10px solid #fff;
          border-radius: 90px;
          padding: clamp(48px, 7vw, 68px) clamp(28px, 6vw, 56px) clamp(28px, 4vw, 40px);
          width: clamp(300px, 88vw, 500px);
          display: flex; flex-direction: column; align-items: center;
          gap: clamp(10px, 1.8vh, 16px);
          box-shadow: 0 6px 0 #a78bda, 0 16px 56px rgba(0,0,0,0.32);
        }
        #sess-title-img {
          width: clamp(200px, 76%, 360px);
          object-fit: contain;
          margin-bottom: 4px;
        }
        /* 방 만들기 이미지 버튼 */
        #sess-btn-create {
          width: clamp(220px, 88%, 400px);
          cursor: pointer;
          transition: transform 0.1s;
          -webkit-tap-highlight-color: transparent;
          user-select: none; display: block;
        }
        #sess-btn-create:hover  { transform: scale(1.05); }
        #sess-btn-create:active { transform: scale(0.94); }
        /* 또는 구분선 */
        #sess-divider {
          display: flex; align-items: center; gap: 10px;
          width: 100%; max-width: 380px;
        }
        #sess-divider span { color: #9d6ed8; font-size: 0.9rem; font-weight: 700; white-space: nowrap; }
        .sess-line { flex: 1; height: 2px; background: #ddd0f5; border-radius: 2px; }
        /* 세션 코드 입력 */
        #sess-code-label {
          color: #7c3aed; font-size: clamp(0.95rem, 2.4vw, 1.1rem);
          font-weight: 700; margin: 0;
          align-self: flex-start; width: 100%; max-width: 380px;
          margin-bottom: -6px;
        }
        #sess-code-row {
          display: flex; gap: 10px;
          width: 100%; max-width: 380px;
        }
        #code-input {
          flex: 1;
          padding: clamp(12px, 2vh, 16px) 16px;
          background: #fff;
          border: 3px solid #c4a8f5;
          border-radius: 50px;
          font-size: clamp(1rem, 2.6vw, 1.2rem);
          font-family: var(--font-main);
          color: #3b0764;
          outline: none;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          text-align: center;
          transition: border-color 0.15s;
          box-shadow: inset 0 2px 6px rgba(196,168,245,0.25);
        }
        #code-input:focus { border-color: #7c3aed; }
        #code-input::placeholder { color: #c4a8f5; letter-spacing: 0.08em; }
        /* 입장 버튼 이미지 */
        #sess-btn-join {
          height: clamp(48px, 7vw, 62px);
          width: auto;
          cursor: pointer;
          transition: transform 0.1s;
          -webkit-tap-highlight-color: transparent;
          user-select: none; display: block; flex-shrink: 0;
        }
        #sess-btn-join:hover  { transform: scale(1.06); }
        #sess-btn-join:active { transform: scale(0.93); }
        /* 취소 버튼 */
        #sess-btn-cancel {
          width: 100%; max-width: 380px;
          padding: clamp(13px, 2.2vh, 18px) 0;
          background: linear-gradient(180deg, #b0b8c1 0%, #8a9199 100%);
          border: none; border-radius: 9999px;
          box-shadow: 0 5px 0 #626a71, 0 8px 24px rgba(100,110,120,0.3);
          color: #fff; font-family: var(--font-main);
          font-size: clamp(1.1rem, 3vw, 1.4rem); font-weight: 800;
          cursor: pointer; transition: transform 0.1s, box-shadow 0.1s;
          -webkit-tap-highlight-color: transparent;
        }
        #sess-btn-cancel:hover  { transform: scale(1.04); }
        #sess-btn-cancel:active { transform: scale(0.95) translateY(3px); box-shadow: 0 2px 0 #626a71; }
      </style>

      <div id="sess-root">
        <div id="sess-outer">
          <img id="sess-signboard" src="/assets/image/tit_signboard_playzera.png" alt="PLAY ZERA" />
          <div id="sess-card">
            <img id="sess-title-img" src="/assets/image/tit_signboard.png" alt="똥 피하기" />

            <img id="sess-btn-create" src="/assets/image/btn_room_create.png" alt="방 만들기" />

            <div id="sess-divider">
              <div class="sess-line"></div>
              <span>또는</span>
              <div class="sess-line"></div>
            </div>

            <p id="sess-code-label">세션 코드 입력</p>
            <div id="sess-code-row">
              <input id="code-input" type="text" maxlength="7" placeholder="ABC-123" />
              <img id="sess-btn-join" src="/assets/image/btn_enter.png" alt="입장" />
            </div>

            <button id="sess-btn-cancel">취소</button>
          </div>
        </div>
      </div>
    `

    app.querySelectorAll('#sess-root img').forEach(img => {
      img.addEventListener('error', () => { img.style.display = 'none' })
    })

    const input = app.querySelector('#code-input')
    app.querySelector('#sess-btn-create').addEventListener('click', () => resolve(genSession()))

    const doJoin = () => {
      const v = input.value.trim().toUpperCase()
      if (v.length < 3) { input.style.borderColor = '#ff4757'; return }
      resolve(v)
    }
    app.querySelector('#sess-btn-join').addEventListener('click', doJoin)
    input.addEventListener('keydown', e => { if (e.key === 'Enter') doJoin() })
    input.addEventListener('input',   () => { input.style.borderColor = 'rgba(196,168,245,1)' })
    app.querySelector('#sess-btn-cancel').addEventListener('click', () => resolve(null))
  })
}

// ═══════════════════════════════════════════════════════════════
// 역할 선택
// ═══════════════════════════════════════════════════════════════
function showRoleSelection(app, sessionId) {
  return new Promise(resolve => {
    app.innerHTML = `
      <style>
        #role-root {
          position: fixed; inset: 0;
          background: url('/assets/image/poop_game_bg.jpg') center/cover no-repeat;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-main);
        }
        #role-outer {
          position: relative;
          display: flex; flex-direction: column; align-items: center;
        }
        #role-signboard {
          position: relative; z-index: 10;
          width: clamp(200px, 52vw, 320px);
          object-fit: contain;
          filter: drop-shadow(0 6px 16px rgba(0,0,0,0.32));
          pointer-events: none;
          margin-bottom: clamp(-44px, -6.5vw, -32px);
        }
        #role-card {
          position: relative; z-index: 1;
          background: #F7F0FF;
          border: 10px solid #c4a8f5;
          outline: 10px solid #fff;
          border-radius: 90px;
          padding: clamp(48px, 7vw, 64px) clamp(24px, 5vw, 48px) clamp(28px, 4vw, 40px);
          width: clamp(300px, 90vw, 520px);
          display: flex; flex-direction: column; align-items: center;
          gap: clamp(8px, 1.5vh, 14px);
          box-shadow: 0 6px 0 #a78bda, 0 16px 56px rgba(0,0,0,0.32);
        }
        /* 세션 코드 + 인원 */
        #role-session-row {
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 2px;
        }
        #role-session-id {
          font-size: clamp(1.4rem, 4vw, 1.9rem);
          font-weight: 900; letter-spacing: 0.12em;
          color: #7c3aed;
          text-shadow: 2px 2px 0 rgba(124,58,237,0.2);
        }
        #count-badge {
          background: #e8d9ff; color: #7c3aed;
          padding: 4px 12px; border-radius: 50px;
          font-size: 0.8rem; font-weight: 700;
        }
        #role-sub {
          color: #9d6ed8; font-size: clamp(0.9rem, 2.2vw, 1rem);
          font-weight: 700; margin: 0;
        }
        /* 역할 카드 아이템 */
        .role-item {
          width: 100%;
          display: flex; align-items: center; gap: 14px;
          padding: clamp(12px, 2vh, 16px) clamp(16px, 3vw, 22px);
          background: #fff;
          border: 3px solid #e0d0ff;
          border-radius: 50px;
          cursor: pointer;
          transition: border-color 0.15s, background 0.15s, transform 0.1s;
          -webkit-tap-highlight-color: transparent;
        }
        .role-item:hover  { border-color: #7c3aed; background: #f3ebff; transform: scale(1.02); }
        .role-item:active { transform: scale(0.97); }
        .role-emoji { font-size: clamp(1.6rem, 4vw, 2rem); min-width: 36px; text-align: center; }
        .role-info  { flex: 1; }
        .role-title {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          font-size: clamp(0.95rem, 2.6vw, 1.15rem);
          font-weight: 800; color: #3b0764;
        }
        .role-desc {
          font-size: clamp(0.7rem, 1.8vw, 0.82rem);
          color: #9d6ed8; margin-top: 3px; line-height: 1.35;
        }
        .role-badge {
          background: #ffe600; color: #5b21b6;
          padding: 2px 10px; border-radius: 50px;
          font-size: 0.65rem; font-weight: 900; letter-spacing: 0.04em;
        }
        /* 세션 변경 버튼 */
        #role-btn-back {
          width: 100%;
          padding: clamp(13px, 2.2vh, 18px) 0;
          background: linear-gradient(180deg, #b0b8c1 0%, #8a9199 100%);
          border: none; border-radius: 9999px;
          box-shadow: 0 5px 0 #626a71, 0 8px 24px rgba(100,110,120,0.3);
          color: #fff; font-family: var(--font-main);
          font-size: clamp(1rem, 2.6vw, 1.2rem); font-weight: 800;
          cursor: pointer; transition: transform 0.1s, box-shadow 0.1s;
          -webkit-tap-highlight-color: transparent;
          margin-top: 4px;
        }
        #role-btn-back:hover  { transform: scale(1.04); }
        #role-btn-back:active { transform: scale(0.95) translateY(3px); box-shadow: 0 2px 0 #626a71; }
      </style>

      <div id="role-root">
        <div id="role-outer">
          <img id="role-signboard" src="/assets/image/tit_signboard_playzera.png" alt="PLAY ZERA" />
          <div id="role-card">
            <div id="role-session-row">
              <span id="role-session-id">${sessionId}</span>
              <span id="count-badge">… / ${MAX_DEVICES}</span>
            </div>
            <p id="role-sub">역할을 선택하세요</p>

            ${_roleCard('monitor',    '📺', '모니터',   'TV · 노트북에서 게임 화면 표시 (내장 카메라 있으면 웹캠 불필요)')}
            ${_roleCard('controller', '🎮', '컨트롤러', '선생님 폰 — 게임을 시작하고 멈춥니다', '필수')}
            ${_roleCard('webcam',     '📸', '웹캠',     '아이 동작 인식 후 모니터로 전송 (모니터에 카메라 없을 때)')}

            <button id="role-btn-back">← 세션 변경</button>
          </div>
        </div>
      </div>
    `

    app.querySelector('#role-signboard').addEventListener('error', e => { e.target.style.display = 'none' })

    const badge = app.querySelector('#count-badge')
    const updateCount = n => {
      badge.textContent = `${n} / ${MAX_DEVICES} 접속중`
      badge.style.color = n >= MAX_DEVICES ? '#ff4757' : '#7c3aed'
    }
    updateCount(channel.getPresenceCount())
    channel.onPresenceSync(updateCount)

    app.querySelectorAll('.role-item').forEach(card => {
      card.addEventListener('click', () => {
        if (channel.getPresenceCount() > MAX_DEVICES) {
          alert(`최대 ${MAX_DEVICES}명이 입장해 있습니다. 잠시 후 다시 시도해 주세요.`)
          return
        }
        resolve(card.dataset.role)
      })
    })

    app.querySelector('#role-btn-back').addEventListener('click', () => resolve(null))
  })
}

function _roleCard(role, emoji, title, desc, badge = null) {
  const badgeHtml = badge
    ? `<span class="role-badge">${badge}</span>`
    : ''
  return `
    <div class="role-item" data-role="${role}">
      <div class="role-emoji">${emoji}</div>
      <div class="role-info">
        <div class="role-title">${title}${badgeHtml}</div>
        <div class="role-desc">${desc}</div>
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
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        background:url('/assets/image/poop_game_bg.jpg') center/cover no-repeat;
        font-family:var(--font-main);
      ">
        <style>
          #wait-outer { position:relative; display:flex; flex-direction:column; align-items:center; }
          #wait-signboard {
            position:relative; z-index:10;
            width:clamp(200px,52vw,320px); object-fit:contain;
            filter:drop-shadow(0 6px 16px rgba(0,0,0,0.32)); pointer-events:none;
            margin-bottom:clamp(-44px,-6.5vw,-32px);
          }
          #wait-card {
            position:relative; z-index:1;
            background:#F7F0FF;
            border:10px solid #c4a8f5; outline:10px solid #fff;
            border-radius:90px;
            padding:clamp(48px,7vw,64px) clamp(28px,6vw,56px) clamp(28px,4vw,40px);
            width:clamp(300px,88vw,480px);
            display:flex; flex-direction:column; align-items:center;
            gap:clamp(8px,1.8vh,16px);
            box-shadow:0 6px 0 #a78bda, 0 16px 56px rgba(0,0,0,0.32);
          }
          #wait-title-img { width:clamp(200px,76%,340px); object-fit:contain; }
          #wait-session {
            font-size:clamp(1.6rem,4.5vw,2.2rem); font-weight:900;
            letter-spacing:0.12em; color:#7c3aed;
            text-shadow:2px 2px 0 rgba(124,58,237,0.2);
          }
          #wait-status {
            font-size:clamp(0.9rem,2.4vw,1.1rem); font-weight:800;
            color:#f59e0b; text-align:center;
            background:#fff8e1; border-radius:50px;
            padding:8px 20px; border:2px solid #fcd34d;
          }
          #wait-name {
            font-size:clamp(0.85rem,2.2vw,1rem); color:#9d6ed8; font-weight:700;
          }
          #wait-name strong { color:#3b0764; }
          #wait-btn-back {
            width:100%;
            padding:clamp(13px,2.2vh,18px) 0;
            background:linear-gradient(180deg,#b0b8c1 0%,#8a9199 100%);
            border:none; border-radius:9999px;
            box-shadow:0 5px 0 #626a71, 0 8px 24px rgba(100,110,120,0.3);
            color:#fff; font-family:var(--font-main);
            font-size:clamp(1rem,2.6vw,1.2rem); font-weight:800;
            cursor:pointer; transition:transform 0.1s, box-shadow 0.1s;
            -webkit-tap-highlight-color:transparent; margin-top:4px;
          }
          #wait-btn-back:hover  { transform:scale(1.04); }
          #wait-btn-back:active { transform:scale(0.95) translateY(3px); box-shadow:0 2px 0 #626a71; }
        </style>
        <div id="wait-outer">
          <img id="wait-signboard" src="/assets/image/tit_signboard_playzera.png" alt="PLAY ZERA"
               onerror="this.style.display='none'" />
          <div id="wait-card">
            <img id="wait-title-img" src="/assets/image/tit_signboard.png" alt="똥 피하기"
                 onerror="this.style.display='none'" />
            <div id="wait-session">${sessionId}</div>
            <div id="wait-status">⚠️ 컨트롤러를 연결해주세요</div>
            <div id="wait-name">안녕하세요, <strong>${playerName}</strong>님!</div>
            <button id="wait-btn-back">← 역할 선택으로</button>
          </div>
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

  // 대기 화면 뒤로가기 → 같은 세션으로 역할 선택 화면 재진입
  app.querySelector('#wait-btn-back').addEventListener('click', () => {
    cleanup()
    navigate(`/game?id=${gameId}&session=${sessionId}`)
  })

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
      <style>
        #name-root {
          position: fixed; inset: 0;
          background: url('/assets/image/poop_game_bg.jpg') center/cover no-repeat;
          display: flex; align-items: center; justify-content: center;
          font-family: var(--font-main);
        }
        #name-outer {
          position: relative;
          display: flex; flex-direction: column; align-items: center;
        }
        #name-signboard {
          position: relative; z-index: 10;
          width: clamp(200px, 52vw, 320px);
          object-fit: contain;
          filter: drop-shadow(0 6px 16px rgba(0,0,0,0.32));
          pointer-events: none;
          margin-bottom: clamp(-44px, -6.5vw, -32px);
        }
        #name-card {
          position: relative; z-index: 1;
          background: #F7F0FF;
          border: 10px solid #c4a8f5;
          outline: 10px solid #fff;
          border-radius: 90px;
          padding: clamp(48px, 7vw, 68px) clamp(28px, 6vw, 56px) clamp(28px, 4vw, 40px);
          width: clamp(300px, 88vw, 500px);
          display: flex; flex-direction: column; align-items: center;
          gap: clamp(10px, 2vh, 18px);
          box-shadow: 0 6px 0 #a78bda, 0 16px 56px rgba(0,0,0,0.32);
        }
        #name-title-img {
          width: clamp(200px, 76%, 360px);
          object-fit: contain;
        }
        #name-label {
          color: #7c3aed; font-size: clamp(1rem, 2.6vw, 1.2rem);
          font-weight: 700; margin: 0; align-self: flex-start;
          width: 100%; max-width: 360px;
          margin-bottom: -8px;
        }
        #name-input {
          width: 100%; max-width: 360px;
          padding: clamp(12px, 2vh, 16px) 18px;
          background: #fff;
          border: 3px solid #c4a8f5;
          border-radius: 50px;
          font-size: clamp(1rem, 2.6vw, 1.2rem);
          font-family: var(--font-main);
          color: #3b0764;
          outline: none;
          text-align: center;
          transition: border-color 0.15s;
          box-shadow: inset 0 2px 6px rgba(196,168,245,0.25);
        }
        #name-input:focus { border-color: #7c3aed; }
        #name-input::placeholder { color: #c4a8f5; }
        #name-btn-start {
          width: 100%; max-width: 360px;
          padding: clamp(13px, 2.2vh, 18px) 0;
          background: linear-gradient(180deg, #6ee75a 0%, #3cb544 100%);
          border: none; border-radius: 9999px;
          box-shadow: 0 5px 0 #2a8a30, 0 8px 24px rgba(60,181,68,0.3);
          color: #fff; font-family: var(--font-main);
          font-size: clamp(1.1rem, 3vw, 1.4rem); font-weight: 800;
          cursor: pointer; transition: transform 0.1s, box-shadow 0.1s;
          -webkit-tap-highlight-color: transparent;
        }
        #name-btn-start:hover  { transform: scale(1.04); }
        #name-btn-start:active { transform: scale(0.95) translateY(3px); box-shadow: 0 2px 0 #2a8a30; }
        #name-btn-cancel {
          width: 100%; max-width: 360px;
          padding: clamp(13px, 2.2vh, 18px) 0;
          background: linear-gradient(180deg, #b0b8c1 0%, #8a9199 100%);
          border: none; border-radius: 9999px;
          box-shadow: 0 5px 0 #626a71, 0 8px 24px rgba(100,110,120,0.3);
          color: #fff; font-family: var(--font-main);
          font-size: clamp(1.1rem, 3vw, 1.4rem); font-weight: 800;
          cursor: pointer; transition: transform 0.1s, box-shadow 0.1s;
          -webkit-tap-highlight-color: transparent;
        }
        #name-btn-cancel:hover  { transform: scale(1.04); }
        #name-btn-cancel:active { transform: scale(0.95) translateY(3px); box-shadow: 0 2px 0 #626a71; }
      </style>

      <div id="name-root">
        <div id="name-outer">
          <img id="name-signboard" src="/assets/image/tit_signboard_playzera.png" alt="PLAY ZERA" />
          <div id="name-card">
            <img id="name-title-img" src="/assets/image/tit_signboard.png" alt="똥 피하기" />
            <p id="name-label">아이 이름 또는 번호</p>
            <input id="name-input" type="text" maxlength="10" placeholder="예: 민준, 1번" />
            <button id="name-btn-start">시작!</button>
            <button id="name-btn-cancel">취소</button>
          </div>
        </div>
      </div>
    `
    app.querySelectorAll('#name-root img').forEach(img => {
      img.addEventListener('error', () => { img.style.display = 'none' })
    })

    const input = app.querySelector('#name-input')
    input.focus()

    app.querySelector('#name-btn-start').addEventListener('click', () => {
      const v = input.value.trim()
      if (!v) { input.style.borderColor = '#ff4757'; return }
      resolve(v)
    })
    input.addEventListener('keydown', e => { if (e.key === 'Enter') app.querySelector('#name-btn-start').click() })
    app.querySelector('#name-btn-cancel').addEventListener('click', () => resolve(null))
  })
}
