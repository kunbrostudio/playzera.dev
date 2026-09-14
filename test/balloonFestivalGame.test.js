import { describe, it, expect } from 'vitest'
import {
  BalloonFestivalRun, PART,
  PART1_LEVEL_QUOTAS, PART2_LEVEL_QUOTAS, PART2_BASKET_DECOR_COUNTS, BALLOON_R,
  PART1_LEVEL_CLEAR_LINES, PART2_LEVEL_CLEAR_LINES, LEVEL_REST_SECONDS,
} from '../src/games/balloon-festival/game.js'

// ── 레벨 재구성(STEP 95) ────────────────────────────────────────
//
// 예전 구조(quota + timeLimitSec + count<quota 재충전)를 걷어내고,
// "레벨 시작 시 quota만큼 딱 한 번 스폰 → 다 처리하면 레벨 클리어"
// 하나로 단순화했다. 이 테스트 파일은 그 새 규칙을 못박는다 — 화면에
// 뜬 자유 풍선 수가 항상 quota에서 시작해 처리한 만큼 정확히 줄어야
// 하고, 다 처리하기 전에는 추가로 채워지면 안 된다.

const HAND_FAR = { x: -1, y: -1 }   // 어떤 풍선과도 안 겹치는 손 자리

/** 간단한 시드 PRNG(LCG) — 매번 같은 값(0.5)만 나오면 풍선이 전부 같은
 *  자리·같은 속도로 겹쳐 스폰돼 safe zone 테스트가 의미가 없어진다. */
function makeRng(seed = 1) {
  let s = seed
  return () => {
    s = (s * 9301 + 49297) % 233280
    return s / 233280
  }
}

describe('BalloonFestivalRun — 기본 구성', () => {
  it('1부·2부 레벨 목표는 5·10·15다', () => {
    expect(PART1_LEVEL_QUOTAS).toEqual([5, 10, 15])
    expect(PART2_LEVEL_QUOTAS).toEqual([5, 10, 15])
  })

  it('레벨이 오를수록 풍선이 작아진다(겹쳐 안 보이는 걸 막는다)', () => {
    for (let i = 1; i < BALLOON_R.length; i++) {
      expect(BALLOON_R[i]).toBeLessThan(BALLOON_R[i - 1])
    }
  })

  it('시작은 1부(CATCH) 레벨 1이고, 생성자 시점에 이미 quota만큼 떠 있다', () => {
    const run = new BalloonFestivalRun()
    expect(run.part).toBe(PART.CATCH)
    expect(run.levelNo).toBe(1)
    expect(run.field.count).toBe(PART1_LEVEL_QUOTAS[0])
  })
})

