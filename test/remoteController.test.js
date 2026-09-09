// 리모컨(폰) 쪽 조종 세션 — 순수 로직 (STEP 66).
//
// `session.js`의 반대편. 실제 Supabase Realtime 왕복은 여기서 테스트
// 못 한다 — 채널을 가짜로 만들어 "옳은 이벤트에 옳게 반응하는가"만 본다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadController, saveController } from '../src/core/remote/remoteStore.js'

function makeFakeChannel() {
  const handlers = {}
  const sent = []
  const ch = {
    on(kind, opts, cb) { handlers[opts.event] = cb; return ch },
    subscribe(cb) { cb('SUBSCRIBED'); return ch },
    send(msg) { sent.push(msg); return Promise.resolve('ok') },
    unsubscribe() { return ch },
    _fire(event, payload) { handlers[event]?.({ payload }) },
    _sent: sent,
  }
  return ch
}

const channelFn = vi.fn(() => makeFakeChannel())
vi.mock('../src/core/supabase.js', () => ({ default: { channel: (...a) => channelFn(...a) } }))

const { controller } = await import('../src/core/remote/controller.js')

beforeEach(() => {
  channelFn.mockClear()
  controller.disconnect()
  localStorage.clear()
})

describe('connect', () => {
  it('approved를 받으면 active가 되고 코드에 맞는 채널을 연다', async () => {
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    expect(channelFn).toHaveBeenCalledWith('remote-ABC123')
    // join을 보냈는지
    expect(channel._sent.some(m => m.event === 'join')).toBe(true)
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    expect(await p).toBe('approved')
    expect(controller.active).toBe(true)
  })

  it('denied를 받으면 active가 안 되고 채널을 끊는다', async () => {
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    const unsubSpy = vi.spyOn(channel, 'unsubscribe')
    channel._fire('denied', { remoteId })
    expect(await p).toBe('denied')
    expect(controller.active).toBe(false)
    expect(unsubSpy).toHaveBeenCalled()
  })

  it('시간 안에 응답이 없으면 timeout으로 끝난다', async () => {
    vi.useFakeTimers()
    const p = controller.connect('ABC123', { timeoutMs: 1000 })
    vi.advanceTimersByTime(1000)
    expect(await p).toBe('timeout')
    expect(controller.active).toBe(false)
    vi.useRealTimers()
  })

  it('다른 remoteId의 approved/denied는 무시한다', async () => {
    vi.useFakeTimers()
    const p = controller.connect('ABC123', { timeoutMs: 500 })
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('approved', { remoteId: 'someone-else' })
    vi.advanceTimersByTime(500)
    expect(await p).toBe('timeout')
    vi.useRealTimers()
  })
})

describe('sendNavigate', () => {
  it('연결된 채널로 navigate 명령을 보낸다', async () => {
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    controller.sendNavigate('/play?id=poop-dodge')
    expect(channel._sent.at(-1)).toMatchObject({ event: 'command', payload: { remoteId, type: 'navigate', path: '/play?id=poop-dodge' } })
  })
})

describe('disconnect', () => {
  it('연결돼 있었다면 controller-left를 보내고 active를 끈다', async () => {
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    controller.disconnect()
    expect(channel._sent.some(m => m.event === 'controller-left' && m.payload.remoteId === remoteId)).toBe(true)
    expect(controller.active).toBe(false)
  })

  it('연결 전에는 controller-left를 안 보낸다', () => {
    controller.disconnect()
    expect(controller.active).toBe(false)
  })
})

describe('primary-closed 수신', () => {
  it('주 디바이스가 먼저 끊으면 active를 끈다', async () => {
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    channel._fire('primary-closed', { remoteId })
    expect(controller.active).toBe(false)
  })

  it('다른 remoteId의 primary-closed는 무시한다', async () => {
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    channel._fire('primary-closed', { remoteId: 'someone-else' })
    expect(controller.active).toBe(true)
  })
})

describe('onChange', () => {
  it('연결/해제될 때 구독자에게 알린다', async () => {
    const seen = []
    const unsub = controller.onChange(s => seen.push({ ...s }))
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    controller.disconnect()
    unsub()
    expect(seen.some(s => s.active)).toBe(true)
    expect(seen.at(-1).active).toBe(false)
  })
})

