import { describe, it, expect, beforeEach } from 'vitest'
import { progressOf, isMet, newlyEarned, localDay, EMPTY_SNAPSHOT } from '../src/progress/conditions.js'
import { BADGES, ICONS, getBadge, badgeIcon } from '../src/progress/badges.js'
import { expFrom, levelFromExp, expForLevel, levelHint } from '../src/progress/level.js'
import { BUDDIES, getBuddy, unlockedStages, currentStage, stageUnlockedAt, buddyImage } from '../src/buddies/registry.js'
import { getProgress, startWith, recordSession, recordEvent, resetProgress, canChangeBuddy, changeBuddy, buddyNews, markBuddySeen } from '../src/progress/state.js'
import { PROFILES, profileImage, profileEmoji } from '../src/profiles/registry.js'
import { EXERCISES, EXP_WEIGHTS } from '../src/progress/exercises.js'
import { progressText } from '../src/progress/report.js'

const snap = o => ({ ...EMPTY_SNAPSHOT, ...o })
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return localDay(d) }

// ── 조건 ────────────────────────────────────────────────────
describe('조건 — total', () => {
  it('누적이 목표에 닿으면 달성', () => {
    const c = { kind: 'total', metric: 'jumps', n: 20 }
    expect(isMet(c, snap({ totals: { jumps: 19 } }))).toBe(false)
    expect(isMet(c, snap({ totals: { jumps: 20 } }))).toBe(true)
  })

  it('없는 값은 0으로 본다 — 터지지 않는다', () => {
    expect(progressOf({ kind: 'total', metric: 'jumps', n: 5 }, snap()).current).toBe(0)
  })
})

describe('조건 — daysInWindow (연속이 아니다)', () => {
  const c = { kind: 'daysInWindow', days: 7, n: 3 }

  // 이 규칙이 존재하는 이유: 아이는 자기가 놀 수 있는지를 못 정한다.
  // 아프거나 여행 가서 하루 빠졌다고 기록이 사라지면 벌처럼 느껴진다.
  it('띄엄띄엄이어도 이번 주에 3일이면 달성', () => {
    expect(isMet(c, snap({ days: [daysAgo(0), daysAgo(2), daysAgo(5)] }))).toBe(true)
  })

  it('하루 빠져도 지워지지 않는다', () => {
    // 어제를 건너뛰었지만 이번 주 3일은 그대로다
    expect(isMet(c, snap({ days: [daysAgo(0), daysAgo(3), daysAgo(6)] }))).toBe(true)
  })

  it('창 밖의 날은 안 센다', () => {
    expect(isMet(c, snap({ days: [daysAgo(0), daysAgo(8), daysAgo(9)] }))).toBe(false)
  })

  it('같은 날이 두 번 들어와도 하루로 센다', () => {
    expect(isMet(c, snap({ days: [daysAgo(0), daysAgo(0), daysAgo(0)] }))).toBe(false)
  })
})

describe('조건 — variety · event', () => {
  it('서로 다른 게임 수를 센다', () => {
    const c = { kind: 'variety', of: 'games', n: 2 }
    expect(isMet(c, snap({ games: ['a', 'a'] }))).toBe(false)
    expect(isMet(c, snap({ games: ['a', 'b'] }))).toBe(true)
  })

  it('사건은 있으면 달성 — 운동이 아닌 보상의 자리다', () => {
    const c = { kind: 'event', event: 'hatch' }
    expect(isMet(c, snap({ events: [] }))).toBe(false)
    expect(isMet(c, snap({ events: ['hatch'] }))).toBe(true)
  })

  // 모르는 조건을 참으로 처리하면 배지가 우수수 열린다
  it('모르는 조건 종류는 달성되지 않는다', () => {
    expect(isMet({ kind: '없는종류' }, snap())).toBe(false)
    expect(isMet(undefined, snap())).toBe(false)
  })
})

describe('새로 딴 것만 고른다', () => {
  const catalog = [
    { id: 'a', cond: { kind: 'total', metric: 'jumps', n: 1 } },
    { id: 'b', cond: { kind: 'total', metric: 'jumps', n: 99 } },
  ]

  it('조건을 만족한 것만', () => {
    expect(newlyEarned(catalog, snap({ totals: { jumps: 5 } }))).toEqual(['a'])
  })

  // 없으면 게임을 끝낼 때마다 같은 배지를 또 따고 축하가 매번 뜬다
  it('이미 가진 것은 다시 주지 않는다', () => {
    expect(newlyEarned(catalog, snap({ totals: { jumps: 5 } }), ['a'])).toEqual([])
  })
})