describe('BalloonFestivalRun — Part 1 스폰 정책 (quota만큼 한 번, 재충전 없음)', () => {
  it('레벨 1 시작 active balloon = 정확히 5', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [5, 10, 15] })
    expect(run.field.count).toBe(5)
  })

  it('1개 수집하면 5 → 4로 줄고, 다시 채워지지 않는다', () => {
    const run = new BalloonFestivalRun({ rng: () => 0.5 })
    const basket = { x0: 0, x1: 1, y0: 0, y1: 1 }   // 화면 전체 — 어디든 바구니(판정만 본다)
    const b = run.field.active[0]
    run.tick(0.1, { left: { x: b.x, y: b.y } }, basket)          // grab
    run.tick(0.1, { left: { x: 0.5, y: 0.5 } }, basket)          // collect
    expect(run.collected).toBe(1)
    expect(run.field.count).toBe(4)   // 5 -> 4, 새로 안 채워짐
  })

  it('5개를 전부 수집하면 0이 되고, LEVEL_CLEAR 대기 상태가 된다 — 화면이 startNextLevel()을 부르기 전까진 그대로', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [5, 10, 15], rng: () => 0.5 })
    const basket = { x0: 0, x1: 1, y0: 0, y1: 1 }
    let res
    for (let i = 0; i < 5; i++) {
      expect(run.field.count).toBe(5 - i)   // 5→4→3→2→1로 정확히 줄어든다
      const b = run.field.active[0]
      run.tick(0.1, { left: { x: b.x, y: b.y } }, basket)   // grab
      res = run.tick(0.1, { left: { x: 0.5, y: 0.5 } }, basket)   // collect
    }
    expect(res.levelCleared).toBe(true)
    expect(res.clearedLevel).toBe(1)
    // ── 레벨 재구성(STEP 96) — 여기서 곧장 안 넘어간다 ★ ───────
    // LEVEL_CLEAR 배너·대사·Rest 카운트다운을 화면이 다 보여줄 때까지
    // 새 풍선이 생기면 안 되므로, quota를 다 채워도 `startNextLevel()`을
    // 부르기 전까지는 레벨도 안 바뀌고 풍선도 0인 채로 멈춰 있다.
    expect(run.levelNo).toBe(1)
    expect(run.field.count).toBe(0)
    expect(run.awaitingNext).toBe(true)
    // 한 번 더 tick해도(화면이 멈춰야 하지만 방어적으로 봐도) 아무 일도
    // 안 생긴다 — 새 풍선도 없고 판정도 없다.
    const again = run.tick(1, {}, basket)
    expect(again.events).toEqual([])
    expect(run.field.count).toBe(0)

    run.startNextLevel()
    expect(run.levelNo).toBe(2)
    expect(run.field.count).toBe(10)   // 레벨 2는 정확히 10개로 스폰
  })

  it('레벨 2는 정확히 10개, 레벨 3은 정확히 15개로 스폰한다', () => {
    const run = new BalloonFestivalRun({ rng: () => 0.5 })
    run.levelIndex = 1
    run._startLevel()
    expect(run.field.count).toBe(10)

    run.levelIndex = 2
    run._startLevel()
    expect(run.field.count).toBe(15)
  })

  it('붙잡기만으로는 점수가 안 오르고, 바구니에 들어와야 오른다', () => {
    const run = new BalloonFestivalRun({ rng: () => 0.5 })
    const balloon = run.field.active[0]
    const basket = { x0: 0.9, x1: 1.0, y0: 0.9, y1: 1.0 }   // 풍선과 안 겹치는 자리

    run.tick(0.1, { left: { x: balloon.x, y: balloon.y } }, basket)
    expect(run.score).toBe(0)
    expect(run.field.active.some(s => s.attachedTo === 'left')).toBe(true)

    run.tick(0.1, { left: { x: 0.95, y: 0.95 } }, basket)
    expect(run.score).toBe(10)
    expect(run.totalCollected).toBe(1)
  })

  it('붙잡으면 grab 이벤트가 뜬다(바구니 판정과 별개)', () => {
    const run = new BalloonFestivalRun({ rng: () => 0.5 })
    const balloon = run.field.active[0]
    const basket = { x0: 0.9, x1: 1.0, y0: 0.9, y1: 1.0 }
    const res = run.tick(0.1, { left: { x: balloon.x, y: balloon.y } }, basket)
    expect(res.events.some(e => e.type === 'grab' && e.handKey === 'left' && e.id === balloon.id)).toBe(true)
  })

  it('★ 한 번에 하나만 — 양손이 같은 틱에 서로 다른 풍선을 동시에 못 잡는다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [2], rng: () => 0.5 })
    const [a, b] = run.field.active
    const basket = { x0: 0, x1: 0, y0: 0, y1: 0 }   // 풍선과 안 겹치는 구석
    run.tick(0.1, { left: { x: a.x, y: a.y }, right: { x: b.x, y: b.y } }, basket)
    const attached = run.field.active.filter(s => s.attachedTo)
    expect(attached.length).toBe(1)
  })

  it('1부를 다 깨면 res.partDone이 예고되고, startNextLevel()을 불러야 실제로 2부(POP) 레벨 1이 5개로 열린다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [1], part2Quotas: [5, 10, 15], rng: () => 0.5 })
    const basket = { x0: 0, x1: 1, y0: 0, y1: 1 }
    const b = run.field.active[0]
    run.tick(0.1, { left: { x: b.x, y: b.y } }, basket)
    const res = run.tick(0.1, { left: { x: 0.5, y: 0.5 } }, basket)
    expect(res.partDone).toBe(true)
    // 예고만 됐을 뿐 아직 파트가 안 넘어갔다 — 화면의 배너·대사·Rest가
    // 끝나야(startNextLevel) 실제로 넘어간다.
    expect(run.part).toBe(PART.CATCH)
    expect(run.field.count).toBe(0)

    run.startNextLevel()
    expect(run.part).toBe(PART.POP)
    expect(run.field.count).toBe(5)
  })
})

