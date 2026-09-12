// 게임팩 규격 — **게임을 추가할 때 지켜야 하는 약속.**
//
// 게임이 넷이 되면서 규격이 말로만 있으면 어긋나기 시작했다.
// 실제로 웜업 manifest는 `sideSteps`·`poseHolds`(카멜)라고 적혀 있었는데
// 운동 사전의 키는 `side_steps`·`pose_holds`(스네이크)였다. 아무도 안 읽는
// 필드라 몇 달을 그대로 있었고, 이제 그 필드로 **무엇을 기록할지 정한다.**

import { describe, it, expect } from 'vitest'
import { GAME_REGISTRY, getAll, getManifest, getEntry, getBackTo, getPlayRoute } from '../src/games/registry.js'
import { getExercise } from '../src/progress/exercises.js'

const real = Object.entries(GAME_REGISTRY).filter(([, g]) => !g.placeholder)

describe('게임팩 규격', () => {
  it('모든 게임팩에 플레이 화면이 있다', () => {
    for (const [id, g] of real) expect(typeof g.play, id).toBe('function')
  })

  it('registry의 키와 manifest의 id가 같다', () => {
    for (const [id, g] of real) expect(g.manifest.id).toBe(id)
  })

  it('허브가 그리는 데 필요한 것이 다 있다', () => {
    for (const m of getAll()) {
      expect(m.title, m.id).toBeTruthy()
      expect(m.thumbnail, m.id).toBeTruthy()
      expect(m.tags?.length, m.id).toBeGreaterThan(0)
    }
  })

  // ── 여기가 이번에 못 박는 것 ────────────────────────────────
  //
  // `metrics`는 **이 게임이 만들어내는 운동 지표의 선언**이다.
  // 셸(core/gameShell.js)의 기록기가 이 목록으로 스냅샷을 거른다 —
  // 사전에 없는 이름을 적으면 EXP에도 화면에도 안 잡히는 유령 데이터가 된다.
  it('manifest의 metrics는 전부 운동 사전에 있는 이름이다', () => {
    for (const [id, g] of real) {
      for (const key of g.manifest.metrics ?? []) {
        expect(getExercise(key), `${id} → ${key}`).toBeTruthy()
      }
    }
  })

  it('운동을 만드는 게임은 metrics를 비워두지 않는다', () => {
    for (const [id, g] of real) {
      expect((g.manifest.metrics ?? []).length, id).toBeGreaterThan(0)
    }
  })
})

// ── STEP 93 — "JAPARI RUN" 썸네일 숨김 ★ ─────────────────────────
// 인터랙션 웜업 장애물 피하기(id: warmup-obstacle)는 썸네일
// (`runner-space/manifest.json`의 `fx_title_screen.png`) 안에 박힌 타이틀
// 글자가 "JAPARI RUN"이라 정식 브랜드로 사용자 홈에 노출하기 전에 숨겼다
// (`status: 'hidden'`) — 코드·에셋·라우트는 그대로다. 말로만 적어두면
// 다음 세션이 실수로 다시 `active`로 되돌릴 수 있으니 테스트로 고정한다.
describe('★ 인터랙션 웜업(warmup-obstacle) — 사용자 노출 숨김(STEP 93)', () => {
  it('사용자 목록(getAll)에는 안 보이지만, registry에는 그대로 남아 개발 접근이 된다', () => {
    expect(getAll().some(m => m.id === 'warmup-obstacle'), 'getAll()에 노출되면 안 된다').toBe(false)
    expect(GAME_REGISTRY['warmup-obstacle'], 'registry에서 지우면 안 된다').toBeTruthy()
    expect(GAME_REGISTRY['warmup-obstacle'].manifest.status).toBe('hidden')
    expect(getManifest('warmup-obstacle'), '/play?id=로 직접 접근할 매니페스트가 있어야 한다').toBeTruthy()
    expect(GAME_REGISTRY['warmup-obstacle'].play).toBeTypeOf('function')
  })
})

describe('경로', () => {
  it('인트로가 있으면 인트로부터, 없으면 곧장 플레이', () => {
    for (const [id, g] of real) {
      expect(getEntry(id)).toBe(g.intro ? `/intro?id=${id}` : getPlayRoute(id))
    }
  })

  // 나갈 곳이 자기 자신이면 navigate()가 아무 일도 안 한다 (실제로 겪었다)
  it('나갈 곳은 절대 자기 자신이 아니다', () => {
    for (const [id] of real) expect(getBackTo(id), id).not.toBe(getPlayRoute(id))
  })

  it('모르는 게임은 허브로 보낸다', () => {
    expect(getEntry('없는게임')).toBe('/')
    expect(getManifest('없는게임')).toBe(null)
  })
})
