// 손 포인터 — 손목으로 화면 커서를 만들고, 버튼 위에 머무르면 누른다.
//
// 03 화면설계 §입력 체계의 첫 번째 층이다. O/X는 "예/아니오"만 되고 목록에서
// 하나를 고르는 건 못 한다. 이게 붙어야 아이가 마우스 없이 게임을 고를 수 있다.
//
// 설계 근거는 02 시스템설계 §4. 요점만:
//   · 손목(15/16)만 쓴다 — Hands 모델을 얹으면 프레임이 절반이 된다
//   · 활성 박스는 어깨 너비 기준 — 아이/어른, 카메라 거리와 무관하게 같은 감각
//   · One Euro Filter 필수 — 없으면 커서가 떨려서 조준이 안 된다
//   · 손을 어깨 위로 들면 활성, 내리면 비활성 — 팔을 내린 채 쉴 수 있어야 한다
//   · 경계 히스테리시스 12px — 가장자리에서 대상이 깜빡이면 머무르기가 계속 끊긴다
//   · 머무르기 감소율은 GestureHold와 동일한 dt × 0.6 — 손동작과 감각을 맞춘다
import { poseEngineCore } from './pose/poseEngine.js'
import { LM } from './pose/gesture.js'

const DEFAULT_DWELL_MS = 1200   // 게임 카드 기준 (03 설계 §머무르기 시간)
const EDGE_HYSTERESIS = 12      // px
const RELEASE_COOLDOWN = 700    // 한 번 누른 뒤 쉬는 시간(ms)
const DWELL_DECAY = 0.6         // 벗어났을 때 줄어드는 속도 배율

// 활성 박스 — 어깨 너비의 배수로 잡는다.
// 좁으면 손을 조금만 움직여도 커서가 화면 끝까지 튀고, 넓으면 팔을 크게 휘둘러야 한다.
const BOX_HALF_W = 1.5   // 어깨 중심에서 좌우로 어깨너비 × 1.5
const BOX_TOP    = 1.7   // 어깨선 위로 어깨너비 × 1.7
const BOX_BOTTOM = 0.5   // 어깨선 아래로 어깨너비 × 0.5

// 손을 "들었다"고 볼 기준. 내릴 때는 조금 더 내려야 꺼진다(깜빡임 방지).
const RAISE_ON  = 0.02
const RAISE_OFF = 0.30

// ── One Euro Filter ─────────────────────────────────────────────
//
// 저역 통과 필터의 차단 주파수를 손 속도에 따라 바꾼다. 천천히 움직일 때는
// 강하게 걸러 떨림을 없애고, 빠르게 움직일 때는 약하게 걸러 지연을 없앤다.
// 고정 필터로는 이 둘을 동시에 만족시킬 수 없다.
class OneEuro {
  constructor({ minCutoff = 1.0, beta = 0.02, dCutoff = 1.0 } = {}) {
    this.minCutoff = minCutoff
    this.beta = beta
    this.dCutoff = dCutoff
    this.x = null
    this.dx = 0
  }
  _alpha(cutoff, dt) {
    const tau = 1 / (2 * Math.PI * cutoff)
    return 1 / (1 + tau / dt)
  }
  filter(value, dt) {
    if (dt <= 0) return this.x ?? value
    if (this.x === null) { this.x = value; return value }
    const dxRaw = (value - this.x) / dt
    this.dx += this._alpha(this.dCutoff, dt) * (dxRaw - this.dx)
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx)
    this.x += this._alpha(cutoff, dt) * (value - this.x)
    return this.x
  }
  reset() { this.x = null; this.dx = 0 }
}

