// 스토리 대화 화면 — "이전" 버튼이 컷(장면) 경계에서도 살아 있는지. ★
//
// ken 지적(9/3): "각 대화 장면마다 컷이 바뀔때마다 이전 버튼이 비활성화
// 되면 안 된다. 전체 스토리의 맨 처음에서만 비활성화되고 그 이후로는
// 컷이 바뀌어도 활성화되어야 한다." 실제로 `mount`가 순수 DOM 조작이라
// jsdom에서 그대로 실행할 수 있다 — 소스 대신 진짜로 버튼을 눌러 본다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { showStoryScene, showRestBeat } from '../src/games/runner3d/storyDialogue.js'

const scene = (text) => ({ lines: [{ text }] })

describe('스토리 대화 — 이전 버튼 ★', () => {
  it('canGoBack이 없으면(전체 스토리의 첫 장면) 이전 버튼이 꺼져 있다', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    showStoryScene(app, scene('안녕!'), {})   // canGoBack 기본값 false
    const prevBtn = app.querySelector('#r3-story-prev')
    expect(prevBtn.disabled).toBe(true)
  })

  it('★ canGoBack이 있으면 이 장면의 첫 줄이라도 이전 버튼이 켜져 있다', () => {
    // 두 번째 이후 컷은 늘 이걸 켠 채로 불러야 한다(`play3d.js`의
    // 인트로·발견·엔딩 루프가 `sceneIdx > 0`이면 넘긴다).
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    showStoryScene(app, scene('그다음 컷이다'), {}, { canGoBack: true })
    const prevBtn = app.querySelector('#r3-story-prev')
    expect(prevBtn.disabled).toBe(false)
  })

  it('★ 켜진 이전 버튼을 누르면 "prevScene"으로 끝난다 — 앞 컷으로 넘기라는 신호', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    const promise = showStoryScene(app, scene('그다음 컷이다'), {}, { canGoBack: true })
    app.querySelector('#r3-story-prev').click()
    expect(await promise).toBe('prevScene')
  })

  it('한 장면 안에서 둘째 줄부터는 canGoBack 없이도 이전이 늘 켜져 있다', () => {
    // 컷을 안 넘는 "줄 단위" 이전은 원래도 됐다 — 이번 수정이 망가뜨리지 않았는지.
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    showStoryScene(app, { lines: [{ text: '첫 줄' }, { text: '둘째 줄' }] }, {})
    app.querySelector('#r3-story-next').click()
    expect(app.querySelector('#r3-story-prev').disabled).toBe(false)
  })

  // ★ STEP 89 — "이전"(스트로크 셰브론 `back`)과 "다음"(채운 삼각형 `play`)이
  // 서로 다른 그림 언어를 쓰고 있었다(ken QA: "화살표 스타일이 다르다").
  // "다음"의 채운 삼각형을 기준으로 통일 — "이전"은 그걸 좌우 반전한
  // `playBack`을 쓴다. 전역 `back` 아이콘(다른 화면 10여 곳의 일반
  // "뒤로" 버튼)은 안 건드리고, 대화창 전용으로만 바꿨다.
  it('★ 이전·다음 화살표가 같은 스타일이다(채운 삼각형, 좌우 반전) — 스트로크 셰브론과 안 섞인다', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    showStoryScene(app, { lines: [{ text: '한 줄' }] }, {}, { canGoBack: true })
    const prevSvg = app.querySelector('#r3-story-prev svg')
    const nextSvg = app.querySelector('#r3-story-next svg')
    // 둘 다 같은 그림 언어(면으로 채움) — 스트로크 전용 셰브론(fill="none")이 아니다.
    expect(prevSvg.getAttribute('fill')).toBe('currentColor')
    expect(nextSvg.getAttribute('fill')).toBe('currentColor')
    // 크기·선 굵기까지 완전히 같다.
    expect(prevSvg.getAttribute('width')).toBe(nextSvg.getAttribute('width'))
    expect(prevSvg.getAttribute('height')).toBe(nextSvg.getAttribute('height'))
    expect(prevSvg.getAttribute('stroke-width')).toBe(nextSvg.getAttribute('stroke-width'))
    // 삼각형(polygon) 하나로 된 같은 종류의 모양 — "다음"을 좌우 반전한 것.
    expect(prevSvg.querySelector('polygon')).toBeTruthy()
    expect(nextSvg.querySelector('polygon')).toBeTruthy()
  })
})

