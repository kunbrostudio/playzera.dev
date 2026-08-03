// 정본은 `src/core/pose/gesture.js`로 옮겼다 — 똥 피하기에도 같은 O/X를 붙이면서
// 게임마다 판정 로직이 두 벌이 되는 걸 막기 위해서다.
//
// 이 파일은 웜업 쪽 import 경로를 그대로 두기 위한 재export다.
// STEP 4-2(포즈 엔진 통합)에서 웜업이 core를 직접 참조하게 되면 사라진다.
export { isArmsUpCircle, isArmsUpCross, GestureHold } from '../../../core/pose/gesture.js'
