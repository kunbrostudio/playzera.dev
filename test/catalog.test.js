import { describe, it, expect } from 'vitest'
import {
  isNew, playersLabel, buildCategories, buildFeatured,
  buildRail, searchGames, railPageCount,
} from '../src/core/catalog.js'

const g = (id, over = {}) => ({
  id, title: id, tags: [], players: { min: 1, max: 1 },
  ageRange: '4-8', createdAt: '2026-01-01', ...over,
})

const many = n => Array.from({ length: n }, (_, i) => g(`g${i + 1}`))

describe('NEW 배지', () => {
  const now = new Date('2026-08-02').getTime()

  it('30일 안쪽이면 NEW', () => {
    expect(isNew(g('a', { createdAt: '2026-07-20' }), now)).toBe(true)
  })

  it('경계(정확히 30일)는 포함한다', () => {
    expect(isNew(g('a', { createdAt: '2026-07-03' }), now)).toBe(true)
  })

  it('31일 지나면 아니다', () => {
    expect(isNew(g('a', { createdAt: '2026-07-01' }), now)).toBe(false)
  })

  // 미래 날짜가 들어오면 "영원히 NEW"가 된다. 오타 하나로 생기는 일이다.
  it('미래 날짜는 NEW가 아니다', () => {
    expect(isNew(g('a', { createdAt: '2027-01-01' }), now)).toBe(false)
  })

  it('createdAt이 없거나 이상하면 NEW가 아니다', () => {
    expect(isNew(g('a', { createdAt: undefined }), now)).toBe(false)
    expect(isNew(g('a', { createdAt: '언젠가' }), now)).toBe(false)
    expect(isNew(null, now)).toBe(false)
  })
})

describe('인원 배지', () => {
  it('1명', () => expect(playersLabel({ min: 1, max: 1 })).toBe('1명'))
  it('범위', () => expect(playersLabel({ min: 1, max: 4 })).toBe('1~4명'))
  it('없으면 빈 문자열', () => expect(playersLabel(null)).toBe(''))
})

describe('카테고리 집계', () => {
  const all = [
    g('a', { tags: ['달리기', '점프'] }),
    g('b', { tags: ['달리기'] }),
    g('c', { tags: ['균형'] }),
  ]

  it('맨 앞은 항상 전체이고 개수는 전체 게임 수다', () => {
    const cats = buildCategories(all)
    expect(cats[0]).toMatchObject({ key: null, label: '전체', n: 3 })
  })

  it('게임 수가 많은 태그가 앞에 온다', () => {
    const cats = buildCategories(all)
    expect(cats.slice(1).map(c => c.key)).toEqual(['달리기', '균형', '점프'])
    expect(cats[1].n).toBe(2)
  })

  it('처음 보는 태그도 기본 이모지로 나온다', () => {
    const cats = buildCategories([g('a', { tags: ['수영'] })])
    expect(cats[1]).toMatchObject({ key: '수영', emoji: '🎈' })
  })

  it('태그가 없는 게임만 있으면 전체만 남는다', () => {
    expect(buildCategories([g('a')])).toHaveLength(1)
  })
})

describe('히어로 추천 정렬', () => {
  // 더미가 히어로를 차지하면 "시작하기"가 전부 준비 중 안내로 끝난다
  it('플레이 가능한 게임이 더미보다 항상 먼저다', () => {
    const list = [
      g('dummy-new', { createdAt: '2026-07-30', placeholder: true }),
      g('real-old', { createdAt: '2026-01-01' }),
    ]
    expect(buildFeatured(list, 5).map(m => m.id)).toEqual(['real-old', 'dummy-new'])
  })

  it('같은 등급 안에서는 최신순', () => {
    const list = [
      g('old', { createdAt: '2026-01-01' }),
      g('new', { createdAt: '2026-07-01' }),
      g('mid', { createdAt: '2026-04-01' }),
    ]
    expect(buildFeatured(list, 5).map(m => m.id)).toEqual(['new', 'mid', 'old'])
  })

  it('max개까지만 자른다', () => {
    expect(buildFeatured(many(20), 5)).toHaveLength(5)
  })

  it('원본 배열을 건드리지 않는다', () => {
    const list = [g('b', { createdAt: '2026-01-01' }), g('a', { createdAt: '2026-07-01' })]
    buildFeatured(list, 5)
    expect(list.map(m => m.id)).toEqual(['b', 'a'])
  })
})