// ── 배지 목록 ────────────────────────────────────────────────
describe('배지 목록', () => {
  it('id가 겹치지 않는다', () => {
    const ids = BADGES.map(b => b.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('모든 배지에 이름·설명·조건이 있다', () => {
    for (const b of BADGES) {
      expect(b.name, b.id).toBeTruthy()
      expect(b.desc, b.id).toBeTruthy()
      expect(b.cond?.kind, b.id).toBeTruthy()
    }
  })

  // 아이콘은 배지와 1:1이 아니다. **모티프 단위로 그려진 그림을 돌려 쓴다** —
  // 배지 14개마다 비슷한 그림을 따로 그리지 않으려고 그렇게 정했다(badges.js 머리말).
  it('배지는 아이콘 라이브러리에서 하나를 고른다', () => {
    expect(badgeIcon('jump_20')).toBe('/assets/badges/jump.png')
  })

  // 없는 그림을 가리키면 화면에 빈 칸이 생긴다. 목록에 있는 것만 쓴다.
  it('모든 배지의 아이콘이 실제로 있는 것이다', () => {
    for (const b of BADGES) expect(ICONS, b.id).toContain(b.icon)
  })

  // 오타로 icon을 빠뜨려도 별로 떨어질 뿐 화면이 깨지지 않아야 한다
  it('모르는 배지는 기본 아이콘으로 떨어진다', () => {
    expect(badgeIcon('없는_배지')).toBe('/assets/badges/star.png')
  })

  // dodgeCount(피한 똥 개수)는 가만히 서 있어도 오른다.
  // 배지가 그 값을 쓰면 **안 움직이는 아이에게 상을 주게 된다.**
  it('운동이 아닌 지표(dodges)를 쓰는 배지가 없다', () => {
    for (const b of BADGES) {
      if (b.cond.kind === 'total') expect(b.cond.metric, b.id).not.toBe('dodges')
    }
  })

  it('꾸준함 배지는 전부 기간 방식이다 — 연속을 쓰지 않는다', () => {
    for (const b of BADGES.filter(x => x.group === 'habit')) {
      expect(b.cond.kind, b.id).toBe('daysInWindow')
    }
  })

  it('첫 판을 끝내면 바로 하나 딴다 — 첫 보상이 멀면 그전에 그만둔다', () => {
    const earned = newlyEarned(BADGES, snap({ totals: { sessions: 1 } }))
    expect(earned).toContain('first_play')
  })
})

// ── 레벨 ─────────────────────────────────────────────────────
describe('레벨', () => {
  it('아무것도 안 하면 0레벨(알)', () => {
    expect(levelFromExp(0).level).toBe(0)
  })

  it('EXP는 몸을 움직여야 오르는 값에서만 나온다', () => {
    // 점수(score)나 피한 개수(dodges)는 가중치 자체가 없다
    expect(expFrom({ score: 99999, dodges: 9999 })).toBe(0)
    expect(expFrom({ active_sec: 100 })).toBe(100)
  })

  it('포즈·점프가 활동시간보다 무겁다 — 힘든 만큼 쳐준다', () => {
    expect(expFrom({ pose_holds: 1 })).toBeGreaterThan(expFrom({ side_steps: 1 }))
    expect(expFrom({ jumps: 1 })).toBeGreaterThan(expFrom({ side_steps: 1 }))
  })

  // 첫 보상은 하루 이틀 안에 와야 한다. 실제 기록 기준 한 판이 100~200 EXP다.
  it('실제 한 판 기록으로 두세 판이면 부화한다', () => {
    const 똥피하기1판 = { active_sec: 150, side_steps: 40 }
    const 웜업1판     = { active_sec: 50, jumps: 6, squats: 4, side_steps: 7 }
    const 이틀치 = expFrom(똥피하기1판) * 2 + expFrom(웜업1판) * 2
    expect(levelFromExp(이틀치).level).toBeGreaterThanOrEqual(1)
  })

  it('레벨이 오를수록 더 많이 필요하다', () => {
    const need = n => expForLevel(n + 1) - expForLevel(n)
    expect(need(1)).toBeGreaterThan(need(0))
    expect(need(2)).toBeGreaterThan(need(1))
  })

  it('게이지는 0~1을 벗어나지 않는다', () => {
    for (const e of [0, 1, 299, 300, 5000, 999999]) {
      const r = levelFromExp(e).ratio
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    }
  })

  it('이상한 값이 들어와도 터지지 않는다', () => {
    expect(levelFromExp(-5).level).toBe(0)
    expect(levelFromExp(NaN).level).toBe(0)
    expect(levelFromExp(undefined).level).toBe(0)
  })

  // 숫자를 못 읽는 아이를 위한 문구다 — 숫자가 들어가면 안 된다
  it('게이지 문구에 숫자가 없다', () => {
    for (const r of [0, 0.4, 0.7, 0.95]) expect(levelHint(r)).not.toMatch(/\d/)
  })
})

// ── 버디 ─────────────────────────────────────────────────────
describe('버디 레지스트리', () => {
  it('세 종류가 있고 id가 겹치지 않는다', () => {
    expect(BUDDIES).toHaveLength(3)
    expect(new Set(BUDDIES.map(b => b.id)).size).toBe(3)
  })

  it('모든 버디가 같은 단계 구성을 가진다 — 화면이 하나로 그린다', () => {
    const shape = BUDDIES.map(b => b.stages.map(s => s.id).join(','))
    expect(new Set(shape).size).toBe(1)
  })

  it('단계는 해금 레벨 오름차순이다', () => {
    for (const b of BUDDIES) {
      const lv = b.stages.map(s => s.unlockLevel)
      expect(lv, b.id).toEqual([...lv].sort((a, c) => a - c))
    }
  })

  it('그림 경로는 계산된다 — manifest에 전체 경로를 적지 않는다', () => {
    expect(buddyImage('dino', 'egg.png')).toBe('/assets/buddies/dino/egg.png')
  })

  it('0레벨에는 알만 열려 있다', () => {
    expect(unlockedStages('dino', 0).map(s => s.id)).toEqual(['egg'])
  })

  it('레벨이 오르면 단계가 쌓인다 — 예전 것도 그대로 남는다', () => {
    expect(unlockedStages('dino', 5).map(s => s.id)).toEqual(['egg', 'hatch', 'grow'])
  })

  // 형태는 옷이지 운명이 아니다 — 알 모습 그대로 높은 레벨이 될 수 있다
  it('아이가 고른 옛 모습을 그대로 입는다', () => {
    expect(currentStage('dino', 12, 'hatch').id).toBe('hatch')
  })

  it('안 고르면 열린 것 중 마지막', () => {
    expect(currentStage('dino', 12, null).id).toBe('hero')
  })

  it('아직 안 열린 것을 고르면 열린 마지막으로 떨어진다 — 빈 화면이 되면 안 된다', () => {
    expect(currentStage('dino', 1, 'hero').id).toBe('hatch')
    expect(currentStage('dino', 1, '없는단계').id).toBe('hatch')
  })

  it('방금 열린 단계를 알려준다', () => {
    expect(stageUnlockedAt('dino', 1)?.id).toBe('hatch')
    expect(stageUnlockedAt('dino', 2)).toBeNull()
  })

  it('없는 버디를 물어봐도 터지지 않는다', () => {
    expect(getBuddy('없음')).toBeNull()
    expect(unlockedStages('없음', 5)).toEqual([])
    expect(currentStage('없음', 5)).toBeNull()
  })
})

// ── 상태 저장 ────────────────────────────────────────────────
describe('성장 상태', () => {
  beforeEach(() => resetProgress())

  it('처음에는 아무것도 고르지 않은 상태', () => {
    const s = getProgress()
    expect(s.profile).toBeNull()
    expect(s.buddyId).toBeNull()
    expect(s.badges).toEqual([])
  })

  it('프로필과 알을 고르면 배지가 하나 붙는다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    const s = getProgress()
    expect(s.buddyId).toBe('dino')
    expect(s.events).toContain('buddy_chosen')
  })

  it('한 판 하면 누적·날짜·게임이 함께 쌓인다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 150, side_steps: 40 } })
    const s = getProgress()
    expect(s.totals.sessions).toBe(1)
    expect(s.totals.active_sec).toBe(150)
    expect(s.games).toEqual(['poop-dodge'])
    expect(s.days).toHaveLength(1)
  })

  it('첫 판에 첫 배지를 준다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    const r = recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 30 } })
    expect(r.newBadges).toContain('first_play')
  })

  it('같은 배지를 두 번 주지 않는다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 30 } })
    const r2 = recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 30 } })
    expect(r2.newBadges).not.toContain('first_play')
  })

  it('같은 날 두 번 놀아도 하루로 센다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    recordSession({ gameId: 'a', exercise: { active_sec: 10 } })
    recordSession({ gameId: 'a', exercise: { active_sec: 10 } })
    expect(getProgress().days).toHaveLength(1)
  })

  it('레벨이 오르면 알려주고 부화 사건이 남는다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    const r = recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 400 } })
    expect(r.leveledUp).toBe(true)
    expect(getProgress().events).toContain('hatch')
    expect(getProgress().badges).toContain('hatched')
  })

  // 첫 선택을 무겁게 만들지 않는다
  it('부화 전에는 알을 바꿀 수 있다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    expect(canChangeBuddy()).toBe(true)
    changeBuddy('bunny')
    expect(getProgress().buddyId).toBe('bunny')
  })

  it('부화한 뒤에는 못 바꾼다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    recordSession({ gameId: 'a', exercise: { active_sec: 400 } })
    expect(canChangeBuddy()).toBe(false)
    changeBuddy('bunny')
    expect(getProgress().buddyId).toBe('dino')
  })

  it('운동이 아닌 사건도 배지를 준다', () => {
    startWith({ profile: 'boy', buddyId: 'dino' })
    const r = recordEvent('form_unlocked')
    expect(r.newBadges).toContain('first_form')
  })

  it('저장본이 깨져 있어도 처음 상태로 읽는다', () => {
    localStorage.setItem('pz_progress', '{망가진')
    expect(getProgress().buddyId).toBeNull()
  })

  // 필드가 늘어나도 옛 저장본이 깨지면 안 된다
  it('옛 저장본에 없는 필드는 기본값으로 채운다', () => {
    localStorage.setItem('pz_progress', JSON.stringify({ profile: 'girl' }))
    const s = getProgress()
    expect(s.profile).toBe('girl')
    expect(s.badges).toEqual([])
    expect(s.totals).toEqual({})
  })
})


