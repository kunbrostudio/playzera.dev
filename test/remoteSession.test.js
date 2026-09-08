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
// 포커스(화면 안 짚기)는 DOM을 쓰므로 여기서는 가짜로 바꿔 끼운다 —
// 진짜 동작은 `focusNav.test.js`가 본다. 여기서 볼 것은 **명령이 옳게
// 전달되는가**뿐이다.
const focusNav = {
  enable: vi.fn(), disable: vi.fn(), move: vi.fn(), activate: vi.fn(),
  onChange: vi.fn(() => () => {}),
}
vi.mock('../src/core/focusNav.js', () => ({ focusNav }))

// 소리(배경음악·효과음)도 진짜 오디오를 안 건드리고 가짜로 바꿔 끼운다 —
// 여기서 볼 것은 **명령이 오면 두 모듈을 같이 토글하고 결과를 알리는가**뿐이다.
const bgm = { toggle: vi.fn(), isMuted: vi.fn(() => false) }
vi.mock('../src/core/bgm.js', () => bgm)
const sound = { toggle: vi.fn() }
vi.mock('../src/core/sound.js', () => sound)

vi.mock('../src/core/supabase.js', () => ({ default: { channel: (...a) => channelFn(...a) } }))

const { remoteSession, randomCode } = await import('../src/core/remote/session.js')

beforeEach(() => {
  navigate.mockReset()
  channelFn.mockClear()
  bgm.toggle.mockClear(); bgm.isMuted.mockClear(); bgm.isMuted.mockReturnValue(false)
  sound.toggle.mockClear()
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
    // 뒤이어 지금 소리 상태(`muted`)도 한 번 더 보낸다(STEP 76) — 그래서
    // 마지막 메시지가 아니라 `approved` 이벤트 자체를 찾아 확인한다.
    expect(channel._sent.find(m => m.event === 'approved')).toMatchObject({ payload: { remoteId: 'r1' } })
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

// ── 소리 끄기 명령 (STEP 76) ────────────────────────────────────
//
// 폰 컨트롤러 화면의 햄버거 메뉴 안 소리 버튼 하나가 배경음악·효과음
// 둘을 같이 끈다(게임 안 시스템바처럼 두 아이콘으로 나누지 않는다).
// 붙는 순간(현재값)에도 한 번 보내야 폰의 아이콘이 처음부터 맞는다.
describe('소리 끄기 명령', () => {
  async function paired() {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r1' })
    remoteSession.approve()
    return channel
  }

  it('mute 명령을 받으면 bgm·sound를 같이 토글하고 결과를 알린다', async () => {
    const channel = await paired()
    bgm.isMuted.mockReturnValue(true)
    channel._fire('command', { remoteId: 'r1', type: 'mute' })
    expect(bgm.toggle).toHaveBeenCalledTimes(1)
    expect(sound.toggle).toHaveBeenCalledTimes(1)
    expect(channel._sent.at(-1)).toMatchObject({ event: 'muted', payload: { muted: true } })
  })

  it('승인 전에는 mute 명령도 무시한다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('command', { remoteId: 'anything', type: 'mute' })
    expect(bgm.toggle).not.toHaveBeenCalled()
  })

  it('다른 remoteId의 mute 명령은 무시한다', async () => {
    const channel = await paired()
    channel._fire('command', { remoteId: 'someone-else', type: 'mute' })
    expect(bgm.toggle).not.toHaveBeenCalled()
  })

  it('★ 승인되는 순간 지금 소리 상태를 한 번 알린다 — 폰이 처음부터 맞는 아이콘을 보게', async () => {
    bgm.isMuted.mockReturnValue(true)
    const channel = await paired()
    expect(channel._sent.some(m => m.event === 'muted' && m.payload.muted === true)).toBe(true)
  })

  it('재연결(resume) 때도 지금 소리 상태를 다시 알린다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r-1' })
    remoteSession.approve()

    bgm.isMuted.mockReturnValue(true)
    await remoteSession.resume()
    const fresh = channelFn.mock.results.at(-1).value
    expect(fresh._sent.some(m => m.event === 'muted' && m.payload.muted === true)).toBe(true)
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

// ── 끊겼다 돌아온 리모컨 알아보기 (STEP 74) ★ ────────────────────
//
// 여기가 재연결의 진짜 함정이었다. `_onJoin`이 "이미 붙어 있으면 무시"라
// **같은 폰이 돌아와도 막혔다** — 주 디바이스는 리모컨이 사라진 걸
// 모르니까 계속 붙어 있다고 믿고 문을 안 열어 줬다. 결국 QR을 다시
// 찍어야 했는데, 폰 화면이 꺼지는 건 실사용에서 제일 흔한 일이다.
describe('재입장 알아보기', () => {
  /** 승인까지 마친 상태를 만든다. */
  async function paired() {
    const code = await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r-1' })
    remoteSession.approve()
    return { code, channel }
  }

  it('★ 같은 remoteId가 다시 join하면 승인창 없이 바로 다시 받아 준다', async () => {
    const { channel } = await paired()
    const before = channel._sent.length

    channel._fire('join', { remoteId: 'r-1' })

    // 승인 대기(pending)가 생기지 않아야 한다 — 부모에게 또 묻지 않는다
    expect(remoteSession.hasPending).toBe(false)
    // 대신 approved를 다시 쏴서 폰이 살아났음을 알게 한다
    const replies = channel._sent.slice(before).filter(m => m.event === 'approved')
    expect(replies.at(-1).payload.remoteId).toBe('r-1')
    expect(remoteSession.isPaired).toBe(true)
  })

  it('다른 remoteId는 여전히 막는다 — 동시 접속은 하나다', async () => {
    const { channel } = await paired()
    channel._fire('join', { remoteId: 'someone-else' })
    expect(remoteSession.hasPending).toBe(false)
    expect(remoteSession.isPaired).toBe(true)
  })

  it('아무도 안 붙어 있으면 예전처럼 승인 대기를 만든다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r-new' })
    expect(remoteSession.hasPending).toBe(true)
  })

  it('빈 remoteId는 무시한다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: null })
    expect(remoteSession.hasPending).toBe(false)
  })
})

