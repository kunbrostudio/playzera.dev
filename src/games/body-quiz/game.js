// 바디 퀴즈 — **게임 상태 머신만.** 그리지 않고, 카메라를 모르고, DOM을 모른다.
//
// ── 왜 액션이 이렇게 갈라져 있나 ──────────────────────────────
//
// 키보드와 실제 pose/3-zone 감지기는 모두 이 상태 머신에 완성된 입력만 전달한다.
// 입력 장치가 달라져도 규칙을 다시 쓰지 않도록, 입력 수단을 모르는 액션만 밖에 연다 —
// `registerSquat()` · `selectAnswer(side)`. 둘 다 "무엇이 이걸 불렀나"를
// 모른다. 다음 단계는 이 파일이 아니라 play.js의 입력 배선만 바뀐다.
//
// ── 상태 머신 ────────────────────────────────────────────────
//
//   QUESTION_READY   문제가 뜨고 아직 한 번도 안 움직인 상태. MOVE LOCK.
//   EXERCISE_ACTIVE  스쿼트 진행 중(1~4/5). 여전히 MOVE LOCK.
//   MOVE_UNLOCKED    5/5 완료 — moveEnergy 100. 좌우 선택이 열린다.
//   ANSWER_HOLD      한쪽을 골랐다 — **곧장 확정하지 않는다.** 다음 단계의
//                    3-zone 판정은 그 칸에 "서 있어야" 하는 절대 위치라,
//                    스치듯 지나가도 답이 되면 안 된다(zoneDetector가 이미
//                    겪은 문제와 같은 이유 — 경계에서 히스테리시스 없이
//                    자르면 떨림이 그대로 답으로 샌다). `holdSec` 동안
//                    같은 쪽을 유지해야 확정된다.
//   ANSWER_RESULT    확정 — 정오답이 나온다.
//
// **캘리브레이션을 하지 않는다**(moves.js·zoneDetector.js와 같은 원칙) —
// 그래서 "3초간 가만히 서 있으세요" 같은 준비 단계가 없다. 문제가 뜨자마자
// 스쿼트를 받을 준비가 되어 있다.

export const PHASE = {
  QUESTION_READY: 'question_ready',
  EXERCISE_ACTIVE: 'exercise_active',
  MOVE_UNLOCKED: 'move_unlocked',
  ANSWER_HOLD: 'answer_hold',
  ANSWER_RESULT: 'answer_result',
}

// 좌우 확정까지 같은 쪽을 유지해야 하는 시간(초). 실기기 QA의 시작값이며,
// 다음 라운드에서 1~1.5초로 조정할 때 이 값만 바꾼다.
export const HOLD_SEC = 3

/** 3초 유지 시간을 UI의 3 → 2 → 1 정수 표시로 바꾼다. */
export function getAnswerHoldCountdown(holdSec, holdElapsed) {
  return Math.max(1, Math.ceil(Math.max(0, holdSec - holdElapsed)))
}

export class BodyQuizRun {
  /**
   * @param {object} question  questions.js의 항목 하나
   * @param {object} [opts]
   * @param {number} [opts.targetSquats]  question.exercise.targetReps을 덮어쓸 때만(테스트용)
   * @param {number} [opts.holdSec]       HOLD_SEC을 덮어쓸 때만(테스트용)
   * @param {boolean} [opts.requireNeutral] 다음 문제 시작 시 중앙 복귀를 먼저 요구
   */
  constructor(question, opts = {}) {
    this.question = question
    this.targetSquats = opts.targetSquats ?? question.exercise.targetReps
    this.holdSec = opts.holdSec ?? HOLD_SEC
    this.requireNeutral = opts.requireNeutral ?? false
    this.reset()
  }

  reset() {
    this.phase = PHASE.QUESTION_READY
    this.squatCount = 0
    this.moveEnergy = 0        // 0~100
    this.selectedSide = null   // 'left' | 'right' | null
    this.holdElapsed = 0
    this.correct = null        // true | false | null
    this.activeSec = 0
    this.neutralConfirmed = !this.requireNeutral
  }

