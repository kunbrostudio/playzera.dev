// arcade2d 스토리 실행기 — 여러 장면(scene)을 이전/다음으로 이어 재생한다.
//
// **모양은 새로 안 짠다.** `runner3d/storyDialogue.js`의 `showStoryScene`이
// 플레이 제라 스토리 대화창의 정본이다(`CLAUDE.md`: "새 게임의 스토리 화면도
// 여기부터 받아 쓴다"). 이 파일은 그 위에 "장면 여러 개를 순서대로,
// 컷을 넘나드는 이전/다음과 함께 보여준다"는 루프 한 겹만 얹는다 —
// `runner3d/play3d.js`가 인트로 4장면을 직접 돌리던 것과 같은 모양인데,
// 풍선 팡팡·비눗방울 팡팡 둘 다 필요해서 여기(공용 엔진)로 옮겼다.
//
// ── 얼굴(cast)이 없어도 된다 ─────────────────────────────────
//
// 쥬라기 대탐험(3D)은 배경 그림 위에 캐릭터 얼굴을 따로 오려 붙이지만,
// 풍선 팡팡·비눗방울 팡팡의 스토리 그림은 이미 두 캐릭터가 표정까지
// 그려진 **완성된 장면**이다(ken이 그렇게 만들어 보냈다). `showStoryScene`은
// `cast`가 비어 있으면(`{}`) 조용히 얼굴을 안 보여주므로 — 여기서는 `cast`를
// 아예 안 만들고 텍스트만 지나가는 나레이션처럼 쓴다. 나중에 얼굴 크롭이
// 생기면 `cast`를 채우기만 하면 된다(코드는 안 바뀐다).

import { showStoryScene } from '../runner3d/storyDialogue.js'

/**
 * @param {HTMLElement} app
 * @param {Array} scenes `manifest.story.<intro|transition|ending>.scenes`
 * @param {object} [cast] 캐릭터 얼굴 — 없으면 텍스트만
 * @param {object} [opts]
 * @param {boolean} [opts.backButton] 인트로처럼 "판이 시작하기 전"이면 true —
 *   Home이 `'back'`으로 온다(호출부가 앞 화면으로 보낸다)
 * @param {boolean} [opts.skippable] 마지막 장면 전까지 스킵 버튼을 보여준다
 * @param {boolean} [opts.startAction] 마지막 장면의 마지막 줄에서 "다음" 대신 "시작"
 * @returns {Promise<'done'|'home'|'back'|'skip'|'title'>}
 */
export async function runStory(app, scenes, cast = {}, opts = {}) {
  if (!scenes?.length) return 'done'
  let i = 0
  let startLine
  while (i < scenes.length) {
    const isLast = i === scenes.length - 1
    const result = await showStoryScene(app, scenes[i], cast, {
      backButton: opts.backButton,
      skippable: !!opts.skippable && !isLast,
      startAction: !!opts.startAction && isLast,
      canGoBack: i > 0,
      startLine,
    })
    startLine = undefined
    if (result === 'done') { i++; continue }
    if (result === 'prevScene') { i--; startLine = 'last'; continue }
    return result   // 'home' | 'back' | 'skip' | 'title'
  }
  return 'done'
}