// ── 끊겼다 돌아오기 (STEP 74) ★ ──────────────────────────────────
//
// 폰 화면이 꺼지거나 다른 앱을 열면 브라우저가 탭을 재우고 채널이 끊긴다.
// 실기기에서 재현하기 어려운 상황이라 여기서 잠근다.
describe('재입장(resume)', () => {
  /** 승인까지 마친 상태를 만든다. */
  async function connected(code = 'ABC123') {
    const p = controller.connect(code)
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    return { channel, remoteId }
  }

  it('★ 같은 remoteId로 다시 들어간다 — 새로 뽑으면 승인창이 또 뜬다', async () => {
    const { remoteId } = await connected()
    channelFn.mockClear()

    const p = controller.resume()
    const fresh = channelFn.mock.results.at(-1).value
    const rejoin = fresh._sent.find(m => m.event === 'join')
    expect(rejoin.payload.remoteId).toBe(remoteId)

    fresh._fire('approved', { remoteId })
    expect(await p).toBe('approved')
    expect(controller.active).toBe(true)
  })

  it('같은 코드로 채널을 다시 연다', async () => {
    await connected('XYZ789')
    channelFn.mockClear()
    const p = controller.resume()
    expect(channelFn).toHaveBeenCalledWith('remote-XYZ789')
    const fresh = channelFn.mock.results.at(-1).value
    fresh._fire('approved', { remoteId: fresh._sent.find(m => m.event === 'join').payload.remoteId })
    await p
  })

  it('기억해 둔 페어링이 없으면 아무것도 안 한다', async () => {
    controller.disconnect()
    channelFn.mockClear()
    expect(await controller.resume()).toBe('none')
    expect(channelFn).not.toHaveBeenCalled()
  })

  it('겹쳐 불러도 채널을 하나만 연다 — visibilitychange와 online이 같이 온다', async () => {
    await connected()
    channelFn.mockClear()
    const a = controller.resume()
    const b = controller.resume()
    expect(a).toBe(b)
    expect(channelFn).toHaveBeenCalledTimes(1)
    const fresh = channelFn.mock.results.at(-1).value
    fresh._fire('approved', { remoteId: fresh._sent.find(m => m.event === 'join').payload.remoteId })
    await a
  })

  it('주 디바이스가 사라졌으면(응답 없음) 연결을 놓는다', async () => {
    vi.useFakeTimers()
    await connected()
    const p = controller.resume()
    await vi.advanceTimersByTimeAsync(9000)
    expect(await p).toBe('timeout')
    expect(controller.active).toBe(false)
    vi.useRealTimers()
  })

  it('사람이 직접 끊으면 기억도 지워서 혼자 다시 안 붙는다', async () => {
    await connected()
    controller.disconnect()
    channelFn.mockClear()
    expect(await controller.resume()).toBe('none')
    expect(channelFn).not.toHaveBeenCalled()
  })

  it('주 디바이스가 끊었다고 알려와도 기억을 지운다', async () => {
    const { channel, remoteId } = await connected()
    channel._fire('primary-closed', { remoteId })
    expect(controller.active).toBe(false)
    channelFn.mockClear()
    expect(await controller.resume()).toBe('none')
  })
})

