import { describe, it, expect } from 'vitest'
import { matchPose, jointScore, jointScores, jointAngles, POSE_TARGETS } from '../src/games/warmup-obstacle/input/poseMatcher.js'
import { LM } from '../src/core/pose/gesture.js'
import { CONFIG } from '../src/games/warmup-obstacle/config.js'

const THRESHOLD = CONFIG.pose.matchThreshold
const ASPECT = 16 / 9

// 자세를 **실제 비율**로 적고 16:9 정규화 좌표로 바꾼다.
//
// 랜드마크의 x는 가로 폭으로, y는 세로 높이로 각각 0~1이 된다. 그래서 정규화
// 좌표를 손으로 적으면 가로가 눌린 자세를 적게 된다. 여기서는 사람이 읽을 수 있는
// 실제 비율(원점=몸 중앙, 단위=프레임 높이)로 적고 변환은 기계가 한다.
const pose = pts => {
  const a = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
  for (const [i, [X, Y]] of Object.entries(pts)) a[i] = { x: 0.5 + X / ASPECT, y: Y, visibility: 1 }
  return a
}

// ── 기준 자세들 ────────────────────────────────────────────────
const T_POSE = pose({
  [LM.L_SHOULDER]: [-0.08, 0.30], [LM.R_SHOULDER]: [0.08, 0.30],
  [LM.L_ELBOW]:    [-0.20, 0.30], [LM.R_ELBOW]:    [0.20, 0.30],
  [LM.L_WRIST]:    [-0.32, 0.30], [LM.R_WRIST]:    [0.32, 0.30],
  [LM.L_HIP]:      [-0.05, 0.58], [LM.R_HIP]:      [0.05, 0.58],
  [LM.L_KNEE]:     [-0.05, 0.77], [LM.R_KNEE]:     [0.05, 0.77],
  [LM.L_ANKLE]:    [-0.05, 0.95], [LM.R_ANKLE]:    [0.05, 0.95],
})

// 왼팔을 머리 위로 넘기고 몸통을 왼쪽으로 기울인다 (사인판·캐릭터 그림 그대로)
const SIDE_BEND = pose({
  [LM.L_SHOULDER]: [-0.10, 0.34], [LM.R_SHOULDER]: [0.02, 0.30],
  [LM.L_ELBOW]:    [-0.04, 0.20], [LM.R_ELBOW]:    [0.06, 0.44],
  [LM.L_WRIST]:    [ 0.04, 0.12], [LM.R_WRIST]:    [0.09, 0.57],
  [LM.L_HIP]:      [ 0.02, 0.58], [LM.R_HIP]:      [0.10, 0.58],
  [LM.L_KNEE]:     [-0.02, 0.76], [LM.R_KNEE]:     [0.16, 0.76],
  [LM.L_ANKLE]:    [-0.06, 0.95], [LM.R_ANKLE]:    [0.22, 0.95],
})

const STANDING = pose({
  [LM.L_SHOULDER]: [-0.06, 0.30], [LM.R_SHOULDER]: [0.06, 0.30],
  [LM.L_ELBOW]:    [-0.07, 0.44], [LM.R_ELBOW]:    [0.07, 0.44],
  [LM.L_WRIST]:    [-0.08, 0.57], [LM.R_WRIST]:    [0.08, 0.57],
  [LM.L_HIP]:      [-0.04, 0.58], [LM.R_HIP]:      [0.04, 0.58],
  [LM.L_KNEE]:     [-0.04, 0.77], [LM.R_KNEE]:     [0.04, 0.77],
  [LM.L_ANKLE]:    [-0.04, 0.95], [LM.R_ANKLE]:    [0.04, 0.95],
})

// 기울이지 않고 한 팔만 든 자세 — 옆구리 늘리기로 통과하면 안 된다
const ONE_ARM_UP = pose({
  [LM.L_SHOULDER]: [-0.06, 0.30], [LM.R_SHOULDER]: [0.06, 0.30],
  [LM.L_ELBOW]:    [-0.08, 0.16], [LM.R_ELBOW]:    [0.07, 0.44],
  [LM.L_WRIST]:    [-0.09, 0.03], [LM.R_WRIST]:    [0.08, 0.57],
  [LM.L_HIP]:      [-0.04, 0.58], [LM.R_HIP]:      [0.04, 0.58],
  [LM.L_KNEE]:     [-0.04, 0.77], [LM.R_KNEE]:     [0.04, 0.77],
  [LM.L_ANKLE]:    [-0.04, 0.95], [LM.R_ANKLE]:    [0.04, 0.95],
})

const score = (lms, type) => matchPose(lms, type, ASPECT)

