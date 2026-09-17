export const BODY_QUIZ_RESULT_FX_TIMEOUT_MS = 1400

/** animationend가 오지 않는 브라우저에서도 timeout으로 다음 문제를 보장한다. */
export function createBodyQuizResultFx({
  card,
  correct,
  onSound,
  onComplete,
  timeoutMs = BODY_QUIZ_RESULT_FX_TIMEOUT_MS,
} = {}) {
  if (!card) throw new Error('BODY QUIZ result card is required')
  const effectClass = correct ? 'correct' : 'wrong'
  const animationTarget = correct ? card : card.querySelector('.bq-answer-visual')
  if (!animationTarget) throw new Error('BODY QUIZ result animation target is required')

  let settled = false
  let timer = null
  const cleanup = () => {
    animationTarget.removeEventListener('animationend', onAnimationEnd)
    if (timer) clearTimeout(timer)
    timer = null
  }
  const finish = () => {
    if (settled) return
    settled = true
    cleanup()
    onComplete?.()
  }
  const onAnimationEnd = event => {
    if (event.target === animationTarget) finish()
  }

  card.classList.add(effectClass)
  onSound?.(correct)
  animationTarget.addEventListener('animationend', onAnimationEnd)
  timer = setTimeout(finish, timeoutMs)

  return {
    cancel() {
      if (settled) return
      settled = true
      cleanup()
    },
  }
}
