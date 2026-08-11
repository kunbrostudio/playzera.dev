// 아이 한 명의 성장 상태 — 프로필 · 버디 · 배지 · 누적 운동량.
//
// 지금은 localStorage 하나다(`core/player.js`가 "브라우저 하나 = 한 명"인 것과 같은 단계).
// **계정이 생기면 이 파일의 read/write만 Supabase로 바꾼다.** 화면은 손대지 않는다.
// 그래서 화면은 절대 localStorage를 직접 만지지 않고 여기를 거친다.

import { localDay } from './conditions.js'
import { expFrom, levelFromExp } from './level.js'
import { BADGES } from './badges.js'
import { newlyEarned } from './conditions.js'

const KEY = 'pz_progress'

const EMPTY = {
  profile: null,        // 'girl' | 'boy'
  nickname: null,       // 부모가 마이페이지에서 고쳐준다
  buddyId: null,        // 'plant' | 'dino' | 'bunny'
  buddyStage: null,     // 아이가 골라 입은 단계. null이면 열린 것 중 마지막
  totals: {},           // 누적 운동량
  days: [],             // 논 날짜 'YYYY-MM-DD'
  // 아래 둘은 **부모 화면(/me)을 위해** 있다.
  // 누적 합계만으로는 "오늘 얼마나 움직였나"도 "이번 주에 늘었나"도 말할 수 없다.
  daily: {},            // 'YYYY-MM-DD' → { sessions, active_sec, jumps, … }
  byGame: {},           // gameId → { sessions, lastAt, active_sec, … }
  games: [],            // 해본 게임 id
  events: [],           // 일어난 사건
  badges: [],           // 딴 배지 id
  seen: null,           // 마지막으로 /buddy를 봤을 때의 { level, badges }
}

// **기본값은 매번 새로 만든다.**
// `{ ...EMPTY }`는 얕은 복사라 totals·days 같은 통이 EMPTY의 것과 **같은 객체**다.
// 거기에 운동량을 더하면 모듈 상수가 오염되고, 기록을 지운 뒤에도(resetProgress)
// 지운 값이 되살아난다. 통은 반드시 새 것이어야 한다.
const fresh = () => ({
  ...EMPTY,
  totals: {}, days: [], games: [], events: [], badges: [], daily: {}, byGame: {},
})

function read() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fresh()
    // 필드가 늘어나도 옛 저장본이 깨지지 않게 기본값과 합친다
    return { ...fresh(), ...raw }
  } catch {
    // 값이 깨졌다고 아이를 처음 화면으로 되돌리는 건 가혹하지만,
    // 읽을 수 없는 상태로 게임을 막는 것보다는 낫다.
    return fresh()
  }
}

function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* 사파리 프라이빗 등 */ }
  return s
}

// 한 판의 운동량을 어떤 통에든 더한다. 판 수(sessions)도 같이 센다.
// 0이나 숫자가 아닌 값은 넣지 않는다 — 안 한 운동이 0으로 기록되면
// "안 함"과 "0회"가 구분이 안 된다.
function addInto(bucket, exercise) {
  bucket.sessions = (bucket.sessions ?? 0) + 1
  for (const [k, v] of Object.entries(exercise)) {
    if (typeof v === 'number' && v > 0) bucket[k] = (bucket[k] ?? 0) + v
  }
  return bucket
}

export const getProgress = () => read()

export function hasStarted() {
  const s = read()
  return !!(s.profile && s.buddyId)
}

/** 첫 실행 — 프로필과 알을 고른다. */
export function startWith({ profile, buddyId, nickname = null }) {
  const s = read()
  s.profile = profile
  s.buddyId = buddyId
  s.nickname = nickname ?? s.nickname
  if (!s.events.includes('buddy_chosen')) s.events.push('buddy_chosen')
  return write(s)
}

/** 부화 전까지는 알을 바꿀 수 있다 — 첫 선택을 무겁게 만들지 않는다. */
export function canChangeBuddy() {
  return levelOf(read()).level < 1
}

export function changeBuddy(buddyId) {
  const s = read()
  if (levelOf(s).level >= 1) return s   // 이미 깨어난 뒤에는 못 바꾼다
  s.buddyId = buddyId
  return write(s)
}

