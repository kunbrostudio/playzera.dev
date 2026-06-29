import { navigate } from '../core/router.js'
import { poseEngine } from '../core/pose.js'
import * as channel from '../core/channel.js'
import { MSG, MAX_DEVICES } from '../core/channel.js'
import { save as saveResult, getTodayResults } from '../core/gameResult.js'
import { GAME_REGISTRY } from '../games/registry.js'

function genSession() {
  const L = () => String.fromCharCode(65 + Math.floor(Math.random() * 26))
  const N = () => Math.floor(Math.random() * 10)
  return `${L()}${L()}${L()}-${N()}${N()}${N()}`
}

// ═══════════════════════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════════════════════
export async function gamePage(app, query) {
  const gameId = query.id ?? 'poop-dodge'
  const entry  = GAME_REGISTRY[gameId]
  if (!entry) { navigate('/'); return }

  // ── STEP 1: 세션 코드 ──────────────────────────────────────
  const sessionId = query.session?.toUpperCase()
    || await showSessionEntry(app, entry.manifest)
  if (!sessionId) { navigate('/'); return }

  // ── 채널 연결 ──────────────────────────────────────────────
  await channel.join(sessionId)
  // 'connecting' 으로 먼저 presence 등록 → 인원수 카운팅 즉시 반영
  await channel.trackPresence({ role: 'connecting', ts: Date.now() })

  // ── STEP 2: 역할 선택 ──────────────────────────────────────
  const role = await showRoleSelection(app, sessionId)
  if (!role) { channel.leave(); navigate('/'); return }

  // presence 역할 업데이트
  channel.trackPresence({ role, ts: Date.now() })

  // ── 공용 cleanup ───────────────────────────────────────────
  let _gameRef = null
  const cleanup = () => {
    _gameRef?.destroy()
    _gameRef = null
    poseEngine.destroy()
    channel.leave()
  }
  // 해시 변경으로 나갈 때도 정리
  window.addEventListener('hashchange', cleanup, { once: true })

  // ── STEP 3: 역할별 화면 ────────────────────────────────────
  if (role === 'monitor') {
    showMonitorView(app, gameId, sessionId, entry, g => { _gameRef = g }, cleanup)
  } else if (role === 'controller') {
    showControllerView(app, sessionId, cleanup)
  } else if (role === 'webcam') {
    showWebcamView(app, sessionId, cleanup)
  }
}

