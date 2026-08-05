// 게임별 튜토리얼 진입점 — /tutorial?id=<gameId>
//
// intro.js와 같은 구조다. 튜토리얼은 **게임팩 소유**다 — 가르칠 내용이 게임마다
// 다르고(똥 피하기는 "옆으로 비킨다", 웜업은 "점프·숙이기"), 쓰는 에셋도 다르다.
// 허브는 registry에 등록된 로더만 부르고 내용은 모른다.
//
// 이전에는 라우터가 `games/poop-dodge/tutorial.js`를 직접 import했다. 게임이 늘 때마다
// 라우터에 import를 한 줄씩 더해야 했고, 그러면 홈 화면 하나 여는 데 모든 게임의
// 튜토리얼 코드가 번들에 딸려 왔다.
//
// 튜토리얼이 없는 게임은 곧장 플레이로 넘긴다 — 없다고 막을 이유가 없다.

import { navigate } from '../core/router.js'
import { GAME_REGISTRY, getPlayRoute } from '../games/registry.js'

export async function tutorialPage(app, query) {
  const id = query.id
  const entry = GAME_REGISTRY[id]

  if (!entry) { navigate('/'); return }
  if (!entry.tutorial) { navigate(getPlayRoute(id)); return }

  // default export를 규약으로 삼는다. 이름으로 찾으면(첫 export 등) 튜토리얼이
  // 상수를 export하는 순간(TUTORIAL_TIMING 같은 것) 엉뚱한 값을 부른다.
  const mod = await entry.tutorial()
  const render = mod.default
  if (typeof render !== 'function') {
    console.warn(`[tutorial] ${id}의 튜토리얼에 default export가 없어요`)
    navigate(getPlayRoute(id))
    return
  }
  render(app, query)
}
