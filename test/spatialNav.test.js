// 방향키로 갈 곳 고르기 — 순수 계산 (STEP 75)
//
// 이 계산이 리모컨 조작감의 전부다. 잘못 고르면 부모가 ▶를 눌렀는데
// 엉뚱한 데로 튀는데, 그건 화면을 보고 있어야만 알 수 있는 버그라
// 실기기에서 잡기 어렵다. 실제로 나올 배치들을 여기서 만들어 확인한다.
import { describe, it, expect } from 'vitest'
import { pickInDirection, pickPrimary } from '../src/core/spatialNav.js'

/** 보기 쉬우라고 x,y,w,h로 적는다. */
const box = (id, x, y, w = 100, h = 60) => ({ id, rect: { left: x, top: y, width: w, height: h } })
const rectOf = b => b.rect

describe('기본 방향', () => {
  const a = box('a', 0, 0)
  const b = box('b', 200, 0)
  const c = box('c', 0, 200)
  const all = [a, b, c]

  it('오른쪽에 있는 것으로 간다', () => {
    expect(pickInDirection(rectOf(a), all, 'right')).toBe('b')
  })

  it('왼쪽으로 되돌아온다', () => {
    expect(pickInDirection(rectOf(b), all, 'left')).toBe('a')
  })

  it('아래로 간다', () => {
    expect(pickInDirection(rectOf(a), all, 'down')).toBe('c')
  })

  it('위로 되돌아온다', () => {
    expect(pickInDirection(rectOf(c), all, 'up')).toBe('a')
  })
})

describe('그 방향에 없으면 안 움직인다 ★', () => {
  const a = box('a', 0, 0)
  const b = box('b', 200, 0)

  it('줄 끝에서 더 가면 null — 반대쪽으로 감기지 않는다', () => {
    // 3m 떨어져 보는 사람은 갑자기 반대쪽 끝으로 가면 왜 갔는지 모른다.
    expect(pickInDirection(rectOf(b), [a, b], 'right')).toBeNull()
    expect(pickInDirection(rectOf(a), [a, b], 'left')).toBeNull()
  })

  it('후보가 자기 자신뿐이면 null', () => {
    expect(pickInDirection(rectOf(a), [a], 'right')).toBeNull()
  })

  it('후보가 없으면 null', () => {
    expect(pickInDirection(rectOf(a), [], 'down')).toBeNull()
  })
})

describe('가로로 늘어선 카드 레일 ★ (허브에서 게임 고르기)', () => {
  // 실제 배치: 카드 넷이 한 줄, 그 아래 하단 버튼 하나.
  const cards = [box('c1', 0, 100), box('c2', 120, 100), box('c3', 240, 100), box('c4', 360, 100)]
  const bottom = box('start', 0, 400, 400, 80)
  const all = [...cards, bottom]

  it('바로 옆 카드로 간다 — 한 칸씩', () => {
    expect(pickInDirection(rectOf(cards[0]), all, 'right')).toBe('c2')
    expect(pickInDirection(rectOf(cards[1]), all, 'right')).toBe('c3')
  })

  it('두 칸을 건너뛰지 않는다', () => {
    expect(pickInDirection(rectOf(cards[0]), all, 'right')).not.toBe('c3')
  })

  it('★ 같은 줄 옆 카드가 아래 큰 버튼에 지지 않는다', () => {
    // 부축 벌점이 없으면 아래 버튼이 더 가깝게 계산될 수 있다.
    expect(pickInDirection(rectOf(cards[0]), all, 'right')).toBe('c2')
  })

  it('아래로 누르면 하단 버튼으로 간다', () => {
    expect(pickInDirection(rectOf(cards[2]), all, 'down')).toBe('start')
  })

  it('하단 버튼에서 위로 누르면 카드 줄로 돌아온다', () => {
    expect(cards.map(c => c.id)).toContain(pickInDirection(rectOf(bottom), all, 'up'))
  })
})

describe('격자 배치 (게임 그리드 2열)', () => {
  //  g1 g2
  //  g3 g4
  const g1 = box('g1', 0, 0), g2 = box('g2', 150, 0)
  const g3 = box('g3', 0, 100), g4 = box('g4', 150, 100)
  const all = [g1, g2, g3, g4]

  it('같은 줄에서 옆으로', () => {
    expect(pickInDirection(rectOf(g1), all, 'right')).toBe('g2')
    expect(pickInDirection(rectOf(g3), all, 'right')).toBe('g4')
  })

  it('같은 칸에서 아래로 — 대각선으로 새지 않는다', () => {
    expect(pickInDirection(rectOf(g1), all, 'down')).toBe('g3')
    expect(pickInDirection(rectOf(g2), all, 'down')).toBe('g4')
  })

  it('위로도 칸을 지킨다', () => {
    expect(pickInDirection(rectOf(g4), all, 'up')).toBe('g2')
  })
})

describe('스토리 대화창 (이전·다음·스킵 한 줄)', () => {
  // 실제 배치: 왼쪽에 이전·다음이 붙어 있고 스킵만 오른쪽 끝
  const prev = box('prev', 40, 500, 90, 50)
  const next = box('next', 140, 500, 90, 50)
  const skip = box('skip', 700, 500, 90, 50)
  const all = [prev, next, skip]

  it('다음에서 오른쪽으로 가면 멀리 떨어진 스킵으로 간다', () => {
    expect(pickInDirection(rectOf(next), all, 'right')).toBe('skip')
  })

  it('다음에서 왼쪽은 이전이다', () => {
    expect(pickInDirection(rectOf(next), all, 'left')).toBe('prev')
  })

  it('스킵에서 왼쪽으로 오면 더 가까운 다음이 이긴다', () => {
    expect(pickInDirection(rectOf(skip), all, 'left')).toBe('next')
  })
})

describe('크기가 0인 것은 건너뛴다', () => {
  it('안 보이는 요소(rect 0)는 후보가 아니다', () => {
    const a = box('a', 0, 0)
    const hidden = { id: 'hidden', rect: { left: 120, top: 0, width: 0, height: 0 } }
    const far = box('far', 300, 0)
    expect(pickInDirection(rectOf(a), [a, hidden, far], 'right')).toBe('far')
  })

  it('rect가 없는 후보도 건너뛴다', () => {
    const a = box('a', 0, 0)
    expect(pickInDirection(rectOf(a), [a, { id: 'x', rect: null }], 'right')).toBeNull()
  })
})

describe('겹쳐 있는 것끼리는 안 튄다', () => {
  it('거의 같은 자리면 그 방향에 있다고 보지 않는다', () => {
    const a = box('a', 100, 100)
    const almost = box('almost', 101, 100)   // 1px — MIN_STEP 미만
    expect(pickInDirection(rectOf(a), [a, almost], 'right')).toBeNull()
  })
})

describe('pickPrimary — 처음 포커스 자리', () => {
  it('가장 큰 것을 고른다 — 이 디자인에서 큰 버튼이 곧 주 동작이다', () => {
    const small = box('small', 0, 0, 40, 40)
    const big = box('big', 100, 0, 300, 120)
    expect(pickPrimary([small, big])).toBe('big')
  })

  it('후보가 없으면 null', () => {
    expect(pickPrimary([])).toBeNull()
  })

  it('rect 없는 것은 건너뛴다', () => {
    const ok = box('ok', 0, 0, 50, 50)
    expect(pickPrimary([{ id: 'x', rect: null }, ok])).toBe('ok')
  })
})
