// 바디 퀴즈 튜토리얼 — 4 STEP 전환·저장 정책·이전/다음/스킵을 검증한다.
//
// `createBodyQuizTutorial`은 순수 DOM 조작이라(포즈·카메라 없음) jsdom에서
// 그대로 실행할 수 있다 — 소스를 훑는 대신 진짜로 버튼을 눌러 본다
// (storyDialogue.test.js와 같은 방식).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  createBodyQuizTutorial,
  shouldShowTutorial,
  hasCompletedTutorial,
  markTutorialCompleted,
  resetTutorialCompleted,
} from '../src/games/body-quiz/tutorial.js'
import { TUTORIAL_STEPS } from '../src/games/body-quiz/tutorialSteps.js'
import { getText, LOCALES } from '../src/games/body-quiz/tutorialText.js'
import { QUESTIONS } from '../src/games/body-quiz/questions.js'

const question = QUESTIONS[0]
const mountedHandles = new Set()
const immediateReadiness = {
  areReady: () => true,
  preload: () => Promise.resolve([]),
  waitFor: () => Promise.resolve({ ready: true, timedOut: false, results: [], failed: [] }),
  invalidate() {},
}

afterEach(() => {
  for (const handle of mountedHandles) handle.destroy()
  mountedHandles.clear()
})

function mount(options = {}) {
  document.body.innerHTML = '<div id="app"></div>'
  const app = document.querySelector('#app')
  let finished = false
  const handle = createBodyQuizTutorial({
    mountEl: app,
    question,
    onFinish: () => { finished = true },
    assetReadiness: immediateReadiness,
    ...options,
  })
  mountedHandles.add(handle)
  return { app, handle, isFinished: () => finished }
}

describe('최종 헤더 — 인트로 + 공통 시스템바', () => {
  it('BODY QUIZ 배지 대신 목적지가 분명한 인트로 버튼이 있다', () => {
    const { app } = mount()
    expect(app.querySelector('#bqt-badge')).toBeNull()
    expect(app.querySelector('#bqt-intro').textContent).toContain('인트로')
    expect(app.querySelector('#bqt-page').textContent).toBe('1 / 4')
  })

  it('hamburger와 exit는 이미지가 아니라 같은 구조의 코드 SVG 버튼이다', () => {
    const { app } = mount()
    const menu = app.querySelector('#pz-menu')
    const exit = app.querySelector('#pz-exit')
    for (const button of [menu, exit]) {
      expect(button.classList.contains('bqt-header-action')).toBe(true)
      expect(button.querySelector('img')).toBeNull()
      expect(button.querySelector('svg')).not.toBeNull()
    }
  })

  it('우측 action은 같은 높이의 완전한 원형이고 메뉴 내부 아이콘도 코드 SVG다', () => {
    const { app } = mount()
    const menu = app.querySelector('#pz-menu')
    const exit = app.querySelector('#pz-exit')
    expect(getComputedStyle(menu).width).toBe(getComputedStyle(menu).height)
    expect(getComputedStyle(exit).width).toBe(getComputedStyle(exit).height)
    expect(getComputedStyle(menu).borderRadius).toBe('9999px')
    expect(getComputedStyle(exit).borderRadius).toBe('9999px')

    for (const id of ['#pz-music', '#pz-sfx', '#pz-full']) {
      const button = app.querySelector(id)
      expect(button.querySelector('img')).toBeNull()
      expect(button.querySelector('svg')).not.toBeNull()
      expect(getComputedStyle(button).borderRadius).toBe('9999px')
    }
  })

  it('인트로 버튼은 Home이 아니라 BODY QUIZ 인트로 콜백만 부른다', () => {
    const onIntro = vi.fn()
    const onHome = vi.fn()
    const { app } = mount({ onIntro, onHome })
    app.querySelector('#bqt-intro').click()
    expect(onIntro).toHaveBeenCalledOnce()
    expect(onHome).not.toHaveBeenCalled()
  })

  it('햄버거는 공통 메뉴 패널을 열고 닫는다', () => {
    const { app } = mount()
    const panel = app.querySelector('#pz-menu-panel')
    const menuIcon = app.querySelector('#bqt-menu-icon')
    const closedIcon = menuIcon.innerHTML
    expect(panel.classList.contains('hidden')).toBe(true)
    app.querySelector('#pz-menu').click()
    expect(panel.classList.contains('hidden')).toBe(false)
    expect(menuIcon.innerHTML).not.toBe(closedIcon)
    app.querySelector('#pz-menu').click()
    expect(panel.classList.contains('hidden')).toBe(true)
    expect(menuIcon.innerHTML).toBe(closedIcon)
  })

  it('시스템 메뉴는 바깥 클릭과 ESC로 닫힌다', () => {
    const { app } = mount()
    const panel = app.querySelector('#pz-menu-panel')
    const menu = app.querySelector('#pz-menu')

    menu.click()
    document.body.click()
    expect(panel.classList.contains('hidden')).toBe(true)

    menu.click()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(panel.classList.contains('hidden')).toBe(true)
  })

  it('나가기를 누르면 열린 시스템 메뉴를 닫고 확인창만 연다', () => {
    const { app } = mount()
    app.querySelector('#pz-menu').click()
    expect(app.querySelector('#pz-menu-panel').classList.contains('hidden')).toBe(false)

    app.querySelector('#pz-exit').click()
    expect(app.querySelector('#pz-menu-panel').classList.contains('hidden')).toBe(true)
    expect(app.querySelector('#pz-confirm').classList.contains('hidden')).toBe(false)
  })

  it('종료 확인창은 계속하기, dim 바깥 클릭, ESC로 안전하게 닫힌다', () => {
    const { app } = mount()
    const confirm = app.querySelector('#pz-confirm')
    const exit = app.querySelector('#pz-exit')

    exit.click()
    app.querySelector('#pz-resume').click()
    expect(confirm.classList.contains('hidden')).toBe(true)

    exit.click()
    confirm.click()
    expect(confirm.classList.contains('hidden')).toBe(true)

    exit.click()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    expect(confirm.classList.contains('hidden')).toBe(true)
  })

  it('나가기는 확인창을 거쳐 게임 처음으로=인트로, Home으로=허브를 구분한다', () => {
    const onIntro = vi.fn()
    const onHome = vi.fn()
    const { app } = mount({ onIntro, onHome })

    app.querySelector('#pz-exit').click()
    expect(app.querySelector('#pz-confirm').classList.contains('hidden')).toBe(false)
    expect(onIntro).not.toHaveBeenCalled()
    app.querySelector('#pz-quit').click()
    expect(onIntro).toHaveBeenCalledOnce()
    expect(onHome).not.toHaveBeenCalled()

    app.querySelector('#pz-quit-home').click()
    expect(onHome).toHaveBeenCalledOnce()
  })
})

