// 불 끄기 소방관 — 규칙만 검증한다. 카메라도 DOM도 없다.
//
// 이 게임의 존재 이유는 **유산소**다. 그래서 "멈추면 뒤로 간다"가 지켜지는지,
// 그러면서도 **아이를 좌절시키지 않는지**(실패 없음·시간 상한)가 핵심이다.

import { describe, it, expect } from 'vitest'
import { FireRun, ROUNDS, PHASE, WATER_PER_STEP, waterPower, cheer } from '../src/games/fire-rescue/game.js'
import { getBackTo, getPlayRoute } from '../src/games/registry.js'

// 초당 spm/60 걸음으로 sec초를 돌린다 (30fps 가정)
function run(g, sec, spm, fps = 30) {
  const dt = 1 / fps
  let carry = 0
  for (let i = 0; i < Math.round(sec * fps); i++) {
    carry += spm / 60 * dt
    const steps = Math.floor(carry)
    carry -= steps
    g.update(dt, steps)
  }
}

describe('불 끄기 — 달려야 진행된다', () => {
  it('가만히 서 있으면 불이 다시 커진다', () => {
    const g = new FireRun()
    run(g, 3, 120)                 // 조금 껐다가
    const mid = g.left
    run(g, 5, 0)                   // 멈춘다
    expect(g.left).toBeGreaterThan(mid)
  })

  it('멈춰 있어도 처음 필요량보다 커지지는 않는다 — 끝없는 벽을 세우지 않는다', () => {
    const g = new FireRun()
    run(g, 30, 0)
    expect(g.left).toBeLessThanOrEqual(ROUNDS[0].water)
  })

  it('달리면 불이 꺼진다', () => {
    const g = new FireRun()
    run(g, 20, 120)
    expect(g.cleared).toBeGreaterThanOrEqual(1)
  })

  it('빨리 달릴수록 빨리 꺼진다', () => {
    const slow = new FireRun()
    const fast = new FireRun()
    run(slow, 12, 70)
    run(fast, 12, 160)
    expect(fast.left).toBeLessThan(slow.left)
  })

  it('한 걸음이 붓는 물의 양은 정해져 있다', () => {
    const g = new FireRun([{ water: 100, regen: 0, limitSec: 99, restSec: 0 }])
    g.update(0, 5)
    expect(g.left).toBe(100 - 5 * WATER_PER_STEP)
  })
})

describe('4~8세를 위한 규칙', () => {
  // 이 나이대에 "졌다"를 만들면 다음에 안 온다.
  it('실패가 없다 — 시간이 다 돼도 다음 집으로 간다', () => {
    const g = new FireRun()
    run(g, ROUNDS[0].limitSec + 1, 0)     // 한 걸음도 안 뛰었다
    expect(g.timedOut).toBe(1)
    expect(g.done).toBe(false)            // 게임은 계속된다
  })

  it('시간 상한이 있어 하염없이 늘어지지 않는다', () => {
    const g = new FireRun()
    let total = 0
    for (const r of ROUNDS) total += r.limitSec + r.restSec
    run(g, total + 5, 0)
    expect(g.done).toBe(true)
  })

  // docs/07 안전 규칙 — 30초 달리고 숨 고르기
  it('라운드 사이에 반드시 쉰다', () => {
    const g = new FireRun()
    run(g, 20, 140)
    expect(g.cleared).toBe(1)
    expect(g.phase).toBe(PHASE.REST)
    expect(g.restLeft).toBeGreaterThan(0)
  })

  it('쉬는 시간이 지나면 다음 집이 나온다', () => {
    const g = new FireRun()
    run(g, 20, 140)
    const r = g.round
    run(g, ROUNDS[0].restSec + 0.5, 0)
    expect(g.round).toBe(r + 1)
    expect(g.phase).toBe(PHASE.RUN)
  })

  it('쉬는 동안 뛰어도 혼내지 않는다 — 다만 운동 시간에는 안 넣는다', () => {
    const g = new FireRun()
    run(g, 20, 140)
    expect(g.phase).toBe(PHASE.REST)
    const before = { steps: g.steps, runSec: g.runSec }
    // 쉬는 시간이 **남은 만큼만** 돌린다. 넘겨 버리면 다음 라운드가 시작돼서
    // 그때부터는 운동 시간이 늘어나는 게 맞다 (실제로 이걸로 한 번 헛짚었다).
    run(g, g.restLeft - 0.5, 120)
    expect(g.steps).toBeGreaterThan(before.steps)      // 걸음은 세어 준다
    expect(g.runSec).toBeCloseTo(before.runSec, 1)     // 운동 시간은 그대로
  })
})

describe('기록', () => {
  it('지표 이름이 운동 사전 그대로다', () => {
    const g = new FireRun()
    run(g, 10, 120)
    const s = g.snapshot()
    expect(s).toHaveProperty('high_knees')
    expect(s).toHaveProperty('active_sec')
  })

  it('활동 시간에 쉬는 시간이 섞이지 않는다', () => {
    const g = new FireRun()
    run(g, 20, 140)                       // 달려서 첫 집을 끈다
    const ran = g.runSec
    run(g, g.restLeft - 0.5, 0)           // 남은 쉬는 시간을 통째로 쉰다
    expect(g.runSec).toBeCloseTo(ran, 1)
  })

  it('한 판이 3~4분 안에 끝난다 — 4~8세의 집중은 그보다 짧다', () => {
    const g = new FireRun()
    let sec = 0
    while (!g.done && sec < 600) { run(g, 1, 130); sec++ }
    expect(sec).toBeLessThan(240)
  })
})

describe('연출값', () => {
  it('물줄기는 0~1을 벗어나지 않는다', () => {
    for (const c of [-50, 0, 40, 100, 160, 400]) {
      const p = waterPower(c)
      expect(p).toBeGreaterThanOrEqual(0)
      expect(p).toBeLessThanOrEqual(1)
    }
  })

  it('빨리 달리면 물줄기가 세진다', () => {
    expect(waterPower(140)).toBeGreaterThan(waterPower(60))
  })

  // 숫자를 못 읽는 아이에게 하는 말이다
  it('응원 문구에 숫자가 없다', () => {
    for (const [f, p] of [[1, 0], [0.8, 0.5], [0.5, 0.9], [0.1, 0.5]]) {
      expect(cheer(f, p)).not.toMatch(/\d/)
    }
  })
})

// 인트로가 없는 게임은 entry가 **플레이 화면 자신**이다. 그걸 나갈 곳으로 쓰면
// navigate()가 같은 해시를 다시 넣고 hashchange가 안 나서 아무 일도 안 일어난다.
// 실제로 [그만하기]가 안 먹혔다.
describe('나갈 곳', () => {
  it('인트로가 없는 게임은 허브로 나간다', () => {
    expect(getBackTo('fire-rescue')).toBe('/')
    expect(getBackTo('fire-rescue')).not.toBe(getPlayRoute('fire-rescue'))
  })

  it('인트로가 있으면 한 단계씩 되짚는다', () => {
    expect(getBackTo('poop-dodge')).toBe('/intro?id=poop-dodge')
  })

  it('모르는 게임도 터지지 않는다', () => {
    expect(getBackTo('없는게임')).toBe('/')
  })
})
