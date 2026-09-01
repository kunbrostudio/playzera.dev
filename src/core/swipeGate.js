// 손 휙 젓기 판정 — dwell 없이 화면을 좌우로 넘긴다.
//
// ── 왜 만들었나 ★ ───────────────────────────────────────────
//
// 허브의 게임 목록 좌우 화살표가 카드 옆에 바짝 붙어 있고 폭도 좁아서(모바일
// 44px) 손 커서로 겨누기 힘들다는 지적이 있었다(180cm 성인 기준 테스트).
// 손가락 모양(펼침/주먹)으로 "탐색 모드"와 "선택 모드"를 나누는 안이 있었지만
// 그건 MediaPipe **Hands** 모델이 있어야 하는데, `pointer.js`는 성능 때문에
// 일부러 손목(포즈 모델)만 쓴다 — Hands까지 얹으면 프레임이 절반이 된다.
//
// 그래서 손가락 구분 없이, **손목이 얼마나 빨리 옆으로 움직였나**로만 판정한다.
//
// ── 왜 감지기(detector)가 아니라 게이트인가 ─────────────────────
//
// `moves.js`의 사이드스텝과 다르다. 그건 운동 지표라 **돌아와야 1회**고,
// 시간 제한 없이 히스테리시스만 본다. 이건 UI 조작이라 **돌아올 필요가 없다**
// (넘기고 나면 다음 카드를 보러 가야 하니 반대로 돌아오면 안 된다). 대신
// "카드를 찾아 천천히 이동하는 것"과 "휙 젓는 것"을 구분해야 하는데, 그 둘은
// **이동 거리가 아니라 짧은 시간 안의 속도**로 갈린다 — 그래서 창(window)
// 안에서만 거리를 잰다. 운동으로도 안 센다(`progress/exercises.js`에 없다).
//
// ── 왜 쿨다운 타이머만으로는 안 되나 ★ ───────────────────────
//
// 같은 방향으로 두 번 연속 저으려면 손이 원위치로 **돌아와야** 한다. 그런데
// 그 "돌아오는 동작" 자체가 반대 방향으로 빠르게 움직이는 큰 이동이라, 시간만
// 지나면 다시 판정하는 단순 쿨다운으로는 그 복귀 동작을 반대 스와이프로 잘못
// 읽는다(실제로 겪었다 — 오른쪽으로 두 번 이으려 했더니 두 번째가 "이전"으로
// 나갔다). 그래서 확정 후에는 시간이 아니라 **손이 실제로 잠깐 멈췄는지**를
// 본다 — 창(window) 안 움직임 폭이 문턱의 일부 아래로 떨어질 때까지는 계속
// "정리 중(settling)"으로 두고 어떤 방향도 내지 않는다.

export class SwipeGate {
  /**
   * @param {number} windowMs   이 시간 안의 이동만 본다 (너무 길면 천천히 겨누는
   *                            움직임도 걸린다, 너무 짧으면 진짜 스와이프도 놓친다)
   * @param {number} distFrac   화면 폭 대비 이 비율만큼 움직여야 스와이프다
   * @param {number} settleFrac 확정 뒤 "손이 멈췄다"로 볼 기준 — 문턱(distFrac)
   *                            대비 이 비율보다 창 안 움직임이 작아야 풀린다
   * @param {number} cooldownMs 확정 뒤 최소로 쉬는 시간 — 손이 멈추자마자(우연히
   *                            한 프레임만 조용해서) 바로 풀리는 걸 막는 바닥값
   */
  constructor({ windowMs = 350, distFrac = 0.14, settleFrac = 0.35, cooldownMs = 550 } = {}) {
    this.windowMs = windowMs
    this.distFrac = distFrac
    this.settleFrac = settleFrac
    this.cooldownMs = cooldownMs
    this.samples = []       // { t, x } — 최근 windowMs 안의 커서 x
    this.firedAt = -Infinity
    this.settling = false   // true면: 확정 직후, 손이 멈추기를 기다리는 중
  }

  /** 다른 영역으로 옮겨갔을 때 부른다. 그 전 움직임을 스와이프에 안 섞는다. */
  reset() {
    this.samples = []
    this.settling = false
  }

  /**
   * 한 프레임.
   * @param {number} t        지금 시각(ms) — 밖에서 받는다(테스트 가능하게)
   * @param {number} x        커서 x(px, 화면 좌표)
   * @param {number} screenW  화면 폭(px) — 문턱을 여기 비례해 잰다
   * @returns {-1|0|1} 이번 프레임에 확정된 방향(-1 이전 · 1 다음). 없으면 0
   */
  push(t, x, screenW) {
    this.samples.push({ t, x })
    while (this.samples.length && t - this.samples[0].t > this.windowMs) this.samples.shift()

    if (!screenW || this.samples.length < 2) return 0
    const th = screenW * this.distFrac

    if (this.settling) {
      // 최소 쉬는 시간은 무조건 지킨다 — 확정 직후 한 프레임만 조용해도
      // 곧바로 다음 판정을 켜면 반대 방향 복귀 동작 초입을 잡아챌 수 있다.
      if (t - this.firedAt < this.cooldownMs) return 0
      const xs = this.samples.map(s => s.x)
      const spread = Math.max(...xs) - Math.min(...xs)
      if (spread > th * this.settleFrac) return 0   // 아직 움직이는 중 — 계속 기다린다
      this.settling = false
      this.samples = [{ t, x }]                      // 여기부터 새로 잰다(복귀 동작 안 섞는다)
      return 0
    }

    const dx = x - this.samples[0].x
    if (Math.abs(dx) < th) return 0

    // 확정 — 다음 판정은 손이 멈춘 뒤에야 켠다.
    const dir = dx > 0 ? 1 : -1
    this.samples = []
    this.firedAt = t
    this.settling = true
    return dir
  }
}
