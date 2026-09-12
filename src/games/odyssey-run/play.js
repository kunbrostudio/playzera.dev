// 오디세이 런 — **다섯 번째 러너, 두 번째 3D 엔진 게임.**
//
// 쥬라기 대탐험(3D)과 같은 엔진(`runner3d/play3d.js`)을 쓴다 — 타이틀 →
// 카메라 준비 → 튜토리얼 → 6판 → 스테이지 전환 스토리 → Finish 스토리 →
// 결과의 한 바퀴가 전부 거기 있다. 게임팩이 갖는 것:
//
//   manifest.json  이름·그림·`levels: 6`·metrics — 허브/registry가 읽는 데이터
//   levels.js      6판이 한 표로 이어지는 난이도 곡선 + 스테이지 매핑
//   stages.js      3 스테이지의 시각 정의(팔레트·프롭·장애물 모델)
//   story.js       대사·컷 구성 (play.js에 하드코딩하지 않는다)
//   whirlpool.js   카리브디스 소용돌이 (#/lab-sea에서 이식)
//   scene.js       3 스테이지 씬 — 스테이지 경계에서 시각 레이어 재구성
//   play.js        이 몇 줄 — manifest에 story를 합쳐 엔진에 주입한다
//
// 씬을 엔진에 **주입한다** — `play3d.js`는 오디세이라는 이름을 모르고,
// `manifest.story.beats`가 있으면 스테이지 전환마다 컷을 띄운다.
import manifest from './manifest.json'
import { createScene } from './scene.js'
import { STORY } from './story.js'
import { makeRunner3dPlay } from '../runner3d/play3d.js'

// `story`는 config 모듈에서 온다 — 나머지(id·metrics·audio…)는 manifest.json.
export default makeRunner3dPlay({ ...manifest, story: STORY }, { createScene })
