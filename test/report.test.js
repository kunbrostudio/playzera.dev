// 부모 화면(/me)이 읽는 숫자들.
//
// 여기 값은 **부모가 아이를 판단하는 근거**가 된다. 틀리면 안 되고,
// 특히 "오늘 얼마나 움직였나"가 어긋나면 그날의 대화가 어긋난다.

import { describe, it, expect, beforeEach } from 'vitest'
import { localDay } from '../src/progress/conditions.js'
import {
  DAILY_GOAL_MIN, METRICS, metricValue,
  todayReport, todayLine, recentDays, weekSummary, gameRows, minutesOf, dayLabel, progressText,
} from '../src/progress/report.js'
import { getProgress, startWith, recordSession, resetProgress } from '../src/progress/state.js'

const at = (n, h = 12) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(h, 0, 0, 0); return d }
const day = n => localDay(at(n))

describe('오늘', () => {
  it('활동 초를 분으로 바꾼다', () => {
    expect(minutesOf({ active_sec: 90 })).toBe(2)   // 반올림
    expect(minutesOf({})).toBe(0)
  })

  it('논 기록이 없으면 0분', () => {
    const r = todayReport({})
    expect(r.min).toBe(0)
    expect(r.left).toBe(DAILY_GOAL_MIN)
    expect(todayLine(r)).toMatch(/아직/)
  })

  it('목표까지 남은 분을 말해준다', () => {
    const s = { daily: { [day(0)]: { active_sec: 600 } } }   // 10분
    const r = todayReport(s)
    expect(r.min).toBe(10)
    expect(r.left).toBe(DAILY_GOAL_MIN - 10)
    expect(todayLine(r)).toContain(`${DAILY_GOAL_MIN - 10}분`)
  })

  // **천장 없이 누적을 자랑하지 않는다.** 많이 할수록 잘한 것처럼 보이면
  // 부모가 더 시키고 아이는 지친다. (docs/06 §5)
  it('목표를 넘겨도 게이지는 가득에서 멈춘다', () => {
    const s = { daily: { [day(0)]: { active_sec: 60 * 200 } } }
    const r = todayReport(s)
    expect(r.ratio).toBe(1)
    expect(r.left).toBe(0)
    expect(r.reached).toBe(true)
  })

  it('목표에 닿으면 멈춰도 된다고 말해준다', () => {
    const r = todayReport({ daily: { [day(0)]: { active_sec: 60 * DAILY_GOAL_MIN } } })
    expect(todayLine(r)).toMatch(/멈춰도/)
  })

  it('어제 논 것은 오늘로 세지 않는다', () => {
    const s = { daily: { [day(1)]: { active_sec: 1800 } } }
    expect(todayReport(s).min).toBe(0)
  })
})

describe('최근 7일', () => {
  it('논 날이 없어도 칸은 일곱 개다 — 빈 날도 정보다', () => {
    const d = recentDays({}, 7)
    expect(d).toHaveLength(7)
    expect(d.every(x => x.min === 0)).toBe(true)
  })

  it('마지막 칸이 오늘이다', () => {
    const d = recentDays({}, 7)
    expect(d[6].today).toBe(true)
    expect(d[6].key).toBe(day(0))
    expect(d[0].key).toBe(day(6))
  })

  it('창 밖의 날은 안 들어온다', () => {
    const s = { daily: { [day(9)]: { active_sec: 6000 } } }
    expect(weekSummary(s).totalMin).toBe(0)
  })

  it('논 날 평균은 논 날로만 나눈다 — 쉰 날이 평균을 깎지 않는다', () => {
    const s = { daily: { [day(0)]: { active_sec: 1200 }, [day(2)]: { active_sec: 600 } } }
    const w = weekSummary(s)
    expect(w.playedDays).toBe(2)
    expect(w.totalMin).toBe(30)
    expect(w.avgMin).toBe(15)
  })
})

