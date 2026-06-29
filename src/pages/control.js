import { navigate } from '../core/router.js'
import * as channel from '../core/channel.js'
import { MSG } from '../core/channel.js'
import { getTodayResults } from '../core/gameResult.js'
import { GAME_REGISTRY } from '../games/registry.js'

const GAME_ID = 'poop-dodge'  // 현재 지원 게임

function generateSessionId() {
  const letters = Array.from({ length: 3 }, () =>
    String.fromCharCode(65 + Math.floor(Math.random() * 26))
  ).join('')
  const digits = String(Math.floor(Math.random() * 1000)).padStart(3, '0')
  return `${letters}-${digits}`
}

function loadQRScript() {
  if (window.QRCode) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-qr]')) {
      // 이미 삽입됐지만 아직 로드 중이면 대기
      const poll = setInterval(() => {
        if (window.QRCode) { clearInterval(poll); resolve() }
      }, 50)
      return
    }
    const s = document.createElement('script')
    s.src = 'https://cdn.jsdelivr.net/npm/qrcode@1.5.3/build/qrcode.min.js'
    s.dataset.qr = '1'
    s.onload = resolve
    s.onerror = () => reject(new Error('QR 라이브러리 로드 실패'))
    document.head.appendChild(s)
  })
}

export async function controlPage(app, query) {
  const sessionId = query.session || generateSessionId()
  const gameUrl = `${window.location.origin}/#/game?id=${GAME_ID}&session=${sessionId}`
  const cameraUrl = `${window.location.origin}/#/camera?session=${sessionId}`
  const manifest = GAME_REGISTRY[GAME_ID]?.manifest ?? { title: '게임', emoji: '🎮' }

  // 상태 (로컬 트래킹)
  let gameState = 'idle'  // idle | running | paused
  let currentRound = 0

  // ── 메인 뷰 렌더 ────────────────────────────────────────
  app.innerHTML = `
    <div style="
      min-height:100vh;display:flex;flex-direction:column;
      font-family:var(--font-main);background:var(--color-bg);
      max-width:480px;margin:0 auto;padding:0 0 40px;
    ">
      <!-- 헤더 -->
      <div style="
        display:flex;align-items:center;justify-content:space-between;
        padding:16px 20px;background:var(--color-panel);
        border-bottom:1px solid rgba(255,255,255,0.08);
      ">
        <span style="font-size:1rem;font-weight:700;color:var(--color-accent2);">🎮 선생님 컨트롤러</span>
        <button id="btn-home" style="
          background:transparent;border:none;color:var(--color-sub);
          font-size:0.85rem;cursor:pointer;
        ">홈으로 ✕</button>
      </div>

      <!-- 세션 ID -->
      <div style="padding:20px 20px 0;text-align:center;">
        <div style="color:var(--color-sub);font-size:0.75rem;margin-bottom:4px;">세션 ID</div>
        <div style="
          font-size:2.4rem;font-weight:800;letter-spacing:0.08em;
          color:var(--color-accent);
        ">${sessionId}</div>
      </div>

      <!-- QR 코드 탭 -->
      <div style="padding:16px 20px 0;display:flex;gap:8px;justify-content:center;">
        <button class="qr-tab btn-tab active" data-target="qr-game" style="flex:1;">
          📺 게임 화면
        </button>
        <button class="qr-tab btn-tab" data-target="qr-camera" style="flex:1;">
          📷 카메라
        </button>
      </div>

      <!-- QR 패널: 게임 -->
      <div id="qr-game" class="qr-panel" style="
        margin:16px 20px 0;padding:20px;background:var(--color-panel);
        border-radius:var(--radius-card);text-align:center;
      ">
        <canvas id="qr-canvas-game" style="border-radius:8px;"></canvas>
        <div style="margin-top:10px;color:var(--color-sub);font-size:0.7rem;word-break:break-all;">
          ${gameUrl}
        </div>
      </div>

      <!-- QR 패널: 카메라 -->
      <div id="qr-camera" class="qr-panel" style="
        margin:16px 20px 0;padding:20px;background:var(--color-panel);
        border-radius:var(--radius-card);text-align:center;display:none;
      ">
        <canvas id="qr-canvas-camera" style="border-radius:8px;"></canvas>
        <div style="margin-top:10px;color:var(--color-sub);font-size:0.7rem;word-break:break-all;">
          ${cameraUrl}
        </div>
      </div>

      <!-- 상태바 -->
      <div style="
        margin:16px 20px 0;padding:12px 16px;
        background:var(--color-panel);border-radius:var(--radius-card);
        display:flex;align-items:center;justify-content:space-between;
      ">
        <div style="display:flex;align-items:center;gap:8px;">
          <span id="state-dot" style="
            width:10px;height:10px;border-radius:50%;background:var(--color-sub);
            display:inline-block;transition:background 0.3s;
          "></span>
          <span id="state-label" style="font-size:0.95rem;color:var(--color-text);">대기중</span>
        </div>
        <div style="color:var(--color-sub);font-size:0.85rem;">
          라운드 <span id="round-label" style="color:var(--color-text);font-weight:700;">-</span> / 5
        </div>
      </div>

      <!-- 컨트롤 버튼 -->
      <div style="margin:16px 20px 0;display:flex;flex-direction:column;gap:12px;">
        <button id="btn-start" style="
          padding:20px;font-size:1.2rem;font-weight:800;
          background:var(--color-accent);color:#000;
          border:none;border-radius:var(--radius-btn);cursor:pointer;
          transition:opacity 0.15s;
        ">▶ 게임 시작</button>

        <div style="display:flex;gap:12px;">
          <button id="btn-pause" style="
            flex:1;padding:16px;font-size:1rem;font-weight:700;
            background:var(--color-accent2);color:#000;
            border:none;border-radius:var(--radius-btn);cursor:pointer;
            opacity:0.4;transition:opacity 0.15s;
          ">⏸ 일시정지</button>

          <button id="btn-stop" style="
            flex:1;padding:16px;font-size:1rem;font-weight:700;
            background:var(--color-danger);color:#fff;
            border:none;border-radius:var(--radius-btn);cursor:pointer;
            opacity:0.4;transition:opacity 0.15s;
          ">⏹ 정지</button>
        </div>
      </div>

      <!-- 기록 / 홈 버튼 -->
      <div style="margin:20px 20px 0;display:flex;gap:10px;">
        <button id="btn-records" class="btn-ghost" style="flex:1;">📊 오늘 기록</button>
      </div>

      <!-- 기록 뷰 (인라인 토글) -->
      <div id="records-view" style="display:none;margin:16px 20px 0;">
        <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
          <button id="btn-records-back" style="
            background:transparent;border:none;color:var(--color-sub);
            font-size:1.2rem;cursor:pointer;
          ">←</button>
          <span style="font-weight:700;color:var(--color-text);">오늘 기록 (${sessionId})</span>
        </div>
        <div id="records-list"></div>
      </div>
    </div>
  `

  // ── 탭 버튼 스타일 (인라인 정의) ────────────────────────
  const style = document.createElement('style')
  style.textContent = `
    .btn-tab {
      padding:10px;font-size:0.85rem;font-weight:600;
      background:var(--color-panel);color:var(--color-sub);
      border:1px solid rgba(255,255,255,0.08);border-radius:10px;
      cursor:pointer;transition:all 0.15s;font-family:var(--font-main);
    }
    .btn-tab.active {
      background:var(--color-accent);color:#000;border-color:var(--color-accent);
    }
  `
  document.head.appendChild(style)

  // ── QR 코드 생성 ─────────────────────────────────────────
  try {
    await loadQRScript()
    const qrOpts = { width: 200, color: { dark: '#e8f4f8', light: '#16213e' } }
    await window.QRCode.toCanvas(app.querySelector('#qr-canvas-game'), gameUrl, qrOpts)
    await window.QRCode.toCanvas(app.querySelector('#qr-canvas-camera'), cameraUrl, qrOpts)
  } catch (e) {
    console.warn('[control] QR 생성 실패:', e)
    app.querySelector('#qr-canvas-game').insertAdjacentHTML('afterend',
      `<p style="color:var(--color-sub);font-size:0.8rem;">QR 로드 실패 — URL을 직접 복사하세요</p>`)
  }

  // ── QR 탭 전환 ───────────────────────────────────────────
  app.querySelectorAll('.qr-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      app.querySelectorAll('.qr-tab').forEach(b => b.classList.remove('active'))
      app.querySelectorAll('.qr-panel').forEach(p => { p.style.display = 'none' })
      btn.classList.add('active')
      app.querySelector(`#${btn.dataset.target}`).style.display = 'block'
    })
  })

  // ── 채널 입장 ────────────────────────────────────────────
  channel.join(sessionId)

  // 게임에서 라운드 변경 수신
  channel.on(MSG.ROUND_CHANGE, ({ round }) => {
    app.querySelector('#round-label').textContent = round
  })

  // ── 상태 업데이트 ────────────────────────────────────────
  const dotEl = app.querySelector('#state-dot')
  const labelEl = app.querySelector('#state-label')

  function setState(state) {
    gameState = state
    const map = {
      idle:    { label: '대기중',   color: 'var(--color-sub)' },
      running: { label: '게임중',   color: 'var(--color-accent)' },
      paused:  { label: '일시정지', color: 'var(--color-accent2)' },
    }
    const { label, color } = map[state] ?? map.idle
    labelEl.textContent = label
    dotEl.style.background = color

    // 버튼 활성화 상태
    app.querySelector('#btn-pause').style.opacity = state === 'running' ? '1' : '0.4'
    app.querySelector('#btn-stop').style.opacity  = state !== 'idle'    ? '1' : '0.4'
  }
  setState('idle')

  // ── 컨트롤 버튼 ─────────────────────────────────────────
  app.querySelector('#btn-start').addEventListener('click', () => {
    channel.send(MSG.GAME_START, { sessionId })
    setState('running')
    app.querySelector('#round-label').textContent = '1'
    currentRound = 1
  })

  app.querySelector('#btn-pause').addEventListener('click', () => {
    if (gameState !== 'running' && gameState !== 'paused') return
    if (gameState === 'running') {
      channel.send(MSG.GAME_PAUSE, {})
      setState('paused')
    } else {
      channel.send(MSG.GAME_START, { sessionId })  // resume → restart로 처리
      setState('running')
    }
  })

  app.querySelector('#btn-stop').addEventListener('click', () => {
    if (gameState === 'idle') return
    channel.send(MSG.GAME_STOP, {})
    setState('idle')
    app.querySelector('#round-label').textContent = '-'
  })

  // ── 오늘 기록 ────────────────────────────────────────────
  const recordsView = app.querySelector('#records-view')
  const mainButtons = app.querySelectorAll('#btn-start,#btn-pause,#btn-stop,.qr-panel,.qr-panel+div,.btn-tab')

  app.querySelector('#btn-records').addEventListener('click', async () => {
    recordsView.style.display = 'block'
    app.querySelector('#records-list').innerHTML =
      `<p style="color:var(--color-sub);text-align:center;">불러오는 중...</p>`
    try {
      const results = await getTodayResults(sessionId)
      if (!results?.length) {
        app.querySelector('#records-list').innerHTML =
          `<p style="color:var(--color-sub);text-align:center;">오늘 기록이 없습니다</p>`
        return
      }
      app.querySelector('#records-list').innerHTML = results.map(r => `
        <div style="
          padding:12px 16px;margin-bottom:8px;
          background:var(--color-panel);border-radius:12px;
          display:flex;justify-content:space-between;align-items:center;
        ">
          <div>
            <div style="font-weight:700;color:var(--color-text);">${r.player_name}</div>
            <div style="font-size:0.75rem;color:var(--color-sub);margin-top:2px;">
              라운드 ${r.rounds_cleared}/5 · 회피 ${r.dodge_count}회 · 피격 ${r.hit_count}회
            </div>
          </div>
          <div style="font-size:1.3rem;font-weight:800;color:var(--color-accent);">
            ${r.score}점
          </div>
        </div>
      `).join('')
    } catch (e) {
      app.querySelector('#records-list').innerHTML =
        `<p style="color:var(--color-danger);">기록 불러오기 실패: ${e.message}</p>`
    }
  })

  app.querySelector('#btn-records-back').addEventListener('click', () => {
    recordsView.style.display = 'none'
  })

  // ── 홈 ──────────────────────────────────────────────────
  app.querySelector('#btn-home').addEventListener('click', () => {
    channel.leave()
    navigate('/')
  })
}
