// 게임별 요구 관절 — **표가 실제 게임과 어긋나지 않게 붙들어 둔다.**
//
// manifest의 `detectors`는 지금까지 아무도 안 읽는 필드였다. 이제 이 필드로
// "카메라 준비에서 무엇을 요구할지"를 정하게 되므로, 모르는 이름이 적혀 있으면
// 그 게임은 **요구가 텅 빈 채로 통과**된다 — 조용히 아무거나 통과되는 쪽이라
// 화면만 봐서는 못 찾는다. `metrics`에서 겪은 것과 같은 종류다(`gamePack.test.js`).

import { describe, it, expect } from 'vitest'
import { GAME_REGISTRY } from '../src/games/registry.js'
import { DETECTOR_POINTS, requiredPoints, checkPoints, pointVisible } from '../src/core/pose/requirements.js'
import { LM } from '../src/core/pose/gesture.js'

const real = Object.entries(GAME_REGISTRY).filter(([, g]) => !g.placeholder)

// 화면 한가운데 잘 보이는 점
const seen = (x = 0.5, y = 0.5) => ({ x, y, z: 0, visibility: 0.9 })

describe('감지기별 요구 관절표', () => {
  it('manifest의 detectors는 전부 표에 있는 이름이다', () => {
    for (const [id, g] of real) {
      for (const d of g.manifest.detectors ?? []) {
        expect(DETECTOR_POINTS[d], `${id} → ${d}`).toBeTruthy()
      }
    }
  })

  it('운동을 만드는 게임은 detectors를 비워두지 않는다', () => {
    for (const [id, g] of real) {
      expect((g.manifest.detectors ?? []).length, id).toBeGreaterThan(0)
    }
  })

  it('표의 모든 점은 실재하는 랜드마크 번호다', () => {
    const valid = new Set(Object.values(LM))
    for (const [name, spec] of Object.entries(DETECTOR_POINTS)) {
      for (const i of [...spec.move, ...spec.scale]) {
        expect(valid.has(i), `${name} → ${i}`).toBe(true)
      }
    }
  })
})

describe('요구 관절 계산', () => {
  it('중복 없이 오름차순으로 돌려준다', () => {
    const p = requiredPoints(['jump', 'squat', 'lane'])
    expect(p).toEqual([...new Set(p)].sort((a, b) => a - b))
  })

  // ── 이 프로젝트가 이걸로 얻으려는 것 ★ ──────────────────
  //
  // 발목을 요구하지 않게 되면 얼마나 줄어드나. 줄지 않으면 이 작업은 헛일이다.
  it('크기 재기를 빼면 발목 요구가 사라진다 — 다리를 진짜 쓰는 게임만 빼고', () => {
    const legless = ['zone', 'lane', 'jump', 'squat', 'duck', 'armsUp', 'poseMatch']
    const p = requiredPoints(legless, { withScale: false })
    expect(p).not.toContain(LM.L_ANKLE)
    expect(p).not.toContain(LM.R_ANKLE)

    // 반대로 이 둘은 빼도 발목이 남아야 한다 — 발목이 곧 그 동작이다
    for (const d of ['highKnees', 'balance']) {
      expect(requiredPoints([d], { withScale: false }), d).toContain(LM.L_ANKLE)
    }
  })

  it('크기 재기를 빼면 요구 관절이 실제로 줄어든다', () => {
    for (const [id, g] of real) {
      const full = requiredPoints(g.manifest.detectors, { withScale: true })
      const lean = requiredPoints(g.manifest.detectors, { withScale: false })
      expect(lean.length, id).toBeLessThanOrEqual(full.length)
    }
  })

  it('모르는 이름은 조용히 넘긴다 (막는 건 위의 테스트가 한다)', () => {
    expect(requiredPoints(['없는감지기'])).toEqual([])
  })
})

describe('보임 판정', () => {
  it('프레임 밖이거나 신뢰도가 낮으면 안 보이는 것으로 친다', () => {
    expect(pointVisible(seen())).toBe(true)
    expect(pointVisible({ ...seen(), visibility: 0.2 })).toBe(false)
    expect(pointVisible(seen(0.5, 1.5))).toBe(false)
    expect(pointVisible(undefined)).toBe(false)
  })

  // "뒤로 물러나 주세요"가 항상 맞는 말은 아니다.
  // 머리가 잘렸으면 물러설 게 아니라 카메라를 올려야 한다.
  it('무엇이 잘렸는지에 따라 위/아래를 구분한다', () => {
    const lms = []
    lms[LM.NOSE] = seen(0.5, -0.4)          // 머리가 위로 나감
    lms[LM.L_ANKLE] = seen(0.45, 0.9)
    const r = checkPoints(lms, [LM.NOSE, LM.L_ANKLE])
    expect(r.ok).toBe(false)
    expect(r.side).toBe('top')

    lms[LM.NOSE] = seen(0.5, 0.1)
    lms[LM.L_ANKLE] = seen(0.45, 1.4)       // 발이 아래로 나감
    expect(checkPoints(lms, [LM.NOSE, LM.L_ANKLE]).side).toBe('bottom')
  })

  it('다 보이면 통과다', () => {
    const lms = []
    for (const i of Object.values(LM)) lms[i] = seen()
    expect(checkPoints(lms, requiredPoints(['jump', 'lane'])).ok).toBe(true)
  })

  it('랜드마크가 아예 없으면 통과가 아니다', () => {
    expect(checkPoints(null, [LM.NOSE]).ok).toBe(false)
  })
})
