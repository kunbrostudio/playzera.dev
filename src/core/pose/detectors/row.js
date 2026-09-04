// 로우(노 젓기) — 오디세이 런(프로토타입)이 쓸 새 동작. ★
//
// ── 왜 새 파일인가 ─────────────────────────────────────────────
//
// `moves.js`의 넷(점프·앉기·좌우·만세)은 여러 게임이 같이 쓰는 "기본
// 동작"이고, 그 파일 자체가 "네 가지"라고 스스로 이름 붙였다. 로우는 지금
// 오디세이 런 하나만 쓰는 동작이라 거기 다섯 번째로 끼워 넣는 대신 자기
// 파일을 갖는다 — `balance.js`·`highKnees.js`가 이미 그렇게 한다.
//
// ── 왜 팔 "간격"으로 재나 ────────────────────────────────────
//
// 실제 노 젓기는 **몸 앞뒤(카메라를 향한 방향)**로 손을 뻗었다 당기는
// 동작이다. 그런데 이 앱의 카메라는 정면 하나뿐이고, 다른 모든 감지기가
// z(깊이) 좌표를 안 쓴다 — MediaPipe의 z는 노이즈가 커서 아무도 믿지
// 않는다(`moves.js`·`balance.js` 전부 x·y만 본다). 그래서 앞뒤 동작을
// **좌우로 벌렸다 오므리는 동작**으로 바꿔 가르친다 — 양손을 몸 앞에
// 모았다가(뻗기) 팔꿈치를 뒤로 당기며 양옆으로 벌리면(당기기), 카메라
// 정면에서도 손목-어깨중심 거리가 뚜렷하게 늘었다 줄었다 한다. 튜토리얼
// 그림이 "양팔을 앞으로 모았다가 옆으로 당기세요"를 보여주면 이 신호와
// 정확히 맞아떨어진다.
//
// ── 왜 어깨너비로 정규화하나 ──────────────────────────────────
//
// 다른 동작들은 발목-코 거리(`bodyHeight`)로 정규화하는데, 그러려면 발목이
// 보여야 한다. 로우는 상체 동작이라 카메라가 상반신만 잡아도(아이가 가까이
// 앉은 경우, `#/labcam`이 지적한 흔한 상황) 재는 데 지장이 없어야 한다 —
// 그래서 어깨너비 하나로 정규화한다.
//
// ── "돌아와야 1회"는 그대로 ────────────────────────────────────
//
// `moves.js`의 좌우 사이드스텝과 같은 히스테리시스 상태기계다. 벌어진
// 뒤(당기기) 다시 모여야(뻗기로 복귀) 1회로 센다 — 한쪽에 멈춰 있으면
// 카운트가 안 오른다.
//
// ── ⚠️ 실기기 확인 전 ────────────────────────────────────────
//
// 문턱값은 전부 눈대중이다. `#/lab`에 등록해 두었으니 실제로 팔을 저어
// 보면서 `pullOut`·`pullBack`을 조정한다 — `pose/tuning.js`의 값들도
// 처음엔 이렇게 시작해서 현장에서 다듬어졌다.
//
// 시간은 밖에서 받지 않는다 — 이 감지기는 시간 기반 판정(쿨다운·유예)이
// 없어서 필요가 없다. 그래도 다른 감지기와 인터페이스를 맞추려고
// `update(lms)`만 받는다(시간이 필요해지면 그때 추가한다).

import { LM } from '../gesture.js'

export const ROW = 'row'

const seen = p => p && (p.visibility ?? 1) >= 0.5

export const ROW_TUNING = {
  pullOut: 1.15,      // 손목-어깨중심 거리가 어깨너비의 이 배 이상이면 "당기기"
  pullHysteresis: 0.5, // 되돌아올 때는 이보다 낮은 문턱(pullOut - 이 값)
  armBand: 0.04,       // 손목이 어깨보다 이 이상 위면(팔 들기) 로우로 안 본다 — 만세와 헷갈리지 않게
  minShoulderW: 0.04,  // 너무 멀거나 옆모습이면(어깨너비가 작으면) 판정하지 않는다
}

export class RowDetector {
  constructor(opts = {}) {
    this.cfg = { ...ROW_TUNING, ...opts }
    this.count = 0
    this._pulled = false   // 지금 벌어진 상태인가
    this.fired = []
  }

  /**
   * 한 프레임.
   * @param {Array} lms 랜드마크 (거울 좌표)
   * @returns {string[]} 이번 프레임에 완성된 동작(`[ROW]` 또는 `[]`)
   */
  update(lms) {
    this.fired = []
    if (!lms) return this.fired

    const ls = lms[LM.L_SHOULDER], rs = lms[LM.R_SHOULDER]
    const lw = lms[LM.L_WRIST], rw = lms[LM.R_WRIST]
    if (![ls, rs, lw, rw].every(seen)) return this.fired

    const shoulderW = Math.abs(rs.x - ls.x)
    if (shoulderW < this.cfg.minShoulderW) return this.fired

    // 만세와 겹치지 않게 — 손목이 어깨보다 확실히 위면(팔을 든 것) 로우로 안 본다.
    // 화면 좌표라 y가 작을수록 위다.
    const shoulderY = (ls.y + rs.y) / 2
    if (lw.y < shoulderY - this.cfg.armBand || rw.y < shoulderY - this.cfg.armBand) return this.fired

    const cx = (ls.x + rs.x) / 2
    const spread = (Math.abs(lw.x - cx) + Math.abs(rw.x - cx)) / 2 / shoulderW

    const out = this.cfg.pullOut
    const back = this.cfg.pullOut - this.cfg.pullHysteresis

    if (!this._pulled && spread > out) {
      this._pulled = true
    } else if (this._pulled && spread < back) {
      this._pulled = false
      this.count++
      this.fired.push(ROW)
    }

    return this.fired
  }

  /** 운동 사전(`progress/exercises.js`)에 연결할 때 쓸 스냅샷. */
  snapshot() {
    return { rows: this.count }
  }
}
