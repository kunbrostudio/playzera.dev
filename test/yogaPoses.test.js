// 요가 자세 — **카메라 없이 "인식이 되는가"를 답한다.**
//
// 몸으로 테스트할 수 없는 동안에도 두 가지는 여기서 확인된다.
//   1. 자세를 **정확히** 했을 때 통과하는가 (통과 불가능한 자세를 만들지 않는다)
//   2. 자세끼리 **구별**되는가 (나무를 했는데 산으로 세어지면 안 된다)
//
// 두 번째가 특히 중요하다. 웜업에서 옆구리 늘리기가 통과 불가능한 자세였던 것도,
// T포즈가 완벽한 180°에서 감점당한 것도 전부 이런 표로 잡혔다.
//
// 뼈대는 **사람이 읽을 수 있는 실제 비율**로 적고(원점=몸 중앙, 단위=프레임 높이)
// 16:9 정규화는 기계가 한다. 정규화 좌표를 손으로 적으면 가로가 눌린 자세를 적게 된다.

import { describe, it, expect } from 'vitest'
import { LM } from '../src/core/pose/gesture.js'
import { matchTargets, poseFeatures, matchDetail } from '../src/core/pose/poseMatch.js'
import { YOGA_POSES, getPose, YOGA_THRESHOLD } from '../src/core/pose/poses.js'

const A = 16 / 9
const pose = pts => {
  const a = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
  for (const [i, [X, Y]] of Object.entries(pts)) a[i] = { x: 0.5 + X / A, y: Y, visibility: 1 }
  return a
}