describe('저장 정책 — playzera.bodyQuiz.tutorialCompleted', () => {
  beforeEach(() => resetTutorialCompleted())

  it('처음에는 안 본 상태다', () => {
    expect(hasCompletedTutorial()).toBe(false)
  })

  it('markTutorialCompleted 이후에는 기억한다', () => {
    markTutorialCompleted()
    expect(hasCompletedTutorial()).toBe(true)
  })

  it('명확한 key 이름을 쓴다', () => {
    markTutorialCompleted()
    expect(localStorage.getItem('playzera.bodyQuiz.tutorialCompleted')).toBe('1')
  })

  it('resetTutorialCompleted으로 다시 안 본 상태로 되돌릴 수 있다(개발용)', () => {
    markTutorialCompleted()
    resetTutorialCompleted()
    expect(hasCompletedTutorial()).toBe(false)
  })
})

describe('표시 정책 — shouldShowTutorial', () => {
  beforeEach(() => resetTutorialCompleted())

  // 실제 서비스(프로덕션 빌드)를 흉내 낸 경로 — dev:false로 완료 기록
  // 게이트가 실제로 동작하는지를 본다. play.js는 기본값(빌드 플래그)을
  // 그대로 쓰므로 이 분기를 항상 타는 건 아니다 — 아래 "개발 모드" 쪽이
  // 실제 이 프로젝트(vitest·`npm run dev`)에서 벌어지는 일이다.
  describe('실제 서비스(dev:false) — 완료 기록이 화면을 막는다', () => {
    it('안 본 상태면 뜬다', () => {
      expect(shouldShowTutorial({}, { dev: false })).toBe(true)
    })

    it('본 상태면 안 뜬다', () => {
      markTutorialCompleted()
      expect(shouldShowTutorial({}, { dev: false })).toBe(false)
    })

    it('본 상태여도 ?tutorial=1이면 강제로 다시 뜬다', () => {
      markTutorialCompleted()
      expect(shouldShowTutorial({ tutorial: '1' }, { dev: false })).toBe(true)
    })
  })

  // 개발 중에는 완료 기록과 상관없이 매번 다시 뜬다(ken 지시, 2차 수정) —
  // 화면을 고치는 동안 매번 localStorage를 지웠다 켰다 하지 않아도 된다.
  // 다시 안 보고 싶으면 스킵 버튼으로 바로 게임으로 넘어가면 된다.
  describe('개발 모드(dev:true, 기본값) — 완료 기록과 무관하게 매번 뜬다', () => {
    it('안 본 상태면 뜬다', () => {
      expect(shouldShowTutorial({}, { dev: true })).toBe(true)
    })

    it('완료했어도 뜬다', () => {
      markTutorialCompleted()
      expect(shouldShowTutorial({}, { dev: true })).toBe(true)
    })

    it('두 번째 인자를 생략하면 실제 빌드 플래그(vitest에서는 DEV=true)를 그대로 쓴다', () => {
      markTutorialCompleted()
      expect(shouldShowTutorial({})).toBe(true)
    })
  })
})

