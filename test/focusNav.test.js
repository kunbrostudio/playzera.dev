// 포커스와 방향 이동 — DOM에 붙는 층 (STEP 75)
//
// 고르는 계산 자체는 `spatialNav.test.js`가 본다. 여기서는 그 위에 얹힌
// 것들만 확인한다 — **안 켜져 있을 땐 아무것도 안 하는가**, 화면이
// `innerHTML`로 통째로 갈려도 포커스를 다시 잡는가, 안 보이는 버튼을
// 피하는가, 누르면 `click()`이 가는가.
//
// jsdom은 레이아웃을 안 하므로 `getBoundingClientRect()`가 전부 0이다 —
// 자리를 직접 심어 준다(`place`). 그래도 "어느 요소를 고르는가"의 논리는
// 실제와 같다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { focusNav, labelOf } from '../src/core/focusNav.js'

/** 이 요소가 화면의 이 자리에 있다고 알려 준다(jsdom은 레이아웃을 안 한다). */
function place(el, x, y, w = 100, h = 60) {
  el.getBoundingClientRect = () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h })
  el.checkVisibility = () => w > 0 && h > 0
  return el
}

function button(label, x, y, w, h) {
  const b = document.createElement('button')
  b.setAttribute('data-pz-hit', '')
  b.textContent = label
  document.body.appendChild(b)
  return place(b, x, y, w, h)
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
})
afterEach(() => { focusNav.disable(); vi.unstubAllGlobals() })

describe('안 켜져 있으면 아무것도 안 한다 ★', () => {
  it('꺼진 상태에서는 이동도 선택도 안 먹는다', () => {
    const b = button('시작', 0, 0)
    const spy = vi.fn()
    b.addEventListener('click', spy)
    expect(focusNav.move('right')).toBe(false)
    expect(focusNav.activate()).toBe(false)
    expect(spy).not.toHaveBeenCalled()
  })

  it('꺼진 상태에서는 링을 안 만든다 — 아이 화면에 설명 없는 표시가 뜨면 안 된다', () => {
    button('시작', 0, 0)
    expect(document.getElementById('pz-focus-ring')).toBeNull()
  })

  it('끄면 링이 사라진다', () => {
    button('시작', 0, 0)
    focusNav.enable()
    expect(document.getElementById('pz-focus-ring')).not.toBeNull()
    focusNav.disable()
    expect(document.getElementById('pz-focus-ring')).toBeNull()
  })
})

describe('처음 포커스 자리', () => {
  it('가장 큰 버튼을 고른다 — 이 디자인에서 큰 것이 곧 주 동작이다', () => {
    button('작은거', 0, 0, 40, 40)
    button('시작하기', 100, 0, 300, 120)
    focusNav.enable()
    expect(focusNav.label).toBe('시작하기')
  })

  it('화면이 data-pz-focus-first로 지정하면 그것을 따른다', () => {
    const big = button('큰거', 0, 0, 300, 120)
    const want = button('여기', 400, 0, 40, 40)
    want.setAttribute('data-pz-focus-first', '')
    focusNav.enable()
    expect(focusNav.label).toBe('여기')
    expect(big).toBeTruthy()
  })
})

describe('이동과 선택', () => {
  it('방향키로 옮기고 이름이 바뀐다', () => {
    button('왼쪽', 0, 0)
    button('오른쪽', 200, 0)
    focusNav.enable()
    // 둘이 같은 크기라 어느 쪽이 잡혔든, 왼쪽으로 끝까지 밀면 왼쪽이다
    focusNav.move('left')
    expect(focusNav.label).toBe('왼쪽')
    expect(focusNav.move('right')).toBe(true)
    expect(focusNav.label).toBe('오른쪽')
  })

  it('그 방향에 없으면 false를 내고 제자리에 있는다', () => {
    button('하나', 0, 0)
    focusNav.enable()
    expect(focusNav.move('right')).toBe(false)
    expect(focusNav.label).toBe('하나')
  })

  it('★ 선택하면 click이 간다 — 손 커서 머무르기와 같은 길이다', () => {
    const b = button('시작하기', 0, 0, 300, 120)
    const spy = vi.fn()
    b.addEventListener('click', spy)
    focusNav.enable()
    expect(focusNav.activate()).toBe(true)
    expect(spy).toHaveBeenCalledTimes(1)
  })
})

