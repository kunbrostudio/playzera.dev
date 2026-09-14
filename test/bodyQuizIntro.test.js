// 바디 퀴즈 인트로 — thum_bodyquiz.png 한 장 + START 버튼.
//
// 실제 `navigate()`(해시 변경 → 라우터 render() 전체 재실행)까지는 안
// 태운다 — 다른 게임 인트로 테스트들도 그렇듯, 여기서 확인할 것은 화면이
// 만드는 DOM과 "START가 어디로 가야 하는가"라는 순수 규칙이지 라우터
// 자체의 동작이 아니다.

import { describe, it, expect } from 'vitest'
import bodyQuizIntro, { resolveStartRoute } from '../src/games/body-quiz/intro.js'
import { getPlayRoute } from '../src/games/registry.js'

function mount(query = { id: 'body-quiz' }) {
  document.body.innerHTML = '<div id="app"></div>'
  const app = document.querySelector('#app')
  bodyQuizIntro(app, query)
  return app
}

describe('인트로 화면 — thum_bodyquiz.png 하나로 완성된 비주얼', () => {
  it('히어로 이미지가 정확한 경로를 가리킨다', () => {
    const app = mount()
    expect(app.querySelector('#bqi-hero').getAttribute('src'))
      .toBe('/assets/body-quiz/intro/thum_bodyquiz.png')
  })

  it('START 버튼과 Home 버튼이 있다 — 타이틀·캐릭터는 코드로 다시 안 그린다', () => {
    const app = mount()
    expect(app.querySelector('#bqi-start')).not.toBeNull()
    expect(app.querySelector('#bqi-back')).not.toBeNull()
    // 그림 안에 이미 로고가 있으므로 별도 <h1>류 타이틀 텍스트를 안 만든다
    expect(app.querySelector('h1, #bqi-title')).toBeNull()
  })
})

describe('START가 갈 곳 — resolveStartRoute', () => {
  it('보통은 곧장 플레이 라우트다', () => {
    expect(resolveStartRoute({})).toBe(getPlayRoute('body-quiz'))
  })

  // 튜토리얼을 실제로 띄울지는 play.js의 shouldShowTutorial()이 결정한다.
  // 인트로는 그 판단을 다시 하지 않고 쿼리만 그대로 옮겨 붙인다.
  it('?tutorial=1로 들어왔으면 그 강제 표시를 play 라우트까지 이어 붙인다', () => {
    expect(resolveStartRoute({ tutorial: '1' })).toBe(`${getPlayRoute('body-quiz')}&tutorial=1`)
  })

  it('tutorial 쿼리가 없으면 이어 붙이지 않는다', () => {
    expect(resolveStartRoute({ id: 'body-quiz' })).toBe(getPlayRoute('body-quiz'))
  })
})
