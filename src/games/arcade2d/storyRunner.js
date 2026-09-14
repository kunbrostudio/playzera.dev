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

// ── SKIP 라벨을 "SKIP"으로 통일한다 ★ ───────────────────────────
//
// `storyDialogue.js`(공용, 오디세이 런·쥬라기 대탐험도 같이 쓴다)의 버튼
// 글자는 "스킵"으로 박혀 있다 — 다른 게임의 글자를 바꾸면 안 되니 그
// 파일 자체는 안 건드린다. 대신 이 파일(풍선 팡팡 전용 실행기)에서
// `runStory()`가 도는 동안만 `MutationObserver`로 스킵 버튼이 새로 생길
// 때마다(장면이 바뀔 때마다 버튼도 다시 그려진다) 텍스트만 "SKIP"으로
// 바꿔 단다 — 아이콘은 그대로 둔다.
function watchSkipLabel(app) {
  const relabel = () => {
    for (const btn of app.querySelectorAll('#r3-story-skip, #r3-rest-skip')) {
      // ★ 한 번 손댄 버튼은 건너뛴다 — 안 그러면 이 함수 자체가 만드는
      // DOM 변화(textContent 지우기·아이콘 다시 붙이기)를 옵서버가 또
      // "새 변화"로 보고 다시 부르는 무한 루프가 된다(실제로 겪었다:
      // 이 자기재귀 때문에 `npx vitest run`이 그대로 멈췄다).
      if (btn.dataset.pzSkipLabeled) continue
      btn.dataset.pzSkipLabeled = '1'
      const icon = btn.querySelector('svg, img')
      btn.textContent = ''
      btn.append('SKIP ')
      if (icon) btn.appendChild(icon)
    }
  }
  relabel()
  const mo = new MutationObserver(relabel)
  mo.observe(app, { childList: true, subtree: true })
  return () => mo.disconnect()
}

// ── 대화창 좌우 캐릭터(Dialogue Companion) ★ (STEP 101) ─────────
//
// 6장 실제 자산을 찾아 repo에 등록했다(`ui/playScreen.js` 상단 주석에
// 조사 경위 상세 기록). 3세트 × 2(남/여) — 배치는 항상 **왼쪽 boy,
// 오른쪽 girl**로 고정(ken 요청 4번, 발화자가 누구든 안 바뀐다).
const COMPANION_PRESETS = {
  point: {   // 세트 C(5·6번) — 가리키는 포즈. 레벨 1 클리어 대사.
    boy: '/assets/balloon-festival/dialogue/char_boy_point.png',
    girl: '/assets/balloon-festival/dialogue/char_girl_point.png',
  },
  rest: {    // 세트 B(3·4번) — 무릎 짚고 쉬는 포즈. 레벨 2 클리어 대사.
    boy: '/assets/balloon-festival/dialogue/char_boy_rest.png',
    girl: '/assets/balloon-festival/dialogue/char_girl_rest.png',
  },
  clap: {    // 세트 A(1·2번) — 박수 포즈. Part 1 최종(레벨 3) 클리어 대사.
    boy: '/assets/balloon-festival/dialogue/char_boy_clap.png',
    girl: '/assets/balloon-festival/dialogue/char_girl_clap.png',
  },
}
let companionPreloaded = false

/**
 * 세 세트(6장) 다 미리 불러 둔다 — 브라우저 캐시를 데워서 실제로
 * 대화창에 그릴 때 "팝인" 지연을 줄인다. **렌더 여부를 이 값으로
 * 판단하지 않는다** — 아래 참고.
 */
function ensureCompanionPreloaded() {
  if (companionPreloaded) return
  companionPreloaded = true
  for (const poses of Object.values(COMPANION_PRESETS)) {
    for (const src of Object.values(poses)) {
      const img = new Image()
      img.src = src
    }
  }
}

