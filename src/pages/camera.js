import { navigate } from '../core/router.js'
import { poseEngine } from '../core/pose.js'

const ZONE_LABEL = ['← 왼쪽', '가운데', '오른쪽 →']
const ZONE_COLOR = ['#00CF00', '#ffe600', '#00CF00']
const ZONE_FILL = ['rgba(0,207,0,0.25)', 'rgba(255,230,0,0.15)', 'rgba(0,207,0,0.25)']

export async function cameraPage(app, query) {
  const session = query.session ?? ''

  app.innerHTML = `
    <div style="position:relative;width:100%;height:100vh;background:#000;overflow:hidden;">
      <video id="pose-video" style="display:none;" playsinline></video>
      <canvas id="pose-canvas" style="position:absolute;top:0;left:0;width:100%;height:100%;"></canvas>

      <div style="position:absolute;top:16px;left:0;width:100%;display:flex;justify-content:center;pointer-events:none;">
        <div id="zone-status" style="
          background:rgba(0,0,0,0.75);padding:8px 28px;border-radius:50px;
          font-size:1.2rem;font-weight:700;color:#fff;transition:color 0.15s;
        ">카메라 시작 중...</div>
      </div>

      ${session ? `<div style="position:absolute;top:20px;right:16px;color:rgba(255,255,255,0.45);font-size:0.75rem;">session: ${session}</div>` : ''}

      <div style="position:absolute;bottom:16px;left:0;width:100%;display:flex;justify-content:center;gap:8px;pointer-events:none;">
        <div style="background:rgba(0,0,0,0.6);padding:4px 12px;border-radius:8px;color:rgba(255,255,255,0.5);font-size:0.75rem;">
          키보드 ← / Space / → 로 구역 테스트 가능
        </div>
      </div>

      <button id="btn-home" class="btn-ghost" style="position:absolute;bottom:56px;left:50%;transform:translateX(-50%);">홈으로</button>
    </div>
  `

  const video = app.querySelector('#pose-video')
  const canvas = app.querySelector('#pose-canvas')
  const ctx = canvas.getContext('2d')
  const statusEl = app.querySelector('#zone-status')

  let latestLandmarks = null
  let latestHipX = null
  let rafId = null

  function resizeCanvas() {
    canvas.width = app.offsetWidth
    canvas.height = app.offsetHeight
  }
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)

  function drawFrame() {
    const cw = canvas.width
    const ch = canvas.height

    ctx.clearRect(0, 0, cw, ch)

    // 전면 카메라 → 좌우 반전해서 자연스러운 셀피 뷰로 출력
    ctx.save()
    ctx.translate(cw, 0)
    ctx.scale(-1, 1)
    if (video.readyState >= 2) ctx.drawImage(video, 0, 0, cw, ch)
    ctx.restore()

    const zone = poseEngine.currentZone

    // 구역 배경 오버레이 (3등분)
    const zw = cw / 3
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === zone ? ZONE_FILL[i] : 'transparent'
      ctx.fillRect(i * zw, 0, zw, ch)
    }

    // 구역 경계선
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(zw, 0); ctx.lineTo(zw, ch)
    ctx.moveTo(zw * 2, 0); ctx.lineTo(zw * 2, ch)
    ctx.stroke()

    // 구역 레이블
    ctx.font = 'bold 1.1rem Pretendard, sans-serif'
    ctx.textAlign = 'center'
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = i === zone ? ZONE_COLOR[i] : 'rgba(255,255,255,0.3)'
      ctx.fillText(ZONE_LABEL[i], zw * i + zw / 2, ch / 2)
    }

    // 허리 중심 마커 (포즈 감지 중일 때)
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

  function updateStatus(zone) {
    statusEl.textContent = ZONE_LABEL[zone]
    statusEl.style.color = ZONE_COLOR[zone]
  }

  await poseEngine.init(video, {
    onZoneChange: (zone) => updateStatus(zone),
    onPoseUpdate: (landmarks, hipX) => {
      latestLandmarks = landmarks
      latestHipX = hipX
    },
  })

  if (poseEngine.isRunning) {
    updateStatus(poseEngine.currentZone)
  } else {
    statusEl.textContent = '카메라 없음 — 키보드로 테스트'
    statusEl.style.color = 'rgba(255,255,255,0.6)'
  }

  // 카메라 없을 때 키보드로 구역 테스트
  function onKey(e) {
    if (e.key === 'ArrowLeft')  { poseEngine.currentZone = 0; updateStatus(0) }
    if (e.key === ' ')          { poseEngine.currentZone = 1; updateStatus(1) }
    if (e.key === 'ArrowRight') { poseEngine.currentZone = 2; updateStatus(2) }
  }
  window.addEventListener('keydown', onKey)

  app.querySelector('#btn-home').addEventListener('click', () => {
    cancelAnimationFrame(rafId)
    poseEngine.destroy()
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('resize', resizeCanvas)
    navigate('/')
  })
}
