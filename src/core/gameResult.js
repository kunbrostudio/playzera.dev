import supabase from './supabase.js'

export async function save(result) {
  const { data, error } = await supabase.from('game_results').insert({
    session_id: result.sessionId,
    game_id: result.gameId,
    player_name: result.playerName,
    score: result.score,
    rounds_cleared: result.roundsCleared,
    dodge_count: result.dodgeCount,
    hit_count: result.hitCount,
    reaction_avg_ms: result.reactionAvgMs,
    played_at: result.playedAt ?? new Date().toISOString(),
  })
  if (error) throw error
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
