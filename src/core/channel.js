import supabase from './supabase.js'

export const MSG = {
  GAME_START: 'GAME_START',
  GAME_PAUSE: 'GAME_PAUSE',
  GAME_STOP: 'GAME_STOP',
  ROUND_CHANGE: 'ROUND_CHANGE',
  POSE_UPDATE: 'POSE_UPDATE',
}

let _channel = null

export function join(sessionId) {
  if (_channel) supabase.removeChannel(_channel)
  _channel = supabase.channel(`session:${sessionId}`, {
    config: { broadcast: { self: false } },
  })
  _channel.subscribe()
  return _channel
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
