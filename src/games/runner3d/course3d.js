// 코스를 3D에 얹는다 — **규칙은 기존 것을 그대로 쓴다.**
//
// ── 복사하지 않는다 ★ ───────────────────────────────────────
//
// `runner/game/course.js`가 만드는 타임라인을 그대로 `import`한다. 레벨별 사이클,
// 큐브 6 → 허들 6 → 자세 3, 간격을 speed로 나누는 것까지 전부 거기 있다.
//
// 복사했다면 오늘 고친 밸런스를 다음에 두 번 고쳐야 한다. 그리고 두 게임의
// **운동량이 다른 뜻**을 갖게 된다 — 같은 레벨 5인데 판이 다르면 기록을 못 견준다.
//
// 여기서 새로 하는 일은 하나다. **시간을 거리로 바꾸는 것.**
//
//   z = -(hitTime - now) × speed × UNITS_PER_SPEED
//
// 2D 러너는 `approachSec` 전에 화면 위에 띄우고 p를 0→1로 밀었다. 3D는 그냥
// 제자리에 두면 된다 — 세계가 흐르니까. **거리가 곧 남은 시간이다.**

import { buildCourse } from '../runner/game/course.js'
import { UNITS_PER_SPEED } from './scene.js'
import { laneX } from './character.js'

/** 판정 창(유닛). 캐릭터 z=0을 기준으로 앞뒤 이만큼 안이면 "지금"이다. */
export const HIT_WINDOW = 2.2

/**
 * 이벤트를 3D가 쓰기 좋은 모양으로 바꾼다.
 *
 * `hitTime`은 그대로 둔다 — **판정의 정본은 시간이다.** z는 그걸 그려 보이는 값일 뿐이라
 * 매 프레임 다시 계산한다. z를 저장해 두고 빼 나가면 부동소수 오차가 쌓여
 * 레벨 끝에서 타이밍이 어긋난다.
 */
/**
 * @param {number} levelIdx
 * @param {number} [speedMult] 그대로 `buildCourse`에 넘긴다(`core/runnerSpeed.js`).
 */
export function buildCourse3d(levelIdx, speedMult = 1) {
  const { events, duration, approachSec, speed } = buildCourse(levelIdx, speedMult)
  return {
    speed, duration, approachSec,
    // ── 판정 창도 같은 배율로 넓힌다 ★ ──────────────────────────
    // `atHit`이 보는 실제 시간 폭은 `hitWindow / (speed × UNITS_PER_SPEED)`다.
    // `speed`에 이미 `speedMult`가 곱해져 있으니, 여기서 `hitWindow`도 같은
    // 배율로 곱하면 배율이 **분자·분모에서 서로 지워져 초 단위 폭이 그대로
    // 남는다** — "매우 빠르게"를 골라도 화면은 훨씬 빨리 흐르는데 정작
    // 맞혀야 하는 순간의 여유(초)는 레벨 자체의 것과 같다. 배속은 **속도감을
    // 위한 것**이지 손가락 반응 속도 시험이 아니다(ken 요청, 9/3 — "매우
    // 빠르게가 너무 느려" 뒤에 나온 요청이라, 배율을 크게 올려도 이 보정이
    // 없으면 판정이 사실상 불가능해진다).
    hitWindow: HIT_WINDOW * speedMult,
    // 얕은 복사를 쓴다. 원본을 고치면 기존 게임에 영향이 간다.
    events: events.map((e, i) => ({ ...e, id: i, done: false, lane: e.lane })),
    /** 지금 시각 기준으로 이 이벤트가 몇 유닛 앞인가. 음수면 뒤로 지나갔다. */
    zOf(e, now) { return -(e.hitTime - now) * speed * UNITS_PER_SPEED },
  }
}

/**
 * 화면에 낼 것 — **`approachSec` 전에 나타난다.**
 *
 * ── 왜 거리로 자르지 않나 ★ ─────────────────────────────────
 *
 * 처음엔 `far` 안이면 다 그렸다. 그러니 큐브 여러 개가 **같은 순간에 한꺼번에**
 * 시야에 들어왔고, 레인을 그때 정하니 셋이 전부 같은 칸을 막았다.
 * 아이는 한 번 비키면 그다음 둘은 그냥 지나갔다 — 세 번 중 한 번만 운동이 된 것이다.
 *
 * 2D 러너는 `approachSec` 전에 하나씩 띄운다. 같은 규칙을 쓴다.
 * 큐브 간격이 3.0초이고 예고가 3.2초라, **하나씩 차례로** 나타나고
 * 그 사이 아이는 이미 옆 칸으로 옮겨 가 있다.
 */
