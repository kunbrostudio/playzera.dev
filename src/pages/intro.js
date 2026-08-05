// 게임별 스플래시 진입점 — /intro?id=<gameId>
//
// 인트로는 게임팩 소유다(에셋·연출·톤이 게임마다 다르다). 허브는 registry에
// 등록된 intro 로더만 호출하고 내용은 모른다.
// 인트로가 없는 게임은 곧장 플레이로 넘긴다.

import { navigate } from '../core/router.js'
import { GAME_REGISTRY, getPlayRoute } from '../games/registry.js'

export async function introPage(app, query) {
  const id = query.id
  const entry = GAME_REGISTRY[id]

  if (!entry) { navigate('/'); return }
  if (!entry.intro) { navigate(getPlayRoute(id)); return }

  const mod = await entry.intro()
  const render = mod.default
  if (typeof render !== 'function') {
    console.warn(`[intro] ${id}의 인트로에 default export가 없어요`)
    navigate(getPlayRoute(id))
    return
  }
  render(app, query)
}
