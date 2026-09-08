// 리모컨(폰) 쪽 조종 세션 — 순수 로직 (STEP 66).
//
// `session.js`의 반대편. 실제 Supabase Realtime 왕복은 여기서 테스트
// 못 한다 — 채널을 가짜로 만들어 "옳은 이벤트에 옳게 반응하는가"만 본다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

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
