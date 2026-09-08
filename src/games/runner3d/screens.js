// 3D 러너의 앞 화면 둘 — **타이틀**과 **튜토리얼.**
//
// ── 왜 라우트가 아니라 플레이 안인가 ★ ──────────────────────
//
// `/intro?id=`·`/tutorial?id=` 라우트를 쓸 수도 있었다. 안 쓴 이유가 둘이다.
//
// ① **카메라를 두 번 켜게 된다.** 튜토리얼에서 몸을 움직여 보려면 카메라가
//    필요한데, 라우트가 갈리면 화면마다 열고 닫는다. 그러면 참조가 0이 되어
//    카메라가 껐다 켜지고 권한 표시등이 깜빡인다(`CLAUDE.md`의 카메라 규칙).
// ② **기존 러너 셋이 이미 그렇게 한다.** "러너는 자체 타이틀 화면이 인트로
//    역할을 한다"(`registry.js`) — 화면 하나를 더 두면 아이가 거치는 단계가 는다.
//
// ── 튜토리얼은 **몸으로 해봐야** 넘어간다 ────────────────────
//
// 읽고 넘어가는 설명은 4~8세에게 안 남는다. 동작을 실제로 한 번 하면 체크가
// 켜지고, 넷을 다 채워야 다음으로 간다. 못 하는 아이를 가두지 않으려고
// 건너뛰기를 늘 열어 둔다.

import { icon } from '../../core/icons.js'
import { UI } from '../../core/uiAssets.js'
import { CUE } from '../runner/ui/cues.js'
// ── 공통 UI는 **만들지 않고 받아 쓴다** ★ ──────────────────────
// 전에는 타이틀이 자기만의 메뉴(`#r3-menu-panel`)를 따로 그렸다. 모양 CSS는
// 공용 것(`#pz-menu-panel`)에 걸려 있어서 **닫히는 규칙이 안 붙었고**, 메뉴가
// 늘 펼쳐진 채로 화면 오른쪽에 아이콘 셋이 그대로 보였다(8/27).
// 한 벌만 두면 이런 어긋남이 생길 자리가 없다.
import { sysBarMarkup, ensureSysBarStyle, bindSysBar } from '../runner/ui/systemBar.js'
import { isBgmMuted, isSfxMuted, toggleBgmMute, toggleSfxMute } from '../runner/audio.js'
import { POSE_BUTTONS } from '../runner/ui/touchPad.js'
// 속도 설정 팝업 — 타이틀 화면의 "속도 설정" 버튼이 연다(ken 요청, 9/3).
import { SPEED_TIERS, getRunnerSpeedId, setRunnerSpeedId, runnerSpeedLabel } from '../../core/runnerSpeed.js'
// 배경 그림이 다 받아지기 전엔 화면을 숨겨 두는 데 쓴다 — STEP 73 참고(mount() 안).
import { showLoadingScreen, preloadImage } from '../../core/loadingScreen.js'

const STYLE_ID = 'pz-r3-screens-css'