// ── 자세별 뼈대 (제대로 한 아이) ─────────────────────────────
const SK = {
  // 산 — 똑바로 서서 두 손을 머리 위로 모은다
  mountain: pose({
    [LM.NOSE]: [0, 0.16],
    [LM.L_SHOULDER]: [-0.08, 0.30], [LM.R_SHOULDER]: [0.08, 0.30],
    [LM.L_ELBOW]: [-0.07, 0.18], [LM.R_ELBOW]: [0.07, 0.18],
    [LM.L_WRIST]: [-0.02, 0.07], [LM.R_WRIST]: [0.02, 0.07],
    [LM.L_HIP]: [-0.05, 0.58], [LM.R_HIP]: [0.05, 0.58],
    [LM.L_KNEE]: [-0.05, 0.77], [LM.R_KNEE]: [0.05, 0.77],
    [LM.L_ANKLE]: [-0.05, 0.95], [LM.R_ANKLE]: [0.05, 0.95],
  }),
  // 나무 — 왼발을 오른 다리에 붙이고 손은 머리 위로
  tree: pose({
    [LM.NOSE]: [0, 0.16],
    [LM.L_SHOULDER]: [-0.08, 0.30], [LM.R_SHOULDER]: [0.08, 0.30],
    [LM.L_ELBOW]: [-0.07, 0.18], [LM.R_ELBOW]: [0.07, 0.18],
    [LM.L_WRIST]: [-0.02, 0.07], [LM.R_WRIST]: [0.02, 0.07],
    [LM.L_HIP]: [-0.05, 0.58], [LM.R_HIP]: [0.05, 0.58],
    [LM.L_KNEE]: [-0.16, 0.72], [LM.R_KNEE]: [0.05, 0.77],
    [LM.L_ANKLE]: [0.02, 0.78], [LM.R_ANKLE]: [0.05, 0.95],
  }),
  // 별 — 팔다리를 X자로
  star: pose({
    [LM.NOSE]: [0, 0.16],
    [LM.L_SHOULDER]: [-0.08, 0.30], [LM.R_SHOULDER]: [0.08, 0.30],
    [LM.L_ELBOW]: [-0.20, 0.22], [LM.R_ELBOW]: [0.20, 0.22],
    [LM.L_WRIST]: [-0.31, 0.13], [LM.R_WRIST]: [0.31, 0.13],
    [LM.L_HIP]: [-0.05, 0.58], [LM.R_HIP]: [0.05, 0.58],
    [LM.L_KNEE]: [-0.14, 0.77], [LM.R_KNEE]: [0.14, 0.77],
    [LM.L_ANKLE]: [-0.23, 0.95], [LM.R_ANKLE]: [0.23, 0.95],
  }),
  // 용사 — 다리 넓게, 팔 수평, 앞 무릎 굽힘
  warrior: pose({
    [LM.NOSE]: [0, 0.20],
    [LM.L_SHOULDER]: [-0.08, 0.34], [LM.R_SHOULDER]: [0.08, 0.34],
    [LM.L_ELBOW]: [-0.20, 0.34], [LM.R_ELBOW]: [0.20, 0.34],
    [LM.L_WRIST]: [-0.32, 0.34], [LM.R_WRIST]: [0.32, 0.34],
    [LM.L_HIP]: [-0.05, 0.62], [LM.R_HIP]: [0.05, 0.62],
    [LM.L_KNEE]: [-0.22, 0.78], [LM.R_KNEE]: [0.16, 0.79],
    [LM.L_ANKLE]: [-0.24, 0.96], [LM.R_ANKLE]: [0.30, 0.96],
  }),
  // 세모 — 다리 넓게 + 옆으로 기울여 한 손은 위, 한 손은 아래
  triangle: pose({
    [LM.NOSE]: [-0.16, 0.26],
    [LM.L_SHOULDER]: [-0.14, 0.38], [LM.R_SHOULDER]: [-0.02, 0.34],
    [LM.L_ELBOW]: [-0.16, 0.52], [LM.R_ELBOW]: [0.00, 0.20],
    [LM.L_WRIST]: [-0.19, 0.66], [LM.R_WRIST]: [0.02, 0.07],
    [LM.L_HIP]: [0.03, 0.60], [LM.R_HIP]: [0.11, 0.58],
    [LM.L_KNEE]: [-0.06, 0.78], [LM.R_KNEE]: [0.20, 0.78],
    [LM.L_ANKLE]: [-0.15, 0.96], [LM.R_ANKLE]: [0.29, 0.96],
  }),
  // 홍학 — 한 발 들고 팔은 수평
  flamingo: pose({
    [LM.NOSE]: [0, 0.16],
    [LM.L_SHOULDER]: [-0.08, 0.30], [LM.R_SHOULDER]: [0.08, 0.30],
    [LM.L_ELBOW]: [-0.20, 0.30], [LM.R_ELBOW]: [0.20, 0.30],
    [LM.L_WRIST]: [-0.32, 0.30], [LM.R_WRIST]: [0.32, 0.30],
    [LM.L_HIP]: [-0.05, 0.58], [LM.R_HIP]: [0.05, 0.58],
    [LM.L_KNEE]: [-0.10, 0.70], [LM.R_KNEE]: [0.05, 0.77],
    [LM.L_ANKLE]: [-0.08, 0.83], [LM.R_ANKLE]: [0.05, 0.95],
  }),
  // 선인장 — 팔을 ㄱ자로 굽혀 위로
  cactus: pose({
    [LM.NOSE]: [0, 0.16],
    [LM.L_SHOULDER]: [-0.08, 0.30], [LM.R_SHOULDER]: [0.08, 0.30],
    [LM.L_ELBOW]: [-0.22, 0.30], [LM.R_ELBOW]: [0.22, 0.30],
    [LM.L_WRIST]: [-0.22, 0.15], [LM.R_WRIST]: [0.22, 0.15],
    [LM.L_HIP]: [-0.05, 0.58], [LM.R_HIP]: [0.05, 0.58],
    [LM.L_KNEE]: [-0.05, 0.77], [LM.R_KNEE]: [0.05, 0.77],
    [LM.L_ANKLE]: [-0.05, 0.95], [LM.R_ANKLE]: [0.05, 0.95],
  }),
}

const score = (skeletonId, poseId) => matchTargets(SK[skeletonId], getPose(poseId).targets, A)

describe('요가 자세 사전', () => {
  it('사전의 모든 자세에 뼈대 예시가 있다 — 검증 안 된 자세를 넣지 않는다', () => {
    for (const p of YOGA_POSES) expect(SK[p.id], p.id).toBeTruthy()
  })

  it('아이가 읽을 이름과 설명이 있다', () => {
    for (const p of YOGA_POSES) {
      expect(p.name, p.id).toBeTruthy()
      expect(p.how, p.id).toBeTruthy()
      expect(p.emoji, p.id).toBeTruthy()
    }
  })

  // docs/07 안전 규칙 — 4~8세는 한 자세를 오래 못 버틴다
  it('유지 시간이 3초를 넘지 않는다', () => {
    for (const p of YOGA_POSES) expect(p.holdSec, p.id).toBeLessThanOrEqual(3)
  })
})

