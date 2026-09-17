import { LM } from '../../core/pose/gesture.js'

// 실기기 QA에서 이 객체만 조정하면 되도록 BODY QUIZ 전용 입력 문턱을 모은다.
// 공용 MOVES 튜닝값은 다른 게임도 쓰므로 이번 개선에서 변경하지 않는다.
export const BODY_QUIZ_INPUT_TUNING = Object.freeze({
  minVisibility: 0.5,
  minBodyHeight: 0.15,
  frameAspect: 16 / 9,
  baselineWindowSec: 3,
  anatomicalHipHeight: 0.45,
  descendHipDrop: 0.04,
  squatHipDrop: 0.10,
  // 공용 MoveDetector가 쓰던 0.14를 유지한다. 무릎 confidence가 흔들려도
  // 이만큼 충분히 내려가면 기존보다 나빠지지 않는 fallback 판정이다.
  strongSquatHipDrop: 0.14,
  returnHipDrop: 0.055,
  descendKneeAngle: 158,
  squatKneeAngle: 140,
  standKneeAngle: 158,
  minSquatHoldSec: 0.10,
  minRepSec: 0.45,
  trackingResetSec: 0.35,
  selectionTrackingGraceSec: 0.25,
  zoneStepScale: 0.24,
  zoneMinStep: 0.10,
  zoneMaxStep: 1 / 3,
  zoneMarginRatio: 0.18,
})

export const BODY_QUIZ_SQUAT_STAGE = Object.freeze({
  STANDING: 'standing',
  DESCENDING: 'descending',
  SQUAT: 'squat',
  ASCENDING: 'ascending',
})

const median = values => {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2
}

const midpoint = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
const visible = (point, minimum) => point && (point.visibility ?? 1) >= minimum

function angleAt(a, b, c, aspect) {
  const abx = (a.x - b.x) * aspect
  const aby = a.y - b.y
  const cbx = (c.x - b.x) * aspect
  const cby = c.y - b.y
  const denominator = Math.hypot(abx, aby) * Math.hypot(cbx, cby)
  if (!denominator) return null
  const cosine = Math.max(-1, Math.min(1, (abx * cbx + aby * cby) / denominator))
  return Math.acos(cosine) * 180 / Math.PI
}

/** 카운트와 zone 선택이 공유하는 전신 추적 품질 문턱. */
export function getBodyQuizPoseMetrics(landmarks, options = {}) {
  const cfg = { ...BODY_QUIZ_INPUT_TUNING, ...options }
  if (!landmarks) return null
  const required = [
    LM.NOSE,
    LM.L_HIP, LM.R_HIP,
    LM.L_ANKLE, LM.R_ANKLE,
  ].map(index => landmarks[index])
  if (!required.every(point => visible(point, cfg.minVisibility))) return null

  const nose = landmarks[LM.NOSE]
  const hip = midpoint(landmarks[LM.L_HIP], landmarks[LM.R_HIP])
  const ankle = midpoint(landmarks[LM.L_ANKLE], landmarks[LM.R_ANKLE])
  const bodyHeight = Math.abs(ankle.y - nose.y)
  if (bodyHeight < cfg.minBodyHeight) return null

  const leftKnee = landmarks[LM.L_KNEE]
  const rightKnee = landmarks[LM.R_KNEE]
  const kneesVisible = visible(leftKnee, cfg.minVisibility) && visible(rightKnee, cfg.minVisibility)
  const leftAngle = kneesVisible
    ? angleAt(landmarks[LM.L_HIP], leftKnee, landmarks[LM.L_ANKLE], cfg.frameAspect)
    : null
  const rightAngle = kneesVisible
    ? angleAt(landmarks[LM.R_HIP], rightKnee, landmarks[LM.R_ANKLE], cfg.frameAspect)
    : null

  return {
    hip,
    bodyHeight,
    hipHeight: (ankle.y - hip.y) / bodyHeight,
    kneeAngle: leftAngle == null || rightAngle == null ? null : (leftAngle + rightAngle) / 2,
  }
}

export function isBodyQuizPoseTrackable(landmarks, options = {}) {
  return getBodyQuizPoseMetrics(landmarks, options) !== null
}

/**
 * BODY QUIZ 전용 스쿼트 상태 머신.
 * 골반 하강량과 무릎 각도가 모두 깊어져야 squat에 들어가며, 완전히 일어났을 때
 * 한 번만 completed를 낸다. 서 있는 프레임만 기준선에 넣어 느린 스쿼트가 기준선을
 * 끌고 내려가는 문제를 막는다.
 */
export class BodyQuizSquatDetector {
  constructor(options = {}) {
    this.cfg = { ...BODY_QUIZ_INPUT_TUNING, ...options }
    this.reset()
  }

  reset() {
    this.stage = BODY_QUIZ_SQUAT_STAGE.STANDING
    this.count = 0
    this._standingSamples = []
    this._cycleStartedAt = null
    this._deepSince = null
    this._lastValidAt = null
  }