const CSS = `
.r3s {
  position: fixed; inset: 0; z-index: 70; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(12px, 2.6vh, 26px); padding: clamp(14px, 3vh, 30px);
  font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
  text-align: center; touch-action: none; user-select: none;
}
/* 배경색을 깔아 둔다(--pz-bg-veil-2, 앱 전반의 어두운 보라). 그림이 크고(장면
   합성 그림은 몇 MB) 로딩이 아주 잠깐 늦으면, 그 틈에 배경이 완전히
   투명해져서 뒤에 남아 있던 이전 화면이 비쳐 보인 적이 있었다(9/2) —
   화면 자체는 늘 opaque해야 한다. */
.r3s-bg { position: absolute; inset: 0; z-index: 0; background-size: cover; background-position: center;
          background-color: var(--pz-bg-veil-2, #150a2e); }
/* 가운데 세로로 쌓이는 것들만 위로 올린다.
   **.r3s-corner는 빼야 한다** — position: relative가 절대 위치를 덮어서
   왼쪽 위에 둔 "게임 목록"이 화면 한가운데로 끌려왔다(8/26).
   .r3s-smoke도 같은 이유로 뺐다 — 이 셀렉터가 .r3s-smoke 자체 규칙보다
   구체적이라(클래스 3개) position: relative가 이겨서 absolute+inset:0이
   먹히지 않고 연기 층이 문서 흐름에 끼어 대사창을 밀어낼 뻔했다(9/2). */
.r3s > *:not(.r3s-bg):not(.r3s-corner):not(.r3s-smoke) { position: relative; z-index: 1; }

/* 화면 모서리에 붙는 것 — 2.5D 타이틀과 같은 자리다. */
.r3s-corner {
  position: absolute; z-index: 3;
  top: clamp(10px, 2.5vh, 26px); left: clamp(10px, 2vw, 28px);
}
.r3s-corner-r { left: auto; right: clamp(10px, 2vw, 28px); }
/* 공통 UI(ui/systemBar.js)를 담는 자루. **자리를 잡지 않는다** — 안에 든
   것들이 각자 .r3s 기준으로 절대 위치를 쓴다. .r3s-corner를 같이 붙이는
   것은 위의 position: relative 규칙에서 빠지기 위해서다. */
.r3s-sys { position: static; top: auto; left: auto; }

/* 타이틀 — 배경 그림이 주인공이라 덮개를 얇게 둔다 */
#r3-title .r3s-bg { background-image: var(--bg); }
#r3-title .logo { width: min(56vw, 520px); height: auto; filter: drop-shadow(0 8px 20px rgba(0,0,0,.45)); }
#r3-title .start { width: clamp(160px, 26vw, 300px); height: auto; cursor: pointer;
                   filter: drop-shadow(0 6px 16px rgba(0,0,0,.45)); transition: transform .12s; }
#r3-title .start:active { transform: scale(.94); }
/* 왼쪽 위 Home 버튼은 공용이다 — 모양도 자리도 ui/systemBar.js가 갖는다.
   **플레이 중에는 안 보인다.** 거기서 바로 나가면 운동 기록을 저장하는 경로를
   건너뛴다 — 대신 나가기 → 확인창 안에 "Home으로"를 둔다. */

/* ── 속도 설정 ★ ─────────────────────────────────────────────
   처음엔 "시작" 바로 아래 작은 반투명 글자 버튼이었다. 눈에 잘 안 띈다는
   말을 듣고(ken, 9/3) 크게·채운 색으로 바꿨다 — 여전히 "시작"보다는
   작지만(카드 클릭은 선택, 실행은 시작 하나뿐이라는 규칙), 손을 대기 전에도
   "여기 누를 게 있구나"가 보여야 한다. 색·테두리·눌림 방식은 공용 시스템
   바의 Home 버튼(ui/systemBar.js의 #pz-home — 흰 테두리 + 채운 색 +
   진한 그림자, 누르면 아래로 눌리는 느낌)을 그대로 옮겨 왔다 — 앱 안에
   이미 있는 "채운 알약 버튼"이 그거라, 새로 만들면 톤이 갈린다(ken 요청,
   9/3: 파란색 + 하얀 글자로).
   시작+속도를 감싸는 .r3-title-actions가 자리를 잡는다 — 세로가 짧은
   가로 폰에서는 이 컨테이너만 가로로 바꾼다(아래 미디어 쿼리). */
.r3-title-actions {
  display: flex; flex-direction: column; align-items: center;
  gap: clamp(12px, 2.6vh, 26px);
}
#r3-title .speed-btn {
  min-height: 56px; padding: 0 clamp(22px, 4vw, 34px);
  font-size: clamp(1rem, 2.2vw, 1.25rem);
  border: 3px solid #fff;
  background: linear-gradient(135deg, var(--pz-blue-start, #0ECAFD), var(--pz-blue-end, #0057EC));
  color: #fff;
  box-shadow: 0 5px 0 var(--pz-blue-shadow, #003c9e), 0 10px 22px rgba(0,0,0,.35);
  opacity: 1; transition: transform .1s, box-shadow .1s;
}
#r3-title .speed-btn:active { transform: translateY(3px); box-shadow: none; }
/* 세로가 짧은 가로 폰(예: SE 가로) — 위아래로 쌓으면 여유가 없다고 해서
   (ken 스크린샷, 9/3) 시작+속도를 좌우로 나란히 둔다. 다른 화면들이 쓰는
   같은 기준(max-height: 560px, readyScreen.js·home.js 등)을 그대로 맞췄다 —
   기준이 갈리면 화면마다 "가로 폰"의 경계가 달라 보인다. */
@media (max-height: 560px) {
  #r3-title .logo { width: min(40vw, 300px); }
  #r3-title .r3-title-actions { flex-direction: row; gap: clamp(14px, 3vw, 30px); }
  #r3-title .start { width: clamp(120px, 18vw, 190px); }
  #r3-title .speed-btn {
    min-height: 48px; padding: 0 clamp(16px, 3vw, 26px);
    font-size: clamp(.85rem, 1.8vw, 1.05rem);
  }
}
/* 팝업 — 종료 확인창(#pz-confirm)과 같은 상자·버튼을 그대로 쓴다
   (.pz-confirm-box · .pz-confirm-actions · .pz-btn, ui/systemBar.js).
   새로 만들면 그 화면과 톤이 갈릴 자리가 생긴다. */
#r3-speed-popup {
  position: absolute; inset: 0; z-index: 65;   /* 종료 확인창(60)보다 위 — 둘이 겹칠 일은 없지만 순서는 명확히 */
  display: flex; align-items: center; justify-content: center;
  background: rgba(8, 3, 20, .72);
}
#r3-speed-popup.hidden { display: none; }
.r3-speed-opt.on { background: var(--pz-gold, #ffd23e); color: var(--pz-gold-text, #4a2a00); box-shadow: 0 4px 0 var(--pz-gold-shadow-alt, #c99b1e); }

/* 튜토리얼 — 글을 읽어야 하므로 배경을 어둡게 덮는다 */
#r3-tut .r3s-bg { background-image: linear-gradient(rgba(10,4,28,.84), rgba(10,4,28,.9)), var(--bg); }
#r3-tut h1 { margin: 0; font-size: clamp(1.3rem, 3.4vw, 2.2rem); color: var(--pz-gold, #ffd23e); letter-spacing: .06em; }
#r3-tut h2 { margin: 0; font-size: clamp(.95rem, 2vw, 1.3rem); font-weight: 700; opacity: .92; }
.r3s-note {
  margin: 0; padding: clamp(8px, 1.4vh, 14px) clamp(14px, 2.4vw, 26px);
  border: 2px solid var(--pz-gold, #ffd23e); border-radius: var(--pz-radius-pill, 9999px);
  background: rgba(255,210,62,.10); color: #fff;
  font-size: clamp(.78rem, 1.4vw, 1rem); font-weight: 700;
  max-width: min(92vw, 900px);
}
.r3s-note b { color: var(--pz-gold, #ffd23e); }
.r3s-row { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(10px, 2vw, 24px); }
.r3s-card {
  width: clamp(168px, 25vw, 320px); padding: clamp(12px, 2.2vh, 24px);
  border-radius: 24px; background: rgba(255,255,255,.10);
  border: 2px solid rgba(255,255,255,.18);
  display: flex; flex-direction: column; align-items: center; gap: clamp(6px, 1vh, 10px);
  transition: background .2s, border-color .2s, transform .2s;
}
/* 그림이 카드의 주인공이다 — 2.5D 튜토리얼처럼 크게 둔다.
   가로가 긴 관문과 세로가 긴 알이 섞여 있으므로 **높이로 맞추고 폭은 제한**한다.
   안 그러면 관문이 카드를 뚫고 나간다. */
.r3s-card img { height: clamp(96px, 19vh, 210px); width: auto; max-width: 100%; object-fit: contain; }
.r3s-card .k { font-size: clamp(1rem, 2vw, 1.35rem); font-weight: 900; }
.r3s-card .d { font-size: clamp(.82rem, 1.5vw, 1.05rem); opacity: .85; line-height: 1.35; }
.r3s-card .chk { font-size: clamp(1.2rem, 2.4vw, 1.7rem); height: 1.5em; color: var(--pz-green-b, #6ee75a); }
.r3s-card.done { background: rgba(110,231,90,.18); border-color: var(--pz-green-b, #6ee75a); transform: scale(1.03); }
/* 아래 버튼 줄 — 카메라 준비 화면의 [뒤로][키보드 모드][시작]과 같은 모양이다.
   화면마다 버튼 생김새가 다르면 아이는 "여기서는 어디를 눌러야 하지"를 매번
   다시 본다. 가로로 두는 것은 여기뿐이다 — 셋이 아니라 둘이라 안 넘친다. */
.r3s-actions { display: flex; gap: clamp(10px, 1.8vw, 20px); justify-content: center; flex-wrap: wrap; }
.r3s-btn {
  min-height: 48px; padding: 0 clamp(18px, 3vw, 30px); border-radius: var(--pz-radius-pill, 9999px);
  border: 2px solid rgba(255,255,255,.3); background: rgba(255,255,255,.12); color: #fff;
  font: inherit; font-size: clamp(.9rem, 1.7vw, 1.1rem); font-weight: 900; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
}
.r3s-btn:active { transform: scale(.95); }

/* 스토리 대화 화면(storyDialogue.js).
   **배경 그림 위에 어두운 덮개를 안 씌운다** — 여기 배경은 튜토리얼의 글
   배경(장식)이 아니라 **그림 자체가 장면**(합성 일러스트)이라, 어둡게
   깔면 정작 봐야 할 그림이 안 보인다(ken 실사용 확인, 9/2). 대사가 읽히는
   것은 대사창 자체의 진한 배경(.r3-story-box)이 맡는다. */
/* 그림을 그대로 깐다 — 덮개 없이. 이게 빠져서 한동안 배경이 통째로
   안 보인 적이 있었다(9/2) — 어두운 그라데이션을 뺄 때 그 줄 전체를
   지워버려서 var(--bg) 연결 자체가 같이 없어졌다. */
#r3-story .r3s-bg { background-image: var(--bg); }
#r3-story { justify-content: flex-end; }
.r3-story-box {
  width: min(94vw, 980px); margin-bottom: clamp(10px, 3vh, 30px);
  padding: clamp(16px, 2.6vh, 30px) clamp(18px, 3vw, 34px);
  border-radius: 24px; background: rgba(15,7,34,.88);
  border: 2px solid var(--pz-gold, #ffd23e);
  display: flex; flex-direction: row; align-items: center;
  gap: clamp(12px, 2.4vw, 26px);
}
/* 말하는 캐릭터 — 대사창 왼쪽에 붙는다(참고 화면들의 자리와 같다).
   원본 그림은 정사각형 전신이라, 상자를 가로로 넓게 잡고 object-position이
   top이 되게 해서 위쪽(얼굴·손)만 보이게 자른다 — 다리는 안 보여도 된다고
   했다. speaker가 없는 줄(아직 얼굴 그림이 없는 캐릭터)에서는 아예 숨긴다. */
.r3-story-face {
  flex: 0 0 auto; display: block;
  width: clamp(96px, 17vw, 190px); height: clamp(70px, 12.5vw, 138px);
  object-fit: cover; object-position: top center;
  border-radius: 20px; border: 3px solid var(--pz-gold, #ffd23e); background: rgba(0,0,0,.25);
  box-shadow: 0 6px 14px rgba(0,0,0,.4);
}
.r3-story-body { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column;
                 gap: clamp(12px, 2vh, 20px); }
.r3-story-line {
  margin: 0; font-size: clamp(1.2rem, 3vw, 1.9rem); font-weight: 700; line-height: 1.5;
  min-height: 2.2em; display: flex; align-items: center;
}
/* 이전·다음은 서로 가깝게 붙이고(손 제스처로 오갈 때 이동이 작게,
   ken 확인 9/2), 스킵은 반대쪽 끝으로 뗀다 — 아이패드 실사용에서 셋이
   한데 뭉쳐 있으니 스킵과 다음/이전을 헷갈렸다(ken 요청, 9/4). 텍스트
   (r3-story-body)와 왼쪽 정렬을 맞추려고 이전·다음 묶음을 그대로 왼쪽에
   두고, actions를 space-between으로 벌려 스킵만 오른쪽 끝으로 보낸다 —
   자식이 nav 하나뿐(스킵이 없는 장면)이어도 flex-start라 왼쪽 자리는
   그대로 유지된다. */
.r3-story-actions { display: flex; justify-content: space-between; align-items: center; }
.r3-story-nav { display: flex; gap: clamp(8px, 1.4vw, 14px); }
.r3-story-actions .r3s-btn {
  min-height: clamp(52px, 8vh, 76px); font-size: clamp(1rem, 2.4vw, 1.35rem);
  padding: 0 clamp(20px, 3.6vw, 38px);
}
.r3-story-prev:disabled { opacity: .35; pointer-events: none; }
/* 스킵 — 이전·다음과 같은 모양(r3s-btn)이지만 이제 같은 묶음은 아니다.
   actions의 두 번째 flex 자식이라 위 space-between이 오른쪽 끝으로
   밀어 준다 — 이 클래스 전용 CSS는 여전히 필요 없다. */

/* 위급한 장면(화산 폭발 등, scene.fx==='quake') — 배경만 흔든다.
   **대사창·버튼은 안 흔든다** — 손 제스처로 겨누는 자리가 움직이면 눌리지
   않는다. 진폭을 작게(2~3px) 두고 계속 켜 둔다 — 크게 흔들면 아이가
   어지러워한다고 해서 세게 흔드는 대신 "계속" 흔드는 쪽을 골랐다(ken 요청, 9/2). */
@keyframes r3s-quake {
  0%, 100% { transform: translate(0, 0); }
  10% { transform: translate(-3px, 1px); }
  20% { transform: translate(2px, -2px); }
  30% { transform: translate(-2px, 2px); }
  40% { transform: translate(3px, 0); }
  50% { transform: translate(-1px, -2px); }
  60% { transform: translate(2px, 1px); }
  70% { transform: translate(-3px, -1px); }
  80% { transform: translate(1px, 2px); }
  90% { transform: translate(-2px, 0); }
}
.r3s-shake .r3s-bg { animation: r3s-quake .42s infinite linear; }
@media (prefers-reduced-motion: reduce) {
  .r3s-shake .r3s-bg { animation: none; }
}
/* 연기 — 그림 파일 없이 블러 그라데이션 원 몇 개를 위로 흘려보낸다
   (CLAUDE.md: 연출을 그림으로 안 늘린다). 자리·크기·속도는 storyDialogue.js가
   장면마다 흩뜨려서 붙인다. */
.r3s-smoke { position: absolute; inset: 0; z-index: 1; pointer-events: none; overflow: hidden; }
.r3s-smoke i {
  position: absolute; bottom: -10%; border-radius: 50%; display: block;
  background: radial-gradient(circle, rgba(120,120,130,.55), rgba(120,120,130,0) 70%);
  filter: blur(2px);
  animation: r3s-smoke-rise linear infinite;
}
@keyframes r3s-smoke-rise {
  0% { transform: translateY(0) scale(.7); opacity: 0; }
  15% { opacity: .55; }
  100% { transform: translateY(-70vh) scale(1.6); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .r3s-smoke i { animation: none; opacity: 0; }
}

/* 대사 타이핑 커서 — 글자가 한 자씩 나타나는 동안만 깜빡인다(typeLine()이
   붙였다 뗀다). 심심하게 한 번에 뜨지 않게 하는 게 목적이라, 다 나타난
   뒤에는 안 보인다. */
.r3-story-line.r3s-typing::after {
  content: ''; display: inline-block; width: .08em; height: 1em; margin-left: 2px;
  background: var(--pz-gold, #ffd23e); vertical-align: -.1em; animation: r3s-caret .8s steps(1) infinite;
}
@keyframes r3s-caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
`

