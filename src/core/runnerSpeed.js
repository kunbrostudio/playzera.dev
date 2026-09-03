// 러너 속도 설정 — 판을 시작하기 전에 고르는 배속. localStorage 하나. ★
//
// ── 왜 필요한가 ────────────────────────────────────────────────
//
// 레벨 1~5의 기본 속도(`runner/config.js`)는 3~5세 기준으로 잡혀 있다.
// 7세 이상·초등학생은 그보다 빠르게 해도 따라올 수 있고, 실제로 그런
// "인터랙션 웜업 달리기" 콘텐츠가 유튜브 등에서 바이럴 되고 있다
// (ken 요청, 9/3) — "3단계는 진짜 엄청 빠르게"가 목표다.
//
// ── 왜 새 숫자를 안 만드나 ────────────────────────────────────
//
// 레벨마다 더 빠른 버전을 따로 적을 수도 있었다. 그러면 다섯 줄이 열다섯
// 줄이 되고, 나중에 밸런스를 한 곳만 고치면 나머지가 어긋난다. 대신
// 기존 `speed` 값에 배율만 곱한다 — `course.js`가 장애물 간격(gap)을
// `speed`로 나누므로, 배율을 곱하면 화면이 흐르는 속도뿐 아니라 **장애물이
// 나오는 빈도**까지 같이 빨라진다. 딱 레벨이 하나 더 높은 것처럼 움직인다.
//
// **`approachSec`(반응 여유 시간, 초 단위)은 배율을 안 받는다.** config.js의
// 주석 그대로 "여유시간 최우선" — 배속을 올린다고 아이가 장애물을 알아챌
// 시간까지 줄이면 그건 빠른 게 아니라 못 보고 맞는 것이다. 배율은 오직
// `speed`에만 걸린다.
//
// ── 판정 창은 **배율만큼 같이 넓힌다** ──────────────────────────
//
// 판정 창(`runner3d/course3d.js`의 `atHit`)은 원래 `speed`에 반비례해
// 좁아진다(레벨이 올라갈수록 좁아지는 것과 같은 원리). 그런데 이 배율은
// "속도감"을 위한 것이지 반응 속도 시험이 아니다 — `buildCourse3d`가
// `hitWindow`를 이 배율만큼 같이 곱해서, 화면은 훨씬 빨리 흐르는데
// **맞혀야 하는 순간의 실제 여유(초)는 레벨 자체의 것과 똑같이** 남는다.
// 그래서 "매우 빠르게"를 크게 올려도 판정이 불가능해지지 않는다 — 첫
// 시도는 1.6배였는데 ken이 "너무 느리다, 진짜 정말 빠르게"라고 다시
// 요청해서(9/3) 이 보정을 만든 뒤에야 2.5배까지 과감히 올렸다.
//
// ── 실기기 검증 전이다 ────────────────────────────────────────
//
// 화면이 얼마나 빨리 흐르는지, 캐릭터 점프·숙이기 애니메이션(각각 0.75초·
// 0.55초, `character.js`)이 좁아진 간격 안에서 자연스러워 보이는지는 아직
// 실기기로 안 봤다. 너무 빠르면 이 파일의 `veryFast.mult`만 낮추면 된다 —
// 판정 창 보정이 있으니 **못 맞히는 문제**가 아니라 **어지러운 문제**일
// 것이다.

/**
 * @typedef {{id: string, label: string, mult: number}} SpeedTier
 */

/** @type {SpeedTier[]} */
export const SPEED_TIERS = [
  { id: 'normal',   label: '보통',        mult: 1 },
  { id: 'fast',     label: '빠르게',      mult: 1.3 },
  { id: 'veryFast', label: '매우 빠르게', mult: 2.5 },
]

const KEY = 'pz_runner_speed'
const DEFAULT_ID = 'normal'

/** 지금 고른 속도 단계의 id. 저장된 값이 없거나 목록에 없으면 '보통'. */
export function getRunnerSpeedId() {
  try {
    const id = localStorage.getItem(KEY)
    return SPEED_TIERS.some(t => t.id === id) ? id : DEFAULT_ID
  } catch {
    return DEFAULT_ID   // 시크릿 모드 등 localStorage가 막힌 환경 — 조용히 기본값
  }
}

/** 속도 단계를 고른다. 목록에 없는 id는 조용히 무시한다. */
export function setRunnerSpeedId(id) {
  if (!SPEED_TIERS.some(t => t.id === id)) return
  try { localStorage.setItem(KEY, id) } catch { /* 저장 안 돼도 이번 판은 메모리 값으로 돈다 */ }
}

/** 이 id의 배율. 안 주면 지금 저장된 값을 읽는다. */
export function runnerSpeedMultiplier(id = getRunnerSpeedId()) {
  return SPEED_TIERS.find(t => t.id === id)?.mult ?? 1
}

/** 이 id의 화면에 보여줄 이름. */
export function runnerSpeedLabel(id = getRunnerSpeedId()) {
  return SPEED_TIERS.find(t => t.id === id)?.label ?? SPEED_TIERS[0].label
}
