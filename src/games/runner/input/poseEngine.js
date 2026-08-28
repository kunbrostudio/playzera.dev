// 정본은 `src/core/pose/poseEngine.js`로 옮겼다 (STEP 4-0 — 라이브러리 통일).
//
// 이 파일은 웜업이 쓰던 클래스 API(`new PoseEngine(video, overlay)` · `init/start/stop/release`
// · `onFrame` · `available`)를 그대로 유지하기 위한 얇은 어댑터다.
// STEP 4-2에서 웜업이 core를 직접 참조하게 되면 사라진다.
//
// ⚠️ **좌표계가 바뀌었다.** core 엔진이 거울 좌표(`1 - x`)로 내보낸다.
// 그래서 `motionDetector`의 `1 - hip.x`와 여기 있던 스켈레톤 반전(`1 - p.x`)을 걷어냈다.
// 두 번 뒤집으면 좌우가 원래대로 돌아가 레인이 반대로 움직인다.
import { poseEngineCore, isFullBodyVisible } from '../../../core/pose/poseEngine.js'
import { createPipOverlay } from '../../../core/pose/pipOverlay.js'
import { LM } from '../../../core/pose/gesture.js'

export { LM, isFullBodyVisible }

export class PoseEngine {
  constructor(videoEl, overlayCanvas) {
    this.video = videoEl
    // 웜업은 캘리브레이션 기준으로 좌우를 재므로 3분할 라인이 없다 —
    // 고정된 선을 그리면 실제 판정 기준과 어긋나 거짓 안내가 된다.
    this.overlay = createPipOverlay(overlayCanvas, { zones: false })
    this.available = false   // 웹캠+모델 준비 완료 여부
    this.running = false
    this.onFrame = null      // (landmarks) => void
    this._unsub = null
    this._detach = null
    this._acquired = false
  }

  async init() {
    if (!this._unsub) {
      this._unsub = poseEngineCore.onLandmarks(lms => {
        if (!this.running) return
        this.onFrame?.(lms)
        this.overlay.draw(lms)
      })
    }
    // 허브의 손 포인터가 이미 열어뒀다면 재시작 없이 같은 스트림을 빌린다
    await poseEngineCore.acquire()
    this._acquired = true
    this._detach = poseEngineCore.attach(this.video)
    this.available = true
    this.running = true
  }

  start() {
    if (!this.available) return
    this.running = true
  }

  // 이 게임의 랜드마크 소비만 멈춘다. 공유 엔진은 그대로 둔다 —
  // 여기서 엔진을 멈추면 타이틀 화면의 손 포인터까지 같이 죽는다.
  stop() {
    this.running = false
    this.overlay.clear()
  }

  // 완전 해제 — 허브로 돌아갈 때(게임 destroy) 호출한다
  release() {
    this._unsub?.()
    this._unsub = null
    this._detach?.()
    this._detach = null
    // stop()이 아니라 release()다 — 허브가 아직 쓰고 있으면 카메라는 켜진 채 남는다
    if (this._acquired) { poseEngineCore.release(); this._acquired = false }
    this.overlay.destroy()
    this.available = false
    this.running = false
    this.onFrame = null
  }
}