// `play3d.js`는 인트로·발견·엔딩 세 군데서 이 장면들을 여러 컷으로 이어
// 보여준다. 셋 다 같은 규칙을 지키는지는 실행이 아니라 소스로 본다 —
// 카메라·three.js까지 얽혀 있어 여기서 통째로 실행하기엔 너무 무겁다.
describe('스토리 대화 — play3d.js 세 군데 다 이전을 잇는다 ★', () => {
  const src = readFileSync('src/games/runner3d/play3d.js', 'utf8')
  // 세 루프를 각각 잘라서 본다 — 안 그러면 한 군데만 고치고 나머지를
  // 빠뜨려도 "파일 어딘가에 있다"로 통과해 버린다.
  const introBlock = src.slice(src.indexOf('const introScenes'), src.indexOf('break title'))
  // 레벨 완료 뒤 이야기 컷 루프 — 쥬라기는 `story.found`(발견), 오디세이 런은
  // `story.beats`(스테이지 전환). 둘 다 `const beatScenes` 루프를 탄다.
  const beatBlock = src.slice(src.indexOf('const beatScenes'), src.indexOf('await c()?.setCarrying'))
  const endingBlock = src.slice(src.indexOf('const endingScenes'), src.indexOf('restartGame()\n    })'))

  it('인트로 루프', () => {
    expect(introBlock).toContain('canGoBack: sceneIdx > 0')
    expect(introBlock).toMatch(/introResult === 'prevScene'/)
  })

  it('레벨 완료 컷 루프', () => {
    expect(beatBlock).toContain('canGoBack: fIdx > 0')
    expect(beatBlock).toMatch(/result === 'prevScene'/)
  })

  it('엔딩 루프', () => {
    expect(endingBlock).toContain('canGoBack: eIdx > 0')
    expect(endingBlock).toMatch(/result === 'prevScene'/)
  })
})

// ken 요청(9/3): "왼쪽 위 뒤로가기 버튼은 빼도 될 거 같아." 대사창 안
// "이전"(canGoBack)이 컷 넘나드는 뒤로가기를 이미 다 맡고, 나가기(X) →
// 확인창의 "Home으로"도 같은 onHome을 부르므로 같은 동작이 두 자리에
// 떠 있었다 — 눈에 보이는 버튼만 뺐다. 결과값(`'back'`/`'home'`)은 그대로다.
describe('스토리 대화 — 왼쪽 위 뒤로/Home 버튼은 안 보인다 ★', () => {
  it('#pz-home이 항상 숨겨져 있다(backButton 여부와 무관)', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    showStoryScene(app, scene('안녕!'), {}, { backButton: true })
    expect(app.querySelector('#pz-home').classList.contains('hidden')).toBe(true)
  })

  it('★ 같은 동작은 나가기(X) → 확인창의 "Home으로"로 여전히 갈 수 있다', async () => {
    // 버튼만 숨겼지, onHome 배선 자체는 그대로다 — 확인창의 "Home으로"가
    // 같은 핸들러를 부른다(ui/systemBar.js의 #pz-quit-home).
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    const promise = showStoryScene(app, scene('안녕!'), {}, { backButton: true })
    app.querySelector('#pz-exit').click()
    app.querySelector('#pz-quit-home').click()
    expect(await promise).toBe('back')
  })
})

