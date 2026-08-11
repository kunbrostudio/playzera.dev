// 감지기 — **카메라 없이 세는 로직을 검증한다.**
//
// "웹캠이 인식하고 카운팅할 수 있어야 한다"가 이 기능의 존재 조건이다.
// 그런데 카메라로만 확인하면 매번 사람이 서서 다리를 들어야 하고,
// 무엇이 왜 틀렸는지도 모른다. 가짜 랜드마크를 만들어 **프레임 단위로** 먹인다.
//
// 좌표계 약속 (프로젝트 공통)
//   · 화면 좌표 — y가 클수록 아래
//   · 엔진이 이미 거울로 뒤집어 보낸다. 여기서 또 뒤집지 않는다
//   · 문턱은 전부 bodyHeight 비율이라 아이 키·카메라 거리와 무관하다

import { describe, it, expect } from 'vitest'
import { LM } from '../src/core/pose/gesture.js'
import { HighKneesDetector } from '../src/core/pose/detectors/highKnees.js'
import { BalanceDetector } from '../src/core/pose/detectors/balance.js'

// 서 있는 사람 한 명. 코 0.1 ~ 발목 0.9 → bodyHeight 0.8
// 무릎은 그 중간쯤(0.65), 골반은 0.5.
function frame({ lKnee = 0.65, rKnee = 0.65, lAnkle = 0.9, rAnkle = 0.9 } = {}) {
  const lms = []
  for (let i = 0; i <= 32; i++) lms[i] = { x: 0.5, y: 0.5, visibility: 1 }
  lms[LM.NOSE] = { x: 0.5, y: 0.1 }
  lms[LM.L_SHOULDER] = { x: 0.42, y: 0.3 }
  lms[LM.R_SHOULDER] = { x: 0.58, y: 0.3 }
  lms[LM.L_HIP] = { x: 0.45, y: 0.5 }
  lms[LM.R_HIP] = { x: 0.55, y: 0.5 }
  lms[LM.L_KNEE] = { x: 0.45, y: lKnee }
  lms[LM.R_KNEE] = { x: 0.55, y: rKnee }
  lms[LM.L_ANKLE] = { x: 0.45, y: lAnkle }
  lms[LM.R_ANKLE] = { x: 0.55, y: rAnkle }
  return lms
}

// 30fps로 sec초 동안 프레임을 먹인다
function feed(det, sec, make, t0 = 0, fps = 30) {
  const step = 1 / fps
  let t = t0
  for (let i = 0; i < Math.round(sec * fps); i++) {
    det.update(make(t), t)
    t += step
  }
  return t
}

