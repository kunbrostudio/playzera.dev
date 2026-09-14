// 풍선 팡팡 — Family Co-op V1(DUO, 둘이 하기) ★ (STEP 105)
//
// 실제 두 사람을 카메라에 세울 수 없으니, 카메라 뒤의 판단은 전부 순수
// 모듈로 떼어 합성 프레임으로 검증한다:
//   - 자리 유지(`core/pose/playerSlots.js`) — 배열 순서가 바뀌어도 P1/P2가
//     안 뒤바뀌는지, 잠깐 사라짐·재합류·자리 수 상한
//   - 플레이어당 손 하나(`arcade2d/handTracker.js`의 createHandPicker·createDuoHands)
//   - 동시 입력·중복 방지(`balloon-festival/game.js`)
//   - 메뉴 조작자 잠금 해제(`core/pose/poseEngine.js`의 resetLock)
//   - SOLO 보호·GROUP 비활성(소스·설정 검사)
// 화면(DOM·카메라)에 얽힌 흐름은 이 저장소의 다른 무거운 화면들처럼 소스
// 문자열로 배선을 확인한다. 실제 2인 카메라 QA는 사람이 해야 한다.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { LM } from '../src/core/pose/gesture.js'
import {
  createPlayerSlots, createStableTimer, SLOT_LOSE_GRACE_MS,
} from '../src/core/pose/playerSlots.js'
import {
  createHandPicker, createDuoHands, HAND_LOSS_GRACE_MS, HAND_SWITCH_DWELL_MS,
} from '../src/games/arcade2d/handTracker.js'
import { makeHandSmoother } from '../src/games/arcade2d/handSmoother.js'
import { BalloonFestivalRun, PART } from '../src/games/balloon-festival/game.js'
import { PLAY_MODES, getPlayableMode } from '../src/games/balloon-festival/modes.js'
import { poseEngineCore, mirrorPose } from '../src/core/pose/poseEngine.js'

const playScreenSrc = readFileSync('src/games/balloon-festival/ui/playScreen.js', 'utf8')
const titleScreenSrc = readFileSync('src/games/balloon-festival/ui/titleScreen.js', 'utf8')
const poseEngineSrc = readFileSync('src/core/pose/poseEngine.js', 'utf8')

/**
 * 한 사람(거울 좌표). 골반 중심 x = cx. 손은 `{x,y}`면 보이고, null이면
 * 신뢰도 0(안 보임)으로 둔다 — handTracker의 `seenAt`이 걸러낸다.
 */
function person(cx, { left = null, right = null } = {}) {
  const lm = new Array(33).fill(null)
  const v = 1
  lm[LM.NOSE] = { x: cx, y: 0.15, visibility: v }
  lm[LM.L_SHOULDER] = { x: cx - 0.06, y: 0.3, visibility: v }
  lm[LM.R_SHOULDER] = { x: cx + 0.06, y: 0.3, visibility: v }
  lm[LM.L_HIP] = { x: cx - 0.03, y: 0.55, visibility: v }
  lm[LM.R_HIP] = { x: cx + 0.03, y: 0.55, visibility: v }
  const put = (idx, p) => { for (const i of idx) lm[i] = p ? { x: p.x, y: p.y, visibility: 1 } : { x: cx, y: 0.6, visibility: 0 } }
  put([LM.L_WRIST, LM.L_INDEX, LM.L_PINKY], left)
  put([LM.R_WRIST, LM.R_INDEX, LM.R_PINKY], right)
  return lm
}

const centerX = slot => slot.center?.x

