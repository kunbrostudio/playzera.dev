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
// ── 화면 미러링은 걷어냈다 (STEP 73, ken 결정) ★ ───────────────
//
// STEP 65에서 `canvas.captureStream()` + WebRTC로 만들고 STEP 66에서 껐다가
// STEP 71에서 되살렸던 기능이다. STEP 73에서 **완전히 지웠다.**
//
// ken의 판단: "미러링보다는 컨트롤러의 역할을 충실히 하면 될 거 같아. 내
// 아이가 게임을 어떻게 하는지 감시하기 위한 기능이 아니라 쉽게 컨트롤할 수
// 있게 하는 편의 기능인 거지."
//
// 구조로 봐도 맞다 — **태블릿이 화면이고 폰은 입력이다.** TV와 리모컨의
// 관계라서, 볼 사람이 이미 태블릿을 보고 있는데 폰에 같은 화면을 다시
// 그릴 이유가 없다.
//
// 게다가 이 방식엔 고칠 수 없는 구멍이 있었다. `captureStream()`은
// **캔버스만** 잡는데, HUD·버튼·결과 화면은 전부 그 위에 얹힌 DOM이라
// 안 찍힌다. 풍선 팡팡처럼 캔버스가 아예 없는 DOM 게임은 비출 것 자체가
// 없다. 화면 전체를 뜨려면 `getDisplayMedia`가 필요한데 모바일 브라우저에
// 없다 — 주 디바이스가 태블릿이면 길이 없다.
//
// 되살릴 일이 생기면 이 저장소의 STEP 65·71 커밋에서 꺼내 쓴다.
// ── 끊겼다 돌아온 리모컨을 알아본다 (STEP 74) ★ ─────────────────
//
// `_onJoin`이 "이미 붙어 있으면 무시"였다. 두 번째 리모컨을 막으려던
// 건데, **끊겼다 돌아온 같은 폰도 똑같이 막혔다.** 주 디바이스는
// 리모컨이 사라진 걸 모르므로 계속 붙어 있다고 믿고 있고, 폰은 다시
// 들어가려는데 문이 안 열린다 — 결국 QR을 다시 찍는 수밖에 없었다.
// 폰 화면이 꺼지는 건 실사용에서 제일 흔한 일이라 이게 제일 아팠다.
//
// `remoteId`가 **같으면** 재입장으로 보고 승인창 없이 바로 다시 받아
// 준다. 그 값은 승인받은 폰만 아는 무작위 토큰이라, 알고 있다는 것이 곧
// 승인받았다는 뜻이다 — 별도 확인이 필요 없다. 다른 `remoteId`는
// 예전처럼 막는다(동시 접속은 여전히 하나).
//
// 주 디바이스도 잘 수 있다(태블릿 화면 꺼짐, 탭 버려짐). 그래서 이쪽도
// 페어링을 기억해 두고 돌아오면 채널을 다시 연다 — 양쪽이 대칭이다.
import supabase from '../supabase.js'
import { navigate, onRouteChange } from '../router.js'
import { savePrimary, loadPrimary, clearPrimary } from './remoteStore.js'
import { focusNav } from '../focusNav.js'
import * as bgm from '../bgm.js'
import * as sound from '../sound.js'

const DIRS = new Set(['left', 'right', 'up', 'down'])

// 0/O, 1/I/L처럼 헷갈리는 문자를 뺀 32자 — 화면에 크게 띄워도, 사람이 옮겨
// 적어도 실수가 적다(지금은 QR만 쓰지만 코드 자체도 같이 보여준다).
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const CODE_LEN = 6