// ── 타임아웃은 페어링을 지우지 않는다 (E1) ★ ────────────────────
//
// 재입장이 시간 안에 `approved`를 못 받는 제일 흔한 원인은 "주 디바이스
// (태블릿)가 아직 잠들어 있어서 채널에 아무도 없다"이다. 여기서 페어링을
// 지우면 태블릿이 깨어난 뒤에도 폰은 이미 잊어버려서 QR을 다시 찍어야
// 한다. `denied`(명시적 거부)·`primary-closed`·사용자 `disconnect`만
// 페어링을 지운다.
describe('타임아웃은 페어링을 지우지 않는다 (E1)', () => {
  async function connected(code = 'ABC123') {
    const p = controller.connect(code)
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    return { channel, remoteId }
  }

  it('★ resume 타임아웃 뒤에도 저장된 페어링이 남아 있다', async () => {
    vi.useFakeTimers()
    const { remoteId } = await connected('XYZ789')
    expect(loadController()).toMatchObject({ code: 'XYZ789', remoteId })

    const p = controller.resume()
    await vi.advanceTimersByTimeAsync(9000)
    expect(await p).toBe('timeout')

    expect(controller.active).toBe(false)
    // 페어링은 그대로 — 다음 기회에 다시 붙을 수 있다
    expect(loadController()).toMatchObject({ code: 'XYZ789', remoteId })
    vi.useRealTimers()
  })

  it('★ 타임아웃으로 놓은 뒤 다시 resume하면 승인창 없이 같은 remoteId로 붙는다', async () => {
    vi.useFakeTimers()
    const { remoteId } = await connected()

    const p1 = controller.resume()
    await vi.advanceTimersByTimeAsync(9000)
    expect(await p1).toBe('timeout')
    vi.useRealTimers()

    // 태블릿이 이제 깨어났다 — 두 번째 시도는 붙는다
    channelFn.mockClear()
    const p2 = controller.resume()
    const fresh = channelFn.mock.results.at(-1).value
    const rejoin = fresh._sent.find(m => m.event === 'join')
    expect(rejoin.payload.remoteId).toBe(remoteId)   // 새로 안 뽑았다
    fresh._fire('approved', { remoteId })
    expect(await p2).toBe('approved')
    expect(controller.active).toBe(true)
  })

  it('denied는 여전히 페어링을 지운다', async () => {
    const { channel, remoteId } = await connected()
    channelFn.mockClear()
    const p = controller.resume()
    const fresh = channelFn.mock.results.at(-1).value
    fresh._fire('denied', { remoteId })
    expect(await p).toBe('denied')
    expect(loadController()).toBeNull()
  })

  it('connect() 타임아웃이 다른 태블릿에 붙어 있던 페어링을 지우지 않는다', async () => {
    // tablet A와 이미 페어링돼 있다
    const T = 1_700_000_000_000
    saveController('AAAA11', 'r-a', T)
    vi.useFakeTimers()
    // tablet B의 QR을 새로 스캔했는데 B가 승인을 안 한다
    const p = controller.connect('BBBB22', { timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    expect(await p).toBe('timeout')
    vi.useRealTimers()
    // A와의 페어링은 그대로여야 한다
    expect(loadController(T + 1000)).toMatchObject({ code: 'AAAA11', remoteId: 'r-a' })
  })

  it('_canAutoResume — 페어링이 저장돼 있으면 true, 직접 끊으면 false', () => {
    expect(controller._canAutoResume()).toBe(false)   // 아무것도 없음

    // 타임아웃으로 놓인 상태를 흉내낸다 — 안 붙었지만 페어링은 남아 있다
    saveController('CCCC33', 'r-c', Date.now())
    expect(controller._canAutoResume()).toBe(true)

    controller.disconnect()   // clearController를 부른다
    expect(controller._canAutoResume()).toBe(false)
  })
})

// ── 낡은 콜백과 겹친 시도 (Codex 리뷰 #2·#3) ★ ──────────────────
//
// E1이 타임아웃에도 채널·프라미스를 남기면서, 그 사이 새 연결이 끼어들면
// 낡은 콜백이 뒤늦게 공유 상태를 되돌리던 race가 생겼다. `finish`는 그
// 사이 채널이 갈렸으면(`this._channel !== channel`) 아무것도 안 건드리고,
// `denied`는 지금 저장된 페어링에 대한 거부일 때만 지운다.
describe('낡은 콜백과 겹친 시도', () => {
  async function connected(code = 'ABC123') {
    const p = controller.connect(code)
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    return { channel, remoteId }
  }

  it('★ 늦게 도착한 resume 타임아웃이 그 사이 성공한 새 연결을 되돌리지 않는다', async () => {
    vi.useFakeTimers()
    saveController('AAAA11', 'r-a')          // 태블릿 A와 페어링(저장), 지금 A는 잠들어 있다
    const pResume = controller.resume()      // A로 재입장 — chanA, 8초 타이머
    const chanA = channelFn.mock.results.at(-1).value

    // 재입장이 끝나기 전에 새 QR(태블릿 B)을 스캔했다
    const pConnect = controller.connect('BBBB22')
    const chanB = channelFn.mock.results.at(-1).value
    const ridB = chanB._sent.find(m => m.event === 'join').payload.remoteId
    chanB._fire('approved', { remoteId: ridB })
    expect(await pConnect).toBe('approved')
    expect(controller.active).toBe(true)     // B에 붙었다

    // 이제 A의 8초 타임아웃이 뒤늦게 발동한다
    await vi.advanceTimersByTimeAsync(8000)
    expect(await pResume).toBe('timeout')

    // B 연결은 살아 있어야 한다 — 낡은 타임아웃이 되돌리면 안 된다
    expect(controller.active).toBe(true)
    expect(chanA).not.toBe(chanB)
    vi.useRealTimers()
  })

  it('★ 다른 태블릿의 QR을 스캔했다가 거부당해도 기존 페어링은 남는다', async () => {
    saveController('AAAA11', 'r-a')          // 태블릿 A와 이미 페어링돼 있다
    const p = controller.connect('BBBB22')   // 태블릿 B의 QR을 새로 스캔
    const chanB = channelFn.mock.results.at(-1).value
    const ridB = chanB._sent.find(m => m.event === 'join').payload.remoteId
    chanB._fire('denied', { remoteId: ridB })   // B가 거부한다
    expect(await p).toBe('denied')
    // A와의 페어링은 그대로여야 한다
    expect(loadController()).toMatchObject({ code: 'AAAA11', remoteId: 'r-a' })
  })
})

// ── 타임아웃 뒤 자동 재시도 (Codex 리뷰 #1) ★ ──────────────────
//
// `visibilitychange`·`online`만으로는 "폰은 계속 켜 둔 채 태블릿을 나중에
// 켜는" 흔한 경우를 못 잡는다 — 폰 쪽에 새 이벤트가 없다. 페어링이 살아
// 있는 한 화면이 켜진 동안 몇 분간 조용히 다시 붙어 본다.
describe('타임아웃 뒤 자동 재시도', () => {
  async function connected(code = 'ABC123') {
    const p = controller.connect(code)
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    return { channel, remoteId }
  }

  it('★ 아무 이벤트 없이도 스스로 다시 붙어 본다 (태블릿이 나중에 깸)', async () => {
    vi.useFakeTimers()
    const { remoteId } = await connected('XYZ789')

    const p = controller.resume()
    await vi.advanceTimersByTimeAsync(8000)
    expect(await p).toBe('timeout')
    expect(controller.active).toBe(false)

    // 태블릿이 아직 안 깼다 — 아무 이벤트도 없이 기다린다
    channelFn.mockClear()
    await vi.advanceTimersByTimeAsync(4000)        // 재시도 간격
    expect(channelFn).toHaveBeenCalled()           // 스스로 새 채널을 열었다
    const retryChan = channelFn.mock.results.at(-1).value
    expect(retryChan._sent.find(m => m.event === 'join').payload.remoteId).toBe(remoteId)

    // 이번엔 태블릿이 깨어나 승인한다
    retryChan._fire('approved', { remoteId })
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.active).toBe(true)
    vi.useRealTimers()
  })

  it('붙고 나면 재시도를 멈춘다', async () => {
    vi.useFakeTimers()
    const { remoteId } = await connected('XYZ789')
    const p = controller.resume()
    await vi.advanceTimersByTimeAsync(8000)
    await p

    await vi.advanceTimersByTimeAsync(4000)        // 첫 재시도
    const retryChan = channelFn.mock.results.at(-1).value
    retryChan._fire('approved', { remoteId })
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.active).toBe(true)

    channelFn.mockClear()
    await vi.advanceTimersByTimeAsync(60000)
    expect(channelFn).not.toHaveBeenCalled()       // 더는 안 붙어 본다
    vi.useRealTimers()
  })

  it('직접 끊으면 예약된 재시도도 멈춘다', async () => {
    vi.useFakeTimers()
    await connected('XYZ789')
    const p = controller.resume()
    await vi.advanceTimersByTimeAsync(8000)
    await p

    controller.disconnect()                        // clearController + _cancelRetry
    channelFn.mockClear()
    await vi.advanceTimersByTimeAsync(60000)
    expect(channelFn).not.toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('재시도는 무한하지 않다 — 한도에서 멈춘다', async () => {
    vi.useFakeTimers()
    await connected('XYZ789')
    const p = controller.resume()
    await vi.advanceTimersByTimeAsync(8000)
    await p

    // 재시도가 계속 타임아웃난다 — 시간을 크게 흘린다
    await vi.advanceTimersByTimeAsync(40 * (4000 + 8000))
    const plateau = controller._retryCount
    expect(plateau).toBeGreaterThan(0)
    expect(plateau).toBeLessThanOrEqual(15)

    channelFn.mockClear()
    await vi.advanceTimersByTimeAsync(20 * (4000 + 8000))
    expect(controller._retryCount).toBe(plateau)   // 더 안 올라간다
    expect(channelFn).not.toHaveBeenCalled()       // 더 안 붙어 본다
    vi.useRealTimers()
  })

  it('화면 복귀(visibilitychange)가 재시도 한도를 리셋한다', async () => {
    vi.useFakeTimers()
    const { remoteId } = await connected('XYZ789')
    const p = controller.resume()
    await vi.advanceTimersByTimeAsync(8000)
    await p
    await vi.advanceTimersByTimeAsync(40 * (4000 + 8000))   // 한도까지 소진
    expect(controller._retryCount).toBeGreaterThan(0)

    channelFn.mockClear()
    document.dispatchEvent(new Event('visibilitychange'))   // 부모가 폰을 다시 켰다
    expect(controller._retryCount).toBe(0)                  // 한도 리셋

    // maybeResume이 새로 연 채널을 정리한다(테스트를 깔끔히 끝낸다)
    const chan = channelFn.mock.results.at(-1).value
    chan._fire('approved', { remoteId })
    await vi.advanceTimersByTimeAsync(0)
    expect(controller.active).toBe(true)
    vi.useRealTimers()
  })
})

describe('끊겨 있는 동안 누른 명령 ★', () => {
  it('재구독 전에 누른 이동을 버리지 않고 붙은 뒤에 보낸다', async () => {
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p

    // 채널이 죽은 상태를 흉내낸다 — 구독 안 된 것으로 표시
    controller._subscribed = false
    channelFn.mockClear()
    controller.sendNavigate('/play?id=poop-dodge')

    const fresh = channelFn.mock.results.at(-1).value
    fresh._fire('approved', { remoteId })
    await controller._resuming

    const cmd = fresh._sent.find(m => m.event === 'command')
    expect(cmd?.payload).toMatchObject({ type: 'navigate', path: '/play?id=poop-dodge' })
  })

  it('연결이 없으면 명령을 아예 안 보낸다', async () => {
    controller.disconnect()
    channelFn.mockClear()
    controller.sendNavigate('/play?id=x')
    expect(channelFn).not.toHaveBeenCalled()
  })
})

// ── 폰 컨트롤러 화면 배선 (STEP 76) ──────────────────────────────
//
// 화면 자체(그리드·D-pad·탭바)는 DOM이 있어야 해서 여기서 못 본다 —
// 여기서 보는 건 그 화면이 부를 채널 메서드 세 개(`sendMute`·`onState`·
// `onMuted`)가 옳게 배선됐는가뿐이다.
describe('소리 끄기 · 상태 구독 (STEP 76)', () => {
  async function connected(code = 'ABC123') {
    const p = controller.connect(code)
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    return { channel, remoteId }
  }

  it('sendMute — 연결된 채널로 mute 명령을 보낸다', async () => {
    const { channel, remoteId } = await connected()
    controller.sendMute()
    expect(channel._sent.at(-1)).toMatchObject({ event: 'command', payload: { remoteId, type: 'mute' } })
  })

  it('onMuted — 주 디바이스가 보낸 소리 상태를 받는다', async () => {
    const { channel } = await connected()
    const seen = []
    const unsub = controller.onMuted(s => seen.push(s))
    channel._fire('muted', { muted: true })
    expect(seen).toEqual([{ muted: true }])
    unsub()
    channel._fire('muted', { muted: false })
    expect(seen).toHaveLength(1)   // 해지 후엔 안 들어온다
  })

  it('onState — 주 디바이스의 화면·게임 id를 받는다', async () => {
    const { channel } = await connected()
    const seen = []
    controller.onState(s => seen.push(s))
    channel._fire('state', { screen: '/play', gameId: 'poop-dodge' })
    expect(seen).toEqual([{ screen: '/play', gameId: 'poop-dodge' }])
  })

  it('onState — 값이 없으면 null로 채운다', async () => {
    const { channel } = await connected()
    const seen = []
    controller.onState(s => seen.push(s))
    channel._fire('state', {})
    expect(seen).toEqual([{ screen: null, gameId: null }])
  })
})
