// 바디 퀴즈 플레이 화면 — 튜토리얼 오버레이가 실제로 게임 입력을 막는지,
// 끝나면(GAME START든 스킵이든) 정상적으로 풀리는지, 개발 모드에서는
// 매번 다시 뜨는지. play.js를 라우터 없이 직접 호출해 진짜 DOM에 진짜
// keydown을 쏴 본다(storyDialogue.test.js와 같은 방식).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import bodyQuizPlay, {
  BODY_QUIZ_RESULT_FX_TIMEOUT_MS,
  bodyQuizMotionIcon,
  createBodyQuizCameraSession,
} from '../src/games/body-quiz/play.js'
import { BodyQuizRun } from '../src/games/body-quiz/game.js'
import { QUESTIONS } from '../src/games/body-quiz/questions.js'
import { handSession } from '../src/core/handSession.js'
import { BODY_QUIZ_GUIDE_CHARACTERS, getBodyQuizGuideCue } from '../src/games/body-quiz/guide.js'
import {
  BODY_QUIZ_SESSION_LIMIT,
  createBodyQuizSession,
  createBodyQuizQuestionTiming,
  markBodyQuizExerciseCompleted,
  markBodyQuizAnswerSelected,
  randomizeBodyQuizAnswerSides,
} from '../src/games/body-quiz/session.js'
import {
  markTutorialCompleted,
  hasCompletedTutorial,
  resetTutorialCompleted,
} from '../src/games/body-quiz/tutorial.js'

const immediateReadiness = {
  areReady: () => true,
  preload: () => Promise.resolve([]),
  waitFor: () => Promise.resolve({ ready: true, timedOut: false, results: [], failed: [] }),
  invalidate() {},
}
const noopLoadingScreen = () => ({ release() {} })
const noopAudioController = {
  prepare: () => Promise.resolve(), activate() {}, start: () => Promise.resolve(),
  squat() {}, enterSelection() {}, selectionCountdown() {}, cancelSelection() {},
  result() {}, nextQuestion() {}, complete() {}, destroy() {},
}

// squat 반영은 rAF 루프(loop())가 다음 프레임에 그린다 — keydown 직후
// DOM을 바로 읽으면 아직 이전 프레임이다. 프레임 한 번을 기다려 준다.
function tick() {
  return new Promise(resolve => requestAnimationFrame(resolve))
}

async function pressKeyS() {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyS' }))
  await tick()
}

async function press(code) {
  window.dispatchEvent(new KeyboardEvent('keydown', { code }))
  await tick()
}

function mountPlay(query = { id: 'body-quiz' }, options = {}) {
  document.body.innerHTML = '<div id="app"></div>'
  const app = document.querySelector('#app')
  bodyQuizPlay(app, query, {
    assetReadiness: immediateReadiness,
    loadingScreen: noopLoadingScreen,
    sessionRandom: () => 0.99,
    audioController: noopAudioController,
    ...options,
  })
  return app
}

function enterPlay(query = { id: 'body-quiz' }, options = {}) {
  const app = mountPlay(query, options)
  app.querySelector('#bqt-skip')?.click()
  return app
}

