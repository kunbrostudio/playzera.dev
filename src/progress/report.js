// 부모 화면(/me)이 읽는 집계 — **순수 함수만.**
//
// 화면에서 계산하지 않는 이유: 여기 숫자는 부모가 아이를 판단하는 근거가 된다.
// 틀리면 안 되고, 틀렸는지 알려면 테스트가 있어야 한다. DOM이 섞이면 못 건다.
//
// ── 하루 목표를 두는 이유 ─────────────────────────────────────
//
// 목업의 "활동 시간 2시간 40분"처럼 **천장 없이 누적을 자랑하는 형식**이 위험하다.
// 많이 할수록 잘한 것처럼 보이면 부모가 더 시키고 아이는 지친다.
// 카메라를 켠 채 2시간이면 발열·배터리도 감당이 안 된다.
//
// 그래서 누적이 아니라 **목표 대비**로 보여주고, 닿으면 거기서 멈춰도 된다고 말한다.
// "더"가 아니라 "꾸준히"가 이 서비스가 파는 것이다. (docs/06 §5)

import { localDay } from './conditions.js'
import { expFrom } from './level.js'
import { getExercise } from './exercises.js'

/**
 * 하루 목표 (분).
 *
 * WHO는 아동에게 하루 60분 이상의 중강도 신체활동을 권한다. 이 앱은 그중
 * **일부를 담당하는 것으로 본다** — 나머지는 바깥에서 뛰어야 한다.
 * 화면 앞에서 30분을 넘기는 걸 목표로 삼게 하고 싶지 않다.
 */
export const DAILY_GOAL_MIN = 30

export const minutesOf = (t = {}) => Math.round((t.active_sec ?? 0) / 60)

/** 오늘 하루. ratio는 1을 넘지 않는다 — 넘긴 만큼 자랑하는 화면이 아니다. */
export function todayReport(s = {}, now = new Date()) {
  const t = s.daily?.[localDay(now)] ?? {}
  const min = minutesOf(t)
  const ratio = Math.min(1, min / DAILY_GOAL_MIN)
  return {
    totals: t,
    min,
    goal: DAILY_GOAL_MIN,
    left: Math.max(0, DAILY_GOAL_MIN - min),
    ratio,
    reached: min >= DAILY_GOAL_MIN,
    sessions: t.sessions ?? 0,
  }
}

/** 오늘 상태를 한 줄로. 목표에 닿으면 **멈춰도 된다고 말해준다.** */
export function todayLine(r) {
  if (r.min === 0) return '오늘은 아직 놀지 않았어요'
  if (r.reached)   return '오늘 목표를 채웠어요. 여기서 멈춰도 좋아요'
  return `오늘 목표까지 ${r.left}분`
}

/** 오늘을 포함한 최근 n일. **논 날이 없어도 칸을 만든다** — 빈 날도 정보다. */
export function recentDays(s = {}, n = 7, now = new Date()) {
  const out = []
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = localDay(d)
    const t = s.daily?.[key] ?? {}
    out.push({
      key,
      date: d,
      weekday: '일월화수목금토'[d.getDay()],
      min: minutesOf(t),
      exp: expFrom(t),
      totals: t,
      today: i === 0,
    })
  }
  return out
}

/**
 * 기간 요약 — 며칠 놀았나, 다 합쳐 몇 분인가, 목표를 며칠 지켰나.
 *
 * 주간(7일)과 월간(30일)이 **같은 함수를 쓴다.** 기간마다 따로 만들면
 * 둘 중 하나만 고치는 일이 반드시 생긴다.
 */
export function periodSummary(s = {}, n = 7, now = new Date()) {
  const days = recentDays(s, n, now)
  const played = days.filter(d => d.min > 0 || (d.totals.sessions ?? 0) > 0)
  const totalMin = days.reduce((a, d) => a + d.min, 0)

  // 기간 안의 동작을 다 더한다 — 대시보드의 '동작별' 칸이 이걸 쓴다
  const totals = {}
  for (const d of days) {
    for (const [k, v] of Object.entries(d.totals)) {
      if (typeof v === 'number') totals[k] = (totals[k] ?? 0) + v
    }
  }

  const best = days.reduce((m, d) => (d.min > (m?.min ?? -1) ? d : m), null)

  return {
    days,
    span: n,
    playedDays: played.length,
    totalMin,
    // **평균은 논 날로만 나눈다.** 쉰 날로 나누면 꾸준히 논 아이의 평균이 깎인다.
    avgMin: played.length ? Math.round(totalMin / played.length) : 0,
    maxMin: best?.min ?? 0,
    bestDay: best && best.min > 0 ? best : null,
    goalDays: days.filter(d => d.min >= DAILY_GOAL_MIN).length,
    sessions: totals.sessions ?? 0,
    totals,
  }
}

/** 예전 이름 — 화면 몇 곳이 아직 쓴다 */
export const weekSummary = (s, n = 7, now) => periodSummary(s, n, now)

/**
 * 게임별 요약. 최근에 논 것이 위로 온다.
 *
 * **점수를 앞세우지 않는다.** 이 서비스에서 점수는 부산물이고
 * 부모가 알아야 할 것은 얼마나 움직였나다. (docs/06 §5 고칠 것 1)
 */
export function gameRows(s = {}) {
  return Object.entries(s.byGame ?? {})
    .map(([id, t]) => ({
      id,
      sessions: t.sessions ?? 0,
      min: minutesOf(t),
      totals: t,
      lastAt: t.lastAt ?? null,
    }))
    .sort((a, b) => String(b.lastAt ?? '').localeCompare(String(a.lastAt ?? '')))
}

// 운동 종류 — "오늘의 활동" 칸. **운동 종류가 보이는 게 이 칸의 값이다.**
// 목록의 정본은 `progress/exercises.js`다. 동작이 늘면 이 화면도 같이 는다.
export { METRICS, metricValue } from './exercises.js'

/**
 * 배지 진행도를 **단위까지 붙여서** 말로 만든다.
 *
 * 숫자만 내면 `300 / 600`처럼 단위 없는 초가 나온다. 부모는 이게 초인지 회인지
 * 알 수 없고, 활동 시간은 애초에 분으로 보여주는 화면이라 여기만 초면 어긋난다.
 * 조건 종류를 아는 곳이 여기뿐이라 변환도 여기서 한다.
 */
export function progressText(cond, p) {
  if (p.met) return '완료'
  const cur = Math.min(p.current, p.target)
  switch (cond?.kind) {
    case 'total': {
      // 단위는 **운동 사전이 안다.** 여기서 '회'로 고정하면 초로 쌓이는 균형이
      // "60 / 60회"처럼 틀린 말이 된다.
      const ex = getExercise(cond.metric)
      if (ex?.minutes) return `${Math.round(cur / 60)} / ${Math.round(p.target / 60)}분`
      return `${cur} / ${p.target}${ex?.unit ?? '회'}`
    }
    case 'daysInWindow': return `${cur} / ${p.target}일`
    case 'variety':      return `${cur} / ${p.target}가지`
    case 'event':        return '아직'
    default:             return `${cur} / ${p.target}`
  }
}

/** 'YYYY-MM-DD' → '8월 9일'. 부모 화면이라 글자를 써도 된다. */
export function dayLabel(key) {
  const [, mm, dd] = String(key).split('-')
  return `${Number(mm)}월 ${Number(dd)}일`
}
