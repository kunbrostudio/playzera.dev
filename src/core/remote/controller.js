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
//
// ── 타임아웃은 페어링을 지우지 않는다 (E1) ★ ────────────────────
//
// 예전에는 재입장(`resume`)이 시간 안에 `approved`를 못 받으면 `denied`와
// 똑같이 취급해 저장된 페어링까지 지웠다. 그런데 타임아웃의 제일 흔한
// 원인은 "주 디바이스(태블릿)가 아직 잠들어 있어서 채널에 아무도 없다"
// 이다 — 부모가 폰을 먼저 켜면 늘 이렇게 된다. 여기서 페어링을 지우면
// 태블릿이 깨어난 뒤에도 폰은 이미 잊어버려서 QR을 다시 찍어야 한다.
//
// 이제 셋을 가른다.
//   - `approved` : 붙었다. 페어링 저장.
//   - `denied`   : 주 디바이스가 **명시적으로 거부**했다. 그 거부가 지금
//                  저장된 페어링에 대한 것일 때만 지운다 — 다른 태블릿의
//                  QR을 스캔했다가 거부당한 것으로 멀쩡한 페어링을 지우지
//                  않는다.
//   - `timeout`  : 응답이 없었을 뿐이다. 채널만 접고 **페어링은 남긴다** —
//                  화면 복귀·네트워크 복구 때(`_bindLifecycle`) 다시 붙거나,
//                  다음 앱 실행 때 `restore()`가 되살린다. 그것만으로는 못
//                  잡는 "폰은 계속 켜 둔 채 태블릿을 나중에 켜는" 경우를
//                  위해, 페어링이 살아 있는 한 화면이 켜진 동안 몇 분간
//                  `RETRY_INTERVAL_MS` 간격으로 조용히 다시 시도한다.
//                  사용자가 직접 끊었거나(`disconnect`) 주 디바이스가
//                  끊었거나(`primary-closed`) 12시간이 지나면 `remoteStore`가
//                  이미 비어 있어 아무것도 시도하지 않는다.
//
// 낡은 콜백 방어: `_join`의 종료 처리(`finish`)는 그 사이 더 새로운 연결이
// 채널을 갈아 끼웠으면(`this._channel !== channel`) 공유 상태를 건드리지
// 않는다 — 늦게 도착한 타임아웃이 이미 성공한 새 연결을 되돌리던 race를
// 막는다.
import supabase from '../supabase.js'
import { saveController, loadController, clearController } from './remoteStore.js'

/** 재입장은 사람을 안 기다린다(승인창이 안 뜬다) — 처음 붙을 때보다 짧게 끊는다. */
const RESUME_TIMEOUT_MS = 8000

/**
 * 재입장이 타임아웃난 뒤, 페어링이 살아 있는 한 이 간격으로 조용히 다시
 * 붙어 본다 — 주 디바이스(태블릿)가 폰보다 늦게 깨어나는 흔한 경우를
 * `visibilitychange`/`online`만으로는 못 잡기 때문이다(폰 쪽엔 새 이벤트가
 * 없다). 화면이 꺼지면 멈추고, 다시 켜질 때 `_bindLifecycle`이 이어받는다.
 */
const RETRY_INTERVAL_MS = 4000

/** 자동 재시도 횟수 상한(≈3분). 그 뒤엔 화면 복귀·online·앱 재실행을 기다린다. */
const MAX_AUTO_RETRIES = 15

