// 트래커(손을 따라다니는 동그란 포인터) 고르기 — 카메라 없이 순수 함수로 검증.
//
// ken 5차 피드백의 핵심: "내 손이 하나인데 왜 트래커 포인트가 두개가
// 나와서 헷갈리게 해?" — MediaPipe Pose는 안 보이는 관절도 좌표를
// **지어내서** 33개를 항상 채우므로, 손을 하나만 들어도 반대쪽 손목에
// 그럴듯한 값이 들어온다. 그래서 "진짜만 고르기"를 잘하려 하는 대신
// **트래커를 하나로 줄였다**. 아래 테스트는 그 규칙이 지켜지는지를 본다.
import { describe, it, expect } from 'vitest'
import { LM } from '../src/core/pose/gesture.js'
import { pickTracker, palmCandidates } from '../src/games/arcade2d/handTracker.js'

/**
 * 한쪽 손(손목·검지·새끼)을 한 자리에 세운다. 세 점이 거의 같은 자리에
 * 있으므로 손바닥 평균도 그 자리다 — 좌표를 예측하기 쉬워진다.
 */
function hand(lms, side, { x, y, visibility = 1 }) {
  const [w, i, p] = side === 'left'
    ? [LM.L_WRIST, LM.L_INDEX, LM.L_PINKY]
    : [LM.R_WRIST, LM.R_INDEX, LM.R_PINKY]
  lms[w] = { x, y, visibility }
  lms[i] = { x, y, visibility }
  lms[p] = { x, y, visibility }
  return lms
}

const frame = (...hands) => {
  const lms = new Array(33).fill(null)
  for (const h of hands) hand(lms, h.side, h)
  return lms
}

describe('pickTracker — 트래커는 언제나 하나다 ★', () => {
  it('양손이 다 보여도 하나만 고른다', () => {
    const { side, point } = pickTracker(frame(
      { side: 'left', x: 0.2, y: 0.5 },
      { side: 'right', x: 0.8, y: 0.5 },
    ))
    expect(side === 'left' || side === 'right').toBe(true)
    expect(point).not.toBeNull()
  })

  it('둘 중 더 높이 든 손을 고른다(y가 작을수록 위)', () => {
    const { side } = pickTracker(frame(
      { side: 'left', x: 0.2, y: 0.7 },
      { side: 'right', x: 0.8, y: 0.3 },   // 이쪽이 더 위
    ))
    expect(side).toBe('right')
  })

  it('한쪽만 보이면 그쪽을 고른다', () => {
    const { side, point } = pickTracker(frame({ side: 'left', x: 0.3, y: 0.4 }))
    expect(side).toBe('left')
    expect(point.x).toBeCloseTo(0.3, 5)
  })

  it('아무 손도 안 보이면 null이다', () => {
    expect(pickTracker(new Array(33).fill(null))).toEqual({ side: null, point: null })
  })
})

describe('pickTracker — 쓰던 손을 쉽게 안 놓는다(트래커가 좌우로 안 튄다)', () => {
  it('두 손 높이가 비슷하면 쓰던 손을 그대로 쓴다', () => {
    const lms = frame(
      { side: 'left', x: 0.2, y: 0.50 },
      { side: 'right', x: 0.8, y: 0.47 },   // 3%만 더 위 — 여유(8%) 안이다
    )
    expect(pickTracker(lms, 'left').side).toBe('left')
  })

  it('반대 손이 확실히 더 높이 올라오면 갈아탄다', () => {
    const lms = frame(
      { side: 'left', x: 0.2, y: 0.50 },
      { side: 'right', x: 0.8, y: 0.30 },   // 20% 더 위 — 여유를 넘는다
    )
    expect(pickTracker(lms, 'left').side).toBe('right')
  })
})

describe('palmCandidates — 트래커는 손목이 아니라 손바닥에 붙는다 ★', () => {
  it('손목·검지·새끼의 평균 자리를 낸다', () => {
    const lms = new Array(33).fill(null)
    lms[LM.L_WRIST] = { x: 0.50, y: 0.60, visibility: 1 }
    lms[LM.L_INDEX] = { x: 0.56, y: 0.48, visibility: 1 }
    lms[LM.L_PINKY] = { x: 0.44, y: 0.48, visibility: 1 }
    const { left } = palmCandidates(lms)
    expect(left.x).toBeCloseTo(0.5, 5)
    expect(left.y).toBeCloseTo(0.52, 5)   // 손목(0.60)보다 위 = 손바닥 쪽
  })

  it('손끝 점이 안 보이면 손목만으로 떨어진다(아예 없애지 않는다)', () => {
    const lms = new Array(33).fill(null)
    lms[LM.L_WRIST] = { x: 0.4, y: 0.4, visibility: 1 }
    const { left } = palmCandidates(lms)
    expect(left.x).toBeCloseTo(0.4, 5)
    expect(left.y).toBeCloseTo(0.4, 5)
  })

  it('손목 신뢰도가 문턱 아래면 그 손은 없는 것으로 본다', () => {
    const lms = frame({ side: 'left', x: 0.4, y: 0.4, visibility: 0.2 })
    expect(palmCandidates(lms).left).toBeNull()
  })

  it('화면 밖으로 크게 벗어난 좌표는 버린다', () => {
    const lms = frame({ side: 'right', x: 1.4, y: 0.5 })
    expect(palmCandidates(lms).right).toBeNull()
  })
})
