// arcade2d 이동 패턴 — 풍선 팡팡·비눗방울 팡팡이 같이 쓰는 순수 함수.
//
// ── 좌표계 ───────────────────────────────────────────────────
//
// 전부 정규화 좌표다: x는 화면 폭 기준 0(왼쪽)~1(오른쪽), y는 화면 높이
// 기준 0(위)~1(아래). 실제 픽셀 변환은 DOM 레이어(`arcade2d/index.js`)의
// 몫이다 — 여기는 카메라도 화면도 모른다(`game.js`가 DOM을 모르는 것과
// 같은 이유, `CLAUDE.md` 게임팩 규격).
//
// `r`(반지름)도 정규화 값이다. 화면 세로/가로 비율이 기기마다 달라서
// DOM 레이어가 실제 픽셀로 바꿀 때 기준 변을 정한다(보통 짧은 변).
//
// ── 두 게임이 패턴을 다르게 쓴다 ─────────────────────────────
//
// 풍선(Balloon)은 화면 안에 계속 떠 있다가 잡히거나 터져야 하는
// 목표물이라 **가장자리에서 튕긴다**(`bounceEdges`) — 화면 밖으로
// 나가 버리면 기획서의 "화면 밖으로 나가도 점수 차감 없음, 새 풍선
// 생성" 문장과 어긋나게 자주 사라진다.
//
// 비눗방울(Bubble)은 "천천히 떠오르다 사라지는" 것 자체가 연출이라
// **위로 떠오르며 화면 밖으로 나가면 그걸로 끝**이다(`floatAway`) —
// 스프라이트 필드가 사라진 자리에 새 것을 스폰한다.
//
// ── 풍선 CHASE POP의 회피(flee) ──────────────────────────────
//
// 기획서 Part2 STAGE3 "손이 가까워지면 살짝 방향 전환 — 과도하게
// 회피하지 않음"을 그대로 옮겼다. 손 근처에서만 반발력을 살짝 얹고,
// 늘 최대 속도로 정규화해서 방향만 바뀌게 한다 — 세게 밀면 도망 게임이
// 되어 "빠르게 터뜨리는" 아케이드 감각을 해친다.

/** 이동 패턴 이름 — 게임의 스테이지 설정이 이 문자열로 고른다. */
export const PATTERN = {
  DRIFT: 'drift',   // 바람 타듯 한쪽으로 등속 이동 (풍선 기본)
  FLEE: 'flee',     // drift + 손이 가까우면 살짝 방향 전환 (풍선 CHASE POP)
  FLOAT: 'float',   // 천천히 상승 (비눗방울 기본)
  SWAY: 'sway',     // 상승 + 좌우 흔들림
  CURVE: 'curve',   // 상승 + 완만한 곡선
}

/**
 * 스프라이트 하나를 만든다. `vx`/`vy`는 초당 이동량(정규화 좌표 기준).
 * `phase`는 sway/curve가 sin 곡선의 시작점을 흩뜨리는 데 쓴다 — 없으면
 * 같은 패턴의 여러 스프라이트가 전부 같은 박자로 흔들린다
 * (`CLAUDE.md`: "박자가 일정하면 흩어져도 기계적이다").
 */
export function makeSprite({
  id, kind, x, y, r = 0.05,
  pattern = PATTERN.DRIFT,
  vx = 0, vy = 0,
  speed = 0.12,
  phase = Math.random() * Math.PI * 2,
  points = 10,
}) {
  return { id, kind, x, y, r, pattern, vx, vy, speed, phase, points, age: 0, popped: false, gone: false }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

/** 가장자리에서 튕긴다 — 풍선류가 쓴다. */
function bounceEdges(s) {
  if (s.x - s.r < 0) { s.x = s.r; s.vx = Math.abs(s.vx) }
  else if (s.x + s.r > 1) { s.x = 1 - s.r; s.vx = -Math.abs(s.vx) }
  if (s.y - s.r < 0) { s.y = s.r; s.vy = Math.abs(s.vy) }
  else if (s.y + s.r > 1) { s.y = 1 - s.r; s.vy = -Math.abs(s.vy) }
}

/** 위쪽(또는 아무 방향)으로 화면 밖까지 나가면 끝 — 비눗방울류가 쓴다. */
function floatAway(s) {
  const pad = s.r * 2
  if (s.y + pad < 0 || s.x + pad < 0 || s.x - pad > 1) s.gone = true
}

/**
 * 손이 가까이 있으면 그 반대 방향으로 살짝 미는 벡터를 얹는다.
 * `fleeRadius`(정규화 거리) 밖이면 아무 효과가 없다.
 */
function applyFlee(s, hands, { fleeRadius = 0.16, fleeStrength = 0.55 } = {}) {
  if (!hands || !hands.length) return
  let px = 0, py = 0
  for (const h of hands) {
    if (!h) continue
    const dx = s.x - h.x, dy = s.y - h.y
    const dist = Math.hypot(dx, dy)
    if (dist > 0 && dist < fleeRadius) {
      const w = (1 - dist / fleeRadius)
      px += (dx / dist) * w
      py += (dy / dist) * w
    }
  }
  if (px === 0 && py === 0) return
  s.vx += px * fleeStrength * s.speed
  s.vy += py * fleeStrength * s.speed
  // 최대 속도로 다시 정규화 — 세게 밀리는 대신 방향만 바뀐다.
  const v = Math.hypot(s.vx, s.vy)
  if (v > s.speed) { s.vx = (s.vx / v) * s.speed; s.vy = (s.vy / v) * s.speed }
}

/**
 * 스프라이트 하나를 `dt`초 진행시킨다.
 *
 * @param {object} s makeSprite()로 만든 스프라이트 (in-place 수정)
 * @param {number} dt 초
 * @param {{ hands?: Array<{x:number,y:number}|null> }} [ctx]
 */
export function stepSprite(s, dt, ctx = {}) {
  if (s.popped || s.gone) return s
  s.age += dt

  switch (s.pattern) {
    case PATTERN.FLEE:
      applyFlee(s, ctx.hands)
      s.x += s.vx * dt
      s.y += s.vy * dt
      bounceEdges(s)
      break

    case PATTERN.DRIFT:
      s.x += s.vx * dt
      s.y += s.vy * dt
      bounceEdges(s)
      break

    case PATTERN.FLOAT:
      s.y -= s.speed * dt
      s.x += s.vx * dt
      floatAway(s)
      break

    case PATTERN.SWAY: {
      s.y -= s.speed * dt
      const swayAmp = 0.10, swayFreq = 1.1
      s.x = clamp(s.x + Math.sin((s.age * swayFreq) + s.phase) * swayAmp * dt * 6, 0, 1)
      floatAway(s)
      break
    }

    case PATTERN.CURVE: {
      s.y -= s.speed * dt
      const curveFreq = 0.6
      s.x += Math.sin((s.age * curveFreq) + s.phase) * s.speed * 0.5 * dt
      floatAway(s)
      break
    }

    default:
      s.x += s.vx * dt
      s.y += s.vy * dt
  }
  return s
}
