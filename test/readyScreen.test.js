// 카메라 준비 화면 — 버튼 이름.
//
// `readyScreen.js`는 카메라 참조를 들고 `getUserMedia`까지 부르므로 jsdom에서
// 그대로 실행하기 무겁다(다른 스토리 화면 테스트도 실행 대신 소스를 읽는
// 방식을 쓴다 — `test/runner3d.test.js`의 캐릭터 반전 테스트 참고). 여기서도
// 소스 텍스트로 버튼 이름이 실제로 바뀌었는지만 본다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const src = readFileSync('src/core/readyScreen.js', 'utf8')

// 실제 버튼 마크업 줄만 뽑아서 본다 — 지난 이름을 설명하는 주석까지 걸리면
// "왜 바꿨나"를 못 적게 된다.
const autoBtnLine = src.split('\n').find(l => l.includes('id="rdy-auto"'))
const keyboardBtnLine = src.split('\n').find(l => l.includes('id="rdy-keyboard"'))

describe('준비 화면 버튼 이름 ★', () => {
  it('"자동으로 보기"는 "자율주행 모드"로 바뀌었다', () => {
    // 카메라가 있어도 고를 수 있는 나란한 선택지라는 뜻은 그대로다 —
    // 이름만 "무엇으로 조작하나"를 뜻하도록 "키보드 모드"와 짝을 맞췄다(ken 지적, 9/2).
    expect(autoBtnLine).toContain('자율주행 모드')
    expect(autoBtnLine).not.toContain('자동으로 보기')
  })

  it('"키보드로 하기"는 "키보드 모드"로 바뀌었다', () => {
    expect(keyboardBtnLine).toContain('키보드 모드')
    expect(keyboardBtnLine).not.toContain('키보드로 하기')
  })

  it('버튼 id·클릭 배선은 그대로다 — 이름만 바뀌고 동작은 안 바뀌어야 한다', () => {
    expect(src).toContain('id="rdy-auto"')
    expect(src).toContain("finish('auto')")
    expect(src).toContain('id="rdy-keyboard"')
    expect(src).toContain("finish('keyboard')")
  })
})
