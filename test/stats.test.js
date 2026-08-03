import { describe, it, expect, beforeEach, vi } from 'vitest'

// Supabase는 부르지 않는다. 실제 DB에 테스트 기록이 쌓이면 운동 통계가 오염된다.
const saveResult = vi.fn()
vi.mock('../src/core/gameResult.js', () => ({ saveResult: (...a) => saveResult(...a) }))

const { Stats } = await import('../src/games/warmup-obstacle/stats.js')

const QUEUE = 'pz_pending_records'
const queue = () => JSON.parse(localStorage.getItem(QUEUE) || '[]')

// 실제로 몸을 움직인 판을 만든다 — 움직임이 없으면 저장 자체를 건너뛰는 게 정상이다
function playedStats({ mode = 'motion' } = {}) {
  const s = new Stats()
  s.setInputMode(mode)
  s.markPlayStart()
  s.countJump()
  s.countJump()
  s.countSquat()
  s.countSideStep()
  s.addStar(3)
  s.levelReached = 5
  return s
}

describe('Stats — 운동 기록 저장', () => {
  beforeEach(() => {
    localStorage.clear()
    saveResult.mockReset()
    saveResult.mockResolvedValue([{ id: 1 }])
  })

  describe('저장 조건', () => {
    it('움직임이 있으면 저장한다', async () => {
      const r = await playedStats().save()
      expect(r.ok).toBe(true)
      expect(saveResult).toHaveBeenCalledTimes(1)
    })

    // 타이틀만 보고 나간 판까지 저장되면 "오늘 10판" 같은 숫자가 거짓이 된다
    it('아무것도 안 하고 나간 판은 저장하지 않는다', async () => {
      const s = new Stats()
      s.setInputMode('motion')
      const r = await s.save()
      expect(r.skipped).toBe(true)
      expect(saveResult).not.toHaveBeenCalled()
    })

    // 저장 경로가 5개다 — 미션완료·게임오버·종료·탭닫기·라우팅.
    // 멱등하지 않으면 한 판이 여러 줄로 들어간다.
    it('같은 판을 두 번 저장해도 insert는 한 번', async () => {
      const s = playedStats()
      await s.save()
      const r = await s.save()
      expect(r.skipped).toBe(true)
      expect(saveResult).toHaveBeenCalledTimes(1)
    })
  })

  describe('game_results 매핑', () => {
    it('별은 score로, 도달 레벨은 rounds_cleared로 간다', async () => {
      await playedStats().save()
      const arg = saveResult.mock.calls[0][0]
      expect(arg.gameId).toBe('warmup-obstacle')   // japari-run에서 통일된 값
      expect(arg.score).toBe(3)
      expect(arg.roundsCleared).toBe(5)
    })

    it('운동 지표는 extra_data에 스네이크 케이스로 들어간다', async () => {
      await playedStats().save()
      const { extraData } = saveResult.mock.calls[0][0]
      expect(extraData.exercise).toMatchObject({ jumps: 2, squats: 1, side_steps: 1 })
      expect(extraData.input_mode).toBe('motion')
      expect(extraData.run_id).toBeTruthy()
    })

    // exercise_summary 뷰가 이 값으로 거른다. 어긋나면 키보드 기록이 운동 통계에 섞인다.
    it('키보드 모드는 input_mode로 구분되어 저장된다', async () => {
      await playedStats({ mode: 'keyboard' }).save()
      expect(saveResult.mock.calls[0][0].extraData.input_mode).toBe('keyboard')
    })

    it('모드가 확정되기 전이면 unknown', async () => {
      const s = new Stats()
      s.countJump()
      await s.save()
      expect(saveResult.mock.calls[0][0].extraData.input_mode).toBe('unknown')
    })

    it('포즈 유지는 초와 성공 횟수가 함께 남는다', async () => {
      const s = playedStats()
      s.recordPoseHold('lunge', 1.24, true)
      s.recordPoseHold('lunge', 0.8, false)
      await s.save()
      const holds = saveResult.mock.calls[0][0].extraData.exercise.pose_holds
      expect(holds).toEqual([{ pose: 'lunge', hold_sec: 2, success: 1 }])
    })
  })

  describe('duration_sec vs active_sec', () => {
    // 타이틀·카메라 준비·튜토리얼에 머문 시간이 운동량으로 잡히던 버그가 있었다.
    // 기준점은 markPlayStart()다.
    it('운동 시간의 기준은 세션 시작이 아니라 플레이 시작이다', async () => {
      const s = new Stats()
      s.sessionStartedAt = new Date(Date.now() - 120_000)  // 2분 전 타이틀 도착
      s.setInputMode('motion')
      s.countJump()
      s.markPlayStart()                                     // 지금 플레이 시작
      await s.save()

      const { extraData } = saveResult.mock.calls[0][0]
      expect(extraData.duration_sec).toBeLessThan(5)
      expect(new Date(extraData.session_started_at).getTime())
        .toBeLessThan(new Date(extraData.started_at).getTime())
    })

    it('플레이 전에 이탈하면 세션 시작을 기준으로 쓴다', () => {
      const s = new Stats()
      s.countJump()
      const rec = s.toRecord()
      expect(rec.startedAt).toBe(s.sessionStartedAt.toISOString())
    })
  })

  describe('이탈 큐', () => {
    it('저장 실패하면 큐에 쌓아두고 버리지 않는다', async () => {
      saveResult.mockRejectedValue(new Error('offline'))
      const r = await playedStats().save()
      expect(r.ok).toBe(false)
      expect(queue()).toHaveLength(1)
    })

    // visibilitychange는 탭을 잠깐 전환할 때도 발동한다.
    // 여기서 저장 완료로 표시하면 돌아와 완주해도 그 기록이 저장되지 않는다.
    it('백그라운드 전환을 여러 번 해도 큐는 1건으로 유지된다', () => {
      const s = playedStats()
      s.queueOnExit()
      s.countJump()
      s.queueOnExit()
      s.queueOnExit()
      expect(queue()).toHaveLength(1)
      expect(queue()[0].exercise.jumps).toBe(3)   // 최신 내용으로 교체됨
    })

    it('탭 전환 후 돌아와 완주하면 최종 기록이 큐를 대체한다', async () => {
      const s = playedStats()
      s.queueOnExit()
      expect(queue()).toHaveLength(1)
      await s.save()
      expect(queue()).toHaveLength(0)             // 저장 성공 시 큐에서 제거
      expect(saveResult).toHaveBeenCalledTimes(1)
    })

    it('이미 저장된 판은 큐에 넣지 않는다', async () => {
      const s = playedStats()
      await s.save()
      s.queueOnExit()
      expect(queue()).toHaveLength(0)
    })

    it('움직임 없는 판은 큐에도 넣지 않는다', () => {
      new Stats().queueOnExit()
      expect(queue()).toHaveLength(0)
    })

    it('두 판이 각각 이탈하면 큐는 2건', () => {
      playedStats().queueOnExit()
      playedStats().queueOnExit()
      expect(queue()).toHaveLength(2)
    })
  })

  describe('flushPending — 다음 접속 때 재전송', () => {
    it('성공한 건만 큐에서 빠진다', async () => {
      playedStats().queueOnExit()
      playedStats().queueOnExit()
      saveResult.mockResolvedValueOnce([{ id: 1 }]).mockRejectedValueOnce(new Error('offline'))

      const r = await Stats.flushPending()
      expect(r).toEqual({ flushed: 1, remain: 1 })
      expect(queue()).toHaveLength(1)
    })

    it('큐가 비어 있으면 아무것도 하지 않는다', async () => {
      expect(await Stats.flushPending()).toEqual({ flushed: 0, remain: 0 })
      expect(saveResult).not.toHaveBeenCalled()
    })
  })
})