const COMPANION_STYLE_ID = 'pz-bf-dialogue-companion-css'
function ensureCompanionStyle() {
  if (document.getElementById(COMPANION_STYLE_ID)) return
  const s = document.createElement('style')
  s.id = COMPANION_STYLE_ID
  // ── 크기·구도 (STEP 102) ────────────────────────────────────
  // ken 실사용 피드백: "전신이 작게 들어가서 장식처럼 보인다" — 4번
  // 예시처럼 **상반신 중심으로 크게** 보여야 한다. 원본은 전신 그림
  // (약 1024×1536, 세로 비율 ≈0.667=가로/세로)이라, 틀(frame)을
  // 이미지보다 **가로로 넓게**(가로/세로 > 1) 잡고 `object-fit: cover;
  // object-position: top`으로 자르면 위쪽(머리~가슴)만 채워지고 다리는
  // 잘려 나간다 — `runner3d/screens.js`의 `.r3-story-face`와 같은
  // 원리다. object-fit: cover는 "가로를 다 채우도록 확대한 뒤 세로로
  // 자르는" 동작이라, 보이는 비율(세로 기준) = (이미지 가로/세로) ÷
  // (틀 가로/세로) — 틀을 이미지보다 얼마나 더 "옆으로 넓게" 잡느냐로
  // 잘리는 정도가 정해진다. 첫 시도(틀을 세로로 긴 인물 사진처럼
  // 잡음, 320×456)는 이미지 자체가 이미 세로로 길어서 **거의 안
  // 잘리고 전신이 그대로 보였다**(실측 확인) — 상반신만 보이려면
  // 틀이 반대로 **가로가 세로보다 커야** 한다: 목표 가시 비율 0.5
  // (허리 위)로 역산하면 틀 가로:세로 ≈ 1.33:1(4:3).
  //
  // 너비는 실제 대화창 폭(`.r3-story-box`, screens.js: `min(94vw,
  // 980px)`)에서 남는 여백에 맞춰 스스로 줄어든다 — 좁은 화면일수록
  // 대화창이 화면을 거의 다 차지해(94vw) 옆 여백이 몇십 px밖에 안
  // 남는데, 캐릭터가 그보다 훨씬 크면 대화창 버튼 위까지 덮는다.
  // `--dlg-side-gap`이 그 여백을 그대로 계산해 너비 상한으로 쓴다 —
  // 여백이 좁아지면 4:3 대신 더 좁고 긴(전신에 가까운) 비율로
  // 저절로 타협한다(더 잘리는 대신 버튼을 덮는 것보단 낫다).
  s.textContent = `
    :root {
      --dialogue-safe-x: clamp(6px, 2.5vw, 32px);
      --dialogue-safe-bottom: clamp(4px, 1.5vh, 16px);
      --dialogue-panel-max-width: 980px; /* screens.js .r3-story-box 실제 폭과 동일하게 맞춘다 */
      --dlg-side-gap: max(3vw, calc((100vw - var(--dialogue-panel-max-width)) / 2));
      --dialogue-character-size: clamp(150px, 32vh, 300px); /* 상반신 프레임 "높이" — 예전(90~220px) 대비 확실히 크다 */
    }
    .bf-dlg-chars { position: fixed; inset: 0; z-index: 71; pointer-events: none; }
    .bf-dlg-char {
      position: absolute; bottom: var(--dialogue-safe-bottom);
      height: var(--dialogue-character-size);
      width: clamp(120px, min(calc(var(--dialogue-character-size) * 1.333), calc(var(--dlg-side-gap) + 26px)), 400px);
      object-fit: cover; object-position: top center; border-radius: 22px;
      filter: drop-shadow(0 10px 20px rgba(0,0,0,0.45));
    }
    /* JS(positionCompanions)가 대화창 실제 위치를 재서 style.left/right를
       직접 박는다 — 아래는 그 전(첫 프레임)이거나 대화창을 못 찾았을 때의
       안전한 기본값(예전 안전영역 방식)이다. */
    .bf-dlg-char.left { left: var(--dialogue-safe-x); }
    .bf-dlg-char.right { right: var(--dialogue-safe-x); }
    /* 모바일 가로처럼 낮은 화면(짧은 vh)에서 카운트다운(top)·HUD와 겹치지
       않게 한 번 더 줄인다 — 요청 9번: "작은 화면에서 캐릭터가 버튼과
       겹치면 안 된다." */
    @media (max-height: 420px) {
      /* ★ 여기서는 --dialogue-character-size(:root, 데스크톱 값)를 다시
         안 쓴다 — 이 블록이 height를 직접 덮어써서, 그 변수로 너비를
         계산하면 데스크톱 값을 참조하는 불일치가 생긴다(변수 자체를
         재정의하지 않는 한). 이 breakpoint의 실제 height(30vh 대)에
         맞춰 40vh(≈30vh×1.333)로 직접 다시 계산한다. */
      .bf-dlg-char {
        height: clamp(110px, 30vh, 190px);
        width: clamp(90px, min(40vh, calc(var(--dlg-side-gap) + 18px)), 250px);
      }
    }
  `
  document.head.appendChild(s)
}

