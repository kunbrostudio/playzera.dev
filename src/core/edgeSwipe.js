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
//
// ── 고정 anchor의 문제 · 롤링 윈도우로 교체(ken 실사용 보고) ★ ─────
//
// 처음엔 무장한 순간의 위치를 anchor로 고정하고, 거기서부터 잰 누적 거리로
// 판정했다. 그런데 "손을 끝으로 가져가기만 했는데 스와이프 동작을 하지
// 않았는데도 자동으로 넘어간다"는 보고가 왔다 — 시간 제한이 없다 보니
// 가만히 대고 있어도 손 떨림이 수 초에 걸쳐 조금씩 쌓여 문턱(3.5%)을 넘은
// 것이다. 무장 자체는 "끝에 닿아야 한다"로 의도를 잘 걸렀지만, 그다음
// "당겼다"의 판정이 고정점 기준이라 **시간과 무관하게** 누적되는 게 문제였다.
//
// 그래서 예전 swipeGate.js가 썼던 시간 창(window) 기법을 여기 다시 쓴다.
// anchor를 한 번 고정하지 않고, 최근 windowMs(400ms) 안의 표본 중 가장
// 오래된 것을 기준점으로 매 프레임 다시 잡는다. 가만히 있으면 기준점도
// 같이 흘러가므로 떨림이 아무리 오래 쌓여도 순간 이동 거리는 0에 가깝다.
// 실제로 손을 빠르게 당기는 동작만 (짧은 시간 안에 먼 거리) 문턱을 넘는다.
//
// ── 그래도 남은 문제 — 무장 직후의 관성·되튐 ★ ─────────────────
//
// 롤링 윈도우는 "가만히 있는데 쌓이는" 건 막지만, "무장하는 그 동작 자체의
// 관성"은 못 막는다. 특히 몸을 가로질러 반대쪽 끝까지 손을 뻗는 쪽(ken 보고 —
// 오른쪽은 멀쩡한데 왼쪽에서만 스와이프 없이 넘어간다)은 도착 직후에 손이
// 자기 관성으로 살짝 더 들어갔다가 되튀는 동작이 크다. 이 되튐은 몇백ms 안에
// 벌어지는 "짧은 시간에 먼 거리 이동"이라, 롤링 윈도우 혼자로는 진짜 당기기와
// 구별이 안 된다 — 위치만 보면 둘이 같은 모양이다.
//
// 그래서 무장 직후 `armGraceMs`(정착 유예) 동안은 매 프레임 기준점을 지금
// 자리로 계속 다시 잡는다("아직 안 멎었다"로 보고 판정을 안 연다) — 예전
// swipeGate.js의 "정리 중(settling)" 상태와 같은 발상이다. 유예가 끝나는
// 순간의 자리가 "정착한 자리"가 되고, 그 뒤로 움직인 것만 진짜 당기기로 잰다.
// 관성으로 인한 되튐은 대개 유예 동안 다 끝나므로, 그 이후엔 남는 게 거의
// 없어 문턱을 넘지 않는다.
//
// 값(200ms)은 node로 되튐을 흉내 낸 시뮬레이션으로 골랐다 — 150ms는 격렬한
// 되튐엔 부족했고 200ms에서는 순한 것도 격렬한 것도 다 걸리지 않으면서
// 진짜 당기기(250~300ms 안에 확정)는 그대로 통과했다. 그래도 이건 흉내 낸
// 숫자다 — **아이 손으로 실제 되튐 폭·시간이 얼마나 되는지는 실기기에서
// 확인이 안 됐다.** 더 심하면 여기 값을 올린다.

export class EdgeSwipeGate {
  /**
   * @param {number} pullFrac   최근 windowMs 동안 이만큼(화면 폭 비율) 당기면 확정
   * @param {number} cancelFrac 반대로(무장 방향과 반대로) 이만큼 물러나면 무장 해제
   * @param {number} timeoutMs  무장한 채 이 시간이 지나면 저절로 풀린다(안전장치)
   * @param {number} windowMs   "당겼다"를 재는 시간 창 — 이보다 오래된 표본은 버린다
   * @param {number} armGraceMs 무장 직후 이 시간 동안은 기준점을 계속 새로 잡는다(정착 유예)
   */
  constructor({ pullFrac = 0.035, cancelFrac = 0.05, timeoutMs = 3000, windowMs = 400, armGraceMs = 200 } = {}) {
    this.pullFrac = pullFrac
    this.cancelFrac = cancelFrac
    this.timeoutMs = timeoutMs
    this.windowMs = windowMs
    this.armGraceMs = armGraceMs
    this.armedSide = null   // 'left' | 'right' | null
    this.armedAt = 0
    this.samples = []       // [{x, t}] — 최근 windowMs 동안의 손 위치, 오래된 순
  }

  /** 손이 지금 'left'|'right' 피크 위에 있으면 부른다. 이미 그 방향이면 아무 일도 안 한다. */
  enterZone(side, x, now) {
    if (this.armedSide === side) return
    this.armedSide = side
    this.armedAt = now
    this.samples = [{ x, t: now }]
  }

  /** 손을 내렸거나 화면을 벗어났을 때 — 무장을 조용히 지운다(취소 이벤트 없이). */
  reset() {
    this.armedSide = null
    this.samples = []
  }

  /**
   * 한 프레임. 무장 상태가 아니면 아무것도 안 하고 0을 낸다.
   * @returns {-1|0|1} 이번 프레임에 확정된 방향(-1 이전 · 1 다음). 없으면 0
   */
  update(x, screenW, now) {
    if (!this.armedSide || !screenW) return 0

    if (now - this.armedAt > this.timeoutMs) { this.reset(); return 0 }

    // 정착 유예 — 무장 직후엔 판정을 열지 않고, 기준점을 지금 자리로 계속
    // 옮긴다. 도착 관성·되튐이 여기서 흡수된다.
    if (now - this.armedAt < this.armGraceMs) {
      this.samples = [{ x, t: now }]
      return 0
    }

    this.samples.push({ x, t: now })
    // 창보다 오래된 표본은 버리되, 창 시작점 하나는 항상 남겨 기준으로 삼는다.
    while (this.samples.length > 1 && now - this.samples[0].t > this.windowMs) {
      this.samples.shift()
    }

    const anchorX = this.samples[0].x
    const pullTh = screenW * this.pullFrac
    const cancelTh = screenW * this.cancelFrac
    const side = this.armedSide
    // 오른쪽 끝에서 무장 → 왼쪽으로 당기면 '다음'
    // 왼쪽 끝에서 무장 → 오른쪽으로 당기면 '이전'
    const pulled = side === 'right' ? anchorX - x : x - anchorX

    if (pulled >= pullTh) {
      this.reset()
      return side === 'right' ? 1 : -1
    }
    if (pulled <= -cancelTh) { this.reset(); return 0 }
    return 0
  }
}
