// 게임 레지스트리 — 허브가 아는 유일한 게임 목록.
//
// entry: 허브 목록에서 이 게임을 고를 때 이동할 라우트.
//   게임팩 인터페이스 통일(STEP 5) 전까지는 게임마다 진입 경로가 다르다.
//   · poop-dodge      → 자체 스플래시(intro) 경유
//   · warmup-obstacle → 자체 부트스트랩(main.js) 경유
//   STEP 5 이후에는 전부 `/play?id=...` 하나로 합쳐지고 이 필드는 사라진다.
import poopDodgeManifest from './poop-dodge/manifest.json'
import warmupManifest from './warmup-obstacle/manifest.json'
import { getPlaceholderManifests } from './placeholders.js'

export const GAME_REGISTRY = {
  'poop-dodge': {
    manifest: poopDodgeManifest,
    entry: '/intro?id=poop-dodge',
    intro: () => import('./poop-dodge/intro.js'),
    load: () => import('./poop-dodge/game.js'),
  },
  'warmup-obstacle': {
    manifest: warmupManifest,
    entry: '/warmup',
    load: () => import('./warmup-obstacle/main.js'),
  },
}

// 개발 중에만 더미 카드를 섞는다. 홈의 스크롤·하단 4칸 바·레일 페이징은
// 목록이 짧으면 확인 자체가 불가능하다. 프로덕션 빌드에서는 트리 셰이킹으로 빠진다.
if (import.meta.env.DEV) {
  for (const m of getPlaceholderManifests()) {
    GAME_REGISTRY[m.id] = { manifest: m, entry: null, placeholder: true }
  }
}

export const getAll = () =>
  Object.values(GAME_REGISTRY)
    .map(g => g.manifest)
    .filter(m => m.status !== 'hidden')

export const getManifest = id => GAME_REGISTRY[id]?.manifest ?? null

export const getEntry = id => GAME_REGISTRY[id]?.entry ?? `/game?id=${id}`
