// 골반(#23/#24) X좌표로 **몇 번째 칸에 서 있나**를 정한다.
//
// ── 칸 수는 밖에서 온다 ──────────────────────────────────────
//
// 예전에는 3칸이 코드에 박혀 있었다(`x < 1/3`, `x > 2/3`). 5칸을 붙이면서
// 칸 수를 인자로 받게 했다 — 게임이 난이도에 따라 3칸과 5칸을 오간다.
//
// ── 왜 경계에 여유(히스테리시스)가 필요한가 ★ ────────────────
//
// 딱 잘라 나누면 **경계에 선 아이가 떨린다.** MediaPipe의 골반 좌표는 매 프레임
// 조금씩 흔들리는데, 그 흔들림이 경계를 넘나들면 칸이 초당 몇 번씩 바뀐다.
// 화면이 깜빡이는 것으로 끝나지 않는다 — `sideSteps`가 **가만히 서 있는 아이에게서
// 올라간다.** 운동 데이터가 오염되는 것이라 이 프로젝트에서는 그냥 버그가 아니다.
//
// 3칸일 때는 한 칸이 화면의 33%라 견뎠지만 5칸은 20%다. 흔들림 폭은 그대로인데
// 칸이 좁아지니 같은 코드가 다르게 동작한다.
//
// 그래서 **나올 때는 더 멀리 가야 한다.** 지금 칸 안에 있으면 경계에서 `MARGIN`만큼
// 더 벗어나야 옆 칸으로 인정한다. 문턱이 들어갈 때와 나올 때 다른 것이다.
//
// `MARGIN`은 칸 너비의 비율이다. 절대값으로 두면 3칸에서 넉넉하던 여유가
// 5칸에서 칸의 절반이 되어 아예 못 넘어간다.
const MARGIN = 0.18   // 칸 너비의 18%

export function createZoneDetector({ lanes = 3, onZoneChange } = {}) {
  const n = Math.max(2, Math.round(lanes))
  let currentZone = Math.floor(n / 2)   // 가운데에서 시작

  /**
   * 지금 칸을 기준으로 다시 읽는다.
   *
   * 후보 칸을 먼저 구하고, 지금 칸과 다르면 **경계를 충분히 넘었는지** 본다.
   * 넘지 못했으면 지금 칸에 머문다.
   */
  function _calcZone(x) {
    const w = 1 / n
    const raw = Math.min(n - 1, Math.max(0, Math.floor(x / w)))
    if (raw === currentZone) return currentZone

    // 지금 칸에서 나가려는 쪽 경계
    const edge = raw > currentZone
      ? (currentZone + 1) * w      // 오른쪽으로 나간다
      : currentZone * w            // 왼쪽으로 나간다
    const need = w * MARGIN
    const past = raw > currentZone ? x - edge : edge - x
    return past >= need ? raw : currentZone
  }

  return {
    lanes: n,
    update(landmarks) {
      const lh = landmarks[23]  // LEFT_HIP
      const rh = landmarks[24]  // RIGHT_HIP
      if (!lh || !rh) return

      // 화면 밖 관절의 좌표를 MediaPipe가 지어내므로 흐린 프레임은 버린다.
      // 앉아 있는 사람에게서 걸음이 세어진 것이 이것 때문이었다.
      if ((lh.visibility ?? 1) < 0.5 || (rh.visibility ?? 1) < 0.5) return

      const hipX = (lh.x + rh.x) / 2
      const zone = _calcZone(hipX)

      if (zone !== currentZone) {
        currentZone = zone
        onZoneChange?.(zone, hipX)
      }
    },
    getCurrentZone() { return currentZone },
    destroy()        { currentZone = Math.floor(n / 2) },
  }
}
