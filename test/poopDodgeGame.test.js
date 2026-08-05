import { describe, it, expect } from 'vitest'
import { ROUNDS, TOTAL_SECONDS, stepToward } from '../src/games/poop-dodge/game.js'

// 한 판이 53초로 끝나던 것이 이 게임의 가장 큰 문제였다.
// 운동 데이터 1호가 활동 18초 · 좌우 이동 2회로 남은 원인이기도 하다.
describe('라운드 구성 — 한 판이 충분히 길어야 한다', () => {
  it('총 플레이 시간이 2분을 넘는다', () => {
    expect(TOTAL_SECONDS).toBeGreaterThanOrEqual(120)
  })

  it('라운드는 5개다', () => {
    expect(ROUNDS).toHaveLength(5)
  })

  it('뒤로 갈수록 빨라진다', () => {
    const speeds = ROUNDS.map(r => r.speed)
    expect(speeds).toEqual([...speeds].sort((a, b) => a - b))
    expect(new Set(speeds).size).toBe(speeds.length)   // 같은 속도가 두 번 나오면 단계가 아니다
  })

  it('뒤로 갈수록 자주 떨어진다', () => {
    const gaps = ROUNDS.map(r => r.spawnMs)
    expect(gaps).toEqual([...gaps].sort((a, b) => b - a))
  })

  // 시간만 늘리고 밀도를 같이 올리면 난이도가 딴 게임이 된다.
  // 초당 낙하 수를 좁은 범위 안에 묶어 둔다.
  it('초당 낙하 수가 라운드마다 크게 튀지 않는다', () => {
    const perSec = ROUNDS.map(r => 1000 / r.spawnMs)
    expect(Math.min(...perSec)).toBeGreaterThan(0.35)
    expect(Math.max(...perSec)).toBeLessThan(0.75)
  })

  it('첫 라운드는 배우는 구간이라 가장 느리고 가장 뜸하다', () => {
    expect(ROUNDS[0].speed).toBe(Math.min(...ROUNDS.map(r => r.speed)))
    expect(ROUNDS[0].spawnMs).toBe(Math.max(...ROUNDS.map(r => r.spawnMs)))
  })
})

// 캐릭터가 칸을 건너는 보간. 캔버스 없이 검증할 수 있는 몇 안 되는 조각이다.
describe('캐릭터 이동 — 목표까지 한 걸음', () => {
  it('걸음보다 멀면 걸음만큼만 간다', () => {
    expect(stepToward(0, 100, 10)).toBe(10)
  })

  it('왼쪽으로도 같다', () => {
    expect(stepToward(100, 0, 10)).toBe(90)
  })

  // 지나쳤다가 되돌아오면 목표 근처에서 덜덜 떨린다
  it('걸음이 남은 거리보다 크면 목표에 딱 붙는다 — 지나치지 않는다', () => {
    expect(stepToward(95, 100, 10)).toBe(100)
    expect(stepToward(105, 100, 10)).toBe(100)
  })

  it('이미 도착했으면 그대로 있는다', () => {
    expect(stepToward(100, 100, 10)).toBe(100)
  })

  // dt가 0인 프레임(탭 복귀 직후 등)에 목표로 순간이동하면 안 된다
  it('걸음이 0이면 움직이지 않는다', () => {
    expect(stepToward(0, 100, 0)).toBe(0)
  })

  it('여러 번 부르면 목표에 도달하고, 그 뒤로는 머문다', () => {
    let x = 0
    for (let i = 0; i < 50; i++) x = stepToward(x, 100, 10)
    expect(x).toBe(100)
  })
})