describe('BalloonFestivalRun — Part 2 스폰 정책 (quota만큼 한 번, 재충전 없음)', () => {
  function popRun(part2Quotas = [5, 10, 15]) {
    const run = new BalloonFestivalRun({ part1Quotas: [], part2Quotas, rng: () => 0.5 })
    run.part = PART.POP
    run.levelIndex = 0
    run._startLevel()
    return run
  }

  it('레벨 1 active pop balloon = 정확히 5', () => {
    const run = popRun()
    expect(run.field.count).toBe(5)
  })

  it('손이 닿으면 즉시 점수가 오른다(바구니 필요 없음), 1개 pop → 4', () => {
    const run = popRun()
    const s = run.field.active[0]
    const res = run.tick(0.1, { right: { x: s.x, y: s.y } })
    expect(run.score).toBe(10)
    expect(res.events[0].type).toBe('pop')
    expect(res.events[0].handKey).toBe('right')
    expect(run.field.count).toBe(4)   // 새로 안 채워짐
  })

  it('레벨의 풍선을 모두 pop하면 0이 되고 대기 상태가 된다 — startNextLevel() 뒤에야 레벨 2가 정확히 10개로 열린다', () => {
    const run = popRun()
    let res
    for (let i = 0; i < 5; i++) {
      expect(run.field.count).toBe(5 - i)
      const s = run.field.active[0]
      res = run.tick(0.1, { left: { x: s.x, y: s.y } })
    }
    expect(res.levelCleared).toBe(true)
    expect(run.levelNo).toBe(1)
    expect(run.field.count).toBe(0)

    run.startNextLevel()
    expect(run.levelNo).toBe(2)
    expect(run.field.count).toBe(10)
  })

  it('레벨 3은 정확히 15개다', () => {
    const run = popRun()
    run.levelIndex = 2
    run._startLevel()
    expect(run.field.count).toBe(15)
  })

  it('★ 게임을 끝까지 깨면 gameDone이 예고되고, startNextLevel() 뒤에 done이 되어 요약을 돌려준다', () => {
    const run = popRun([1])
    const s = run.field.active[0]
    const res = run.tick(0.1, { left: { x: s.x, y: s.y } })
    expect(res.gameDone).toBe(true)
    expect(run.done).toBe(false)   // 아직 — 화면이 배너·대사를 다 보여줘야 한다

    run.startNextLevel()
    expect(run.done).toBe(true)
    const summary = run.summary({ left_hits: 3, right_hits: 0 })
    expect(summary.completed).toBe(true)
    expect(summary.left_hits).toBe(3)
  })
})

describe('BalloonFestivalRun — Basket Safe Zone (자유 풍선만)', () => {
  it('자유(미부착) 풍선은 바구니 주변 구역으로 자율 이동해 들어가지 않는다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [8], rng: makeRng(7) })
    const basket = { x0: 0.4, x1: 0.6, y0: 0.85, y1: 1.0 }   // 화면 하단 중앙, 작은 실제 바구니 크기
    for (let i = 0; i < 200; i++) run.tick(0.1, {}, basket)   // 아무도 안 잡은 채 오래 흘려본다
    for (const s of run.field.active) {
      expect(s.attachedTo).toBeFalsy()
      const pad = s.r + 0.04 + 0.02
      const inZone = s.x > basket.x0 - pad && s.x < basket.x1 + pad
        && s.y > basket.y0 - pad && s.y < basket.y1 + pad
      expect(inZone).toBe(false)
    }
  })

  it('손에 붙잡힌(ATTACHED) 풍선은 안전구역 제한 없이 바구니로 가져갈 수 있다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [1], rng: () => 0.5 })
    const basket = { x0: 0.4, x1: 0.6, y0: 0.85, y1: 1.0 }
    const b = run.field.active[0]
    run.tick(0.1, { left: { x: b.x, y: b.y } }, basket)   // grab
    // 붙잡은 채로 바구니 한가운데까지 데려간다 — safe zone에 안 걸려야 한다
    const res = run.tick(0.1, { left: { x: 0.5, y: 0.92 } }, basket)
    expect(run.totalCollected).toBe(1)
    expect(res.events.some(e => e.type === 'collect')).toBe(true)
  })
})

