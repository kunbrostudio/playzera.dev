// 다인 카메라 추적 — "그 아이 한 명"을 계속 골라내는지 (STEP 63)
//
// 카메라에 아이 말고 돕는 보호자까지 잡히는 상황을 시뮬레이션한다. 실제
// 프레임 흔들림은 못 재현하지만, 두 단계(잠기기 전 점수 · 잠긴 뒤 위치
// 추적)가 설계대로 도는지는 순수 함수라 여기서 다 확인할 수 있다.
import { describe, it, expect } from 'vitest'
import { LM } from '../src/core/pose/gesture.js'
import { hipCenterOf, shoulderCenterOf, anchorOf, acquisitionScore, createPersonLock } from '../src/core/pose/personLock.js'

/**
 * 전신 최소 프레임. hipX가 골반 중심, bodyHeight는 코~발목 거리(0..1).
 * oGesture=true면 머리 위로 손목을 모아 O자세를 만든다(gesture.js 기준).
 */
const person = (hipX, { bodyHeight = 0.6, oGesture = false, noseY = 0.1, visibility = 1 } = {}) => {
  const lm = []
  lm[LM.NOSE]   = { x: hipX, y: noseY, visibility }
  lm[LM.L_SHOULDER] = { x: hipX - 0.08, y: 0.3, visibility }
  lm[LM.R_SHOULDER] = { x: hipX + 0.08, y: 0.3, visibility }
  lm[LM.L_HIP]  = { x: hipX - 0.03, y: 0.5, visibility }
  lm[LM.R_HIP]  = { x: hipX + 0.03, y: 0.5, visibility }
  lm[LM.L_ANKLE] = { x: hipX, y: noseY + bodyHeight, visibility }
  lm[LM.R_ANKLE] = { x: hipX, y: noseY + bodyHeight, visibility }
  if (oGesture) {
    lm[LM.L_WRIST] = { x: hipX - 0.02, y: noseY - bodyHeight * 0.6, visibility }
    lm[LM.R_WRIST] = { x: hipX + 0.02, y: noseY - bodyHeight * 0.6, visibility }
  } else {
    lm[LM.L_WRIST] = { x: hipX - 0.1, y: 0.6, visibility }
    lm[LM.R_WRIST] = { x: hipX + 0.1, y: 0.6, visibility }
  }
  return lm
}

const gestureCheck = lms => {
  // isArmsUpCircle을 새로 import하지 않고, oGesture로 만든 손목 배치를
  // person()과 같은 기준으로 직접 판정한다 — 모듈 간 순환 의존을 피한다.
  const lw = lms[LM.L_WRIST], rw = lms[LM.R_WRIST], nose = lms[LM.NOSE]
  if (!lw || !rw || !nose) return false
  return nose.y - lw.y > 0.05 && nose.y - rw.y > 0.05 && Math.hypot(lw.x - rw.x, lw.y - rw.y) < 0.2
}

describe('hipCenterOf', () => {
  it('좌우 골반 중점을 낸다', () => {
    const hc = hipCenterOf(person(0.4))
    expect(hc.x).toBeCloseTo(0.4, 5)
  })
  it('골반이 안 보이면 null', () => {
    const lm = person(0.4)
    lm[LM.L_HIP] = undefined
    expect(hipCenterOf(lm)).toBeNull()
  })
})

// ── 앉아서/가까이 노는 사람도 잡혀야 한다 ★ ───────────────────
//
// 원래는 자리를 골반으로만 쟀는데, 책상 앞에 앉으면 골반이 프레임 밖이거나
// 가려서 안 보인다 → `select()`가 null → `poseEngine`이 구독자를 아예 안
// 부름 → 화면에서는 "트래킹이 안 된다". 실제로 겪은 버그다(STEP 76 후속
// 라운드 5, 감지율 표시가 0회/초를 찍어서 잡혔다).
const upperBodyOnly = (hipX, opts = {}) => {
  const lm = person(hipX, opts)
  lm[LM.L_HIP] = undefined
  lm[LM.R_HIP] = undefined
  lm[LM.L_ANKLE] = undefined
  lm[LM.R_ANKLE] = undefined
  return lm
}

