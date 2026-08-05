import { describe, it, expect, beforeEach } from 'vitest'
import { TUTORIAL_TIMING, LANES } from '../src/games/poop-dodge/tutorial.js'
import { hasSeenTutorial, markTutorialSeen, resetTutorialSeen } from '../src/core/tutorialSeen.js'

const { CYCLE_MS, FALL_MS, MOVE_AT, MOVE_MS, MIN_ESCAPE_MARGIN_MS } = TUTORIAL_TIMING

// 튜토리얼이 가르치는 건 딱 하나다 — "먼저 비키면 안 맞는다".
// 타이밍이 어긋나면 아이는 정반대를 배운다.
describe('데모 타이밍', () => {
  it('다 비킨 뒤에 똥이 떨어진다', () => {
    expect(MOVE_AT + MOVE_MS).toBeLessThan(FALL_MS)
  })

  // 30ms 차이로 "먼저"이면 눈에는 동시에 보인다. 실제로 처음 잡은 값이 그랬다.
  it('비키기를 마치고 착지까지 눈에 보일 만큼 여유가 있다', () => {
    expect(FALL_MS - (MOVE_AT + MOVE_MS)).toBeGreaterThanOrEqual(MIN_ESCAPE_MARGIN_MS)
  })

  it('한 바퀴가 착지보다 길다 — 피한 결과를 볼 시간이 남는다', () => {
    expect(CYCLE_MS).toBeGreaterThan(FALL_MS + 500)
  })

  it('똥이 떨어지기 시작한 뒤에 비킨다 — 미리 도망가면 인과가 안 보인다', () => {
    expect(MOVE_AT).toBeGreaterThan(FALL_MS * 0.35)
  })
})

describe('칸 순서', () => {
  it('모든 칸을 한 번씩은 보여준다', () => {
    expect(new Set(LANES)).toEqual(new Set([0, 1, 2]))
  })

  it('한 번에 한 칸씩만 움직인다', () => {
    for (let i = 0; i < LANES.length; i++) {
      const from = LANES[i]
      const to   = LANES[(i + 1) % LANES.length]
      expect(Math.abs(to - from)).toBe(1)
    }
  })

  // 오른쪽으로만 가면 "오른쪽으로 가는 게임"으로 배운다
  it('좌우 양쪽으로 번갈아 간다', () => {
    const dirs = LANES.map((from, i) => Math.sign(LANES[(i + 1) % LANES.length] - from))
    expect(dirs).toContain(1)
    expect(dirs).toContain(-1)
  })
})

describe('튜토리얼을 봤는지 기억하기', () => {
  beforeEach(() => resetTutorialSeen())

  it('처음에는 안 본 상태다', () => {
    expect(hasSeenTutorial('poop-dodge')).toBe(false)
  })

  it('보고 나면 기억한다', () => {
    markTutorialSeen('poop-dodge')
    expect(hasSeenTutorial('poop-dodge')).toBe(true)
  })

  // 형이 똥 피하기를 봤다고 웜업까지 아는 건 아니다
  it('게임마다 따로 기억한다', () => {
    markTutorialSeen('poop-dodge')
    expect(hasSeenTutorial('warmup-obstacle')).toBe(false)
  })

  it('값이 깨져 있으면 안 본 것으로 친다 — 게임을 막지 않는다', () => {
    localStorage.setItem('pz_tutorial_seen', '{망가진 JSON')
    expect(hasSeenTutorial('poop-dodge')).toBe(false)
    markTutorialSeen('poop-dodge')
    expect(hasSeenTutorial('poop-dodge')).toBe(true)   // 덮어쓰고 정상화된다
  })

  it('배열이 들어와 있어도 무시한다', () => {
    localStorage.setItem('pz_tutorial_seen', '[1,2,3]')
    expect(hasSeenTutorial('poop-dodge')).toBe(false)
  })
})
