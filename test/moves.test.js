// 기본 동작 감지기 — 점프 · 앉기 · 좌우 · 만세.
//
// **캘리브레이션이 없다**는 게 이 감지기의 핵심이라, 테스트도 그걸 확인한다 —
// 아무 준비 없이 첫 프레임부터 세는가.
//
// 웹캠 없이 검증한다. 랜드마크를 손으로 만들어 넣으면 감지기 입장에서는
// 진짜 프레임과 구분이 안 된다(`docs/07`의 두 갈래 검증 중 하나).
import { describe, it, expect } from 'vitest'
import { MoveDetector, MOVE } from '../src/core/pose/detectors/moves.js'
import { MOVES } from '../src/core/pose/tuning.js'

// 서 있는 몸 한 벌. y는 화면 좌표(아래가 크다).
//   코 0.10  어깨 0.25  손목 0.55  골반 0.55  발목 0.90  → bodyHeight 0.80
function body({ hipY = 0.55, hipX = 0.5, wristY = 0.55, ankleY = 0.90 } = {}) {
  const lms = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }))
  const put = (i, x, y) => { lms[i] = { x, y, visibility: 1 } }
  put(0, hipX, 0.10)                                  // NOSE
  put(11, hipX - 0.08, 0.25); put(12, hipX + 0.08, 0.25)   // SHOULDER
  put(15, hipX - 0.10, wristY); put(16, hipX + 0.10, wristY) // WRIST
  put(23, hipX - 0.05, hipY);  put(24, hipX + 0.05, hipY)    // HIP
  put(25, hipX - 0.05, 0.72);  put(26, hipX + 0.05, 0.72)    // KNEE
  put(27, hipX - 0.05, ankleY); put(28, hipX + 0.05, ankleY) // ANKLE
  return lms
}

/** 서 있는 프레임을 여러 장 흘려 롤링 기준선을 채운다. */
function stand(det, seconds = 1.0, t0 = 0, opts = {}) {
  let t = t0
  for (; t < t0 + seconds; t += 1 / 30) det.update(body(opts), t)
  return t
}

describe('캘리브레이션 없이 첫 프레임부터 센다 ★', () => {
  it('준비 동작 없이 점프가 잡힌다', () => {
    const det = new MoveDetector()
    // 서 있는 프레임 두 장만 주고 바로 뛴다 — 3초 대기 같은 건 없다
    det.update(body(), 0)
    det.update(body(), 1 / 30)
    const fired = det.update(body({ hipY: 0.55 - 0.09 * 0.8 }), 2 / 30)
    expect(fired).toContain(MOVE.JUMP)
  })

  it('아이가 카메라 앞에서 자리를 옮겨도 따라간다', () => {
    const det = new MoveDetector()
    // 화면 왼쪽에서 한참 서 있다가
    let t = stand(det, 3, 0, { hipX: 0.3 })
    // 그 자리에서 오른쪽으로 한 걸음 → 다시 제자리
    det.update(body({ hipX: 0.3 + 0.15 * 0.8 }), t += 1 / 30)
    const fired = det.update(body({ hipX: 0.3 }), t += 1 / 30)
    expect(fired).toContain(MOVE.RIGHT)
  })
})

describe('점프', () => {
  it('충분히 올라가고 속도가 붙어야 센다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    det.update(body({ hipY: 0.55 - 0.10 * 0.8 }), t += 1 / 30)
    expect(det.counts.jumps).toBe(1)
  })

  it('까치발은 안 센다 — 조금 올라가는 건 점프가 아니다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    // 문턱(0.07)보다 낮게, 천천히
    for (let i = 0; i < 10; i++) det.update(body({ hipY: 0.55 - 0.03 * 0.8 }), t += 1 / 30)
    expect(det.counts.jumps).toBe(0)
  })

  it('한 번 뛴 걸 두 번 세지 않는다 (쿨다운)', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    det.update(body({ hipY: 0.55 - 0.10 * 0.8 }), t += 1 / 30)
    det.update(body({ hipY: 0.55 - 0.14 * 0.8 }), t += 1 / 30)
    expect(det.counts.jumps).toBe(1)
  })
})

describe('앉기 — 앉았다 **일어나야** 1회', () => {
  it('앉기만 하면 안 센다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    for (let i = 0; i < 10; i++) det.update(body({ hipY: 0.55 + 0.20 * 0.8 }), t += 1 / 30)
    expect(det.counts.squats).toBe(0)
  })

  it('일어나면 센다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    for (let i = 0; i < 6; i++) det.update(body({ hipY: 0.55 + 0.20 * 0.8 }), t += 1 / 30)
    const fired = det.update(body({ hipY: 0.55 }), t += 1 / 30)
    expect(fired).toContain(MOVE.SQUAT)
    expect(det.counts.squats).toBe(1)
  })
})

