// 서버 저장 + 실패하면 큐에 — **모든 게임이 같이 쓴다.**
//
// ── 왜 생겼나 ────────────────────────────────────────────────
//
// 새로 만든 게임 둘(불 끄기·돌다리)의 기록이 **기기 밖으로 나가지 않고 있었다.**
// `progress/state.js`(localStorage)에는 쌓이는데 Supabase에는 한 건도 없었다.
// "운동 데이터가 쌓이는 것이 이 서비스의 존재 이유"인데 유산소·균형 기록이
// 그 아이의 브라우저에만 남는다는 뜻이다.
//
// 원인은 저장이 **게임팩마다 손으로** 붙어 있었던 것이다 — 똥 피하기와 웜업만
// `saveResult`를 부르고, 새 게임은 아무도 안 붙였다. 셸이 대신 부르게 하면
// 앞으로 만드는 게임은 그냥 따라온다.
//
// ── 왜 큐인가 ────────────────────────────────────────────────
//
// 아이가 노는 곳은 거실이고 기기는 태블릿이다. 와이파이가 잠깐 끊기는 일은
// 예외가 아니라 일상이다. 그때 기록이 사라지면 **아이가 움직인 사실이 사라진다.**
// 실패하면 localStorage에 넣고 다음 접속 때 다시 보낸다.
//
// 웜업에도 같은 방식의 큐가 있다(`warmup-obstacle/stats.js`). 그쪽은 웜업 고유의
// 기록 형식을 담고, 여기는 **이미 완성된 저장 payload**를 담는다. 그래서 키를 나눴다 —
// 형식이 다른 두 가지를 한 통에 넣으면 재전송에서 반드시 깨진다.

import { saveResult } from './gameResult.js'

const KEY = 'pz_result_queue'

const read = () => {
  try {
    const q = JSON.parse(localStorage.getItem(KEY) ?? '[]')
    return Array.isArray(q) ? q : []
  } catch { return [] }
}

const write = q => {
  try { localStorage.setItem(KEY, JSON.stringify(q)) } catch { /* 사파리 프라이빗 등 */ }
}

/**
 * 큐에 넣는다. **같은 판(run_id)이 이미 있으면 갈아 끼운다** —
 * 중간에 나갔다 들어오기를 반복해도 한 판이 여러 건으로 늘어나지 않는다.
 */
export function queueResult(payload) {
  const runId = payload?.extraData?.run_id
  const q = read()
  const i = runId ? q.findIndex(p => p?.extraData?.run_id === runId) : -1
  if (i >= 0) q[i] = payload
  else q.push(payload)
  write(q)
}

export function queuedCount() { return read().length }

/**
 * 보내고, 실패하면 큐에 넣는다.
 *
 * **게임을 막지 않는다.** 저장이 안 됐다고 결과 화면이 안 뜨면 아이 입장에서는
 * 그냥 고장 난 것이다. 조용히 큐에 넣고 다음에 보낸다.
 */
export async function sendResult(payload) {
  try {
    await saveResult(payload)
    return { ok: true }
  } catch (e) {
    console.info('[resultQueue] 저장 실패 — 큐에 넣는다:', e?.message ?? e)
    queueResult(payload)
    return { ok: false, queued: true }
  }
}

/**
 * 밀린 것을 다시 보낸다. 앱이 뜰 때 한 번 부른다.
 * 성공한 것만 큐에서 빼고 실패분은 남긴다 — 다음 기회에 다시 시도한다.
 */
export async function flushResults() {
  const q = read()
  if (!q.length) return { flushed: 0, remain: 0 }

  const remain = []
  let flushed = 0
  for (const payload of q) {
    try { await saveResult(payload); flushed++ }
    catch { remain.push(payload) }
  }
  write(remain)
  if (flushed) console.info(`[resultQueue] ${flushed}건 전송 완료, ${remain.length}건 남음`)
  return { flushed, remain: remain.length }
}