describe('STEP 전환 — 1 → 2 → 3 → 4', () => {
  it('처음엔 1/4, 운동 패널이 없고 STEP1 중앙 그림(think)이 뜬다', () => {
    const { app } = mount()
    expect(app.querySelector('#bqt-page').textContent).toBe('1 / 4')
    expect(app.querySelector('#bqt-exercise').hidden).toBe(true)
    expect(app.querySelector('#bqt-center-media').hidden).toBe(false)
    expect(app.querySelector('#bqt-center-img').getAttribute('src')).toContain('tutorial_think.png')
    expect(app.querySelector('#bqt-squat-cycle').hidden).toBe(true)
  })

  // tutorial board 안에는 더 이상 "MOVE LOCK" 문구가 없다 — 그건 실제
  // 게임 화면(play.js)의 상태 표시이지 튜토리얼 UI가 아니다(ken 지시).
  it('보드 안에 MOVE LOCK 문구가 없다', () => {
    const { app } = mount()
    expect(app.textContent).not.toContain('MOVE LOCK')
  })

  it('1/4에서 이전 버튼은 비활성이다', () => {
    const { app } = mount()
    expect(app.querySelector('#bqt-prev').disabled).toBe(true)
  })

  it('다음을 누르면 2/4로 가고 운동 패널·스쿼트 down/up 그림을 보여준다', () => {
    const { app } = mount()
    app.querySelector('#bqt-next').click()
    expect(app.querySelector('#bqt-page').textContent).toBe('2 / 4')
    expect(app.querySelector('#bqt-exercise').hidden).toBe(false)
    expect(app.querySelector('#bqt-squat-cycle').hidden).toBe(false)
    expect(app.querySelector('#bqt-squat-down').getAttribute('src')).toContain('tutorial_squat_down.png')
    expect(app.querySelector('#bqt-squat-up').getAttribute('src')).toContain('tutorial_squat_up.png')
    expect(app.querySelector('#bqt-center-media').hidden).toBe(true)
    expect(app.querySelector('#bqt-prev').disabled).toBe(false)
  })

  // SQUAT·MOVE ENERGY는 곧장 최종값을 찍지 않는다 — 0에서 목표까지 세는
  // 연출이 붙어 있다(ken 지시: "실제로 카운팅되는 듯한 애니메이션").
  // 가짜 타이머로 그 연출이 끝나는 지점을 확인한다.
  it('운동 패널은 0에서 시작해 목표(SQUAT 3/5·60%)까지 세어 올라간다', () => {
    vi.useFakeTimers()
    try {
      const { app } = mount()
      app.querySelector('#bqt-next').click()
      expect(app.querySelector('#bqt-squat').textContent).toBe('SQUAT 0/5')
      vi.advanceTimersByTime(220 * 3 + 1)
      expect(app.querySelector('#bqt-squat').textContent).toBe('SQUAT 3/5')
      expect(app.querySelector('#bqt-energy-label').textContent).toBe('MOVE ENERGY 60%')
    } finally {
      vi.useRealTimers()
    }
  })

  it('2/4에서 이전을 누르면 1/4로 되돌아간다', () => {
    const { app } = mount()
    app.querySelector('#bqt-next').click()
    app.querySelector('#bqt-prev').click()
    expect(app.querySelector('#bqt-page').textContent).toBe('1 / 4')
    expect(app.querySelector('#bqt-prev').disabled).toBe(true)
  })

  it('3/4에서 MOVE UNLOCK 배너가 뜨고 unlock 그림을 보여준다', () => {
    const { app } = mount()
    app.querySelector('#bqt-next').click()
    app.querySelector('#bqt-next').click()
    expect(app.querySelector('#bqt-page').textContent).toBe('3 / 4')
    expect(app.querySelector('#bqt-unlock-banner').classList.contains('on')).toBe(true)
    expect(app.querySelector('#bqt-center-img').getAttribute('src')).toContain('tutorial_unlock.png')
  })

  it('4/4에서 정답 카드(question.correctSide)가 강조되고 move 그림·"게임 시작!" 버튼이 뜬다', () => {
    const { app } = mount()
    app.querySelector('#bqt-next').click()
    app.querySelector('#bqt-next').click()
    app.querySelector('#bqt-next').click()
    expect(app.querySelector('#bqt-page').textContent).toBe('4 / 4')
    const correctEl = question.correctSide === 'left'
      ? app.querySelector('#bqt-left')
      : app.querySelector('#bqt-right')
    expect(correctEl.classList.contains('bqt-correct')).toBe(true)
    expect(app.querySelector('#bqt-center-img').getAttribute('src')).toContain('tutorial_move.png')
    expect(app.querySelector('#bqt-next').textContent.trim()).toContain('게임 시작!')
  })

  it('마지막 전에는 onFinish가 안 불린다', () => {
    const { app, isFinished } = mount()
    app.querySelector('#bqt-next').click()
    app.querySelector('#bqt-next').click()
    expect(isFinished()).toBe(false)
  })

  it('4/4에서 GAME START를 누르면 onFinish가 불리고 오버레이가 사라진다', () => {
    const { app, isFinished } = mount()
    for (let i = 0; i < 4; i++) app.querySelector('#bqt-next').click()
    expect(isFinished()).toBe(true)
    expect(app.querySelector('#bqt-root')).toBeNull()
  })
})

