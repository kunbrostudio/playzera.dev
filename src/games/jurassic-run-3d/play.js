// 쥬라기 런 3D — **네 번째 러너지만 엔진이 다르다.**
//
// 우주·정글·쥬라기는 `runner/`(2.5D 캔버스)를 쓰고, 이 게임은 `runner3d/`(three.js)를 쓴다.
// 규칙(`course.js`)과 감지기는 **둘이 같은 것을 본다** — 같은 레벨이면 같은 판이라야
// 기록을 견줄 수 있다.
//
// ── manifest를 엔진에 넘긴다 ★ ──────────────────────────────
//
// 전에는 이 파일이 한 줄이었고 `GAME_ID`가 엔진에 박혀 있었다. 러너를 전부
// 3D로 옮기기로 한 이상 그대로 두면 **두 번째 3D 게임의 운동 데이터가 여기
// 기록에 합쳐진다.** 섞인 것은 되돌릴 수 없다(`CLAUDE.md`).
//
// 2D 러너들이 `theme.json`을 넘기는 것과 같은 모양이다 — 엔진은 규칙만 알고
// 이름·그림은 게임팩이 갖는다.
import manifest from './manifest.json'
import { makeRunner3dPlay } from '../runner3d/play3d.js'

export default makeRunner3dPlay(manifest)
