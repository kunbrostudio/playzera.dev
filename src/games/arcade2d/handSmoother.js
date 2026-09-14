// arcade2d 손 좌표 예측 필터 — 뜨문뜨문 오는 실측 좌표 사이를 속도로 메운다.
//
// ── 왜 지수평활(lerp)만으로는 부족한가 ★ ─────────────────────
//
// 이전 라운드(STEP 76 후속 2·3)는 `smooth += (target - smooth) * k`
// 하나로 다 풀려 했다. 문제는 지수평활이 **항상 "지금 아는 목표"를
// 뒤에서 쫓아가기만** 한다는 점이다 — 손이 계속 움직이는 동안엔 실제
// 손보다 늘 뒤처진다. 게다가 `handTracker.js`가 흘려주는 `target`은
// 포즈 추론(화면 갱신보다 느리다)이 새 값을 낼 때만 바뀌고, 그 사이엔
// **똑같은 값을 계속 들고 있는다** — 그런데 지수평활은 매 프레임 그
// 값을 "새 목표"인 것처럼 다시 계산해서, 값이 하나도 안 바뀐 몇 프레임
// 동안은 그 자리에 붙박였다가, 실제로 값이 바뀌는 순간(다음 추론
// 결과) 한 번에 큰 폭으로 움직인다 — "부드러워지긴 했는데 여전히
// 끊긴다"는 재확인들이 이 모양과 일치한다.
//
// 이 모듈은 **위치 + 속도**를 같이 추정한다(alpha-beta 필터의 단순화판,
// 로켓·레이더 추적에 쓰이는 표준 기법). 진짜 새 좌표가 들어올 때만
// (`fresh` 플래그, `handTracker.js`의 `hands.seq`로 판별) 위치·속도를
// 보정하고, 그 사이 프레임에는 마지막으로 추정한 속도로 **미리
// 나간다(extrapolate)** — 실제 손이 계속 같은 방향으로 움직이는
// 중이면 새 정보가 없는 동안에도 화면은 계속 그 방향으로 흐른다.
// 손이 멈추거나 화면을 벗어나면(`fresh`가 계속 안 온다) 속도를
// 서서히 줄여(관성 감쇠) 미끄러지다 멈춘다 — 잃어버린 방향으로
// 끝없이 미끄러지지 않는다.
//
// `fresh` 판별이 핵심이다 — 화면 레이어(`ui/playScreen.js`)가 매 rAF
// 프레임마다 `mapHandPoint()`로 좌표를 **새로 계산**하기 때문에, 값
// 자체(객체 참조)만 보고는 "진짜 새 감지인지 그냥 같은 값을 다시 계산한
// 것인지" 구별이 안 된다. 그래서 `handTracker.js`의 `hands.seq`(실제
// 감지가 있을 때만 오르는 카운터)를 넘겨받아 판별한다.
//
// 시간상수는 전부 어림값이다(다른 튜닝값들처럼 실기기에서 다시 잴 값) —
// 다만 "예측+감쇠"라는 **구조** 자체는 지수평활보다 원리적으로 낫다:
// 뒤에서만 쫓지 않고 방향을 미리 반영한다.

// ── 손을 놓으면 **없어져야 한다** ★ ─────────────────────────
//
// 처음 판에는 이 문턱이 없었다. 한 번 상태가 생긴 손은 실측이 끊겨도
// 계속 마지막 자리를 내줬고(`state[side]`는 다시 null이 되지 않았다),
// 화면은 그걸 "손이 아직 거기 있다"로 알고 트래커를 계속 그렸다.
//
// ken이 5차에서 본 트래커 두 개 중 하나가 이것이었다 — 쓰지 않는 손의
// 트래커가 옛 자리에 **얼어붙어** 남아 있었다. 지어낸 손목(handTracker의
// 문제)과 원인이 다른데 증상이 같아서, 한쪽만 고쳐서는 안 없어진다.
//
// 그래서 실측이 이만큼 끊기면 그 손의 상태를 버리고 null을 낸다.
// 감쇠(velDecayTau)로 속도만 줄이는 것과는 다른 문제다 — 그건 "미끄러져
// 나가지 않게" 하는 것이고, 이건 "없는 손을 그리지 않게" 하는 것이다.
const LOST_SEC = 0.5     // 이만큼 새 좌표가 없으면 그 손은 없는 것으로 본다

