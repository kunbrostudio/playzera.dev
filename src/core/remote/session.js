// 부모 리모컨(폰) 페어링 — 주 디바이스(태블릿·PC·다른 폰) 쪽. STEP 64.
//
// ── 왜 이렇게 짰나 ★ ─────────────────────────────────────────
//
// Supabase Realtime Broadcast 채널 하나가 코드 하나에 대응한다. QR을 열 때마다
// 새 코드로 새 채널을 만든다(고정 QR이 아니다) — 화면에 뜬 QR을 실제로
// 봐야만 스캔할 수 있다는 물리적 제약이 "같은 자리에 있는 사람만 붙는다"를
// 대신한다. Realtime은 전 세계 어디서나 붙는 릴레이라 "같은 와이파이"를
// 기술적으로 강제할 방법이 없다 — 대신 코드를 안다고 자동으로 안 붙고,
// **주 디바이스 화면에서 매번 승인해야** 붙는다(ken 지시, 9/4). 코드가
// 새고, 그 코드로 채널까지 붙어도, 마지막엔 주 디바이스 앞 사람의 동의가
// 있어야 한다.
//
// 이 세션은 페이지를 넘나들어도 살아 있어야 한다 — 아이가 게임 중일 때도
// 부모가 끄기를 누를 수 있어야 하니까. 그래서 화면(라우터가 그리는 페이지)이
// 아니라 이 모듈 자체가 싱글톤이다(`poseEngineCore`와 같은 패턴) — 처음
// QR을 열면 만들어지고, 탭이 닫힐 때까지 산다. `stop()`은 "리모컨 끊기"지
// 이 싱글톤 자체를 없애는 게 아니다.
//
// ── 명령은 하나뿐이다 ─────────────────────────────────────────
//
// `{type:'navigate', path}` — 리모컨(폰)이 `navigate()`를 부르려 했던
// 경로를 그대로 전달받아 이 디바이스에서 대신 이동한다. 1단계(STEP 64)는
// `start`(gameId 검증 후 그 게임으로)·`stop`(허브로) 둘로 나눴었는데,
// 2단계(STEP 66)에서 리모컨 화면 자체를 없애고 폰이 진짜 허브를 그대로
// 띄우게 되면서(`core/remote/controller.js` 상단 주석 참고) 더 단순해졌다
// — 허브의 히어로 버튼이 이미 `navigate(그 게임 경로)`를 부르므로, 그
// 호출 하나를 그대로 옮기면 게임 id를 여기서 다시 검증할 필요가 없다
// (모르는 경로는 router.js가 이미 홈으로 되돌린다).
//
// 원격이 아직 정하지 못한 것: 두 번째 리모컨이 붙으려 하면 지금은 조용히
// 무시한다(동시 접속 1개, 1단계 범위). 여러 리모컨을 동시에 허용하려면
// `_remoteId`를 Set으로 바꿔야 한다 — 그때 가서 늘린다.
//
// ── 화면 미러링(2단계) ─────────────────────────────────────────
//
// "게임 화면 그대로"를 폰에 실시간으로 비추는 기능. `getDisplayMedia`
// (화면 공유, 시스템 팝업)를 쓰지 않는다 — 아이폰·아이패드·안드로이드
// **모바일 브라우저는 전부 이 API를 지원하지 않는다**(2026년 기준, 데스크톱
// 전용 API다). 대신 게임이 이미 그리고 있는 `<canvas>`를
// `canvas.captureStream()`으로 직접 스트림화한다 — 이건 모바일 사파리에서도
// 된다. 신호 교환(offer/answer/ICE)은 페어링에 쓰던 같은 Realtime 채널을
// 그대로 재사용한다 — 새 인프라가 필요 없다.
//
// **이 저장소의 세 게임(캔버스 id: `#game-canvas`=2D 러너/똥 피하기,
// `#r3-cv`=3D 러너)은 전부 캔버스에 그린다** — HUD·버튼 같은 UI만 그
// 위에 얹힌 DOM이다. 그래서 지금 서버에 노출된 게임 셋(똥 피하기·
// 쥬라기 대탐험 3D·인터랙션 웜업)은 전부 캔버스를 잡아 미러링할 수
// 있다. `status: hidden`인 나머지 셋(불 끄기·돌다리·팝팝 클리커)은
// 캔버스가 아예 없는 순수 DOM 게임이라 이 방식으론 못 비춘다 — 지금은
// 화면이 없을 때처럼 리모컨에 그냥 "화면 준비 중" 상태로 남는다(따로
// 오류 처리 안 함). 다시 노출하게 되면 그때 다른 방법이 필요하다.
//
// **자동으로 켜지지 않는다.** 리모컨이 "화면 보기"를 눌러야(`mirror-request`)
// 캡처+인코딩이 시작된다 — 3D 렌더링·포즈 인식 카메라가 이미 기기를
// 많이 쓰는 상태라, 아무도 안 보는데 영상 인코딩까지 얹으면 프레임이
// 떨어질 수 있다(이 저장소가 성능에 예민한 이유는 `#/lab3d`가 존재하는
// 이유와 같다). 리모컨이 "화면 보기"를 끄거나 연결이 끊기면 즉시 멈춘다.
//
// **TURN 서버는 안 쓴다**(ken 선택, 9/4) — 두 기기가 직접 못 붙는
// 네트워크(대칭 NAT 등)에서는 영상이 안 뜬다. 얼마나 자주 겪는지 보고
// 나중에 붙일지 정한다.
//
// **지금은 어디서도 이 기능을 켜지 않는다(STEP 66, ken 지시 9/4).**
// 리모컨 화면 자체가 사라지고 폰이 허브를 그대로 띄우게 되면서 "화면
// 보기" 버튼을 놓을 자리가 마땅치 않아졌다 — 코드는 지우지 않고 남겨
// 둔다. `mirror-request`를 실제로 보내는 UI가 다시 생기면(예: 연결 상태
// 패널에 버튼 하나) 그대로 다시 동작한다.
import supabase from '../supabase.js'
import { navigate, onRouteChange } from '../router.js'

