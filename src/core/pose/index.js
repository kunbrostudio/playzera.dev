// 호환성 레이어 — 기존 pose.js와 동일한 인터페이스를 제공
// poseEngineCore + zoneDetector를 조합해 기존 사용처 코드 수정 없이 작동

import { poseEngineCore } from './poseEngine.js'
import { createZoneDetector } from './detectors/zoneDetector.js'

class PoseEngine {
  constructor() {
    this.currentZone = 1
    this.isRunning   = false
    this._detector   = null
    this._unsub      = null
    this._onPoseUpdate = null
  }

  async init(videoElement, callbacks = {}) {
    this._onPoseUpdate = callbacks.onPoseUpdate ?? null

    // zoneDetector 생성: zone 변경 시 currentZone 동기화 + 외부 콜백 호출
    this._detector = createZoneDetector({
      onZoneChange: (zone) => {
        this.currentZone = zone
        callbacks.onZoneChange?.(zone)
      },
    })

    // 랜드마크 구독
    this._unsub = poseEngineCore.onLandmarks((landmarks) => {
      this._detector.update(landmarks)

      if (this._onPoseUpdate) {
        const lh = landmarks[23], rh = landmarks[24]
        if (lh && rh) this._onPoseUpdate(landmarks, (lh.x + rh.x) / 2)
      }
    })

    await poseEngineCore.start(videoElement)
    this.isRunning = poseEngineCore.isRunning()
    return this
  }

  destroy() {
    if (this._unsub)     { this._unsub();            this._unsub     = null }
    if (this._detector)  { this._detector.destroy(); this._detector  = null }
    poseEngineCore.stop()
    this.isRunning   = false
    this.currentZone = 1
  }
}

// 기존 pose.js와 동일한 싱글턴 export
export const poseEngine = new PoseEngine()