// ─────────────────────────────────────────────────────────────────
describe('playerSlots — DUO 자리는 최대 2개, 배열 순서가 바뀌어도 P1/P2가 안 뒤바뀐다 ★', () => {
  it('두 사람이 들어오면 두 자리에 앉는다', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.3), person(0.7)], 0)
    expect(s.slots.map(x => x.state)).toEqual(['active', 'active'])
    expect(centerX(s.slots[0])).toBeCloseTo(0.3)
    expect(centerX(s.slots[1])).toBeCloseTo(0.7)
  })

  it('★ MediaPipe 배열 순서가 [아이,부모] → [부모,아이]로 바뀌어도 자리는 위치로 이어진다', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.3), person(0.7)], 0)
    s.update([person(0.71), person(0.31)], 33)    // 순서 뒤집힘 + 살짝 이동
    expect(centerX(s.slots[0])).toBeCloseTo(0.31)
    expect(centerX(s.slots[1])).toBeCloseTo(0.71)
    s.update([person(0.72), person(0.32)], 66)
    expect(centerX(s.slots[0])).toBeCloseTo(0.32)
  })

  it('두 사람이 조금씩 서로에게 다가가도(나란히 붙어 설 때까지) 자리가 유지된다', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    let a = 0.3, b = 0.7, t = 0
    s.update([person(a), person(b)], t)
    // 13걸음 뒤 몸 중심 간격 ≈ 0.088 — 중복 합치기 문턱(0.05)보다는 멀다
    for (let i = 0; i < 13; i++) {
      a += 0.012; b -= 0.012; t += 33
      s.update(i % 2 ? [person(a), person(b)] : [person(b), person(a)], t)
    }
    expect(centerX(s.slots[0])).toBeCloseTo(a)
    expect(centerX(s.slots[1])).toBeCloseTo(b)
  })

  it('세 번째 후보가 와도 자리는 2개뿐이다', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.2), person(0.5), person(0.8)], 0)
    expect(s.slots.length).toBe(2)
    expect(s.statusAt(0).activeCount).toBe(2)
  })

  it('한 사람이 겹쳐 두 번 잡힌 것 같은 후보(너무 가까움)는 한 자리만 차지한다', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.5), person(0.52)], 0)
    expect(s.statusAt(0).activeCount).toBe(1)
    expect(s.slots[1].state).toBe('empty')
  })

  it('★ 잠깐 가려짐(유예 안) — 자리를 안 비우고, 그 자리를 다른 사람이 못 뺏는다', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.3), person(0.7)], 0)
    // P2(0.7)가 가려짐 + 먼 곳에 낯선 사람(0.05)
    s.update([person(0.3), person(0.05)], 500)
    expect(s.slots[1].state).toBe('active')
    expect(centerX(s.slots[1])).toBeCloseTo(0.7)       // 낯선 사람이 안 앉았다
    const st = s.statusAt(500)
    expect(st.activeCount).toBe(2)                    // 판 입장에서는 아직 둘
    expect(st.presentCount).toBe(1)                   // 지금 보이는 건 하나
  })

  it('★ 유예를 넘기면 그 자리만 lost — 남은 사람은 그대로 active', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.3), person(0.7)], 0)
    for (let t = 100; t <= SLOT_LOSE_GRACE_MS + 200; t += 100) s.update([person(0.3)], t)
    expect(s.slots[0].state).toBe('active')
    expect(s.slots[1].state).toBe('lost')
    expect(s.statusAt(SLOT_LOSE_GRACE_MS + 200).activeCount).toBe(1)
  })

  it('★ 재합류 — 빈(lost) 자리에 새 사람이 들어오면 그 자리에 다시 앉는다', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.3), person(0.7)], 0)
    const later = SLOT_LOSE_GRACE_MS + 200
    s.update([person(0.3)], later)
    expect(s.slots[1].state).toBe('lost')
    s.update([person(0.3), person(0.9)], later + 100)   // 다른 자리에서 돌아옴
    expect(s.slots[1].state).toBe('active')
    expect(centerX(s.slots[1])).toBeCloseTo(0.9)
    expect(centerX(s.slots[0])).toBeCloseTo(0.3)        // P1은 그대로
  })

  it('둘 다 유예를 넘기면 activeCount 0 — 판을 멈출 신호', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.3), person(0.7)], 0)
    s.update([], SLOT_LOSE_GRACE_MS + 50)
    expect(s.statusAt(SLOT_LOSE_GRACE_MS + 50).activeCount).toBe(0)
  })

  it('statusAt은 추론 프레임이 멈춰도 시간만으로 유예 초과를 다시 계산한다', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.3), person(0.7)], 0)
    expect(s.statusAt(100).activeCount).toBe(2)
    expect(s.statusAt(SLOT_LOSE_GRACE_MS + 1).activeCount).toBe(0)
  })

  it('reset — 세션 경계에서 자리를 전부 비운다(메뉴 조작자와 무관하게 다시 채움)', () => {
    const s = createPlayerSlots({ maxSlots: 2 })
    s.update([person(0.3), person(0.7)], 0)
    s.reset()
    expect(s.slots.every(x => x.state === 'empty' && x.center == null)).toBe(true)
  })
})