  /** 아직 좌우를 못 고르는 상태인가 — 화면의 MOVE LOCK 표시가 이걸 쓴다. */
  get locked() {
    return this.phase === PHASE.QUESTION_READY || this.phase === PHASE.EXERCISE_ACTIVE
  }

  get done() { return this.phase === PHASE.ANSWER_RESULT }
  get needsNeutral() { return !this.neutralConfirmed }

  /** 다음 문제에서 중앙 zone을 실제로 확인하기 전 연속 선택을 막는다. */
  confirmNeutral() { this.neutralConfirmed = true }

  /**
   * 스쿼트 1회 완성. 감지기든 키보드든 "1회가 끝났다"고만 알려주면 된다 —
   * **몇 번째인지, 잠겼는지는 여기서 판단한다.** 잠금 해제 이후나 결과가
   * 나온 뒤에는 조용히 무시한다.
   */
  registerSquat() {
    if (this.phase !== PHASE.QUESTION_READY && this.phase !== PHASE.EXERCISE_ACTIVE) return
    if (this.phase === PHASE.QUESTION_READY) this.phase = PHASE.EXERCISE_ACTIVE

    this.squatCount = Math.min(this.targetSquats, this.squatCount + 1)
    this.moveEnergy = Math.round((this.squatCount / this.targetSquats) * 100)

    if (this.squatCount >= this.targetSquats) this.phase = PHASE.MOVE_UNLOCKED
  }

  /**
   * 좌/우를 고른다. **잠긴 동안은 조용히 무시한다** — 부르는 쪽(play.js)이
   * 매번 `locked`를 검사할 필요가 없다.
   */
  selectAnswer(side) {
    if (this.needsNeutral) return
    if (this.phase !== PHASE.MOVE_UNLOCKED && this.phase !== PHASE.ANSWER_HOLD) return
    if (this.selectedSide !== side) {
      // 고르던 쪽을 바꾸면 유지 시간을 처음부터 다시 잰다 — 반쯤 넘어갔다가
      // 마음을 바꾼 것까지 이어 붙이면 안 된다.
      this.selectedSide = side
      this.holdElapsed = 0
    }
    this.phase = PHASE.ANSWER_HOLD
  }

  /**
   * 고르던 자리를 벗어났다(다음 단계 3-zone에서 가운데로 돌아오는 것에
   * 대응). 확정 전이면 다시 선택 가능한 상태로 돌아간다.
   */
  clearSelection() {
    if (this.phase !== PHASE.ANSWER_HOLD) return
    this.phase = PHASE.MOVE_UNLOCKED
    this.selectedSide = null
    this.holdElapsed = 0
  }

  /**
   * 시간을 흘린다(초). 유지 시간이 다 차면 정오답을 확정한다.
   * 시간은 밖에서 받는다 — 안에서 `performance.now()`를 읽으면 합성
   * 프레임으로 테스트할 수 없다(프로젝트 공통 규칙).
   */
  update(dt, { selectionActive = true } = {}) {
    if (this.phase !== PHASE.QUESTION_READY && !this.done) this.activeSec += dt

    if (this.phase !== PHASE.ANSWER_HOLD) return
    if (!selectionActive) {
      this.clearSelection()
      return
    }
    this.holdElapsed += dt
    if (this.holdElapsed >= this.holdSec) {
      this.correct = this.selectedSide === this.question.correctSide
      this.phase = PHASE.ANSWER_RESULT
    }
  }

  /** 기록으로 넘길 값. 지표 이름은 운동 사전(progress/exercises.js) 그대로. */
  snapshot() {
    return {
      squats: this.squatCount,
      active_sec: Math.round(this.activeSec),
      correct: this.correct,
    }
  }
}
