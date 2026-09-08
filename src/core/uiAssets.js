// 앱 전체가 같이 쓰는 UI 그림 — **한 장을 모든 게임이 돌려 쓴다.**
//
// ── 왜 게임 밖에 두나 ────────────────────────────────────────
//
// START 버튼은 게임의 그림이 아니라 **플레이 제라의 그림**이다. 러너도, 똥 피하기도,
// 팝팝 클리커도 같은 버튼을 쓴다. 게임 폴더마다 복사해 두면 사본이 게임 수만큼 늘고,
// 버튼 하나를 고칠 때 한 곳을 빠뜨리면 게임마다 다른 버튼이 뜬다 —
// 이 프로젝트가 아이콘·하늘 그림으로 이미 두 번 겪은 그것이다.
//
// 그래서 파일은 `/assets/ui/` 하나에 두고, **경로는 이 파일에만 적는다.**
// 화면 코드가 문자열로 경로를 적기 시작하면 다시 흩어진다.
//
// 러너 엔진은 테마를 거쳐 읽는다 — `theme.json`의 `ui.startButton`이
// `"ui/btn_start"`이고, `theme.js`의 `img()`가 이 폴더로 보낸다.

export const UI = {
  /** 게임 시작 버튼 — 모든 게임의 인트로 화면에 같은 것이 들어간다 */
  startButton: '/assets/ui/btn_start.png',
  /** 눌린 상태 */
  startButtonPressed: '/assets/ui/btn_start_pressed.png',
  /** 로딩 화면 로고 — PC·큰 모니터 (풀 워드마크, `core/loadingScreen.js`가 쓴다) */
  logoFull: '/assets/ui/logo_full.png',
  /** 로딩 화면 로고 — 태블릿·모바일 (PZ 축약형) */
  logoMark: '/assets/ui/logo_mark.png',
};
