// 게임팩 규격 — **게임을 추가할 때 지켜야 하는 약속.**
//
// 게임이 넷이 되면서 규격이 말로만 있으면 어긋나기 시작했다.
// 실제로 웜업 manifest는 `sideSteps`·`poseHolds`(카멜)라고 적혀 있었는데
// 운동 사전의 키는 `side_steps`·`pose_holds`(스네이크)였다. 아무도 안 읽는
// 필드라 몇 달을 그대로 있었고, 이제 그 필드로 **무엇을 기록할지 정한다.**

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
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

// ── Branch Deploy 미리보기 ★ (2026-09-14) ────────────────────────
//
// `visibleNow()`는 `import.meta.env.DEV`를 읽는데, vitest 자체가 DEV=true로
// 돈다(위 warmup-obstacle 검사와 달리 이 로직은 DEV=false인 실제 production
// 빌드에서만 갈린다) — 그래서 동작을 vitest 안에서 직접 재현하는 대신,
// 이 저장소의 다른 "빌드 시점에만 갈리는" 코드(STEP 103의 `#bf-diag` DEV
// 게이팅)와 같은 방식으로 **소스 문자열**을 검사해 조건이 실제로 코드에
// 박혀 있는지 못박는다.
describe('★ Branch Deploy 미리보기 — 풍선 팡팡 카드만 opt-in으로 노출(2026-09-14)', () => {
  const registrySrc = readFileSync('src/games/registry.js', 'utf8')
  const netlifyToml = readFileSync('netlify.toml', 'utf8')

  it('풍선 팡팡 매니페스트가 previewOnBranchDeploy: true로 opt-in했다', () => {
    expect(GAME_REGISTRY['balloon-festival'].manifest.previewOnBranchDeploy).toBe(true)
  })

  it('다른 게임은 이 필드로 opt-in하지 않았다 — 정책을 광범위하게 안 넓혔다', () => {
    // 지금은 wip 게임이 풍선 팡팡 하나뿐이지만(다른 게임은 active·hidden),
    // 이 필드 자체는 풍선 팡팡 매니페스트에만 있어야 한다 — 나중에 다른
    // 게임이 wip가 되더라도 opt-in을 직접 안 하면 여전히 숨어야 한다.
    const optedIn = Object.values(GAME_REGISTRY)
      .map(g => g.manifest)
      .filter(m => m.previewOnBranchDeploy === true)
    expect(optedIn.map(m => m.id)).toEqual(['balloon-festival'])
  })

  it('visibleNow가 DEV 여부와 별개로 previewOnBranchDeploy + VITE_BRANCH_PREVIEW 조건을 같이 본다', () => {
    expect(registrySrc.includes(
      "return import.meta.env.DEV\n      || (m.previewOnBranchDeploy === true && import.meta.env.VITE_BRANCH_PREVIEW === 'true')"
    )).toBe(true)
  })

  it('netlify.toml — VITE_BRANCH_PREVIEW는 branch-deploy 컨텍스트에만 있고 production에는 없다', () => {
    expect(netlifyToml.includes('[context.branch-deploy.environment]')).toBe(true)
    expect(netlifyToml.includes('VITE_BRANCH_PREVIEW = "true"')).toBe(true)
    // 실제 TOML 섹션 헤더로만 찾는다(줄 맨앞 `[context.production]`) —
    // 설명 주석 안에 같은 문자열이 나와도 그건 실제 블록이 아니다.
    expect(/^\[context\.production\]/m.test(netlifyToml), 'production 컨텍스트 블록 자체가 없어야 이 변수도 안 심긴다').toBe(false)
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
