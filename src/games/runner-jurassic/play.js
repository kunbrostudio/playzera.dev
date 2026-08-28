// 쥬라기 대탐험 — 러너 엔진 + 쥬라기 테마.
//
// 세 번째 러너다. 코드는 여전히 없다 — 엔진은 `../runner/`, 내용은 `theme.json`.
import theme from './theme.json'
import { makeRunnerPlay } from '../runner/index.js'

export default makeRunnerPlay(theme)
