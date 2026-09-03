// 스토리 대화 화면 — "이전" 버튼이 컷(장면) 경계에서도 살아 있는지. ★
//
// ken 지적(9/3): "각 대화 장면마다 컷이 바뀔때마다 이전 버튼이 비활성화
// 되면 안 된다. 전체 스토리의 맨 처음에서만 비활성화되고 그 이후로는
// 컷이 바뀌어도 활성화되어야 한다." 실제로 `mount`가 순수 DOM 조작이라
// jsdom에서 그대로 실행할 수 있다 — 소스 대신 진짜로 버튼을 눌러 본다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { showStoryScene } from '../src/games/runner3d/storyDialogue.js'

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
})

// `play3d.js`는 인트로·발견·엔딩 세 군데서 이 장면들을 여러 컷으로 이어
// 보여준다. 셋 다 같은 규칙을 지키는지는 실행이 아니라 소스로 본다 —
// 카메라·three.js까지 얽혀 있어 여기서 통째로 실행하기엔 너무 무겁다.
describe('스토리 대화 — play3d.js 세 군데 다 이전을 잇는다 ★', () => {
  const src = readFileSync('src/games/runner3d/play3d.js', 'utf8')
  // 세 루프를 각각 잘라서 본다 — 안 그러면 한 군데만 고치고 나머지를
  // 빠뜨려도 "파일 어딘가에 있다"로 통과해 버린다.
  const introBlock = src.slice(src.indexOf('const introScenes'), src.indexOf('break title'))
  const foundBlock = src.slice(src.indexOf('const foundScenes'), src.indexOf('await c()?.setCarrying'))
  const endingBlock = src.slice(src.indexOf('const endingScenes'), src.indexOf('restartGame()\n    })'))

  it('인트로 루프', () => {
    expect(introBlock).toContain('canGoBack: sceneIdx > 0')
    expect(introBlock).toMatch(/introResult === 'prevScene'/)
  })

  it('발견 루프', () => {
    expect(foundBlock).toContain('canGoBack: fIdx > 0')
    expect(foundBlock).toMatch(/result === 'prevScene'/)
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
