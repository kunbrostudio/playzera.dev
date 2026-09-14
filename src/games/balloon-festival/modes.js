// 풍선 팡팡 — Play Mode(같이 하는 인원 수) 설정의 정본 ★ (STEP 104)
//
// Multiplayer/Family Co-op을 향후 붙이기 위한 1차 기반 작업이다.
// **SOLO는 지금까지 완성된 1인 플레이 그대로다**(quota 5/10/15) — 이
// 값을 바꾸면 회귀다.
//
// ★ STEP 105 갱신: DUO는 이제 **실제 2인 Shared Co-op**으로 돈다(플레이어
// 자리 2개·플레이어당 손 하나·공용 quota — `ui/playScreen.js`,
// `arcade2d/handTracker.js`의 `trackPlayers`, `core/pose/playerSlots.js`).
// GROUP은 `available: false`(준비 중)라 고를 수 없다. 아래 STEP 104
// 설명 중 "DUO는 설정만"이라는 부분은 역사 기록으로 남긴다.
//
// 왜 설정만 준비하나: 실제 손 추적(`arcade2d/handTracker.js`)이 지금은
// "한 사람의 손 하나"만 골라 흘려주는 구조다(의도적 설계, 파일 상단
// 주석 참고 — MediaPipe Pose가 지어내는 손목 오탐을 없애려고 트래커
// 개수 자체를 하나로 줄였다). 여러 사람의 손을 동시에 구분해 게임에
// 넣으려면 `core/pose/personLock.js`(현재 "여럿 중 한 명만 고정" 구조)
// 부터 다시 짜야 한다 — 이번 STEP의 감사(Audit) 결과, `docs/04`
// STEP 104 참고. 그래서 지금 DUO/GROUP을 고르면 목표 개수만 커질 뿐,
// 실제로는 여전히 그 사람 한 명이 더 큰 목표를 채우는 것과 같다 —
// gameplay 판정을 미리 다인용으로 지어내지 않는다(요청 7번).
//
// **숫자를 게임 코드 여기저기 흩뿌리지 않는다**(요청 2번) — quota는
// 오직 이 파일에만 있다. `BalloonFestivalRun` 생성자가 이미
// `part1Quotas`/`part2Quotas`를 옵션으로 받으므로(`game.js`), 화면
// (`ui/playScreen.js`)이 고른 모드의 배열을 그대로 넘기기만 하면 된다
// — `game.js`의 판정 로직(quota만큼 스폰 → 다 처리하면 클리어)은
// 숫자가 몇이든 그대로 동작한다(레벨 수=배열 길이=3은 모든 모드가 같다).

/**
 * @typedef {object} PlayMode
 * @property {string} id
 * @property {string} label 팝업/버튼에 뜨는 이름
 * @property {string} sublabel 인원 보조 표시 ("1명"·"2명"·"3명 이상")
 * @property {string} icon 이모지 아이콘(버튼 장식용)
 * @property {number|string} players 실제 인원(오디오/향후 표시용, 지금은 안 씀) — GROUP은 "3+"
 * @property {number[]} part1Quotas 1부(Catch) 레벨별 목표 — 항상 길이 3
 * @property {number[]} part2Quotas 2부(Pop) 레벨별 목표 — 항상 길이 3
 */

/** @type {Record<string, PlayMode>} */
export const PLAY_MODES = {
  solo: {
    id: 'solo',
    label: '혼자 하기',
    sublabel: '1명',
    icon: '👤',
    players: 1,
    available: true,
    // ★ SOLO 회귀 기준선 — game.js의 PART1_LEVEL_QUOTAS/PART2_LEVEL_QUOTAS와
    // 반드시 같은 값이어야 한다(test/balloonModes.test.js가 이 동등성을
    // 직접 검사한다). 여기서 숫자를 따로 바꾸면 "설정에서만 SOLO가
    // 달라지는" 조용한 회귀가 생긴다.
    part1Quotas: [5, 10, 15],
    part2Quotas: [5, 10, 15],
  },
  duo: {
    id: 'duo',
    label: '둘이 하기',
    sublabel: '2명',
    icon: '👥',
    players: 2,
    available: true,
    // ★ (STEP 106) Family Co-op의 첫 버전임을 팝업 카드에 작게만 알린다 —
    // 너무 강조하지 않는다(요청 4번). 옵션 색 자체는 SOLO와 같은 베이스.
    betaBadge: 'BETA',
    // 1인 대비 2배가 아니라 요청값 그대로(10/20/30) — "가족이 같이"를
    // 감안한 어림값이고, 실기기 다인 입력 검증 후 조정 대상이다.
    part1Quotas: [10, 20, 30],
    part2Quotas: [10, 20, 30],
  },
  group: {
    id: 'group',
    label: '함께 하기',
    sublabel: '3명 이상',
    icon: '👨‍👩‍👧‍👦',
    players: '3+',
    // ★ (STEP 105) 아직 못 고른다 — PoseLandmarker가 `numPoses: 2`라 세 번째
    // 사람은 애초에 후보로 안 나온다. 되는 척 표시하면 안 된다(요청 2번).
    available: false,
    badge: '준비 중',
    // ★ 5배가 아니라 3배(요청 2번 — "3인 이상이라고 5배로 만들지 않는다").
    part1Quotas: [15, 30, 45],
    part2Quotas: [15, 30, 45],
  },
}

/** 순서 있는 목록 — 팝업이 이 순서(혼자→둘이→함께)로 그린다. */
export const PLAY_MODE_LIST = [PLAY_MODES.solo, PLAY_MODES.duo, PLAY_MODES.group]

export const DEFAULT_PLAY_MODE = 'solo'

/** 모르는 id가 와도 SOLO로 떨어진다 — 화면이 잘못된 문자열을 들고 있어도 안전하다. */
export function getPlayMode(id) {
  return PLAY_MODES[id] ?? PLAY_MODES[DEFAULT_PLAY_MODE]
}

/**
 * 실제로 플레이할 수 있는 모드 — 준비 중(`available: false`)이면 SOLO로
 * 떨어진다. 화면·게임은 이걸 쓴다: 팝업을 우회해 'group'이 넘어와도
 * 다인 3명 이상 gameplay로 들어가지 않는다(STEP 105).
 */
export function getPlayableMode(id) {
  const m = getPlayMode(id)
  return m.available ? m : PLAY_MODES[DEFAULT_PLAY_MODE]
}