// ── 제자리 달리기 ────────────────────────────────────────────
describe('제자리 달리기 — 무릎 들기', () => {
  // 서 있는 무릎 0.65, bodyHeight 0.8 → 문턱 10%는 0.08만큼 올라오는 것
  const UP = 0.65 - 0.12     // 넉넉히 든 위치
  const DOWN = 0.65

  const running = (spm = 120) => {
    const period = 60 / spm * 2      // 한 걸음 = 반주기(왼·오 교대)
    return t => {
      const phase = (t % period) / period
      return phase < 0.5
        ? frame({ lKnee: UP, rKnee: DOWN })
        : frame({ lKnee: DOWN, rKnee: UP })
    }
  }

  it('가만히 서 있으면 한 걸음도 안 센다', () => {
    const d = new HighKneesDetector()
    feed(d, 5, () => frame())
    expect(d.count).toBe(0)
    expect(d.running).toBe(false)
  })

  // 대충 흔드는 것과 무릎을 드는 것을 구분해야 한다.
  // 그러지 않으면 "운동 데이터"가 아니라 "움직임 데이터"가 된다.
  it('무릎을 조금만 흔드는 건 안 센다', () => {
    const d = new HighKneesDetector()
    feed(d, 5, t => {
      const wiggle = Math.sin(t * 8) * 0.03      // 키의 4% 미만
      return frame({ lKnee: 0.65 - Math.max(0, wiggle), rKnee: 0.65 })
    })
    expect(d.count).toBe(0)
  })

  it('교대로 들면 걸음이 쌓인다', () => {
    const d = new HighKneesDetector()
    feed(d, 6, running(120))
    // 분당 120걸음 × 6초 = 12걸음 언저리
    expect(d.count).toBeGreaterThanOrEqual(10)
    expect(d.count).toBeLessThanOrEqual(14)
  })

  it('한 번 들고 있는 동안 계속 세지 않는다', () => {
    const d = new HighKneesDetector()
    feed(d, 3, () => frame({ lKnee: UP }))
    expect(d.count).toBe(1)
  })

  // 들고 있는 동안 기준선을 갱신하면 든 위치가 기준이 되어
  // **그 다음부터는 한 번도 안 세어진다.** 실제로 조심해야 하는 자리다.
  it('오래 들고 있다 내려도 다음 걸음이 세어진다', () => {
    const d = new HighKneesDetector()
    let t = feed(d, 4, () => frame({ lKnee: UP }))          // 4초 들고
    t = feed(d, 1, () => frame(), t)                         // 내려놓고
    feed(d, 1, () => frame({ lKnee: UP }), t)                // 다시 들기
    expect(d.count).toBe(2)
  })

  it('달리는 동안만 활동 시간을 센다', () => {
    const d = new HighKneesDetector()
    let t = feed(d, 5, () => frame())              // 5초 가만히
    expect(Math.round(d.activeSec)).toBe(0)
    feed(d, 10, running(120), t)                   // 10초 달리기
    expect(d.activeSec).toBeGreaterThan(6)
    expect(d.activeSec).toBeLessThanOrEqual(10)
  })

  it('빨리 달리면 케이던스가 올라간다', () => {
    const slow = new HighKneesDetector()
    const fast = new HighKneesDetector()
    feed(slow, 8, running(60))
    feed(fast, 8, running(160))
    expect(fast.cadence).toBeGreaterThan(slow.cadence)
    expect(fast.running).toBe(true)
  })

  it('전신이 안 보이면 아무것도 세지 않는다', () => {
    const d = new HighKneesDetector()
    // 코와 발목이 거의 붙어 있다 = 상반신만 잡힌 상태
    feed(d, 3, () => {
      const f = frame({ lKnee: 0.2 })
      f[LM.L_ANKLE] = { x: 0.45, y: 0.2 }
      f[LM.R_ANKLE] = { x: 0.55, y: 0.2 }
      return f
    })
    expect(d.count).toBe(0)
  })

  it('기록으로 넘기는 값은 지표 이름 그대로다', () => {
    const d = new HighKneesDetector()
    feed(d, 6, running(120))
    const s = d.snapshot()
    expect(s).toHaveProperty('high_knees')
    expect(s).toHaveProperty('active_sec')
  })
})

