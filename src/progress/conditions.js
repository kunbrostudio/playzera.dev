// 조건 평가 — 배지와 아이템이 **같은 엔진**을 쓴다.
//
// 조건을 코드로 짜면 배지 하나 추가할 때마다 함수가 하나씩 는다.
// 그래서 **조건의 종류를 넷으로 고정하고, 배지는 값만 채운다.**
// 배지를 추가한다 = 목록에 한 줄. 이 파일은 안 건드린다.
//
// 여기 있는 것은 전부 입력 → 출력인 순수 함수다. 카메라도 DOM도 필요 없어서
// 그림이 없어도, 몸을 움직이지 않아도 검증된다.

/**
 * 진행 스냅샷 — 조건이 보는 유일한 입력.
 *
 * @typedef {object} Snapshot
 * @property {object} totals  누적값 { sessions, active_sec, jumps, squats, side_steps, pose_holds }
 * @property {string[]} days  논 날짜 (로컬 기준 'YYYY-MM-DD')
 * @property {string[]} games 해본 게임 id
 * @property {string[]} events 일어난 사건 ('hatch' · 'first_form' …)
 */

export const EMPTY_SNAPSHOT = {
  totals: {}, days: [], games: [], events: [],
}

// 로컬 날짜 'YYYY-MM-DD'.
//
// ⚠️ UTC로 자르면 안 된다. 한국에서 저녁 9시에 논 것이 UTC로는 다음 날이 되고,
// "오늘 놀았나"가 어긋난다. 아이는 자기 시계로 산다.
export function localDay(d = new Date()) {
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// days 안에서 최근 windowDays일에 해당하는 날짜만 센다 (오늘 포함).
function daysWithin(days, windowDays, now) {
  const from = new Date(now)
  from.setDate(from.getDate() - (windowDays - 1))
  const fromKey = localDay(from)
  const todayKey = localDay(now)
  // 문자열 비교로 충분하다 — 'YYYY-MM-DD'는 사전순 = 시간순
  return new Set(days.filter(d => d >= fromKey && d <= todayKey)).size
}

/**
 * 조건의 진행 상황. 게이지("2/3")를 그릴 때도 쓴다.
 * @returns {{current:number, target:number, met:boolean}}
 */
export function progressOf(cond, snap = EMPTY_SNAPSHOT, now = new Date()) {
  const totals = snap.totals ?? {}
  switch (cond?.kind) {
    case 'total': {
      const current = totals[cond.metric] ?? 0
      return { current, target: cond.n, met: current >= cond.n }
    }
    case 'daysInWindow': {
      const current = daysWithin(snap.days ?? [], cond.days, now)
      return { current, target: cond.n, met: current >= cond.n }
    }
    case 'variety': {
      const list = cond.of === 'games' ? snap.games : snap[cond.of]
      const current = new Set(list ?? []).size
      return { current, target: cond.n, met: current >= cond.n }
    }
    case 'event': {
      const met = (snap.events ?? []).includes(cond.event)
      return { current: met ? 1 : 0, target: 1, met }
    }
    default:
      // 모르는 조건은 **달성 불가**로 둔다. 참으로 처리하면 배지가 우수수 열린다.
      console.warn('[conditions] 모르는 조건 종류:', cond?.kind)
      return { current: 0, target: 1, met: false }
  }
}

export function isMet(cond, snap, now) {
  return progressOf(cond, snap, now).met
}

/**
 * 목록에서 **새로 달성된** 것만 골라낸다.
 *
 * 이미 가진 것을 다시 주지 않으려고 `owned`를 받는다. 이게 없으면 게임을 끝낼 때마다
 * 같은 배지를 또 따고, 축하 연출이 매번 뜬다.
 *
 * @param {Array<{id:string, cond:object}>} catalog
 * @param {string[]} owned  이미 가진 id
 */
export function newlyEarned(catalog, snap, owned = [], now = new Date()) {
  const have = new Set(owned)
  return catalog.filter(e => !have.has(e.id) && isMet(e.cond, snap, now)).map(e => e.id)
}
