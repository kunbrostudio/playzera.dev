import supabase, { isSupabaseConfigured } from './supabase.js'

/** dev/로컬에서 Supabase 미설정 — 던지는 에러에 이 code를 달아 호출부가 조용히 넘기게 한다. */
export class SupabaseNotConfigured extends Error {
  constructor() { super('SUPABASE_NOT_CONFIGURED'); this.code = 'SUPABASE_NOT_CONFIGURED' }
}

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

  // 미설정이면 네트워크를 안 친다 — `example.supabase.co`로 fetch가 나가
  // `ERR_NAME_NOT_RESOLVED`가 반복되던 문제(ken 지적, 9/10). 호출부
  // (`resultQueue.js`)가 `code`를 보고 큐에도 안 넣고 조용히 넘긴다.
  if (!isSupabaseConfigured) throw new SupabaseNotConfigured()

  const { data, error } = await supabase.from('game_results').insert(payload).select()
  if (error) throw error
  return data
}

// game_id / center_code 필터링 지원 범용 조회
export async function getResults({ gameId = null, limit = 20, centerCode = null } = {}) {
  if (!isSupabaseConfigured) return []   // 미설정 — 빈 목록(조회 화면이 안 깨지게)

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

// getTodayResults(sessionId)는 STEP 3에서 삭제했다. 컨트롤러 화면(여러 대 모드)에서만
// 쓰였고, session_id로 묶는다는 전제 자체가 사라졌다. 기록 화면이 필요해지면
// 위 getResults()에 기간 조건을 얹는 편이 맞다.
