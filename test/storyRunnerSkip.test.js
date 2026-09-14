// 풍선 팡팡 — 모든 Story/Dialogue 화면에 예외 없이 SKIP이 있어야 한다는
// 요청(STEP 96, STEP 99에서 재확인). 처음엔 `skipEvenOnLast`를 호출부가
// 켜야만(opt-in) 마지막 장면에도 스킵이 보이게 했는데, STEP 99에서 "최초
// Story 화면"(장면 하나뿐이라 늘 "마지막 장면")에서도 SKIP이 실제로
// 안 보이는 문제가 재발했다 — 호출부(`play.js`)가 그 옵션을 안 켰기
// 때문이다. 매번 호출부가 기억해야 하는 opt-in은 결국 빠뜨리는 곳이
// 생긴다 — 그래서 **기본값을 true로 뒤집었다**(opt-out으로). 여러
// 장면짜리 스토리(인트로·전환)의 기존 동작(마지막 장면 전까지만 스킵)이
// 필요하면 `skipEvenOnLast: false`로 명시해야 한다 — 지금 이 저장소의
// 호출부는 전부 기본값(SKIP 항상 보임)을 그대로 쓴다.
import { describe, it, expect } from 'vitest'
import { runStory } from '../src/games/arcade2d/storyRunner.js'

const oneScene = text => [{ lines: [{ text }] }]
const twoScenes = (a, b) => [{ lines: [{ text: a }] }, { lines: [{ text: b }] }]

describe('runStory — SKIP 기본값이 예외 없이 켜진다(opt-out)', () => {
  it('★ 장면이 하나뿐이어도(늘 "마지막 장면") 아무 옵션 없이 스킵 버튼이 보인다', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    runStory(app, oneScene('안녕!'), {}, { skippable: true })
    expect(app.querySelector('#r3-story-skip')).toBeTruthy()
  })

  it('skipEvenOnLast: false를 명시하면 예전 정책(마지막 장면엔 숨김)으로 되돌릴 수 있다', () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    runStory(app, oneScene('안녕!'), {}, { skippable: true, skipEvenOnLast: false })
    expect(app.querySelector('#r3-story-skip')).toBeFalsy()
  })

  it('★ 스킵 버튼을 누르면 runStory가 곧장 "skip"으로 끝난다', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    const promise = runStory(app, oneScene('레벨 클리어!'), {}, { skippable: true })
    app.querySelector('#r3-story-skip').click()
    expect(await promise).toBe('skip')
  })

  it('여러 장면짜리 스토리(인트로·전환)도 기본값 그대로 마지막 장면까지 스킵이 보인다', async () => {
    document.body.innerHTML = '<div id="app"></div>'
    const app = document.querySelector('#app')
    const promise = runStory(app, twoScenes('첫 장면', '마지막 장면'), {}, { skippable: true })
    app.querySelector('#r3-story-next').click()   // 첫 장면 넘기고 마지막 장면으로
    // 장면 전환은 showStoryScene의 Promise가 풀린 뒤 runStory의 while
    // 루프가 다음 장면을 그리는 마이크로태스크 뒤에 일어난다 — 클릭
    // 직후 동기적으로 안 끝난다.
    await Promise.resolve()
    await Promise.resolve()
    expect(app.querySelector('#r3-story-skip')).toBeTruthy()
    app.querySelector('#r3-story-skip').click()
    expect(await promise).toBe('skip')
  })
})
