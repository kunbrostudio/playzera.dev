import { describe, it, expect } from 'vitest'
import { isFullBodyVisible, LM } from '../src/core/pose/poseEngine.js'
import { createZoneDetector } from '../src/core/pose/detectors/zoneDetector.js'

function fullBody(over = {}) {
  const lms = []
  const set = (i, x, y, visibility = 1) => { lms[i] = { x, y, z: 0, visibility } }
  set(0, 0.50, 0.10)    // NOSE
  set(11, 0.42, 0.28); set(12, 0.58, 0.28)   // 어깨
  set(23, 0.45, 0.55); set(24, 0.55, 0.55)   // 골반
  set(25, 0.45, 0.72); set(26, 0.55, 0.72)   // 무릎
  set(27, 0.45, 0.92); set(28, 0.55, 0.92)   // 발목
  for (const [i, v] of Object.entries(over)) lms[i] = { ...lms[i], ...v }
  return lms
}

describe('isFullBodyVisible', () => {
  it('코~발목이 다 화면 안이면 true', () => {
    expect(isFullBodyVisible(fullBody())).toBe(true)
  })

  it('발목이 화면 아래로 나가면 false', () => {
    expect(isFullBodyVisible(fullBody({ 27: { y: 1.4 } }))).toBe(false)
  })

  it('신뢰도가 낮은 점이 있으면 false', () => {
    expect(isFullBodyVisible(fullBody({ 28: { visibility: 0.2 } }))).toBe(false)
  })

  // 경계에서 깜빡이지 않도록 살짝의 여유(0.02)를 둔다
  it('가장자리 2% 여유 안쪽은 통과한다', () => {
    expect(isFullBodyVisible(fullBody({ 27: { y: 1.01 } }))).toBe(true)
    expect(isFullBodyVisible(fullBody({ 27: { y: 1.05 } }))).toBe(false)
  })

  it('랜드마크가 없으면 false', () => {
    expect(isFullBodyVisible(null)).toBe(false)
    expect(isFullBodyVisible([])).toBe(false)
  })

  it('LM 표를 gesture.js와 공유한다', () => {
    expect(LM.L_HIP).toBe(23)
    expect(LM.R_HIP).toBe(24)
  })
})

// STEP 4-0에서 엔진이 거울 좌표로 통일됐다.
// 아이가 자기 오른쪽으로 가면 x가 커지고, 화면에서도 오른쪽 칸이 켜져야 한다.
describe('zoneDetector — 거울 좌표 기준', () => {
  const feed = (xs) => {
    const seen = []
    const d = createZoneDetector({ onZoneChange: z => seen.push(z) })
    for (const x of xs) d.update([...Array(23), { x, y: 0.5 }, { x, y: 0.5 }])
    return { seen, zone: d.getCurrentZone() }
  }

  it('가운데에서 시작한다', () => {
    expect(createZoneDetector({}).getCurrentZone()).toBe(1)
  })

  it('x가 작으면 왼쪽 칸', () => {
    expect(feed([0.2]).zone).toBe(0)
  })

  it('x가 크면 오른쪽 칸', () => {
    expect(feed([0.8]).zone).toBe(2)
  })

  it('1/3~2/3 사이는 가운데', () => {
    expect(feed([0.2, 0.5]).zone).toBe(1)
  })

  it('같은 칸에 머무르면 콜백이 반복되지 않는다', () => {
    expect(feed([0.2, 0.25, 0.3]).seen).toEqual([0])
  })

  it('칸을 옮길 때마다 한 번씩 알린다', () => {
    expect(feed([0.2, 0.5, 0.8, 0.2]).seen).toEqual([0, 1, 2, 0])
  })
})