// 0/O, 1/I/L처럼 헷갈리는 문자를 뺀 32자 — 화면에 크게 띄워도, 사람이 옮겨
// 적어도 실수가 적다(지금은 QR만 쓰지만 코드 자체도 같이 보여준다).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6

// QR을 띄운 채 아무도 안 붙으면 이만큼 뒤에 채널을 닫는다 — 계속 열어 두면
// 오래된 QR 스크린샷이 나중에 재사용될 여지가 남는다.
const JOIN_TIMEOUT_MS = 5 * 60 * 1000

// 이 저장소의 게임이 실제로 그리는 캔버스 id들. `runner/legacy-shell.js`·
// `poop-dodge/play.js`가 `#game-canvas`를, `runner3d/play3d.js`가
// `#r3-cv`를 쓴다 — 새 캔버스 기반 게임이 생기면 여기 한 줄만 추가한다.
const MIRROR_CANVAS_SELECTOR = '#game-canvas, #r3-cv'

// STUN만 쓴다(TURN 없음, 위 주석 참고). 구글 공개 STUN — 프로젝트 전용
// 인프라가 필요 없는 가장 가벼운 선택.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]
const MIRROR_FPS = 12   // 게임 화면 미러링용 — 방송 화질이 아니라 "뭘 하는지 보이는" 정도면 충분하다

export function randomCode() {
  let s = ''
  for (let i = 0; i < CODE_LEN; i++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]
  return s
}

class RemoteSession {
  constructor() {
    this._channel = null
    this._code = null
    this._remoteId = null        // 승인된 리모컨 id — 없으면 아무도 안 붙어 있다
    this._pendingRemoteId = null // 승인 대기 중인 요청 (동시에 하나만)
    this._joinTimer = null
    this._listeners = new Set()  // (state) => void

    this._wantsMirror = false    // 리모컨이 "화면 보기"를 켰나
    this._pc = null              // 지금 미러링 중인 RTCPeerConnection
    this._mirrorCanvas = null    // 그 pc가 물려 있는 캔버스 엘리먼트

    // 화면이 바뀔 때마다 리모컨에 "지금 뭘 하고 있나"를 알려준다(붙어 있을 때만).
    // 캔버스도 화면마다 새로 생기므로(라우터가 #app을 통째로 다시 그린다)
    // 같은 타이밍에 미러링 대상을 다시 잡는다.
    onRouteChange(({ path, query }) => {
      if (!this._remoteId) return
      this._send('state', { screen: path, gameId: query?.id ?? null })
      this._reconcileMirror()
    })
  }

