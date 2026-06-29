import { navigate } from '../core/router.js'
import { poseEngine } from '../core/pose.js'
import * as channel from '../core/channel.js'
import { MSG } from '../core/channel.js'
import { save as saveResult } from '../core/gameResult.js'
import { GAME_REGISTRY } from '../games/registry.js'

export async function gamePage(app, query) {
  const gameId      = query.id ?? 'poop-dodge'
  const isSession   = !!query.session                          // URL에 session 파라미터 있으면 세션 모드
  const sessionId   = query.session || `solo-${Date.now()}`   // solo는 자동 생성

  // ── 매니페스트 로드 ──────────────────────────────────────
  const entry = GAME_REGISTRY[gameId]
  if (!entry) { navigate('/'); return }
  const manifest = entry.manifest

  // ── 이름 입력 모달 ────────────────────────────────────────
  const playerName = await askPlayerName(app, manifest)
  if (!playerName) { navigate('/'); return }

  // ── 메인 레이아웃 ─────────────────────────────────────────
  app.innerHTML = `
    <div id="game-wrap" style="position:relative;width:100%;height:100vh;overflow:hidden;background:#0d1b2a;">
      <canvas id="game-canvas" style="display:block;width:100%;height:100%;"></canvas>

      <!-- 오버레이 (판정/배너/카운트다운) -->
      <div id="game-overlay" style="
        position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
        pointer-events:none;font-family:var(--font-main);font-weight:800;
        text-shadow:0 2px 16px rgba(0,0,0,0.7);transition:opacity 0.2s;opacity:0;
      "></div>

      <!-- HUD 상단 -->
      <div id="hud" style="
        position:absolute;top:0;left:0;right:0;
        display:flex;align-items:center;justify-content:space-between;
        padding:12px 20px;background:rgba(13,27,42,0.85);
        font-family:var(--font-main);
      ">
        <div id="hud-rounds" style="display:flex;gap:6px;"></div>
        <div style="display:flex;align-items:center;gap:20px;">
          <div id="hud-timer" style="font-size:1.4rem;font-weight:800;color:var(--color-accent2);min-width:40px;text-align:center;"></div>
          <div id="hud-score" style="font-size:1rem;color:var(--color-sub);">점수 <span id="score-val" style="color:var(--color-text);font-weight:700;">0</span></div>
        </div>
        <div id="hud-lives" style="display:flex;gap:4px;font-size:1.4rem;"></div>
      </div>

      <!-- 전체화면 버튼 -->
      <button id="btn-fs" style="
        position:absolute;top:12px;right:72px;background:transparent;border:none;
        color:rgba(255,255,255,0.4);font-size:1.1rem;cursor:pointer;padding:4px 8px;
      " title="전체화면">⛶</button>

      <!-- PIP 카메라 (AI 모드) -->
      <video id="pip-video" playsinline style="
        position:absolute;bottom:100px;right:12px;width:120px;height:90px;
        border-radius:10px;border:2px solid rgba(0,207,0,0.4);object-fit:cover;
        transform:scaleX(-1);display:none;
      "></video>

      <!-- 세션 모드 대기 화면 -->
      <div id="waiting-overlay" style="
        position:absolute;inset:0;display:${isSession ? 'flex' : 'none'};
        flex-direction:column;align-items:center;justify-content:center;gap:16px;
        background:rgba(13,27,42,0.96);font-family:var(--font-main);
      ">
        <div style="font-size:3.5rem;">🎮</div>
        <div style="font-size:1.4rem;font-weight:700;color:var(--color-text);">
          선생님이 게임을 시작하면 시작됩니다
        </div>
        <div style="
          font-size:1.8rem;font-weight:800;letter-spacing:0.08em;
          color:var(--color-accent);
        ">${query.session}</div>
        <div style="color:var(--color-sub);font-size:0.9rem;margin-top:8px;">
          안녕하세요, <strong style="color:var(--color-text);">${playerName}</strong>님!
        </div>
      </div>

      <!-- 게임 오버 오버레이 -->
      <div id="gameover-overlay" style="
        position:absolute;inset:0;display:none;flex-direction:column;
        align-items:center;justify-content:center;gap:16px;
        background:rgba(13,27,42,0.92);font-family:var(--font-main);
      ">
        <div style="font-size:4rem;">💩</div>
        <div id="go-title" style="font-size:2rem;font-weight:800;color:var(--color-danger);">게임 오버</div>
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
  const rounds = manifest.rounds ?? 5

  function updateRoundPips(round) {
    app.querySelector('#hud-rounds').innerHTML =
      Array.from({ length: rounds }, (_, i) =>
        `<span style="font-size:1.1rem;color:${i < round ? '#00CF00' : 'rgba(255,255,255,0.2)'};">●</span>`
      ).join('')
  }
  function updateLives(n) {
    app.querySelector('#hud-lives').innerHTML =
      Array.from({ length: 3 }, (_, i) =>
        `<span style="opacity:${i < n ? 1 : 0.2};">❤️</span>`
      ).join('')
  }
  function updateScore(s) { app.querySelector('#score-val').textContent = s }
  function updateTimer(ms) { app.querySelector('#hud-timer').textContent = Math.ceil(ms / 1000) }

  function resetHUD() {
    updateLives(3)
    updateScore(0)
    updateRoundPips(0)
    app.querySelector('#hud-timer').textContent = ''
  }
  resetHUD()

  // ── 게임 임포트 & 빌드 ────────────────────────────────────
  const { default: GameClass } = await entry.load()
  let game = null

  function buildGame() {
    game?.destroy()
    game = new GameClass(canvas, {
      onRoundEnd: (round) => {
        updateRoundPips(round)
        if (isSession) channel.send(MSG.ROUND_CHANGE, { round })
      },
      onGameEnd: async (stats) => {
        showGameOver(stats)
        try {
          await saveResult({
            sessionId,
            gameId,
            playerName,
            score:         stats.score,
            roundsCleared: stats.roundsCleared,
            dodgeCount:    stats.dodgeCount,
            hitCount:      stats.hitCount,
            reactionAvgMs: null,
          })
        } catch (e) {
          console.error('[game] 결과 저장 실패:', e)
        }
        // 세션 모드에서는 게임 오버 후 대기 화면으로 복귀 가능
      },
      onScoreUpdate: updateScore,
      onLifeUpdate:  updateLives,
    })
    game.init()

    // 타이머 HUD 패치
    const origUpdate = game.update.bind(game)
    game.update = (dt) => {
      origUpdate(dt)
      if (game._roundTimer > 0) updateTimer(game._roundTimer)
    }
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
      `회피 성공: ${stats.dodgeCount}회 · 피격: ${stats.hitCount}회`
    app.querySelector('#gameover-overlay').style.display = 'flex'
  }

  // ── 포즈 엔진 ────────────────────────────────────────────
  const pipVideo = app.querySelector('#pip-video')
  async function initPose() {
    await poseEngine.init(pipVideo, {
      onZoneChange: (zone) => game?.setPlayerZone(zone),
    })
    if (poseEngine.isRunning) pipVideo.style.display = 'block'
  }
  initPose()

  // 키보드 폴백
  function onKey(e) {
    if (!game) return
    if (e.key === 'ArrowLeft')  game.setPlayerZone(0)
    if (e.key === ' ')          game.setPlayerZone(1)
    if (e.key === 'ArrowRight') game.setPlayerZone(2)
  }
  window.addEventListener('keydown', onKey)

  // ── 채널 (세션 모드) ──────────────────────────────────────
  if (isSession) {
    channel.join(sessionId)
    channel.on(MSG.GAME_START,  () => startGame())
    channel.on(MSG.GAME_PAUSE,  () => game?.pause())
    channel.on(MSG.GAME_STOP,   () => {
      game?.destroy()
      app.querySelector('#waiting-overlay').style.display = 'flex'
      app.querySelector('#gameover-overlay').style.display = 'none'
    })
    channel.on(MSG.POSE_UPDATE, ({ zone }) => game?.setPlayerZone(zone))
  }

  // ── 초기 시작 ─────────────────────────────────────────────
  if (!isSession) {
    startGame()  // solo 모드: 즉시 시작
  } else {
    buildGame()  // 세션 모드: 게임 객체만 준비, 대기 화면 표시
  }

  // ── UI 버튼 ───────────────────────────────────────────────
  app.querySelector('#btn-fs').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      app.querySelector('#game-wrap').requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  })

  app.querySelector('#btn-retry').addEventListener('click', () => startGame())

  app.querySelector('#btn-home-go').addEventListener('click', () => {
    cleanup(); navigate('/')
  })

  function cleanup() {
    game?.destroy()
    poseEngine.destroy()
    channel.leave()
    window.removeEventListener('keydown', onKey)
  }

  window.addEventListener('hashchange', cleanup, { once: true })
}

// ── 이름 입력 모달 ─────────────────────────────────────────
function askPlayerName(app, manifest) {
  return new Promise(resolve => {
    app.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:100vh;gap:20px;font-family:var(--font-main);
      ">
        <div style="font-size:4rem;">${manifest.emoji}</div>
        <h2 style="font-size:1.8rem;font-weight:800;color:var(--color-accent);">${manifest.title}</h2>
        <p style="color:var(--color-sub);">${manifest.description ?? ''}</p>
        <div class="card" style="display:flex;flex-direction:column;gap:16px;min-width:280px;">
          <label style="color:var(--color-sub);font-size:0.85rem;">아이 이름 또는 번호</label>
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
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') app.querySelector('#btn-start').click()
    })
    app.querySelector('#btn-cancel').addEventListener('click', () => resolve(null))
  })
}