// ── 커서 DOM ────────────────────────────────────────────────────
function buildCursor() {
  const el = document.createElement('div')
  el.id = 'pz-cursor'
  el.innerHTML = `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <circle class="pz-cursor-track" cx="50" cy="50" r="42" />
      <circle class="pz-cursor-ring"  cx="50" cy="50" r="42" />
      <circle class="pz-cursor-dot"   cx="50" cy="50" r="11" />
    </svg>`
  const style = document.createElement('style')
  style.id = 'pz-cursor-style'
  style.textContent = `
    #pz-cursor {
      position: fixed; left: 0; top: 0; z-index: 9999;
      width: 84px; height: 84px; margin: -42px 0 0 -42px;
      pointer-events: none; opacity: 0;
      transition: opacity 0.18s;
      filter: drop-shadow(0 3px 10px rgba(0,0,0,0.55));
    }
    #pz-cursor.on { opacity: 1; }
    #pz-cursor svg { width: 100%; height: 100%; transform: rotate(-90deg); }
    .pz-cursor-track { fill: rgba(21,10,46,0.45); stroke: rgba(255,255,255,0.5); stroke-width: 5; }
    .pz-cursor-ring {
      fill: none; stroke: #ffd23e; stroke-width: 7; stroke-linecap: round;
      stroke-dasharray: 264; stroke-dashoffset: 264;
    }
    .pz-cursor-dot { fill: #fff; }
    #pz-cursor.armed .pz-cursor-dot { fill: #ffd23e; }
    @media (prefers-reduced-motion: reduce) { #pz-cursor { transition: none; } }
  `
  document.head.appendChild(style)
  document.body.appendChild(el)
  return el
}

/**
 * @param {object}   opts
 * @param {string}   opts.hitAttr   대상 표시 속성 (기본 'data-pz-hit')
 * @param {number}   opts.dwellMs   기본 머무르기 시간. 대상에 data-pz-dwell로 개별 지정 가능
 * @param {Function} opts.onActivate(el) 없으면 el.click()
 */