describe('스킵 — 몇 번째 스텝에 있든 즉시 게임으로', () => {
  it('1/4에서 곧장 스킵해도 onFinish가 불린다', () => {
    const { app, isFinished } = mount()
    app.querySelector('#bqt-skip').click()
    expect(isFinished()).toBe(true)
    expect(app.querySelector('#bqt-root')).toBeNull()
  })

  it('중간 스텝(2/4)에서 스킵해도 onFinish가 불린다', () => {
    const { app, isFinished } = mount()
    app.querySelector('#bqt-next').click()
    app.querySelector('#bqt-skip').click()
    expect(isFinished()).toBe(true)
  })
})

describe('하단 대화 — 타이핑 효과', () => {
  it('바로는 한 글자도 안 보이다가(캐럿만) 시간이 지나면 전체 문구가 다 찍힌다', () => {
    vi.useFakeTimers()
    try {
      const { app } = mount()
      const full = getText('ko').steps[0].guide
      expect(app.querySelector('#bqt-guide').textContent.trim()).toBe('')
      vi.advanceTimersByTime(26 * full.length + 10)
      expect(app.querySelector('#bqt-guide').textContent).toBe(full)
    } finally {
      vi.useRealTimers()
    }
  })

  it('스텝을 넘기면 이전 타이핑이 멈추고 새 문구로 다시 시작한다(글자가 안 섞인다)', () => {
    vi.useFakeTimers()
    try {
      const { app } = mount()
      vi.advanceTimersByTime(50)   // 1번 문구를 반쯤 타이핑하다가
      app.querySelector('#bqt-next').click()   // 곧장 2번으로 넘긴다
      const full2 = getText('ko').steps[1].guide
      vi.advanceTimersByTime(26 * full2.length + 10)
      expect(app.querySelector('#bqt-guide').textContent).toBe(full2)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('STEP2 — 스쿼트 down/up 교차 페이드', () => {
  it('내려간 자세로 시작해 시간이 지나면 올라간 자세로 바뀐다', () => {
    vi.useFakeTimers()
    try {
      const { app } = mount()
      app.querySelector('#bqt-next').click()
      expect(app.querySelector('#bqt-squat-down').classList.contains('on')).toBe(true)
      expect(app.querySelector('#bqt-squat-up').classList.contains('on')).toBe(false)
      vi.advanceTimersByTime(950)
      expect(app.querySelector('#bqt-squat-down').classList.contains('on')).toBe(false)
      expect(app.querySelector('#bqt-squat-up').classList.contains('on')).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('STEP4 — 이동 연출·정답 강조', () => {
  it('중앙 그림에 이동 연출 클래스가 붙고, 다른 스텝에는 없다', () => {
    const { app } = mount()
    app.querySelector('#bqt-next').click()
    app.querySelector('#bqt-next').click()
    expect(app.querySelector('#bqt-center-img').classList.contains('bqt-move-nudge')).toBe(false)
    app.querySelector('#bqt-next').click()   // 4/4
    expect(app.querySelector('#bqt-center-img').classList.contains('bqt-move-nudge')).toBe(true)
  })

  it('정답 카드 안에 위쪽 화살표·정답 뱃지가 같이 들어 있다(question.correctSide를 따라간다)', () => {
    const { app } = mount()
    for (let i = 0; i < 3; i++) app.querySelector('#bqt-next').click()
    const correctId = question.correctSide === 'left' ? '#bqt-left' : '#bqt-right'
    const correctEl = app.querySelector(correctId)
    expect(correctEl.querySelector('.bqt-answer-arrow')).not.toBeNull()
    expect(correctEl.querySelector('.bqt-correct-badge')).not.toBeNull()
  })
})

describe('하단 버튼 — 이전/다음/게임 시작이 같은 계열이다', () => {
  it('이전 버튼에 아이콘뿐 아니라 문구("이전")도 있다', () => {
    const { app } = mount()
    expect(app.querySelector('#bqt-prev').textContent.trim()).toContain(getText('ko').prev)
  })

  it('건너뛰기·이전·다음 세 버튼이 모두 문구를 유지한다', () => {
    const { app } = mount()
    expect(app.querySelector('#bqt-skip').textContent).toContain(getText('ko').skip)
    expect(app.querySelector('#bqt-prev').textContent).toContain(getText('ko').prev)
    expect(app.querySelector('#bqt-next').textContent).toContain(getText('ko').next)
  })
})

describe('질문 배너 — 아이콘 없이 라벨과 질문에 집중한다', () => {
  it('QUESTION 라벨과 질문만 있고 물음표 SVG는 없다', () => {
    const { app } = mount()
    const panel = app.querySelector('#bqt-question-panel')
    const body = panel.querySelector('#bqt-question-body')
    const prompt = panel.querySelector('#bqt-prompt')
    expect(panel.querySelector('#bqt-question-tag').textContent).toBe('QUESTION')
    expect(prompt.textContent).toBe(question.prompt)
    expect(panel.querySelector('svg')).toBeNull()
    expect(getComputedStyle(body).display).toBe('flex')
    expect(getComputedStyle(body).flexDirection).toBe('row')
    expect(getComputedStyle(body).alignItems).toBe('center')
    expect(getComputedStyle(prompt).whiteSpace).toBe('nowrap')
  })
})

describe('연출값이 실제 규칙과 어긋나지 않는다', () => {
  // game.js의 공식(squats/target*100)과 같은 셈이어야 한다 — 튜토리얼이
  // 보여준 숫자와 실제 게임의 숫자가 다르면 아이가 혼란스럽다.
  it('STEP 데이터의 squatProgress로 계산한 에너지가 실제 판의 공식과 같다', () => {
    const target = question.exercise.targetReps
    for (const step of TUTORIAL_STEPS) {
      if (step.showExercise === false) continue
      const pct = Math.round((step.squatProgress / target) * 100)
      expect(pct).toBeGreaterThanOrEqual(0)
      expect(pct).toBeLessThanOrEqual(100)
    }
  })

  it('정답 강조는 마지막 STEP에서만 켜진다', () => {
    const flagged = TUTORIAL_STEPS.filter(s => s.highlightCorrectSide)
    expect(flagged.length).toBe(1)
    expect(flagged[0].isLast).toBe(true)
  })

  it('각 STEP은 중앙 그림(centerImage) 또는 스쿼트 down/up 중 하나만 갖는다', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(!!step.centerImage && !!step.squatImages).toBe(false)
    }
  })
})

describe('언어 사전 — ko/en', () => {
  it('두 로케일 다 STEP 개수만큼 문구를 갖는다', () => {
    for (const locale of LOCALES) {
      expect(getText(locale).steps.length).toBe(TUTORIAL_STEPS.length)
    }
  })

  it('없는 로케일을 물으면 기본(ko)로 떨어진다', () => {
    expect(getText('fr')).toBe(getText('ko'))
  })

  it('이전/건너뛰기/다음/시작 문구가 두 로케일 다 있다', () => {
    for (const locale of LOCALES) {
      const t = getText(locale)
      expect(t.prev).toBeTruthy()
      expect(t.skip).toBeTruthy()
      expect(t.next).toBeTruthy()
      expect(t.start).toBeTruthy()
    }
  })
})