describe('제대로 하면 통과한다', () => {
  // **통과 불가능한 자세를 만들지 않는다.** 웜업의 옆구리 늘리기가 실제로 그랬다 —
  // 그림대로 정확히 해도 0.36점이라 아무도 통과할 수 없었다.
  it('자기 자세는 문턱을 훌쩍 넘는다', () => {
    for (const p of YOGA_POSES) {
      const s = score(p.id, p.id)
      expect(s, `${p.id} = ${s.toFixed(2)}`).toBeGreaterThan(0.9)
    }
  })

  it('좌우를 바꿔도 같은 점수다 — 어느 발을 들든 같은 자세다', () => {
    const mirror = lms => lms.map(pt => ({ ...pt, x: 1 - pt.x }))
    for (const id of ['tree', 'flamingo', 'warrior', 'triangle']) {
      const a = matchTargets(SK[id], getPose(id).targets, A)
      const b = matchTargets(mirror(SK[id]), getPose(id).targets, A)
      expect(Math.abs(a - b), id).toBeLessThan(0.02)
    }
  })
})

describe('자세끼리 구별된다', () => {
  // 나무를 했는데 산으로 세어지면 기록이 거짓말이 된다.
  // **표로 확인한다** — 실제로 이 표 때문에 산의 "두 발 바닥" 가중치를 4까지 올렸고,
  // 용사에 "두 발이 바닥에"를 새로 넣었다(홍학이 용사로 0.72점을 받았다).
  it('다른 자세는 문턱을 넘지 않는다', () => {
    const bad = []
    for (const a of YOGA_POSES) {
      for (const b of YOGA_POSES) {
        if (a.id === b.id) continue
        const s = score(a.id, b.id)
        if (s >= YOGA_THRESHOLD) bad.push(`${a.id} 자세가 ${b.id}로 ${s.toFixed(2)}`)
      }
    }
    expect(bad).toEqual([])
  })

  it('자기 점수가 언제나 가장 높다', () => {
    for (const a of YOGA_POSES) {
      const mine = score(a.id, a.id)
      for (const b of YOGA_POSES) {
        if (a.id === b.id) continue
        expect(score(a.id, b.id), `${a.id} vs ${b.id}`).toBeLessThan(mine)
      }
    }
  })

  // 서 있기만 해도 통과하는 자세가 있으면 아이는 아무것도 안 하고 보상을 받는다
  it('가만히 서 있는 것으로는 어떤 자세도 통과하지 못한다', () => {
    const standing = pose({
      [LM.NOSE]: [0, 0.16],
      [LM.L_SHOULDER]: [-0.08, 0.30], [LM.R_SHOULDER]: [0.08, 0.30],
      [LM.L_ELBOW]: [-0.09, 0.44], [LM.R_ELBOW]: [0.09, 0.44],
      [LM.L_WRIST]: [-0.10, 0.57], [LM.R_WRIST]: [0.10, 0.57],
      [LM.L_HIP]: [-0.05, 0.58], [LM.R_HIP]: [0.05, 0.58],
      [LM.L_KNEE]: [-0.05, 0.77], [LM.R_KNEE]: [0.05, 0.77],
      [LM.L_ANKLE]: [-0.05, 0.95], [LM.R_ANKLE]: [0.05, 0.95],
    })
    for (const p of YOGA_POSES) {
      const s = matchTargets(standing, p.targets, A)
      expect(s, `${p.id} = ${s.toFixed(2)}`).toBeLessThan(YOGA_THRESHOLD)
    }
  })
})

describe('특징값', () => {
  // 각도만으로는 삼각 자세와 초승달이, 나무와 산이 안 갈린다.
  it('다리 폭과 발 들림이 비율로 나온다', () => {
    const wide = poseFeatures(SK.star, A)
    const narrow = poseFeatures(SK.mountain, A)
    expect(wide.stance).toBeGreaterThan(narrow.stance * 2)

    expect(poseFeatures(SK.tree, A).footLift).toBeGreaterThan(0.1)
    expect(poseFeatures(SK.mountain, A).footLift).toBeLessThan(0.02)
  })

  it('두 손을 모으면 handGap이 작아진다', () => {
    expect(poseFeatures(SK.mountain, A).handGap).toBeLessThan(0.5)
    expect(poseFeatures(SK.star, A).handGap).toBeGreaterThan(3)
  })

  // 총점만 보면 왜 안 맞는지 알 수 없다. 낮은 항목이 맨 위로 온다.
  it('진단은 범인을 맨 앞에 놓는다', () => {
    const d = matchDetail(SK.star, getPose('mountain').targets, A)
    expect(d.joints[0][1]).toBeLessThan(0.3)
    expect(d.total).toBeLessThan(YOGA_THRESHOLD)
  })
})
