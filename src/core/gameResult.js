import supabase from './supabase.js'

export async function saveResult({
  sessionId   = null,
  gameId,
  playerName,
  score,
  roundsCleared,
  extraData   = {},
  centerCode  = null,
}) {
  const payload = {
    session_id:     sessionId,
    game_id:        gameId,
    player_name:    playerName,
    score,
    rounds_cleared: roundsCleared,
    extra_data:     extraData,
    center_code:    centerCode,
    user_id:        null,
    played_at:      new Date().toISOString(),
  }

  const { data, error } = await supabase.from('game_results').insert(payload).select()
  if (error) throw error
  return data
}

// game_id / center_code 필터링 지원 범용 조회
export async function getResults({ gameId = null, limit = 20, centerCode = null } = {}) {
  let q = supabase
    .from('game_results')
    .select('*')
    .order('played_at', { ascending: false })
    .limit(limit)

  if (gameId)     q = q.eq('game_id', gameId)
  if (centerCode) q = q.eq('center_code', centerCode)

  const { data, error } = await q
  if (error) throw error
  return data
}

// 오늘 세션 결과 조회 (컨트롤러 기록 보기용)
export async function getTodayResults(sessionId) {
  const start = new Date()
  start.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('game_results')
    .select('*')
    .eq('session_id', sessionId)
    .gte('played_at', start.toISOString())
    .order('played_at', { ascending: false })

  if (error) throw error
  return data
}
