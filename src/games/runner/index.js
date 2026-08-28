// 러너 엔진의 입구 — **게임팩이 테마를 들고 여기로 들어온다.**
//
// 게임팩(`runner-space` · `runner-jungle`)의 play.js는 세 줄이면 된다.
//
//   import theme from './theme.json'
//   import { makeRunnerPlay } from '../runner/index.js'
//   export default makeRunnerPlay(theme)
//
// 예전에는 이 파일의 내용이 `warmup-obstacle/play.js`였고 웜업 전용이었다.
// 게임을 하나 더 만들려면 3,400줄을 통째로 복사하는 수밖에 없었다.

import { stageHtml, mountRunnerStyle, unmountRunnerStyle } from './legacy-shell.js'
import { onLeave } from '../../core/router.js'
import * as hubBgm from '../../core/bgm.js'
import { markPlayed } from '../../core/recent.js'
import { setTheme } from './theme.js'

/**
 * 테마 하나를 물려 플레이 화면 렌더 함수를 만든다.
 * registry가 기대하는 규약(default export = 렌더 함수)에 맞는 함수를 돌려준다.
 */
export function makeRunnerPlay(theme) {
  return async function runnerPlay(app) {
    // **boot() 전에 테마를 꽂는다.** 그 뒤로 모든 모듈이 여기서 읽는다.
    setTheme(theme)

    // 러너는 자기 BGM을 직접 튼다. 허브 BGM은 원래 꺼져 있지만 다른 게임을 하다 온
    // 경우를 대비해 한 번 더 확실히 끈다. style.css가 html/body를 덮어쓰므로
    // 나갈 때 걷어낸다.
    mountRunnerStyle()
    hubBgm.stop()
    markPlayed(theme.id)

    // main.js가 DOM을 잡기 전에 마크업이 문서에 있어야 한다.
    app.innerHTML = stageHtml()

    const { boot, destroy } = await import('./main.js')

    // 정리 등록을 boot()보다 먼저 해둔다. 로딩 중에 사용자가 뒤로 가더라도
    // destroy()가 반드시 불리게 하기 위해서다.
    onLeave(() => {
      destroy()
      unmountRunnerStyle()
    })

    await boot()
  }
}
