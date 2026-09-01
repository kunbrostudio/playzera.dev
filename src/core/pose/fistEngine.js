// 주먹(Fist) 인식 엔진 — MediaPipe GestureRecognizer 래퍼. `pointer.js` 전용 정본.
//
// ── 왜 poseEngineCore와 따로 두나 ★ ──────────────────────────
//
// 포즈는 게임 판정에도 쓰여 앱이 켜 있는 내내 필요하지만, 주먹 인식은 손 커서로
// 버튼을 확정할 때만 필요하다 — 게임 플레이 중에는 `pointer.js` 자체가 꺼진다
// (`handSession.js`의 `setPointerActive(false)`, 몸과 O/X로 조작하므로 커서가
// 방해된다). 포즈 엔진에 얹으면 게임 판정 경로까지 이 모델을 실어야 하므로
// 분리했다.
//
// ── 왜 GestureRecognizer인가 ──────────────────────────────────
//
// 손가락 마디 각도를 직접 계산하지 않아도 Open_Palm·Closed_Fist 등을 이미
// 분류해서 준다. `#/labhands`에서 실측 — 포즈 단독과 FPS 차이 없었고(22/22),
// 인식 점수도 0.90대로 안정적이었다.
//
// `poseEngineCore`와 같은 모양(acquire/release 참조 카운팅, onX 구독)으로 만들어
// 여러 화면이 동시에 켜도 모델을 한 번만 로드한다. 카메라 스트림은 새로 열지
// 않는다 — `poseEngineCore.acquire()`를 대신 불러 같은 스트림을 빌린다.

import { poseEngineCore, MP_VERSION } from './poseEngine.js'

const GESTURE_MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task'

// #/labhands 실측 — 정면에서 확실히 쥐면 0.85~0.95대가 나온다. 이 미만은
// "쥐는 중"이거나 다른 손 모양으로 본다.
export const FIST_SCORE_MIN = 0.6

// poseEngine.js의 추론용 video와 같은 이유 — 화면에 그려지지 않으면(display:none 등)
// 브라우저가 프레임 디코딩을 건너뛰어 매 프레임 같은 이미지만 보게 된다.
// 1px·거의 투명하게 두어 "그려지긴 하는" 상태로만 만든다.
function createHiddenVideo() {
  const v = document.createElement('video')
  v.muted = true
  v.playsInline = true
  v.setAttribute('playsinline', '')
  v.setAttribute('aria-hidden', 'true')
  v.style.cssText =
    'position:fixed;left:0;bottom:0;width:1px;height:1px;opacity:0.01;' +
    'pointer-events:none;z-index:-1;'
  document.body.appendChild(v)
  return v
}

class FistEngineCore {
  constructor() {
    this._recognizer = null
    this._video = null
    this._detach = null
    this._callbacks = new Set()
    this._refs = 0
    this._startPromise = null
    this._rafId = null
    this._lastVideoTime = -1
    this._running = false
    this._poseAcquired = false   // poseEngineCore.acquire()를 우리가 실제로 성공시켰는지
    // {isFist, score, gestureName, landmarks} — 구독 모양을 바꾸지 않으려 마지막 값도 남겨둔다.
    // landmarks(21점, 원본 좌표·거울 반전 안 함)는 `#/labhands` 같은 디버그 오버레이용이다 —
    // 판정 자체(isFist)는 안 쓴다.
    this.lastResult = { isFist: false, score: 0, gestureName: null, landmarks: null }
  }

  /** 프레임마다 {isFist, score, gestureName, landmarks}를 받는다. 반환값(함수)을 부르면 구독 해제 */
  onFist(callback) {
    this._callbacks.add(callback)
    return () => this._callbacks.delete(callback)
  }

  isRunning() { return this._running }

  async acquire() {
    this._refs++
    if (this._startPromise) return this._startPromise
    if (this._running) return

    this._startPromise = (async () => {
      await poseEngineCore.acquire()
      this._poseAcquired = true
      this._video = createHiddenVideo()
      this._detach = poseEngineCore.attach(this._video)
      await this._createRecognizer()
      this._running = true
      this._loop()
    })()

    try {
      await this._startPromise
    } catch (e) {
      console.warn('[fistEngine] 시작 실패:', e?.name, e?.message)
      this._refs = Math.max(0, this._refs - 1)
      this._teardown()
      throw e
    } finally {
      this._startPromise = null
    }
  }

  release() {
    this._refs = Math.max(0, this._refs - 1)
    if (this._refs === 0) this._teardown()
  }

  async _createRecognizer() {
    // @vite-ignore: 번들러가 CDN URL을 상대경로로 재작성하지 않도록 그대로 둔다
    const vision = await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`)
    const fileset = await vision.FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
    )
    const create = delegate => vision.GestureRecognizer.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: GESTURE_MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numHands: 1,
    })
    // GPU가 먼저지만 실패하면 CPU로 — poseEngine.js와 같은 이유(Safari GPU delegate 실패 대비)
    try {
      this._recognizer = await create('GPU')
    } catch (e) {
      console.warn('[fistEngine] GPU delegate 실패 → CPU로 재시도:', e?.message)
      this._recognizer = await create('CPU')
    }
  }

  _loop = () => {
    if (!this._running) return
    this._rafId = requestAnimationFrame(this._loop)

    // 듣는 사람이 없으면 추론하지 않는다 — poseEngineCore와 같은 절약 방식
    if (this._callbacks.size === 0) return
    const video = this._video
    if (!video || video.currentTime === this._lastVideoTime) return
    this._lastVideoTime = video.currentTime

    try {
      const result = this._recognizer.recognizeForVideo(video, performance.now())
      const g = result.gestures?.[0]?.[0]
      const isFist = g?.categoryName === 'Closed_Fist' && g.score >= FIST_SCORE_MIN
      this.lastResult = {
        isFist, score: g?.score ?? 0, gestureName: g?.categoryName ?? null,
        landmarks: result.landmarks?.[0] ?? null,
      }
      for (const cb of this._callbacks) cb(this.lastResult)
    } catch {
      /* 프레임 스킵 — 한 프레임 실패로 루프를 끊지 않는다 */
    }
  }

  // 참조 수와 무관하게 즉시 끈다. 평소에는 release()를 쓴다.
  stop() {
    this._refs = 0
    this._teardown()
  }

  _teardown() {
    this._running = false
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = null
    this._detach?.(); this._detach = null
    if (this._video) { this._video.remove(); this._video = null }
    try { this._recognizer?.close?.() } catch { /* 이미 닫혔으면 무시 */ }
    this._recognizer = null
    this._lastVideoTime = -1
    this.lastResult = { isFist: false, score: 0, gestureName: null, landmarks: null }
    // 우리가 실제로 poseEngineCore를 빌렸을 때만 반납한다 — 안 그러면 poseEngineCore
    // 자체의 acquire()가 실패했을 때(카메라 권한 거부 등) 남의 참조 수를 깎게 된다.
    if (this._poseAcquired) { poseEngineCore.release(); this._poseAcquired = false }
  }
}

export const fistEngineCore = new FistEngineCore()
