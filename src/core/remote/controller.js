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
// ── 화면 미러링은 걷어냈다 (STEP 73) ────────────────────────────
//
// 받는 쪽(offer/answer/ICE 처리, `<video>`에 물릴 스트림 콜백)이 여기
// 있었다. 보내는 쪽과 같이 지웠다 — 이유는 `session.js` 머리말 참고.
// 한 줄로 줄이면: **태블릿이 화면이고 폰은 입력이다.**
//
// ── 끊겼다 돌아오면 스스로 다시 붙는다 (STEP 74) ★ ──────────────
//
// 폰 화면이 꺼지거나 부모가 다른 앱을 열면 브라우저가 이 탭의 JS를
// 재우고 WebSocket이 끊긴다. 예전에는 그걸 아무도 몰랐다 — `_active`는
// 계속 true라 폰은 붙어 있다고 믿고, 명령은 죽은 채널로 조용히 사라졌다.
// 부모 입장에서는 "버튼을 눌렀는데 아무 일도 안 일어난다"였다.
//
// 세 가지로 푼다.
//
//   ① **살아 있는지 확인하려 하지 않는다.** 채널이 진짜 죽었는지 판단하는
//      건 어렵고 브라우저마다 다르다. 대신 돌아올 때마다 **무조건 새로
//      만든다** — 옛 채널을 버리고 다시 구독한다. 싸고 결과가 늘 같다.
//   ② **같은 `remoteId`로 다시 들어간다.** 새로 뽑으면 주 디바이스가
//      처음 보는 리모컨으로 취급해 승인창을 또 띄운다. 그 값을
//      `remoteStore.js`에 남겨 두고 그대로 재사용하면, 주 디바이스가
//      "아까 그 폰"으로 알아보고 조용히 다시 받아 준다.
//   ③ **재우는 동안 누른 것 하나는 들고 있다가 보낸다.** 부모가 폰을 켜자
//      마자 누르면 아직 재구독 전일 수 있다. 그 명령을 버리지 않는다.
//
// 심장박동(heartbeat)은 **일부러 안 넣었다.** 넣으면 주 디바이스가 "잠깐
// 자리 비움"과 "영영 떠남"을 구별할 수 있지만, 그 구별이 이 기능에서
// 쓸모가 없다 — 부모가 폰을 내려놓아도 페어링은 여전히 유효한 게 맞다
// (TV 리모컨을 탁자에 두었다고 TV가 연결을 끊지 않는 것과 같다). 대신
// 타이머가 양쪽에서 영원히 도는 비용만 생긴다.
import supabase from '../supabase.js'
import { saveController, loadController, clearController } from './remoteStore.js'

/** 재입장은 사람을 안 기다린다(승인창이 안 뜬다) — 처음 붙을 때보다 짧게 끊는다. */
const RESUME_TIMEOUT_MS = 8000

class ControllerSession {
  constructor() {
    this._channel = null
    this._remoteId = null
    this._code = null
    this._active = false
    this._subscribed = false
    this._resuming = null        // 진행 중인 재입장 Promise — 겹쳐 돌지 않게
    this._pendingPath = null     // 끊겨 있는 동안 눌린 이동 (뒤엣것이 이긴다)
    this._listeners = new Set()  // (state) => void
    this._focusListeners = new Set()   // ({label}) => void
    this._stateListeners = new Set()   // ({screen, gameId}) => void
    this._mutedListeners = new Set()   // ({muted}) => void
    this._bindLifecycle()
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
    return this._join(code, timeoutMs)
  }