// ── 허브의 빨간 점 ────────────────────────────────────────────
//
// 아이는 글자를 못 읽는다. "가볼 데가 생겼다"를 알리는 수단이 점 하나뿐이라
// **켜지고 꺼지는 조건이 정확해야 한다.** 안 꺼지면 곧 무시하게 되고,
// 안 켜지면 딴 배지를 영영 못 본다.
describe('버디 소식(빨간 점)', () => {
  beforeEach(() => resetProgress())

  it('막 시작했으면 알릴 게 없다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    markBuddySeen()
    expect(buddyNews()).toBe(false)
  })

  it('배지를 새로 따면 켜진다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    markBuddySeen()
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 30 } })  // '첫 걸음'
    expect(buddyNews()).toBe(true)
  })

  it('보고 나면 꺼진다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 30 } })
    markBuddySeen()
    expect(buddyNews()).toBe(false)
  })

  // 이 기능 전에 놀던 아이의 저장본에는 seen이 없다.
  // 없다고 "다 봤다"로 치면 그동안 딴 배지를 못 보고 넘어간다.
  it('seen이 없는 옛 저장본은 소식이 있는 것으로 본다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 30 } })
    expect(buddyNews()).toBe(true)
  })
})

describe('프로필 레지스트리', () => {
  // 그림 파일 이름은 디자인 쪽에서 온다. **id에서 경로를 계산하지 않는다** —
  // 실제로 파일이 profile_girl.png로 와서 girl.png를 찾던 코드가 빈 칸을 냈다.
  it('경로는 manifest의 파일 이름을 그대로 쓴다', () => {
    expect(profileImage('girl')).toBe('/assets/profiles/profile_girl.png')
  })

  it('모르는 프로필은 그림 없이 이모지로 떨어진다', () => {
    expect(profileImage('없음')).toBe(null)
    expect(profileEmoji('없음')).toBeTruthy()
  })

  it('모든 프로필에 이름·그림·이모지가 있다', () => {
    for (const p of PROFILES) {
      expect(p.label, p.id).toBeTruthy()
      expect(p.image, p.id).toMatch(/\.png$/)
      expect(p.emoji, p.id).toBeTruthy()
    }
  })
})

