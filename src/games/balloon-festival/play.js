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
import { DEFAULT_PLAY_MODE } from './modes.js'

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
  //
  // ── Play Mode는 이 루프가 도는 동안만 산다 ★ (STEP 104) ──────
  //
  // "다시 하기"(아래 for 루프가 다시 도는 것)는 같은 세션이라 방금 고른
  // 모드를 그대로 들고 있다가 타이틀 팝업에 다시 보여준다(요청 4번,
  // "Replay 시에는 현재 mode를 유지해도 된다"). Home으로 나가면 이
  // 함수 자체가 끝나므로(`return navigate('/')`), 다음에 다시 들어올
  // 때는 이 함수가 처음부터 다시 불려 `mode`가 SOLO로 되돌아간다 —
  // 그 정책도 요청 4번 그대로("기본 SOLO로 돌아가도 된다")다.
  let mode = DEFAULT_PLAY_MODE
  for (;;) {
    const { result: titleResult, mode: chosenMode } = await showTitleScreen(app, mode)
    mode = chosenMode
    if (left) return
    if (titleResult === 'home') return navigate('/')

    // 인트로 스토리에도 스킵을 준다(ken 6차: "스킵 버튼이 없어. 추가해주고
    // 쥬라기 런처럼 스킵 누르면 바로 게임 시작으로"). `runStory`가 스킵을
    // `'skip'`으로 돌려주는데, 아래 나가기 목록에 없으므로 그대로 게임이
    // 시작된다 — 쥬라기 런(`play3d.js`)과 같은 동작이다.
    //
    // ★ `skippable: true`만으로는 실제로 안 보였다(STEP 99) — 인트로가
    // 장면 하나뿐이라 늘 "마지막 장면"인데, `runStory`의 옛 기본값이
    // 마지막 장면에서는 스킵을 숨겼다(여러 장면짜리 스토리에서 마지막
    // 줄이 "시작" 버튼으로 끝나는 것과 헷갈리지 않게 하려던 것). 지금은
    // `skipEvenOnLast`가 기본 `true`라 이 호출은 그대로 두고 그냥
    // 보이게 됐다 — 근본 수정은 `storyRunner.js`에 있다.
    //
    // ★ companionPreset을 안 준다(STEP 102) — 여기는 배경 그림 자체가
    // 이미 두 캐릭터를 그려 넣은 **스토리 컷**이라, 그 위에 또 좌우
    // companion을 얹으면 중복이다(ken 요청: "스토리 화면에는 캐릭터를
    // 아예 렌더링하지 않는다"). companion은 쉬는 타임/최종 클리어
    // 대화(`ui/playScreen.js`의 `showRestWithDialogue`)에만 쓴다.
    const introResult = await runStory(app, story.intro?.scenes, {}, {
      skippable: true, startAction: true,
    })
    if (left) return
    // 스토리에서 뒤로/나가기 → **타이틀로 돌아간다**(한 단계씩 뒤로,
    // CLAUDE.md). 예전에는 여기서도 허브로 튕겨 나갔다.
    if (introResult === 'back' || introResult === 'title') continue
    if (introResult === 'home') return navigate('/')

    const result = await runBalloonPlay(app, manifest, mode)
    if (left || result === 'left') return
    if (result === 'home') return navigate('/')
    // 'again' — 타이틀부터 다시 돈다
  }
}