// ── 한 발 서기 ───────────────────────────────────────────────
describe('한 발 서기 — 버틴 시간', () => {
  // bodyHeight 0.8 → 문턱 6%는 발목 높이차 0.048
  const lifted = () => frame({ lAnkle: 0.9 - 0.12 })
  const both = () => frame()

  it('두 발로 서 있으면 0초', () => {
    const d = new BalanceDetector()
    feed(d, 5, both)
    expect(d.totalSec).toBe(0)
    expect(d.holding).toBe(false)
  })

  it('한 발을 들면 초가 쌓인다', () => {
    const d = new BalanceDetector()
    feed(d, 5, lifted)
    expect(d.totalSec).toBeGreaterThan(4.5)
    expect(d.side).toBe('left')
  })

  // 아이는 버티다가 발이 잠깐 닿는다. 그때마다 0으로 되돌리면
  // **되는 게 없는 놀이**가 된다.
  it('잠깐 흔들려 발이 닿아도 이어서 센다', () => {
    const d = new BalanceDetector()
    let t = feed(d, 3, lifted)
    t = feed(d, 0.2, both, t)        // 유예(0.4초) 안
    feed(d, 3, lifted, t)
    expect(d.bestSec).toBeGreaterThan(5.5)   // 끊기지 않았다
  })

  // 그렇다고 안 버틴 시간을 버틴 것으로 세면 그건 거짓말이다
  it('발이 닿아 있던 시간은 초에 안 들어간다', () => {
    const d = new BalanceDetector()
    let t = feed(d, 2, lifted)
    t = feed(d, 0.3, both, t)
    feed(d, 2, lifted, t)
    expect(d.totalSec).toBeLessThan(4.2)
  })

  it('오래 내려놓으면 기록이 끊긴다', () => {
    const d = new BalanceDetector()
    const ended = []
    const det = new BalanceDetector()
    det.onHoldEnd = sec => ended.push(sec)
    let t = feed(det, 3, lifted)
    t = feed(det, 1.5, both, t)      // 유예를 넘겼다
    feed(det, 1, lifted, t)
    expect(ended.length).toBe(1)
    expect(ended[0]).toBeGreaterThan(2.5)
    expect(det.holdSec).toBeLessThan(1.2)   // 다시 0부터
    expect(d.totalSec).toBe(0)
  })

  it('발을 바꿔 들면 새로 시작한다', () => {
    const d = new BalanceDetector()
    let t = feed(d, 3, () => frame({ lAnkle: 0.78 }))
    feed(d, 1, () => frame({ rAnkle: 0.78 }), t)
    expect(d.side).toBe('right')
    expect(d.holdSec).toBeLessThan(1.2)
    expect(d.bestSec).toBeGreaterThan(2.5)   // 왼발 기록은 남는다
  })

  it('어느 발로 얼마나 버텼는지 따로 남는다 — 한쪽만 하지 않게', () => {
    const d = new BalanceDetector()
    let t = feed(d, 4, () => frame({ lAnkle: 0.78 }))
    t = feed(d, 1, both, t)
    feed(d, 2, () => frame({ rAnkle: 0.78 }), t)
    expect(d.bestBySide.left).toBeGreaterThan(3.5)
    expect(d.bestBySide.right).toBeGreaterThan(1.5)
  })

  it('총합은 이어진 최고 기록보다 짧지 않다', () => {
    const d = new BalanceDetector()
    let t = feed(d, 2, lifted)
    t = feed(d, 1, both, t)
    feed(d, 3, lifted, t)
    expect(d.totalSec).toBeGreaterThanOrEqual(d.bestSec)
  })

  it('기록으로 넘기는 값은 지표 이름 그대로다', () => {
    const d = new BalanceDetector()
    feed(d, 5, lifted)
    expect(d.snapshot()).toHaveProperty('balance_sec')
  })
})

// MediaPipe는 화면 밖 관절의 좌표를 **지어낸다.** 좌표만 보면 그럴듯해서
// 앉아 있는 사람에게서도 걸음이 세어졌다(/lab에서 실제로 1걸음이 찍혔다).
describe('안 보이는 관절은 세지 않는다', () => {
  const hidden = (idx, y) => {
    const f = frame({ lKnee: y })
    f[idx] = { ...f[idx], visibility: 0.1 }
    return f
  }

  it('무릎이 안 잡히면 걸음을 안 센다', () => {
    const d = new HighKneesDetector()
    feed(d, 2, () => frame())
    feed(d, 2, () => hidden(LM.L_KNEE, 0.53), 2)
    expect(d.count).toBe(0)
  })

  it('발목이 안 잡히면 균형 초가 안 쌓인다', () => {
    const d = new BalanceDetector()
    feed(d, 3, () => {
      const f = frame({ lAnkle: 0.78 })
      f[LM.L_ANKLE] = { ...f[LM.L_ANKLE], visibility: 0.2 }
      return f
    })
    expect(d.totalSec).toBe(0)
  })
})
