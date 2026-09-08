// 게임 플레이 진입점 — /play?id=<gameId>
//
// 모든 게임이 이 경로 하나로 들어온다. 이전에는 `/game`(똥 피하기)과
// `/warmup`(웜업)이 따로 있었고, 게임을 추가할 때마다 라우트가 하나씩 늘었다.
//
// 허브는 게임이 무엇으로 만들어졌는지 모른다. registry에 등록된 `play` 로더를
// 부르고 `#app`을 넘길 뿐이다. 정리(웹캠·rAF·전역 리스너)는 게임팩이 라우터의
// `onLeave`로 직접 등록한다.

import { navigate } from '../core/router.js'
import { GAME_REGISTRY } from '../games/registry.js'
import { showLoadingScreen } from '../core/loadingScreen.js'

// 게임 코드(청크)를 내려받는 동안 공용 로딩 화면을 띄운다 — **모든
// 게임에 적용되는 공통 규칙**이라 게임마다 따로 안 켠다(ken 요청, 9/5).
// `render(app, query)`가 끝난 뒤 바로 놓지만, 그 화면이 자기 배경
// 그림을 더 기다려야 하면(`runner3d/screens.js`의 `mount()`처럼) 그
// 화면이 같은 로딩 화면을 참조 카운팅으로 이어받아 계속 띄워 둔다 —
// 여기서 놓는다고 화면이 바로 사라지는 게 아니다.
export async function playPage(app, query) {
  const id = query.id
  const entry = GAME_REGISTRY[id]

  if (!entry) { navigate('/'); return }

  // 개발용 더미는 플레이할 게 없다. 허브로 돌려보낸다 —
  // 빈 화면에 갇히는 것보다 낫다.
  if (!entry.play) {
    console.info(`[play] ${id}는 아직 플레이 화면이 없어요`)
    navigate('/')
    return
  }

  const loading = showLoadingScreen()
  try {
    const mod = await entry.play()
    const render = mod.default
    if (typeof render !== 'function') {
      console.warn(`[play] ${id}의 플레이 화면에 default export가 없어요`)
      navigate('/')
      return
    }
    render(app, query)
  } finally {
    loading.release()
  }
}
