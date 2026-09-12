// 오디세이 런 — **6판이 한 표로 이어지는 난이도 곡선.** ★
//
// ── 왜 자기 표를 갖나 ────────────────────────────────────────
//
// 엔진의 `CONFIG.levels`(`runner/config.js`)는 5판이고 쥬라기·2D 러너 셋이
// 그대로 쓴다. 여기에 6번째를 끼우면 `manifest.levels`가 없는 쥬라기 3D가
// 6판이 되어 버린다(회귀). 그래서 오디세이는 `buildCourse3d`에 `opts.levels`로
// 이 표를 통째로 주입한다(`course.js`가 그 훅을 연다).
//
// ── 속도는 스테이지가 바뀌어도 리셋되지 않는다 ★ ─────────────
//
// 절대 레벨 번호(0~5)로 인덱싱한다. Lv1 → Lv6로 **계속 빨라진다** —
// 스테이지 경계(Lv2→3, Lv4→5)에서도 곡선이 안 꺾인다.
//
//   speed:  1.00 < 1.15 < 1.32 < 1.48 < 1.64 < 1.85
//
// `approachSec`(장애물 예고 시간)는 속도가 붙는 만큼 **줄인다** — 화면은
// 빨라지는데 반응 여유는 그대로면 후반이 오히려 쉬워진다. `cycles`(한 판
// 안 장애물 세트 반복 수)는 후반부에 늘려 판을 길고 촘촘하게 만든다.
//
// 값의 출처: `CONFIG.levels`의 1.0~1.6 구간을 그대로 이어받고, 6번째만
// 새로 뒀다(1.85 — "매우 빠르게" 배율 없이 도달하는 최고 속도). 전부
// **실기기 미검증** — 아이가 실제로 달려 봐야 최종값이 나온다.

export const ODYSSEY_LEVELS = [
  { cycles: 1, speed: 1.00, approachSec: 3.2 },  // Lv1 — 키클롭스 섬 (첫 판, 넉넉)
  { cycles: 1, speed: 1.15, approachSec: 2.9 },  // Lv2 — 키클롭스 탈출
  { cycles: 2, speed: 1.32, approachSec: 2.6 },  // Lv3 — 세이렌의 바다
  { cycles: 2, speed: 1.48, approachSec: 2.4 },  // Lv4 — 포세이돈의 폭풍
  { cycles: 2, speed: 1.64, approachSec: 2.2 },  // Lv5 — 스킬라 & 카리브디스
  { cycles: 3, speed: 1.85, approachSec: 2.0 },  // Lv6 — 이타카 귀환 (마지막, 제일 빠름·제일 긺)
]

export const ODYSSEY_LEVEL_COUNT = ODYSSEY_LEVELS.length

/**
 * 절대 레벨(0~5) → 스테이지 인덱스(0~2).
 *
 *   Stage 0 (키클롭스 섬)   Lv1·Lv2   → 0, 1
 *   Stage 1 (포세이돈 바다) Lv3·Lv4   → 2, 3
 *   Stage 2 (이타카)        Lv5·Lv6   → 4, 5
 */
export const stageOf = level => (level < 2 ? 0 : level < 4 ? 1 : 2)

/** 이 레벨이 자기 스테이지의 **마지막 판**인가 (Finish Gate가 뜨는 판). */
export const isStageFinale = level => level === 1 || level === 3 || level === 5