  get code() { return this._code }
  get isPaired() { return !!this._remoteId }
  get isWaiting() { return !!this._channel && !this._remoteId }
  get hasPending() { return !!this._pendingRemoteId }

  /** 상태 변화를 구독한다. 반환값(함수)을 부르면 해지. */
  onChange(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  _emit() {
    const state = { code: this._code, waiting: this.isWaiting, connected: this.isPaired, pending: this.hasPending }
    for (const fn of this._listeners) fn(state)
  }

  _send(event, payload = {}) {
    this._channel?.send({ type: 'broadcast', event, payload })
  }

  /**
   * QR을 새로 연다. 이전 연결·대기가 있었다면 먼저 끊는다 — 코드는 늘 새로
   * 뽑는다(재사용 안 함). 채널 구독이 끝나야 code를 반환한다.
   */
  async startPairing() {
    this.stop()
    this._code = randomCode()
    this._channel = supabase.channel(`remote-${this._code}`)

    this._channel
      .on('broadcast', { event: 'join' }, ({ payload }) => this._onJoin(payload?.remoteId))
      .on('broadcast', { event: 'command' }, ({ payload }) => this._onCommand(payload))
      .on('broadcast', { event: 'controller-left' }, ({ payload }) => this._onControllerLeft(payload))
      .on('broadcast', { event: 'mirror-request' }, ({ payload }) => this._onMirrorRequest(payload))
      .on('broadcast', { event: 'mirror-stop' }, ({ payload }) => this._onMirrorStop(payload))
      .on('broadcast', { event: 'webrtc-answer' }, ({ payload }) => this._onAnswer(payload))
      .on('broadcast', { event: 'webrtc-ice' }, ({ payload }) => this._onIce(payload))

    await new Promise((resolve, reject) => {
      this._channel.subscribe(status => {
        if (status === 'SUBSCRIBED') resolve()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`[remote] 채널 연결 실패: ${status}`))
      })
    })