export function ensureStyle() {
  // 메뉴 버튼 모양은 인게임 시스템 바와 **같은 것**을 쓴다
  ensureSysBarStyle()
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = CSS
  document.head.appendChild(s)
}

/**
 * 화면 하나를 띄우고, 끝나면 지운다.
 *
 * **스토리 대화 화면(`storyDialogue.js`)도 이걸 그대로 받아 쓴다** — 타이틀·
 * 튜토리얼과 같은 `.r3s` 톤을 새로 안 짜려고 export했다.
 *
 * ── 배경 그림이 다 받아지기 전엔 안 보여준다(STEP 73) ★ ──────────
 *
 * `bg`(장당 몇 MB인 합성 그림)를 CSS `background-image`로 바로 걸면,
 * 느린 네트워크에서는 그림이 위→아래로 서서히 그려지는 게 그대로
 * 보였다("90년대 로딩", ken 재현 9/5). 그래서 이 함수는 **el을 만들어
 * 반환은 그대로 동기로 하되(호출부가 즉시 `el.querySelector`로 버튼을
 * 붙인다), 화면 자체는 배경 그림이 다 받아질 때까지 숨겨 두고** 그
 * 자리를 공용 로딩 화면(`core/loadingScreen.js`)으로 덮는다. 다
 * 받아지면 로딩 화면을 내리고 el을 보여준다 — 화질은 그대로 두고
 * 노출 시점만 늦췄다.
 */
