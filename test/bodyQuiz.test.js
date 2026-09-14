// 바디 퀴즈 — 게임 상태 머신만 검증한다. 카메라도 DOM도 없다.
//
// 이번 단계의 존재 이유는 **입력 수단과 상관없는 상태 전이**다.
// registerSquat()·selectAnswer()가 키보드에서 오든 나중에 포즈에서
// 오든 game.js는 몰라야 한다 — 그래서 여기 테스트도 순수 함수 호출로만
// 상태를 흔든다.

import { describe, it, expect } from 'vitest'
import { BodyQuizRun, PHASE } from '../src/games/body-quiz/game.js'
import { QUESTIONS } from '../src/games/body-quiz/questions.js'
import { getExercise } from '../src/progress/exercises.js'
import { GAME_REGISTRY, getBackTo, getPlayRoute } from '../src/games/registry.js'

const question = QUESTIONS[0]

describe('바디 퀴즈 — 초기 상태는 MOVE LOCK', () => {
  it('문제가 뜨자마자 잠겨 있다', () => {
    const g = new BodyQuizRun(question)
    expect(g.phase).toBe(PHASE.QUESTION_READY)
    expect(g.locked).toBe(true)
    expect(g.squatCount).toBe(0)
    expect(g.moveEnergy).toBe(0)
  })

  it('잠긴 동안 좌우 선택은 조용히 무시된다', () => {
    const g = new BodyQuizRun(question)
    g.selectAnswer('left')
    expect(g.phase).toBe(PHASE.QUESTION_READY)
    expect(g.selectedSide).toBeNull()
  })
})

describe('스쿼트 → MOVE ENERGY', () => {
  it('첫 스쿼트에서 EXERCISE_ACTIVE로 넘어간다', () => {
    const g = new BodyQuizRun(question)
    g.registerSquat()
    expect(g.phase).toBe(PHASE.EXERCISE_ACTIVE)
    expect(g.squatCount).toBe(1)
    expect(g.locked).toBe(true)
  })

  it('스쿼트 횟수에 비례해 에너지가 오른다', () => {
    const g = new BodyQuizRun(question)
    g.registerSquat()
    g.registerSquat()
    expect(g.squatCount).toBe(2)
    expect(g.moveEnergy).toBe(40)   // 2/5
  })

  it('5회를 채우면 MOVE_UNLOCKED, 에너지는 100', () => {
    const g = new BodyQuizRun(question)
    for (let i = 0; i < 5; i++) g.registerSquat()
    expect(g.phase).toBe(PHASE.MOVE_UNLOCKED)
    expect(g.moveEnergy).toBe(100)
    expect(g.locked).toBe(false)
  })

  it('목표 횟수를 넘겨 눌러도 더 안 오른다', () => {
    const g = new BodyQuizRun(question)
    for (let i = 0; i < 8; i++) g.registerSquat()
    expect(g.squatCount).toBe(5)
    expect(g.moveEnergy).toBe(100)
  })
})