    this._joinTimer = setTimeout(() => { if (!this._remoteId) this.stop() }, JOIN_TIMEOUT_MS)
    this._emit()
    return this._code
  }

  _onJoin(remoteId) {
    // 이미 붙어 있거나(1단계는 동시 접속 1개), remoteId가 비어 있으면 무시한다.
    if (!remoteId || this._remoteId) return
    this._pendingRemoteId = remoteId
    this._emit()
  }

  /** 화면의 승인창에서 "허용"을 눌렀을 때. */
  approve() {
    if (!this._pendingRemoteId) return
    this._remoteId = this._pendingRemoteId
    this._pendingRemoteId = null
    clearTimeout(this._joinTimer)
    this._send('approved', { remoteId: this._remoteId })
    this._emit()
  }

  /** "거부"를 눌렀을 때. QR·채널은 그대로 살아 있어 다시 시도할 수 있다. */
  deny() {
    if (!this._pendingRemoteId) return
    this._send('denied', { remoteId: this._pendingRemoteId })
    this._pendingRemoteId = null
    this._emit()
  }

  _onCommand(payload) {
    // 승인된 리모컨의 명령만 받는다 — remoteId가 안 맞으면(다른 세션의
    // 낡은 메시지 등) 조용히 버린다.
    if (!this._remoteId || payload?.remoteId !== this._remoteId) return
    if (payload.type === 'navigate' && typeof payload.path === 'string') {
      navigate(payload.path)
    }
  }

  /** 리모컨(폰) 쪽이 스스로 연결을 끊었을 때 — 세션 전체를 정리한다. */
  _onControllerLeft(payload) {
    if (!this._remoteId || payload?.remoteId !== this._remoteId) return
    this.stop()
  }

  // ── 화면 미러링 ────────────────────────────────────────────

  _onMirrorRequest(payload) {
    if (!this._remoteId || payload?.remoteId !== this._remoteId) return
    this._wantsMirror = true
    this._reconcileMirror()
  }

  _onMirrorStop(payload) {
    if (!this._remoteId || payload?.remoteId !== this._remoteId) return
    this._wantsMirror = false
    this._teardownMirror()
  }

  async _onAnswer(payload) {
    if (!this._remoteId || payload?.remoteId !== this._remoteId || !this._pc) return
    try { await this._pc.setRemoteDescription(payload.sdp) }
    catch (e) { console.warn('[remote] 미러링 answer 처리 실패:', e) }
  }

  async _onIce(payload) {
    if (!this._remoteId || payload?.remoteId !== this._remoteId || !this._pc || !payload?.candidate) return
    try { await this._pc.addIceCandidate(payload.candidate) }
    catch { /* 늦게 도착한 후보는 조용히 버린다 — 연결 자체는 다른 후보로도 될 수 있다 */ }
  }

  /**
   * 지금 상태(원하는지·붙어 있는지·화면에 맞는 캔버스가 있는지)에 맞춰
   * 미러링을 켜거나 끈다. `onRouteChange`마다, 그리고 "화면 보기"를 켤
   * 때마다 불린다 — 부르는 쪽이 조건을 안 따져도 되게 이 함수가 판단한다.
   */
  _reconcileMirror() {
    if (!this._wantsMirror || !this._remoteId) { this._teardownMirror(); return }
    const canvas = document.querySelector(MIRROR_CANVAS_SELECTOR)
    if (!canvas) { this._teardownMirror(); return }          // 이 화면엔 캔버스가 없다(허브 등)
    if (canvas === this._mirrorCanvas && this._pc) return    // 이미 이 캔버스를 비추고 있다
    this._teardownMirror()   // 화면이 바뀌어 캔버스도 새로 생겼다 — 옛 연결은 죽은 트랙을 물고 있다
    this._beginMirror(canvas)
  }

  async _beginMirror(canvas) {
    if (typeof canvas.captureStream !== 'function' || typeof RTCPeerConnection === 'undefined') {
      console.warn('[remote] 이 브라우저는 화면 미러링(canvas.captureStream/WebRTC)을 지원하지 않는다')
      return
    }
    this._mirrorCanvas = canvas
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this._pc = pc
    pc.onicecandidate = e => {
      if (e.candidate) this._send('webrtc-ice', { remoteId: this._remoteId, candidate: e.candidate.toJSON() })
    }
    try {
      const stream = canvas.captureStream(MIRROR_FPS)
      for (const track of stream.getTracks()) pc.addTrack(track, stream)
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      this._send('webrtc-offer', { remoteId: this._remoteId, sdp: offer })
    } catch (e) {
      console.warn('[remote] 미러링 시작 실패:', e)
      this._teardownMirror()
    }
  }

  _teardownMirror() {
    this._pc?.close()
    this._pc = null
    this._mirrorCanvas = null
  }

  /**
   * 연결·대기를 모두 끊는다. 세션 자체(싱글톤)는 계속 산다.
   *
   * 붙어 있던 리모컨이 있었다면 끊기 전에 `primary-closed`를 보낸다 —
   * 안 보내면 리모컨은 채널이 여전히 살아있다고 착각하고, 그 뒤로 보내는
   * 명령이 아무도 안 듣는 채널로 조용히 사라진다(`controller.js` 참고).
   */
  stop() {
    if (this._remoteId) this._send('primary-closed', { remoteId: this._remoteId })
    clearTimeout(this._joinTimer)
    this._joinTimer = null
    this._wantsMirror = false
    this._teardownMirror()
    this._channel?.unsubscribe()
    this._channel = null
    this._code = null
    this._remoteId = null
    this._pendingRemoteId = null
    this._emit()
  }
}

export const remoteSession = new RemoteSession()
