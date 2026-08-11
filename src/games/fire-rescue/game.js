// 불 끄기 소방관 — **게임 규칙만.** 그리지 않고, 카메라를 모르고, DOM을 모른다.
//
// 화면(play.js)은 이 클래스에 시간과 걸음 수를 넣고, 나온 상태를 그린다.
// 그래야 규칙을 카메라 없이 테스트할 수 있다 — 감지기와 같은 방식이다.
//
// ── 왜 이 게임인가 ──────────────────────────────────────────
//
// 지금까지의 게임은 전부 **짧은 반응**이었다(피하기·포즈). 숨이 차는 구간이 없다.
// 이 게임은 반대로 **계속 달려야** 진행된다. 멈추면 불이 다시 커진다 —
// 그게 유산소의 정의고, 이 게임의 전부다. (docs/07)
//
// ── 4~8세를 위한 규칙 ───────────────────────────────────────
//
// **실패가 없다.** 불이 커져도 목숨이 줄지 않고 게임이 끝나지도 않는다.
// 느린 아이는 오래 걸릴 뿐이다. 이 나이대에 "졌다"를 만들면 다음에 안 온다.
// 대신 라운드마다 시간 상한을 둬서 하염없이 늘어지지 않게 한다.
//
// **라운드 사이에 반드시 쉰다.** docs/07의 안전 규칙 — 30초 달리고 숨 고르기.
// 쉬는 시간에는 아무것도 요구하지 않는다.

export const WATER_PER_STEP = 2      // 한 걸음이 붓는 물의 양

// 라운드 = 불난 집 하나. 물이 많이 필요할수록 오래 달린다.
//
// regen(초당 다시 커지는 양)이 이 게임의 심장이다.
//   0이면 → 천천히 걸어도 언젠가 꺼진다. 유산소가 아니다
//   너무 크면 → 아이가 아무리 달려도 안 꺼진다. 그건 좌절이다
// 분당 100걸음(4~8세가 가볍게 달리는 속도)이면 초당 3.3 물이다. regen을 그 절반 아래로 둔다.
export const ROUNDS = [
  { water: 50,  regen: 0.8, limitSec: 45, restSec: 12 },
  { water: 70,  regen: 1.2, limitSec: 55, restSec: 12 },
  { water: 90,  regen: 1.6, limitSec: 65, restSec: 0  },
]

export const PHASE = { RUN: 'run', REST: 'rest', DONE: 'done' }

export class FireRun {
  constructor(rounds = ROUNDS) {
    this.rounds = rounds
    this.reset()
  }

  reset() {
    this.round = 0
    this.phase = PHASE.RUN
    this.left = this.rounds[0].water   // 남은 불(= 더 부어야 할 물)
    this.phaseSec = 0                  // 지금 국면이 얼마나 지났나
    this.runSec = 0                    // 달린 시간 합계 (쉬는 시간은 빼고)
    this.steps = 0
    this.cleared = 0                   // 끈 불의 개수
    this.timedOut = 0                  // 시간 안에 못 끈 라운드 수 (벌은 없다)
    this.onRoundEnd = null             // (index, { cleared }) => void
    this.onFinish = null
  }

  get spec() { return this.rounds[Math.min(this.round, this.rounds.length - 1)] }
  get done() { return this.phase === PHASE.DONE }

  /** 남은 불의 비율 0~1. 화면의 불 크기가 이걸 쓴다. */
  get fireRatio() {
    return Math.max(0, Math.min(1, this.left / this.spec.water))
  }

  /** 쉬는 국면에서 남은 초 */
  get restLeft() {
    return this.phase === PHASE.REST ? Math.max(0, this.spec.restSec - this.phaseSec) : 0
  }

  /**
   * @param {number} dt     지난 시간(초)
   * @param {number} steps  이번 틱에 새로 세어진 걸음 수
   */
  update(dt, steps = 0) {
    if (this.done) return
    dt = Math.max(0, dt)
    this.phaseSec += dt

    if (this.phase === PHASE.REST) {
      // 쉬는 동안 걸음은 세어 준다 — 못 참고 뛰는 아이를 혼내지 않는다.
      // 다만 **운동 시간에는 넣지 않는다.** 쉬라고 한 시간이다.
      this.steps += steps
      if (this.phaseSec >= this.spec.restSec) this._nextRound()
      return
    }

    // ── 달리는 국면 ──
    this.runSec += dt
    this.steps += steps

    // 물을 붓고, 불은 다시 커진다. **멈추면 뒤로 간다** — 그게 이 게임의 전부다.
    this.left += this.spec.regen * dt - steps * WATER_PER_STEP
    // 처음 필요량보다 더 커지지는 않게. 뒤처진 아이에게 끝없는 벽을 세우지 않는다.
    this.left = Math.min(this.spec.water, this.left)

    if (this.left <= 0) {
      this.left = 0
      this.cleared++
      this._endRound(true)
      return
    }
    if (this.phaseSec >= this.spec.limitSec) {
      // **실패가 아니다.** 시간이 다 됐을 뿐이고, 다음 집으로 간다.
      this.timedOut++
      this._endRound(false)
    }
  }

  _endRound(cleared) {
    this.onRoundEnd?.(this.round, { cleared })
    const last = this.round >= this.rounds.length - 1
    if (last) {
      this.phase = PHASE.DONE
      this.onFinish?.(this.snapshot())
      return
    }
    if (this.spec.restSec > 0) {
      this.phase = PHASE.REST
      this.phaseSec = 0
      return
    }
    this._nextRound()
  }

  _nextRound() {
    this.round++
    this.phase = PHASE.RUN
    this.phaseSec = 0
    this.left = this.spec.water
  }

  /** 기록으로 넘길 값. **지표 이름은 운동 사전(progress/exercises.js) 그대로.** */
  snapshot() {
    return {
      high_knees: this.steps,
      active_sec: Math.round(this.runSec),
      cleared: this.cleared,
      rounds: this.rounds.length,
    }
  }
}

/**
 * 물줄기 세기 0~1 — 화면 연출용.
 *
 * 케이던스(분당 걸음)를 그대로 쓰면 숫자가 튄다. 아이가 잠깐 쉬어도 물이 뚝 끊기면
 * "고장 났나" 싶다. 60~160 사이를 부드럽게 편다.
 */
export function waterPower(cadence) {
  return Math.max(0, Math.min(1, (cadence - 40) / 120))
}

/** 응원 문구 — 숫자를 못 읽는 아이를 위한 것이라 숫자를 쓰지 않는다. */
export function cheer(fireRatio, power) {
  if (fireRatio <= 0.2) return '거의 다 껐어!'
  if (power >= 0.7)     return '물이 콸콸 나와!'
  if (power >= 0.3)     return '더 빨리 달려!'
  return '무릎을 높이 들어봐!'
}
