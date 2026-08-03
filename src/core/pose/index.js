// 똥 피하기용 얇은 레이어 — poseEngineCore + zoneDetector 조합.
//
// STEP 5(게임팩화)에서 게임팩이 detector를 직접 고르게 되면 사라진다.
// 그때까지는 `poseEngine.init(video, { onZoneChange, onPoseUpdate })` 한 줄로 쓴다.

import { poseEngineCore } from './poseEngine.js'
import { createZoneDetector } from './detectors/zoneDetector.js'

class PoseEngine {
  constructor() {
    this.currentZone = 1
    this.isRunning   = false
    this._detector   = null
    this._unsub      = null
    this._detach     = null
    this._acquired   = false
  }

  async init(videoElement, callbacks = {}) {
    const onPoseUpdate = callbacks.onPoseUpdate ?? null

    // zoneDetector 생성: zone 변경 시 currentZone 동기화 + 외부 콜백 호출
    this._detector = createZoneDetector({
      onZoneChange: (zone) => {
        this.currentZone = zone
        callbacks.onZoneChange?.(zone)
      },
    })

    this._unsub = poseEngineCore.onLandmarks((landmarks) => {
      this._detector.update(landmarks)

      // 골반이 안 잡히는 프레임에도 콜백은 부른다.
      // PIP 오버레이가 이걸로 그리는데, 여기서 걸러버리면 몸이 프레임을 벗어났을 때
      // 화면이 갱신되지 않아 마지막 스켈레톤이 그대로 얼어붙는다.
      if (onPoseUpdate) {
        const lh = landmarks[23], rh = landmarks[24]
        const hipX = lh && rh ? (lh.x + rh.x) / 2 : null
        onPoseUpdate(landmarks, hipX)
      }
    })

    // 실패하면 그대로 던진다 — 호출부가 사용자에게 이유를 보여줘야 한다
    try {
      await poseEngineCore.acquire()
      this._acquired = true
    } catch (e) {
      this.destroy()
      throw e
    }
    // 허브의 손 포인터가 이미 카메라를 열어뒀다면 재시작 없이 같은 스트림을 빌린다
    this._detach = poseEngineCore.attach(videoElement)
    this.isRunning = poseEngineCore.isRunning()
    return this
  }

  destroy() {
    if (this._unsub)    { this._unsub();            this._unsub    = null }
    if (this._detector) { this._detector.destroy(); this._detector = null }
    this._detach?.(); this._detach = null
    // stop()이 아니라 release()다 — 허브가 아직 쓰고 있으면 카메라는 켜진 채 남는다
    if (this._acquired) { poseEngineCore.release(); this._acquired = false }
    this.isRunning   = false
    this.currentZone = 1
  }
}

export const poseEngine = new PoseEngine()
