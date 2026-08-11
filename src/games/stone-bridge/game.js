// 돌다리 건너기 — **게임 규칙만.** 그리지 않고, 카메라를 모르고, DOM을 모른다.
//
// 한 발로 버티면 다음 돌이 나온다. 균형 하나만 파는 게임이다.
//
// ── 왜 이 게임인가 ──────────────────────────────────────────
//
// 균형은 모든 동작의 토대이고 넘어짐을 줄이는 가장 직접적인 능력인데,
// 우리 지표에는 균형이 하나도 없었다(docs/07). 불 끄기가 유산소를 메웠다면
// 이 게임은 균형을 메운다.
//
// ── 4~8세를 위한 규칙 ───────────────────────────────────────
//
// **양발을 번갈아 쓴다.** 돌마다 어느 발로 설지가 정해져 있다. 한쪽만 하면
// 그쪽만 늘고, 아이는 잘 되는 쪽만 하려 한다.
//
// **버티다 놓쳐도 0으로 돌아가지 않는다.** 발이 닿으면 게이지가 **천천히 줄 뿐이다.**
// 매번 처음부터면 이 나이대는 두 번째 돌에서 그만둔다.
//
// **실패가 없다.** 시간이 다 되면 다음 돌로 그냥 건너간다 — "도와줄게!"
// 못 버틴 것도 버틴 만큼은 기록에 남는다.
//
// 유지 시간은 **3초를 넘기지 않는다.** docs/07 안전 규칙 — 4~8세는 한 자세를 오래 못 버틴다.

export const DECAY = 0.5      // 발을 내렸을 때 게이지가 줄어드는 속도 (초당)

export const STONES = [
  { hold: 2.0, foot: 'left',  limitSec: 20 },
  { hold: 2.0, foot: 'right', limitSec: 20 },
  { hold: 2.5, foot: 'left',  limitSec: 25 },
  { hold: 2.5, foot: 'right', limitSec: 25 },
  { hold: 3.0, foot: 'any',   limitSec: 30 },   // 마지막은 편한 발로
]

export const PHASE = { CROSS: 'cross', DONE: 'done' }

export class BridgeRun {
  constructor(stones = STONES) {
    this.stones = stones
    this.reset()
  }

  reset() {
    this.index = 0
    this.phase = PHASE.CROSS
    this.held = 0            // 지금 돌에서 버틴 시간
    this.stoneSec = 0        // 지금 돌에 머문 시간 (버티든 말든)
    this.balanceSec = 0      // 실제로 한 발로 버틴 시간 합계 = 기록
    this.cleared = 0         // 스스로 건넌 돌
    this.helped = 0          // 시간이 다 돼서 건너뛴 돌 (벌은 없다)
    this.bestBySide = { left: 0, right: 0 }
    this.wrongFoot = false   // 지금 반대쪽 발을 들고 있나 (화면이 힌트를 준다)
    this.onStone = null      // (index, { cleared }) => void
    this.onFinish = null
  }

  get spec() { return this.stones[Math.min(this.index, this.stones.length - 1)] }
  get done() { return this.phase === PHASE.DONE }

  /** 지금 돌의 진행도 0~1 — 화면의 고리 게이지가 쓴다 */
  get progress() { return Math.max(0, Math.min(1, this.held / this.spec.hold)) }

  /** 이 돌에서 요구하는 발. 'any'면 아무 발이나 */
  get needFoot() { return this.spec.foot }

  /**
   * @param {number} dt
   * @param {'left'|'right'|null} lifted  지금 들려 있는 발
   */
  update(dt, lifted = null) {
    if (this.done) return
    dt = Math.max(0, dt)
    this.stoneSec += dt

    const need = this.spec.foot
    const ok = lifted && (need === 'any' || lifted === need)
    this.wrongFoot = !!lifted && !ok

    if (ok) {
      this.held += dt
      this.balanceSec += dt
      const side = lifted
      this.bestBySide[side] = Math.max(this.bestBySide[side] ?? 0, this.held)
    } else {
      // **0으로 되돌리지 않는다.** 천천히 줄 뿐이다.
      this.held = Math.max(0, this.held - dt * DECAY)
    }

    if (this.held >= this.spec.hold) { this.cleared++; this._next(true); return }
    if (this.stoneSec >= this.spec.limitSec) { this.helped++; this._next(false) }
  }

  _next(cleared) {
    this.onStone?.(this.index, { cleared })
    if (this.index >= this.stones.length - 1) {
      this.phase = PHASE.DONE
      this.onFinish?.(this.snapshot())
      return
    }
    this.index++
    this.held = 0
    this.stoneSec = 0
    this.wrongFoot = false
  }

  /** 기록으로 넘길 값. **지표 이름은 운동 사전(progress/exercises.js) 그대로.** */
  snapshot() {
    return {
      balance_sec: Math.round(this.balanceSec),
      active_sec: Math.round(this.balanceSec),   // 버틴 시간이 곧 몸을 쓴 시간이다
      cleared: this.cleared,
      stones: this.stones.length,
    }
  }
}

/** 응원 문구 — 숫자를 못 읽는 아이를 위한 것이라 숫자를 쓰지 않는다. */
export function cheer({ wrongFoot, needFoot, progress, lifted }) {
  if (wrongFoot) return needFoot === 'left' ? '왼발을 들어야 해!' : '오른발을 들어야 해!'
  if (progress >= 0.7) return '조금만 더 버텨!'
  if (lifted) return '좋아, 그대로!'
  if (needFoot === 'any') return '한 발을 들어봐'
  return needFoot === 'left' ? '왼발을 들어봐' : '오른발을 들어봐'
}
