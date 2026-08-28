// 칸 판정 — **경계에서 떨리면 안 된다.**
//
// 이 테스트가 지키는 것은 화면이 아니라 **운동 데이터**다. 칸이 깜빡이면
// `sideSteps`가 가만히 서 있는 아이에게서 올라간다. 브라우저로는 못 잡는다 —
// 골반 좌표를 1픽셀 단위로 흔들어 볼 수 없기 때문이다.
import { describe, it, expect } from 'vitest'
import { createZoneDetector } from '../src/core/pose/detectors/zoneDetector.js'

/** 골반 두 개만 있는 최소 프레임. x는 0~1(거울 좌표). */
const hips = (x, visibility = 1) => {
  const lm = []
  lm[23] = { x, y: 0.5, visibility }
  lm[24] = { x, y: 0.5, visibility }
  return lm
}

const track = (det, xs) => {
  const seen = []
  for (const x of xs) det.update(hips(x))
  return seen
}

describe('칸 판정 — 기본 동작', () => {
  it('3칸은 예전과 같은 자리에서 갈린다', () => {
    const out = []
    const d = createZoneDetector({ lanes: 3, onZoneChange: z => out.push(z) })
    d.update(hips(0.10)); expect(d.getCurrentZone()).toBe(0)
    d.update(hips(0.50)); expect(d.getCurrentZone()).toBe(1)
    d.update(hips(0.90)); expect(d.getCurrentZone()).toBe(2)
    expect(out).toEqual([0, 1, 2])
  })

  it('5칸은 다섯 자리를 다 읽는다', () => {
    const d = createZoneDetector({ lanes: 5 })
    for (const [x, z] of [[0.05, 0], [0.25, 1], [0.50, 2], [0.75, 3], [0.95, 4]]) {
      d.update(hips(x))
      expect(d.getCurrentZone(), `x=${x}`).toBe(z)
    }
  })

  it('가운데에서 시작한다 — 3칸은 1, 5칸은 2', () => {
    expect(createZoneDetector({ lanes: 3 }).getCurrentZone()).toBe(1)
    expect(createZoneDetector({ lanes: 5 }).getCurrentZone()).toBe(2)
  })
})

describe('경계 떨림 ★', () => {
  // 5칸에서 한 칸은 0.2다. 경계(0.4)에 서서 ±0.01로 흔들리는 상황 —
  // MediaPipe가 실제로 내놓는 정도의 잡음이다.
  it('경계에 서서 미세하게 흔들려도 칸이 안 바뀐다', () => {
    let changes = 0
    const d = createZoneDetector({ lanes: 5, onZoneChange: () => changes++ })
    d.update(hips(0.30))            // 1번 칸 한가운데
    changes = 0
    for (let i = 0; i < 200; i++) d.update(hips(0.40 + (i % 2 ? 0.01 : -0.01)))
    expect(changes).toBe(0)
  })

  it('3칸에서도 마찬가지다', () => {
    let changes = 0
    const d = createZoneDetector({ lanes: 3, onZoneChange: () => changes++ })
    d.update(hips(0.50))
    changes = 0
    for (let i = 0; i < 200; i++) d.update(hips(1 / 3 + (i % 2 ? 0.008 : -0.008)))
    expect(changes).toBe(0)
  })

  it('그래도 진짜로 옮기면 넘어간다 — 여유가 벽이 되면 안 된다', () => {
    const out = []
    const d = createZoneDetector({ lanes: 5, onZoneChange: z => out.push(z) })
    d.update(hips(0.50))            // 2번 칸
    d.update(hips(0.34))            // 1번 칸 안쪽까지 들어갔다
    expect(out).toEqual([1])
  })

  it('여유는 칸 너비의 비율이다 — 5칸에서도 한 칸만 걸으면 넘어간다', () => {
    // 절대값으로 뒀다면 5칸(폭 0.2)에서는 여유가 칸의 절반이 되어 못 넘어간다.
    const d = createZoneDetector({ lanes: 5 })
    d.update(hips(0.50))                       // 2번
    d.update(hips(0.30))                       // 1번 한가운데
    expect(d.getCurrentZone()).toBe(1)
    d.update(hips(0.10))                       // 0번 한가운데
    expect(d.getCurrentZone()).toBe(0)
  })
})

describe('흐린 프레임', () => {
  it('visibility가 낮으면 버린다', () => {
    const d = createZoneDetector({ lanes: 3 })
    d.update(hips(0.5))
    d.update(hips(0.05, 0.2))       // 화면 밖 — MediaPipe가 지어낸 좌표
    expect(d.getCurrentZone()).toBe(1)
  })
})
