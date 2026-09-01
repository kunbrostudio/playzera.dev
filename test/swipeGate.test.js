// SwipeGate — 손을 빨리 옆으로 저으면 넘어간다. 천천히 겨누는 움직임과 갈리는 게 핵심.

import { describe, it, expect } from 'vitest'
import { SwipeGate } from '../src/core/swipeGate.js'

const SCREEN = 1000   // 문턱 14% = 140px

describe('SwipeGate', () => {
  it('짧은 시간 안에 문턱 이상 움직이면 방향을 낸다', () => {
    const g = new SwipeGate()
    expect(g.push(0, 500, SCREEN)).toBe(0)
    expect(g.push(100, 550, SCREEN)).toBe(0)     // 아직 50px
    expect(g.push(200, 650, SCREEN)).toBe(1)     // 150px, 창 200ms 안 — 다음
  })

  it('반대 방향도 낸다', () => {
    const g = new SwipeGate()
    g.push(0, 500, SCREEN)
    expect(g.push(200, 350, SCREEN)).toBe(-1)    // 150px 왼쪽 — 이전
  })

  it('같은 거리를 오래 걸려 이동하면(천천히 겨눔) 안 걸린다', () => {
    const g = new SwipeGate({ windowMs: 350 })
    // 500ms에 걸쳐 150px — 창(350ms)을 벗어난 옛 샘플은 버려진다
    let dir = 0
    for (let t = 0; t <= 500; t += 50) {
      dir = g.push(t, 500 + t * 0.3, SCREEN) || dir
    }
    // 어느 한 350ms 구간을 봐도 105px(<140px)뿐이라 안 걸려야 한다
    expect(dir).toBe(0)
  })

  it('문턱 미만이면 안 낸다', () => {
    const g = new SwipeGate()
    g.push(0, 500, SCREEN)
    expect(g.push(100, 600, SCREEN)).toBe(0)    // 100px < 140px
  })

  it('한 번 확정되면 쿨다운 동안 다시 안 낸다', () => {
    const g = new SwipeGate({ cooldownMs: 500 })
    g.push(0, 500, SCREEN)
    expect(g.push(200, 650, SCREEN)).toBe(1)
    // 쿨다운 안에 또 크게 움직여도 무시
    expect(g.push(300, 800, SCREEN)).toBe(0)
    expect(g.push(400, 950, SCREEN)).toBe(0)
  })

  it('쿨다운이 지나면 다시 판정한다', () => {
    const g = new SwipeGate({ cooldownMs: 300 })
    g.push(0, 500, SCREEN)
    expect(g.push(200, 650, SCREEN)).toBe(1)
    // 쿨다운(300ms) 이후 새 창에서 다시 크게 움직이면 낸다
    expect(g.push(600, 650, SCREEN)).toBe(0)     // 새 기준점
    expect(g.push(750, 500, SCREEN)).toBe(-1)
  })

  it('reset()은 지금까지의 움직임을 지운다', () => {
    const g = new SwipeGate()
    g.push(0, 500, SCREEN)
    g.push(100, 600, SCREEN)   // 100px, 아직 문턱 미만
    g.reset()
    // 리셋 후 처음 샘플이라 비교할 게 없어 0
    expect(g.push(150, 700, SCREEN)).toBe(0)
  })

  it('화면 폭이 다르면 문턱도 같이 바뀐다(절대 px가 아니다)', () => {
    const g = new SwipeGate({ distFrac: 0.14 })
    g.push(0, 100, 500)          // 화면 폭 500 → 문턱 70px
    expect(g.push(100, 180, 500)).toBe(1)   // 80px ≥ 70px
  })
})
