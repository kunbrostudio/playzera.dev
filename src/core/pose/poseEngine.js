// 포즈 엔진 — MediaPipe Pose Landmarker(tasks-vision) 래퍼. 게임 공용 정본.
//
// STEP 4-0 — 라이브러리 통일.
//   이전에는 `@mediapipe/pose`(Solutions API)를 <script> 태그로 불러 썼다. 구글이
//   지원을 종료한 세대라 Safari 호환 문제가 생겨도 고쳐지지 않는다. 웜업이 쓰던
//   tasks-vision으로 통일했다 — 성능·모델 선택·delegate 제어가 모두 낫다.
//
//   Solutions가 옵션으로 공짜로 주던 것들을 여기서 직접 구현한다.
//     selfieMode: true   → 아래 §거울 좌표
//     smoothLandmarks    → EMA 스무딩 (emaAlpha 0.35)
//     window.Camera      → getUserMedia 직접 호출
//     modelComplexity: 1 → pose_landmarker_lite 모델
//
// ── 거울 좌표 ──────────────────────────────────────────────────
//
// **이 엔진은 화면에 보이는 대로의 좌표를 내보낸다.** 카메라 원본을 한 번만 뒤집어
// (`1 - x`) 구독자에게 준다. 아이가 자기 오른쪽으로 가면 x가 커진다.
//
// 좌표계를 하나로 정한 이유 — 이전에는 게임마다 달랐다. 똥 피하기는 selfieMode로
// 거울 좌표를 받았고, 웜업은 원본을 받아 `motionDetector` 안에서 `1 - hip.x`로
// 뒤집었다. 이 상태로 엔진을 합치면 한쪽은 반드시 좌우가 뒤집힌다.
// **뒤집기는 여기 한 곳에서만 일어난다.** 구독자는 뒤집을 필요도, 기억할 필요도 없다.
//
// 반전에 무관한 코드는 그대로 둔다 — gesture(좌우 순서 비교), poseMatcher(각도).

const MP_VERSION = '0.10.14'
const MODEL_URL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task'

const EMA_ALPHA = 0.35   // 랜드마크 떨림 제거. 웜업에서 검증된 값 — 바꾸지 말 것.

// 랜드마크 인덱스 (gesture.js와 같은 표를 쓴다)
export { LM } from './gesture.js'

// 캘리브레이션 전 "전신이 화면 안에 다 들어와 있는지" 체크 — 코~발목까지 주요 관절이
// 1) MediaPipe가 보고하는 신뢰도(visibility)가 충분히 높고, 2) 정규화 좌표가 화면 범위(0~1) 안에
// 있어야 "전신이 보인다"고 판정한다. 카메라 준비 화면에서 테두리를 빨강/초록으로 바꾸는 데 사용.
const FULL_BODY_POINTS = [0, 11, 12, 23, 24, 25, 26, 27, 28]
const FULL_BODY_VISIBILITY_MIN = 0.5
const FULL_BODY_FRAME_MARGIN = 0.02 // 프레임 가장자리 살짝의 여유(오검출 방지)

export function isFullBodyVisible(lms) {
  if (!lms) return false
  for (const idx of FULL_BODY_POINTS) {
    const p = lms[idx]
    if (!p) return false
    if (typeof p.visibility === 'number' && p.visibility < FULL_BODY_VISIBILITY_MIN) return false
    if (p.x < -FULL_BODY_FRAME_MARGIN || p.x > 1 + FULL_BODY_FRAME_MARGIN ||
        p.y < -FULL_BODY_FRAME_MARGIN || p.y > 1 + FULL_BODY_FRAME_MARGIN) return false
  }
  return true
}

// 이 브라우저에서 포즈 인식이 될 수 있는지 — 카메라를 열기 **전에** 판단한다.
//
// tasks-vision은 WASM SIMD를 요구한다. Safari는 16.4부터 지원하므로 그 이전 아이폰에서는
// 카메라 권한만 받아놓고 모델 로드에서 실패한다. 권한 팝업을 띄운 뒤 실패하는 것보다
// "이 기기에서는 안 된다"를 먼저 알려주는 편이 낫다.
//
// SIMD 지원 여부는 버전 문자열이 아니라 실제 바이트코드로 확인한다 — 브라우저 UA는 믿을 게 못 된다.
//
// `() -> v128` 함수 하나를 만들고 `i8x16.splat`(0xfd 0x0f)을 쓴다. SIMD를 모르는
// 엔진은 이 명령을 읽지 못해 validate가 false를 낸다.
//
// ⚠️ 이 바이트열은 눈으로 검산이 안 된다. **반드시 SIMD를 지원하는 런타임에서
// true가 나오는지 확인하고 쓸 것.** 처음 쓴 판은 splat 뒤에 drop(0x1a)이 붙어
// 반환값이 비는 바람에 어디서나 false였다 — 그대로 뒀으면 모든 기기에서
// "브라우저가 오래됐어요"가 떴을 것이다.
const SIMD_PROBE = new Uint8Array([
  0, 97, 115, 109, 1, 0, 0, 0,   // \0asm, version 1
  1, 5, 1, 96, 0, 1, 123,        // type: () -> v128
  3, 2, 1, 0,                    // func 0 : type 0
  10, 8, 1, 6, 0,                // code: 본문 1개, 6바이트, 지역변수 없음
  65, 0,                         //   i32.const 0
  253, 15,                       //   i8x16.splat   ← SIMD 명령
  11,                            //   end
])

