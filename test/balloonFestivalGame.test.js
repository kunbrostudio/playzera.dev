import { describe, it, expect } from 'vitest'
import { BalloonFestivalRun, PART, CATCH_STAGES, POP_STAGES } from '../src/games/balloon-festival/game.js'

// 테스트를 짧게 하려고 스테이지를 1~2개짜리 quota로 줄인 미니 세트를 쓴다.
// dt=0으로 부르는 "priming tick"은 시간을 안 흘리면서 스폰만 보장하는 용도다
// (실제 스폰은 생성자가 아니라 첫 tick()에서 일어난다 — 카메라가 안 켜진
// 순간에도 화면에 풍선이 미리 떠 있는 것처럼 보이면 안 되기 때문).
const miniCatch = [
  { id: 1, kind: 'balloon', pattern: 'drift', count: 1, speed: 0.05, r: 0.1, quota: 1, points: 10 },
  { id: 2, kind: 'balloon', pattern: 'drift', count: 1, speed: 0.05, r: 0.1, quota: 1, points: 10 },
]
const miniPop = [
  { id: 1, kind: 'balloon', pattern: 'drift', count: 1, speed: 0.05, r: 0.1, quota: 1, points: 10 },
]

describe('BalloonFestivalRun — 기본 구성', () => {
  it('파트마다 3단계다', () => {
    expect(CATCH_STAGES.length).toBe(3)
    expect(POP_STAGES.length).toBe(3)
  })

  it('풍선이 많아지는 단계일수록 하나가 작아진다(겹쳐 안 보이는 걸 막는다)', () => {
    for (const list of [CATCH_STAGES, POP_STAGES]) {
      for (let i = 1; i < list.length; i++) {
        expect(list[i].r).toBeLessThan(list[i - 1].r)
      }
    }
  })

  it('시작은 1부(CATCH) 1스테이지고, 풍선은 tick 전엔 안 떠 있다', () => {
    const run = new BalloonFestivalRun()
    expect(run.part).toBe(PART.CATCH)
    expect(run.stageNo).toBe(1)
    expect(run.field.count).toBe(0)
    run.tick(0, {})
    expect(run.field.count).toBe(CATCH_STAGES[0].count)
  })
})

