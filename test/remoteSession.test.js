// 리모컨 페어링 — 주 디바이스 쪽 순수 로직 (STEP 64).
//
// 실제 Supabase Realtime 왕복(네트워크)은 여기서 테스트 못 한다 — 실기기
// 둘(주 디바이스+리모컨)이 있어야 진짜 확인이 된다. 대신 채널을 가짜로
// 만들어서 이 모듈이 **받은 메시지에 맞게 옳은 상태 전이를 하는지**,
// **승인 전엔 명령을 무시하는지**, **다른 리모컨의 명령은 안 받는지**를
// 확인한다 — 네트워크가 실제로 왕복했다고 가정했을 때의 논리다.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const navigate = vi.fn()
let routeListener = null
vi.mock('../src/core/router.js', () => ({
  navigate: (...a) => navigate(...a),
  onRouteChange: fn => { routeListener = fn; return () => { routeListener = null } },
}))

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

const { remoteSession, randomCode } = await import('../src/core/remote/session.js')

beforeEach(() => {
  navigate.mockReset()
  channelFn.mockClear()
  remoteSession.stop()
})

describe('randomCode', () => {
  it('6자리다', () => {
    expect(randomCode()).toHaveLength(6)
  })
  it('헷갈리는 문자(0/O, 1/I/L)를 안 쓴다', () => {
    for (let i = 0; i < 50; i++) {
      expect(randomCode()).not.toMatch(/[01OIL]/)
    }
  })
})

describe('startPairing', () => {
  it('코드를 뽑고 채널을 구독한다', async () => {
    const code = await remoteSession.startPairing()
    expect(code).toHaveLength(6)
    expect(remoteSession.code).toBe(code)
    expect(remoteSession.isWaiting).toBe(true)
    expect(remoteSession.isPaired).toBe(false)
  })

  it('다시 부르면 이전 채널을 끊고 새 코드로 시작한다', async () => {
    const first = await remoteSession.startPairing()
    const firstChannel = channelFn.mock.results[0].value
    const unsubSpy = vi.spyOn(firstChannel, 'unsubscribe')
    const second = await remoteSession.startPairing()
    expect(second).not.toBe(first)
    expect(unsubSpy).toHaveBeenCalled()
  })
})

describe('승인 흐름', () => {
  it('join이 오면 대기(pending) 상태가 된다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    expect(remoteSession.hasPending).toBe(true)
    expect(remoteSession.isPaired).toBe(false)
  })

  it('approve()하면 연결되고 approved를 보낸다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.approve()
    expect(remoteSession.isPaired).toBe(true)
    expect(remoteSession.hasPending).toBe(false)
    expect(channel._sent.at(-1)).toMatchObject({ event: 'approved', payload: { remoteId: 'r1' } })
  })

  it('deny()하면 연결 안 되고 denied를 보낸다 — 채널은 안 끊는다(다시 시도 가능)', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.deny()
    expect(remoteSession.isPaired).toBe(false)
    expect(remoteSession.hasPending).toBe(false)
    expect(remoteSession.isWaiting).toBe(true)
    expect(channel._sent.at(-1)).toMatchObject({ event: 'denied', payload: { remoteId: 'r1' } })
  })

  it('이미 붙어 있으면 새 join 요청은 무시한다(1단계는 동시 접속 1개)', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.approve()
    channel._fire('join', { remoteId: 'r2' })
    expect(remoteSession.hasPending).toBe(false)
  })
})

