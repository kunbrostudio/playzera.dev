import { describe, it, expect, beforeEach } from 'vitest'
import { markPlayed, getRecentIds, clearRecent } from '../src/core/recent.js'

const KEY = 'pz_recent_games'

describe('recent — 최근 플레이 기록', () => {
  beforeEach(() => localStorage.clear())

  it('플레이한 순서의 역순으로 나온다', () => {
    markPlayed('a')
    markPlayed('b')
    markPlayed('c')
    expect(getRecentIds()).toEqual(['c', 'b', 'a'])
  })

  it('같은 게임을 다시 하면 두 번 나오지 않고 맨 앞으로 올라온다', () => {
    markPlayed('a')
    markPlayed('b')
    markPlayed('c')
    markPlayed('a')
    expect(getRecentIds()).toEqual(['a', 'c', 'b'])
  })

  it('8건을 넘으면 가장 오래된 것부터 밀려난다', () => {
    for (let i = 1; i <= 11; i++) markPlayed(`g${i}`)
    const ids = getRecentIds()
    expect(ids).toHaveLength(8)
    expect(ids[0]).toBe('g11')
    expect(ids).not.toContain('g1')
    expect(ids).not.toContain('g3')
    expect(ids).toContain('g4')
  })

  // registry에서 사라진 게임(이름 변경·삭제)이 목록에 남으면 카드가 깨진다
  it('지금 registry에 없는 게임은 걸러서 준다', () => {
    markPlayed('gone')
    markPlayed('alive')
    expect(getRecentIds(id => id === 'alive')).toEqual(['alive'])
  })

  it('clearRecent()로 첫 방문 상태가 된다', () => {
    markPlayed('a')
    clearRecent()
    expect(getRecentIds()).toEqual([])
  })

  it('빈 id는 무시한다', () => {
    markPlayed('')
    markPlayed(null)
    markPlayed(undefined)
    expect(getRecentIds()).toEqual([])
  })

  // 이어서 하기는 없어도 되는 기능이다. 저장소가 깨졌다고 홈이 죽으면 안 된다.
  it('localStorage 값이 깨져 있어도 터지지 않는다', () => {
    localStorage.setItem(KEY, '{{{ 깨진 JSON')
    expect(getRecentIds()).toEqual([])
    markPlayed('a')
    expect(getRecentIds()).toEqual(['a'])
  })

  it('배열이 아닌 값이 들어 있어도 터지지 않는다', () => {
    localStorage.setItem(KEY, '{"id":"a"}')
    expect(getRecentIds()).toEqual([])
  })

  it('id가 없는 항목은 걸러낸다', () => {
    localStorage.setItem(KEY, JSON.stringify([{ at: 1 }, { id: 'ok', at: 2 }, null]))
    expect(getRecentIds()).toEqual(['ok'])
  })
})