// QR을 띄운 채 아무도 안 붙으면 이만큼 뒤에 채널을 닫는다 — 계속 열어 두면
// 오래된 QR 스크린샷이 나중에 재사용될 여지가 남는다.
const JOIN_TIMEOUT_MS = 5 * 60 * 1000

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
    this._resuming = null        // 진행 중인 재연결 — 겹쳐 돌지 않게
    this._listeners = new Set()  // (state) => void

    // 화면이 바뀔 때마다 리모컨에 "지금 뭘 하고 있나"를 알려준다(붙어 있을 때만).
    onRouteChange(({ path, query }) => {
      if (!this._remoteId) return
      this._send('state', { screen: path, gameId: query?.id ?? null })
    })

    this._bindLifecycle()

    // 포커스가 옮겨질 때마다 리모컨에 이름을 보낸다.
    focusNav.onChange(({ label }) => this._sendFocus(label))
  }

  /**
   * 포커스(화면 안을 짚는 링)를 리모컨 연결에 맞춰 켜고 끈다.
   *
   * **붙어 있을 때만 켠다.** 리모컨을 안 쓰는 대부분의 경우에 관찰자와
   * rAF가 도는 걸 막으려는 것이다 — 이 저장소는 성능에 예민하다.
   * 그리고 아무도 조종하지 않는데 화면에 노란 링이 떠 있으면 아이에게는
   * 설명할 수 없는 표시가 된다.
   */
  _syncFocusNav() {
    if (this._remoteId) focusNav.enable()
    else focusNav.disable()
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
    // 연결 상태가 바뀌는 자리는 여러 곳(승인·재연결·끊기)인데 전부 여기를
    // 지난다 — 포커스 켜고 끄기를 여기 한 곳에 걸어 두면 빠뜨릴 수가 없다.
    this._syncFocusNav()
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
    await this._openChannel(this._code)

    this._joinTimer = setTimeout(() => { if (!this._remoteId) this.stop() }, JOIN_TIMEOUT_MS)
    this._emit()
    return this._code
  }

  /**
   * 채널을 열고 구독한다. 처음 QR을 열 때와 잠에서 깨어 다시 붙을 때가
   * **같은 길**을 쓴다 — 두 벌로 두면 한쪽에만 이벤트가 빠진다.
   */
  async _openChannel(code) {
    this._channel = supabase.channel(`remote-${code}`)
    this._channel
      .on('broadcast', { event: 'join' }, ({ payload }) => this._onJoin(payload?.remoteId))
      .on('broadcast', { event: 'command' }, ({ payload }) => this._onCommand(payload))
      .on('broadcast', { event: 'controller-left' }, ({ payload }) => this._onControllerLeft(payload))

    await new Promise((resolve, reject) => {
      this._channel.subscribe(status => {
        if (status === 'SUBSCRIBED') resolve()
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') reject(new Error(`[remote] 채널 연결 실패: ${status}`))
      })
    })
  }

  _onJoin(remoteId) {
    if (!remoteId) return

    // ★ 아까 그 폰이 돌아왔다 — 승인창 없이 바로 다시 받아 준다.
    // (`remoteId`를 안다는 것 자체가 이미 승인받았다는 뜻이다)
    if (remoteId === this._remoteId) {
      this._send('approved', { remoteId })
      return
    }

    // 다른 리모컨이 이미 붙어 있으면 무시한다 — 동시 접속은 하나다.
    if (this._remoteId) return

    this._pendingRemoteId = remoteId
    this._emit()
  }

  /** 화면의 승인창에서 "허용"을 눌렀을 때. */
  approve() {
    if (!this._pendingRemoteId) return
    this._remoteId = this._pendingRemoteId
    this._pendingRemoteId = null
    clearTimeout(this._joinTimer)
    savePrimary(this._code, this._remoteId)
    this._send('approved', { remoteId: this._remoteId })
    this._sendMuted()
    this._emit()
  }

  /**
   * 잠에서 깨거나 페이지가 다시 뜬 뒤, 붙어 있던 리모컨과의 채널을
   * 다시 연다. 리모컨 쪽과 마찬가지로 **살아 있는지 묻지 않고 새로
   * 만든다** — 판단이 어렵고 틀리면 조용히 실패한다.
   *
   * 기억해 둔 페어링이 없으면 아무것도 안 한다. QR만 띄워 두고 아무도
   * 안 붙은 상태(대기 중)는 되살리지 않는다 — 5분이 지나면 어차피 닫히는
   * 코드라, 잠들었다 깬 뒤에 되살리면 오래된 QR이 다시 유효해진다.
   */
  async resume() {
    if (this._resuming) return this._resuming
    const saved = this._remoteId
      ? { code: this._code, remoteId: this._remoteId }
      : loadPrimary()
    if (!saved?.code || !saved?.remoteId) return

    this._resuming = (async () => {
      this._channel?.unsubscribe()
      this._channel = null
      this._code = saved.code
      this._remoteId = saved.remoteId
      try {
        await this._openChannel(saved.code)
        // 리모컨이 우리를 죽은 줄 알고 있을 수 있다 — 살아났다고 알린다.
        this._send('approved', { remoteId: this._remoteId })
        this._sendMuted()
        this._emit()
      } catch (e) {
        console.warn('[remote] 재연결 실패:', e?.message ?? e)
      }
    })().finally(() => { this._resuming = null })
    return this._resuming
  }

  /** 페이지가 새로 떴을 때 부른다 — 기억해 둔 페어링이 있으면 되살린다. */
  restore() {
    if (this._channel || !loadPrimary()) return Promise.resolve()
    return this.resume()
  }

  _bindLifecycle() {
    if (typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this._remoteId) this.resume()
    })
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => { if (this._remoteId) this.resume() })
    }
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

    // `navigate`는 화면 사이를 옮기는 명령이고, `dir`·`ok`는 **화면 안을**
    // 짚는 명령이다(STEP 75). 게임 안의 화면들은 라우트가 아니라서
    // `navigate`로는 닿을 수 없다 — 거기를 `focusNav`가 맡는다.
    if (payload.type === 'navigate' && typeof payload.path === 'string') {
      navigate(payload.path)
      return
    }
    if (payload.type === 'dir' && DIRS.has(payload.dir)) {
      focusNav.move(payload.dir)
      return
    }
    if (payload.type === 'ok') {
      focusNav.activate()
      return
    }
    // 폰의 햄버거 메뉴 안 소리 버튼. 게임 안의 음악·효과음 버튼(systemBar.js)과
    // 같은 두 모듈을 같이 토글한다 — 리모컨은 "소리를 끈다" 하나로 단순화해
    // 아이콘 두 개를 따로 두지 않는다.
    if (payload.type === 'mute') {
      bgm.toggle()
      sound.toggle()
      this._sendMuted()
    }
  }

  /** 지금 소리 상태를 리모컨에 알린다 — 붙는 순간(현재값)과 토글 직후 둘 다. */
  _sendMuted() {
    if (this._remoteId) this._send('muted', { muted: bgm.isMuted() })
  }

  /**
   * 리모컨에 "지금 뭐가 선택돼 있나"를 알린다 — 폰의 "지금 선택 · 시작하기"
   * 한 줄이 이걸 쓴다. 태블릿을 안 보고도 뭘 누르는 건지 알게 하려는 것이다.
   */
  _sendFocus(label) {
    if (this._remoteId) this._send('focus', { label })
  }

  /** 리모컨(폰) 쪽이 스스로 연결을 끊었을 때 — 세션 전체를 정리한다. */
  _onControllerLeft(payload) {
    if (!this._remoteId || payload?.remoteId !== this._remoteId) return
    this.stop()
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
    clearPrimary()
    clearTimeout(this._joinTimer)
    this._joinTimer = null
    this._channel?.unsubscribe()
    this._channel = null
    this._code = null
    this._remoteId = null
    this._pendingRemoteId = null
    this._emit()
  }
}

export const remoteSession = new RemoteSession()
