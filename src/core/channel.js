import supabase from './supabase.js'

export const MSG = {
  GAME_START:   'GAME_START',
  GAME_PAUSE:   'GAME_PAUSE',
  GAME_STOP:    'GAME_STOP',
  GAME_EXIT:    'GAME_EXIT',
  ROUND_CHANGE: 'ROUND_CHANGE',
  POSE_UPDATE:  'POSE_UPDATE',
}

export const MAX_DEVICES = 30

let _channel = null
// presence sync 콜백 목록 — subscribe() 이후에도 등록 가능하도록 내부 배열로 관리
let _presenceSyncCbs = []

export function join(sessionId) {
  if (_channel) supabase.removeChannel(_channel)
  _presenceSyncCbs = []

  const presenceKey = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  _channel = supabase.channel(`session:${sessionId}`, {
    config: {
      broadcast: { self: false },
      presence:  { key: presenceKey },
    },
  })

  // presence 콜백은 반드시 subscribe() 이전에 등록해야 함 (Supabase 제약)
  // 외부에서는 onPresenceSync()로 배열에만 추가하고, 실제 디스패치는 여기서 처리
  _channel.on('presence', { event: 'sync' }, () => {
    const count = getPresenceCount()
    _presenceSyncCbs.forEach(cb => cb(count))
  })

  return new Promise(resolve => {
    _channel.subscribe(status => {
      if (status === 'SUBSCRIBED') resolve()
    })
  })
}

export function leave() {
  if (_channel) {
    supabase.removeChannel(_channel)
    _channel = null
  }
  _presenceSyncCbs = []
}

export function send(type, payload = {}) {
  if (!_channel) return
  _channel.send({ type: 'broadcast', event: type, payload })
}

export function on(type, callback) {
  if (!_channel) return
  _channel.on('broadcast', { event: type }, ({ payload }) => callback(payload))
}

// Presence ─────────────────────────────────────────────────────

export async function trackPresence(data) {
  if (!_channel) return
  return _channel.track(data)
}

export function getPresenceCount() {
  if (!_channel) return 0
  return Object.keys(_channel.presenceState()).length
}

// join() 이후 언제든 호출 가능 — 실제 Supabase 핸들러는 join() 안에서 이미 등록됨
export function onPresenceSync(callback) {
  _presenceSyncCbs.push(callback)
}
