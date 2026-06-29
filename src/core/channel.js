import supabase from './supabase.js'

export const MSG = {
  GAME_START:   'GAME_START',
  GAME_PAUSE:   'GAME_PAUSE',
  GAME_STOP:    'GAME_STOP',
  ROUND_CHANGE: 'ROUND_CHANGE',
  POSE_UPDATE:  'POSE_UPDATE',
}

export const MAX_DEVICES = 30

let _channel = null

// join() 은 채널 구독 완료(SUBSCRIBED)까지 기다린 뒤 resolve
export function join(sessionId) {
  if (_channel) supabase.removeChannel(_channel)

  const presenceKey = `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`
  _channel = supabase.channel(`session:${sessionId}`, {
    config: {
      broadcast: { self: false },
      presence:  { key: presenceKey },
    },
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

// presence sync 이벤트마다 callback(count) 호출
export function onPresenceSync(callback) {
  if (!_channel) return
  _channel.on('presence', { event: 'sync' }, () => callback(getPresenceCount()))
}