describe('BalloonFestivalRun — Part 2 장식용 바구니 풍선(순수 연출)', () => {
  it('장식 개수는 레벨이 오를수록 줄어 마지막엔 빈 바구니다', () => {
    expect(PART2_BASKET_DECOR_COUNTS).toEqual([10, 5, 0])
    expect(PART2_BASKET_DECOR_COUNTS[2]).toBe(0)
  })

  it('장식 풍선은 게임 규칙(SpriteField)과 완전히 분리돼 있다 — active 개수·점수에 안 걸린다', () => {
    // 장식 풍선은 `run.field`에 아예 안 들어간다(playScreen.js가 별도
    // DOM으로만 그린다) — 그래서 2부 레벨의 active 개수는 언제나
    // PART2_LEVEL_QUOTAS만 반영하고, 장식 개수(PART2_BASKET_DECOR_COUNTS)와는
    // 무관하다는 걸 구조적으로 확인한다.
    const run = new BalloonFestivalRun({ part1Quotas: [], part2Quotas: [5, 10, 15], rng: () => 0.5 })
    run.part = PART.POP
    run.levelIndex = 1   // 장식은 5개(PART2_BASKET_DECOR_COUNTS[1])지만
    run._startLevel()
    expect(run.field.count).toBe(10)   // active는 quota(10)만 본다 — 장식 수와 무관

    const before = run.score
    // 손을 아무렇게나 흔들어도(장식 위치와 무관하게) 필드 밖 좌표는 아무 효과가 없다
    run.tick(0.1, { left: HAND_FAR })
    expect(run.score).toBe(before)
  })
})

describe('BalloonFestivalRun — 콤보', () => {
  it('일정 시간 아무 성과가 없으면 콤보가 끊긴다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [], part2Quotas: [1], comboBreakSec: 1, rng: () => 0.5 })
    run.part = PART.POP
    run._startLevel()
    run.combo = 3
    run.tick(1.5, {})   // 아무 손도 없이 시간만 흐른다
    expect(run.combo).toBe(0)
  })
})

describe('BalloonFestivalRun — 타이머 없음(quota가 유일한 완료 조건)', () => {
  it('시간이 아무리 흘러도 레벨이 저절로 끝나거나 실패하지 않는다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [3], rng: () => 0.5 })
    let res
    for (let i = 0; i < 50; i++) res = run.tick(1, {})   // 50초 흘려도 아무도 안 잡음
    expect(run.levelNo).toBe(1)
    expect(run.field.count).toBe(3)   // 새로 안 채워지지도, 사라지지도 않는다
    expect(res.levelCleared).toBeFalsy()
    expect(res.gameDone).toBeFalsy()
  })

  it('summary().completed은 끝까지 깬 판에서만 true다(타임업 개념 없음)', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [], part2Quotas: [1], rng: () => 0.5 })
    run.part = PART.POP
    run._startLevel()
    expect(run.summary().completed).toBe(false)
    const s = run.field.active[0]
    run.tick(0.1, { left: { x: s.x, y: s.y } })
    // 레벨 재구성(STEP 96) — 마지막 풍선을 처리해도 `part`가 곧장 DONE으로
    // 안 바뀐다. 화면이 LEVEL_CLEAR 배너·대사·엔딩을 다 보여준 뒤에야
    // `startNextLevel()`을 부르고, 그때 비로소 완주로 기록된다.
    expect(run.summary().completed).toBe(false)
    run.startNextLevel()
    expect(run.summary().completed).toBe(true)
  })
})

