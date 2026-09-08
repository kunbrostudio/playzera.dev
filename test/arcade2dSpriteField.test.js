import { describe, it, expect } from 'vitest'
import { SpriteField } from '../src/games/arcade2d/spriteField.js'
import { PATTERN } from '../src/games/arcade2d/movement.js'

const seq = list => { let i = 0; return () => list[i++ % list.length] }

describe('arcade2d/spriteField — 스폰 위치', () => {
  it('상승 패턴(비눗방울류)은 화면 아래 바깥에서 시작한다', () => {
    const f = new SpriteField()
    const s = f.spawn({ kind: 'bubble', pattern: PATTERN.FLOAT, r: 0.05 })
    expect(s.y).toBeGreaterThan(1)
  })

  it('그 외(풍선류)는 화면 안에서 시작한다', () => {
    const f = new SpriteField({ rng: seq([0.5, 0.5]) })
    const s = f.spawn({ kind: 'balloon', pattern: PATTERN.DRIFT, r: 0.05 })
    expect(s.y).toBeGreaterThanOrEqual(0)
    expect(s.y).toBeLessThanOrEqual(1)
  })
})

describe('arcade2d/spriteField — tick', () => {
  it('화면 밖으로 완전히 나가면 removed로 보고하고 active에서 뺀다', () => {
    const f = new SpriteField()
    f.spawn({ kind: 'bubble', pattern: PATTERN.FLOAT, x: 0.5, y: 0.02, r: 0.05, speed: 0.5 })
    const { removed } = f.tick(1)
    expect(removed.length).toBe(1)
    expect(f.count).toBe(0)
  })

  it('★ attachedTo가 있으면 이동 패턴 대신 손 좌표를 그대로 따라간다', () => {
    const f = new SpriteField()
    const s = f.spawn({ kind: 'balloon', pattern: PATTERN.DRIFT, x: 0.2, y: 0.2, vx: 5, vy: 5 })
    s.attachedTo = 'left'
    f.tick(1, { left: { x: 0.7, y: 0.6 } })
    expect(s.x).toBeCloseTo(0.7)
    expect(s.y).toBeCloseTo(0.6)
  })
})

describe('arcade2d/spriteField — popAt(터뜨리기)', () => {
  it('닿은 스프라이트를 터뜨리고 필드에서 뺀다', () => {
    const f = new SpriteField()
    f.spawn({ kind: 'bubble', pattern: PATTERN.FLOAT, x: 0.5, y: 0.5, r: 0.05 })
    const popped = f.popAt({ x: 0.51, y: 0.5 }, 0.03)
    expect(popped).not.toBeNull()
    expect(popped.popped).toBe(true)
    expect(f.count).toBe(0)
  })

  it('안 닿으면 null', () => {
    const f = new SpriteField()
    f.spawn({ kind: 'bubble', pattern: PATTERN.FLOAT, x: 0.5, y: 0.5, r: 0.05 })
    expect(f.popAt({ x: 0.9, y: 0.9 }, 0.03)).toBeNull()
  })

  it('가장 가까운 것 하나만 터뜨린다', () => {
    const f = new SpriteField()
    f.spawn({ kind: 'bubble', pattern: PATTERN.FLOAT, x: 0.50, y: 0.5, r: 0.05 })
    f.spawn({ kind: 'bubble', pattern: PATTERN.FLOAT, x: 0.55, y: 0.5, r: 0.05 })
    const popped = f.popAt({ x: 0.505, y: 0.5 }, 0.1)
    expect(popped.x).toBeCloseTo(0.50)
    expect(f.count).toBe(1)
  })

  it('popAtHands — 왼손·오른손을 한 번에 검사해 각각 handKey를 붙여 돌려준다', () => {
    const f = new SpriteField()
    f.spawn({ kind: 'bubble', pattern: PATTERN.FLOAT, x: 0.2, y: 0.5, r: 0.05 })
    f.spawn({ kind: 'bubble', pattern: PATTERN.FLOAT, x: 0.8, y: 0.5, r: 0.05 })
    const hits = f.popAtHands({ left: { x: 0.2, y: 0.5 }, right: { x: 0.8, y: 0.5 } }, 0.03)
    expect(hits.length).toBe(2)
    expect(hits.find(h => h.handKey === 'left')).toBeTruthy()
    expect(hits.find(h => h.handKey === 'right')).toBeTruthy()
  })
})

describe('arcade2d/spriteField — attach·collectInBasket(잡기)', () => {
  it('손이 닿으면 붙잡는다', () => {
    const f = new SpriteField()
    f.spawn({ kind: 'balloon', pattern: PATTERN.DRIFT, x: 0.5, y: 0.5, r: 0.05 })
    const s = f.attach('left', { x: 0.51, y: 0.5 }, 0.03)
    expect(s).not.toBeNull()
    expect(s.attachedTo).toBe('left')
  })

  it('이미 그 손이 뭔가 붙잡고 있으면 새로 안 붙잡는다', () => {
    const f = new SpriteField()
    const a = f.spawn({ kind: 'balloon', pattern: PATTERN.DRIFT, x: 0.3, y: 0.5, r: 0.05 })
    a.attachedTo = 'left'
    f.spawn({ kind: 'balloon', pattern: PATTERN.DRIFT, x: 0.7, y: 0.5, r: 0.05 })
    const s = f.attach('left', { x: 0.71, y: 0.5 }, 0.05)
    expect(s).toBeNull()
  })

  it('★ 바구니 영역에 들어와야 수거되고, 아니면 안 된다', () => {
    const f = new SpriteField()
    const s = f.spawn({ kind: 'balloon', pattern: PATTERN.DRIFT, x: 0.5, y: 0.5, r: 0.05 })
    s.attachedTo = 'left'
    const basket = { x0: 0.4, x1: 0.6, y0: 0.85, y1: 1.0 }
    expect(f.collectInBasket('left', basket)).toBeNull()   // 아직 바구니 밖
    s.x = 0.5; s.y = 0.9
    const collected = f.collectInBasket('left', basket)
    expect(collected).not.toBeNull()
    expect(f.count).toBe(0)
  })

  it('release — 손이 놓치면 다시 자유롭게 움직인다', () => {
    const f = new SpriteField()
    const s = f.spawn({ kind: 'balloon', pattern: PATTERN.DRIFT, x: 0.5, y: 0.5, r: 0.05 })
    s.attachedTo = 'left'
    f.release('left')
    expect(s.attachedTo).toBeNull()
  })
})
