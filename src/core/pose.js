const MEDIAPIPE_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe'

export class PoseEngine {
  constructor() {
    this.pose = null
    this.camera = null
    this.currentZone = 1
    this.lastZone = 1
    this.onZoneChange = null
    this.onPoseUpdate = null
    this.isRunning = false
  }

  async loadScripts() {
    const load = (src) => new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) { resolve(); return }
      const s = document.createElement('script')
      s.src = src
      s.crossOrigin = 'anonymous'
      s.onload = resolve
      s.onerror = () => reject(new Error(`스크립트 로드 실패: ${src}`))
      document.head.appendChild(s)
    })
    await load(`${MEDIAPIPE_BASE}/pose/pose.js`)
    await load(`${MEDIAPIPE_BASE}/camera_utils/camera_utils.js`)
  }

  async init(videoElement, callbacks = {}) {
    this.onZoneChange = callbacks.onZoneChange ?? null
    this.onPoseUpdate = callbacks.onPoseUpdate ?? null

    try {
      await this.loadScripts()
    } catch (e) {
      console.warn('[pose] 스크립트 로드 실패:', e.message)
      return
    }

    if (!window.Pose || !window.Camera) {
      console.warn('[pose] MediaPipe 클래스 없음')
      return
    }

    this.pose = new window.Pose({
      locateFile: (file) => `${MEDIAPIPE_BASE}/pose/${file}`,
    })

    this.pose.setOptions({
      modelComplexity: 1,
      smoothLandmarks: true,
      enableSegmentation: false,
      selfieMode: true,     // x 좌표를 화면 좌표계로 반전 (좌우 보정)
      minDetectionConfidence: 0.5,
      minTrackingConfidence: 0.5,
    })

    this.pose.onResults((results) => this._onResults(results))

    try {
      this.camera = new window.Camera(videoElement, {
        onFrame: async () => {
          if (this.pose) await this.pose.send({ image: videoElement })
        },
        width: 640,
        height: 480,
      })
      await this.camera.start()
      this.isRunning = true
    } catch (e) {
      console.warn('[pose] 카메라 시작 실패:', e.message)
    }
  }

  _onResults(results) {
    if (!results.poseLandmarks) return

    const leftHip = results.poseLandmarks[23]   // LEFT_HIP
    const rightHip = results.poseLandmarks[24]  // RIGHT_HIP
    if (!leftHip || !rightHip) return

    // selfieMode:true 적용 → x는 이미 화면 좌표계 (0=화면 왼쪽, 1=화면 오른쪽)
    const hipX = (leftHip.x + rightHip.x) / 2
    const zone = this._calcZone(hipX)

    if (this.onPoseUpdate) this.onPoseUpdate(results.poseLandmarks, hipX)

    this.currentZone = zone
    if (zone !== this.lastZone) {
      this.lastZone = zone
      if (this.onZoneChange) this.onZoneChange(zone, hipX)
    }
  }

  // 화면 3등분: 0=왼쪽, 1=가운데, 2=오른쪽
  _calcZone(x) {
    if (x < 1 / 3) return 0
    if (x > 2 / 3) return 2
    return 1
  }

  getZone() {
    return this.currentZone
  }

  destroy() {
    if (this.camera) { this.camera.stop(); this.camera = null }
    if (this.pose) { this.pose.close(); this.pose = null }
    this.isRunning = false
    this.currentZone = 1
    this.lastZone = 1
  }
}

export const poseEngine = new PoseEngine()