describe('BalloonFestivalRun — 1부 잡기(attach → basket)', () => {
  it('★ 붙잡기만으로는 점수가 안 오르고, 바구니에 들어와야 오른다', () => {
    const run = new BalloonFestivalRun({ catchStages: miniCatch, popStages: miniPop, rng: () => 0.5 })
    run.tick(0, {})   // 스폰만
    const balloon = run.field.active[0]
    const basket = { x0: 0.9, x1: 1.0, y0: 0.9, y1: 1.0 }   // 풍선과 안 겹치는 자리

    run.tick(0.1, { left: { x: balloon.x, y: balloon.y } }, basket)
    expect(run.score).toBe(0)
    expect(run.field.active.some(s => s.attachedTo === 'left')).toBe(true)

    // 손을 바구니 위치로 옮긴다 — attach된 스프라이트는 tick에서 손을 따라간다
    run.tick(0.1, { left: { x: 0.95, y: 0.95 } }, basket)
    expect(run.score).toBe(10)
    // quota가 1이라 이 collect가 스테이지도 같이 깨서 `collected`(스테이지별)는
    // 곧장 0으로 리셋된다 — 누적치인 `totalCollected`로 확인한다.
    expect(run.totalCollected).toBe(1)
  })

  it('붙잡으면 grab 이벤트가 뜬다(바구니 판정과 별개)', () => {
    const run = new BalloonFestivalRun({ catchStages: miniCatch, popStages: miniPop, rng: () => 0.5 })
    run.tick(0, {})
    const balloon = run.field.active[0]
    const basket = { x0: 0.9, x1: 1.0, y0: 0.9, y1: 1.0 }
    const res = run.tick(0.1, { left: { x: balloon.x, y: balloon.y } }, basket)
    expect(res.events.some(e => e.type === 'grab' && e.handKey === 'left' && e.id === balloon.id)).toBe(true)
  })

  it('★ 한 번에 하나만 — 양손이 같은 틱에 서로 다른 풍선을 동시에 못 잡는다', () => {
    const twoUp = [
      { id: 1, kind: 'balloon', pattern: 'drift', count: 2, speed: 0.05, r: 0.05, timeLimitSec: 10, points: 10 },
    ]
    const run = new BalloonFestivalRun({ catchStages: twoUp, popStages: miniPop, rng: () => 0.5 })
    run.tick(0, {})   // 스폰 — count 2라 풍선이 두 개
    const [a, b] = run.field.active
    const basket = { x0: 0, x1: 0, y0: 0, y1: 0 }   // 풍선과 안 겹치는 구석
    run.tick(0.1, { left: { x: a.x, y: a.y }, right: { x: b.x, y: b.y } }, basket)
    const attached = run.field.active.filter(s => s.attachedTo)
    expect(attached.length).toBe(1)   // 둘 다 손이 닿았지만 하나만 잡힌다
  })

  it('quota를 채우면 스테이지가 넘어간다', () => {
    const run = new BalloonFestivalRun({ catchStages: miniCatch, popStages: miniPop, rng: () => 0.5 })
    const basket = { x0: 0, x1: 1, y0: 0, y1: 1 }   // 화면 전체 — 어디든 바구니
    let last
    for (let i = 0; i < 6 && run.stageNo === 1; i++) {
      run.tick(0, {})   // 아직 안 떠 있으면 스폰
      const b = run.field.active[0]
      last = run.tick(0.1, { left: { x: b.x, y: b.y } }, basket)
    }
    expect(run.stageNo).toBe(2)
    expect(last.stageCleared).toBe(true)
  })

  it('1부를 다 깨면 2부(POP)로 전환된다', () => {
    const run = new BalloonFestivalRun({ catchStages: miniCatch, popStages: miniPop, rng: () => 0.5 })
    const basket = { x0: 0, x1: 1, y0: 0, y1: 1 }
    let result
    for (let i = 0; i < 20 && run.part === PART.CATCH; i++) {
      run.tick(0, {})
      const b = run.field.active[0]
      result = run.tick(0.1, { left: { x: b.x, y: b.y } }, basket)
    }
    expect(run.part).toBe(PART.POP)
    expect(result.partDone).toBe(true)
  })
})

describe('BalloonFestivalRun — 2부 터뜨리기(pop)', () => {
  it('손이 닿으면 즉시 점수가 오른다(바구니 필요 없음)', () => {
    const run = new BalloonFestivalRun({ catchStages: [], popStages: miniPop, rng: () => 0.5 })
    run.part = PART.POP
    run.stageIndex = 0
    run._startStage()
    run.tick(0, {})   // 스폰만
    const s = run.field.active[0]
    const res = run.tick(0.1, { right: { x: s.x, y: s.y } })
    expect(run.score).toBe(10)
    expect(res.events[0].type).toBe('pop')
    expect(res.events[0].handKey).toBe('right')
  })

  it('★ 게임을 끝까지 깨면 done이 되고 요약을 돌려준다', () => {
    const run = new BalloonFestivalRun({ catchStages: [], popStages: miniPop, rng: () => 0.5 })
    run.part = PART.POP
    run._startStage()
    let res
    for (let i = 0; i < 5 && !run.done; i++) {
      run.tick(0, {})
      const s = run.field.active[0]
      res = run.tick(0.1, { left: { x: s.x, y: s.y } })
    }
    expect(run.done).toBe(true)
    expect(res.gameDone).toBe(true)
    const summary = run.summary({ left_hits: 3, right_hits: 0 })
    expect(summary.completed).toBe(true)
    expect(summary.left_hits).toBe(3)
  })
})