// ── 운동 사전 ────────────────────────────────────────────────
//
// 지표 이름이 level·report·badges에 흩어져 있으면, 하나를 빠뜨렸을 때
// **EXP는 오르는데 화면에는 안 나오는** 상태가 된다. 정본이 하나인지 지킨다.
describe('운동 사전', () => {
  it('EXP 가중치는 사전에서 나온다', () => {
    for (const e of EXERCISES) expect(EXP_WEIGHTS[e.key], e.key).toBe(e.exp)
  })

  it('배지가 쓰는 지표는 전부 사전에 있는 것이다', () => {
    const keys = new Set(EXERCISES.map(e => e.key))
    for (const b of BADGES) {
      if (b.cond.kind === 'total' && b.cond.metric !== 'sessions') {
        expect(keys, b.id).toContain(b.cond.metric)
      }
    }
  })

  it('모든 동작에 단위와 품질 기준이 있다 — 횟수만 세는 지표를 만들지 않는다', () => {
    for (const e of EXERCISES) {
      expect(e.unit, e.key).toBeTruthy()
      expect(e.quality, e.key).toBeTruthy()
    }
  })

  // 유산소와 균형은 이번에 통째로 비어 있던 축이다 (docs/07)
  it('유산소와 균형 지표가 있다', () => {
    const groups = new Set(EXERCISES.map(e => e.group))
    expect(groups).toContain('aerobic')
    expect(groups).toContain('balance')
  })

  it('균형은 초로 쌓이고 초로 보여준다', () => {
    expect(progressText({ kind: 'total', metric: 'balance_sec', n: 60 }, { current: 20, target: 60, met: false }))
      .toBe('20 / 60초')
  })
})
