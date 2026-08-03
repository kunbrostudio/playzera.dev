import { describe, it, expect } from 'vitest'
import { isArmsUpCircle, isArmsUpCross, GestureHold, LM } from '../src/core/pose/gesture.js'
import { GESTURE } from '../src/core/pose/tuning.js'

// 정규화 좌표(0~1). y는 아래로 갈수록 커진다.
// 기본 자세: 코 0.15, 어깨 0.30, 손목 0.55(내린 상태), 골반 0.55, 발목 0.95
function pose(over = {}) {
  const lms = []
  const set = (i, x, y) => { lms[i] = { x, y, z: 0, visibility: 1 } }
  set(LM.NOSE, 0.50, 0.15)
  set(LM.L_SHOULDER, 0.40, 0.30)
  set(LM.R_SHOULDER, 0.60, 0.30)
  set(LM.L_WRIST, 0.38, 0.55)
  set(LM.R_WRIST, 0.62, 0.55)
  set(LM.L_HIP, 0.44, 0.55)
  set(LM.R_HIP, 0.56, 0.55)
  set(LM.L_ANKLE, 0.45, 0.95)
  set(LM.R_ANKLE, 0.55, 0.95)
  for (const [k, v] of Object.entries(over)) {
    lms[LM[k]] = { ...lms[LM[k]], ...v }
  }
  return lms
}

describe('O — 머리 위 동그라미', () => {
  it('팔을 내린 기본 자세는 O가 아니다', () => {
    expect(isArmsUpCircle(pose(), GESTURE)).toBe(false)
  })

  it('머리 위로 두 손을 모으면 O', () => {
    const p = pose({ L_WRIST: { x: 0.48, y: 0.03 }, R_WRIST: { x: 0.52, y: 0.03 } })
    expect(isArmsUpCircle(p, GESTURE)).toBe(true)
  })

  // 손을 들었어도 벌어져 있으면 동그라미가 아니다 — 만세와 구분된다
  it('머리 위지만 손이 멀리 벌어지면 O가 아니다', () => {
    const p = pose({ L_WRIST: { x: 0.15, y: 0.03 }, R_WRIST: { x: 0.85, y: 0.03 } })
    expect(isArmsUpCircle(p, GESTURE)).toBe(false)
  })

  // O만 머리 위를 요구한다 — 이 규칙이 X와 갈리는 지점이다
  it('손을 모았어도 코 아래면 O가 아니다', () => {
    const p = pose({ L_WRIST: { x: 0.48, y: 0.40 }, R_WRIST: { x: 0.52, y: 0.40 } })
    expect(isArmsUpCircle(p, GESTURE)).toBe(false)
  })

  it('랜드마크가 없으면 false', () => {
    expect(isArmsUpCircle(null, GESTURE)).toBe(false)
    expect(isArmsUpCircle([], GESTURE)).toBe(false)
  })
})

describe('X — 팔 교차', () => {
  it('팔을 내린 기본 자세는 X가 아니다', () => {
    expect(isArmsUpCross(pose(), GESTURE)).toBe(false)
  })

  // 손목 좌우 순서가 어깨와 반대로 뒤집히면 교차
  it('손목 좌우가 뒤집히고 충분히 벌어지면 X', () => {
    const p = pose({ L_WRIST: { x: 0.70, y: 0.35 }, R_WRIST: { x: 0.30, y: 0.35 } })
    expect(isArmsUpCross(p, GESTURE)).toBe(true)
  })

  // 머리 위로 들어야 한다는 제약이 없다 — 플레이 중 인식률 때문에 완화한 규칙
  it('가슴 앞에서 교차해도 X로 인정한다', () => {
    const p = pose({ L_WRIST: { x: 0.70, y: 0.45 }, R_WRIST: { x: 0.30, y: 0.45 } })
    expect(isArmsUpCross(p, GESTURE)).toBe(true)
  })

  it('교차했어도 손목이 거의 붙어 있으면 X가 아니다', () => {
    const p = pose({ L_WRIST: { x: 0.505, y: 0.35 }, R_WRIST: { x: 0.495, y: 0.35 } })
    expect(isArmsUpCross(p, GESTURE)).toBe(false)
  })

  // 발목이 프레임 밖으로 나가도 인식돼야 한다. 상반신만으로 판정하는 이유.
  it('발목이 안 보여도 인식된다', () => {
    const p = pose({ L_WRIST: { x: 0.70, y: 0.35 }, R_WRIST: { x: 0.30, y: 0.35 } })
    p[LM.L_ANKLE] = { x: 0.45, y: 1.6, visibility: 0.1 }
    p[LM.R_ANKLE] = { x: 0.55, y: 1.6, visibility: 0.1 }
    expect(isArmsUpCross(p, GESTURE)).toBe(true)
  })
})

describe('GestureHold — 유지 시간', () => {
  const always = () => new GestureHold(() => true, 1.5)

  it('유지 시간을 채워야 발동한다', () => {
    const h = always()
    expect(h.update(1.0, null)).toBe(false)
    expect(h.update(0.4, null)).toBe(false)
    expect(h.update(0.2, null)).toBe(true)
  })

  it('progress는 0~1로 잘린다', () => {
    const h = always()
    h.update(0.75, null)
    expect(h.progress).toBeCloseTo(0.5)
    h.update(5, null)
    expect(h.progress).toBe(1)
  })

  // 즉시 리셋하면 카메라가 한두 프레임만 흔들려도 처음부터 다시 유지해야 한다
  it('놓쳐도 즉시 0이 되지 않고 dt × 0.6으로 천천히 준다', () => {
    const h = new GestureHold(lms => lms === 'match', 1.5)
    h.update(1.0, 'match')
    expect(h.t).toBeCloseTo(1.0)
    h.update(0.5, 'miss')
    expect(h.t).toBeCloseTo(0.7)   // 1.0 - 0.5*0.6
  })

  it('음수로 내려가지 않는다', () => {
    const h = new GestureHold(() => false, 1.5)
    h.update(10, null)
    expect(h.t).toBe(0)
    expect(h.progress).toBe(0)
  })

  it('reset()으로 처음부터', () => {
    const h = always()
    h.update(1.0, null)
    h.reset()
    expect(h.progress).toBe(0)
  })
})
