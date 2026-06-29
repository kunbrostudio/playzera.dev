import supabase from './supabase.js'

export async function save(result) {
  console.log('[gameResult] save() 호출됨:', result)

  const payload = {
    session_id: result.sessionId,
    game_id: result.gameId,
    player_name: result.playerName,
    score: result.score,
    rounds_cleared: result.roundsCleared,
    dodge_count: result.dodgeCount,
    hit_count: result.hitCount,
    reaction_avg_ms: result.reactionAvgMs ?? null,
    played_at: result.playedAt ?? new Date().toISOString(),
  }
  console.log('[gameResult] Supabase insert payload:', payload)

  const { data, error } = await supabase.from('game_results').insert(payload).select()

  if (error) {
    console.error('[gameResult] 저장 실패 ❌', error)
    throw error
  }
  console.log('[gameResult] 저장 성공 ✅', data)
  return data
}

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