describe('createStableTimer — 확보 안정화', () => {
  it('계속 참이어야 통과, 한 번 끊기면 처음부터', () => {
    const t = createStableTimer(1200)
    expect(t.update(true, 0)).toBe(false)
    expect(t.update(true, 800)).toBe(false)
    expect(t.update(false, 900)).toBe(false)
    expect(t.update(true, 1000)).toBe(false)
    expect(t.update(true, 2199)).toBe(false)
    expect(t.update(true, 2200)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
describe('createHandPicker — 플레이어당 손 하나, 쉽게 안 바뀐다 ★', () => {
  it('양손을 들어도 하나만 고른다(더 높이 든 손)', () => {
    const p = createHandPicker()
    const r = p.update(person(0.5, { left: { x: 0.4, y: 0.2 }, right: { x: 0.6, y: 0.4 } }), 0)
    expect(r.side).toBe('left')
    expect(r.point.x).toBeCloseTo(0.4)   // 손바닥 = 손목·검지·새끼 평균이라 부동소수 오차가 난다
    expect(r.point.y).toBeCloseTo(0.2)
  })

  it('두 손 높이가 비슷하면 쓰던 손을 유지한다', () => {
    const p = createHandPicker()
    p.update(person(0.5, { left: { x: 0.4, y: 0.30 }, right: { x: 0.6, y: 0.32 } }), 0)
    const r = p.update(person(0.5, { left: { x: 0.4, y: 0.32 }, right: { x: 0.6, y: 0.29 } }), 33)
    expect(r.side).toBe('left')
  })

  it('반대 손이 확실히 더 높아도 곧장 안 바꾸고, 잠깐 이어져야 바꾼다', () => {
    const p = createHandPicker()
    p.update(person(0.5, { left: { x: 0.4, y: 0.3 }, right: null }), 0)
    const frame = person(0.5, { left: { x: 0.4, y: 0.5 }, right: { x: 0.6, y: 0.1 } })
    expect(p.update(frame, 33).side).toBe('left')
    expect(p.update(frame, 33 + HAND_SWITCH_DWELL_MS - 1).side).toBe('left')
    expect(p.update(frame, 33 + HAND_SWITCH_DWELL_MS).side).toBe('right')
  })

  it('★ 쓰던 손이 잠깐 가려지면(유예 안) 반대 손으로 안 넘어가고 포인터만 비운다', () => {
    const p = createHandPicker()
    p.update(person(0.5, { left: { x: 0.4, y: 0.3 }, right: { x: 0.6, y: 0.5 } }), 0)
    const hidden = person(0.5, { left: null, right: { x: 0.6, y: 0.5 } })
    const r = p.update(hidden, 100)
    expect(r.side).toBe('left')
    expect(r.point).toBeNull()
    expect(p.update(hidden, 100 + HAND_LOSS_GRACE_MS - 1).side).toBe('left')
  })

  it('유예를 넘겨도 안 돌아오면 반대 손으로 넘어간다', () => {
    const p = createHandPicker()
    p.update(person(0.5, { left: { x: 0.4, y: 0.3 }, right: { x: 0.6, y: 0.5 } }), 0)
    const hidden = person(0.5, { left: null, right: { x: 0.6, y: 0.5 } })
    p.update(hidden, 100)
    const r = p.update(hidden, 100 + HAND_LOSS_GRACE_MS)
    expect(r.side).toBe('right')
    expect(r.point.x).toBeCloseTo(0.6)
    expect(r.point.y).toBeCloseTo(0.5)
  })
})

describe('createDuoHands — DUO 포인터는 최대 2개(한 사람 = 손 하나) ★', () => {
  const pointers = hands => Object.entries(hands).filter(([k, v]) => k !== 'seq' && v)

  it('★ 두 사람이 양손을 다 들어도 포인터는 2개다(4개가 아니다)', () => {
    const d = createDuoHands({ maxPlayers: 2 })
    d.update([
      person(0.3, { left: { x: 0.2, y: 0.2 }, right: { x: 0.35, y: 0.25 } }),
      person(0.7, { left: { x: 0.65, y: 0.25 }, right: { x: 0.8, y: 0.2 } }),
    ], 0)
    expect(d.keys).toEqual(['p1', 'p2'])
    expect(pointers(d.hands).length).toBe(2)
    expect(Object.keys(d.hands).sort()).toEqual(['p1', 'p2', 'seq'])
  })

  it('포인터는 자기 자리 사람의 손이다 — 배열 순서가 바뀌어도 p1은 계속 왼쪽 사람', () => {
    const d = createDuoHands({ maxPlayers: 2 })
    const kid = person(0.3, { left: { x: 0.25, y: 0.2 } })
    const parent = person(0.7, { right: { x: 0.8, y: 0.2 } })
    d.update([kid, parent], 0)
    expect(d.hands.p1.x).toBeCloseTo(0.25)
    d.update([parent, kid], 33)
    expect(d.hands.p1.x).toBeCloseTo(0.25)
    expect(d.hands.p2.x).toBeCloseTo(0.8)
    expect(d.sideOf('p1')).toBe('left')
    expect(d.sideOf('p2')).toBe('right')
  })

  it('한 명이 사라져 유예를 넘기면 그 포인터만 꺼지고, 다른 한 명은 계속 나온다', () => {
    const d = createDuoHands({ maxPlayers: 2 })
    d.update([person(0.3, { left: { x: 0.25, y: 0.2 } }), person(0.7, { right: { x: 0.8, y: 0.2 } })], 0)
    d.update([person(0.3, { left: { x: 0.25, y: 0.2 } })], SLOT_LOSE_GRACE_MS + 10)
    expect(d.hands.p1).not.toBeNull()
    expect(d.hands.p2).toBeNull()
    expect(d.status(SLOT_LOSE_GRACE_MS + 10).slots[1].state).toBe('lost')
  })

  it('reset — 자리·손·포인터를 모두 비운다', () => {
    const d = createDuoHands({ maxPlayers: 2 })
    d.update([person(0.3, { left: { x: 0.25, y: 0.2 } }), person(0.7, { right: { x: 0.8, y: 0.2 } })], 0)
    d.reset()
    expect(d.hands.p1).toBeNull()
    expect(d.hands.p2).toBeNull()
    expect(d.status(0).activeCount).toBe(0)
  })
})

describe('makeHandSmoother — DUO 손 키(p1/p2)도 따라간다', () => {
  it('keys를 주면 그 키로 상태를 들고, 기본(left/right)은 그대로다', () => {
    const sm = makeHandSmoother({ keys: ['p1', 'p2'] })
    const out = sm.step({ p1: { x: 0.2, y: 0.3 }, p2: null }, 1 / 60, true)
    expect(out.p1).toEqual(expect.objectContaining({ x: 0.2, y: 0.3 }))
    expect(out.p2).toBeNull()
    expect('left' in out).toBe(false)
    expect(Object.keys(makeHandSmoother().step({}, 0, true)).sort()).toEqual(['left', 'right'])
  })
})

// ─────────────────────────────────────────────────────────────────
describe('game.js — DUO 동시 입력과 중복 방지 ★', () => {
  const FAR_BASKET = { x0: 0, x1: 0, y0: 0, y1: 0 }
  const ALL_BASKET = { x0: 0, x1: 1, y0: 0, y1: 1 }
  const place = (s, x, y) => { s.x = x; s.y = y; s.vx = 0; s.vy = 0 }

  function catchRun({ quota = 2, maxHeld = 2 } = {}) {
    const run = new BalloonFestivalRun({ part1Quotas: [quota], part2Quotas: [quota], maxHeld, rng: () => 0.5 })
    return run
  }
  function popRun(quota = 2) {
    const run = new BalloonFestivalRun({ part1Quotas: [], part2Quotas: [quota], maxHeld: 2, rng: () => 0.5 })
    run.part = PART.POP
    run.levelIndex = 0
    run._startLevel()
    return run
  }

  it('SOLO 기본값(maxHeld 1)은 그대로다', () => {
    expect(new BalloonFestivalRun().maxHeld).toBe(1)
  })

  it('★ Part 1 — 두 플레이어가 서로 다른 풍선을 같은 틱에 둘 다 잡는다', () => {
    const run = catchRun()
    const [a, b] = run.field.active
    place(a, 0.2, 0.3); place(b, 0.8, 0.3)
    const res = run.tick(0, { p1: { x: 0.2, y: 0.3 }, p2: { x: 0.8, y: 0.3 } }, FAR_BASKET)
    expect(res.events.filter(e => e.type === 'grab').length).toBe(2)
    expect(a.attachedTo).toBe('p1')
    expect(b.attachedTo).toBe('p2')
  })

  it('★ Part 1 — 같은 풍선을 두 플레이어가 같은 틱에 잡아도 grab은 1번', () => {
    const run = catchRun()
    const [a, b] = run.field.active
    place(a, 0.5, 0.5); place(b, 0.9, 0.9)
    const res = run.tick(0, { p1: { x: 0.5, y: 0.5 }, p2: { x: 0.5, y: 0.5 } }, FAR_BASKET)
    const grabs = res.events.filter(e => e.type === 'grab')
    expect(grabs.length).toBe(1)
    expect(run.field.active.filter(s => s.attachedTo).length).toBe(1)
  })

  it('★ Part 1 — 공용 바구니: 둘이 각자 넣으면 공용 목표가 정확히 2 오르고 클리어', () => {
    const run = catchRun({ quota: 2 })
    const [a, b] = run.field.active
    place(a, 0.2, 0.3); place(b, 0.8, 0.3)
    run.tick(0, { p1: { x: 0.2, y: 0.3 }, p2: { x: 0.8, y: 0.3 } }, FAR_BASKET)
    const res = run.tick(0, { p1: { x: 0.2, y: 0.3 }, p2: { x: 0.8, y: 0.3 } }, ALL_BASKET)
    expect(res.events.filter(e => e.type === 'collect').length).toBe(2)
    expect(run.collected).toBe(2)
    expect(res.levelCleared).toBe(true)
  })

  it('★ Part 1 — 한 풍선을 둘이 같이 바구니에 가져가도 collect는 1번(+2 없음)', () => {
    const run = catchRun({ quota: 2 })
    const [a, b] = run.field.active
    place(a, 0.5, 0.5); place(b, 0.9, 0.05)
    run.tick(0, { p1: { x: 0.5, y: 0.5 }, p2: { x: 0.5, y: 0.5 } }, FAR_BASKET)
    // b는 바구니 밖(0.9,0.05)으로 둔다 — p2가 새로 잡지 않게 바구니를 a 자리로 좁힌다
    const basket = { x0: 0.45, x1: 0.55, y0: 0.45, y1: 0.55 }
    const res = run.tick(0, { p1: { x: 0.5, y: 0.5 }, p2: { x: 0.5, y: 0.5 } }, basket)
    expect(res.events.filter(e => e.type === 'collect').length).toBe(1)
    expect(run.collected).toBe(1)
    expect(run.score).toBe(10)
  })

  it('★ Part 2 — 같은 풍선을 둘이 같은 틱에 터뜨려도 pop 이벤트는 1번(Pop FX도 1번)', () => {
    const run = popRun(2)
    const [a, b] = run.field.active
    place(a, 0.5, 0.5); place(b, 0.9, 0.9)
    const res = run.tick(0, { p1: { x: 0.5, y: 0.5 }, p2: { x: 0.5, y: 0.5 } })
    expect(res.events.filter(e => e.type === 'pop').length).toBe(1)
    expect(run.popped).toBe(1)
    expect(run.field.count).toBe(1)
  })

  it('Part 2 — 서로 다른 풍선을 동시에 터뜨리면 둘 다 처리된다', () => {
    const run = popRun(2)
    const [a, b] = run.field.active
    place(a, 0.2, 0.3); place(b, 0.8, 0.3)
    const res = run.tick(0, { p1: { x: 0.2, y: 0.3 }, p2: { x: 0.8, y: 0.3 } })
    expect(res.events.filter(e => e.type === 'pop').length).toBe(2)
    expect(run.popped).toBe(2)
    expect(res.levelCleared).toBe(true)
  })

  it('★ 한 플레이어가 사라져 releaseHand — 들고 있던 풍선이 풀리고 quota·레벨은 그대로, 남은 사람이 잡을 수 있다', () => {
    const run = catchRun({ quota: 3 })
    const [a, b] = run.field.active
    place(a, 0.2, 0.3); place(b, 0.8, 0.3)
    run.tick(0, { p1: { x: 0.2, y: 0.3 }, p2: { x: 0.8, y: 0.3 } }, FAR_BASKET)
    expect(b.attachedTo).toBe('p2')
    run.releaseHand('p2')
    expect(b.attachedTo).toBeNull()
    expect(run.quota).toBe(3)
    expect(run.levelNo).toBe(1)
    expect(run.collected).toBe(0)
    // p1은 a를 들고 있다 — b를 새로 잡으려면 먼저 a를 넣어야 한다(손 하나 = 풍선 하나)
    run.tick(0, { p1: { x: 0.2, y: 0.3 }, p2: null }, { x0: 0.15, x1: 0.25, y0: 0.25, y1: 0.35 })
    expect(run.collected).toBe(1)
    place(b, 0.6, 0.6)
    const res = run.tick(0, { p1: { x: 0.6, y: 0.6 }, p2: null }, FAR_BASKET)
    expect(res.events.some(e => e.type === 'grab' && e.id === b.id)).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────
describe('메뉴 조작자 ≠ 게임 플레이어 — 잠금 초기화 ★', () => {
  it('★ poseEngine.resetLock()이 이미 잠긴 사람(메뉴를 누른 보호자)을 풀어 준다', () => {
    const lock = poseEngineCore._personLock
    lock.select([person(0.5)], 0)
    poseEngineCore.confirmLock()
    expect(poseEngineCore.stats.locked).toBe(true)
    poseEngineCore.resetLock()
    expect(poseEngineCore.stats.locked).toBe(false)
  })

  it('게임은 판을 열기 직전에 잠금을 풀고 → 플레이어를 새로 확보한 뒤 → (SOLO만) 그 사람으로 잠근다', () => {
    const start = playScreenSrc.indexOf('async function beginGameplay()')
    expect(start).toBeGreaterThan(-1)
    const body = playScreenSrc.slice(start, playScreenSrc.indexOf('\n  }', start))
    const iReset = body.indexOf('poseEngineCore.resetLock()')
    const iSlots = body.indexOf('tracker.reset?.()')
    const iWait = body.indexOf('await waitForPlayers(')
    const iLock = body.indexOf('if (!isDuo) poseEngineCore.confirmLock()')
    const iStart = body.indexOf('paused = false')
    expect(iReset).toBeGreaterThan(-1)
    expect(iReset).toBeLessThan(iSlots)
    expect(iSlots).toBeLessThan(iWait)
    expect(iWait).toBeLessThan(iLock)
    expect(iLock).toBeLessThan(iStart)
  })

  it('판은 확보 전에 안 열린다 — 시작부에서 곧장 paused=false 하던 줄이 없어지고 beginGameplay가 연다', () => {
    const tail = playScreenSrc.slice(playScreenSrc.indexOf('  mountUI()\n  const ok = await tracker.ready'))
    expect(tail.includes('beginGameplay()')).toBe(true)
    expect(/\n {2}paused = false\n/.test(tail)).toBe(false)
  })

  it('확보 인원: SOLO 1명 · DUO 2명, 안정화 1.2초', () => {
    expect(playScreenSrc.includes('const ACQUIRE_STABLE_MS = 1200')).toBe(true)
    expect(playScreenSrc.includes('waitForPlayers(isDuo ? 2 : 1,')).toBe(true)
  })
})

describe('poseEngine — 다인 후보 구독은 opt-in, 기존 한 사람 길은 그대로 ★', () => {
  it('onCandidates 구독/해제가 된다', () => {
    const off = poseEngineCore.onCandidates(() => {})
    expect(poseEngineCore._candidateCallbacks.size).toBe(1)
    off()
    expect(poseEngineCore._candidateCallbacks.size).toBe(0)
  })

  it('후보는 personLock을 거치기 전에 전원 흘려주고, 그다음 기존 select 길이 이어진다', () => {
    const loop = poseEngineSrc.slice(poseEngineSrc.indexOf('_loop = () => {'))
    const iCand = loop.indexOf('for (const cb of this._candidateCallbacks) cb(people, now)')
    const iSelect = loop.indexOf('this._personLock.select(candidates, performance.now())')
    expect(iCand).toBeGreaterThan(-1)
    expect(iCand).toBeLessThan(iSelect)
  })

  it('mirrorPose — x만 뒤집고 원본은 안 건드린다', () => {
    const raw = [{ x: 0.2, y: 0.4, z: 0, visibility: 0.9 }, null]
    const m = mirrorPose(raw)
    expect(m[0]).toEqual({ x: 0.8, y: 0.4, z: 0, visibility: 0.9 })
    expect(m[1]).toBeNull()
    expect(raw[0].x).toBe(0.2)
  })
})

// ─────────────────────────────────────────────────────────────────
describe('SOLO는 엄격하게 1인 — 기존 길 그대로 ★', () => {
  it('SOLO는 trackHands(personLock 한 사람 → 손 하나), DUO만 trackPlayers', () => {
    expect(playScreenSrc.includes('const tracker = isDuo ? trackPlayers({ maxPlayers: 2 }) : trackHands()')).toBe(true)
  })

  it('SOLO는 동시에 하나만 잡는다(maxHeld 1), DUO는 2', () => {
    expect(playScreenSrc.includes('maxHeld: isDuo ? 2 : 1')).toBe(true)
  })

  it('SOLO quota 5/10/15 · DUO quota 10/20/30 그대로(이번 작업에서 안 바꿈)', () => {
    expect(PLAY_MODES.solo.part1Quotas).toEqual([5, 10, 15])
    expect(PLAY_MODES.solo.part2Quotas).toEqual([5, 10, 15])
    expect(PLAY_MODES.duo.part1Quotas).toEqual([10, 20, 30])
    expect(PLAY_MODES.duo.part2Quotas).toEqual([10, 20, 30])
  })

  it('둘 다 사라짐 멈춤·재합류 게이트는 DUO에서만 돈다', () => {
    expect(playScreenSrc.includes('if (isDuo && duoPresenceGate()) return')).toBe(true)
  })

  it('DUO에서 자리가 lost가 되면 그 손의 풍선을 한 번만 놓는다', () => {
    const start = playScreenSrc.indexOf('function duoPresenceGate()')
    const body = playScreenSrc.slice(start, playScreenSrc.indexOf('\n  }\n', start))
    expect(body.includes("if (s.state === 'lost')")).toBe(true)
    expect(body.includes('run.releaseHand(key); releasedKeys.add(key)')).toBe(true)
  })
})

describe('GROUP — 이번엔 준비 중(선택 불가) ★', () => {
  it('설정상 available: false + 준비 중 배지', () => {
    expect(PLAY_MODES.group.available).toBe(false)
    expect(PLAY_MODES.group.badge).toBe('준비 중')
    expect(PLAY_MODES.duo.available).toBe(true)
  })

  it('★ group이 넘어와도 실제 플레이 모드는 SOLO로 떨어진다(3명 이상 gameplay 없음)', () => {
    expect(getPlayableMode('group').id).toBe('solo')
    expect(getPlayableMode('duo').id).toBe('duo')
  })

  it('팝업에서 disabled로 그리고, 클릭 핸들러도 한 번 더 막는다', () => {
    expect(titleScreenSrc.includes("${m.available ? '' : 'disabled aria-disabled=\"true\"'}")).toBe(true)
    expect(titleScreenSrc.includes('if (b.disabled || !getPlayMode(b.dataset.id).available) return')).toBe(true)
    expect(titleScreenSrc.includes('let modeId = getPlayableMode(initialModeId).id')).toBe(true)
  })
})
