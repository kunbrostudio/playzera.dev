import { describe, it, expect } from 'vitest'
import { makeSprite, stepSprite, PATTERN } from '../src/games/arcade2d/movement.js'

describe('arcade2d/movement — drift(풍선 기본)', () => {
  it('등속으로 이동한다', () => {
    const s = makeSprite({ id: 1, kind: 'balloon', x: 0.5, y: 0.5, vx: 0.1, vy: 0, pattern: PATTERN.DRIFT })
    stepSprite(s, 1)
    expect(s.x).toBeCloseTo(0.6)
    expect(s.y).toBeCloseTo(0.5)
  })

  it('★ 가장자리에서 튕긴다 — 화면 밖으로 안 나간다', () => {
    const s = makeSprite({ id: 1, kind: 'balloon', x: 0.97, y: 0.5, r: 0.05, vx: 0.5, vy: 0, pattern: PATTERN.DRIFT })
    stepSprite(s, 1)
    expect(s.x).toBeLessThanOrEqual(1 - s.r + 1e-9)
    expect(s.vx).toBeLessThan(0)   // 방향이 뒤집혔다
    expect(s.gone).toBe(false)
  })
})

describe('arcade2d/movement — flee(풍선 CHASE POP)', () => {
  it('손이 멀면 아무 효과가 없다', () => {
    const s = makeSprite({ id: 1, kind: 'balloon', x: 0.5, y: 0.5, vx: 0.1, vy: 0, pattern: PATTERN.FLEE })
    const before = { vx: s.vx, vy: s.vy }
    stepSprite(s, 0.1, { hands: [{ x: 0.05, y: 0.05 }] })
    expect(s.vx).toBeCloseTo(before.vx, 5)
    expect(s.vy).toBeCloseTo(before.vy, 5)
  })

  it('★ 손이 가까우면 반대 방향으로 살짝 밀리되, 과도하게 회피하지 않는다', () => {
    const s = makeSprite({ id: 1, kind: 'balloon', x: 0.5, y: 0.5, vx: 0, vy: 0, speed: 0.2, pattern: PATTERN.FLEE })
    stepSprite(s, 0.1, { hands: [{ x: 0.52, y: 0.5 }] })   // 오른쪽에서 접근
    expect(s.vx).toBeLessThan(0)   // 왼쪽(반대)으로 밀린다
    // 속도가 speed를 넘지 않는다 — "세게 도망가지 않는다"
    expect(Math.hypot(s.vx, s.vy)).toBeLessThanOrEqual(s.speed + 1e-9)
  })
})

describe('arcade2d/movement — float(비눗방울 기본)', () => {
  it('천천히 위로 상승한다', () => {
    const s = makeSprite({ id: 1, kind: 'bubble', x: 0.5, y: 0.5, speed: 0.1, pattern: PATTERN.FLOAT })
    stepSprite(s, 1)
    expect(s.y).toBeCloseTo(0.4)
  })

  it('★ 화면 위로 완전히 나가면 gone이 된다', () => {
    const s = makeSprite({ id: 1, kind: 'bubble', x: 0.5, y: 0.02, r: 0.05, speed: 0.5, pattern: PATTERN.FLOAT })
    stepSprite(s, 1)
    expect(s.gone).toBe(true)
  })
})

describe('arcade2d/movement — sway·curve(비눗방울 변형)', () => {
  it('sway는 좌우로 흔들리며 상승한다', () => {
    const s = makeSprite({ id: 1, kind: 'bubble', x: 0.5, y: 0.5, speed: 0.1, phase: 0, pattern: PATTERN.SWAY })
    stepSprite(s, 0.2)
    expect(s.y).toBeLessThan(0.5)
    expect(s.x).not.toBeCloseTo(0.5, 5)
  })

  it('curve는 완만한 곡선으로 상승한다', () => {
    const s = makeSprite({ id: 1, kind: 'bubble', x: 0.5, y: 0.5, speed: 0.1, phase: 0.3, pattern: PATTERN.CURVE })
    stepSprite(s, 0.2)
    expect(s.y).toBeLessThan(0.5)
  })
})

describe('arcade2d/movement — 이미 터졌거나 사라진 스프라이트', () => {
  it('popped면 더 안 움직인다', () => {
    const s = makeSprite({ id: 1, kind: 'balloon', x: 0.5, y: 0.5, vx: 1, pattern: PATTERN.DRIFT })
    s.popped = true
    stepSprite(s, 1)
    expect(s.x).toBe(0.5)
  })
})