describe('좌우 선택 — 유지해야 확정된다(ANSWER_HOLD)', () => {
  function unlocked() {
    const g = new BodyQuizRun(question, { holdSec: 1 })
    for (let i = 0; i < 5; i++) g.registerSquat()
    return g
  }

  it('선택하면 곧장 확정되지 않고 ANSWER_HOLD로 간다', () => {
    const g = unlocked()
    g.selectAnswer('left')
    expect(g.phase).toBe(PHASE.ANSWER_HOLD)
    expect(g.correct).toBeNull()
  })

  it('holdSec을 다 채워야 ANSWER_RESULT로 확정된다', () => {
    const g = unlocked()
    g.selectAnswer('left')
    g.update(0.5)
    expect(g.phase).toBe(PHASE.ANSWER_HOLD)
    g.update(0.5)
    expect(g.phase).toBe(PHASE.ANSWER_RESULT)
  })

  it('정답(LEFT)을 유지하면 correct: true', () => {
    const g = unlocked()
    g.selectAnswer('left')
    g.update(1)
    expect(g.correct).toBe(true)
  })

  it('오답(RIGHT)을 유지하면 correct: false', () => {
    const g = unlocked()
    g.selectAnswer('right')
    g.update(1)
    expect(g.correct).toBe(false)
  })

  it('고르던 쪽을 바꾸면 유지 시간이 처음부터 다시 잰다', () => {
    const g = unlocked()
    g.selectAnswer('left')
    g.update(0.9)                 // 거의 다 찼는데
    g.selectAnswer('right')       // 마음을 바꾼다
    expect(g.holdElapsed).toBe(0)
    expect(g.selectedSide).toBe('right')
    g.update(0.9)
    expect(g.phase).toBe(PHASE.ANSWER_HOLD)   // 아직 안 찼다
  })

  it('clearSelection으로 자리를 벗어나면 다시 선택 가능한 상태로 돌아간다', () => {
    const g = unlocked()
    g.selectAnswer('left')
    g.update(0.4)
    g.clearSelection()
    expect(g.phase).toBe(PHASE.MOVE_UNLOCKED)
    expect(g.selectedSide).toBeNull()
    expect(g.holdElapsed).toBe(0)
  })

  it('확정된 뒤에는 선택이 더 안 바뀐다', () => {
    const g = unlocked()
    g.selectAnswer('left')
    g.update(1)
    expect(g.done).toBe(true)
    g.selectAnswer('right')
    expect(g.phase).toBe(PHASE.ANSWER_RESULT)
    expect(g.correct).toBe(true)
  })
})

describe('활동 시간(active_sec)', () => {
  it('QUESTION_READY(첫 스쿼트 전)에는 시간이 안 쌓인다', () => {
    const g = new BodyQuizRun(question)
    g.update(3)
    expect(g.activeSec).toBe(0)
  })

  it('스쿼트가 한 번이라도 시작되면 시간이 쌓인다', () => {
    const g = new BodyQuizRun(question)
    g.registerSquat()
    g.update(2)
    expect(g.activeSec).toBeGreaterThan(0)
  })

  it('결과가 나온 뒤에는 시간이 더 안 쌓인다', () => {
    const g = new BodyQuizRun(question, { holdSec: 1 })
    for (let i = 0; i < 5; i++) g.registerSquat()
    g.selectAnswer('left')
    g.update(1)
    expect(g.done).toBe(true)
    const before = g.activeSec
    g.update(5)
    expect(g.activeSec).toBe(before)
  })
})

describe('기록', () => {
  it('지표 이름이 운동 사전 그대로다', () => {
    const g = new BodyQuizRun(question)
    g.registerSquat()
    const s = g.snapshot()
    expect(getExercise('squats')).toBeTruthy()
    expect(getExercise('active_sec')).toBeTruthy()
    expect(s).toHaveProperty('squats')
    expect(s).toHaveProperty('active_sec')
  })
})

describe('게임팩 등록', () => {
  it('registry에 body-quiz가 등록돼 있고 manifest.id가 같다', () => {
    const entry = GAME_REGISTRY['body-quiz']
    expect(entry).toBeTruthy()
    expect(entry.manifest.id).toBe('body-quiz')
    expect(typeof entry.play).toBe('function')
  })

  it('manifest의 metrics는 전부 운동 사전에 있는 이름이다', () => {
    for (const key of GAME_REGISTRY['body-quiz'].manifest.metrics) {
      expect(getExercise(key), key).toBeTruthy()
    }
  })

  // 인트로(`thum_bodyquiz.png` + START)가 생긴 뒤로는 플레이 화면에서
  // 나가는 곳도 한 단계씩 뒤로 — 곧장 허브가 아니라 인트로다.
  it('인트로가 있으므로 인트로로 나간다', () => {
    expect(getBackTo('body-quiz')).toBe('/intro?id=body-quiz')
    expect(getBackTo('body-quiz')).not.toBe(getPlayRoute('body-quiz'))
  })
})