describe('화면이 통째로 갈려도 견딘다 ★', () => {
  it('innerHTML로 화면이 바뀌면 새 화면에서 다시 잡는다', () => {
    button('옛화면', 0, 0, 300, 120)
    focusNav.enable()
    expect(focusNav.label).toBe('옛화면')

    document.body.innerHTML = ''
    button('새화면', 0, 0, 300, 120)
    // 관찰자는 비동기라, 이동을 시도하면 그 자리에서 다시 잡는다
    focusNav.move('right')
    expect(focusNav.label).toBe('새화면')
  })

  it('포커스가 살아 있으면 DOM이 바뀌어도 안 옮겨 다닌다', () => {
    button('작은거', 0, 0, 40, 40)
    const big = button('큰거', 200, 0, 300, 120)
    focusNav.enable()
    focusNav.move('left')
    expect(focusNav.label).toBe('작은거')

    // 게임 중에는 DOM이 쉴 새 없이 바뀐다 — 그때마다 포커스가 제일 큰
    // 것으로 돌아가면 부모가 겨누던 버튼이 발밑에서 사라진다.
    document.body.appendChild(place(document.createElement('div'), 0, 0, 10, 10))
    focusNav._reacquire()
    expect(focusNav.label).toBe('작은거')
    expect(big).toBeTruthy()
  })
})

describe('짚을 수 없는 것은 건너뛴다', () => {
  it('data-pz-hit이 없는 것은 후보가 아니다', () => {
    button('버튼', 0, 0, 300, 120)
    const plain = document.createElement('button')
    plain.textContent = '그냥버튼'
    document.body.appendChild(place(plain, 400, 0, 400, 200))
    focusNav.enable()
    expect(focusNav.label).toBe('버튼')
  })

  it('disabled는 건너뛴다', () => {
    const a = button('가능', 0, 0, 100, 60)
    const b = button('불가능', 200, 0, 300, 200)
    b.disabled = true
    focusNav.enable()
    expect(focusNav.label).toBe('가능')
    expect(a).toBeTruthy()
  })

  it('hidden은 건너뛴다', () => {
    button('보임', 0, 0, 100, 60)
    const h = button('숨김', 200, 0, 300, 200)
    h.setAttribute('hidden', '')
    focusNav.enable()
    expect(focusNav.label).toBe('보임')
  })

  it('크기가 0인 것은 건너뛴다 — 링이 사라진 것처럼 보이면 안 된다', () => {
    button('보임', 0, 0, 100, 60)
    button('접힘', 200, 0, 0, 0)
    focusNav.enable()
    expect(focusNav.label).toBe('보임')
  })
})

describe('labelOf — 폰에 보낼 이름', () => {
  it('글자가 있으면 글자를 쓴다', () => {
    const b = document.createElement('button')
    b.textContent = '  시작 하기 \n '
    expect(labelOf(b)).toBe('시작 하기')
  })

  it('★ 아이콘만 있는 버튼은 aria-label을 쓴다', () => {
    // 햄버거·나가기가 이 경우다 — 글자가 없어서 이게 없으면 "버튼"만 뜬다.
    const b = document.createElement('button')
    b.setAttribute('aria-label', '나가기')
    b.innerHTML = '<img src="x.png" alt="">'
    expect(labelOf(b)).toBe('나가기')
  })

  it('둘 다 없으면 그냥 버튼이라고 한다', () => {
    expect(labelOf(document.createElement('button'))).toBe('버튼')
  })
})
