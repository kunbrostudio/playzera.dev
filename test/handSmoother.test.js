import { describe, it, expect } from 'vitest'
import { makeHandSmoother } from '../src/games/arcade2d/handSmoother.js'

describe('makeHandSmoother — 첫 등장', () => {
  it('한 번도 안 보인 손은 null이다', () => {
    const sm = makeHandSmoother()
    const out = sm.step({ left: null, right: null }, 1 / 60, true)
    expect(out.left).toBeNull()
    expect(out.right).toBeNull()
  })

  it('처음 나타나면 그 자리로 곧장 온다(속도는 0)', () => {
    const sm = makeHandSmoother()
    const out = sm.step({ left: { x: 0.4, y: 0.6 } }, 1 / 60, true)
    expect(out.left.x).toBeCloseTo(0.4, 5)
    expect(out.left.y).toBeCloseTo(0.6, 5)
  })
})

describe('makeHandSmoother — 꾸준히 실측이 오면 실제 위치를 따라간다', () => {
  it('매 프레임 진짜 새 좌표가 오면 오차가 점점 작아진다(수렴)', () => {
    const sm = makeHandSmoother()
    const dt = 1 / 60
    let x = 0.1
    let out
    const errors = []
    for (let i = 0; i < 90; i++) {
      x += 0.4 * dt   // 초당 0.4씩 오른쪽으로 이동하는 실제 손
      out = sm.step({ left: { x, y: 0.5 } }, dt, true)
      errors.push(Math.abs(out.left.x - x))
    }
    // 초반 오차보다 후반(정상상태) 오차가 뚜렷이 작아야 한다 — 계속 따라잡는다는 뜻
    const early = errors.slice(0, 5).reduce((a, b) => a + b, 0) / 5
    const late = errors.slice(-5).reduce((a, b) => a + b, 0) / 5
    expect(late).toBeLessThan(early)
    // 정상상태에서도 화면 폭의 3% 이내로는 따라붙어야 실제로 쓸모 있다
    expect(late).toBeLessThan(0.03)
  })
})

describe('makeHandSmoother — 감지가 뜨문뜨문 와도(예측) 계속 흐른다 ★', () => {
  it('fresh가 5프레임에 한 번만 와도, 그 사이(fresh=false)에도 위치가 계속 움직인다', () => {
    const sm = makeHandSmoother()
    const dt = 1 / 60
    let realX = 0.1
    const realV = 0.5   // 초당 0.5 이동하는 실제 손

    // 워밍업 — 속도 추정이 자리 잡을 시간을 준다
    for (let i = 0; i < 30; i++) {
      const fresh = i % 5 === 0
      if (fresh) realX += realV * dt * 5   // 5프레임치 이동을 한 번에 반영
      sm.step({ left: { x: realX, y: 0.5 } }, dt, fresh)
    }

    // 이제부터 관찰 — fresh=false인 프레임들에서도 x가 계속 늘어나는지 본다
    let prevX = null
    let movedOnStaleFrame = false
    for (let i = 0; i < 20; i++) {
      const fresh = i % 5 === 0
      if (fresh) realX += realV * dt * 5
      const out = sm.step({ left: { x: realX, y: 0.5 } }, dt, fresh)
      if (!fresh && prevX != null && out.left.x > prevX + 1e-6) movedOnStaleFrame = true
      prevX = out.left.x
    }
    expect(movedOnStaleFrame).toBe(true)
  })
})