describe('실제 플레이 scene — 카메라·데이터·상태 UI', () => {
  beforeEach(() => resetTutorialCompleted())

  it('poseEngineCore 계약대로 acquire → attach/onLandmarks 후 destroy에서 detach/unsubscribe/release한다', async () => {
    const detach = vi.fn()
    const unsubscribe = vi.fn()
    const engine = {
      acquire: vi.fn(async () => {}),
      attach: vi.fn(() => detach),
      onLandmarks: vi.fn(() => unsubscribe),
      release: vi.fn(),
    }
    const videoEl = document.createElement('video')
    const onLandmarks = vi.fn()
    const onStatus = vi.fn()
    const session = createBodyQuizCameraSession({ videoEl, onLandmarks, onStatus, engine })

    await expect(session.start()).resolves.toBe(true)
    expect(engine.acquire).toHaveBeenCalledOnce()
    expect(engine.attach).toHaveBeenCalledWith(videoEl)
    expect(engine.onLandmarks).toHaveBeenCalledWith(onLandmarks)
    expect(onStatus).toHaveBeenLastCalledWith('ready')

    session.destroy()
    expect(unsubscribe).toHaveBeenCalledOnce()
    expect(detach).toHaveBeenCalledOnce()
    expect(engine.release).toHaveBeenCalledOnce()
  })

  it('실제 플레이 진입 시 인트로의 손 커서/PIP 표시를 끈다', () => {
    const pointerSpy = vi.spyOn(handSession, 'setPointerActive')
    enterPlay()
    expect(pointerSpy).toHaveBeenCalledWith(false)
    pointerSpy.mockRestore()
  })

  it('full-bleed video와 questions.js의 질문·좌우 답 데이터를 표시한다', () => {
    const app = enterPlay()
    expect(app.querySelector('#bq-camera')).not.toBeNull()
    expect(app.querySelector('#bq-question-prompt').textContent).toBe('코가 긴 동물은 누구일까?')
    const labels = [...app.querySelectorAll('.bq-label')].map(el => el.textContent).sort()
    const images = [...app.querySelectorAll('.bq-answer img')].map(el => el.getAttribute('src')).sort()
    expect(labels).toEqual(['코끼리', '호랑이'])
    expect(images).toEqual([
      '/assets/body-quiz/answers/animal_elephant.png',
      '/assets/body-quiz/answers/animal_tiger.png',
    ])
  })

  it('헤더 진행도는 실제 세션 index/total을 표시하고 인트로 중복 버튼은 없다', () => {
    const app = enterPlay()
    expect(app.querySelector('#bq-progress strong').textContent).toBe('1 / 6')
    expect(app.querySelector('#bq').dataset.questionIndex).toBe('0')
    expect(app.querySelector('#bq-intro')).toBeNull()
  })

  it('QUESTION은 fit-content이고 답 카드는 중앙을 향한 tilt와 CSS sparkle을 쓴다', () => {
    const app = enterPlay()
    const question = app.querySelector('#bq-question')
    const left = app.querySelector('#bq-left')
    const right = app.querySelector('#bq-right')
    const css = app.querySelector('style').textContent

    expect(getComputedStyle(question).width).toBe('fit-content')
    expect(getComputedStyle(left).getPropertyValue('--bq-card-tilt').trim()).toBe('12deg')
    expect(getComputedStyle(right).getPropertyValue('--bq-card-tilt').trim()).toBe('-12deg')
    expect(css).toContain('@keyframes bqCardSparkle')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
  })

  it('스쿼트 횟수가 ENERGY와 MOVE LOCK/UNLOCK UI에 즉시 반영된다', async () => {
    const app = enterPlay()
    for (let i = 0; i < 4; i++) await press('KeyS')
    expect(app.querySelector('#bq-squat').textContent).toBe('SQUAT 4/5')
    expect(app.querySelector('#bq-energy-pct').textContent).toBe('80%')
    expect(app.querySelector('#bq-energy-bar i').style.width).toBe('80%')
    expect(app.querySelector('#bq-move-state').textContent).toBe('MOVE LOCK')

    await press('KeyS')
    expect(app.querySelector('#bq-squat').textContent).toBe('SQUAT 5/5')
    expect(app.querySelector('#bq-energy-pct').textContent).toBe('100%')
    expect(app.querySelector('#bq-move-state').textContent).toBe('MOVE UNLOCK')
    expect(app.querySelector('#bq-motion-hud').classList.contains('unlocked')).toBe(true)
  })

  it('SQUAT HUD는 교체 가능한 white motion pictogram 구조를 쓴다', () => {
    const app = enterPlay()
    const icon = app.querySelector('#bq-motion-icon')
    expect(icon.dataset.motion).toBe('squat')
    expect(icon.querySelector('svg.bq-motion-pictogram')).not.toBeNull()
    for (const key of ['squat', 'jump', 'run', 'pose']) {
      expect(bodyQuizMotionIcon(key)).toContain('bq-motion-pictogram')
    }
  })

  it('실제 play와 tutorial은 같은 Motion HUD 구조와 visual class를 공유한다', () => {
    const app = mountPlay()
    const playHud = app.querySelector('#bq-motion-hud')
    const tutorialHud = app.querySelector('#bqt-motion-hud')
    for (const hud of [playHud, tutorialHud]) {
      expect(hud.classList.contains('bq-motion-hud')).toBe(true)
      expect(hud.querySelector('.bq-motion-icon')).not.toBeNull()
      expect(hud.querySelector('.bq-motion-name')).not.toBeNull()
      expect(hud.querySelector('.bq-motion-energy-bar')).not.toBeNull()
      expect(hud.querySelector('.bq-motion-state')).not.toBeNull()
      expect(hud.querySelector('.bq-motion-icon').parentElement).toBe(hud)
      expect(hud.querySelector('.bq-motion-count').parentElement).toBe(hud)
      const energy = hud.querySelector('.bq-motion-energy')
      expect(energy.parentElement).toBe(hud)
      expect(hud.querySelector('.bq-motion-energy-label').parentElement).toBe(energy)
      expect(hud.querySelector('.bq-motion-energy-bar').parentElement).toBe(energy)
      expect(hud.querySelector('.bq-motion-energy-pct').parentElement).toBe(hud)
      expect(hud.querySelector('.bq-motion-state').parentElement).toBe(hud)
    }
  })

  it('가이드 캐릭터는 지정 asset만 참조하고 로드 전에는 깨진 대체물을 노출하지 않는다', () => {
    const app = enterPlay()
    const guides = [...app.querySelectorAll('.bq-guide')]
    expect(guides).toHaveLength(2)
    expect(guides.map(el => el.querySelector('img').getAttribute('src')).sort()).toEqual([
      BODY_QUIZ_GUIDE_CHARACTERS.boy.image,
      BODY_QUIZ_GUIDE_CHARACTERS.girl.image,
    ].sort())
    expect(guides.every(el => el.classList.contains('asset-missing'))).toBe(true)
  })

  it('게임 상태에 따라 한 명의 가이드 메시지만 바뀐다', async () => {
    const app = enterPlay()
    expect(app.querySelector('.bq-guide.is-speaking').dataset.guide).toBe('girl')
    expect(app.querySelector('.bq-guide.is-speaking .bq-guide-bubble').textContent).toContain('스쿼트')

    await press('KeyS')
    expect(app.querySelector('.bq-guide.is-speaking').dataset.guide).toBe('boy')
    expect(app.querySelectorAll('.bq-guide.is-speaking')).toHaveLength(1)
    expect(getBodyQuizGuideCue({ phase: 'question_ready', locked: true, squatCount: 0 }).text).toContain('스쿼트')
  })

  it('잠금 해제 뒤 LEFT/RIGHT 선택에 따라 해당 카드만 강조한다', async () => {
    const app = enterPlay()
    for (let i = 0; i < 5; i++) await press('KeyS')

    await press('ArrowLeft')
    expect(app.querySelector('#bq-left').classList.contains('zone-active')).toBe(true)
    expect(app.querySelector('#bq-right').classList.contains('zone-muted')).toBe(true)
    expect(app.querySelector('#bq-left .bq-select-countdown').textContent).toBe('3')
    expect(app.querySelector('#bq-left .bq-select-countdown').hidden).toBe(false)

    await press('ArrowRight')
    expect(app.querySelector('#bq-right').classList.contains('zone-active')).toBe(true)
    expect(app.querySelector('#bq-left').classList.contains('zone-muted')).toBe(true)
    expect(app.querySelector('#bq-left .bq-select-countdown').hidden).toBe(true)
    expect(app.querySelector('#bq-right .bq-select-countdown').textContent).toBe('3')
  })

  it('실제 play 상태 전이를 BODY QUIZ audio coordinator에 한 번씩 전달한다', async () => {
    const audioController = {
      prepare: vi.fn(() => Promise.resolve()), activate: vi.fn(), start: vi.fn(() => Promise.resolve()),
      squat: vi.fn(), enterSelection: vi.fn(), selectionCountdown: vi.fn(), cancelSelection: vi.fn(),
      result: vi.fn(), nextQuestion: vi.fn(), complete: vi.fn(), destroy: vi.fn(),
    }
    enterPlay({ id: 'body-quiz' }, { audioController })
    expect(audioController.prepare).toHaveBeenCalledWith('body-quiz')
    expect(audioController.start).toHaveBeenCalledWith('body-quiz')

    for (let i = 0; i < 5; i++) await press('KeyS')
    expect(audioController.squat).toHaveBeenCalledTimes(5)
    expect(audioController.squat).toHaveBeenLastCalledWith(5, 5)

    await press('ArrowLeft')
    expect(audioController.enterSelection).toHaveBeenCalledOnce()
    expect(audioController.selectionCountdown).toHaveBeenCalledWith(3)
  })

  it('답 카드는 float/sparkle과 correct flip/wrong shake/particle 효과 구조를 갖는다', () => {
    const app = enterPlay()
    const css = app.querySelector('style').textContent
    expect(app.querySelectorAll('.bq-answer-visual')).toHaveLength(2)
    expect(app.querySelectorAll('.bq-card-aura')).toHaveLength(2)
    expect(app.querySelectorAll('.bq-card-particles i')).toHaveLength(16)
    expect(app.querySelectorAll('.bq-select-countdown')).toHaveLength(2)
    expect(css).toContain('@keyframes bqCardFloat')
    expect(css).toContain('@keyframes bqAmbientTwinkle')
    expect(css).toContain('@keyframes bqSelectedAura')
    expect(css).toContain('@keyframes bqCountdownRing')
    expect(css).toContain('@keyframes bqCorrectFlip')
    expect(css).toContain('@keyframes bqCorrectRing')
    expect(css).toContain('calc(var(--bq-card-tilt) + 360deg)')
    expect(css).toContain('@keyframes bqWrongShake')
    expect(css).toContain('@keyframes bqGoldBurst')
    expect(css).toContain('@keyframes bqSoftScatter')
    expect(BODY_QUIZ_RESULT_FX_TIMEOUT_MS).toBeGreaterThan(900)
  })

  it('플레이 헤더도 공통 시스템 메뉴와 종료 확인창을 사용한다', () => {
    const app = enterPlay()
    const panel = app.querySelector('#pz-menu-panel')
    const confirm = app.querySelector('#pz-confirm')
    expect(app.querySelector('#pz-menu img')).toBeNull()
    expect(app.querySelector('#pz-exit img')).toBeNull()
    expect(app.querySelector('#pz-music').disabled).toBe(true)

    app.querySelector('#pz-menu').click()
    expect(panel.classList.contains('hidden')).toBe(false)
    app.querySelector('#pz-exit').click()
    expect(panel.classList.contains('hidden')).toBe(true)
    expect(confirm.classList.contains('hidden')).toBe(false)
    app.querySelector('#pz-resume').click()
    expect(confirm.classList.contains('hidden')).toBe(true)
  })

})