class ControllerSession {
  constructor() {
    this._channel = null
    this._remoteId = null
    this._code = null
    this._active = false
    this._subscribed = false
    this._resuming = null        // 진행 중인 재입장 Promise — 겹쳐 돌지 않게
    this._pendingPath = null     // 끊겨 있는 동안 눌린 이동 (뒤엣것이 이긴다)
    this._retryTimer = null      // 타임아웃 뒤 자동 재시도 타이머
    this._retryCount = 0
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

        // 이 _join이 아직 유효한가 — 도중에 더 새로운 연결(connect/resume)이
        // 채널을 갈아 끼웠으면 이 콜백은 낡은 것이다. 늦게 도착한 타임아웃이
        // 그 사이 성공한 연결을 되돌리던 race를 막는다. 낡았으면 공유 상태는
        // 건드리지 않고 이 채널만 조용히 접는다.
        if (this._channel !== channel) {
          channel.unsubscribe()
          resolve(result)
          return
        }

        if (result === 'approved') {
          this._active = true
          saveController(code, this._remoteId)
          this._flushPending()
          this._cancelRetry()
          this._retryCount = 0
          this._emit()
        } else {
          if (result === 'denied') {
            // 이 시도의 remoteId와 저장된 페어링이 같을 때만 지운다 — 다른
            // 태블릿의 QR을 스캔했다가 거부당했다고 이미 붙어 있던 페어링을
            // 지우면 안 된다.
            const saved = loadController()
            if (!saved || saved.remoteId === this._remoteId) clearController()
          }
          // 'timeout'은 페어링을 안 지운다(E1) — 다음 기회에 다시 붙는다.
          this._closeChannel(channel)
          if (this._active) { this._active = false; this._emit() }
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

    this._cancelRetry()   // 지금 직접 다시 붙는다 — 예약된 자동 재시도는 필요 없다
    this._remoteId = saved.remoteId
    this._channel?.unsubscribe()
    this._channel = null

    this._resuming = this._join(saved.code, RESUME_TIMEOUT_MS)
      .then(r => {
        // 타임아웃인데 페어링이 아직 살아 있으면(태블릿이 곧 깰 수 있다)
        // 화면이 켜져 있는 동안 조용히 다시 붙어 본다.
        //
        // `this._channel === null`이어야 한다 — 내 `finish`가 채널을 접은
        // 정상 타임아웃일 때만 null이다. 그 사이 `connect()`가 새 채널을
        // 열었으면(다른 태블릿 QR 스캔) `_channel`이 살아 있으므로, 여기서
        // 재시도를 걸어 사용자가 새로 붙는 걸 가로채지 않는다. `_active`를
        // false로 되돌리는 것도 이제 `finish`가 (채널 소유 확인 뒤) 한다.
        if (r === 'timeout' && this._channel === null && !this._active && loadController()) {
          this._scheduleRetry()
        }
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
   * 지금 자동 재접속을 시도해도 되는가.
   *
   * 붙어 있으면(끊겼을 수 있으니 새로 만든다) 당연히 시도하고, **끊겨
   * 있더라도 아직 유효한 페어링이 저장돼 있으면 시도한다** — 직전 재입장이
   * 타임아웃으로 끝났어도(주 디바이스가 아직 안 깼을 뿐) 페어링 자체는
   * 살아 있기 때문이다(E1). 사용자가 직접 끊었거나 주 디바이스가 끊었거나
   * 12시간이 지났으면 `loadController()`가 null이라 시도하지 않는다.
   */
  _canAutoResume() {
    return this._active || !!loadController()
  }

  /**
   * 재입장이 타임아웃난 뒤 자동으로 다시 붙어 본다 (위 `RETRY_INTERVAL_MS`
   * 주석 참고). 붙었거나·이미 예약돼 있거나·한도를 넘었으면 아무것도 안 한다.
   */
  _scheduleRetry() {
    if (this._retryTimer || this._active) return
    if (this._retryCount >= MAX_AUTO_RETRIES) return
    this._retryTimer = setTimeout(() => {
      this._retryTimer = null
      // 이미 붙었거나·재입장 중이거나·다른 연결(`connect()`)이 채널을 잡고
      // 있으면 손대지 않는다.
      if (this._active || this._resuming || this._channel) return
      // 화면이 꺼졌으면 멈춘다 — 다시 켜질 때 `_bindLifecycle`이 이어받는다.
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
      if (!loadController()) return   // 직접 끊었거나 12시간이 지났다
      this._retryCount++
      this.resume()   // 또 타임아웃나면 resume()의 .then이 다시 예약한다
    }, RETRY_INTERVAL_MS)
  }

  _cancelRetry() {
    clearTimeout(this._retryTimer)
    this._retryTimer = null
  }

  /**
   * 화면이 돌아오거나 네트워크가 살아나면 다시 붙는다.
   *
   * 두 신호를 다 듣는다 — 화면만 켜지고 네트워크가 아직 안 붙는 경우도,
   * 화면은 그대로인데 와이파이만 갈아타는 경우도 있다. 겹쳐 들어와도
   * `resume()`이 하나로 합쳐 준다. 사용자가 화면을 켰거나 네트워크가
   * 돌아온 건 새 기회이므로 자동 재시도 한도도 리셋한다.
   */
  _bindLifecycle() {
    if (typeof document === 'undefined') return
    const maybeResume = () => {
      if (!this._canAutoResume()) return
      this._cancelRetry()
      this._retryCount = 0
      this.resume()
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') maybeResume()
    })
    if (typeof window !== 'undefined') {
      window.addEventListener('online', maybeResume)
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

  /**
   * 채널만 접는다 — 저장된 페어링(`remoteStore`)과 `_remoteId`는 건드리지
   * 않는다. 타임아웃처럼 "지금은 못 붙었지만 페어링은 유효한" 경우에 쓴다.
   *
   * 이 프라미스가 뜨는 사이 더 새로운 `_join`이 채널을 갈아 끼웠을 수
   * 있으므로(예: `connect()`가 `_forceDisconnect` 후 새로 연다) 지금 들고
   * 있는 채널이 이 채널일 때만 상태를 비운다.
   */
  _closeChannel(channel) {
    channel.unsubscribe()
    if (this._channel === channel) {
      this._channel = null
      this._code = null
      this._subscribed = false
    }
  }

  /** 상대가 먼저 끊었을 때(또는 새 연결을 시작할 때) — 알리지 않고 정리만 한다. */
  _forceDisconnect() {
    this._cancelRetry()
    this._retryCount = 0
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