// ── REST 비트 — 화면 위 20초 카운트다운 + "휴식중..." ★★★ ──────────
// STEP 89 — ken 정책: REST 20초는 "대화 포함 전체 휴식시간"이다. 카운트다운은
// 대사창 **안**이 아니라 화면 맨 위 중앙에 독립적으로 뜨고, REST가 시작하는
// 순간부터 대화 상태와 무관하게 줄어든다. 대화가 먼저 끝나면 대사창은 그대로
// 두고 "휴식중..."을 보여준다. 0이 되면 대화가 안 끝났어도 곧장 다음으로
// 넘어간다. `showRestBeat`가 순수 DOM 조작이라 진짜로 타이머를 돌려 본다
// (`vi.useFakeTimers`) — 소스 정규식보다 훨씬 정확하게 타이밍 버그를 잡는다.
describe('REST 비트 — 화면 위 20초 카운트다운 + "휴식중..." (STEP 89) ★', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="app"></div>'
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('시작하자마자 화면 맨 위에 REST 20 — 대사창 안이 아니다', () => {
    const app = document.querySelector('#app')
    showRestBeat(app, { before: ['안녕'], after: [], seconds: 20 })
    const top = app.querySelector('#r3-rest-topcount')
    expect(top).toBeTruthy()
    expect(top.textContent).toBe('REST 20')
    // STEP 88은 이 칩을 .r3-story-box 안(.r3-story-body)에 뒀다 — 이번엔 밖이다.
    expect(app.querySelector('.r3-story-box').contains(top)).toBe(false)
  })

  it('대화 중에도 카운트다운이 계속 줄어든다', () => {
    const app = document.querySelector('#app')
    showRestBeat(app, { before: ['안녕하세요 반가워요'], after: [], seconds: 20 })
    vi.advanceTimersByTime(1000)
    expect(app.querySelector('#r3-rest-topcount').textContent).toBe('REST 19')
  })

  it('★ 대화가 20초보다 먼저 끝나면 "휴식중..."으로 바뀐다 — 대사창은 그대로, 카운트다운은 계속', () => {
    const app = document.querySelector('#app')
    showRestBeat(app, { before: ['짧다'], after: [], seconds: 20 })   // 자동 넘김 최소값(3.5초) 한 줄뿐
    vi.advanceTimersByTime(4000)   // 3.5초 자동 넘김을 지나 다음 줄이 없어 "휴식중"으로
    const lineEl = app.querySelector('#r3-rest-line')
    expect(lineEl.textContent).toMatch(/^휴식중\.+$/)
    expect(lineEl.className).toMatch(/r3-rest-waiting/)
    // 대사창(.r3-story-box) 자체는 여전히 DOM에 있다 — 화면이 안 사라진다.
    expect(app.querySelector('.r3-story-box')).toBeTruthy()
    // 카운트다운은 멈추지 않았다 — 4초 지났으니 20에서 줄어 있어야 한다.
    expect(app.querySelector('#r3-rest-topcount').textContent).not.toBe('REST 20')
  })

  it('★ 20초가 되면 대화가 한창이어도(다 안 끝났어도) 자동으로 끝난다 — done', async () => {
    const app = document.querySelector('#app')
    // 자동 넘김 상한(8초/줄)짜리 긴 줄 5개 — 다 보려면 40초, 20초로는 어림없다.
    const longLines = Array.from({ length: 5 }, (_, i) => `${'가'.repeat(200)}${i}`)
    const promise = showRestBeat(app, { before: longLines, after: [], seconds: 20 })
    vi.advanceTimersByTime(19000)
    // 19초 시점엔 아직 "휴식중"이 아니어야 한다(대화가 한창) — 강제 종료 전 상태 확인.
    expect(app.querySelector('#r3-rest-line').textContent).not.toMatch(/휴식중/)
    vi.advanceTimersByTime(1000)   // 20초 도달
    expect(await promise).toBe('done')
  })

  it('스킵을 누르면 20초를 안 기다리고 즉시 끝난다', async () => {
    const app = document.querySelector('#app')
    const promise = showRestBeat(app, { before: ['안녕'], after: [], seconds: 20 })
    app.querySelector('#r3-rest-skip').click()
    expect(await promise).toBe('skip')
  })

  it('이전·다음·스킵이 REST에도 항상 있다(스토리 컷과 같은 정책) — 첫 줄에선 이전이 비활성', () => {
    const app = document.querySelector('#app')
    showRestBeat(app, { before: ['첫 줄', '둘째 줄'], after: [], seconds: 20 })
    expect(app.querySelector('#r3-rest-prev')).toBeTruthy()
    expect(app.querySelector('#r3-rest-next')).toBeTruthy()
    expect(app.querySelector('#r3-rest-skip')).toBeTruthy()
    expect(app.querySelector('#r3-rest-prev').disabled).toBe(true)
  })

  it('before/after가 하나로 이어진 대화다 — "다음"으로 before 끝에서 after로 자연스럽게 넘어간다', () => {
    const app = document.querySelector('#app')
    showRestBeat(app, { before: ['비포 줄'], after: ['애프터 줄'], seconds: 20 })
    app.querySelector('#r3-rest-next').click()   // before 끝 → after로
    vi.advanceTimersByTime(200)   // 타이핑 효과(짧은 줄, 36ms/글자)가 끝날 시간
    expect(app.querySelector('#r3-rest-line').textContent).toBe('애프터 줄')
  })
})