describe('게임별', () => {
  beforeEach(() => resetProgress())

  it('최근에 논 것이 위로 온다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    recordSession({ gameId: 'warmup-obstacle', exercise: { active_sec: 60 }, now: at(3) })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 60 }, now: at(1) })
    expect(gameRows(getProgress())[0].id).toBe('poop-dodge')
  })

  it('판 수와 운동량이 게임별로 쌓인다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 120, side_steps: 10 } })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 120, side_steps: 14 } })
    const [row] = gameRows(getProgress())
    expect(row.sessions).toBe(2)
    expect(row.min).toBe(4)
    expect(row.totals.side_steps).toBe(24)
  })
})

describe('기록이 세 축으로 갈라진다', () => {
  beforeEach(() => resetProgress())

  // 누적만 있으면 "오늘"도 "이번 주"도 만들 수 없고, 나중에 역산할 방법도 없다.
  it('한 판이 전체·날짜별·게임별에 모두 더해진다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 150, side_steps: 40 } })
    const s = getProgress()
    expect(s.totals.side_steps).toBe(40)
    expect(s.daily[localDay()].side_steps).toBe(40)
    expect(s.byGame['poop-dodge'].side_steps).toBe(40)
  })

  it('안 한 운동은 0으로도 기록하지 않는다 — "안 함"과 "0회"는 다르다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 60, jumps: 0 } })
    expect(getProgress().totals.jumps).toBeUndefined()
  })

  // `{ ...EMPTY }`는 얕은 복사라 통이 모듈 상수와 같은 객체였다.
  // 기록을 지워도 지운 값이 되살아난다.
  it('기록을 지우면 정말로 비어 있다', () => {
    startWith({ profile: 'girl', buddyId: 'dino' })
    recordSession({ gameId: 'poop-dodge', exercise: { active_sec: 300 } })
    resetProgress()
    const s = getProgress()
    expect(s.totals).toEqual({})
    expect(s.daily).toEqual({})
    expect(s.byGame).toEqual({})
    expect(s.badges).toEqual([])
  })
})

describe('표시', () => {
  it('활동만 분으로 바꾸고 나머지는 횟수 그대로다', () => {
    const t = { active_sec: 180, jumps: 7 }
    const m = k => METRICS.find(x => x.key === k)
    expect(metricValue(t, m('active_sec'))).toBe(3)
    expect(metricValue(t, m('jumps'))).toBe(7)
  })

  it('날짜를 사람이 읽는 말로 바꾼다', () => {
    expect(dayLabel('2026-08-09')).toBe('8월 9일')
  })
})

// 숫자만 내면 `300 / 600`처럼 단위 없는 초가 나온다.
// 부모는 이게 초인지 회인지 알 수 없고, 활동 시간은 분으로 보여주는 화면이다.
describe('배지 진행도 문구', () => {
  const p = (current, target, met = false) => ({ current, target, met })

  it('활동 시간은 분으로 바꾼다', () => {
    expect(progressText({ kind: 'total', metric: 'active_sec', n: 600 }, p(300, 600)))
      .toBe('5 / 10분')
  })

  it('횟수·일수·가짓수에 단위를 붙인다', () => {
    expect(progressText({ kind: 'total', metric: 'jumps', n: 20 }, p(7, 20))).toBe('7 / 20회')
    expect(progressText({ kind: 'daysInWindow', days: 7, n: 3 }, p(1, 3))).toBe('1 / 3일')
    expect(progressText({ kind: 'variety', of: 'games', n: 3 }, p(2, 3))).toBe('2 / 3가지')
  })

  it('사건은 세는 게 아니다', () => {
    expect(progressText({ kind: 'event', event: 'hatch' }, p(0, 1))).toBe('아직')
  })

  it('달성했으면 진행도 대신 완료', () => {
    expect(progressText({ kind: 'total', metric: 'jumps', n: 20 }, p(20, 20, true))).toBe('완료')
  })

  it('넘겨도 목표를 넘는 숫자를 보여주지 않는다', () => {
    expect(progressText({ kind: 'total', metric: 'jumps', n: 20 }, p(99, 20))).toBe('20 / 20회')
  })
})
