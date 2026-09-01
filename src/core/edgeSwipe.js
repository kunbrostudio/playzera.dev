// 끝에서 무장(arm) → 당기면(pull) 확정 — 손 스와이프를 페이지 끝으로 좁힌다.
//
// ── 왜 만들었나 ★ ────────────────────────────────────────────
//
// 예전 `swipeGate.js`는 레일 **전체 폭**에서 손이 빠르게만 움직이면 방향을
// 냈다. 카드를 보려고 손을 옮기는 것과 넘기려는 것을 속도로는 못 가른다 —
// ken이 "손이 좌우 움직일 때 계속 움직여서 의도와 다르게 넘어간다"고 했다.
//
// 그래서 판정 자리를 **양 끝(피크 카드)**으로 좁혔다. 가운데서 카드를 찾아
// 손을 옮기는 동작은 애초에 끝에 안 닿으니 걸릴 일이 없다. 끝에 닿으면
// "무장"되고, 그 방향으로 당겨야만(반대로 물러나면 취소) 확정된다 — 화살표
// 힌트가 "이렇게 움직이면 된다"를 몸으로 보여준다.
//
// 문턱 거리는 짧게 잡았다(`pullFrac` 기본 3.5%) — 예전(14%)보다 훨씬 작다.
// 이미 "끝에 닿아야 한다"가 의도를 걸러주므로, 확정까지는 조금만 당겨도
// 반응해야 손맛이 산다.

export class EdgeSwipeGate {
  /**
   * @param {number} pullFrac   무장한 자리에서 이만큼(화면 폭 비율) 당기면 확정
   * @param {number} cancelFrac 반대로(무장 방향과 반대로) 이만큼 물러나면 무장 해제
   * @param {number} timeoutMs  무장한 채 이 시간이 지나면 저절로 풀린다(안전장치)
   */
  constructor({ pullFrac = 0.035, cancelFrac = 0.05, timeoutMs = 3000 } = {}) {
    this.pullFrac = pullFrac
    this.cancelFrac = cancelFrac
    this.timeoutMs = timeoutMs
    this.armedSide = null   // 'left' | 'right' | null
    this.anchorX = 0
    this.armedAt = 0
  }

  /** 손이 지금 'left'|'right' 피크 위에 있으면 부른다. 이미 그 방향이면 아무 일도 안 한다. */
  enterZone(side, x, now) {
    if (this.armedSide === side) return
    this.armedSide = side
    this.anchorX = x
    this.armedAt = now
  }

  /** 손을 내렸거나 화면을 벗어났을 때 — 무장을 조용히 지운다(취소 이벤트 없이). */
  reset() {
    this.armedSide = null
  }

  /**
   * 한 프레임. 무장 상태가 아니면 아무것도 안 하고 0을 낸다.
   * @returns {-1|0|1} 이번 프레임에 확정된 방향(-1 이전 · 1 다음). 없으면 0
   */
  update(x, screenW, now) {
    if (!this.armedSide || !screenW) return 0

    if (now - this.armedAt > this.timeoutMs) { this.armedSide = null; return 0 }

    const pullTh = screenW * this.pullFrac
    const cancelTh = screenW * this.cancelFrac
    const side = this.armedSide
    // 오른쪽 끝에서 무장 → 왼쪽으로 당기면 '다음'
    // 왼쪽 끝에서 무장 → 오른쪽으로 당기면 '이전'
    const pulled = side === 'right' ? this.anchorX - x : x - this.anchorX

    if (pulled >= pullTh) {
      this.armedSide = null
      return side === 'right' ? 1 : -1
    }
    if (pulled <= -cancelTh) { this.armedSide = null; return 0 }
    return 0
  }
}
