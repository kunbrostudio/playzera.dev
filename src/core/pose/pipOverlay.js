// PIP 오버레이 — 웹캠 미리보기 위에 스켈레톤과 3분할 라인을 그린다.
//
// 아이가 "옆으로 피한다"를 몸으로 익히려면 자기 위치가 보여야 한다. 영상만 띄우면
// 자기 모습은 보이지만 **어느 칸에 서 있는지**는 안 보인다. 경계선과 현재 칸을
// 함께 그리면 "선을 넘으면 칸이 바뀐다"가 한눈에 읽힌다.
//
// ⚠️ 반전 주의 — poseEngine이 거울 좌표로 내보낸다(`1 - x`를 엔진에서 한 번만).
// 영상은 CSS `scaleX(-1)`로 뒤집혀 있으므로 둘이 같은 좌표계다.
// 오버레이 캔버스에 또 반전을 걸면 좌우가 어긋난다.
//
// 3분할 라인은 칸으로 조종하는 게임(똥 피하기)에서만 필요하다. 웜업처럼
// 캘리브레이션 기준으로 좌우를 재는 게임에서는 선이 오히려 거짓말이 된다 —
// `{ zones: false }`로 끈다.

// MediaPipe Pose 33점 중 몸통·팔다리만. 얼굴 점은 작은 PIP에서 뭉쳐 보이기만 한다.
const EDGES = [
  [11, 12],           // 어깨
  [11, 13], [13, 15], // 왼팔
  [12, 14], [14, 16], // 오른팔
  [11, 23], [12, 24], // 몸통
  [23, 24],           // 골반
  [23, 25], [25, 27], // 왼다리
  [24, 26], [26, 28], // 오른다리
]

const JOINTS = [11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28]
const VISIBILITY_MIN = 0.4

// 존별 색 — 게임 화면의 존 색과 맞춘다(왼쪽 분홍 / 가운데 파랑 / 오른쪽 보라)
const ZONE_RGB = ['255,100,160', '80,150,255', '160,80,255']

export function createPipOverlay(canvasEl, { zones = true } = {}) {
  if (!canvasEl) return { draw() {}, clear() {}, destroy() {} }
  const ctx = canvasEl.getContext('2d')
  let raf = null

  // CSS 크기와 실제 픽셀을 맞춘다. 안 맞추면 선이 흐릿하거나 좌표가 어긋난다.
  function fit() {
    const dpr = window.devicePixelRatio || 1
    const w = canvasEl.clientWidth || 200
    const h = canvasEl.clientHeight || 150
    if (canvasEl.width !== w * dpr || canvasEl.height !== h * dpr) {
      canvasEl.width = w * dpr
      canvasEl.height = h * dpr
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    return { w, h }
  }

  function clear() {
    const { w, h } = fit()
    ctx.clearRect(0, 0, w, h)
  }

  // landmarks: MediaPipe 33점 (없으면 라인만 그린다)
  // zone: 지금 서 있는 칸 0|1|2
  function draw(landmarks, zone = 1) {
    const { w, h } = fit()
    ctx.clearRect(0, 0, w, h)

    const zw = w / 3

    // 1) 현재 칸 강조 — 어디 서 있는지가 먼저 읽혀야 한다
    if (zones && zone >= 0 && zone <= 2) {
      const g = ctx.createLinearGradient(0, 0, 0, h)
      g.addColorStop(0, `rgba(${ZONE_RGB[zone]},0.30)`)
      g.addColorStop(1, `rgba(${ZONE_RGB[zone]},0.10)`)
      ctx.fillStyle = g
      ctx.fillRect(zone * zw, 0, zw, h)
    }

    // 2) 3분할 경계선 — 칸으로 조종하는 게임에서만.
    //    웜업은 캘리브레이션한 자리를 기준으로 좌우를 재므로 고정된 선이 거짓말이 된다.
    if (zones) {
      ctx.save()
      ctx.setLineDash([6, 5])
      ctx.strokeStyle = 'rgba(255,255,255,0.75)'
      ctx.lineWidth = 2
      for (const x of [zw, zw * 2]) {
        ctx.beginPath()
        ctx.moveTo(x, 0)
        ctx.lineTo(x, h)
        ctx.stroke()
      }
      ctx.restore()
    }

    if (!landmarks) return

    const px = p => p.x * w
    const py = p => p.y * h
    const ok = p => p && (typeof p.visibility !== 'number' || p.visibility >= VISIBILITY_MIN)

    // 3) 스켈레톤 — 어두운 배경에서도 보이도록 글로우를 얹는다
    ctx.save()
    ctx.shadowColor = 'rgba(90,255,145,0.9)'
    ctx.shadowBlur = 6
    ctx.strokeStyle = 'rgba(90,255,145,0.95)'
    ctx.lineWidth = 3
    ctx.lineCap = 'round'
    for (const [a, b] of EDGES) {
      const p1 = landmarks[a]
      const p2 = landmarks[b]
      if (!ok(p1) || !ok(p2)) continue
      ctx.beginPath()
      ctx.moveTo(px(p1), py(p1))
      ctx.lineTo(px(p2), py(p2))
      ctx.stroke()
    }
    ctx.restore()

    ctx.fillStyle = '#ffd23e'
    for (const i of JOINTS) {
      const p = landmarks[i]
      if (!ok(p)) continue
      ctx.beginPath()
      ctx.arc(px(p), py(p), 3.5, 0, Math.PI * 2)
      ctx.fill()
    }

    // 4) 골반 중심 — 칸 판정의 기준점이다. 이게 보여야 "왜 안 바뀌지"를 이해한다.
    const lh = landmarks[23]
    const rh = landmarks[24]
    if (ok(lh) && ok(rh)) {
      const cx = ((lh.x + rh.x) / 2) * w
      const cy = ((lh.y + rh.y) / 2) * h
      ctx.save()
      ctx.strokeStyle = '#fff'
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(cx, cy, 7, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  // 랜드마크 콜백은 카메라 프레임마다 오지만, 그릴 때는 한 프레임에 한 번이면 된다
  function drawThrottled(landmarks, zone) {
    if (raf) return
    raf = requestAnimationFrame(() => {
      raf = null
      draw(landmarks, zone)
    })
  }

  return {
    draw: drawThrottled,
    clear,
    destroy() {
      if (raf) cancelAnimationFrame(raf)
      raf = null
      clear()
    },
  }
}