describe('anchorOf — 골반이 없으면 어깨로 떨어진다 ★', () => {
  it('골반이 보이면 골반 중심을 쓴다', () => {
    expect(anchorOf(person(0.4)).y).toBeCloseTo(0.5, 5)   // 골반 y
  })

  it('골반이 안 보이면 어깨 중심을 쓴다', () => {
    const a = anchorOf(upperBodyOnly(0.4))
    expect(a).not.toBeNull()
    expect(a.x).toBeCloseTo(0.4, 5)
    expect(a.y).toBeCloseTo(0.3, 5)   // 어깨 y
  })

  it('골반도 어깨도 없으면 null', () => {
    const lm = upperBodyOnly(0.4)
    lm[LM.L_SHOULDER] = undefined
    lm[LM.R_SHOULDER] = undefined
    expect(anchorOf(lm)).toBeNull()
    expect(shoulderCenterOf(lm)).toBeNull()
  })
})

describe('상반신만 보여도 사람을 골라낸다 ★ (0회/초 버그)', () => {
  it('골반·발목이 안 보이는 후보도 점수가 -Infinity가 아니다', () => {
    expect(acquisitionScore(upperBodyOnly(0.5), gestureCheck)).toBeGreaterThan(-Infinity)
  })

  it('앉아 있는 사람 하나뿐이어도 select가 그 사람을 낸다(null이 아니다)', () => {
    const lock = createPersonLock({ gestureCheck })
    const seated = upperBodyOnly(0.5)
    expect(lock.select([seated], 0)).toBe(seated)
  })

  it('상반신만 보이는 사람도 잠그고 계속 따라간다', () => {
    const lock = createPersonLock({ gestureCheck })
    lock.select([upperBodyOnly(0.5)], 0)
    lock.confirmLock()
    expect(lock.isLocked).toBe(true)
    const moved = upperBodyOnly(0.53)
    expect(lock.select([moved], 16)).toBe(moved)
  })

  it('가까이 앉아 어깨가 넓게 잡힌 쪽을 더 높게 본다(발목이 없어도 크기를 잰다)', () => {
    const near = upperBodyOnly(0.5)
    const far = upperBodyOnly(0.5)
    far[LM.L_SHOULDER] = { x: 0.48, y: 0.3, visibility: 1 }   // 어깨 폭 0.04 (멀다)
    far[LM.R_SHOULDER] = { x: 0.52, y: 0.3, visibility: 1 }
    expect(acquisitionScore(near, gestureCheck)).toBeGreaterThan(acquisitionScore(far, gestureCheck))
  })
})

describe('acquisitionScore — 잠기기 전 후보 점수', () => {
  it('화면 중앙에 가까울수록 높다', () => {
    const center = acquisitionScore(person(0.5), gestureCheck)
    const edge = acquisitionScore(person(0.9), gestureCheck)
    expect(center).toBeGreaterThan(edge)
  })

  it('O자세를 시도 중이면 위치·크기를 뒤집을 만큼 압도적으로 높다', () => {
    // 화면 구석에 작게 잡힌 사람이라도 O자세만 하고 있으면,
    // 가운데에 크게 서 있는(그러나 제스처 없는) 사람보다 점수가 높아야 한다.
    const gesturing = acquisitionScore(person(0.9, { bodyHeight: 0.2, oGesture: true }), gestureCheck)
    const centered = acquisitionScore(person(0.5, { bodyHeight: 1.0 }), gestureCheck)
    expect(gesturing).toBeGreaterThan(centered)
  })
})