describe('주 디바이스도 잠에서 깨면 다시 붙는다', () => {
  it('같은 코드로 채널을 다시 열고 리모컨에 살아났다고 알린다', async () => {
    const code = await remoteSession.startPairing()
    let channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r-1' })
    remoteSession.approve()

    channelFn.mockClear()
    await remoteSession.resume()

    expect(channelFn).toHaveBeenCalledWith(`remote-${code}`)
    const fresh = channelFn.mock.results.at(-1).value
    expect(fresh._sent.some(m => m.event === 'approved' && m.payload.remoteId === 'r-1')).toBe(true)
    expect(remoteSession.isPaired).toBe(true)
  })

  it('재연결 뒤에도 그 리모컨의 명령을 받는다', async () => {
    await remoteSession.startPairing()
    let channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r-1' })
    remoteSession.approve()

    await remoteSession.resume()
    const fresh = channelFn.mock.results.at(-1).value
    fresh._fire('command', { remoteId: 'r-1', type: 'navigate', path: '/play?id=poop-dodge' })
    expect(navigate).toHaveBeenCalledWith('/play?id=poop-dodge')
  })

  it('아무도 안 붙어 있으면 되살리지 않는다 — 오래된 QR이 다시 유효해지면 안 된다', async () => {
    await remoteSession.startPairing()   // 대기만, 승인 안 함
    channelFn.mockClear()
    await remoteSession.resume()
    expect(channelFn).not.toHaveBeenCalled()
  })

  it('연결을 끊으면 기억도 지운다', async () => {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r-1' })
    remoteSession.approve()
    remoteSession.stop()

    channelFn.mockClear()
    await remoteSession.restore()
    expect(channelFn).not.toHaveBeenCalled()
  })
})

// ── 화면 안을 짚는 명령 (STEP 75) ★ ──────────────────────────────
//
// `navigate`는 화면 **사이**를 옮기고, `dir`·`ok`는 화면 **안**을 짚는다.
// 게임 안의 화면(타이틀·준비·스토리·결과)은 라우트가 아니라서 navigate로는
// 닿을 수 없다 — 리모컨이 "게임 시작까지만 되고 그 다음이 안 되던" 이유다.
describe('방향·선택 명령', () => {
  async function paired() {
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r-1' })
    remoteSession.approve()
    return channel
  }

  beforeEach(() => {
    focusNav.enable.mockClear(); focusNav.disable.mockClear()
    focusNav.move.mockClear(); focusNav.activate.mockClear()
  })

  it('dir 명령이 포커스를 옮긴다', async () => {
    const channel = await paired()
    channel._fire('command', { remoteId: 'r-1', type: 'dir', dir: 'right' })
    expect(focusNav.move).toHaveBeenCalledWith('right')
  })

  it('네 방향 모두 전달된다', async () => {
    const channel = await paired()
    for (const d of ['left', 'right', 'up', 'down']) {
      channel._fire('command', { remoteId: 'r-1', type: 'dir', dir: d })
    }
    expect(focusNav.move).toHaveBeenCalledTimes(4)
  })

  it('이상한 방향은 무시한다', async () => {
    const channel = await paired()
    channel._fire('command', { remoteId: 'r-1', type: 'dir', dir: 'diagonal' })
    channel._fire('command', { remoteId: 'r-1', type: 'dir', dir: null })
    expect(focusNav.move).not.toHaveBeenCalled()
  })

  it('ok 명령이 지금 포커스된 것을 누른다', async () => {
    const channel = await paired()
    channel._fire('command', { remoteId: 'r-1', type: 'ok' })
    expect(focusNav.activate).toHaveBeenCalled()
  })

  it('★ 승인 안 된 리모컨의 방향·선택은 안 먹는다', async () => {
    const channel = await paired()
    channel._fire('command', { remoteId: 'someone-else', type: 'dir', dir: 'right' })
    channel._fire('command', { remoteId: 'someone-else', type: 'ok' })
    expect(focusNav.move).not.toHaveBeenCalled()
    expect(focusNav.activate).not.toHaveBeenCalled()
  })
})

describe('포커스는 리모컨이 붙어 있을 때만 켠다 ★', () => {
  it('승인되면 켜고, 끊으면 끈다', async () => {
    focusNav.enable.mockClear(); focusNav.disable.mockClear()
    await remoteSession.startPairing()
    const channel = channelFn.mock.results.at(-1).value
    channel._fire('join', { remoteId: 'r-1' })
    remoteSession.approve()
    expect(focusNav.enable).toHaveBeenCalled()

    focusNav.disable.mockClear()
    remoteSession.stop()
    expect(focusNav.disable).toHaveBeenCalled()
  })

  it('QR만 띄운 상태(아무도 안 붙음)에서는 안 켠다 — 아이 화면에 링이 뜨면 안 된다', async () => {
    focusNav.enable.mockClear()
    await remoteSession.startPairing()
    expect(focusNav.enable).not.toHaveBeenCalled()
  })
})