// ── 목표를 채우면 통과, 시간이 다하면 실패 ★ (ken 6차) ────────
//
// 이 두 축을 헷갈린 게 3~5차에서 헤맨 원인이라 테스트로 못박는다.
describe('BalloonFestivalRun — 개수 목표와 제한 시간', () => {
  /** 목표 n개, 제한 sec초짜리 잡기 단계 하나. */
  const goalStage = (quota, sec) => ([
    { id: 1, kind: 'balloon', pattern: 'drift', count: 1, speed: 0.05, r: 0.1, quota, timeLimitSec: sec, points: 10 },
  ])

  it('시간이 남아도 목표를 못 채우면 단계가 안 넘어간다', () => {
    const run = new BalloonFestivalRun({ catchStages: goalStage(2, 10), popStages: miniPop, rng: () => 0.5 })
    const res = run.tick(0.5, {})
    expect(res.stageCleared).toBeFalsy()
    expect(res.timeUp).toBeFalsy()
    expect(run.stageNo).toBe(1)
  })

  it('목표를 채우면 그때 넘어간다', () => {
    const run = new BalloonFestivalRun({ catchStages: goalStage(2, 10), popStages: miniPop, rng: () => 0.5 })
    const basket = { x0: 0, x1: 1, y0: 0, y1: 1 }
    let res
    for (let i = 0; i < 10 && run.part === PART.CATCH; i++) {
      run.tick(0, {})
      const b = run.field.active[0]
      res = run.tick(0.1, { left: { x: b.x, y: b.y } }, basket)
    }
    expect(run.part).toBe(PART.POP)   // 단계가 하나뿐이라 파트까지 넘어간다
    expect(res.partDone).toBe(true)
  })

  it('★ 시간 안에 목표를 못 채우면 timeUp으로 판이 끝난다', () => {
    const run = new BalloonFestivalRun({ catchStages: goalStage(5, 0.2), popStages: miniPop, rng: () => 0.5 })
    run.tick(0, {})
    const res = run.tick(0.25, {})
    expect(res.timeUp).toBe(true)
    expect(res.gameDone).toBe(true)
    expect(run.done).toBe(true)
    expect(run.failed).toBe(true)
  })

  it('실패한 판은 완주로 기록되지 않는다 — 배지·레벨이 잘못 붙으면 안 된다', () => {
    const run = new BalloonFestivalRun({ catchStages: goalStage(5, 0.2), popStages: miniPop, rng: () => 0.5 })
    run.tick(0, {})
    run.tick(0.25, {})
    expect(run.summary().completed).toBe(false)
  })

  it('마지막 하나를 시간이 0이 되는 틱에 해내도 성공이다(억울한 실패 없음)', () => {
    // 터뜨리기로 본다 — 잡기는 붙잡기·바구니 넣기가 두 틱이라 "같은 틱"을
    // 만들 수 없다. 판정 순서(시간을 깎되 목표를 먼저 본다)는 두 파트가 같다.
    const run = new BalloonFestivalRun({ catchStages: [], popStages: goalStage(1, 0.2), rng: () => 0.5 })
    run.part = PART.POP
    run._startStage()
    run.tick(0, {})
    const s = run.field.active[0]
    // 이 틱에 시간이 다 되지만(0.25 > 0.2) 같은 틱에 목표도 채운다
    const res = run.tick(0.25, { left: { x: s.x, y: s.y } })
    expect(res.timeUp).toBeFalsy()
    expect(run.failed).toBe(false)
  })

  it('실제 CATCH_STAGES·POP_STAGES — 목표가 5·10·15이고 제한은 60초씩이다', () => {
    expect(CATCH_STAGES.map(s => s.quota)).toEqual([5, 10, 15])
    expect(POP_STAGES.map(s => s.quota)).toEqual([5, 10, 15])
    for (const st of [...CATCH_STAGES, ...POP_STAGES]) {
      expect(st.timeLimitSec).toBe(60)
    }
  })

  it('화면에 뜨는 개수는 목표와 다르다 — 15개를 한꺼번에 띄우지 않는다', () => {
    // ken 5차: "풍선은 너무 많으면 아이들이 어지럽고 힘들어 할거야."
    for (const st of [...CATCH_STAGES, ...POP_STAGES]) {
      expect(st.count).toBeLessThanOrEqual(10)
    }
  })
})

describe('BalloonFestivalRun — 콤보', () => {
  it('일정 시간 아무 성과가 없으면 콤보가 끊긴다', () => {
    const run = new BalloonFestivalRun({ catchStages: [], popStages: miniPop, comboBreakSec: 1, rng: () => 0.5 })
    run.part = PART.POP
    run._startStage()
    run.combo = 3
    run.tick(1.5, {})   // 아무 손도 없이 시간만 흐른다
    expect(run.combo).toBe(0)
  })
})
