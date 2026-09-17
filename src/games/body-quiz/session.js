import { SIDE } from './questions.js'

export const BODY_QUIZ_SESSION_LIMIT = 10

/**
 * Fisher-Yates 셔플. 원본 배열은 건드리지 않는다.
 * random을 밖에서 받는 이유는 이후 category sampler와 테스트가 같은 계약을
 * 재사용할 수 있게 하기 위해서다.
 */
export function shuffleBodyQuizQuestions(questions, random = Math.random) {
  const shuffled = [...questions]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    const current = shuffled[i]
    shuffled[i] = shuffled[j]
    shuffled[j] = current
  }
  return shuffled
}

/** 답 위치만 복제해서 바꾼다. questions.js의 원본 데이터는 절대 수정하지 않는다. */
export function randomizeBodyQuizAnswerSides(question, random = Math.random) {
  const swap = random() < 0.5
  const left = swap ? question.right : question.left
  const right = swap ? question.left : question.right

  return {
    ...question,
    left: { ...left },
    right: { ...right },
    exercise: { ...question.exercise },
    correctSide: swap
      ? (question.correctSide === SIDE.LEFT ? SIDE.RIGHT : SIDE.LEFT)
      : question.correctSide,
  }
}

/** 원본을 바꾸지 않고 정답을 요청한 쪽에 놓는다. */
export function placeBodyQuizCorrectSide(question, side) {
  const swap = question.correctSide !== side
  return {
    ...question,
    left: { ...(swap ? question.right : question.left) },
    right: { ...(swap ? question.left : question.right) },
    exercise: { ...question.exercise },
    correctSide: side,
  }
}

/** 한 세션의 LEFT/RIGHT 정답 수 차이를 최대 1로 제한하고 순서는 섞는다. */
export function createBalancedAnswerSides(count, random = Math.random) {
  const leftCount = Math.floor(count / 2) + (count % 2 && random() < 0.5 ? 1 : 0)
  const sides = Array.from({ length: count }, (_, index) => (
    index < leftCount ? SIDE.LEFT : SIDE.RIGHT
  ))
  return shuffleBodyQuizQuestions(sides, random)
}

/**
 * 한 판에 쓸 문제 목록. 현재 데이터가 10개보다 적으면 있는 만큼만 쓰고,
 * 늘어나면 최대 10개를 고른다. 다음에는 이 함수 안의 selection 단계만
 * category-balanced sampler로 교체하면 된다.
 */
export function createBodyQuizSession(
  questions,
  { limit = BODY_QUIZ_SESSION_LIMIT, random = Math.random } = {},
) {
  const count = Math.min(Math.max(0, limit), questions.length)
  const selected = shuffleBodyQuizQuestions(questions, random).slice(0, count)
  const answerSides = createBalancedAnswerSides(count, random)
  return {
    questions: selected.map((question, index) => (
      placeBodyQuizCorrectSide(question, answerSides[index])
    )),
    timings: [],
  }
}

/** 표시하지 않는 분석용 시간 상태. 현재는 메모리에만 두고 전송하지 않는다. */
export function createBodyQuizQuestionTiming(questionId, now = performance.now()) {
  return {
    questionId,
    questionStartedAt: now,
    exerciseCompletedAt: null,
    answerSelectedAt: null,
    questionDuration: null,
  }
}

export function markBodyQuizExerciseCompleted(timing, now = performance.now()) {
  if (timing.exerciseCompletedAt == null) timing.exerciseCompletedAt = now
  return timing
}

export function markBodyQuizAnswerSelected(timing, now = performance.now()) {
  if (timing.answerSelectedAt == null) {
    timing.answerSelectedAt = now
    timing.questionDuration = Math.max(0, now - timing.questionStartedAt)
  }
  return timing
}