describe('명령 처리', () => {
  // STEP 66 — 명령이 `start`/`stop` 둘에서 `navigate(path)` 하나로 단순화됐다.
  // 리모컨 화면 자체가 허브를 그대로 띄우므로, 게임 id 검증은 더 이상
  // session.js가 아니라 router.js(모르는 경로는 홈으로)가 맡는다.
  async function paired() {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.approve()
    return channel
  }

  it('승인된 리모컨의 navigate 명령으로 그 경로에 이동한다', async () => {
    const channel = await paired()
    channel._fire('command', { remoteId: 'r1', type: 'navigate', path: '/play?id=poop-dodge' })
    expect(navigate).toHaveBeenCalledWith('/play?id=poop-dodge')
  })

  it('path가 문자열이 아니면 무시한다', async () => {
    const channel = await paired()
    channel._fire('command', { remoteId: 'r1', type: 'navigate', path: 123 })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('승인 전에는 명령을 무시한다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('command', { remoteId: 'anything', type: 'navigate', path: '/' })
    expect(navigate).not.toHaveBeenCalled()
  })

  it('다른 remoteId의 명령은 무시한다 — 승인된 리모컨만 명령할 수 있다', async () => {
    const channel = await paired()
    channel._fire('command', { remoteId: 'someone-else', type: 'navigate', path: '/' })
    expect(navigate).not.toHaveBeenCalled()
  })
})

describe('연결 끊기 알림 (STEP 66)', () => {
  async function paired() {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.approve()
    return channel
  }

  it('리모컨이 controller-left를 보내면 세션을 정리한다', async () => {
    const channel = await paired()
    channel._fire('controller-left', { remoteId: 'r1' })
    expect(remoteSession.isPaired).toBe(false)
    expect(remoteSession.code).toBeNull()
  })

  it('다른 remoteId의 controller-left는 무시한다', async () => {
    const channel = await paired()
    channel._fire('controller-left', { remoteId: 'someone-else' })
    expect(remoteSession.isPaired).toBe(true)
  })

  it('stop()은 붙어 있던 리모컨에게 primary-closed를 보낸다', async () => {
    const channel = await paired()
    remoteSession.stop()
    expect(channel._sent.some(m => m.event === 'primary-closed' && m.payload.remoteId === 'r1')).toBe(true)
  })

  it('아무도 안 붙어 있으면 stop()이 primary-closed를 안 보낸다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    remoteSession.stop()
    expect(channel._sent.some(m => m.event === 'primary-closed')).toBe(false)
  })
})

describe('stop', () => {
  it('연결·대기를 모두 초기화한다', async () => {
    await remoteSession.startPairing()
    remoteSession.stop()
    expect(remoteSession.code).toBeNull()
    expect(remoteSession.isWaiting).toBe(false)
    expect(remoteSession.isPaired).toBe(false)
  })
})

describe('onChange', () => {
  it('상태가 바뀔 때마다 구독자에게 알린다', async () => {
    const seen = []
    const unsub = remoteSession.onChange(s => seen.push({ ...s }))
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.approve()
    unsub()
    expect(seen.some(s => s.waiting)).toBe(true)
    expect(seen.some(s => s.pending)).toBe(true)
    expect(seen.some(s => s.connected)).toBe(true)
  })
})