describe('makeHandSmoother — 손이 사라지면 서서히 멈춘다(끝없이 안 미끄러진다)', () => {
  it('실측이 끊기면 속도가 줄어 위치 변화가 점점 작아진다', () => {
    // 버리기 문턱(lostSec) 안에서의 거동을 본다 — 넉넉히 잡아 감쇠만 관찰한다.
    const sm = makeHandSmoother({ lostSec: 10 })
    const dt = 1 / 60
    let x = 0.2
    for (let i = 0; i < 10; i++) {
      x += 0.5 * dt
      sm.step({ left: { x, y: 0.5 } }, dt, true)
    }
    // 이제 손이 사라진다 — fresh도 없고 target도 없다
    let prev = sm.step({}, dt, false).left.x
    const deltas = []
    for (let i = 0; i < 60; i++) {
      const out = sm.step({}, dt, false)
      deltas.push(Math.abs(out.left.x - prev))
      prev = out.left.x
    }
    const early = deltas.slice(0, 3).reduce((a, b) => a + b, 0)
    const late = deltas.slice(-3).reduce((a, b) => a + b, 0)
    expect(late).toBeLessThan(early)
    expect(late).toBeLessThan(1e-4)   // 1초(60프레임) 뒤엔 사실상 멈춰 있어야 한다
  })

  // ── 얼어붙은 트래커 ★ (ken 5차: "트래커가 두개나 나오고!") ──
  //
  // 처음 판에는 한 번 생긴 손 상태가 절대 null로 안 돌아갔다. 화면은
  // 그걸 "손이 아직 있다"로 읽고 쓰지 않는 손의 트래커를 옛 자리에
  // 계속 그렸다 — 실제로 화면에 트래커가 두 개 보인 원인 중 하나다.
  it('실측이 문턱만큼 끊기면 그 손은 null이 된다(트래커가 안 남는다)', () => {
    const sm = makeHandSmoother({ lostSec: 0.5 })
    const dt = 1 / 60
    sm.step({ left: { x: 0.3, y: 0.3 } }, dt, true)
    let out
    for (let i = 0; i < 40; i++) out = sm.step({}, dt, false)   // 약 0.67초
    expect(out.left).toBeNull()
  })

  it('문턱 전에는 안 없앤다 — 잠깐 놓친 프레임마다 깜빡이면 더 나쁘다', () => {
    const sm = makeHandSmoother({ lostSec: 0.5 })
    const dt = 1 / 60
    sm.step({ left: { x: 0.3, y: 0.3 } }, dt, true)
    let out
    for (let i = 0; i < 10; i++) out = sm.step({}, dt, false)   // 약 0.17초
    expect(out.left).not.toBeNull()
  })

  it('한 손을 놓고 반대 손으로 갈아타면 놓은 쪽만 사라진다', () => {
    const sm = makeHandSmoother({ lostSec: 0.5 })
    const dt = 1 / 60
    for (let i = 0; i < 5; i++) sm.step({ left: { x: 0.3, y: 0.3 } }, dt, true)
    // 트래커가 오른손으로 넘어갔다 — 이제 left는 계속 null로 들어온다
    let out
    for (let i = 0; i < 40; i++) out = sm.step({ left: null, right: { x: 0.7, y: 0.4 } }, dt, true)
    expect(out.left).toBeNull()
    expect(out.right).not.toBeNull()
    expect(out.right.x).toBeCloseTo(0.7, 1)
  })

  it('사라졌다가 다른 자리에서 다시 나타나면 그 쪽으로 붙는다(얼어붙지 않는다)', () => {
    const sm = makeHandSmoother({ lostSec: 10 })
    const dt = 1 / 60
    sm.step({ left: { x: 0.2, y: 0.2 } }, dt, true)
    // 오래 사라진다
    for (let i = 0; i < 60; i++) sm.step({}, dt, false)
    // 완전히 다른 자리에서 다시 나타난다
    let out
    for (let i = 0; i < 30; i++) {
      out = sm.step({ left: { x: 0.9, y: 0.9 } }, dt, true)
    }
    expect(out.left.x).toBeCloseTo(0.9, 1)
    expect(out.left.y).toBeCloseTo(0.9, 1)
  })
})

describe('makeHandSmoother — 왼손·오른손은 서로 독립이다', () => {
  it('한쪽만 계속 갱신되고 다른 쪽은 안 보여도 서로 안 섞인다', () => {
    const sm = makeHandSmoother()
    const dt = 1 / 60
    for (let i = 0; i < 10; i++) {
      sm.step({ left: { x: 0.3, y: 0.3 }, right: null }, dt, true)
    }
    const out = sm.step({ left: { x: 0.3, y: 0.3 }, right: null }, dt, true)
    expect(out.right).toBeNull()
    expect(out.left.x).toBeCloseTo(0.3, 5)
  })
})