/**
 * 실제 대화창(`.r3-story-box`, 화면 중앙 하단에 뜬다)의 좌·우 바깥
 * 가장자리에 캐릭터를 붙인다 — CSS 변수만으로는 대화창이 실제로
 * 몇 px에 있는지 알 수 없어서(폭이 `min(94vw, 980px)`라 뷰포트마다
 * 다르다), 대화창이 그려질 때마다 실측(`getBoundingClientRect`)해서
 * 캐릭터의 `left`/`right`를 직접 박아 둔다. 살짝(`OVERLAP`) 대화창
 * 안쪽으로 겹쳐 "붙어 서 있는" 느낌을 준다 — 대화창 자체 패딩이 더
 * 안쪽에 있어서 이전/다음/SKIP 버튼까지는 닿지 않는다.
 */
const DLG_BOX_OVERLAP = 14
function positionCompanions(app, el) {
  const box = app?.querySelector('.r3-story-box')
  const left = el.querySelector('.bf-dlg-char.left')
  const right = el.querySelector('.bf-dlg-char.right')
  if (!box || !left || !right) return
  const r = box.getBoundingClientRect()
  left.style.left = 'auto'
  left.style.right = `${Math.max(0, window.innerWidth - r.left - DLG_BOX_OVERLAP)}px`
  right.style.right = 'auto'
  right.style.left = `${Math.max(0, r.right - DLG_BOX_OVERLAP)}px`
}

/**
 * 대화창 양옆에 캐릭터를 띄운다 — `showStoryScene`은 대화창 **안쪽**
 * 작은 얼굴(cast)만 알고 바깥쪽 캐릭터는 모르므로, 공용 파일을 안
 * 고치고 이 화면(`app`) 위에 별도 오버레이로 얹는다. 대화가 떠 있는
 * 동안만 보이고 끝나면 같이 지운다. 왼쪽은 항상 boy, 오른쪽은 항상
 * girl이다(발화자가 누구든 안 바뀐다, ken 요청).
 *
 * ★ `<img>`를 **바로** 붙인다 — preload가 아직 안 끝났어도 브라우저가
 * 알아서 이어받아 그린다(같은 URL이라 네트워크 요청도 중복 안 된다).
 * 예전엔 `new Image().onload`로 채운 Set을 먼저 확인하고 그래야만
 * 그렸는데, 첫 대화(인트로, 페이지 막 열렸을 때)가 그 preload보다
 * 먼저 뜨면 검사에 걸려 **아무것도 안 그려졌다**(실제로 실기 확인:
 * 새로고침 직후 첫 호출은 `hasChars:false`, 두 번째 호출부터 정상).
 * 자산은 이미 존재가 확인됐으니 이 사전 검사는 있으나 마나였다 —
 * 이미지 로딩 실패는 `onerror`로 그 한 장만 조용히 지운다.
 *
 * ★ 위치는 대화창을 실측해서 따라간다(STEP 102) — `runStory`가 도는
 * 동안 장면이 바뀔 때마다 대화창 DOM이 새로 그려지고 창 크기도 바뀔
 * 수 있어서, `MutationObserver`(`app` 기준)와 `resize` 둘 다에서
 * `positionCompanions`를 다시 부른다.
 *
 * @param {HTMLElement} app
 * @param {'point'|'rest'|'clap'} preset
 * @returns {() => void} 정리 함수
 */
function showCompanions(app, preset) {
  ensureCompanionPreloaded()
  ensureCompanionStyle()
  const poses = COMPANION_PRESETS[preset]
  if (!poses) return () => {}
  const el = document.createElement('div')
  el.className = 'bf-dlg-chars'
  el.innerHTML = `
    <img class="bf-dlg-char left" src="${poses.boy}" alt="" onerror="this.remove()">
    <img class="bf-dlg-char right" src="${poses.girl}" alt="" onerror="this.remove()">
  `
  document.body.appendChild(el)

  const sync = () => positionCompanions(app, el)
  sync()
  // ★ `sync()`가 손대는 건 `document.body`에 붙인 `el`(캐릭터 자신)뿐,
  // `app`의 서브트리는 안 건드리므로 이 옵서버가 자기 변화를 다시 보는
  // 자기재귀 루프가 될 일은 없다(watchSkipLabel과 같은 함정이 없다).
  const mo = new MutationObserver(sync)
  if (app) mo.observe(app, { childList: true, subtree: true })
  window.addEventListener('resize', sync)

  return () => {
    mo.disconnect()
    window.removeEventListener('resize', sync)
    el.remove()
  }
}