// ═══════════════════════════════════════════════════════════════
// STEP 1 — 세션 코드 입력
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
// STEP 2 — 역할 선택
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
          ${_roleCard('monitor',    '📺', '모니터',    'TV · 노트북에서 게임 화면을 표시합니다')}
          ${_roleCard('controller', '🎮', '컨트롤러',  '선생님 폰 — 게임을 시작하고 멈춥니다')}
          ${_roleCard('webcam',     '📸', '웹캠',      '아이 동작을 인식합니다 (카메라 폰)')}
        </div>

        <button id="btn-back" class="btn-ghost" style="font-size:0.85rem;margin-top:4px;">← 세션 변경</button>
      </div>
    `

    // 인원수 실시간 업데이트
    const badge = app.querySelector('#count-badge')
    const updateCount = n => {
      badge.textContent = `${n} / ${MAX_DEVICES} 접속중`
      badge.style.color = n >= MAX_DEVICES ? '#ff4757' : 'var(--color-sub)'
    }
    updateCount(channel.getPresenceCount())
    channel.onPresenceSync(updateCount)

    // 카드 hover
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

function _roleCard(role, emoji, title, desc) {
  return `
    <div class="role-card" data-role="${role}" style="
      display:flex;align-items:center;gap:16px;
      padding:18px 20px;background:var(--color-panel);
      border-radius:var(--radius-card);cursor:pointer;
      border:2px solid transparent;transition:border-color 0.15s,background 0.15s;
    ">
      <div style="font-size:2.2rem;min-width:44px;text-align:center;">${emoji}</div>
      <div>
        <div style="font-size:1rem;font-weight:700;color:var(--color-text);">${title}</div>
        <div style="font-size:0.78rem;color:var(--color-sub);margin-top:3px;">${desc}</div>
      </div>
    </div>
  `
}

// ═══════════════════════════════════════════════════════════════
// STEP 3a — 모니터 (게임 화면)
// ═══════════════════════════════════════════════════════════════
async function showMonitorView(app, gameId, sessionId, entry, onSetGame, cleanup) {
  const { manifest } = entry

  // 플레이어 이름 입력
  const playerName = await _askPlayerName(app, manifest)
  if (!playerName) { cleanup(); navigate('/'); return }

  const rounds = manifest.rounds ?? 5

  app.innerHTML = `
    <div id="game-wrap" style="position:relative;width:100%;height:100vh;overflow:hidden;background:#0d1b2a;">
      <canvas id="game-canvas" style="display:block;width:100%;height:100%;"></canvas>

      <!-- 판정/배너/카운트다운 오버레이 -->
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

      <!-- 대기 화면 -->
      <div id="waiting-overlay" style="
        position:absolute;inset:0;display:flex;flex-direction:column;
        align-items:center;justify-content:center;gap:14px;
        background:rgba(13,27,42,0.96);font-family:var(--font-main);
      ">
        <div style="font-size:3.5rem;">🎮</div>
        <div style="font-size:1.3rem;font-weight:700;color:var(--color-text);">컨트롤러에서 게임을 시작하면 시작됩니다</div>
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

  // ── HUD 헬퍼 ──────────────────────────────────────────────
  const updateRoundPips = round =>
    (app.querySelector('#hud-rounds').innerHTML =
      Array.from({ length: rounds }, (_, i) =>
        `<span style="font-size:1.1rem;color:${i < round ? '#00CF00' : 'rgba(255,255,255,0.2)'};">●</span>`
      ).join(''))
  const updateLives = n =>
    (app.querySelector('#hud-lives').innerHTML =
      Array.from({ length: 3 }, (_, i) =>
        `<span style="opacity:${i < n ? 1 : 0.2};">❤️</span>`
      ).join(''))
  const updateScore = s => { app.querySelector('#score-val').textContent = s }
  const updateTimer = ms => { app.querySelector('#hud-timer').textContent = Math.ceil(ms / 1000) }
  const resetHUD    = () => { updateLives(3); updateScore(0); updateRoundPips(0); app.querySelector('#hud-timer').textContent = '' }

  resetHUD()

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

    // 타이머 HUD 패치
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
  channel.on(MSG.POSE_UPDATE, ({ zone }) => game?.setPlayerZone(zone))

  // ── 로컬 포즈 (PIP) ───────────────────────────────────────
  const pipVideo = app.querySelector('#pip-video')
  poseEngine.init(pipVideo, {
    onZoneChange: zone => game?.setPlayerZone(zone),
  }).then(() => { if (poseEngine.isRunning) pipVideo.style.display = 'block' })

  // ── 키보드 폴백 ───────────────────────────────────────────
  const onKey = e => {
    if (!game) return
    if (e.key === 'ArrowLeft')  game.setPlayerZone(0)
    if (e.key === ' ')          game.setPlayerZone(1)
    if (e.key === 'ArrowRight') game.setPlayerZone(2)
  }
  window.addEventListener('keydown', onKey)

  // 초기: 게임 객체만 준비 (대기 화면 표시)
  buildGame()

  // ── 버튼 ──────────────────────────────────────────────────
  app.querySelector('#btn-fs').addEventListener('click', () => {
    if (!document.fullscreenElement) app.querySelector('#game-wrap').requestFullscreen?.()
    else document.exitFullscreen?.()
  })
  app.querySelector('#btn-retry').addEventListener('click', () => startGame())
  app.querySelector('#btn-home-go').addEventListener('click', () => {
    window.removeEventListener('keydown', onKey)
    cleanup(); navigate('/')
  })
}