export function mount(app, id, html, bg) {
  ensureStyle()
  const el = document.createElement('div')
  el.className = 'r3s'
  el.id = id
  el.style.setProperty('--bg', `url("${bg}")`)
  el.innerHTML = `<div class="r3s-bg"></div>${html}`
  el.style.visibility = 'hidden'
  app.appendChild(el)

  const loading = showLoadingScreen()
  preloadImage(bg).finally(() => {
    el.style.visibility = 'visible'
    loading.release()
  })
  return el
}

/**
 * 타이틀 — 게임의 얼굴.
 *
 * ── **결과를 돌려준다** ★★ ──────────────────────────────────
 *
 * 처음엔 START에서만 `resolve`하고 허브 버튼은 콜백(`onHub`)으로 빼 뒀다.
 * 그런데 허브를 누르면 화면만 지워지고 **약속이 영원히 안 풀렸다** —
 * 부르는 쪽은 `await`에서 멈춘 채로 빈 화면만 남았다. 화면이 비니 그 아래
 * `body` 배경(직전 게임의 것)이 드러나 "똥 피하기 배경이 나온다"로 보였다.
 *
 * `showReadyScreen`이 `mode`를 돌려주는 것과 같은 모양으로 맞췄다.
 * **화면을 떠나는 길이 둘이면 결과도 둘이어야 한다.**
 *
 * ── 속도 설정 ★ ────────────────────────────────────────────
 *
 * "시작" 아래 작은 버튼 — 눌러야 열리는 팝업이라 시작을 가리지 않는다.
 * 기본 레벨 속도(`runner/config.js`)는 3~5세 기준이라, 7세 이상·초등학생도
 * 할 수 있게 배율을 고를 자리를 뒀다(ken 요청, 9/3) — "인터랙션 웜업
 * 달리기" 같은 콘텐츠가 그보다 훨씬 빠르다는 게 이유였다. 고른 값은
 * `core/runnerSpeed.js`가 기기에 저장한다 — 다음에 같은 기기로 다시
 * 와도 그대로 남아 있다. 판이 시작한 뒤에는 못 바꾼다(타이틀에서만 고른다) —
 * "판 안에서 규칙의 크기를 바꾸지 않는다"는 규칙 그대로다.
 *
 * @returns {Promise<'start'|'hub'>}
 */
