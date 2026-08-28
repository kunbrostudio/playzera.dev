// 정글 러너 — 러너 엔진 + 정글 테마.
//
// 코드가 없다. 엔진은 `../runner/`, 내용은 `theme.json`에 있다.
// 게임 하나가 이 파일 + JSON 두 장 + 그림 폴더로 끝나는 것이 이 구조의 목적이다.
import theme from './theme.json'
import { makeRunnerPlay } from '../runner/index.js'

export default makeRunnerPlay(theme)
