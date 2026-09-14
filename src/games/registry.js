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
import odysseyRunManifest from './odyssey-run/manifest.json'
import fireRescueManifest from './fire-rescue/manifest.json'
import stoneBridgeManifest from './stone-bridge/manifest.json'
import popClickerManifest from './pop-clicker/manifest.json'
import balloonFestivalManifest from './balloon-festival/manifest.json'
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

  // 다섯 번째 러너, 두 번째 3D 게임. 쥬라기와 같은 엔진(`runner3d/play3d.js`)에
  // 자기 씬(`odyssey-run/scene.js` — 키클롭스 섬)을 주입한다. **P0는 스테이지
  // 하나짜리 슬라이스**라 `manifest.status: 'wip'`(dev에서만 허브에 보임) ·
  // `manifest.levels: 1`. 인트로·튜토리얼은 준비 화면 안내가 대신한다.
  'odyssey-run': {
    manifest: odysseyRunManifest,
    play:     () => import('./odyssey-run/play.js'),
  },

  // 클리커를 몸으로 누른다. 규칙이 한 줄("켜진 걸 따라 해")이라 인트로·튜토리얼을
  // 두지 않는다 — 플레이 화면 안의 안내가 동작을 먼저 보여준다(불 끄기와 같은 방식).
  'pop-clicker': {
    manifest: popClickerManifest,
    play:     () => import('./pop-clicker/play.js'),
  },

  // 풍선 팡팡 — arcade2d 공용 엔진(카메라 전체 화면 + 손 좌표 충돌)의 첫 게임.
  // 타이틀·인트로 스토리·플레이·엔딩·결과가 전부 `play.js` 하나 안에서
  // 돈다 — `/intro` 라우트를 따로 안 쓴다. 그래서 `getBackTo()`는 이
  // 게임에 대해 `'/'`(허브)를 낸다. **게임 처음으로 돌아가는 길은
  // `play.js`의 루프**다(STEP 76 후속 6) — 결과 화면의 "다시 하기"를
  // `getBackTo()`로 보내면 허브로 튕긴다(실제로 그랬다).
  'balloon-festival': {
    manifest: balloonFestivalManifest,
    play:     () => import('./balloon-festival/play.js'),
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

// `status: 'wip'` — 아직 완성 전인 게임. **개발 중(`npm run dev`)에는 허브에
// 보이지만 프로덕션 빌드에서는 숨는다** — `status: 'hidden'`(완성했지만
// 전략적으로 숨긴 게임, 어느 환경에서도 안 보임)과는 다르다. ken이 로컬에서
// 카드를 눌러 바로 테스트해야 하는데, `hidden`으로 두면 로컬에서도 안 보여서
// 매번 `/play?id=`를 손으로 쳐야 했다(9/5, 풍선 팡팡 작업 중 발견).
//
// ── Branch Deploy 미리보기 ★ (2026-09-14) ─────────────────────────
//
// 외부 TEST/BETA 사용자에게는 `/play?id=` 직접 접근이 아니라 실제
// 허브 흐름(HOME → 카드 → 진입)까지 보여줘야 할 때가 있다(풍선 팡팡
// Family Co-op BETA). 그렇다고 "프로덕션 빌드=DEV 아님" 규칙 자체를
// 넓히면, 지금은 `wip` 게임이 풍선 팡팡뿐이라도 **나중에 다른 게임이
// wip가 됐을 때** 그 게임까지 정식 production에 새어 나갈 위험이
// 생긴다.
//
// 그래서 두 조건을 **같이** 건다 — 하나라도 없으면 그대로 숨는다:
//   1) 그 게임 매니페스트가 `previewOnBranchDeploy: true`로 **직접
//      opt-in**했을 것(지금은 풍선 팡팡만 켜져 있다).
//   2) 지금 빌드가 Netlify **branch-deploy 컨텍스트**일 것 —
//      `netlify.toml`의 `[context.branch-deploy.environment]`에서만
//      `VITE_BRANCH_PREVIEW=true`를 심는다. `[context.production]`
//      (main 자동 배포)에는 이 변수가 없어서, 이 브랜치가 나중에
//      main에 merge돼도 정식 배포 화면은 안 바뀐다.
//
// 즉 이 한 줄은 "wip가 프로덕션에 숨는다"는 정책을 안 바꾸고, opt-in
// 안 한 wip 게임에는 전혀 영향이 없다.
const visibleNow = m => {
  if (m.status === 'hidden') return false
  if (m.status === 'wip') {
    return import.meta.env.DEV
      || (m.previewOnBranchDeploy === true && import.meta.env.VITE_BRANCH_PREVIEW === 'true')
  }
  return true
}

export const getAll = () =>
  Object.values(GAME_REGISTRY)
    .map(g => g.manifest)
    .filter(visibleNow)

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