describe('createPersonLock — 잠기기 전(unlocked) 선택', () => {
  it('후보가 하나면 그대로 고른다', () => {
    const lock = createPersonLock({ gestureCheck })
    const only = person(0.7)
    expect(lock.select([only], 0)).toBe(only)
  })

  it('여럿이면 중앙·크기 점수가 높은 쪽을 고른다(제스처 없을 때)', () => {
    const lock = createPersonLock({ gestureCheck })
    const centered = person(0.5, { bodyHeight: 0.8 })   // 가운데, 크게(가까이)
    const sideSmall = person(0.9, { bodyHeight: 0.2 })  // 구석, 작게(멀리) — 보호자 상황
    expect(lock.select([sideSmall, centered], 0)).toBe(centered)
  })

  it('구석에 있어도 O자세를 시도 중이면 그 사람을 고른다', () => {
    const lock = createPersonLock({ gestureCheck })
    const centeredAdult = person(0.5, { bodyHeight: 0.8 })          // 가운데, 큰 어른(보호자)
    const gesturingKid = person(0.85, { bodyHeight: 0.3, oGesture: true }) // 구석, 작은 아이 — 시작 동작 중
    expect(lock.select([centeredAdult, gesturingKid], 0)).toBe(gesturingKid)
  })
})

describe('createPersonLock — confirmLock 이후(locked) 위치 추적', () => {
  it('확정한 사람의 위치로 계속 따라간다 — 더 중앙에 있는 새 후보가 나타나도 안 넘어간다', () => {
    const lock = createPersonLock({ gestureCheck })
    const kid = person(0.8, { bodyHeight: 0.3 })
    lock.select([kid], 0)
    lock.confirmLock()

    // 다음 프레임: 아이는 살짝 움직였고(0.8→0.78), 화면 가운데에 어른이 새로 들어왔다.
    const kidMoved = person(0.78, { bodyHeight: 0.3 })
    const adultCentered = person(0.5, { bodyHeight: 0.9 })
    const picked = lock.select([adultCentered, kidMoved], 16)
    expect(picked).toBe(kidMoved)
  })

  it('잠금 위치에서 너무 멀면(TRACK_MATCH_DIST 밖) 같은 사람으로 안 본다', () => {
    const lock = createPersonLock({ gestureCheck })
    lock.select([person(0.2, { bodyHeight: 0.3 })], 0)
    lock.confirmLock()

    // 골반 x가 0.2 → 0.9로 순간이동한 후보 하나만 있다 — 유예 안이라 null(놓친 것으로 본다)
    const teleported = person(0.9, { bodyHeight: 0.3 })
    expect(lock.select([teleported], 16)).toBeNull()
  })

  it('놓쳐도 유예 시간 안이면 다른 사람에게 안 넘어간다(null을 낸다)', () => {
    const lock = createPersonLock({ gestureCheck })
    lock.select([person(0.5, { bodyHeight: 0.3 })], 0)
    lock.confirmLock()

    // 잠금 위치(0.5)와는 다른 자리(0.9)에 다른 사람 — 위치로는 같은 사람이 아니다
    const someoneElse = person(0.9, { bodyHeight: 0.3 })
    // 잠긴 사람이 프레임 밖으로 나갔다(골반 안 보임) — 후보가 없다
    expect(lock.select([], 1000)).toBeNull()
    // 유예(2.5초=2500ms) 안이므로 다른 사람이 있어도 그쪽으로 넘어가지 않는다
    expect(lock.select([someoneElse], 2000)).toBeNull()
  })

  it('유예를 넘기면 잠금을 풀고 다시 고른다', () => {
    const lock = createPersonLock({ gestureCheck })
    lock.select([person(0.5, { bodyHeight: 0.3 })], 0)
    lock.confirmLock()

    expect(lock.select([], 1000)).toBeNull()
    const someoneElse = person(0.9, { bodyHeight: 0.3 })
    // 유예(2500ms)를 넘겼다 — 다시 고르기로 돌아가 있는 후보를 새로 뽑는다
    expect(lock.select([someoneElse], 4000)).toBe(someoneElse)
  })
})

describe('createPersonLock — isLocked / reset', () => {
  it('confirmLock 전에는 잠겨 있지 않다', () => {
    const lock = createPersonLock({ gestureCheck })
    lock.select([person(0.5)], 0)
    expect(lock.isLocked).toBe(false)
  })

  it('confirmLock 하면 잠긴다, reset하면 풀린다', () => {
    const lock = createPersonLock({ gestureCheck })
    lock.select([person(0.5)], 0)
    lock.confirmLock()
    expect(lock.isLocked).toBe(true)
    lock.reset()
    expect(lock.isLocked).toBe(false)
  })
})
