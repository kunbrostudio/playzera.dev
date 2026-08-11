// 운동량 → 레벨.
//
// **점수로 올리지 않는다.** 점수로 올리면 아이는 점수를 잘 내는 법을 찾고,
// 그건 대체로 "덜 움직이는 법"이다. 실제로 똥 피하기의 dodgeCount는 가만히 서 있어도 오른다.
// 연료는 몸을 움직여야만 오르는 값들뿐이다.

// 각 동작 1회(또는 1초)가 몇 EXP인가.
//
// 기준은 **활동 1초 = 1**이다. 나머지는 그 한 번이 몇 초짜리 운동인지로 잡았다.
//   점프·앉기 — 순간적으로 힘이 크게 든다 → 2초어치
//   좌우·달리기 한 걸음 → 1초어치
//   균형 1초  — 버티는 건 서 있는 것보다 힘들다 → 2초어치
//   포즈 유지 — 3초를 버텨야 1회다 → 5초어치
//
// **값의 정본은 `progress/exercises.js`다.** 동작을 추가할 때 고칠 곳을 하나로 둔다 —
// 여기에도 적어두면 반드시 어긋난다(EXP는 오르는데 화면에는 안 나오는 상태).
//
// ⚠️ 현장 데이터로 다듬을 값이다. 지금은 실제 기록에서 역산한 어림이다.
export { EXP_WEIGHTS } from './exercises.js'
import { EXP_WEIGHTS } from './exercises.js'

export function expFrom(totals = {}) {
  let sum = 0
  for (const [k, w] of Object.entries(EXP_WEIGHTS)) sum += (totals[k] ?? 0) * w
  return Math.round(sum)
}

// 레벨 n → n레벨이 되는 데 필요한 **누적** EXP.
//
// 첫 레벨을 300으로 잡은 근거 — 실제 기록 기준으로 한 판이 100~200 EXP다.
//   웜업 모션 1판  ≈ 50초 + 점프 6 + 앉기 4 + 좌우 7  ≈ 77
//   똥 피하기 1판  ≈ 150초 + 좌우 40                  ≈ 190
// 하루 두세 판이면 이틀 안에 300을 넘는다 = **부화까지 하루 이틀.**
// 첫 보상이 멀면 그전에 그만둔다.
//
// 이후로는 완만하게 늘린다. 급하게 올리면 금방 "안 오르네"가 된다.
const BASE = 300
const GROWTH = 1.35

// 무한히 오르게 두면 게이지가 의미를 잃는다. 상한은 나중에 조정한다.
export const MAX_LEVEL = 50

export function expForLevel(level) {
  if (level <= 0) return 0
  let sum = 0
  for (let i = 0; i < level; i++) sum += Math.round(BASE * Math.pow(GROWTH, i))
  return sum
}

/**
 * 누적 EXP → 레벨 상태.
 *
 * @returns {{level:number, exp:number, inLevel:number, need:number, ratio:number}}
 *   level   현재 레벨 (0 = 아직 알)
 *   inLevel 이번 레벨에서 모은 EXP
 *   need    다음 레벨까지 필요한 총량
 *   ratio   0~1 게이지
 */
export function levelFromExp(exp) {
  const e = Math.max(0, Math.round(exp || 0))
  let level = 0
  while (expForLevel(level + 1) <= e && level < MAX_LEVEL) level++
  const floor = expForLevel(level)
  const need  = expForLevel(level + 1) - floor
  const inLevel = e - floor
  return {
    level,
    exp: e,
    inLevel,
    need,
    ratio: need > 0 ? Math.min(1, inLevel / need) : 1,
  }
}

export const levelFromTotals = totals => levelFromExp(expFrom(totals))

// 게이지 옆에 붙는 말. **숫자를 못 읽는 아이를 위한 것**이라 숫자를 쓰지 않는다.
export function levelHint(ratio) {
  if (ratio >= 0.9) return '거의 다 왔어!'
  if (ratio >= 0.6) return '조금만 더!'
  if (ratio >= 0.3) return '잘하고 있어!'
  return '오늘도 놀아볼까?'
}