export function showTitle3d(app, manifest) {
  return new Promise(resolve => {
    const logo = manifest.logo
      ? `<img class="logo" src="${manifest.logo}" alt="${manifest.title}">`
      : `<h1 style="font-size:clamp(1.6rem,5vw,3rem)">${manifest.title}</h1>`
    let speedId = getRunnerSpeedId()
    // ── 배경은 **글자 없는 판**이다 ★ ──
    // `hero`는 허브 썸네일이라 그림에 게임 로고가 박혀 있다. 그걸 깔고 그 위에
    // 우리 로고를 또 얹으니 타이틀이 두 겹으로 겹쳐 보였다.
    // `titleBg`가 있으면 그것을, 없으면 `hero`로 물러난다.
    //
    // 나가기 버튼은 없다 — 아직 판이 없어 저장할 운동도 없고, 여기서 나가는
    // 길은 왼쪽 위 Home 하나면 된다.
    const el = mount(app, 'r3-title', `
      <div class="r3s-corner r3s-sys">${sysBarMarkup({ home: true, exit: false, ...mutes() })}</div>
      ${logo}
      <div class="r3-title-actions">
        <img class="start" id="r3-start" data-pz-hit data-pz-dwell="1200"
             src="${UI.startButton}" alt="시작">
        <button class="r3s-btn speed-btn" id="r3-speed-btn" data-pz-hit data-pz-dwell="1200">
          ${icon('zap')} 속도: <span id="r3-speed-label">${runnerSpeedLabel(speedId)}</span>
        </button>
      </div>

      <div id="r3-speed-popup" class="hidden">
        <div class="pz-confirm-box">
          <p>속도를 골라 주세요</p>
          <div class="pz-confirm-actions">
            ${SPEED_TIERS.map(t => `
              <button class="pz-btn secondary r3-speed-opt" data-id="${t.id}"
                      data-pz-hit data-pz-dwell="1000">${t.label}</button>`).join('')}
            <button class="pz-btn ghost" id="r3-speed-close" data-pz-hit data-pz-dwell="1000">
              ${icon('close')} 닫기
            </button>
          </div>
        </div>
      </div>`, manifest.titleBg ?? manifest.hero)

    const abort = new AbortController()
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      abort.abort()          // 화면이 사라지면 document·window에 건 것도 같이 뗀다
      el.remove()
      resolve(result)
    }

    bindSysBar(el, { ...soundHandlers(), onHome: () => finish('hub') }, abort.signal)

    const btn = el.querySelector('#r3-start')
    // 눌린 그림 — 4~8세는 "눌렀다"는 신호가 눈에 보여야 다시 누르지 않는다
    const down = () => { btn.src = UI.startButtonPressed }
    const up = () => { btn.src = UI.startButton }
    btn.addEventListener('pointerdown', down)
    btn.addEventListener('pointerup', up)
    btn.addEventListener('pointerleave', up)
    btn.addEventListener('click', () => finish('start'))

    // ── 속도 팝업 배선 ──
    const popup = el.querySelector('#r3-speed-popup')
    const speedLabel = el.querySelector('#r3-speed-label')
    const syncSpeedOptions = () => {
      el.querySelectorAll('.r3-speed-opt').forEach(b => b.classList.toggle('on', b.dataset.id === speedId))
    }
    syncSpeedOptions()
    el.querySelector('#r3-speed-btn').addEventListener('click', () => popup.classList.remove('hidden'))
    el.querySelector('#r3-speed-close').addEventListener('click', () => popup.classList.add('hidden'))
    el.querySelectorAll('.r3-speed-opt').forEach(b => {
      b.addEventListener('click', () => {
        speedId = b.dataset.id
        setRunnerSpeedId(speedId)
        speedLabel.textContent = runnerSpeedLabel(speedId)
        syncSpeedOptions()
        popup.classList.add('hidden')
      })
    })
  })
}

