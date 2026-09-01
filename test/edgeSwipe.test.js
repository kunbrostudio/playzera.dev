// EdgeSwipeGate — 끝(피크)에 손이 닿아야 무장되고, 그 방향으로 당겨야 확정된다.
// 레일 가운데를 오가는 움직임은 애초에 무장되지 않으니 안 걸려야 한다.

import { describe, it, expect } from 'vitest'
import { EdgeSwipeGate } from '../src/core/edgeSwipe.js'

const SCREEN = 1000   // pullFrac 기본 3.5% = 35px · cancelFrac 5% = 50px

describe('EdgeSwipeGate', () => {
  it('오른쪽 끝에서 무장한 뒤 왼쪽으로 당기면 다음(1)을 낸다', () => {
    const g = new EdgeSwipeGate()
    g.enterZone('right', 900, 0)
    expect(g.update(880, SCREEN, 100)).toBe(0)     // 20px, 문턱(35px) 미만
    expect(g.update(860, SCREEN, 200)).toBe(1)     // 40px ≥ 35px — 확정
  })

  it('왼쪽 끝에서 무장한 뒤 오른쪽으로 당기면 이전(-1)을 낸다', () => {
    const g = new EdgeSwipeGate()
    g.enterZone('left', 100, 0)
    expect(g.update(120, SCREEN, 100)).toBe(0)     // 20px, 문턱(35px) 미만
    expect(g.update(140, SCREEN, 200)).toBe(-1)    // 40px ≥ 35px — 확정
  })

  it('무장하지 않았으면(가운데를 오가는 움직임) 아무 것도 안 낸다', () => {
    const g = new EdgeSwipeGate()
    // enterZone을 한 번도 안 불렀다 — 레일 가운데를 아무리 오가도 armedSide가 없다
    expect(g.update(500, SCREEN, 0)).toBe(0)
    expect(g.update(50, SCREEN, 100)).toBe(0)
    expect(g.update(950, SCREEN, 200)).toBe(0)
  })

  it('반대로 물러나면(취소 문턱 이상) 무장이 풀리고 그 뒤엔 안 걸린다', () => {
    const g = new EdgeSwipeGate()
    g.enterZone('right', 900, 0)
    // 오른쪽(반대 방향)으로 50px 이상 물러난다 — cancelFrac 5% = 50px
    expect(g.update(955, SCREEN, 100)).toBe(0)
    expect(g.armedSide).toBe(null)
    // 무장이 풀렸으니 이제 왼쪽으로 크게 움직여도 안 걸린다(다시 끝에 닿아야 한다)
    expect(g.update(800, SCREEN, 200)).toBe(0)
  })

  it('시간이 너무 지나면(timeoutMs) 저절로 풀린다', () => {
    const g = new EdgeSwipeGate({ timeoutMs: 1000 })
    g.enterZone('right', 900, 0)
    expect(g.update(890, SCREEN, 1500)).toBe(0)   // 10px밖에 안 당겼지만 시간 초과가 먼저
    expect(g.armedSide).toBe(null)
  })

  it('이미 무장된 쪽으로 다시 enterZone을 불러도 기준점(anchor)이 안 바뀐다', () => {
    const g = new EdgeSwipeGate()
    g.enterZone('right', 900, 0)
    g.enterZone('right', 870, 50)   // 같은 방향 — 무시된다(재무장 아님)
    // anchor가 900 그대로라면 860은 40px 당긴 것 — 확정
    expect(g.update(860, SCREEN, 100)).toBe(1)
  })

  it('반대쪽 끝으로 손이 넘어가면 그쪽으로 다시 무장한다(기준점도 새로 잡는다)', () => {
    const g = new EdgeSwipeGate()
    g.enterZone('right', 900, 0)
    g.enterZone('left', 100, 50)    // 반대쪽으로 무장 전환
    expect(g.armedSide).toBe('left')
    expect(g.update(130, SCREEN, 100)).toBe(0)    // 30px, 문턱(35px) 미만
    expect(g.update(140, SCREEN, 150)).toBe(-1)   // 40px — 확정(이전)
  })

  it('reset()은 확정 이벤트 없이 조용히 무장을 지운다', () => {
    const g = new EdgeSwipeGate()
    g.enterZone('right', 900, 0)
    g.reset()
    expect(g.armedSide).toBe(null)
    expect(g.update(800, SCREEN, 100)).toBe(0)
  })

  it('화면 폭이 다르면 문턱도 같이 바뀐다(절대 px가 아니다)', () => {
    const g = new EdgeSwipeGate({ pullFrac: 0.1 })
    g.enterZone('right', 100, 0)   // 화면 폭 500 → 문턱 50px
    expect(g.update(60, 500, 100)).toBe(0)    // 40px < 50px
    expect(g.update(40, 500, 200)).toBe(1)    // 60px ≥ 50px — 확정
  })
})