  /**
   * 채널을 새로 열고 `join`을 보낸 뒤 결과를 기다린다.
   * 처음 붙을 때(`connect`)와 다시 붙을 때(`resume`)가 **같은 길**을 쓴다 —
   * 다른 건 `remoteId`를 새로 뽑느냐 들고 있던 걸 쓰느냐뿐이다.
   *
   * @returns {Promise<'approved'|'denied'|'timeout'>}
   */
  _join(code, timeoutMs) {
    this._code = code
    this._subscribed = false
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
          saveController(code, this._remoteId)
          this._flushPending()
          this._emit()
        } else {
          // 거절·시간초과 — 기억해 둔 페어링도 지운다. 안 지우면 돌아올
          // 때마다 죽은 세션에 계속 붙으려 든다.
          clearController()
          channel.unsubscribe()
          this._channel = null
          this._code = null
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
          if (payload?.remoteId === this._remoteId) { clearController(); this._forceDisconnect() }
        })
        // 주 디바이스에서 포커스가 옮겨질 때마다 그 이름이 온다.
        .on('broadcast', { event: 'focus' }, ({ payload }) => {
          for (const fn of this._focusListeners) fn({ label: payload?.label ?? null })
        })
        // 주 디바이스가 지금 어느 화면(경로)·어느 게임인지. 폰의 가운데
        // 그리드가 "지금 재생 중" 표시를 하는 데 쓴다(STEP 76).
        .on('broadcast', { event: 'state' }, ({ payload }) => {
          for (const fn of this._stateListeners) fn({ screen: payload?.screen ?? null, gameId: payload?.gameId ?? null })
        })
        // 음소거 상태. 붙는 순간과, 폰이 햄버거 메뉴에서 누른 뒤 둘 다 온다.
        .on('broadcast', { event: 'muted' }, ({ payload }) => {
          for (const fn of this._mutedListeners) fn({ muted: !!payload?.muted })
        })
        .subscribe(status => {
          if (status !== 'SUBSCRIBED') return
          this._subscribed = true
          channel.send({ type: 'broadcast', event: 'join', payload: { remoteId: this._remoteId } })
        })

      const timer = setTimeout(() => finish('timeout'), timeoutMs)
    })
  }

  /**
   * 끊겼을 수 있는 연결을 다시 세운다.
   *
   * 채널이 진짜 죽었는지 **묻지 않는다** — 그 판단이 브라우저마다 다르고
   * 틀리면 조용히 실패한다. 그냥 버리고 새로 만든다.
   *
   * 기억해 둔 페어링이 없으면(처음 쓰는 기기, 유효기간 지남) 아무것도 안
   * 한다. 이미 재입장 중이면 그 Promise를 그대로 돌려준다 —
   * `visibilitychange`와 `online`이 거의 동시에 오는 경우가 흔하다.
   *
   * @returns {Promise<'approved'|'denied'|'timeout'|'none'>}
   */
  resume() {
    if (this._resuming) return this._resuming
    const saved = loadController()
    if (!saved) return Promise.resolve('none')

    this._remoteId = saved.remoteId
    this._channel?.unsubscribe()
    this._channel = null

    this._resuming = this._join(saved.code, RESUME_TIMEOUT_MS)
      .then(r => {
        if (r !== 'approved' && this._active) { this._active = false; this._emit() }
        return r
      })
      .finally(() => { this._resuming = null })
    return this._resuming
  }

  /**
   * 페이지가 새로 뜰 때 부른다(탭이 버려졌다가 다시 열린 경우).
   * 기억해 둔 페어링이 있으면 조용히 되살린다.
   */
  restore() {
    return this._active ? Promise.resolve('approved') : this.resume()
  }

  /** 주 디바이스가 `path`로 이동하게 한다 — router.navigate()가 이걸 대신 부른다. */
  sendNavigate(path) {
    if (!this._active) return
    // 아직 재구독 전이면 버리지 않고 들고 있는다. 부모가 폰을 켜자마자
    // 누르는 경우가 실제로 흔하다 — 그때 첫 명령이 사라지면 "리모컨이
    // 가끔 안 먹는다"가 된다.
    if (!this._subscribed) {
      this._pendingPath = path
      this.resume()
      return
    }
    this._channel?.send({ type: 'broadcast', event: 'command', payload: { remoteId: this._remoteId, type: 'navigate', path } })
  }

  /**
   * 화면 **안**을 짚는다 (STEP 75). `navigate`가 화면 사이를 옮기는
   * 명령이라면 이건 그 화면 안에서 포커스를 옮기고 누르는 것이다 —
   * 게임 안의 화면들은 라우트가 아니라서 `navigate`로는 닿을 수 없다.
   *
   * 이동 명령과 달리 **쌓아 두지 않는다.** 끊겨 있는 동안 누른 방향키는
   * 그냥 버린다 — 방향은 화면을 보면서 누르는 것이라, 나중에 몰아서
   * 보내면 부모가 안 본 사이에 포커스가 엉뚱한 데로 가 있다.
   *
   * @param {'left'|'right'|'up'|'down'} dir
   */
  sendDir(dir) { this._sendNow({ type: 'dir', dir }) }

  /** 지금 포커스된 것을 누른다. */
  sendOk() { this._sendNow({ type: 'ok' }) }

  /**
   * 소리(배경음악+효과음)를 켜고 끈다 — 폰 화면의 햄버거 메뉴 안 버튼 하나가
   * 부른다. `dir`·`ok`와 같은 이유로 **쌓아 두지 않는다** — 끊긴 동안 여러 번
   * 눌러도 순서가 꼬이면 부모가 기대한 것과 반대로 켜질 수 있다.
   */
  sendMute() { this._sendNow({ type: 'mute' }) }

  _sendNow(payload) {
    if (!this._active) return
    if (!this._subscribed) { this.resume(); return }
    this._channel?.send({ type: 'broadcast', event: 'command', payload: { remoteId: this._remoteId, ...payload } })
  }

  /**
   * 주 디바이스가 "지금 이게 선택돼 있다"고 알려올 때. 폰의 "지금 선택"
   * 한 줄이 구독한다 — 태블릿을 안 보고도 뭘 누르는 건지 알게 하려는 것.
   */
  onFocus(fn) {
    this._focusListeners.add(fn)
    return () => this._focusListeners.delete(fn)
  }

  /**
   * 주 디바이스가 지금 어느 화면·어느 게임인지 구독한다. 폰의 그리드가
   * "지금 재생 중" 카드를 표시하는 데 쓴다. `router.js`의 `onRouteChange`가
   * 화면이 바뀔 때마다 이미 보내고 있던 것을 여기서 받는다(STEP 76).
   */
  onState(fn) {
    this._stateListeners.add(fn)
    return () => this._stateListeners.delete(fn)
  }

  /**
   * 주 디바이스의 음소거 상태. 붙는 순간(현재 값)과 이후 바뀔 때마다 온다 —
   * 폰의 햄버거 메뉴 안 음소거 아이콘이 이걸로 맞춰진다.
   */
  onMuted(fn) {
    this._mutedListeners.add(fn)
    return () => this._mutedListeners.delete(fn)
  }

  /**
   * 끊겨 있는 동안 눌린 이동을 보낸다. **하나만 들고 있는다** —
   * 화면 이동은 뒤엣것이 앞엣것을 덮으므로 마지막 하나만 보내면 결과가
   * 같다(방향키 같은 명령이 생기면 그때는 큐가 필요하다).
   */
  _flushPending() {
    const path = this._pendingPath
    this._pendingPath = null
    if (path) this.sendNavigate(path)
  }

  /**
   * 화면이 돌아오거나 네트워크가 살아나면 다시 붙는다.
   *
   * 두 신호를 다 듣는다 — 화면만 켜지고 네트워크가 아직 안 붙는 경우도,
   * 화면은 그대로인데 와이파이만 갈아타는 경우도 있다. 겹쳐 들어와도
   * `resume()`이 하나로 합쳐 준다.
   */
  _bindLifecycle() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this._active) this.resume()
    })
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { if (this._active) this.resume() })
    }
  }

  /**
   * 조종을 끝낸다(리모컨 쪽에서 스스로 끊을 때). 주 디바이스에도 알려서
   * 그쪽 QR 아이콘도 다시 "연결 안 됨" 상태로 돌아가게 한다 — 안 알리면
   * 주 디바이스는 채널을 계속 붙잡고 있고, 다음 사람이 새 QR을 받을 수
   * 없다.
   */
  disconnect() {
    if (this._active) this._channel?.send({ type: 'broadcast', event: 'controller-left', payload: { remoteId: this._remoteId } })
    // 사람이 직접 끊은 것이므로 기억도 지운다 — 안 지우면 다음에 앱을
    // 열 때 혼자 다시 붙는다.
    clearController()
    this._forceDisconnect()
  }

  /** 상대가 먼저 끊었을 때(또는 새 연결을 시작할 때) — 알리지 않고 정리만 한다. */
  _forceDisconnect() {
    this._channel?.unsubscribe()
    this._channel = null
    this._remoteId = null
    this._code = null
    this._subscribed = false
    this._pendingPath = null
    if (this._active) { this._active = false; this._emit() }
  }
}

export const controller = new ControllerSession()
