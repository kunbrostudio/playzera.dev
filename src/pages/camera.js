import { navigate } from '../core/router.js'
import { poseEngine } from '../core/pose.js'
import * as channel from '../core/channel.js'
import { MSG } from '../core/channel.js'

const ZONE_LABEL = ['← 왼쪽', '가운데', '오른쪽 →']
const ZONE_COLOR = ['#00CF00', '#ffe600', '#00CF00']
const ZONE_FILL  = ['rgba(0,207,0,0.25)', 'rgba(255,230,0,0.15)', 'rgba(0,207,0,0.25)']

const POSE_THROTTLE_MS = 100  // 최대 10회/초

export async function cameraPage(app, query) {
  const paramSession = query.session ?? ''
  let connectedSession = ''
  let lastPoseSendMs = 0

  app.innerHTML = `
    <div style="position:relative;width:100%;height:100vh;background:#000;overflow:hidden;">
      <video id="pose-video" style="display:none;" playsinline></video>
      <canvas id="pose-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;"></canvas>

      <!-- 연결 상태 뱃지 -->
      <div id="conn-badge" style="
        position:absolute;top:14px;left:14px;
        display:flex;align-items:center;gap:6px;
        background:rgba(0,0,0,0.7);padding:6px 14px;border-radius:50px;
        font-size:0.8rem;font-weight:700;color:rgba(255,255,255,0.5);
        pointer-events:none;
      ">
        <span id="conn-dot" style="
          width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,0.3);
          display:inline-block;transition:background 0.3s;
        "></span>
        <span id="conn-text">연결 안 됨</span>
      </div>

      <!-- 구역 상태 -->
      <div style="position:absolute;top:14px;left:0;width:100%;display:flex;justify-content:center;pointer-events:none;">
        <div id="zone-status" style="
          background:rgba(0,0,0,0.75);padding:8px 28px;border-radius:50px;
          font-size:1.2rem;font-weight:700;color:#fff;transition:color 0.15s;
        ">카메라 시작 중...</div>
      </div>

      <!-- 세션 연결 카드 (URL 파라미터 없을 때 표시) -->
      <div id="session-card" style="
        position:absolute;bottom:96px;left:50%;transform:translateX(-50%);
        background:rgba(22,33,62,0.95);border-radius:16px;padding:16px 20px;
        width:calc(100% - 48px);max-width:320px;
        display:${paramSession ? 'none' : 'block'};
      ">
        <div style="color:var(--color-sub);font-size:0.8rem;margin-bottom:8px;">세션 ID 입력</div>
        <div style="display:flex;gap:8px;">
          <input id="session-input" type="text" maxlength="7" placeholder="ABC-123"
            value="${paramSession}"
            style="
              flex:1;background:rgba(255,255,255,0.08);
              border:1px solid rgba(255,255,255,0.15);border-radius:10px;
              padding:10px 12px;color:#fff;font-size:1rem;
              font-family:var(--font-main);outline:none;letter-spacing:0.05em;
            ">
          <button id="btn-connect" class="btn-primary" style="padding:10px 16px;font-size:0.9rem;">
            연결
          </button>
        </div>
      </div>

      <!-- 연결된 세션 표시 -->
      <div id="connected-card" style="
        position:absolute;bottom:96px;left:50%;transform:translateX(-50%);
        display:none;
      ">
        <div style="
          background:rgba(0,207,0,0.15);border:1px solid rgba(0,207,0,0.3);
          border-radius:10px;padding:8px 16px;
          font-size:0.8rem;color:#00CF00;text-align:center;
        ">
          📡 세션 <strong id="connected-id"></strong> 연결됨
          <button id="btn-disconnect" style="
            background:transparent;border:none;color:rgba(0,207,0,0.6);
            cursor:pointer;margin-left:8px;font-size:0.75rem;
          ">해제</button>
        </div>
      </div>

      <!-- 키보드 힌트 -->
      <div style="position:absolute;bottom:16px;left:0;width:100%;display:flex;justify-content:center;pointer-events:none;">
        <div style="background:rgba(0,0,0,0.6);padding:4px 12px;border-radius:8px;color:rgba(255,255,255,0.4);font-size:0.72rem;">
          키보드 ← / Space / → 로 테스트
        </div>
      </div>

      <button id="btn-home" class="btn-ghost" style="position:absolute;bottom:48px;left:50%;transform:translateX(-50%);">
        홈으로
      </button>
    </div>
  `

  const video     = app.querySelector('#pose-video')
  const canvas    = app.querySelector('#pose-canvas')
  const ctx       = canvas.getContext('2d')
  const statusEl  = app.querySelector('#zone-status')
  const connDot   = app.querySelector('#conn-dot')
  const connText  = app.querySelector('#conn-text')

  let latestLandmarks = null
  let latestHipX      = null
  let rafId           = null

  // ── Canvas 리사이즈 ────────────────────────────────────
  function resizeCanvas() {
    canvas.width  = app.offsetWidth
    canvas.height = app.offsetHeight
  }
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  // ── 렌더 루프 ─────────────────────────────────────────
  function drawFrame() {
    const cw = canvas.width
    const ch = canvas.height
    ctx.clearRect(0, 0, cw, ch)

    // 셀피 뷰 (좌우 반전)
    ctx.save()
    ctx.translate(cw, 0)
    ctx.scale(-1, 1)
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, cw, ch)
    ctx.restore()

    const zone = poseEngine.currentZone
    const zw = cw / 3

    // 구역 배경
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === zone ? ZONE_FILL[i] : 'transparent'
      ctx.fillRect(i * zw, 0, zw, ch)
    }

    // 구역 경계선
    ctx.strokeStyle = 'rgba(255,255,255,0.2)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(zw, 0);     ctx.lineTo(zw, ch)
    ctx.moveTo(zw * 2, 0); ctx.lineTo(zw * 2, ch)
    ctx.stroke()

    // 구역 레이블
    ctx.font = 'bold 1rem Pretendard, sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === zone ? ZONE_COLOR[i] : 'rgba(255,255,255,0.25)'
      ctx.fillText(ZONE_LABEL[i], zw * i + zw / 2, ch / 2)
    }

    // 허리 마커
    if (latestLandmarks && latestHipX !== null) {
      const lh = latestLandmarks[23]
      const rh = latestLandmarks[24]
      const px = latestHipX * cw
      const py = ((lh.y + rh.y) / 2) * ch
      ctx.beginPath()
      ctx.arc(px, py, 14, 0, Math.PI * 2)
      ctx.fillStyle = ZONE_COLOR[zone]
      ctx.fill()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 3
      ctx.stroke()
    }

    rafId = requestAnimationFrame(drawFrame)
  }
  rafId = requestAnimationFrame(drawFrame)

  // ── 구역 상태 업데이트 ────────────────────────────────
  function updateStatus(zone) {
    statusEl.textContent = ZONE_LABEL[zone]
    statusEl.style.color = ZONE_COLOR[zone]
  }

  // ── 채널 연결/해제 ────────────────────────────────────
  function connectSession(sid) {
    if (!sid) return
    connectedSession = sid.toUpperCase()
    channel.join(connectedSession)

    connDot.style.background = '#00CF00'
    connText.textContent = '송신 중'
    app.querySelector('#session-card').style.display   = 'none'
    app.querySelector('#connected-card').style.display = 'block'
    app.querySelector('#connected-id').textContent     = connectedSession
  }

  function disconnectSession() {
    channel.leave()
    connectedSession = ''
    connDot.style.background = 'rgba(255,255,255,0.3)'
    connText.textContent = '연결 안 됨'
    app.querySelector('#session-card').style.display   = 'block'
    app.querySelector('#connected-card').style.display = 'none'
  }

  // ── 세션 연결 버튼 ────────────────────────────────────
  app.querySelector('#btn-connect').addEventListener('click', () => {
    const v = app.querySelector('#session-input').value.trim()
    if (!v) return
    connectSession(v)
  })
  app.querySelector('#session-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') app.querySelector('#btn-connect').click()
  })
  app.querySelector('#btn-disconnect').addEventListener('click', disconnectSession)

  // URL 파라미터로 자동 연결
  if (paramSession) connectSession(paramSession)

  // ── PoseEngine 초기화 ─────────────────────────────────
  await poseEngine.init(video, {
    onZoneChange: (zone) => {
      updateStatus(zone)
      // 채널 연결됐을 때만 송신, 초당 최대 10회
      if (!connectedSession) return
      const now = Date.now()
      if (now - lastPoseSendMs >= POSE_THROTTLE_MS) {
        lastPoseSendMs = now
        channel.send(MSG.POSE_UPDATE, { zone })
      }
    },
    onPoseUpdate: (landmarks, hipX) => {
      latestLandmarks = landmarks
      latestHipX      = hipX
    },
  })

  if (poseEngine.isRunning) {
    updateStatus(poseEngine.currentZone)
  } else {
    statusEl.textContent = '카메라 없음 — 키보드로 테스트'
    statusEl.style.color = 'rgba(255,255,255,0.6)'
  }

  // ── 키보드 폴백 ───────────────────────────────────────
  function onKey(e) {
    let zone = -1
    if (e.key === 'ArrowLeft')  zone = 0
    if (e.key === ' ')          zone = 1
    if (e.key === 'ArrowRight') zone = 2
    if (zone < 0) return

    poseEngine.currentZone = zone
    updateStatus(zone)

    if (connectedSession) {
      const now = Date.now()
      if (now - lastPoseSendMs >= POSE_THROTTLE_MS) {
        lastPoseSendMs = now
        channel.send(MSG.POSE_UPDATE, { zone })
      }
    }
  }
  window.addEventListener('keydown', onKey)

  // ── 정리 ─────────────────────────────────────────────
  app.querySelector('#btn-home').addEventListener('click', () => {
    cancelAnimationFrame(rafId)
    poseEngine.destroy()
    channel.leave()
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', resizeCanvas)
    navigate('/')
  })
}
