// 러너 엔진의 테마 — **이 엔진이 무엇을 보고 무엇을 듣는지는 전부 여기서 온다.**
//
// ── 왜 생겼나 ────────────────────────────────────────────────
//
// 웜업(달리며 장애물 피하기)은 그림만 바꾸면 다른 컨셉의 게임이 되는 틀이다.
// 그런데 그림 경로가 코드 **32곳**에 문자열로 박혀 있었다(`screens.js` 13곳,
// `legacy-shell.js` 5곳, `main.js` 3곳, `style.css` 3곳 …).
// 그 상태로 정글 버전을 만들면 폴더를 통째로 복사하는 수밖에 없고,
// 그러면 오늘 고친 버그를 다음에 두 번 고쳐야 한다. 3,400줄짜리 사본이 는다.
//
// ── 무엇이 테마이고 무엇이 아닌가 ────────────────────────────
//
//   테마     그림 · 소리 · 색 · 배치 좌표 · 기록 키          (게임마다 다르다)
//   엔진     코스 진행 · 판정 · 원근 계산 · 화면 구조        (공유한다)
//
// 규칙은 테마에 넣지 않는다. "이 장애물은 점프로 넘는다" 같은 것이 테마에 섞이면
// 결국 테마가 두 번째 소스코드가 된다. 그건 다음 단계의 `course.json`이 맡는다.
//
// ── 왜 전역 하나인가 ─────────────────────────────────────────
//
// 러너 게임은 한 번에 하나만 돈다(라우터가 화면을 갈아 끼운다). 테마를 인자로
// 20개 모듈에 실어 나르는 것보다, 진입점에서 한 번 꽂고 모두가 읽는 편이 낫다.
// 대신 **꽂기 전에 읽으면 즉시 터지게** 했다 — 조용히 `undefined`가 흘러다니면
// 그림 하나가 안 뜨는 것으로 끝나서 원인을 찾는 데 한나절이 간다.

import { playerSkin } from '../../core/playerSkin.js';

let current = null;

/** 진입점(게임팩의 play.js)이 boot() 전에 한 번 부른다. */
export function setTheme(t) {
  current = t;
  applyCssVars(t);
}

export function theme() {
  if (!current) throw new Error('[runner] 테마가 없다. play.js에서 setTheme()을 먼저 불러야 한다.');
  return current;
}

/**
 * 이미지 경로. 이름만 넘긴다 — `img('bg_sky')` → `/assets/runner/space/image/bg_sky.png`
 *
 * ── 공용 에셋 ────────────────────────────────────────────────
 *
 * 이름에 `/`가 있으면 **테마 폴더 밖**에서 찾는다. 바깥은 두 층이다.
 *
 *   `img('_shared/signs_up')`  → `/assets/runner/_shared/signs_up.png`        러너들끼리 공용
 *   `img('ui/btn_start')`      → `/assets/ui/btn_start.png`                   앱 전체 공용
 *   `img('_shared/char_run01')`→ `/assets/runner/_shared/char/girl/char_run01.png`
 *
 * 캐릭터만 한 겹 더 갈린다. **테마가 아니라 아이가 고른 프로필로 갈린다** —
 * 테마 JSON에 남자/여자 목록을 따로 두면 테마 수 × 성별 수만큼 늘어나고,
 * 새 러너를 만들 때마다 캐릭터 24줄을 다시 적어야 한다.
 *
 * 방향 힌트·메뉴 아이콘은 **러너 게임들만** 쓰는 것이라 `_shared`에 있고,
 * START 버튼처럼 **똥 피하기·팝팝 클리커까지 같이 쓰는 것**은 러너 밖의
 * `/assets/ui/`에 있다(`src/core/uiAssets.js`가 그 경로의 정본이다).
 * 테마마다 복사해 두면 사본이 게임 수만큼 늘고, 하나를 고칠 때 한 곳을 빠뜨리면
 * 게임마다 다른 그림이 뜬다 — 이 프로젝트가 반복해서 겪은 그것이다.
 */
export const img = name =>
  name.startsWith('ui/') ? `/assets/${name}.png`
  : name.startsWith('_shared/char_') ? `/assets/runner/_shared/char/${playerSkin()}/${name.slice(8)}.png`
  : name.includes('/') ? `/assets/runner/${name}.png`
  : `${theme().assetBase}/image/${name}.png`;

/** 소리 경로. 확장자가 파일마다 달라(wav/mp3) 이름을 통째로 받는다. */
export const audioUrl = file => `${theme().assetBase}/audio/${file}`;

/**
 * UI 그림 — `theme.ui`에 선언된 것만 쓴다.
 *
 * 이름을 직접 `img()`에 넘기지 않고 한 겹 두는 이유: **테마가 무엇을 반드시
 * 가져야 하는지가 한곳에 모인다.** 새 테마에서 빠뜨리면 여기서 걸린다.
 */
export function ui(key) {
  const name = theme().ui?.[key];
  if (!name) throw new Error(`[runner] 테마 '${theme().id}'에 ui.${key}가 없다.`);
  return img(name);
}

/** 배열형 UI 그림 (카운트다운 3-2-1, 레벨 완료 5장 등). 1-based 인덱스. */
export function uiAt(key, i) {
  const list = theme().ui?.[key];
  if (!Array.isArray(list)) throw new Error(`[runner] 테마 '${theme().id}'에 ui.${key} 배열이 없다.`);
  const name = list[i - 1] ?? list[list.length - 1];
  return img(name);
}

// 타이틀 배경은 CSS가 그린다. CSS는 JSON을 못 읽으므로 변수로 건네준다.
function applyCssVars(t) {
  if (typeof document === 'undefined') return;   // 테스트·오프스크린 렌더
  const r = document.documentElement.style;
  const url = n => `url('${t.assetBase}/image/${n}.png')`;
  if (t.ui?.title) r.setProperty('--rn-title-bg', url(t.ui.title));
  if (t.ui?.titlePortrait) r.setProperty('--rn-title-bg-portrait', url(t.ui.titlePortrait));
}