// ═══════════════════════════════════════════════════════════════
// STEP 3b — 컨트롤러
// ═══════════════════════════════════════════════════════════════
function showControllerView(app, sessionId, cleanup) {
  let gameState    = 'idle'
  let recordsOpen  = false

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

  // 인원수 업데이트
  channel.onPresenceSync(n => {
    app.querySelector('#count-badge').textContent = `${n} / ${MAX_DEVICES} 접속중`
  })

  // 게임에서 라운드 변경 수신
  channel.on(MSG.ROUND_CHANGE, ({ round }) => {
    app.querySelector('#round-label').textContent = round
  })

  // 상태 업데이트
  const dotEl   = app.querySelector('#state-dot')
  const labelEl = app.querySelector('#state-label')
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
// STEP 3c — 웹캠 (동작 인식 + POSE_UPDATE 송신)
// ═══════════════════════════════════════════════════════════════
async function showWebcamView(app, sessionId, cleanup) {
  const THROTTLE    = 100   // ms (최대 10회/초)
  const ZONE_LABEL  = ['← 왼쪽', '가운데', '오른쪽 →']
  const ZONE_COLOR  = ['#00CF00', '#ffe600', '#00CF00']
  const ZONE_FILL   = ['rgba(0,207,0,0.25)', 'rgba(255,230,0,0.15)', 'rgba(0,207,0,0.25)']

  let lastPoseSendMs = 0
  let latestLandmarks = null
  let latestHipX      = null
  let rafId           = null

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
        <div id="send-badge" style="
          background:rgba(0,207,0,0.2);border:1px solid rgba(0,207,0,0.4);
          padding:5px 12px;border-radius:50px;font-size:0.78rem;color:#00CF00;
        ">📡 송신중</div>
      </div>

      <!-- 구역 상태 -->
      <div style="position:absolute;top:14px;left:0;width:100%;display:flex;justify-content:center;pointer-events:none;">
        <div id="zone-status" style="
          background:rgba(0,0,0,0.75);padding:8px 28px;border-radius:50px;
          font-size:1.2rem;font-weight:700;color:#fff;
        ">카메라 시작 중...</div>
      </div>

      <button id="btn-home" class="btn-ghost" style="position:absolute;bottom:24px;left:50%;transform:translateX(-50%);">홈으로</button>
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

    // 셀피 뷰 (좌우 반전)
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
      statusEl.textContent = ZONE_LABEL[zone]
      statusEl.style.color = ZONE_COLOR[zone]
      const now = Date.now()
      if (now - lastPoseSendMs >= THROTTLE) {
        lastPoseSendMs = now
        channel.send(MSG.POSE_UPDATE, { zone })
      }
    },
    onPoseUpdate: (landmarks, hipX) => { latestLandmarks = landmarks; latestHipX = hipX },
  })

  if (!poseEngine.isRunning) {
    statusEl.textContent = '카메라 없음 — 키보드 ← / Space / → 로 테스트'
    statusEl.style.color = 'rgba(255,255,255,0.5)'
    statusEl.style.fontSize = '0.85rem'
  }

  // 키보드 폴백
  const onKey = e => {
    let zone = -1
    if (e.key === 'ArrowLeft')  zone = 0
    if (e.key === ' ')          zone = 1
    if (e.key === 'ArrowRight') zone = 2
    if (zone < 0) return
    poseEngine.currentZone = zone
    statusEl.textContent = ZONE_LABEL[zone]
    statusEl.style.color = ZONE_COLOR[zone]
    const now = Date.now()
    if (now - lastPoseSendMs >= THROTTLE) {
      lastPoseSendMs = now
      channel.send(MSG.POSE_UPDATE, { zone })
    }
  }
  window.addEventListener('keydown', onKey)

  app.querySelector('#btn-home').addEventListener('click', () => {
    cancelAnimationFrame(rafId)
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', resizeCanvas)
    cleanup(); navigate('/')
  })
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
