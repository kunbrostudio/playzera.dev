import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  BODY_QUIZ_RESULT_FX_TIMEOUT_MS,
  createBodyQuizResultFx,
} from '../src/games/body-quiz/resultFx.js'

afterEach(() => vi.useRealTimers())

function card() {
  const element = document.createElement('article')
  element.innerHTML = '<div class="bq-answer-visual"></div>'
  return element
}

describe('BODY QUIZ 정답 결과 효과', () => {
  it('정답은 카드 animationend 뒤 한 번만 완료한다', () => {
    vi.useFakeTimers()
    const element = card()
    const onComplete = vi.fn()
    const onSound = vi.fn()
    createBodyQuizResultFx({ card: element, correct: true, onComplete, onSound })

    expect(element.classList.contains('correct')).toBe(true)
    expect(onSound).toHaveBeenCalledWith(true)
    element.dispatchEvent(new Event('animationend'))
    vi.advanceTimersByTime(BODY_QUIZ_RESULT_FX_TIMEOUT_MS)
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('오답은 visual shake animationend를 기다린다', () => {
    const element = card()
    const onComplete = vi.fn()
    createBodyQuizResultFx({ card: element, correct: false, onComplete })
    expect(element.classList.contains('wrong')).toBe(true)
    element.querySelector('.bq-answer-visual').dispatchEvent(new Event('animationend'))
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it('animationend가 없어도 timeout으로 진행한다', () => {
    vi.useFakeTimers()
    const onComplete = vi.fn()
    createBodyQuizResultFx({ card: card(), correct: true, onComplete, timeoutMs: 900 })
    vi.advanceTimersByTime(899)
    expect(onComplete).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(onComplete).toHaveBeenCalledOnce()
  })
})