describe('실제 플레이 scene — 세션 문제 선택과 분석 시간', () => {
  const sample = Array.from({ length: 12 }, (_, i) => ({
    ...QUESTIONS[0],
    id: `q-${i}`,
    left: { ...QUESTIONS[0].left, id: `correct-${i}` },
    right: { ...QUESTIONS[0].right, id: `wrong-${i}` },
  }))

  it('최대 10문제를 원본 훼손과 중복 없이 session으로 만든다', () => {
    const before = JSON.stringify(sample)
    const session = createBodyQuizSession(sample, { random: () => 0.25 })
    expect(session.questions).toHaveLength(10)
    expect(new Set(session.questions.map(q => q.id)).size).toBe(10)
    expect(JSON.stringify(sample)).toBe(before)
  })

  it('10문제 session의 정답 위치는 LEFT/RIGHT에 5개씩 배치한다', () => {
    const session = createBodyQuizSession(sample, { random: () => 0.37 })
    const left = session.questions.filter(question => question.correctSide === 'left').length
    const right = session.questions.filter(question => question.correctSide === 'right').length
    expect(session.questions).toHaveLength(BODY_QUIZ_SESSION_LIMIT)
    expect({ left, right }).toEqual({ left: 5, right: 5 })
  })

  it('홀수 문제 session도 LEFT/RIGHT 정답 수가 1개보다 더 벌어지지 않는다', () => {
    const session = createBodyQuizSession(sample, { limit: 5, random: () => 0.8 })
    const left = session.questions.filter(question => question.correctSide === 'left').length
    const right = session.questions.filter(question => question.correctSide === 'right').length
    expect(Math.abs(left - right)).toBe(1)
  })

  it('LEFT/RIGHT를 바꿔도 correctSide가 정답 데이터와 함께 이동한다', () => {
    const question = randomizeBodyQuizAnswerSides(QUESTIONS[0], () => 0.1)
    expect(question.left.id).toBe('tiger')
    expect(question.correctSide).toBe('right')

    const run = new BodyQuizRun(question, { targetSquats: 1, holdSec: 0 })
    run.registerSquat()
    run.selectAnswer(question.correctSide)
    run.update(0)
    expect(run.correct).toBe(true)
  })

  it('표시하지 않는 question timing state에 운동/선택/소요 시간을 기록한다', () => {
    const timing = createBodyQuizQuestionTiming('q-1', 1000)
    markBodyQuizExerciseCompleted(timing, 2400)
    markBodyQuizAnswerSelected(timing, 4100)
    expect(timing).toEqual({
      questionId: 'q-1',
      questionStartedAt: 1000,
      exerciseCompletedAt: 2400,
      answerSelectedAt: 4100,
      questionDuration: 3100,
    })
  })

  it('짧은 landscape fallback과 reduced-motion 규칙을 포함한다', () => {
    const app = enterPlay()
    const css = app.querySelector('style').textContent
    expect(css).toContain('@media (max-width: 700px) and (orientation: landscape)')
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.bq-motion-icon')
  })
})

