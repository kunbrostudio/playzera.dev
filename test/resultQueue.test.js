// 서버 저장 큐 — **아이가 움직인 사실이 사라지지 않게** 하는 장치.
//
// 새 게임 둘의 기록이 기기 밖으로 안 나가고 있었다(localStorage에만 쌓였다).
// 저장을 게임팩마다 손으로 붙이던 것을 셸로 옮기면서 함께 만든 큐다.

import { describe, it, expect, beforeEach, vi } from 'vitest'

// Supabase는 부르지 않는다. 실제 DB에 테스트 기록이 쌓이면 운동 통계가 오염된다.
const saveResult = vi.fn()
vi.mock('../src/core/gameResult.js', () => ({ saveResult: (...a) => saveResult(...a) }))

const { sendResult, flushResults, queueResult, queuedCount } =
  await import('../src/core/resultQueue.js')

const payload = (runId, gameId = 'fire-rescue') => ({
  gameId,
  playerName: 'local-default',
  score: 0,
  roundsCleared: 2,
  extraData: { source: gameId, input_mode: 'motion', active_sec: 40, exercise: { high_knees: 120 }, run_id: runId },
})

beforeEach(() => {
  localStorage.clear()
  saveResult.mockReset()
  saveResult.mockResolvedValue([{ id: 1 }])
})

describe('보내기', () => {
  it('되면 그냥 보낸다 — 큐에 남기지 않는다', async () => {
    const r = await sendResult(payload('a'))
    expect(r.ok).toBe(true)
    expect(saveResult).toHaveBeenCalledTimes(1)
    expect(queuedCount()).toBe(0)
  })

  // 아이가 노는 곳은 거실이고 와이파이는 끊긴다. 그때 기록이 사라지면 안 된다.
  it('안 되면 큐에 넣는다 — 터지지 않는다', async () => {
    saveResult.mockRejectedValue(new Error('offline'))
    const r = await sendResult(payload('a'))
    expect(r.ok).toBe(false)
    expect(queuedCount()).toBe(1)
  })

  it('같은 판은 여러 건이 되지 않는다', () => {
    queueResult(payload('same'))
    queueResult(payload('same'))
    expect(queuedCount()).toBe(1)
  })

  it('다른 판은 따로 쌓인다', () => {
    queueResult(payload('a'))
    queueResult(payload('b'))
    expect(queuedCount()).toBe(2)
  })
})

describe('다시 보내기', () => {
  it('앱이 뜰 때 밀린 것을 보낸다', async () => {
    saveResult.mockRejectedValueOnce(new Error('offline'))
    await sendResult(payload('a'))
    expect(queuedCount()).toBe(1)

    const r = await flushResults()
    expect(r.flushed).toBe(1)
    expect(queuedCount()).toBe(0)
  })

  // 하나가 실패했다고 나머지까지 버리면 안 된다
  it('실패한 것만 남긴다', async () => {
    queueResult(payload('a'))
    queueResult(payload('b'))
    saveResult
      .mockResolvedValueOnce([{ id: 1 }])
      .mockRejectedValueOnce(new Error('offline'))

    const r = await flushResults()
    expect(r.flushed).toBe(1)
    expect(queuedCount()).toBe(1)
  })

  it('보낼 게 없으면 아무 일도 안 한다', async () => {
    const r = await flushResults()
    expect(r).toEqual({ flushed: 0, remain: 0 })
    expect(saveResult).not.toHaveBeenCalled()
  })

  it('저장된 값이 깨져 있어도 터지지 않는다', async () => {
    localStorage.setItem('pz_result_queue', '{망가진 값')
    expect(queuedCount()).toBe(0)
    await expect(flushResults()).resolves.toEqual({ flushed: 0, remain: 0 })
  })
})

describe('보내는 내용', () => {
  // ⚠️ `exercise` 키가 없으면 `exercise_summary` 뷰의 `WHERE extra_data ? 'exercise'`에
  //    걸려 운동 통계에서 통째로 빠진다. 똥 피하기가 실제로 그래서 한 건도 안 잡혔다.
  it('운동 통계 뷰가 요구하는 키가 들어 있다', async () => {
    await sendResult(payload('a'))
    const sent = saveResult.mock.calls[0][0]
    expect(sent.extraData).toHaveProperty('exercise')
    expect(sent.extraData).toHaveProperty('input_mode')
    expect(sent.extraData).toHaveProperty('active_sec')
    expect(sent.extraData).toHaveProperty('run_id')
  })
})