describe('좌우 — 갔다가 **돌아와야** 1회', () => {
  it('간 것만으로는 안 센다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    for (let i = 0; i < 6; i++) det.update(body({ hipX: 0.5 - 0.15 * 0.8 }), t += 1 / 30)
    expect(det.counts.side_steps).toBe(0)
  })

  it('왼쪽으로 갔다 돌아오면 LEFT', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    det.update(body({ hipX: 0.5 - 0.15 * 0.8 }), t += 1 / 30)
    const fired = det.update(body({ hipX: 0.5 }), t += 1 / 30)
    expect(fired).toContain(MOVE.LEFT)
  })

  it('살짝 흔들리는 건 안 센다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    for (let i = 0; i < 20; i++) {
      det.update(body({ hipX: 0.5 + (i % 2 ? 0.04 : -0.04) * 0.8 }), t += 1 / 30)
    }
    expect(det.counts.side_steps).toBe(0)
  })
})

describe('만세 — 올렸다 **내려야** 1회', () => {
  it('두 손을 어깨 위로 올리면 센다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    const fired = det.update(body({ wristY: 0.10 }), t += 1 / 30)
    expect(fired).toContain(MOVE.ARMS_UP)
  })

  it('든 채로 있으면 한 번만 센다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    for (let i = 0; i < 20; i++) det.update(body({ wristY: 0.10 }), t += 1 / 30)
    expect(det.counts.arm_raises).toBe(1)
  })

  it('내렸다 다시 올리면 두 번', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    det.update(body({ wristY: 0.10 }), t += 1 / 30)
    for (let i = 0; i < 4; i++) det.update(body({ wristY: 0.55 }), t += 1 / 30)
    det.update(body({ wristY: 0.10 }), t += 1 / 30)
    expect(det.counts.arm_raises).toBe(2)
  })
})

describe('안 보이는 프레임', () => {
  // MediaPipe는 화면 밖 관절의 좌표를 지어낸다 — 앉아 있는 사람에게서 걸음이 세어졌다
  it('visibility가 낮으면 아무것도 안 한다', () => {
    const det = new MoveDetector()
    let t = stand(det, 1)
    const lms = body({ hipY: 0.55 - 0.15 * 0.8 })
    lms[27] = { ...lms[27], visibility: 0.2 }
    const fired = det.update(lms, t += 1 / 30)
    expect(fired).toEqual([])
  })

  it('전신이 안 잡히면(몸이 너무 작으면) 세지 않는다', () => {
    const det = new MoveDetector()
    // 코와 발목이 거의 붙어 있다 = 전신이 안 보인다
    let t = 0
    for (let i = 0; i < 30; i++) det.update(body({ ankleY: 0.20 }), t += 1 / 30)
    expect(det.counts.jumps).toBe(0)
  })
})

describe('해부학적 폴백 — 시작하자마자 점프 중이어도', () => {
  it('공중에서 시작해도 그 높이를 기준으로 삼지 않는다', () => {
    const det = new MoveDetector()
    let t = 0
    // 첫 프레임부터 이미 떠 있다(골반이 발목에서 키의 60% 위)
    for (let i = 0; i < 5; i++) det.update(body({ hipY: 0.90 - 0.60 * 0.8 }), t += 1 / 30)
    // 내려와 섰다 → 다시 뛰면 잡혀야 한다
    for (let i = 0; i < 10; i++) det.update(body(), t += 1 / 30)
    det.update(body({ hipY: 0.55 - 0.10 * 0.8 }), t += 1 / 30)
    expect(det.counts.jumps).toBeGreaterThanOrEqual(1)
  })
})

describe('운동 지표로 낸다', () => {
  it('snapshot 키가 운동 사전의 이름이다', () => {
    const det = new MoveDetector()
    expect(Object.keys(det.snapshot()).sort())
      .toEqual(['arm_raises', 'jumps', 'side_steps', 'squats'])
  })
})

describe('문턱값은 한 벌이다', () => {
  it('러너와 같은 값을 쓴다 — 두 벌이면 반드시 어긋난다', () => {
    // core/pose/tuning.js가 정본이고 러너의 config가 이걸 가져다 쓴다
    expect(MOVES.laneThreshold).toBe(0.12)
    expect(MOVES.jumpRise).toBe(0.07)
    expect(MOVES.squatDrop).toBe(0.14)
  })
})