  _pushStandingSample(t, hipHeight) {
    this._standingSamples.push({ t, value: hipHeight })
    const cutoff = t - this.cfg.baselineWindowSec
    while (this._standingSamples.length && this._standingSamples[0].t < cutoff) {
      this._standingSamples.shift()
    }
  }

  _cancelCycle() {
    this.stage = BODY_QUIZ_SQUAT_STAGE.STANDING
    this._cycleStartedAt = null
    this._deepSince = null
  }

  update(landmarks, t) {
    const metrics = getBodyQuizPoseMetrics(landmarks, this.cfg)
    if (!metrics) {
      if (this._lastValidAt != null && t - this._lastValidAt >= this.cfg.trackingResetSec) {
        this._cancelCycle()
      }
      return { completed: false, tracking: false, stage: this.stage, metrics: null }
    }

    if (this._lastValidAt != null && t - this._lastValidAt >= this.cfg.trackingResetSec) {
      this._cancelCycle()
    }
    this._lastValidAt = t

    const standingEnough = metrics.kneeAngle == null
      || metrics.kneeAngle >= this.cfg.standKneeAngle
    if (this.stage === BODY_QUIZ_SQUAT_STAGE.STANDING && standingEnough) {
      this._pushStandingSample(t, metrics.hipHeight)
    }
    const rollingBase = this._standingSamples.length
      ? median(this._standingSamples.map(sample => sample.value))
      : this.cfg.anatomicalHipHeight
    const baseHipHeight = Math.max(rollingBase, this.cfg.anatomicalHipHeight)
    const hipDrop = baseHipHeight - metrics.hipHeight
    const deepEnough = hipDrop >= this.cfg.strongSquatHipDrop
      || (hipDrop >= this.cfg.squatHipDrop
        && metrics.kneeAngle != null
        && metrics.kneeAngle <= this.cfg.squatKneeAngle)
    const returned = hipDrop <= this.cfg.returnHipDrop && standingEnough
    let completed = false

    switch (this.stage) {
      case BODY_QUIZ_SQUAT_STAGE.STANDING:
        if (hipDrop >= this.cfg.descendHipDrop
          || (metrics.kneeAngle != null && metrics.kneeAngle < this.cfg.descendKneeAngle)) {
          this.stage = BODY_QUIZ_SQUAT_STAGE.DESCENDING
          this._cycleStartedAt = t
        }
        break
      case BODY_QUIZ_SQUAT_STAGE.DESCENDING:
        if (deepEnough) {
          if (this._deepSince == null) this._deepSince = t
          if (t - this._deepSince >= this.cfg.minSquatHoldSec) {
            this.stage = BODY_QUIZ_SQUAT_STAGE.SQUAT
          }
        } else {
          this._deepSince = null
          if (returned) this._cancelCycle()
        }
        break
      case BODY_QUIZ_SQUAT_STAGE.SQUAT:
        if (!deepEnough) this.stage = BODY_QUIZ_SQUAT_STAGE.ASCENDING
        break
      case BODY_QUIZ_SQUAT_STAGE.ASCENDING:
        if (deepEnough) {
          this.stage = BODY_QUIZ_SQUAT_STAGE.SQUAT
        } else if (returned) {
          const duration = this._cycleStartedAt == null ? 0 : t - this._cycleStartedAt
          if (duration >= this.cfg.minRepSec) {
            this.count += 1
            completed = true
          }
          this._cancelCycle()
          this._pushStandingSample(t, metrics.hipHeight)
        }
        break
    }

    return {
      completed,
      tracking: true,
      stage: this.stage,
      metrics: { ...metrics, hipDrop, baseHipHeight },
    }
  }
}

/**
 * 중앙 neutral zone을 포함한 BODY QUIZ 3-zone detector.
 * 몸 크기로 폭을 정규화하고, invalid frame은 이전 zone을 선택 입력으로 재사용하지
 * 않도록 tracking:false를 함께 반환한다.
 */
export function createBodyQuizZoneDetector(options = {}) {
  const cfg = { ...BODY_QUIZ_INPUT_TUNING, ...options }
  let currentZone = 1

  function calculateZone(x, step) {
    const raw = Math.min(2, Math.max(0, Math.floor((x - 0.5) / step + 1.5)))
    if (raw === currentZone) return currentZone
    const edge = 0.5 + (raw > currentZone ? currentZone - 0.5 : currentZone - 1.5) * step
    const past = raw > currentZone ? x - edge : edge - x
    return past >= step * cfg.zoneMarginRatio ? raw : currentZone
  }

  return {
    update(landmarks) {
      const metrics = getBodyQuizPoseMetrics(landmarks, cfg)
      if (!metrics) return { tracking: false, zone: currentZone }
      const step = Math.min(
        cfg.zoneMaxStep,
        Math.max(cfg.zoneMinStep, cfg.zoneStepScale * metrics.bodyHeight),
      )
      currentZone = calculateZone(metrics.hip.x, step)
      return { tracking: true, zone: currentZone, step, metrics }
    },
    getCurrentZone() { return currentZone },
    reset() { currentZone = 1 },
    destroy() { currentZone = 1 },
  }
}
