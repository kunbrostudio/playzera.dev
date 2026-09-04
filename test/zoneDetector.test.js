// 칸 판정 — **경계에서 떨리면 안 된다.** + **칸 폭은 몸 크기 기준이다(STEP 60).**
//
// 이 테스트가 지키는 것은 화면이 아니라 **운동 데이터**다. 칸이 깜빡이면
// `sideSteps`가 가만히 서 있는 아이에게서 올라간다. 브라우저로는 못 잡는다 —
// 골반 좌표를 1픽셀 단위로 흔들어 볼 수 없기 때문이다.
//
// STEP 60부터 칸 폭이 `bodyHeight`(코~발목) 비율로 정규화되어, 아래 테스트는
// 골반뿐 아니라 코·발목도 함께 준다 — 실제 프레임과 같은 모양이다.
import { describe, it, expect } from 'vitest'
import { createZoneDetector } from '../src/core/pose/detectors/zoneDetector.js'

/**
 * 전신 최소 프레임. x는 골반(좌우 판정에 쓰는 값), bodyHeight는 코~발목 거리
 * (0..1, 프레임 높이 대비) — 칸 폭을 정하는 값이다.
 */
const person = (x, bodyHeight = 0.5, visibility = 1) => {
  const lm = []
  lm[0]  = { x, y: 0.1, visibility }              // NOSE
  lm[23] = { x, y: 0.5, visibility }               // L_HIP
  lm[24] = { x, y: 0.5, visibility }               // R_HIP
  lm[27] = { x, y: 0.1 + bodyHeight, visibility }  // L_ANKLE
  lm[28] = { x, y: 0.1 + bodyHeight, visibility }  // R_ANKLE
  return lm
}

describe('칸 판정 — 기본 동작', () => {
  it('가운데에서 시작한다 — 3칸은 1, 5칸은 2', () => {
    expect(createZoneDetector({ lanes: 3 }).getCurrentZone()).toBe(1)
    expect(createZoneDetector({ lanes: 5 }).getCurrentZone()).toBe(2)
  })

  it('충분히 옮기면 양 끝까지 다 읽는다(3칸)', () => {
    const out = []
    const d = createZoneDetector({ lanes: 3, onZoneChange: z => out.push(z) })
    d.update(person(0.10, 0.5)); expect(d.getCurrentZone()).toBe(0)
    d.update(person(0.50, 0.5)); expect(d.getCurrentZone()).toBe(1)
    d.update(person(0.90, 0.5)); expect(d.getCurrentZone()).toBe(2)
    expect(out).toEqual([0, 1, 2])
  })

  it('충분히 옮기면 양 끝까지 다 읽는다(5칸)', () => {
    // bodyHeight 0.5 → 칸 폭 0.12(바닥·천장 안 걸림). 각 칸 한가운데 자리.
    const d = createZoneDetector({ lanes: 5 })
    for (const [x, z] of [[0.10, 0], [0.38, 1], [0.50, 2], [0.62, 3], [0.90, 4]]) {
      d.update(person(x, 0.5))
      expect(d.getCurrentZone(), `x=${x}`).toBe(z)
    }
  })
})

describe('칸 폭 — 몸 크기 기준 정규화 ★ (STEP 60)', () => {
  // LANE_STEP(0.24) × bodyHeight가 MIN_STEP(0.10)보다 작아지는 지점 —
  // 카메라에서 멀리 서서 몸이 작게 잡히는 상황. 화면의 33%/20%를 움직여야
  // 했던 예전과 달리, 바닥값 10%만 움직이면 칸이 넘어가야 한다.
  it('몸이 작게 잡혀도(멀리 서 있어도) 칸 폭이 바닥값(10%) 밑으로는 안 좁아진다', () => {
    const d = createZoneDetector({ lanes: 3, onZoneChange: () => {} })
    const small = 0.2   // LANE_STEP × 0.2 = 0.048 < MIN_STEP(0.10) → 바닥값 적용
    d.update(person(0.50, small))
    expect(d.getCurrentZone()).toBe(1)
    d.update(person(0.60, small))   // 경계(0.55) + 히스테리시스 여유를 넘음
    expect(d.getCurrentZone()).toBe(2)
  })

  it('멀리 서 있어도 예전(화면 33%)보다 훨씬 적은 이동으로 옆 칸에 닿는다', () => {
    const d = createZoneDetector({ lanes: 3, onZoneChange: () => {} })
    d.update(person(0.50, 0.2))
    // 예전 기준(화면 1/3=0.333)이면 어림도 없는 거리(0.5→0.58, 8%만 이동)인데
    // 새 기준(바닥 10%, 경계 0.55 + 히스테리시스)으로는 넘어가야 한다.
    d.update(person(0.58, 0.2))
    expect(d.getCurrentZone()).toBe(2)
  })

  // LANE_STEP × bodyHeight가 원래 폭(1/n)을 넘어서는 상황 — 카메라에 아주
  // 가까이 서 있을 때. 정규화가 **원래보다 어렵게 만들면 안 된다** — 5칸의
  // 원래 폭(0.2)을 천장으로 못박아 둔다.
  it('몸이 아주 크게 잡혀도(5칸) 칸 폭이 원래(화면 20%)보다 넓어지지 않는다', () => {
    const d = createZoneDetector({ lanes: 5 })
    // LANE_STEP(0.24) × 1.0 = 0.24 > maxStep(0.2) → 천장에서 잘려 정확히
    // 원래 폭(1/5)이 된다. 원래(STEP 60 이전) 5칸 테스트와 같은 자리에서
    // 그대로 다 읽혀야 한다 — 천장이 없다면 바깥쪽 두 자리가 밀려난다.
    for (const [x, z] of [[0.05, 0], [0.25, 1], [0.50, 2], [0.75, 3], [0.95, 4]]) {
      d.update(person(x, 1.0))
      expect(d.getCurrentZone(), `x=${x}`).toBe(z)
    }
  })
})

