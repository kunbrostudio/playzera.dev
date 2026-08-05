// 게임 레지스트리 — 허브가 아는 유일한 게임 목록.
//
// **게임팩이 자기 화면을 들고 온다.** 라우터도 허브도 게임 이름을 모른다.
// 화면마다 `() => import(...)` 로더를 두는 이유는 두 가지다.
//   1. 라우터가 게임 모듈을 직접 import하면 홈 화면 하나 여는 데 모든 게임 코드가
//      번들에 딸려 온다. 게임이 20개가 되면 첫 로딩이 그만큼 느려진다.
//   2. 게임을 추가할 때 손대는 파일이 이 파일 하나로 끝난다.
//
// 화면 규약 — 각 로더가 가리키는 모듈은 **default export가 렌더 함수**여야 한다.
//   intro     선택 사항. 게임팩 고유 스플래시. 없으면 곧장 플레이로
//   tutorial  선택 사항. 처음 한 번 보여줄 설명. 없으면 곧장 플레이로
//   play      필수. 실제 게임 화면
//
// entry: 허브 목록에서 이 게임을 고를 때 갈 곳. 인트로가 있으면 인트로부터.
import poopDodgeManifest from './poop-dodge/manifest.json'
import warmupManifest from './warmup-obstacle/manifest.json'
import { getPlaceholderManifests } from './placeholders.js'

export const GAME_REGISTRY = {
  'poop-dodge': {
    manifest: poopDodgeManifest,
    intro:    () => import('./poop-dodge/intro.js'),
    tutorial: () => import('./poop-dodge/tutorial.js'),
    play:     () => import('./poop-dodge/play.js'),
  },
  'warmup-obstacle': {
    manifest: warmupManifest,
    // 웜업은 자체 타이틀 화면이 인트로 역할을 한다 — 따로 두면 화면이 하나 는다
    play:     () => import('./warmup-obstacle/play.js'),
  },
}

// 개발 중에만 더미 카드를 섞는다. 홈의 스크롤·하단 4칸 바·레일 페이징은
// 목록이 짧으면 확인 자체가 불가능하다. 프로덕션 빌드에서는 트리 셰이킹으로 빠진다.
if (import.meta.env.DEV) {
  for (const m of getPlaceholderManifests()) {
    GAME_REGISTRY[m.id] = { manifest: m, placeholder: true }
  }
}

export const getAll = () =>
  Object.values(GAME_REGISTRY)
    .map(g => g.manifest)
    .filter(m => m.status !== 'hidden')

export const getManifest = id => GAME_REGISTRY[id]?.manifest ?? null

// 실제 게임 화면. 인트로·튜토리얼을 다 지난 뒤 가는 곳.
export const getPlayRoute = id => `/play?id=${id}`

// 허브 목록에서 이 게임을 고를 때 갈 곳.
//
// 인트로가 있으면 인트로부터, 없으면 곧장 플레이다. **게임마다 다른 경로를
// 손으로 적어두지 않는다** — 예전에는 registry에 entry 문자열을 박아뒀는데,
// 라우트를 바꿀 때 여기와 라우터 두 곳을 맞춰야 했다.
export const getEntry = id => {
  const g = GAME_REGISTRY[id]
  if (!g) return '/'
  return g.intro ? `/intro?id=${id}` : getPlayRoute(id)
}