describe('한 줄 목록 — 최근 것이 앞', () => {
  const list = [g('a'), g('b'), g('c'), g('d')]

  it('기록이 없으면 등록 순서 그대로', () => {
    expect(buildRail({ all: list }).map(m => m.id)).toEqual(['a', 'b', 'c', 'd'])
  })

  it('최근에 한 게임이 맨 앞으로 온다', () => {
    expect(buildRail({ all: list, recentIds: ['c'] }).map(m => m.id))
      .toEqual(['c', 'a', 'b', 'd'])
  })

  it('최근 목록의 순서를 그대로 지킨다', () => {
    expect(buildRail({ all: list, recentIds: ['d', 'b'] }).map(m => m.id))
      .toEqual(['d', 'b', 'a', 'c'])
  })

  // 앞뒤에 같은 게임이 두 번 나오면 아이는 다른 게임인 줄 안다
  it('앞으로 올린 게임이 뒤에 또 나오지 않는다', () => {
    const ids = buildRail({ all: list, recentIds: ['a', 'b', 'c', 'd'] }).map(m => m.id)
    expect(ids).toEqual(['a', 'b', 'c', 'd'])
    expect(new Set(ids).size).toBe(4)
  })

  it('registry에 없는 최근 기록은 무시한다', () => {
    expect(buildRail({ all: list, recentIds: ['없는게임', 'b'] }).map(m => m.id))
      .toEqual(['b', 'a', 'c', 'd'])
  })

  it('필터를 걸면 그 태그만 남고, 최근 순서는 그 안에서 유지된다', () => {
    const tagged = [
      g('a', { tags: ['점프'] }), g('b', { tags: ['균형'] }), g('c', { tags: ['점프'] }),
    ]
    expect(buildRail({ all: tagged, recentIds: ['c'], filter: '점프' }).map(m => m.id))
      .toEqual(['c', 'a'])
  })

  it('필터에 걸리지 않는 최근 게임은 앞으로 오지 않는다', () => {
    const tagged = [g('a', { tags: ['점프'] }), g('b', { tags: ['균형'] })]
    expect(buildRail({ all: tagged, recentIds: ['b'], filter: '점프' }).map(m => m.id))
      .toEqual(['a'])
  })
})

describe('검색 — 부모·선생님용', () => {
  const list = [
    g('a', { title: '똥 피하기', description: '하늘에서 떨어지는 똥', tags: ['순발력'] }),
    g('b', { title: '로켓 타고 슝', description: '몸을 기울여요', tags: ['균형'] }),
  ]

  it('빈 검색어는 전체를 그대로 준다', () => {
    expect(searchGames(list, '')).toHaveLength(2)
    expect(searchGames(list, '   ')).toHaveLength(2)
    expect(searchGames(list, null)).toHaveLength(2)
  })

  it('제목으로 찾는다', () => {
    expect(searchGames(list, '로켓').map(m => m.id)).toEqual(['b'])
  })

  it('설명으로도 찾는다', () => {
    expect(searchGames(list, '하늘').map(m => m.id)).toEqual(['a'])
  })

  it('태그로도 찾는다', () => {
    expect(searchGames(list, '균형').map(m => m.id)).toEqual(['b'])
  })

  it('없으면 빈 목록', () => {
    expect(searchGames(list, '없는말')).toEqual([])
  })

  it('레일에도 검색이 걸린다', () => {
    expect(buildRail({ all: list, query: '로켓' }).map(m => m.id)).toEqual(['b'])
  })
})

describe('좌우 레일 쪽수', () => {
  it('4개 이하는 한 쪽', () => {
    expect(railPageCount(many(1))).toBe(1)
    expect(railPageCount(many(4))).toBe(1)
  })

  it('5개부터 두 쪽', () => {
    expect(railPageCount(many(5))).toBe(2)
    expect(railPageCount(many(8))).toBe(2)
  })

  it('비어 있어도 0쪽이 되지 않는다', () => {
    expect(railPageCount([])).toBe(1)
    expect(railPageCount(undefined)).toBe(1)
  })
})
