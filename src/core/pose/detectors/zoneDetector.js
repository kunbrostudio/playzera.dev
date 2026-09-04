// 골반(#23/#24) X좌표로 **몇 번째 칸에 서 있나**를 정한다.
//
// ── 칸 수는 밖에서 온다 ──────────────────────────────────────
//
// 예전에는 3칸이 코드에 박혀 있었다(`x < 1/3`, `x > 2/3`). 5칸을 붙이면서
// 칸 수를 인자로 받게 했다 — 게임이 난이도에 따라 3칸과 5칸을 오간다.
//
// ── 칸 폭은 몸 크기 기준이다 (STEP 60) ★ ─────────────────────
//
// 원래는 카메라 프레임 전체 너비를 n등분했다(`w = 1/n`). 칸 폭이 **화면의
// 몫**이라 카메라에서 멀리 서 있을수록, 칸이 늘어날수록(5칸=20%) 옆으로
// 크게 움직여야 다음 칸으로 인정됐다. `moves.js`(러너의 좌우 감지)는 진작
// 이 문제를 몸 기준(bodyHeight 비율) 정규화로 풀어 뒀는데 여기엔 없었다.
//
// 같은 정규화를 쓴다. 칸 폭을 화면 비율이 아니라 **몸 키(코~발목) 대비
// 비율**로 재면, 카메라 거리·칸 수와 무관하게 "칸 하나 넘기는 데 필요한
// 실제 몸 움직임"이 일정해진다.
//
// **다만 이 감지기는 미러링이다.** `moves.js`는 "기울였다 돌아와야 1회"인
// 이벤트고, 여기는 "지금 서 있는 자리 = 지금 칸"인 절대 위치라서
// `laneThreshold`를 문턱이 아니라 **칸 폭**으로 쓴다 — 가운데 칸의 좌우
// 경계를 중앙에서 `laneThreshold`만큼 떨어진 자리에 두면, 중앙에서 한
// 칸 옆으로 넘어가는 데 필요한 이동량이 `moves.js`의 "작게 기울임" 판정과
// 정확히 같아진다. 그 바깥 칸들도 같은 폭으로 이어 붙인다.
//
// 너무 작게 잡히면(카메라에서 아주 멀리 서 있으면) 칸 폭이 손 떨림 수준까지
// 좁아져 이번엔 반대로 너무 예민해진다(ken 요청 — "아주 조금 이동했는데
// 예민하게 반응하는 건 비추"). `MIN_STEP`으로 바닥을 두고, 반대로 카메라에
// 아주 가까이 서서 칸 폭이 원래(화면 1/n) 너비를 넘어서는 일은 없게
// `maxStep`(1/n, 아래 `createZoneDetector` 안)으로 천장도 둔다 — **이
// 정규화는 항상 원래보다 같거나 쉬워야 하고, 원래보다 어려워지면 안 된다.**
//
// `laneThreshold`(0.12)는 러너에서 현장 검증된 값이지만 그건 "한 번 기울임"
// 문턱이고 여기는 "칸 하나의 폭"이라 의미가 다르다 — 실기기에서 아이가
// 직접 움직여 보고 다시 맞춰야 하는 값이다(다른 새 문턱들과 같은 처지, 아직
// 미검증). `LANE_STEP = laneThreshold × 2`로 잡은 건 가운데 칸의 절반 폭이
// `laneThreshold`가 되게 하기 위해서다(위 설명).
import { MOVES } from '../tuning.js'

const LANE_STEP = MOVES.laneThreshold * 2   // 칸 하나의 폭 — bodyHeight 비율
const MIN_STEP = 0.10                       // 몸이 작게 잡혀도 손 떨림에 안 넘어가는 바닥값
const NOSE = 0, L_ANKLE = 27, R_ANKLE = 28

