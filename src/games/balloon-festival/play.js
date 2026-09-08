// 풍선 팡팡 — 플레이 화면.
//
// 타이틀(ken 커버 그림 + 시작 버튼) → 인트로 스토리 → 실제 플레이
// (`ui/playScreen.js` — 카메라 전체 화면 + 풍선 잡기·터뜨리기, STEP 76).
// 1부→2부 전환 스토리·엔딩 스토리·결과 화면·기록은 전부 `playScreen` 안에서
// 이어진다 — 여기는 그 앞의 타이틀·인트로만 맡는다.
//
// `status: 'wip'`라 개발 중(`npm run dev`)에는 허브에 보이고 프로덕션에는
// 안 보인다(`registry.js`).

import { navigate, onLeave } from '../../core/router.js'
import { getManifest } from '../registry.js'
import { runStory } from '../arcade2d/storyRunner.js'
import { showTitleScreen } from './ui/titleScreen.js'
import { runBalloonPlay } from './ui/playScreen.js'

export default async function balloonFestivalPlay(app, query) {
  const gameId = query.id ?? 'balloon-festival'
  const manifest = getManifest(gameId)
  if (!manifest) { navigate('/'); return }

  let left = false
  onLeave(() => { left = true })

  const story = manifest.story ?? {}

  // ── 한 바퀴를 여기서 돈다 ★ ──────────────────────────────────
  //
  // "다시 하기"는 **게임 인트로(타이틀)로 돌아가는 것**이지 판을 바로
  // 다시 까는 게 아니다(ken 6차). 예전에는 결과 화면이 `runBalloonPlay`를
  // 자기 안에서 다시 불러(재진입) 타이틀·인트로를 건너뛰었고, 나가는
  // 길은 `getBackTo()`로 `'/'`(허브)에 떨어졌다 — 이 게임은 registry에
  // `intro` 라우트가 없어서(타이틀·인트로가 이 파일 안에 있다) 항상
  // 허브였다. 그래서 ken이 "다시하기를 눌렀는데 허브로 간다"를 봤다.
  //
  // 이제 `runBalloonPlay`는 아무 데도 안 가고 `'again' | 'home' | 'left'`만
  // 돌려준다. 어디로 갈지는 흐름을 쥔 여기가 정한다 — 화면을 떠나는
  // 길이 둘이면 결과도 둘이어야 한다(CLAUDE.md).
  for (;;) {
    const titleResult = await showTitleScreen(app)
    if (left) return
    if (titleResult === 'home') return navigate('/')

    // 인트로 스토리에도 스킵을 준다(ken 6차: "스킵 버튼이 없어. 추가해주고
    // 쥬라기 런처럼 스킵 누르면 바로 게임 시작으로"). `runStory`가 스킵을
    // `'skip'`으로 돌려주는데, 아래 나가기 목록에 없으므로 그대로 게임이
    // 시작된다 — 쥬라기 런(`play3d.js`)과 같은 동작이다.
    const introResult = await runStory(app, story.intro?.scenes, {}, {
      skippable: true, startAction: true,
    })
    if (left) return
    // 스토리에서 뒤로/나가기 → **타이틀로 돌아간다**(한 단계씩 뒤로,
    // CLAUDE.md). 예전에는 여기서도 허브로 튕겨 나갔다.
    if (introResult === 'back' || introResult === 'title') continue
    if (introResult === 'home') return navigate('/')

    const result = await runBalloonPlay(app, manifest)
    if (left || result === 'left') return
    if (result === 'home') return navigate('/')
    // 'again' — 타이틀부터 다시 돈다
  }
}
