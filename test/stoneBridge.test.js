// 돌다리 건너기 — 규칙만 검증한다. 카메라도 DOM도 없다.
//
// 이 게임의 존재 이유는 **균형**이다. 그래서 버틴 시간만 기록에 남는지,
// 양발을 번갈아 쓰게 하는지, 그러면서도 **아이를 좌절시키지 않는지**가 핵심이다.

import { describe, it, expect } from 'vitest'
import { BridgeRun, STONES, PHASE, DECAY, cheer } from '../src/games/stone-bridge/game.js'

// sec초 동안 lifted 상태를 유지한다 (30fps 가정)
function hold(g, sec, lifted = null, fps = 30) {
  const dt = 1 / fps
  for (let i = 0; i < Math.round(sec * fps); i++) g.update(dt, lifted)
}

describe('한 발로 버티면 건넌다', () => {
  it('가만히 두 발로 서 있으면 아무 일도 없다', () => {
    const g = new BridgeRun()
    hold(g, 5, null)
    expect(g.index).toBe(0)
    expect(g.balanceSec).toBe(0)
  })

  it('요구한 발로 버티면 다음 돌로 간다', () => {
    const g = new BridgeRun()
    hold(g, STONES[0].hold + 0.2, 'left')
    expect(g.cleared).toBe(1)
    expect(g.index).toBe(1)
  })

  it('반대쪽 발은 세어 주지 않는다 — 양발을 고르게 쓰게 한다', () => {
    const g = new BridgeRun()          // 첫 돌은 왼발
    hold(g, 4, 'right')
    expect(g.cleared).toBe(0)
    expect(g.wrongFoot).toBe(true)
    expect(g.balanceSec).toBe(0)
  })

  it('돌마다 발이 번갈아 정해져 있다', () => {
    const feet = STONES.map(s => s.foot)
    expect(feet).toContain('left')
    expect(feet).toContain('right')
    // 같은 발이 내리 세 번 나오지 않는다
    for (let i = 2; i < feet.length; i++) {
      const three = [feet[i - 2], feet[i - 1], feet[i]]
      expect(new Set(three).size, `${i}번째`).toBeGreaterThan(1)
    }
  })

  it('마지막 돌은 편한 발로 선다', () => {
    expect(STONES[STONES.length - 1].foot).toBe('any')
    const g = new BridgeRun([{ hold: 1, foot: 'any', limitSec: 10 }])
    hold(g, 1.2, 'right')
    expect(g.cleared).toBe(1)
  })
})

describe('4~8세를 위한 규칙', () => {
  // 매번 처음부터면 이 나이대는 두 번째 돌에서 그만둔다.
  it('발이 닿아도 0으로 돌아가지 않는다 — 천천히 줄 뿐이다', () => {
    const g = new BridgeRun()
    hold(g, 1.5, 'left')
    const before = g.held
    hold(g, 0.5, null)
    expect(g.held).toBeGreaterThan(0)
    expect(g.held).toBeLessThan(before)
    expect(g.held).toBeCloseTo(before - 0.5 * DECAY, 1)
  })

  it('실패가 없다 — 시간이 다 되면 도와줘서 건넌다', () => {
    const g = new BridgeRun()
    hold(g, STONES[0].limitSec + 0.5, null)   // 한 번도 안 들었다
    expect(g.helped).toBe(1)
    expect(g.index).toBe(1)
    expect(g.done).toBe(false)
  })

  it('한 자세를 3초 넘게 요구하지 않는다', () => {
    for (const s of STONES) expect(s.hold).toBeLessThanOrEqual(3)
  })

  it('끝까지 가면 게임이 끝난다', () => {
    const g = new BridgeRun()
    let guard = 0
    while (!g.done && guard++ < 50) hold(g, g.spec.limitSec + 0.5, null)
    expect(g.done).toBe(true)
  })

  it('한 판이 3분을 넘지 않는다 — 4~8세의 집중은 그보다 짧다', () => {
    const total = STONES.reduce((a, s) => a + s.limitSec, 0)
    expect(total).toBeLessThanOrEqual(180)
  })
})

describe('기록', () => {
  it('버틴 시간만 쌓인다 — 서 있던 시간은 안 센다', () => {
    const g = new BridgeRun()
    hold(g, 1, 'left')
    hold(g, 3, null)
    expect(g.balanceSec).toBeCloseTo(1, 1)
  })

  it('못 버텨서 건너뛴 돌도 버틴 만큼은 남는다', () => {
    const g = new BridgeRun()
    hold(g, 1, 'left')                        // 목표(2초)에 못 미친다
    hold(g, STONES[0].limitSec, null)
    expect(g.helped).toBe(1)
    expect(g.balanceSec).toBeGreaterThan(0.5)
  })

  it('지표 이름이 운동 사전 그대로다', () => {
    const g = new BridgeRun()
    hold(g, 2.5, 'left')
    const s = g.snapshot()
    expect(s).toHaveProperty('balance_sec')
    expect(s).toHaveProperty('active_sec')
  })

  it('어느 발로 얼마나 버텼는지 따로 남는다', () => {
    const g = new BridgeRun()
    hold(g, 2.2, 'left')      // 첫 돌 통과
    hold(g, 2.2, 'right')     // 둘째 돌 통과
    expect(g.bestBySide.left).toBeGreaterThan(1.5)
    expect(g.bestBySide.right).toBeGreaterThan(1.5)
  })
})

describe('응원 문구', () => {
  it('반대 발을 들면 어느 발인지 알려준다', () => {
    expect(cheer({ wrongFoot: true, needFoot: 'left', progress: 0, lifted: 'right' })).toContain('왼발')
    expect(cheer({ wrongFoot: true, needFoot: 'right', progress: 0, lifted: 'left' })).toContain('오른발')
  })

  it('아무 발이나 되는 돌에서는 발을 지정하지 않는다', () => {
    const s = cheer({ wrongFoot: false, needFoot: 'any', progress: 0, lifted: null })
    expect(s).not.toContain('왼발')
    expect(s).not.toContain('오른발')
  })

  // 숫자를 못 읽는 아이에게 하는 말이다
  it('숫자가 없다', () => {
    const cases = [
      { wrongFoot: true, needFoot: 'left', progress: 0, lifted: 'right' },
      { wrongFoot: false, needFoot: 'right', progress: 0.9, lifted: 'right' },
      { wrongFoot: false, needFoot: 'any', progress: 0, lifted: null },
    ]
    for (const c of cases) expect(cheer(c)).not.toMatch(/\d/)
  })
})
