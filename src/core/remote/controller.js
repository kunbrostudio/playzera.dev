// 리모컨(폰) 쪽 — 다른 기기(주 디바이스)를 조종하는 세션. STEP 66.
//
// ── 왜 이렇게 짰나 ★ ─────────────────────────────────────────
//
// `session.js`가 "누군가 날 조종하게 해주는" 주 디바이스 쪽이라면, 이건
// "내가 다른 기기를 조종하는" 리모컨(폰) 쪽이다.
//
// 1단계(STEP 64)는 리모컨 전용 화면을 따로 그렸다(게임 카드 그리드 +
// 시작/끄기 버튼) — ken이 써보고 "왜 새 화면을 만들었냐, 그냥 플랫폼
// 모습 그대로 자유롭게 조작하게 해달라"고 지적했다(9/4). 그래서 이번엔
// 리모컨 전용 화면 자체를 없앴다 — `/remote?code=`는 승인만 받는 부팅
// 화면이고, 승인되면 **진짜 허브(`/`)를 그대로 띄운다.** 그 뒤로 폰
// 화면 안에서 카드를 고르고 히어로 버튼을 누르는 건 평소 허브와 똑같이
// 동작하는데, 그 이동이 로컬이 아니라 **주 디바이스로 대신 전달**된다
// (router.js의 `navigate()`가 `controller.active`를 보고 갈아탄다).
// 그래서 홈 화면·게임 화면 코드는 이 기능을 위해 단 한 줄도 안 바뀐다
// — 라우터라는 단일 통로만 가로챈다.
//
// 명령은 이제 하나뿐이다: `{type:'navigate', path}` — 폰이 어디로
// "이동하려 했는지"를 그대로 주 디바이스에 전달한다. 1단계의 `start`/
// `stop` 전용 프로토콜(게임 id를 검증해서 골라 보내는 방식)은 없앴다 —
// 허브가 이미 "카드는 고르기, 히어로 버튼은 실행"을 지키므로, 그 버튼이
// 누르는 `navigate()` 호출 하나를 그대로 옮기면 같은 규칙이 공짜로
// 따라온다.
//
// 이 세션도 `remoteSession`과 마찬가지로 페이지를 넘나들며 살아있는
// 싱글톤이다 — 승인 후 `/remote` 화면 자체가 사라지고 허브가 그 자리를
// 대신 그리므로, 연결 상태를 화면이 아니라 이 모듈이 들고 있어야 한다.
//
// ── 화면 미러링(STEP 71, 되살림) ─────────────────────────────────
//
// `session.js`(주 디바이스)가 이미 갖고 있던 offer/answer/ICE 로직의
// 반대편이다 — 신호는 `session.js`가 던지고 이쪽이 받아 답한다. STEP 65에서
// 만들고 STEP 66에서 "놓을 자리가 없다"며 꺼 뒀는데(리모컨 전용 화면이
// 사라지면서), ken이 배포 전에 다시 켜 달라고 했다(9/4). 이번엔 QR 아이콘
// 팝업 안 "조종 중" 패널(`pairingModal.js`의 `openControllerPanel`)에
// "화면 보기" 토글로 놓는다 — 패널을 닫으면 미러링도 같이 끈다(계속
// 열어 두는 화면이 아니므로, 안 그러면 안 보는데 카메라·인코딩만 도는
// STEP 65의 걱정이 그대로 재현된다).
import supabase from '../supabase.js'

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }]   // session.js와 같은 값(STUN만, TURN 없음)

class ControllerSession {
  constructor() {
    this._channel = null
    this._remoteId = null
    this._active = false
    this._listeners = new Set()  // (state) => void

    this._pc = null          // 지금 미러링 중인 RTCPeerConnection
    this._onStream = null    // (stream|null) => void — 화면 보기 UI가 붙인 콜백
  }

  get active() { return this._active }

  /** 상태 변화를 구독한다. 반환값(함수)을 부르면 해지. */
  onChange(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  _emit() {
    const state = { active: this._active }
    for (const fn of this._listeners) fn(state)
  }

  /**
   * `code`로 채널에 붙어 승인을 기다린다.
   * @returns {Promise<'approved'|'denied'|'timeout'>}
   */
  connect(code, { timeoutMs = 20000 } = {}) {
    this._forceDisconnect()
    this._remoteId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const channel = supabase.channel(`remote-${code}`)
    this._channel = channel

    return new Promise(resolve => {
      let settled = false
      const finish = result => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (result === 'approved') {
          this._active = true
          this._emit()
        } else {
          channel.unsubscribe()
          this._channel = null
        }
        resolve(result)
      }

      channel
        .on('broadcast', { event: 'approved' }, ({ payload }) => {
          if (payload?.remoteId === this._remoteId) finish('approved')
        })
        .on('broadcast', { event: 'denied' }, ({ payload }) => {
          if (payload?.remoteId === this._remoteId) finish('denied')
        })
        // 주 디바이스가 먼저 연결을 끊었을 때(예: 부모가 태블릿 쪽에서
        // "연결 끄기"를 눌렀다) — 이미 승인된 뒤에만 의미가 있다.
        .on('broadcast', { event: 'primary-closed' }, ({ payload }) => {
          if (payload?.remoteId === this._remoteId) this._forceDisconnect()
        })
        .on('broadcast', { event: 'webrtc-offer' }, ({ payload }) => this._onOffer(payload))
        .on('broadcast', { event: 'webrtc-ice' }, ({ payload }) => this._onIce(payload))
        .subscribe(status => {
          if (status !== 'SUBSCRIBED') return
          channel.send({ type: 'broadcast', event: 'join', payload: { remoteId: this._remoteId } })
        })

      const timer = setTimeout(() => finish('timeout'), timeoutMs)
    })
  }

