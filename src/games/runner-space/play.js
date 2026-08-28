// 우주 놀이터 (JAPARI RUN) — 러너 엔진 + 우주 테마.
//
// 게임팩이 갖는 것은 **이 세 줄과 JSON 두 장**이다. 엔진은 `../runner/`에 있다.
import theme from './theme.json'
import { makeRunnerPlay } from '../runner/index.js'

export default makeRunnerPlay(theme)