// ── 화면 미러링 (STEP 65) ─────────────────────────────────────
//
// 진짜 WebRTC(브라우저 전용 API)는 jsdom에 없다 — `RTCPeerConnection`을
// 가짜로 바꿔 끼워서 "언제 만들고, 언제 닫고, 신호를 옳게 주고받는가"만
// 확인한다. 영상이 실제로 뜨는지는 실기기 둘이 있어야 안다.
describe('화면 미러링', () => {
  class FakePC {
    constructor(config) {
      this.config = config
      this.tracks = []
      this.iceCandidates = []
      this.closed = false
      this.onicecandidate = null
      FakePC.instances.push(this)
    }
    addTrack(track) { this.tracks.push(track) }
    async createOffer() { return { type: 'offer', sdp: 'fake-sdp' } }
    async setLocalDescription(desc) { this.localDescription = desc }
    async setRemoteDescription(desc) { this.remoteDescription = desc }
    async addIceCandidate(c) { this.iceCandidates.push(c) }
    close() { this.closed = true }
  }
  FakePC.instances = []

  function makeCanvas(id) {
    const c = document.createElement('canvas')
    c.id = id
    c.captureStream = vi.fn(() => ({ getTracks: () => [{ id: `${id}-track` }] }))
    document.body.appendChild(c)
    return c
  }

  async function pairedWithCanvas(id = 'game-canvas') {
    const canvas = makeCanvas(id)
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.approve()
    return { channel, canvas }
  }

  beforeEach(() => {
    FakePC.instances.length = 0
    vi.stubGlobal('RTCPeerConnection', FakePC)
    document.body.innerHTML = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('mirror-request가 오고 화면에 캔버스가 있으면 pc를 만들고 offer를 보낸다', async () => {
    const { channel } = await pairedWithCanvas()
    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve(); await Promise.resolve()   // 내부 await(offer 생성 등) 흘려보내기
    expect(FakePC.instances).toHaveLength(1)
    expect(channel._sent.at(-1)).toMatchObject({ event: 'webrtc-offer', payload: { remoteId: 'r1' } })
  })

  it('다른 remoteId의 mirror-request는 무시한다', async () => {
    const { channel } = await pairedWithCanvas()
    channel._fire('mirror-request', { remoteId: 'someone-else' })
    await Promise.resolve()
    expect(FakePC.instances).toHaveLength(0)
  })

  it('캔버스가 아직 없으면 기다렸다가, 화면이 바뀌어 캔버스가 생기면 그때 시작한다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.approve()

    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve()
    expect(FakePC.instances).toHaveLength(0)   // 아직 캔버스가 없다(허브 화면 등)

    makeCanvas('r3-cv')
    routeListener?.({ path: '/play', query: { id: 'jurassic-run-3d' } })
    await Promise.resolve(); await Promise.resolve()
    expect(FakePC.instances).toHaveLength(1)
  })

  it('mirror-stop을 보내면 연결을 끊는다', async () => {
    const { channel } = await pairedWithCanvas()
    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve(); await Promise.resolve()
    const pc = FakePC.instances[0]
    channel._fire('mirror-stop', { remoteId: 'r1' })
    expect(pc.closed).toBe(true)
  })

  it('화면이 바뀌어 캔버스가 없어지면(허브로 돌아가면) 미러링을 끈다', async () => {
    const { channel } = await pairedWithCanvas()
    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve(); await Promise.resolve()
    const pc = FakePC.instances[0]

    document.body.innerHTML = ''   // 캔버스가 사라졌다 — 허브에는 캔버스가 없다
    routeListener?.({ path: '/', query: {} })
    expect(pc.closed).toBe(true)
  })

  it('다른 캔버스로 화면이 바뀌면 옛 연결을 닫고 새로 시작한다', async () => {
    const { channel } = await pairedWithCanvas('game-canvas')
    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve(); await Promise.resolve()
    const first = FakePC.instances[0]

    document.body.innerHTML = ''
    makeCanvas('r3-cv')
    routeListener?.({ path: '/play', query: { id: 'jurassic-run-3d' } })
    await Promise.resolve(); await Promise.resolve()

    expect(first.closed).toBe(true)
    expect(FakePC.instances).toHaveLength(2)
  })

  it('webrtc-answer를 받으면 pc에 원격 설명을 건다', async () => {
    const { channel } = await pairedWithCanvas()
    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve(); await Promise.resolve()
    const pc = FakePC.instances[0]
    channel._fire('webrtc-answer', { remoteId: 'r1', sdp: { type: 'answer', sdp: 'x' } })
    await Promise.resolve()
    expect(pc.remoteDescription).toEqual({ type: 'answer', sdp: 'x' })
  })

  it('다른 remoteId의 webrtc-answer는 무시한다', async () => {
    const { channel } = await pairedWithCanvas()
    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve(); await Promise.resolve()
    const pc = FakePC.instances[0]
    channel._fire('webrtc-answer', { remoteId: 'someone-else', sdp: { type: 'answer' } })
    await Promise.resolve()
    expect(pc.remoteDescription).toBeUndefined()
  })

  it('webrtc-ice를 받으면 pc에 후보를 더한다', async () => {
    const { channel } = await pairedWithCanvas()
    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve(); await Promise.resolve()
    const pc = FakePC.instances[0]
    channel._fire('webrtc-ice', { remoteId: 'r1', candidate: { candidate: 'x' } })
    await Promise.resolve()
    expect(pc.iceCandidates).toEqual([{ candidate: 'x' }])
  })

  it('stop()을 부르면 미러링도 같이 끊는다', async () => {
    const { channel } = await pairedWithCanvas()
    channel._fire('mirror-request', { remoteId: 'r1' })
    await Promise.resolve(); await Promise.resolve()
    const pc = FakePC.instances[0]
    remoteSession.stop()
    expect(pc.closed).toBe(true)
  })
})