// ── UX 재구성(STEP 96) — LEVEL_CLEAR → 대사 → Rest → 다음 레벨 ────
describe('BalloonFestivalRun — 레벨 사이 UX 데이터', () => {
  it('Rest 시간은 10초다', () => {
    expect(LEVEL_REST_SECONDS).toBe(10)
  })

  it('1부·2부 각각 레벨 수만큼 클리어 대사가 있다', () => {
    expect(PART1_LEVEL_CLEAR_LINES.length).toBe(PART1_LEVEL_QUOTAS.length)
    expect(PART2_LEVEL_CLEAR_LINES.length).toBe(PART2_LEVEL_QUOTAS.length)
    // ★ (STEP 107) 이제 문자열이 아니라 (quotas) => string 함수다 —
    // 목표 개수를 문자열에 안 박고 실제 quota를 받아 채운다.
    for (const line of [...PART1_LEVEL_CLEAR_LINES, ...PART2_LEVEL_CLEAR_LINES]) {
      expect(typeof line).toBe('function')
      const text = line(PART1_LEVEL_QUOTAS)
      expect(typeof text).toBe('string')
      expect(text.length).toBeGreaterThan(0)
    }
  })

  it('★ SOLO(5/10/15)로 부르면 예전과 똑같은 문구가 나온다 — 회귀 없음', () => {
    expect(PART1_LEVEL_CLEAR_LINES[0]([5, 10, 15]))
      .toBe('잘했어! 풍선 5개를 모두 모았어! 이번에는 풍선 10개를 바구니에 담아보자!')
    expect(PART1_LEVEL_CLEAR_LINES[1]([5, 10, 15]))
      .toBe('대단해! 이번에는 마지막으로 풍선 15개를 모아보자!')
    expect(PART2_LEVEL_CLEAR_LINES[0]([5, 10, 15]))
      .toBe('멋져! 이번에는 풍선 10개를 터뜨려보자!')
    expect(PART2_LEVEL_CLEAR_LINES[1]([5, 10, 15]))
      .toBe('거의 다 왔어! 마지막으로 풍선 15개를 터뜨려보자!')
  })

  it('★ DUO(10/20/30)로 부르면 그 숫자가 그대로 대사에 들어간다', () => {
    expect(PART1_LEVEL_CLEAR_LINES[0]([10, 20, 30]))
      .toBe('잘했어! 풍선 10개를 모두 모았어! 이번에는 풍선 20개를 바구니에 담아보자!')
    expect(PART1_LEVEL_CLEAR_LINES[1]([10, 20, 30]))
      .toBe('대단해! 이번에는 마지막으로 풍선 30개를 모아보자!')
    expect(PART2_LEVEL_CLEAR_LINES[0]([10, 20, 30]))
      .toBe('멋져! 이번에는 풍선 20개를 터뜨려보자!')
    expect(PART2_LEVEL_CLEAR_LINES[1]([10, 20, 30]))
      .toBe('거의 다 왔어! 마지막으로 풍선 30개를 터뜨려보자!')
  })
})

describe('BalloonFestivalRun — Pop 이벤트에 Pop FX 자리 정보가 실린다', () => {
  it('pop 이벤트는 id·x·y·r을 함께 낸다 — 화면이 터진 자리에 색 맞는 FX를 띄우는 데 쓴다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: [], part2Quotas: [1], rng: () => 0.5 })
    run.part = PART.POP
    run._startLevel()
    const s = run.field.active[0]
    const res = run.tick(0.1, { left: { x: s.x, y: s.y } })
    const ev = res.events.find(e => e.type === 'pop')
    expect(ev).toBeTruthy()
    expect(ev.id).toBe(s.id)
    expect(typeof ev.x).toBe('number')
    expect(typeof ev.y).toBe('number')
    expect(ev.r).toBe(s.r)
  })
})