  /** 주 디바이스가 `path`로 이동하게 한다 — router.navigate()가 이걸 대신 부른다. */
  sendNavigate(path) {
    this._channel?.send({ type: 'broadcast', event: 'command', payload: { remoteId: this._remoteId, type: 'navigate', path } })
  }

  /**
   * 조종을 끝낸다(리모컨 쪽에서 스스로 끊을 때). 주 디바이스에도 알려서
   * 그쪽 QR 아이콘도 다시 "연결 안 됨" 상태로 돌아가게 한다 — 안 알리면
   * 주 디바이스는 채널을 계속 붙잡고 있고, 다음 사람이 새 QR을 받을 수
   * 없다.
   */
  disconnect() {
    if (this._active) this._channel?.send({ type: 'broadcast', event: 'controller-left', payload: { remoteId: this._remoteId } })
    this._forceDisconnect()
  }

  /** 상대가 먼저 끊었을 때(또는 새 연결을 시작할 때) — 알리지 않고 정리만 한다. */
  _forceDisconnect() {
    this._teardownMirror()
    this._channel?.unsubscribe()
    this._channel = null
    this._remoteId = null
    if (this._active) { this._active = false; this._emit() }
  }

  // ── 화면 미러링 ────────────────────────────────────────────

  /**
   * 주 디바이스에 "화면 보기"를 요청한다. `onStream(stream|null)`이
   * 스트림이 오거나(연결됨) 끊기면(null) 불린다 — UI(`<video>`)는
   * 이 콜백 안에서 `video.srcObject`만 갈아 끼우면 된다.
   */
  requestMirror(onStream) {
    this._onStream = onStream
    this._channel?.send({ type: 'broadcast', event: 'mirror-request', payload: { remoteId: this._remoteId } })
  }

  /** "화면 보기"를 끈다 — 주 디바이스에도 알려서 인코딩을 멈추게 한다. */
  stopMirror() {
    this._channel?.send({ type: 'broadcast', event: 'mirror-stop', payload: { remoteId: this._remoteId } })
    this._teardownMirror()
  }

  async _onOffer(payload) {
    if (!this._remoteId || payload?.remoteId !== this._remoteId) return
    this._teardownMirror()
    if (typeof RTCPeerConnection === 'undefined') {
      console.warn('[remote] 이 브라우저는 화면 보기(WebRTC)를 지원하지 않는다')
      return
    }
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
    this._pc = pc
    pc.onicecandidate = e => {
      if (e.candidate) this._channel?.send({ type: 'broadcast', event: 'webrtc-ice', payload: { remoteId: this._remoteId, candidate: e.candidate.toJSON() } })
    }
    pc.ontrack = e => { this._onStream?.(e.streams[0]) }
    try {
      await pc.setRemoteDescription(payload.sdp)
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      this._channel?.send({ type: 'broadcast', event: 'webrtc-answer', payload: { remoteId: this._remoteId, sdp: answer } })
    } catch (e) {
      console.warn('[remote] 화면 보기 시작 실패:', e)
      this._teardownMirror()
    }
  }

  async _onIce(payload) {
    if (!this._remoteId || payload?.remoteId !== this._remoteId || !this._pc || !payload?.candidate) return
    try { await this._pc.addIceCandidate(payload.candidate) }
    catch { /* 늦게 도착한 후보는 조용히 버린다 */ }
  }

  _teardownMirror() {
    // 정리할 pc가 실제로 있었을 때만 콜백에 null을 알린다 — `_onOffer`가
    // 새 offer를 받을 때마다 방어적으로 이 함수를 먼저 부르는데, 아직
    // 아무 pc도 없던 상태(예: 첫 offer)에서까지 null을 쏘면 UI가 "화면을
    // 받는 중"과 "화면이 끊겼어요"를 구별 못 하게 된다.
    const hadPc = !!this._pc
    this._pc?.close()
    this._pc = null
    if (hadPc) this._onStream?.(null)
  }
}

export const controller = new ControllerSession()
