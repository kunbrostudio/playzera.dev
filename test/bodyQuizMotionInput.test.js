import { describe, expect, it } from 'vitest'
import {
  BODY_QUIZ_SQUAT_STAGE,
  BodyQuizSquatDetector,
  createBodyQuizZoneDetector,
  isBodyQuizPoseTrackable,
} from '../src/games/body-quiz/motionInput.js'

function pose({
  hipY = 0.55,
  hipX = 0.5,
  kneeY = 0.72,
  kneeSpread = 0,
  visibility = 1,
  kneeVisibility = visibility,
} = {}) {
  const points = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility }))
  points[0] = { x: 0.5, y: 0.1, visibility }
  points[23] = { x: hipX - 0.05, y: hipY, visibility }
  points[24] = { x: hipX + 0.05, y: hipY, visibility }
  points[25] = { x: hipX - 0.05 + kneeSpread, y: kneeY, visibility: kneeVisibility }
  points[26] = { x: hipX + 0.05 - kneeSpread, y: kneeY, visibility: kneeVisibility }
  points[27] = { x: hipX - 0.05, y: 0.9, visibility }
  points[28] = { x: hipX + 0.05, y: 0.9, visibility }
  return points
}

function feed(detector, frames, start = 0, step = 1 / 30) {
  let t = start
  let result = null
  for (const frame of frames) {
    result = detector.update(frame, t)
    t += step
  }
  return { t, result }
}

const standing = () => pose()
const partial = () => pose({ hipY: 0.60, kneeY: 0.73, kneeSpread: 0.015 })
const deep = () => pose({ hipY: 0.67, kneeY: 0.73, kneeSpread: 0.075 })

describe('BODY QUIZ 스쿼트 detector', () => {
  it('깊게 앉았다 완전히 일어날 때 정확히 한 번 센다', () => {
    const detector = new BodyQuizSquatDetector()
    let { t } = feed(detector, Array.from({ length: 15 }, standing))
    ;({ t } = feed(detector, Array.from({ length: 6 }, partial), t))
    ;({ t } = feed(detector, Array.from({ length: 8 }, deep), t))
    const results = feed(detector, Array.from({ length: 10 }, standing), t)
    expect(detector.count).toBe(1)
    expect(results.result.stage).toBe(BODY_QUIZ_SQUAT_STAGE.STANDING)
  })

  it('얕게 숙였다 돌아오는 불완전 동작은 세지 않는다', () => {
    const detector = new BodyQuizSquatDetector()
    let { t } = feed(detector, Array.from({ length: 15 }, standing))
    ;({ t } = feed(detector, Array.from({ length: 10 }, partial), t))
    feed(detector, Array.from({ length: 10 }, standing), t)
    expect(detector.count).toBe(0)
  })

  it('선 자세를 계속 유지해도 중복 카운트하지 않는다', () => {
    const detector = new BodyQuizSquatDetector()
    feed(detector, Array.from({ length: 120 }, standing))
    expect(detector.count).toBe(0)
  })

  it('동작 중 추적이 끊기면 복구 프레임을 새 동작으로 세지 않는다', () => {
    const detector = new BodyQuizSquatDetector()
    let { t } = feed(detector, Array.from({ length: 15 }, standing))
    ;({ t } = feed(detector, Array.from({ length: 8 }, deep), t))
    detector.update(null, t + 0.5)
    feed(detector, Array.from({ length: 10 }, standing), t + 0.6)
    expect(detector.count).toBe(0)
    expect(detector.stage).toBe(BODY_QUIZ_SQUAT_STAGE.STANDING)
  })

  it('전신 confidence가 낮은 프레임은 zone/count 입력으로 쓰지 않는다', () => {
    expect(isBodyQuizPoseTrackable(pose())).toBe(true)
    expect(isBodyQuizPoseTrackable(pose({ visibility: 0.2 }))).toBe(false)
  })

  it('무릎 confidence가 흔들려도 큰 골반 하강은 기존 판정 경로로 센다', () => {
    const detector = new BodyQuizSquatDetector()
    let { t } = feed(detector, Array.from({ length: 15 }, standing))
    const deepWithoutKnees = () => pose({ hipY: 0.68, kneeVisibility: 0.2 })
    ;({ t } = feed(detector, Array.from({ length: 16 }, deepWithoutKnees), t))
    feed(detector, Array.from({ length: 10 }, standing), t)
    expect(detector.count).toBe(1)
  })
})

describe('BODY QUIZ 3-zone detector', () => {
  it('몸 크기에 맞춘 중앙/LEFT/RIGHT zone을 반환한다', () => {
    const detector = createBodyQuizZoneDetector()
    expect(detector.update(pose({ hipX: 0.5 })).zone).toBe(1)
    expect(detector.update(pose({ hipX: 0.28 })).zone).toBe(0)
    expect(detector.update(pose({ hipX: 0.5 })).zone).toBe(1)
    expect(detector.update(pose({ hipX: 0.72 })).zone).toBe(2)
  })

  it('카메라에서 멀어져 몸이 작아져도 최소 zone 폭을 유지한다', () => {
    const detector = createBodyQuizZoneDetector()
    const far = pose({ hipX: 0.62 })
    far[0].y = 0.3
    far[27].y = 0.5
    far[28].y = 0.5
    const result = detector.update(far)
    expect(result.tracking).toBe(true)
    expect(result.step).toBe(0.10)
    expect(result.zone).toBe(2)
  })

  it('추적이 흐린 프레임은 이전 zone을 새 선택으로 사용하지 않는다', () => {
    const detector = createBodyQuizZoneDetector()
    detector.update(pose({ hipX: 0.28 }))
    const result = detector.update(pose({ hipX: 0.28, visibility: 0.2 }))
    expect(result).toEqual({ tracking: false, zone: 0 })
  })


  it('zone은 무릎 confidence와 무관하게 신체 중심으로 판정한다', () => {
    const detector = createBodyQuizZoneDetector()
    const result = detector.update(pose({ hipX: 0.72, kneeVisibility: 0.2 }))
    expect(result.tracking).toBe(true)
    expect(result.zone).toBe(2)
  })
})