/** 지금 음소거 상태 — 아이콘을 켜진 대로 그려야 아이가 헷갈리지 않는다. */
export const mutes = () => ({ bgmMuted: isBgmMuted(), sfxMuted: isSfxMuted() })

/** 소리 버튼의 동작. 앞 화면 둘 + 스토리 대화 화면이 똑같이 쓴다. */
export const soundHandlers = () => ({
  onToggleMusic: () => toggleBgmMute(),
  onToggleSfx: () => toggleSfxMute(),
})

/**
 * 튜토리얼 — **두 장이다.** 2.5D 러너와 같은 구성이다.
 *
 *   ① 몸을 움직여 보세요  — 옆으로 · 점프 · 앉기
 *   ② COPY THE POSE      — 런지 · 상체 숙이기 · 팔 벌리기
 *
 * 넷을 한 장에 몰아 봤는데 카드가 작아지고, 무엇보다 **성격이 다른 둘이
 * 섞였다.** 앞의 셋은 순간 동작이고 자세는 잠깐 유지하는 것이다 —
 * 아이에게는 다른 종류의 일이라 화면을 나누는 편이 읽힌다.
 *
 * 그림은 **판에서 만날 장애물**이다(`manifest.tutorialArt`). 없으면 인게임
 * 힌트 팻말로 물러난다(`ui/cues.js`) — 어느 쪽이든 판에서 보는 것과 같다.
 *
 * @param {object} o
 * @param {(cb: Function) => Function} o.subscribe
 *   동작이 감지되면 부를 함수를 받아 간다. 반환값은 구독 해제 함수.
 * @param {boolean} o.keyboard 키보드 모드면 키 안내를 같이 보여준다
 * @param {1|2} [o.startPage] 어느 장부터 시작하나. 스토리 인트로에서
 *   "뒤로"를 누르면 **튜토리얼 둘째 장**(방금 마친 장)으로 바로 돌아가야
 *   한 단계씩 가는 규칙이 맞는다 — 처음 장부터 다시 보여주면 한 번에
 *   두 단계를 뒤로 보내는 셈이다(`play3d.js`).
 * @returns {Promise<'done'|'back'|'title'|'hub'>} 나가는 길마다 다른 결과 —
 *   `'back'`은 **바로 앞 화면**(카메라 준비, `startPage`가 1일 때 첫 장에서만)으로,
 *   `'title'`은 이 게임의 처음으로, `'hub'`는 플레이 제라 홈으로.
 */