// ── 왜 경계에 여유(히스테리시스)가 필요한가 ★ ────────────────
//
// 딱 잘라 나누면 **경계에 선 아이가 떨린다.** MediaPipe의 골반 좌표는 매 프레임
// 조금씩 흔들리는데, 그 흔들림이 경계를 넘나들면 칸이 초당 몇 번씩 바뀐다.
// 화면이 깜빡이는 것으로 끝나지 않는다 — `sideSteps`가 **가만히 서 있는 아이에게서
// 올라간다.** 운동 데이터가 오염되는 것이라 이 프로젝트에서는 그냥 버그가 아니다.
//
// 그래서 **나올 때는 더 멀리 가야 한다.** 지금 칸 안에 있으면 경계에서 `MARGIN`만큼
// 더 벗어나야 옆 칸으로 인정한다. 문턱이 들어갈 때와 나올 때 다른 것이다.
//
// `MARGIN`은 칸 너비의 비율이다. 절대값으로 두면 몸이 작게 잡혀 칸이 좁아질 때
// 아예 못 넘어간다 — 칸 폭이 몸 기준으로 바뀐 지금도 비율로 두는 이유가 같다.
const MARGIN = 0.18   // 칸 너비의 18%

export function createZoneDetector({ lanes = 3, onZoneChange } = {}) {
  const n = Math.max(2, Math.round(lanes))
  let currentZone = Math.floor(n / 2)   // 가운데에서 시작
  const maxStep = 1 / n   // 원래(화면 1/n) 너비 — 이보다 넓어지지 않는다

  /**
   * 지금 칸을 기준으로 다시 읽는다.
   *
   * 후보 칸을 먼저 구하고, 지금 칸과 다르면 **경계를 충분히 넘었는지** 본다.
   * 넘지 못했으면 지금 칸에 머문다.
   *
   * @param {number} x 골반 x (0..1)
   * @param {number} w 칸 폭 — bodyHeight로 정규화되어 매 프레임 조금씩 다르다
   */
  function _calcZone(x, w) {
    // 중앙(0.5)을 기준으로 좌우로 w씩 이어 붙인 칸들. n등분이던 원래 식(`x/w`)의
    // 중심을 0.5에 고정한 형태 — w=1/n일 때는 원래 식과 정확히 같다.
    const raw = Math.min(n - 1, Math.max(0, Math.floor((x - 0.5) / w + n / 2)))
    if (raw === currentZone) return currentZone

    // 지금 칸에서 나가려는 쪽 경계
    const edge = 0.5 + (raw > currentZone ? currentZone + 1 - n / 2 : currentZone - n / 2) * w
    const need = w * MARGIN
    const past = raw > currentZone ? x - edge : edge - x
    return past >= need ? raw : currentZone
  }

  return {
    lanes: n,
    update(landmarks) {
      const lh = landmarks[23]  // LEFT_HIP
      const rh = landmarks[24]  // RIGHT_HIP
      const nose = landmarks[NOSE]
      const lAnk = landmarks[L_ANKLE], rAnk = landmarks[R_ANKLE]
      if (!lh || !rh || !nose || !lAnk || !rAnk) return

      // 화면 밖 관절의 좌표를 MediaPipe가 지어내므로 흐린 프레임은 버린다.
      // 앉아 있는 사람에게서 걸음이 세어진 것이 이것 때문이었다.
      const seen = p => (p.visibility ?? 1) >= 0.5
      if (![lh, rh, nose, lAnk, rAnk].every(seen)) return

      const hipX = (lh.x + rh.x) / 2
      const ankleY = (lAnk.y + rAnk.y) / 2
      const bodyHeight = Math.abs(ankleY - nose.y)
      if (bodyHeight < MOVES.minBodyHeight) return   // 전신이 안 보이면 아무것도 하지 않는다

      const w = Math.min(maxStep, Math.max(MIN_STEP, LANE_STEP * bodyHeight))
      const zone = _calcZone(hipX, w)

      if (zone !== currentZone) {
        currentZone = zone
        onZoneChange?.(zone, hipX)
      }
    },
    getCurrentZone() { return currentZone },
    destroy()        { currentZone = Math.floor(n / 2) },
  }
}