describe('경계 떨림 ★', () => {
  it('경계에 서서 미세하게 흔들려도 칸이 안 바뀐다(멀리 서 있을 때 — 바닥 폭 10%)', () => {
    let changes = 0
    const d = createZoneDetector({ lanes: 5, onZoneChange: () => changes++ })
    d.update(person(0.40, 0.3))     // 1번 칸 한가운데(바닥 폭 0.10 적용, [0.35,0.45))
    changes = 0
    // 경계(0.45)에서 ±0.008로 흔들린다 — 히스테리시스 여유(0.10×18%=0.018)보다 작다.
    for (let i = 0; i < 200; i++) d.update(person(0.45 + (i % 2 ? 0.008 : -0.008), 0.3))
    expect(changes).toBe(0)
  })

  it('경계에 서서 미세하게 흔들려도 칸이 안 바뀐다(가까이 서 있을 때 — 넓은 몸 기준 폭)', () => {
    let changes = 0
    const d = createZoneDetector({ lanes: 3, onZoneChange: () => changes++ })
    d.update(person(0.50, 0.8))     // 가운데 — LANE_STEP×0.8=0.192(바닥·천장 안 걸림)
    changes = 0
    // 경계(0.5+0.096=0.596)에서 ±0.01로 흔들린다 — 여유(0.192×18%≈0.0346)보다 작다.
    for (let i = 0; i < 200; i++) d.update(person(0.596 + (i % 2 ? 0.01 : -0.01), 0.8))
    expect(changes).toBe(0)
  })

  it('그래도 진짜로 옮기면 넘어간다 — 여유가 벽이 되면 안 된다', () => {
    const out = []
    const d = createZoneDetector({ lanes: 5, onZoneChange: z => out.push(z) })
    d.update(person(0.50, 0.3))     // 2번 칸(바닥 폭 0.10, [0.45,0.55))
    d.update(person(0.40, 0.3))     // 1번 칸 한가운데까지 확실히 들어갔다 ([0.35,0.45))
    expect(out).toEqual([1])
  })
})

describe('흐린/불완전한 프레임', () => {
  it('visibility가 낮으면 버린다', () => {
    const d = createZoneDetector({ lanes: 3 })
    d.update(person(0.5, 0.5))
    d.update(person(0.05, 0.5, 0.2))   // 화면 밖 — MediaPipe가 지어낸 좌표
    expect(d.getCurrentZone()).toBe(1)
  })

  it('발목·코가 안 잡히면(부분 프레임) 아무것도 하지 않는다', () => {
    const d = createZoneDetector({ lanes: 3 })
    d.update(person(0.5, 0.5))
    const partial = person(0.05, 0.5)
    partial[27] = undefined   // 발목이 프레임 밖
    partial[28] = undefined
    d.update(partial)
    expect(d.getCurrentZone()).toBe(1)   // 그대로 가운데
  })

  it('전신이 너무 작게 보이면(minBodyHeight 미만) 아무것도 하지 않는다', () => {
    const d = createZoneDetector({ lanes: 3 })
    d.update(person(0.5, 0.5))
    d.update(person(0.9, 0.1))   // bodyHeight 0.1 < MOVES.minBodyHeight(0.15)
    expect(d.getCurrentZone()).toBe(1)
  })
})