const POS_TAU = 0.05     // 새 좌표가 오면 그 쪽으로 얼마나 빨리 붙는가
const VEL_TAU = 0.10     // 속도 추정을 얼마나 빨리 갱신하는가(너무 빠르면 튐, 느리면 둔함)
const VEL_DECAY_TAU = 0.15   // 새 좌표가 없을 때 속도를 줄이는 빠르기(관성 감쇠)

/**
 * @param {object} [opts]
 * @param {number} [opts.posTau] 위치 보정 시간상수(초)
 * @param {number} [opts.velTau] 속도 보정 시간상수(초)
 * @param {number} [opts.velDecayTau] 미검출 시 속도 감쇠 시간상수(초)
 * @param {number} [opts.lostSec] 이만큼 실측이 없으면 그 손을 버린다(초)
 * @param {string[]} [opts.keys] 따라갈 손 키 — 기본은 `left`/`right`(SOLO·다른
 *   게임 그대로). 풍선 팡팡 DUO는 플레이어별 포인터 `p1`/`p2`를 넘긴다(STEP 105).
 */
export function makeHandSmoother({
  posTau = POS_TAU, velTau = VEL_TAU, velDecayTau = VEL_DECAY_TAU, lostSec = LOST_SEC,
  keys = ['left', 'right'],
} = {}) {
  const state = Object.fromEntries(keys.map(k => [k, null]))

  /**
   * 한 프레임 진행.
   *
   * @param {{left?:{x,y}|null, right?:{x,y}|null}} target 이번 프레임의 손 좌표
   *   (`handTracker.js`가 마지막으로 낸 값 — 새 감지가 없으면 이전과 같은 값)
   * @param {number} dt 초 (이번 rAF 프레임 간격)
   * @param {boolean} fresh 이번 프레임에 **진짜 새로운** 감지가 있었는지
   *   (`hands.seq`가 지난 프레임과 다른지로 판별해서 넘긴다)
   * @returns {{left:{x,y}|null, right:{x,y}|null}} 화면·판정에 쓸 좌표
   */
  function step(target = {}, dt = 0, fresh = true) {
    for (const side of keys) {
      const t = target[side]
      let s = state[side]

      if (!s) {
        if (!t) continue   // 한 번도 안 보였다 — 계속 null
        state[side] = { x: t.x, y: t.y, vx: 0, vy: 0, sinceFresh: 0 }
        continue
      }

      s.sinceFresh += dt

      // 0) 너무 오래 실측이 없으면 그 손을 버린다 — 안 버리면 트래커가
      //    옛 자리에 얼어붙은 채 남는다(위 §손을 놓으면 없어져야 한다).
      if (s.sinceFresh >= lostSec) {
        state[side] = null
        continue
      }

      // 1) 예측 — 마지막으로 추정한 속도로 먼저 나간다
      s.x += s.vx * dt
      s.y += s.vy * dt

      if (fresh && t) {
        // 2) 진짜 새 좌표가 왔다 — 그 자리로 위치·속도를 보정한다.
        // `gap`(마지막 보정 이후 실제로 흐른 시간)으로 나눠야 진짜
        // 속도가 나온다 — 이번 틱의 dt로 나누면 추론이 뜸한 만큼
        // 속도가 몇 배로 부풀려진다.
        const gap = s.sinceFresh > 0 ? s.sinceFresh : dt || 1e-3
        const kPos = 1 - Math.exp(-gap / posTau)
        const ex = t.x - s.x, ey = t.y - s.y
        s.x += ex * kPos
        s.y += ey * kPos
        const kVel = 1 - Math.exp(-gap / velTau)
        s.vx += (ex / gap - s.vx) * kVel
        s.vy += (ey / gap - s.vy) * kVel
        s.sinceFresh = 0
      } else if (dt > 0) {
        // 3) 새 정보가 없다(옛 값이 그대로거나 손이 안 보인다) — 관성을
        // 서서히 줄인다. 안 줄이면 마지막 방향으로 끝없이 미끄러진다.
        const kDecay = 1 - Math.exp(-dt / velDecayTau)
        s.vx -= s.vx * kDecay
        s.vy -= s.vy * kDecay
      }
    }
    return state
  }

  return { step }
}
