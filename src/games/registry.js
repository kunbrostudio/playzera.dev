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
import warmupManifest from './runner-space/manifest.json'
import jungleManifest from './runner-jungle/manifest.json'
import jurassicManifest from './runner-jurassic/manifest.json'
import jurassic3dManifest from './jurassic-run-3d/manifest.json'
import fireRescueManifest from './fire-rescue/manifest.json'
import stoneBridgeManifest from './stone-bridge/manifest.json'
import popClickerManifest from './pop-clicker/manifest.json'
import { getPlaceholderManifests } from './placeholders.js'

export const GAME_REGISTRY = {
  'poop-dodge': {
    manifest: poopDodgeManifest,
    intro:    () => import('./poop-dodge/intro.js'),
    tutorial: () => import('./poop-dodge/tutorial.js'),
    play:     () => import('./poop-dodge/play.js'),
  },
  'fire-rescue': {
    manifest: fireRescueManifest,
    // 인트로·튜토리얼이 없다. 규칙이 한 줄("달리면 물이 나온다")이라
    // 설명 화면을 하나 더 두는 것보다 곧장 몸을 쓰게 하는 편이 빠르다.
    play:     () => import('./fire-rescue/play.js'),
  },
  'stone-bridge': {
    manifest: stoneBridgeManifest,
    // 규칙이 한 줄이라 인트로·튜토리얼을 따로 두지 않는다.
    // 플레이 화면 안의 안내가 동작을 먼저 보여준다 (불 끄기와 같은 방식).
    play:     () => import('./stone-bridge/play.js'),
  },
  // ── 러너 엔진을 공유하는 게임들 ──────────────────────────
  //
  // 둘 다 `games/runner/`의 같은 코드로 돈다. 다른 것은 `theme.json`뿐이다.
  // 세 번째 러너를 만들 때도 여기 한 줄 + 폴더 하나면 된다.
  'warmup-obstacle': {
    manifest: warmupManifest,
    // 러너는 자체 타이틀 화면이 인트로 역할을 한다 — 따로 두면 화면이 하나 는다
    play:     () => import('./runner-space/play.js'),
  },
  'jungle-run': {
    manifest: jungleManifest,
    play:     () => import('./runner-jungle/play.js'),
  },
  'jurassic-run': {
    manifest: jurassicManifest,
    play:     () => import('./runner-jurassic/play.js'),
  },

  // 네 번째 러너지만 **엔진이 다르다** — `runner3d/`(three.js).
  // 인트로·튜토리얼은 두지 않는다. 준비 화면의 안내가 동작을 먼저 보여준다.
  'jurassic-run-3d': {
    manifest: jurassic3dManifest,
    play:     () => import('./jurassic-run-3d/play.js'),
  },

  // 클리커를 몸으로 누른다. 규칙이 한 줄("켜진 걸 따라 해")이라 인트로·튜토리얼을
  // 두지 않는다 — 플레이 화면 안의 안내가 동작을 먼저 보여준다(불 끄기와 같은 방식).
  'pop-clicker': {
    manifest: popClickerManifest,
    play:     () => import('./pop-clicker/play.js'),
  },
}

// 개발 중에만 더미 카드를 섞는 스위치 — 홈의 스크롤·하단 4칸 바·레일
// 페이징은 목록이 짧으면 확인 자체가 불가능해서 만들었다. 프로덕션
// 빌드에서는 트리 셰이킹으로 빠진다.
//
// 지금은 꺼 둔다(ken 요청, 9/1) — 더미가 재활용해 쓰는 정사각형 아이콘이
// 실제 게임의 가로 16:9 타이틀 이미지와 섞여 보이면서 "썸네일이 이상하게
// 보인다"는 혼동을 줬다(STEP 25 대응 중 발견). 페이징·스크롤을 다시
// 눈으로 확인해야 할 때만 아래 줄을 되살린다 — placeholders.js는 지우지
// 않았다.
// if (import.meta.env.DEV) {
//   for (const m of getPlaceholderManifests()) {
//     GAME_REGISTRY[m.id] = { manifest: m, placeholder: true }
//   }
// }

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

/**
 * 플레이 화면에서 **나갈 곳.**
 *
 * `getEntry`를 그대로 쓰면 안 된다. 인트로가 없는 게임은 entry가 플레이 화면 자신이라
 * `navigate()`가 같은 해시를 다시 넣고, hashchange가 안 나서 **아무 일도 안 일어난다.**
 * 실제로 불 끄기 소방관의 [그만하기]가 안 먹혔다.
 *
 * 인트로가 있으면 한 단계씩 되짚고(잘못 눌렀을 때 되돌아가는 비용이 작다),
 * 없으면 허브로 간다.
 */
export const getBackTo = id => {
  const g = GAME_REGISTRY[id]
  return g?.intro ? `/intro?id=${id}` : '/'
}
