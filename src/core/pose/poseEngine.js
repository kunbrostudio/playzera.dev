// MediaPipe Pose 코어 — 스크립트 로드 · 카메라 · 랜드마크 콜백 공급
// 여러 detector가 onLandmarks()로 구독해서 각자 처리

const MEDIAPIPE_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe'

class PoseEngineCore {
  constructor() {
    this._pose      = null
    this._camera    = null
    this._running   = false
    this._callbacks = new Set()
  }

  // 랜드마크 구독. 반환값(함수)을 호출하면 구독 해제
  onLandmarks(callback) {
    this._callbacks.add(callback)
    return () => this._callbacks.delete(callback)
  }

  isRunning() { return this._running }

  async start(videoElement) {
    if (this._running) return

    try {
      await this._loadScripts()
    } catch (e) {
      console.warn('[poseEngine] 스크립트 로드 실패:', e.message)
      return
    }

    if (!window.Pose || !window.Camera) {
      console.warn('[poseEngine] MediaPipe 클래스 없음')
      return
    }

    this._pose = new window.Pose({
      locateFile: (file) => `${MEDIAPIPE_BASE}/pose/${file}`,
    })
    this._pose.setOptions({
      modelComplexity:        1,
      smoothLandmarks:        true,
      enableSegmentation:     false,
      selfieMode:             true,  // x좌표를 화면 좌표계로 반전
      minDetectionConfidence: 0.5,
      minTrackingConfidence:  0.5,
    })
    this._pose.onResults((r) => this._onResults(r))

    try {
      this._camera = new window.Camera(videoElement, {
        onFrame: async () => {
          if (this._pose) await this._pose.send({ image: videoElement })
        },
        width: 640, height: 480,
      })
      await this._camera.start()
      this._running = true
    } catch (e) {
      console.warn('[poseEngine] 카메라 시작 실패:', e.message)
    }
  }

  stop() {
    if (this._camera) { this._camera.stop(); this._camera = null }
    if (this._pose)   { this._pose.close();  this._pose   = null }
    this._running = false
  }

  _onResults(results) {
    if (!results.poseLandmarks) return
    for (const cb of this._callbacks) cb(results.poseLandmarks)
  }

  async _loadScripts() {
    const load = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src; s.crossOrigin = 'anonymous'
      s.onload  = resolve
      s.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`))
      document.head.appendChild(s)
    })
    await load(`${MEDIAPIPE_BASE}/pose/pose.js`)
    await load(`${MEDIAPIPE_BASE}/camera_utils/camera_utils.js`)
  }
}

export const poseEngineCore = new PoseEngineCore()