let _simdCache = null
export function hasWasmSimd() {
  if (_simdCache !== null) return _simdCache
  try { _simdCache = WebAssembly.validate(SIMD_PROBE) }
  catch { _simdCache = false }
  return _simdCache
}

export function isPoseSupported() {
  return typeof WebAssembly === 'object'
    && !!navigator.mediaDevices?.getUserMedia
    && hasWasmSimd()
}

// 왜 안 되는지 한 줄로. 안내 문구에 그대로 쓴다.
export function poseUnsupportedReason() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return window.isSecureContext
      ? '이 브라우저는 카메라를 지원하지 않아요'
      : 'HTTPS로 접속해야 카메라를 쓸 수 있어요'
  }
  if (!hasWasmSimd()) return '브라우저가 오래됐어요. 아이폰은 iOS 16.4 이상이 필요해요'
  return null
}

// 추론용 video는 화면에 보이지 않지만 **DOM 안에 있어야 한다.**
//
// `document.createElement('video')`로 만들어 붙이지 않고 두면, 브라우저가 그 요소를
// 화면에 그릴 일이 없다고 보고 프레임 디코딩을 건너뛴다. `currentTime`이 멈춰 있으니
// `detectForVideo`가 같은 프레임만 보고 랜드마크가 한 번도 나오지 않는다.
//
// 겉으로는 카메라가 멀쩡해 보인다 — PIP는 같은 MediaStream을 물린 **다른** video라
// 영상이 잘 나오기 때문이다. 그래서 "화면은 보이는데 인식만 안 되는" 모양이 된다.
//
// `display:none`·`visibility:hidden`도 같은 이유로 쓸 수 없다. 1px 크기에 거의 투명하게
// 두어 "그려지긴 하는" 상태로 만든다.
function createInferenceVideo() {
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

class PoseEngineCore {
  constructor() {
    this._landmarker = null
    this._video = null       // 추론용(화면에 붙지 않는다)
    this._stream = null
    this._running = false
    this._rafId = null
    this._lastVideoTime = -1
    this._smoothed = null
    this._callbacks = new Set()
    this._refs = 0           // acquire/release 참조 수
    this._startPromise = null
    this.delegate = null     // 'GPU' | 'CPU' — 실제로 무엇으로 떨어졌는지
  }

  // ⚠️ setPaused()는 없애 두었다.
  //
  // 엔진이 게임 전용일 때는 "타이틀 화면에서는 추론을 쉰다"가 맞는 절약이었다.
  // 공유 엔진이 된 지금은 **한 화면이 멈추면 모두가 굶는다.** 실제로 웜업이
  // 카메라 준비에서 뒤로 나가며 pause를 걸자, 타이틀에서 손 포인터가 죽어
  // 아무것도 누를 수 없게 됐다.
  //
  // 전역 스위치 대신 구독으로 판단한다 — 아무도 안 듣고 있으면 추론하지 않는다.

  // 랜드마크 구독. 반환값(함수)을 호출하면 구독 해제
  onLandmarks(callback) {
    this._callbacks.add(callback)
    return () => this._callbacks.delete(callback)
  }

  isRunning() { return this._running }

  // ── 스트림 공유 ────────────────────────────────────────────
  //
  // 카메라를 화면마다 열고 닫으면 허브 → 인트로 → 게임 사이에 세 번 재시작한다.
  // 그때마다 커서가 0.5~1초 끊기고, 방금 닫은 장치를 바로 다시 여는 동안
  // `NotReadableError`가 날 여지도 생긴다(실제로 겪었다).
  //
  // 그래서 스트림과 랜드마커는 **앱 수명 동안 하나만** 둔다. 화면들은 acquire()로
  // 빌려 쓰고 release()로 반납한다. 마지막 사용자가 놓을 때만 실제로 닫힌다.
  //
  // 추론은 화면에 붙지 않는 자체 video에서 돌린다. 화면에 보여줄 때는 attach()로
  // 같은 MediaStream을 각자의 <video>에 물린다 — 한 스트림을 여러 video가 함께 쓸 수 있다.
  async acquire() {
    this._refs++
    if (this._startPromise) return this._startPromise   // 동시에 두 화면이 불러도 한 번만 연다
    if (this._running) return

    this._startPromise = (async () => {
      this._video = createInferenceVideo()
      await this._openCamera(this._video)
      await this._createLandmarker()
      this._running = true
      this._loop()
    })()

    try {
      await this._startPromise
    } catch (e) {
      console.warn('[poseEngine] 시작 실패:', e?.name, e?.message)
      this._refs = Math.max(0, this._refs - 1)
      this._teardown()
      throw e   // 호출부가 사용자에게 이유를 보여줄 수 있게 그대로 올린다
    } finally {
      this._startPromise = null
    }
  }

  release() {
    this._refs = Math.max(0, this._refs - 1)
    if (this._refs === 0) this._teardown()
  }

  // 같은 스트림을 화면의 <video>에 물린다. 반환값을 호출하면 뗀다.
  attach(videoElement) {
    if (!videoElement) return () => {}
    videoElement.srcObject = this._stream
    videoElement.play?.().catch(() => { /* 자동재생 차단은 muted면 안 난다 */ })
    return () => {
      if (videoElement.srcObject === this._stream) videoElement.srcObject = null
    }
  }

  async _openCamera(videoElement) {
    // 16:9로 넓게 잡아야 좌우 이동 인식 범위가 충분히 확보된다.
    // (4:3은 좌우가 상대적으로 좁아 화면 가장자리에서 손실되기 쉽다)
    this._stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 360 }, aspectRatio: { ideal: 16 / 9 }, facingMode: 'user' },
      audio: false,
    })
    videoElement.srcObject = this._stream
    if (videoElement.readyState < 1) {
      await new Promise(res => { videoElement.onloadedmetadata = res })
    }
    await videoElement.play()
  }

  async _createLandmarker() {
    // @vite-ignore: 번들러가 CDN URL을 상대경로로 재작성하지 않도록 그대로 둔다
    // (없으면 vite:dynamic-import-vars가 ../../../../https:/cdn... 로 망가뜨린다)
    const vision = await import(/* @vite-ignore */ `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`)
    const fileset = await vision.FilesetResolver.forVisionTasks(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`
    )

    const create = delegate => vision.PoseLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      numPoses: 1,
    })

    // GPU가 먼저지만 실패하면 CPU로 내려간다.
    // Safari의 WebGL 성능은 크롬보다 낮고, 기기에 따라 GPU delegate 생성 자체가 실패한다.
    // 여기서 포기하면 "카메라를 사용할 수 없어요"가 되지만, CPU로도 게임은 돌아간다.
    try {
      this._landmarker = await create('GPU')
      this.delegate = 'GPU'
    } catch (e) {
      console.warn('[poseEngine] GPU delegate 실패 → CPU로 재시도:', e?.message)
      this._landmarker = await create('CPU')
      this.delegate = 'CPU'
    }
  }

  _loop = () => {
    if (!this._running) return
    this._rafId = requestAnimationFrame(this._loop)

    // 듣는 사람이 없으면 추론하지 않는다 (전역 pause 스위치를 대신한다)
    if (this._callbacks.size === 0) return
    const video = this._video
    if (!video || video.currentTime === this._lastVideoTime) return
    this._lastVideoTime = video.currentTime

    try {
      const result = this._landmarker.detectForVideo(video, performance.now())
      const raw = result.landmarks && result.landmarks[0]
      if (!raw) return
      const lms = this._mirrorAndSmooth(raw)
      for (const cb of this._callbacks) cb(lms)
    } catch {
      /* 프레임 스킵 — 한 프레임 실패로 루프를 끊지 않는다 */
    }
  }

  // 거울 반전 + EMA 스무딩을 한 번에.
  //
  // 반전을 스무딩보다 먼저 한다. 순서를 바꾸면 스무딩 버퍼에는 원본이, 구독자에게는
  // 반전값이 가서 두 좌표계가 한 배열 안에 섞인다.
  _mirrorAndSmooth(raw) {
    const a = EMA_ALPHA
    if (!this._smoothed || this._smoothed.length !== raw.length) {
      this._smoothed = raw.map(p => ({ x: 1 - p.x, y: p.y, z: p.z, visibility: p.visibility }))
      return this._smoothed
    }
    for (let i = 0; i < raw.length; i++) {
      const s = this._smoothed[i]
      const p = raw[i]
      s.x += a * ((1 - p.x) - s.x)
      s.y += a * (p.y - s.y)
      s.z += a * (p.z - s.z)
      s.visibility = p.visibility
    }
    return this._smoothed
  }

  // 참조 수와 무관하게 즉시 끈다. 앱을 떠날 때나 오류 정리용이다.
  // 평소에는 release()를 쓴다.
  stop() {
    this._refs = 0
    this._teardown()
  }

  // 실제 정리 — 카메라 트랙까지 끊는다.
  //
  // 트랙을 남기면 카메라 표시등이 꺼지지 않고, 다음 getUserMedia가
  // "이미 열려 있는 장치를 다른 해상도로" 요청하다 실패한다. (실제로 겪은 버그)
  _teardown() {
    this._running = false
    if (this._rafId) cancelAnimationFrame(this._rafId)
    this._rafId = null

    if (this._stream) {
      for (const track of this._stream.getTracks()) track.stop()
      this._stream = null
    }
    if (this._video) {
      this._video.srcObject = null
      this._video.remove()   // body에 붙여둔 추론용 video를 걷어낸다
      this._video = null
    }
    try { this._landmarker?.close?.() } catch { /* 이미 닫혔으면 무시 */ }
    this._landmarker = null
    this._smoothed = null
    this._lastVideoTime = -1
    this.delegate = null
  }
}

export const poseEngineCore = new PoseEngineCore()