export function createHandPointer({ hitAttr = 'data-pz-hit', dwellMs = DEFAULT_DWELL_MS, onActivate } = {}) {
  const cursor = buildCursor()
  const ring = cursor.querySelector('.pz-cursor-ring')
  const fx = new OneEuro()
  const fy = new OneEuro()

  let unsub = null
  let raf = null
  let lastT = 0
  let lastLms = null
  let raised = false
  let px = window.innerWidth / 2
  let py = window.innerHeight / 2
  let target = null
  let dwell = 0
  let cooldownUntil = 0

  const dwellFor = el => Number(el?.getAttribute('data-pz-dwell')) || dwellMs

  function setRing(progress) {
    ring.style.strokeDashoffset = String(264 * (1 - progress))
  }

  // 커서 아래 대상 찾기. 커서 자체는 pointer-events:none이라 걸리지 않는다.
  function hitTest(x, y) {
    const el = document.elementFromPoint(x, y)
    return el?.closest(`[${hitAttr}]`) ?? null
  }

  // 가장자리에서 대상이 깜빡이면 머무르기가 계속 처음부터 다시 시작된다.
  // 지금 대상의 사각형을 12px 넉넉히 잡아, 그 안이면 대상을 유지한다.
  function stillInside(el, x, y) {
    if (!el?.isConnected) return false
    const r = el.getBoundingClientRect()
    return x >= r.left - EDGE_HYSTERESIS && x <= r.right + EDGE_HYSTERESIS &&
           y >= r.top - EDGE_HYSTERESIS && y <= r.bottom + EDGE_HYSTERESIS
  }

  function clearTarget() {
    target?.classList.remove('pz-hover')
    target = null
    dwell = 0
    setRing(0)
    cursor.classList.remove('armed')
  }

  function tick(now) {
    raf = requestAnimationFrame(tick)
    const dt = Math.min(0.05, (now - lastT) / 1000)
    lastT = now

    const lms = lastLms
    const ls = lms?.[LM.L_SHOULDER]
    const rs = lms?.[LM.R_SHOULDER]
    const lw = lms?.[LM.L_WRIST]
    const rw = lms?.[LM.R_WRIST]

    if (!ls || !rs || (!lw && !rw)) { hide(); return }

    const shoulderW = Math.abs(ls.x - rs.x)
    if (shoulderW < 0.03) { hide(); return }   // 상체가 거의 안 보임

    const midX = (ls.x + rs.x) / 2
    const midY = (ls.y + rs.y) / 2

    // 더 높이 든 손을 쓴다. 양손을 다 들면 위쪽 손이 기준이다.
    const wrist = !lw ? rw : !rw ? lw : (lw.y < rw.y ? lw : rw)
    const lift = (midY - wrist.y) / shoulderW      // 어깨 위로 얼마나 들었나

    // 켜질 때와 꺼질 때 기준을 다르게 둔다 — 경계에서 커서가 명멸하지 않도록
    if (!raised && lift > RAISE_ON) raised = true
    else if (raised && lift < -RAISE_OFF) raised = false
    if (!raised) { hide(); return }

    // 활성 박스 → 화면
    const left = midX - shoulderW * BOX_HALF_W
    const right = midX + shoulderW * BOX_HALF_W
    const top = midY - shoulderW * BOX_TOP
    const bottom = midY + shoulderW * BOX_BOTTOM
    const nx = (wrist.x - left) / (right - left)
    const ny = (wrist.y - top) / (bottom - top)

    const rawX = Math.max(0, Math.min(1, nx)) * window.innerWidth
    const rawY = Math.max(0, Math.min(1, ny)) * window.innerHeight
    px = fx.filter(rawX, dt)
    py = fy.filter(rawY, dt)

    cursor.classList.add('on')
    cursor.style.transform = `translate(${px}px, ${py}px)`

    if (now < cooldownUntil) { clearTarget(); return }

    // ── 대상 판정 ──
    const next = stillInside(target, px, py) ? target : hitTest(px, py)

    if (next === null && target) {
      // 버튼 사이로 잠깐 미끄러진 것과 진짜 그만둔 것을 구분한다.
      // 즉시 0으로 만들면 손이 한두 프레임 떨렸다고 처음부터 다시 해야 해서
      // "잘 안 된다"고 느껴진다. GestureHold와 같은 dt × 0.6으로 천천히 준다.
      dwell = Math.max(0, dwell - dt * DWELL_DECAY)
      if (dwell <= 0) clearTarget()
      else setRing(Math.min(1, dwell / (dwellFor(target) / 1000)))
      return
    }

    if (next !== target) {
      // 다른 버튼으로 옮겼다면 진행도는 물려주지 않는다 — 옆 버튼이 대신 눌린다
      target?.classList.remove('pz-hover')
      target = next
      dwell = 0
      target?.classList.add('pz-hover')
    }

    if (!target) { setRing(0); cursor.classList.remove('armed'); return }

    dwell += dt
    const need = dwellFor(target) / 1000
    const progress = Math.min(1, dwell / need)
    setRing(progress)
    cursor.classList.toggle('armed', progress > 0.15)

    if (progress >= 1) {
      const el = target
      cooldownUntil = now + RELEASE_COOLDOWN
      clearTarget()
      fx.reset(); fy.reset()
      if (onActivate) onActivate(el)
      else el.click()
    }
  }

  function hide() {
    cursor.classList.remove('on')
    clearTarget()
    // 손을 내렸다 다시 들면 그 자리에서 시작해야 한다 — 이전 위치로 튀지 않게
    fx.reset(); fy.reset()
  }

  return {
    start() {
      if (unsub) return
      unsub = poseEngineCore.onLandmarks(lms => { lastLms = lms })
      lastT = performance.now()
      raf = requestAnimationFrame(tick)
    },
    stop() {
      unsub?.(); unsub = null
      if (raf) cancelAnimationFrame(raf)
      raf = null
      lastLms = null
      raised = false
      clearTarget()
      cursor.classList.remove('on')
    },
    destroy() {
      this.stop()
      cursor.remove()
      document.getElementById('pz-cursor-style')?.remove()
    },
  }
}