describe('플레이 화면 — 첫 진입 시 튜토리얼', () => {
  beforeEach(() => resetTutorialCompleted())

  it('처음 들어오면 튜토리얼 오버레이가 뜬다', () => {
    const app = mountPlay()
    expect(app.querySelector('#bqt-root')).not.toBeNull()
    expect(app.querySelector('#bqt-left .bqt-label').textContent).toBe('코끼리')
    expect(app.querySelector('#bqt-right .bqt-label').textContent).toBe('호랑이')
  })

  it('튜토리얼이 떠 있는 동안 S를 눌러도 스쿼트가 안 세진다', async () => {
    const app = mountPlay()
    await pressKeyS()
    expect(app.querySelector('#bq-squat').textContent).toBe('SQUAT 0/5')
  })

  it('GAME START까지 다 누르면 오버레이가 사라지고 이후 S가 먹힌다', async () => {
    const app = mountPlay()
    for (let i = 0; i < 4; i++) app.querySelector('#bqt-next').click()

    expect(app.querySelector('#bqt-root')).toBeNull()

    await pressKeyS()
    expect(app.querySelector('#bq-squat').textContent).toBe('SQUAT 1/5')
  })

  // 스킵도 GAME START와 같은 결과여야 한다(ken 지시) — 몇 번째 스텝에
  // 있든 "이제 진짜 게임을 시작하라"는 같은 신호다.
  it('중간에 스킵해도 오버레이가 사라지고 이후 S가 먹힌다', async () => {
    const app = mountPlay()
    app.querySelector('#bqt-next').click()   // 2/4까지만 보고
    app.querySelector('#bqt-skip').click()

    expect(app.querySelector('#bqt-root')).toBeNull()

    await pressKeyS()
    expect(app.querySelector('#bq-squat').textContent).toBe('SQUAT 1/5')
  })

  it('튜토리얼을 끝내면 완료 상태가 저장된다', () => {
    const app = mountPlay()
    for (let i = 0; i < 4; i++) app.querySelector('#bqt-next').click()
    expect(hasCompletedTutorial()).toBe(true)
  })
})

