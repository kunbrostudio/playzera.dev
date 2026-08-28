// 웜업(JAPARI RUN) 페이지.
//
// STEP 1의 warmupLegacy.js를 대체한다. 달라진 점은 재진입이다 —
// main.js가 boot()/destroy()를 내보내므로 허브 → 웜업 → 허브 → 웜업이
// 새로고침 없이 돌아간다. 라우터의 onLeave 훅으로 정리 시점을 잡는다.
//
// STEP 5(게임팩화)에서 화면 소유권을 허브/게임팩으로 나눌 때
// legacy-shell.js와 함께 사라진다.

import { STAGE_HTML, mountWarmupStyle, unmountWarmupStyle } from './legacy-shell.js'
import { onLeave } from '../../core/router.js'
import * as hubBgm from '../../core/bgm.js'
import { markPlayed } from '../../core/recent.js'

export default async function warmupPlay(app) {
  // 웜업은 자기 BGM(bgm_strawberry_lane)을 직접 튼다. 허브 BGM은 원래 꺼져 있지만
  // 다른 게임을 하다 온 경우를 대비해 한 번 더 확실히 끈다.
  // 또 style.css가 html/body를 덮어쓰므로 나갈 때 걷어낸다.
  mountWarmupStyle()
  hubBgm.stop()
  markPlayed('warmup-obstacle')

  // main.js가 DOM을 잡기 전에 마크업이 문서에 있어야 한다.
  app.innerHTML = STAGE_HTML

  const { boot, destroy } = await import('./main.js')

  // 정리 등록을 boot()보다 먼저 해둔다. 로딩 중에 사용자가 뒤로 가더라도
  // destroy()가 반드시 불리게 하기 위해서다.
  onLeave(() => {
    destroy()
    unmountWarmupStyle()
  })

  await boot()
}
