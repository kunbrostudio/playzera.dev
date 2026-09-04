// 로우(노 젓기) 감지기 — 오디세이 런(프로토타입)이 쓸 새 동작. ★
//
// 다른 감지기 테스트(`test/moves.test.js`)와 같은 방식이다 — 웹캠 없이
// 랜드마크를 손으로 만들어 넣는다. 감지기 입장에서는 진짜 프레임과 구분이 안 된다.
import { describe, it, expect } from 'vitest'
import { RowDetector, ROW } from '../src/core/pose/detectors/row.js'

// 어깨너비 0.16(0.42~0.58). 손목은 어깨보다 살짝 아래(0.30) — "만세"로 안 읽히는 높이.
function body({ wristSpread = 0.05, wristY = 0.30, shoulderW = 0.16, vis = 1 } = {}) {
  const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
  const put = (i, x, y) => { lms[i] = { x, y, visibility: vis } }
  put(11, 0.5 - shoulderW / 2, 0.25); put(12, 0.5 + shoulderW / 2, 0.25) // SHOULDER
  put(15, 0.5 - wristSpread, wristY); put(16, 0.5 + wristSpread, wristY) // WRIST
  return lms
}

describe('로우(노 젓기) — 캘리브레이션 없이 첫 프레임부터 센다 ★', () => {
  it('준비 동작 없이 벌렸다 모으면 1회다', () => {
    const det = new RowDetector()
    det.update(body({ wristSpread: 0.05 }))     // 뻗기(모음)
    det.update(body({ wristSpread: 0.22 }))     // 당기기(벌림)
    const fired = det.update(body({ wristSpread: 0.05 }))   // 다시 뻗기 — 여기서 센다
    expect(fired).toContain(ROW)
    expect(det.count).toBe(1)
  })
})

describe('로우 — 돌아와야 1회다', () => {
  it('벌린 채로 멈추면 카운트가 안 오른다', () => {
    const det = new RowDetector()
    det.update(body({ wristSpread: 0.05 }))
    det.update(body({ wristSpread: 0.22 }))
    expect(det.count).toBe(0)
  })

  it('두 번 저으면 2회다', () => {
    const det = new RowDetector()
    for (let i = 0; i < 2; i++) {
      det.update(body({ wristSpread: 0.05 }))
      det.update(body({ wristSpread: 0.22 }))
      det.update(body({ wristSpread: 0.05 }))
    }
    expect(det.count).toBe(2)
  })
})

describe('로우 — 만세와 헷갈리지 않는다', () => {
  it('손목이 어깨보다 위로 올라간 채 벌렸다 모아도 안 센다', () => {
    const det = new RowDetector()
    // wristY 0.10은 어깨(0.25)보다 위 — 팔을 든 상태
    det.update(body({ wristSpread: 0.05, wristY: 0.10 }))
    det.update(body({ wristSpread: 0.22, wristY: 0.10 }))
    const fired = det.update(body({ wristSpread: 0.05, wristY: 0.10 }))
    expect(fired).not.toContain(ROW)
    expect(det.count).toBe(0)
  })
})

describe('로우 — 몸이 너무 작거나(멀리) 옆모습이면 판정하지 않는다', () => {
  it('어깨너비가 문턱보다 작으면 무시한다', () => {
    const det = new RowDetector()
    det.update(body({ wristSpread: 0.01, shoulderW: 0.02 }))
    const fired = det.update(body({ wristSpread: 0.04, shoulderW: 0.02 }))
    expect(fired).toEqual([])
  })
})

describe('로우 — 화면 밖 랜드마크는 지어낸 좌표다', () => {
  it('visibility가 낮은 프레임은 버린다', () => {
    const det = new RowDetector()
    det.update(body({ wristSpread: 0.05, vis: 0.2 }))
    const fired = det.update(body({ wristSpread: 0.22, vis: 0.2 }))
    expect(fired).toEqual([])
  })

  it('랜드마크가 없으면(카메라가 아직 안 잡힘) 조용히 넘어간다', () => {
    const det = new RowDetector()
    expect(() => det.update(null)).not.toThrow()
    expect(det.update(null)).toEqual([])
  })
})

describe('로우 — snapshot', () => {
  it('progress/exercises.js가 쓸 모양으로 낸다', () => {
    const det = new RowDetector()
    det.update(body({ wristSpread: 0.05 }))
    det.update(body({ wristSpread: 0.22 }))
    det.update(body({ wristSpread: 0.05 }))
    expect(det.snapshot()).toEqual({ rows: 1 })
  })
})