/**
 * @param {HTMLElement} app
 * @param {Array} scenes `manifest.story.<intro|transition|ending>.scenes`
 * @param {object} [cast] 캐릭터 얼굴 — 없으면 텍스트만
 * @param {object} [opts]
 * @param {boolean} [opts.backButton] 인트로처럼 "판이 시작하기 전"이면 true —
 *   Home이 `'back'`으로 온다(호출부가 앞 화면으로 보낸다)
 * @param {boolean} [opts.skippable] 스킵 버튼을 보여준다 — **마지막 장면
 *   포함, 예외 없이**(ken 요청: "모든 Story/Dialogue 화면에 예외 없이
 *   SKIP"). `opts.skipEvenOnLast`를 명시적으로 `false`로 주면 이전
 *   정책(마지막 장면엔 숨김)으로 되돌릴 수 있지만, 지금 이 저장소
 *   호출부는 전부 켜 둔 채로 쓴다.
 * @param {boolean} [opts.skipEvenOnLast=true] 마지막 장면에도 스킵을
 *   보여줄지 — 기본이 이미 `true`라 대부분은 안 적어도 된다.
 * @param {boolean} [opts.startAction] 마지막 장면의 마지막 줄에서 "다음" 대신 "시작"
 * @param {boolean} [opts.disableNextOnLast] 맨 마지막 장면의 마지막 줄에서
 *   "다음"을 끝내는 버튼이 아니라 꺼진 버튼으로 둔다(STEP 103) — 더 갈
 *   다음이 정말로 없는 호출(풍선 팡팡 쉬는 타임처럼, 대화를 끝내는
 *   시점을 카운트다운 같은 바깥 로직이 따로 정하는 경우) 전용이다.
 *   `showStoryScene`으로 그대로 넘어간다(자세한 이유는 그 함수의
 *   JSDoc 참고). 마지막이 아닌 장면에는 안 준다 — 장면 사이 이동은
 *   그대로 "다음"으로 끝나야 다음 장면으로 넘어간다.
 * @param {boolean} [opts.transparent] 배경을 옅은 반투명으로(카메라 등
 *   뒤 화면이 계속 보여야 하는 대화 — 풍선 팡팡 쉬는 타임 전용).
 * @param {'point'|'rest'|'clap'} [opts.companionPreset] 대화창 양옆에
 *   띄울 캐릭터 세트(왼쪽 boy·오른쪽 girl 고정) — 'point'(가리키는
 *   포즈, 레벨 1 클리어)·'rest'(쉬는 포즈, 레벨 2 클리어)·'clap'(박수
 *   포즈, Part 1 최종 클리어). 안 주면 캐릭터 없이 대화창만 뜬다.
 *   ★ **스토리 화면(인트로·파트 전환·엔딩)에는 안 준다**(ken 요청,
 *   STEP 102) — companion은 오직 쉬는 타임/최종 클리어 대화(Rest
 *   dialogue)에만 쓴다. 이 옵션 자체가 유일한 스위치이므로, 스토리
 *   화면 쪽 호출부(`play.js`의 인트로, `playScreen.js`의 전환·엔딩)가
 *   이 값을 안 넘기기만 하면 된다 — `runStory`는 따로 화면 종류를
 *   구분하지 않는다.
 * @returns {Promise<'done'|'home'|'back'|'skip'|'title'>}
 */
export async function runStory(app, scenes, cast = {}, opts = {}) {
  if (!scenes?.length) return 'done'
  const stopWatching = watchSkipLabel(app)
  const stopChars = opts.companionPreset ? showCompanions(app, opts.companionPreset) : () => {}
  try {
    let i = 0
    let startLine
    while (i < scenes.length) {
      const isLast = i === scenes.length - 1
      const result = await showStoryScene(app, scenes[i], cast, {
        backButton: opts.backButton,
        skippable: !!opts.skippable && (!isLast || opts.skipEvenOnLast !== false),
        startAction: !!opts.startAction && isLast,
        canGoBack: i > 0,
        startLine,
        transparent: !!opts.transparent,
        disableNextOnLast: !!opts.disableNextOnLast && isLast,
      })
      startLine = undefined
      if (result === 'done') { i++; continue }
      if (result === 'prevScene') { i--; startLine = 'last'; continue }
      return result   // 'home' | 'back' | 'skip' | 'title'
    }
    return 'done'
  } finally {
    stopWatching()
    stopChars()
  }
}