// 개발 빌드(`import.meta.env.DEV`, vitest에서도 true)에서는 완료 기록과
// 무관하게 매번 다시 뜬다(2차 수정, ken 지시) — 화면을 고치는 동안 매번
// localStorage를 지웠다 켰다 하지 않아도 된다. 실제 서비스에서 이
// 게이트가 도는지는 `shouldShowTutorial(query, {dev:false})`로
// `bodyQuizTutorial.test.js`가 직접 확인한다(순수 함수라 dev 빌드가
// 아니어도 그 분기를 테스트할 수 있다).
describe('플레이 화면 — 개발 모드에서는 완료 기록과 무관하게 다시 뜬다', () => {
  beforeEach(() => resetTutorialCompleted())

  it('markTutorialCompleted 이후에도 다시 진입하면 튜토리얼이 뜬다', () => {
    markTutorialCompleted()
    const app = mountPlay()
    expect(app.querySelector('#bqt-root')).not.toBeNull()
  })

  it('다시 보고 싶지 않으면 스킵으로 곧장 게임에 들어갈 수 있다', async () => {
    markTutorialCompleted()
    const app = mountPlay()
    app.querySelector('#bqt-skip').click()
    expect(app.querySelector('#bqt-root')).toBeNull()

    await pressKeyS()
    expect(app.querySelector('#bq-squat').textContent).toBe('SQUAT 1/5')
  })

  it('?tutorial=1이면 물론 여전히 강제로 뜬다', () => {
    markTutorialCompleted()
    const app = mountPlay({ id: 'body-quiz', tutorial: '1' })
    expect(app.querySelector('#bqt-root')).not.toBeNull()
  })
})

// hash 이동은 router의 비동기 hashchange 렌더를 일으키므로 DOM 검증이 모두 끝난
// 마지막에 둔다. 플레이 왼쪽 바로가기는 없어졌지만 종료 확인의 인트로 경로는 유지한다.
describe('실제 플레이 scene — 종료 확인의 인트로 이동', () => {
  it('게임 처음으로는 BODY QUIZ 인트로 경로로 돌아간다', async () => {
    const app = enterPlay()
    window.history.replaceState(null, '', '#/play?id=body-quiz')
    app.querySelector('#pz-exit').click()
    app.querySelector('#pz-quit').click()
    expect(window.location.hash).toBe('#/intro?id=body-quiz')

    // hash router가 비동기 import 뒤 intro readiness를 시작하므로 mount까지
    // 기다렸다가 안전한 비게임 화면으로 이동해 pending gate를 정리한다.
    await vi.waitFor(() => expect(document.querySelector('#bqi-root')).not.toBeNull())
    window.location.hash = '#/me'
    await vi.waitFor(() => expect(document.querySelector('#bqi-root')).toBeNull())
  })
})