export async function showTutorial3d(app, manifest, { subscribe, keyboard = false, startPage = 1 } = {}) {
  const art = manifest.tutorialArt ?? {}

  const page1 = () => tutorialPage(app, manifest, {
    subscribe, keyboard,
    title: '몸을 움직여 보세요!',
    // 카드 순서는 판에서 만나는 순서다 — 코스가 큐브 → 허들 → 자세로 흐른다.
    cards: [
      { id: 'side', img: art.side ?? CUE.right, k: '◀ 옆으로 피하기 ▶', d: '몸을 왼쪽/오른쪽으로 움직여요', key: '◀ ▶' },
      { id: 'jump', img: art.jump ?? CUE.up, k: '▲ 점프', d: '제자리에서 폴짝 뛰어요', key: '▲' },
      { id: 'duck', img: art.duck ?? CUE.down, k: '▼ 앉기', d: '무릎을 굽혀 웅크려요', key: '▼' },
    ],
  })

  const page2 = () => tutorialPage(app, manifest, {
    subscribe, keyboard,
    title: 'COPY THE POSE — 사인판의 자세를 따라해요',
    note: keyboard
      ? `${icon('keyboard')} 키보드 모드: <b>A</b> · <b>S</b> · <b>D</b> 키를 누르고 있으면 해당 자세를 취한 걸로 인식돼요`
      : null,
    cards: POSE_BUTTONS.map(p => ({
      id: p.pose,
      img: (manifest.poseArt ?? {})[p.pose] ?? CUE.pose,
      k: `${p.full}${keyboard ? ` (${p.key})` : ''}`,
      d: '1초 유지하면 성공!',
      key: p.key,
    })),
  })

  // 둘째 장부터 바로 — 여기서 "뒤로"를 누르면 아래 루프로 떨어져 첫 장을
  // 보여준다. 그것도 이 함수 안에서의 "한 단계"이므로 규칙이 그대로 맞는다.
  if (startPage === 2) {
    const b0 = await page2()
    if (b0 !== 'back') return b0
  }

  // ── "뒤로"는 **한 장씩** 간다 ★ ─────────────────────────────
  // 둘째 장에서 뒤로 누르면 첫 장, 첫 장에서 누르면 카메라 준비 화면이다.
  // 두 장을 한 번에 건너뛰면 자세만 어려운 아이가 카메라 화면까지 밀려난다.
  for (;;) {
    const a = await page1()
    if (a !== 'done') return a
    const b = await page2()
    if (b === 'back') continue        // 첫 장으로
    return b
  }
}

