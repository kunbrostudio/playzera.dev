// 이 게임은 몸의 **어디까지** 보여야 하나.
//
// ── 왜 만들었나 ★ ───────────────────────────────────────────
//
// 지금 카메라 준비 화면은 게임을 가리지 않고 `isFullBodyVisible()` 하나로
// 통과를 정한다 — 코·어깨·엉덩이·무릎·**발목**이 전부 화면 안에 있어야 한다.
//
// 그런데 발목이 정말 필요한 게임은 둘뿐이다(제자리 달리기·한 발 서기).
// 나머지 여섯은 엉덩이·어깨·손목으로 판정하고 발목은 **크기를 재는 데만** 쓴다.
// 그런데도 발목을 요구하니 180cm 어른은 2.6m를 물러서야 통과된다.
// 실제로 그래서 못 놀았다(`docs/00`).
//
// ── 왜 두 종류로 나누나 ─────────────────────────────────────
//
// 감지기가 읽는 점은 성격이 둘이다.
//
//   move  — **판정에 직접 쓰는 점.** 이게 없으면 그 동작을 셀 수 없다.
//   scale — **몸 크기(`bodyHeight` = 코~발목)를 재는 점.** 문턱이 전부 몸 비율이라
//           필요하지, 동작 자체와는 상관이 없다.
//
// 이 구분이 중요한 이유는 `scale`은 **없앨 수 있는 요구**이기 때문이다.
// MediaPipe가 world landmarks(미터 좌표)를 주면 화면에 발목이 안 보여도
// 몸 크기를 알 수 있다. 그러면 요구 관절이 확 줄고, 그만큼 덜 물러서도 된다.
//
// **그게 오는지는 아직 안 재봤다** — `#/labcam`이 그걸 재는 자리다.
// 재보기 전에는 이 파일이 사실을 적어두는 표일 뿐이고, 아무도 아직 이걸로
// 통과를 정하지 않는다. 숫자가 나오면 그때 준비 화면이 이걸 쓴다.

import { LM } from './gesture.js'

const HIPS = [LM.L_HIP, LM.R_HIP]
const SHOULDERS = [LM.L_SHOULDER, LM.R_SHOULDER]
const WRISTS = [LM.L_WRIST, LM.R_WRIST]
const ANKLES = [LM.L_ANKLE, LM.R_ANKLE]
const KNEES = [LM.L_KNEE, LM.R_KNEE]

// 코~발목으로 몸 크기를 잰다 (`moves.js`·`highKnees.js`·`balance.js` 공통)
const BODY_SCALE = [LM.NOSE, ...ANKLES]

// manifest의 `detectors` 이름 → 그 감지기가 읽는 점.
// 감지기를 추가하면 여기 한 줄. 빠뜨리면 테스트가 잡는다.
export const DETECTOR_POINTS = {
  // 좌우 — 엉덩이 x 하나면 된다
  zone: { move: HIPS, scale: [] },
  lane: { move: HIPS, scale: BODY_SCALE },

  // 위아래 — 엉덩이 y가 얼마나 오르내렸나. 몸 크기로 나눈다
  jump: { move: HIPS, scale: BODY_SCALE },
  squat: { move: HIPS, scale: BODY_SCALE },
  duck: { move: HIPS, scale: BODY_SCALE },

  // 팔 — 손목이 어깨/코보다 위인가
  armsUp: { move: [...WRISTS, ...SHOULDERS, LM.NOSE], scale: BODY_SCALE },

  // 자세 채점 — 관절 각도라 상체 전체를 본다
  poseMatch: { move: [...SHOULDERS, ...WRISTS, ...HIPS, LM.NOSE], scale: [] },

  // 여기 둘만 다리가 **진짜로** 필요하다
  highKnees: { move: [...HIPS, ...KNEES, ...ANKLES], scale: BODY_SCALE },
  balance: { move: [...ANKLES, ...HIPS], scale: BODY_SCALE },

  // 손 좌표 충돌(풍선 팡팡·비눗방울 팡팡, `games/arcade2d/`) — 판정이
  // 정규화 화면 좌표(0~1)로 이미 스케일 무관이라 몸 크기를 잴 필요가
  // 없다. 요구 관절이 손목 둘뿐이라 — 이 프로젝트가 `#/labcam`으로
  // 계속 줄이려던 방향("전신 대신 그 게임이 진짜 쓰는 점")을 처음부터
  // 만족하는 게임이다.
  handTrack: { move: WRISTS, scale: [] },
}

const uniq = a => [...new Set(a)].sort((x, y) => x - y)

// 이 게임이 요구하는 점.
//
// `scale`을 뺄 수 있는지가 이 함수의 전부다 —
// world landmarks가 오면 `withScale: false`로 부르면 된다.
export function requiredPoints(detectors = [], { withScale = true } = {}) {
  const out = []
  for (const d of detectors) {
    const spec = DETECTOR_POINTS[d]
    if (!spec) continue          // 모르는 이름은 조용히 넘긴다 — 막는 건 테스트가 한다
    out.push(...spec.move)
    if (withScale) out.push(...spec.scale)
  }
  return uniq(out)
}

// 프레임 안에 있고 신뢰도가 충분한가. `isFullBodyVisible()`과 같은 잣대를 쓴다.
export const VISIBILITY_MIN = 0.5
export const FRAME_MARGIN = 0.02

export function pointVisible(p) {
  if (!p) return false
  if (typeof p.visibility === 'number' && p.visibility < VISIBILITY_MIN) return false
  return p.x >= -FRAME_MARGIN && p.x <= 1 + FRAME_MARGIN
      && p.y >= -FRAME_MARGIN && p.y <= 1 + FRAME_MARGIN
}

// 통과했나 · 못 통과했으면 **어디가** 안 보이나.
//
// "뒤로 물러나 주세요"는 위가 잘렸을 때도 아래가 잘렸을 때도 같은 말을 한다.
// 안 보이는 점의 y를 보면 **위인지 아래인지**를 말해줄 수 있다 —
// 머리가 잘렸으면 물러설 게 아니라 카메라를 올리거나 앉으면 된다.
export function checkPoints(lms, points) {
  if (!lms) return { ok: false, missing: [...points], side: null }
  const missing = points.filter(i => !pointVisible(lms[i]))
  if (!missing.length) return { ok: true, missing: [], side: null }

  // 안 보이는 점이 프레임 위쪽에 몰렸나 아래쪽에 몰렸나
  let up = 0, down = 0
  for (const i of missing) {
    const p = lms[i]
    if (!p) continue
    if (p.y < 0.5) up++; else down++
  }
  const side = up === down ? 'both' : (up > down ? 'top' : 'bottom')
  return { ok: false, missing, side }
}