export const levelOf = (s = read()) => levelFromExp(expFrom(s.totals))

/** 아이가 형태를 골라 입는다. 언제든 되돌릴 수 있다. */
export function wearStage(stageId) {
  const s = read()
  s.buddyStage = stageId
  return write(s)
}

// ── 허브의 빨간 점 ──────────────────────────────────────────
//
// 아이는 글자를 못 읽는다. "확인하러 가야 할 게 생겼다"를 알리는 수단이 점 하나다.
// 그래서 **"안 본 것"의 정의를 한 곳에 둔다** — 레벨이 올랐거나 배지가 늘었으면 소식이다.
//
// seen이 null인 저장본(이 기능 전에 놀던 아이)은 **지금까지 쌓인 걸 소식으로 친다.**
// 반대로 하면 처음 딴 배지들을 영영 못 보고 넘어간다.

export function buddyNews(s = read()) {
  const level = levelOf(s).level
  const badges = s.badges.length
  if (!s.seen) return level > 0 || badges > 0
  return level > (s.seen.level ?? 0) || badges > (s.seen.badges ?? 0)
}

/** /buddy에 들어가면 부른다 — 여기까지는 봤다. */
export function markBuddySeen() {
  const s = read()
  s.seen = { level: levelOf(s).level, badges: s.badges.length }
  return write(s)
}

export function setNickname(name) {
  const s = read()
  s.nickname = name
  return write(s)
}

/**
 * 게임 한 판이 끝났을 때 부르는 **유일한 입구.**
 *
 * 운동량을 더하고, 레벨이 올랐는지 보고, 새 배지를 준다.
 * 화면은 돌려받은 것만 보고 축하 연출을 띄우면 된다.
 *
 * @param {object} r
 * @param {string} r.gameId
 * @param {object} r.exercise  { active_sec, jumps, squats, side_steps, pose_holds }
 * @returns {{leveledUp:boolean, from:number, to:number, newBadges:string[], unlockedStage:object|null}}
 */
export function recordSession({ gameId, exercise = {}, now = new Date() } = {}) {
  const s = read()
  const before = levelOf(s).level

  addInto(s.totals, exercise)

  const day = localDay(now)
  if (!s.days.includes(day)) s.days.push(day)
  if (gameId && !s.games.includes(gameId)) s.games.push(gameId)

  // 같은 것을 세 군데(전체·날짜별·게임별)에 더한다.
  // 화면마다 필요한 축이 다른데, 판이 끝난 이 순간에만 셋을 다 알 수 있다.
  // 나중에 누적에서 역산할 방법이 없어서 여기서 갈라 둔다.
  addInto(s.daily[day]  ??= {}, exercise)
  if (gameId) {
    const g = s.byGame[gameId] ??= {}
    addInto(g, exercise)
    g.lastAt = now.toISOString()   // 부모 화면의 "마지막으로 논 날"
  }

  const after = levelOf(s).level
  // 부화는 레벨 1에서 딱 한 번
  if (after >= 1 && !s.events.includes('hatch')) s.events.push('hatch')

  // 배지는 **운동량을 더한 뒤에** 평가한다. 먼저 보면 방금 한 판이 안 세어진다.
  const earned = newlyEarned(BADGES, s, s.badges, now)
  s.badges.push(...earned)

  write(s)
  return {
    leveledUp: after > before,
    from: before,
    to: after,
    newBadges: earned,
    // 형태 해금은 화면이 registry에 물어본다 — 여기서는 레벨만 알려준다
    unlockedStage: after > before ? after : null,
  }
}

/** 운동이 아닌 사건(첫 변신 등)을 기록한다. 배지 조건 `event`가 이걸 본다. */
export function recordEvent(name, now = new Date()) {
  const s = read()
  if (s.events.includes(name)) return { newBadges: [] }
  s.events.push(name)
  const earned = newlyEarned(BADGES, s, s.badges, now)
  s.badges.push(...earned)
  write(s)
  return { newBadges: earned }
}

// 개발용 — 콘솔에서 첫 방문 상태로 되돌린다
export function resetProgress() {
  try { localStorage.removeItem(KEY) } catch { /* 무시 */ }
}
if (typeof window !== 'undefined') window.pzResetProgress = resetProgress
