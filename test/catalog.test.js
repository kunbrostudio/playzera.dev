import { describe, it, expect } from 'vitest'
import {
  isNew, playersLabel, buildCategories, buildFeatured,
  buildPages, labelPosition, findPageAfterRebuild, railPageCount,
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

describe('줄 페이지 구성', () => {
  it('첫 방문(기록 없음)은 전체 게임부터 시작한다', () => {
    const pages = buildPages({ all: many(6), recent: [] })
    expect(pages).toHaveLength(2)
    expect(pages[0].label).toBe('전체 게임')
    expect(pages[0].items).toHaveLength(4)
    expect(pages[1].items).toHaveLength(2)
  })

  it('기록이 있으면 이어서 하기가 0페이지', () => {
    const pages = buildPages({ all: many(6), recent: many(3) })
    expect(pages[0]).toMatchObject({ label: '이어서 하기', kind: 'recent' })
    expect(pages[1].label).toBe('전체 게임')
  })

  // 세로로 쪼개면 전체 게임까지 가는 길이 길어진다 — 좌우로 넘기기로 한 규칙
  it('이어서 하기는 8개여도 페이지 하나다', () => {
    const pages = buildPages({ all: many(4), recent: many(8) })
    expect(pages.filter(p => p.kind === 'recent')).toHaveLength(1)
    expect(pages[0].items).toHaveLength(8)
  })

  it('이어서 하기는 8개를 넘겨받아도 8개로 자른다', () => {
    const pages = buildPages({ all: many(4), recent: many(20) })
    expect(pages[0].items).toHaveLength(8)
  })

  it('전체 게임은 4개씩 나뉜다', () => {
    const pages = buildPages({ all: many(20), recent: [] })
    expect(pages).toHaveLength(5)
    expect(pages.every(p => p.total === 20)).toBe(true)
  })

  it('필터를 걸면 해당 태그만 남는다', () => {
    const all = [g('a', { tags: ['점프'] }), g('b', { tags: ['균형'] }), g('c', { tags: ['점프'] })]
    const pages = buildPages({ all, recent: [], filter: '점프' })
    expect(pages[0].items.map(m => m.id)).toEqual(['a', 'c'])
    expect(pages[0].total).toBe(2)
  })

  // 결과가 0개여도 페이지가 하나는 있어야 한다. 없으면 화면이 통째로 빈다.
  it('필터 결과가 없어도 빈 페이지 하나는 만든다', () => {
    const pages = buildPages({ all: many(4), recent: [], filter: '없는태그' })
    expect(pages).toHaveLength(1)
    expect(pages[0].items).toEqual([])
    expect(pages[0].total).toBe(0)
  })

  it('이어서 하기는 필터의 영향을 받지 않는다', () => {
    const all = [g('a', { tags: ['점프'] }), g('b', { tags: ['균형'] })]
    const pages = buildPages({ all, recent: [g('b', { tags: ['균형'] })], filter: '점프' })
    expect(pages[0].kind).toBe('recent')
    expect(pages[0].items.map(m => m.id)).toEqual(['b'])
  })
})

describe('줄 제목 위치 표시', () => {
  const pages = buildPages({ all: many(12), recent: many(2) })

  it('이어서 하기는 1/1', () => {
    expect(labelPosition(pages, 0)).toEqual({ idx: 1, of: 1 })
  })

  it('전체 게임은 자기들끼리 번호를 센다', () => {
    expect(labelPosition(pages, 1)).toEqual({ idx: 1, of: 3 })
    expect(labelPosition(pages, 3)).toEqual({ idx: 3, of: 3 })
  })

  it('범위 밖이면 0/0', () => {
    expect(labelPosition(pages, 99)).toEqual({ idx: 0, of: 0 })
  })
})

describe('페이지 다시 만든 뒤 자리 찾기', () => {
  // 게임을 처음 실행하는 순간 이어서 하기가 0페이지로 끼어들면서 뒤가 한 칸 밀린다.
  // 인덱스로 기억했다면 보던 줄 대신 엉뚱한 줄이 뜬다.
  it('앞에 이어서 하기가 새로 끼어들어도 보던 줄에 남는다', () => {
    const before = buildPages({ all: many(12), recent: [] })
    const at = 2                                    // 전체 게임 3쪽째
    const keep = { label: '전체 게임', idx: labelPosition(before, at).idx }
    expect(keep.idx).toBe(3)

    const after = buildPages({ all: many(12), recent: many(1) })
    const found = findPageAfterRebuild(after, keep)
    expect(found).toBe(3)                           // 한 칸 밀린 자리
    expect(labelPosition(after, found)).toEqual({ idx: 3, of: 3 })
  })

  it('보던 쪽이 사라지면 같은 라벨의 첫 쪽으로 간다', () => {
    const after = buildPages({ all: many(4), recent: [] })   // 전체 게임 1쪽뿐
    expect(findPageAfterRebuild(after, { label: '전체 게임', idx: 3 })).toBe(0)
  })

  it('라벨 자체가 사라지면 맨 앞으로 간다', () => {
    const after = buildPages({ all: many(4), recent: [] })   // 이어서 하기 없음
    expect(findPageAfterRebuild(after, { label: '이어서 하기', idx: 1 })).toBe(0)
  })

  it('기억한 게 없으면 맨 앞', () => {
    expect(findPageAfterRebuild(buildPages({ all: many(4) }), null)).toBe(0)
  })
})

describe('이어서 하기 레일 쪽수', () => {
  it('4개 이하는 한 쪽 — 화살표가 나오지 않는다', () => {
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