export function visibleEvents(course, now, far) {
  const out = []
  for (const e of course.events) {
    if (now < e.hitTime - course.approachSec) continue   // 아직 나타날 때가 아니다
    const z = course.zOf(e, now)
    if (z > 14 || z < -far) continue                     // 지나갔거나 안개 너머
    out.push({ e, z })
  }
  return out
}

/**
 * 이 이벤트를 지금 판정해야 하나.
 *
 * 시간으로 본다 — z로 보면 speed가 바뀔 때 창의 폭이 같이 변한다.
 *
 * @param {number} [window] 판정 창(유닛). 기본은 `HIT_WINDOW` — 안 주면 예전과
 *   같다. 배속을 곱한 코스는 `course.hitWindow`를 넘긴다(위 `buildCourse3d`).
 */
export const atHit = (e, now, speed, window = HIT_WINDOW) =>
  Math.abs(e.hitTime - now) * speed * UNITS_PER_SPEED <= window

/**
 * 큐브가 막는 레인을 **스폰 시점에** 정한다.
 *
 * 2D 러너의 판단을 그대로 옮긴다(`obstacles.js` 주석) — 미리 정해 두면
 * "이미 피해 있는데 엉뚱한 방향으로 가라"는 힌트가 뜬다. 화면에 나타나는 순간의
 * 캐릭터 자리를 막아야 **매번 실제로 피해야 하는** 장애물이 된다.
 */
export function assignCubeLane(e, charLane, lanes = 3, rnd = Math.random) {
  if (e.type !== 'cube' || e.lane !== null) return
  e.lane = charLane
  // ── 피할 곳도 **여기서 함께 정한다** ★ ──
  // 막힌 칸만 정하고 방향은 화면이 그때그때 계산하게 뒀더니, 가운데가 막혔을 때
  // 늘 오른쪽을 골랐다. 아이는 대개 가운데에 서 있으므로 **거의 매번 오른쪽**이
  // 나왔고, "오른쪽만 하는 게임"이 됐다.
  //
  // 빈 칸 중에서 뽑아 이벤트에 적어 둔다. 한 번 정하면 안 바뀌므로 팻말이
  // 도중에 반대쪽으로 뒤집히지도 않는다. 2D 러너도 같은 방식이다(`e.hintLane`).
  //
  // **한 칸 거리만 고른다.** charLane과 다르기만 하면 된다고 뒀더니(예: 3칸
  // 트랙에서 0칸이 막히면 1·2칸이 둘 다 후보), 가운데를 건너뛰고 반대쪽
  // 끝까지 두 칸을 한 번에 움직이는 회피가 가끔 나왔다 — 아이가 실제로
  // 몸으로 한 칸씩 옮겨 피하는 동작과 안 맞는다(ken 요청, 9/2).
  const free = []
  for (let i = 0; i < lanes; i++) if (Math.abs(i - charLane) === 1) free.push(i)
  e.hintLane = free.length ? free[Math.floor(rnd() * free.length)] : charLane
}

/** 이벤트 하나의 x 위치. 큐브만 레인을 갖고 나머지는 가운데다. */
/**
 * 트랙 **전체를 막는** 종류. 이것들은 레인을 안 쓴다.
 *
 * ── 왜 따로 두나 ★ ──────────────────────────────────────────
 *
 * 코스는 이것들에 `lane: 0`을 준다(`runner/game/course.js`). 2D에서는 그 값이
 * 안 쓰였는데, 3D에서 `laneX(0)`을 그대로 먹였더니 **왼쪽 칸에 놓였다** —
 * 숙이는 관문도 자세 팻말도 트랙 왼쪽에 서 있었다.
 *
 * 폭이 트랙을 덮는 물건은 **언제나 가운데**다. 레인을 쓰는 건 큐브뿐이다.
 */
const FULL_WIDTH = new Set(['hurdleLow', 'hurdleWide', 'poseSign', 'archGate'])

export const eventX = (e, lanes = 3) =>
  FULL_WIDTH.has(e.type) ? 0 : laneX(e.lane ?? Math.floor(lanes / 2), lanes)
