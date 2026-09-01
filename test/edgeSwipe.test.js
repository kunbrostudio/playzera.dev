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

  // ── 롤링 윈도우 — ken 실사용 버그 재현 ─────────────────────────
  // "손을 끝으로 가져가기만 했는데 스와이프 동작을 하지 않았는데도 자동으로
  // 넘어간다" — 고정 anchor 모델은 시간 제한이 없어서, 가만히 대고 있는 동안
  // 손 떨림이 수 초에 걸쳐 조금씩 쌓여도 결국 문턱(3.5%)을 넘었다.
  it('가만히 대고 있으면(떨림이 수 초에 걸쳐 쌓여도) 자동으로 안 넘어간다', () => {
    const g = new EdgeSwipeGate({ timeoutMs: 60000 })   // 시간초과가 먼저 끊지 않도록 넉넉히
    g.enterZone('right', 900, 0)
    // 100ms마다 1px씩, 60번(6초)에 걸쳐 같은 방향으로 아주 천천히 미끄러진다.
    // 누적하면 60px로 문턱(35px)을 넘지만, 창(400ms) 안에서는 4px 안팎이라 안 걸려야 한다.
    let x = 900
    for (let i = 1; i <= 60; i++) {
      x -= 1
      expect(g.update(x, SCREEN, i * 100)).toBe(0)
    }
    expect(g.armedSide).toBe('right')   // 무장은 풀리지 않은 채 유지된다
  })

  it('창(windowMs)보다 느리게 당기면 문턱을 넘어도 확정되지 않는다', () => {
    const g = new EdgeSwipeGate({ timeoutMs: 60000 })
    g.enterZone('right', 900, 0)
    // 2초에 걸쳐 40px을 당긴다 — 절대 거리는 문턱을 넘지만 창(400ms) 안에서는
    // 8px 안팎이라 "당겼다"로 안 쳐준다.
    let x = 900
    for (let i = 1; i <= 20; i++) {
      x -= 2
      expect(g.update(x, SCREEN, i * 100)).toBe(0)
    }
  })

  it('창 안에서 빠르게 당기면(진짜 스와이프) 확정된다', () => {
    const g = new EdgeSwipeGate()
    g.enterZone('right', 900, 0)
    // 200ms 안에 40px — 창(400ms) 안에서 문턱(35px)을 넘는 진짜 당기기
    expect(g.update(880, SCREEN, 100)).toBe(0)
    expect(g.update(860, SCREEN, 200)).toBe(1)
  })

  it('windowMs를 짧게 주면 오래된 표본이 더 빨리 밀려난다', () => {
    const g = new EdgeSwipeGate({ windowMs: 150 })
    g.enterZone('right', 900, 0)
    g.update(890, SCREEN, 50)     // 아직 창 안 — anchor 900, 10px
    // 200ms 지나면 t=0 표본이 창(150ms) 밖으로 밀려나 anchor가 890 근처로 갱신된다
    expect(g.update(860, SCREEN, 200)).toBe(0)   // anchor≈890 기준 30px < 35px
  })
})