/**
 * 튜토리얼 한 장. 카드를 다 채우거나 건너뛰면 끝난다.
 *
 * ── 왼쪽 위 Home이 없다 ★ ──────────────────────────────────
 *
 * 앞뒤로 오가는 화면에 **한 번에 밖으로 나가는 문**까지 두면 셋이 된다
 * (뒤로 · 건너뛰기 · Home). 4~8세에게 고를 것이 셋이면 그중 하나는 잘못
 * 눌린다. 허브로 가는 길은 남아 있다 — 오른쪽 위 나가기 → 확인창의 "Home으로".
 *
 * 뒤로는 **아래 줄, 건너뛰기 옆**이다. 바로 앞 화면(카메라 준비)의 뒤로가
 * 거기 있어서, 두 화면을 오갈 때 손이 같은 자리를 찾는다.
 */
function tutorialPage(app, manifest, { cards, title, note = null, subscribe, keyboard }) {
  return new Promise(resolve => {
    const el = mount(app, 'r3-tut', `
      <div class="r3s-corner r3s-sys">${sysBarMarkup({ home: false, exit: true, ...mutes() })}</div>
      <h1>TUTORIAL</h1>
      <h2>${title}</h2>
      ${note ? `<p class="r3s-note">${note}</p>` : ''}
      <div class="r3s-row">
        ${cards.map(c => `
          <div class="r3s-card" id="r3-tc-${c.id}">
            <img src="${c.img}" alt="">
            <div class="k">${c.k}</div>
            <div class="d">${c.d}</div>
            <div class="chk"></div>
          </div>`).join('')}
      </div>
      <div class="r3s-actions">
        <button class="r3s-btn" id="r3-tut-back" data-pz-hit data-pz-dwell="1200">
          ${icon('back')} 뒤로
        </button>
        <button class="r3s-btn" id="r3-tut-skip" data-pz-hit data-pz-dwell="1200">
          ${icon('play')} 건너뛰기
        </button>
      </div>`, manifest.hero)

    const abort = new AbortController()
    let unsub = null
    let settled = false
    const finish = (result = 'done') => {
      if (settled) return
      settled = true
      abort.abort()
      unsub?.()
      el.remove()
      resolve(result)
    }

    // Home 버튼은 안 그렸지만 확인창의 "Home으로"는 살아 있다 —
    // 허브로 가는 길이 아예 막히면 안 된다.
    bindSysBar(el, {
      ...soundHandlers(),
      onHome: () => finish('hub'),
      onQuit: () => finish('title'),
    }, abort.signal)

    const ids = new Set(cards.map(c => c.id))
    const done = new Set()
    const check = kind => {
      // 좌우는 **하나로 친다.** 왼쪽만 되는 아이를 오른쪽까지 시켜 붙잡아 두면
      // 튜토리얼이 관문이 된다 — 여기서 볼 것은 "몸을 옆으로 옮길 줄 아나"다.
      const id = (kind === 'left' || kind === 'right') ? 'side' : kind
      if (!ids.has(id) || done.has(id)) return
      done.add(id)
      const card = el.querySelector(`#r3-tc-${id}`)
      if (card) {
        card.classList.add('done')
        card.querySelector('.chk').innerHTML = icon('check')
      }
      if (done.size >= cards.length) setTimeout(finish, 700)
    }

    unsub = subscribe?.(check) ?? null
    // `finish`를 그대로 넘기면 클릭 이벤트가 결과 자리로 들어간다 — 감싼다
    el.querySelector('#r3-tut-skip').addEventListener('click', () => finish('done'))
    el.querySelector('#r3-tut-back').addEventListener('click', () => finish('back'))
  })
}