// ── 완벽한 자세는 감점당하지 않는다 ──────────────────────────────
//
// 원래 채점은 모든 관절을 양방향으로 봤다. "팔을 펴라"는 관절의 목표가 165°인데
// 관절은 180°에서 멈추므로, **완벽하게 편 팔이 15° 벗어난 것으로 감점당했다.**
// 그 결과 기하학적으로 완벽한 T포즈가 0.70점 — 기준 0.75를 못 넘었다.
// 아무리 잘해도 통과할 수 없었고, 아이는 "인식이 안 된다"고 느꼈다.
describe('완벽한 자세는 감점당하지 않는다', () => {
  it('완벽한 T포즈가 기준을 넘는다', () => {
    expect(score(T_POSE, 'armsopen')).toBeGreaterThanOrEqual(THRESHOLD)
  })

  it("'min' — 목표 이상이면 만점", () => {
    const spec = [165, 30, 1.5, 'min']
    expect(jointScore(180, spec)).toBe(1)
    expect(jointScore(165, spec)).toBe(1)
    expect(jointScore(150, spec)).toBeCloseTo(0.5, 5)   // 덜 편 것은 여전히 깎인다
  })

  it("'max' — 목표 이하면 만점", () => {
    const spec = [35, 40, 1, 'max']
    expect(jointScore(0, spec)).toBe(1)
    expect(jointScore(75, spec)).toBe(0)
  })

  it('굽히는 관절은 양방향 그대로 — 너무 펴도 너무 굽혀도 깎인다', () => {
    const spec = [105, 40, 2]
    expect(jointScore(105, spec)).toBe(1)
    expect(jointScore(145, spec)).toBe(0)
    expect(jointScore(65, spec)).toBe(0)
  })

  it('180°에서 멈추는 관절(목표 150° 초과)은 전부 min이다', () => {
    for (const [p, targets] of Object.entries(POSE_TARGETS)) {
      for (const [joint, spec] of Object.entries(targets)) {
        if (joint !== 'torsoTilt' && spec[0] > 150) {
          expect(`${p}.${joint}=${spec[3]}`).toBe(`${p}.${joint}=min`)
        }
      }
    }
  })
})

// ── 사인판 그림과 판정이 같은 동작이어야 한다 ────────────────────
//
// `forwardbend`는 이름과 달리 **옆구리 늘리기**다. 사인판과 캐릭터 그림 둘 다
// 옆구리 늘리기인데 코드만 "상체 앞으로 접기"(고관절 75°)를 보고 있었다.
// 그림대로 정확히 해도 고관절이 150~175°라 0점 — 통과할 수 없는 포즈였다.
describe('옆구리 늘리기 (키 이름은 forwardbend)', () => {
  it('그림대로 하면 통과한다', () => {
    expect(score(SIDE_BEND, 'forwardbend')).toBeGreaterThanOrEqual(THRESHOLD)
  })

  it('반대쪽으로 기울여도 같다 — 좌우를 강요하지 않는다', () => {
    const flipped = SIDE_BEND.map(p => ({ ...p, x: 1 - p.x }))
    expect(score(flipped, 'forwardbend')).toBeCloseTo(score(SIDE_BEND, 'forwardbend'), 6)
  })

  it('그냥 서 있으면 통과하지 못한다', () => {
    expect(score(STANDING, 'forwardbend')).toBeLessThan(THRESHOLD)
  })

  // 몸통 기울기를 안 보면 팔만 들어도 통과한다 — 운동이 안 되는 통과다
  it('기울이지 않고 팔만 들면 통과하지 못한다', () => {
    expect(score(ONE_ARM_UP, 'forwardbend')).toBeLessThan(THRESHOLD)
  })
})

describe('포즈끼리 섞이지 않는다', () => {
  it('그냥 서 있기는 어떤 포즈로도 통과하지 못한다', () => {
    for (const type of Object.keys(POSE_TARGETS)) {
      expect(score(STANDING, type)).toBeLessThan(THRESHOLD)
    }
  })

  it('옆구리 늘리기가 팔 벌리기로 통과하지 않는다', () => {
    expect(score(SIDE_BEND, 'armsopen')).toBeLessThan(THRESHOLD)
  })

  it('T포즈가 옆구리 늘리기로 통과하지 않는다', () => {
    expect(score(T_POSE, 'forwardbend')).toBeLessThan(THRESHOLD)
  })
})

// ── 화면 비율 보정 ─────────────────────────────────────────────
//
// x는 가로 폭으로, y는 세로 높이로 정규화된다. 보정 없이 각도를 재면
// 같은 자세가 카메라 해상도에 따라 다른 점수를 받는다.
describe('화면 비율 보정', () => {
  it('비스듬한 자세는 보정 없이는 각도가 어긋난다', () => {
    const withFix = jointAngles(SIDE_BEND, ASPECT).torsoTilt
    const noFix   = jointAngles(SIDE_BEND, 1).torsoTilt
    expect(Math.abs(withFix - noFix)).toBeGreaterThan(5)
  })

  // 같은 사람이 4:3 카메라로 바꿔 들었다고 점수가 달라지면 안 된다
  it('실제 비율이 같으면 프레임 비율이 달라도 같은 각도가 나온다', () => {
    const as43 = pts => {
      const a = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
      for (const [i, p] of Object.entries(pts)) a[i] = { ...p, x: 0.5 + (p.x - 0.5) * ASPECT / (4 / 3) }
      return a
    }
    const a16 = jointAngles(SIDE_BEND, ASPECT)
    const a43 = jointAngles(as43(SIDE_BEND), 4 / 3)
    for (const k of Object.keys(a16)) expect(a43[k]).toBeCloseTo(a16[k], 4)
  })
})

describe('진단용 관절 내역', () => {
  it('점수가 낮은 관절부터 나온다 — 범인이 맨 위', () => {
    const { joints } = jointScores(SIDE_BEND, 'forwardbend', ASPECT)
    const scores = joints.map(j => j[1])
    expect(scores).toEqual([...scores].sort((a, b) => a - b))
  })

  it('내역의 총점이 matchPose와 어긋나지 않는다', () => {
    const { total } = jointScores(T_POSE, 'armsopen', ASPECT)
    expect(total).toBeCloseTo(score(T_POSE, 'armsopen'), 6)
  })

  it('없는 포즈·랜드마크는 0점', () => {
    expect(score(T_POSE, '없는포즈')).toBe(0)
    expect(score(null, 'armsopen')).toBe(0)
    expect(jointScores(T_POSE, '없는포즈', ASPECT).total).toBe(0)
  })
})
