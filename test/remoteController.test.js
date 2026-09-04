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

// ── 화면 미러링 (STEP 71 — session.js에서 되살림) ────────────────────
//
// `session.js`가 던지는 offer/answer/ICE 신호의 반대편. `RTCPeerConnection`을
// 가짜로 바꿔 끼워서 "offer를 받으면 answer로 답하는가", "ICE를 옳게
// 주고받는가", "끄면 정리되는가"만 본다.
describe('화면 미러링', () => {
  class FakePC {
    constructor(config) {
      this.config = config
      this.remoteDescription = undefined
      this.localDescription = undefined
      this.iceCandidates = []
      this.closed = false
      this.onicecandidate = null
      this.ontrack = null
      FakePC.instances.push(this)
    }
    async setRemoteDescription(desc) { this.remoteDescription = desc }
    async createAnswer() { return { type: 'answer', sdp: 'fake-answer' } }
    async setLocalDescription(desc) { this.localDescription = desc }
    async addIceCandidate(c) { this.iceCandidates.push(c) }
    close() { this.closed = true }
  }
  FakePC.instances = []

  beforeEach(() => {
    FakePC.instances.length = 0
    vi.stubGlobal('RTCPeerConnection', FakePC)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  async function paired() {
    const p = controller.connect('ABC123')
    const channel = channelFn.mock.results.at(-1).value
    const remoteId = channel._sent.find(m => m.event === 'join').payload.remoteId
    channel._fire('approved', { remoteId })
    await p
    return { channel, remoteId }
  }

  it('webrtc-offer가 오면 pc를 만들고 answer를 보낸다', async () => {
    const { channel, remoteId } = await paired()
    channel._fire('webrtc-offer', { remoteId, sdp: { type: 'offer', sdp: 'x' } })
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
    expect(FakePC.instances).toHaveLength(1)
    expect(FakePC.instances[0].remoteDescription).toEqual({ type: 'offer', sdp: 'x' })
    expect(channel._sent.at(-1)).toMatchObject({ event: 'webrtc-answer', payload: { remoteId } })
  })

  it('다른 remoteId의 webrtc-offer는 무시한다', async () => {
    const { channel } = await paired()
    channel._fire('webrtc-offer', { remoteId: 'someone-else', sdp: { type: 'offer' } })
    await Promise.resolve()
    expect(FakePC.instances).toHaveLength(0)
  })

  it('webrtc-ice를 받으면 pc에 후보를 더한다', async () => {
    const { channel, remoteId } = await paired()
    channel._fire('webrtc-offer', { remoteId, sdp: { type: 'offer' } })
    await Promise.resolve(); await Promise.resolve()
    channel._fire('webrtc-ice', { remoteId, candidate: { candidate: 'x' } })
    await Promise.resolve()
    expect(FakePC.instances[0].iceCandidates).toEqual([{ candidate: 'x' }])
  })

  it('requestMirror()는 mirror-request를 보낸다', async () => {
    const { channel, remoteId } = await paired()
    controller.requestMirror(() => {})
    expect(channel._sent.at(-1)).toMatchObject({ event: 'mirror-request', payload: { remoteId } })
  })

  it('트랙이 오면 requestMirror()에 준 콜백이 스트림을 받는다', async () => {
    const { channel, remoteId } = await paired()
    const seen = []
    controller.requestMirror(s => seen.push(s))
    channel._fire('webrtc-offer', { remoteId, sdp: { type: 'offer' } })
    await Promise.resolve(); await Promise.resolve()
    const fakeStream = { id: 'stream1' }
    FakePC.instances[0].ontrack({ streams: [fakeStream] })
    expect(seen).toEqual([fakeStream])
  })

  it('stopMirror()는 mirror-stop을 보내고 pc를 닫는다(콜백에 null)', async () => {
    const { channel, remoteId } = await paired()
    const seen = []
    controller.requestMirror(s => seen.push(s))
    channel._fire('webrtc-offer', { remoteId, sdp: { type: 'offer' } })
    await Promise.resolve(); await Promise.resolve()
    const pc = FakePC.instances[0]
    controller.stopMirror()
    expect(channel._sent.some(m => m.event === 'mirror-stop' && m.payload.remoteId === remoteId)).toBe(true)
    expect(pc.closed).toBe(true)
    expect(seen.at(-1)).toBeNull()
  })

  it('disconnect()는 미러링 중이었다면 pc도 같이 닫는다', async () => {
    const { channel, remoteId } = await paired()
    controller.requestMirror(() => {})
    channel._fire('webrtc-offer', { remoteId, sdp: { type: 'offer' } })
    await Promise.resolve(); await Promise.resolve()
    const pc = FakePC.instances[0]
    controller.disconnect()
    expect(pc.closed).toBe(true)
  })
})
