// 팝팝 클리커의 그림 — **이름을 여기 한곳에 모은다.**
//
// ── 그림이 없어도 게임이 돈다 ────────────────────────────────
//
// 지금은 에셋이 하나도 없다. 그래서 클리커·배경을 **CSS로 그려** 두고, 그림이 도착하면
// 같은 이름의 파일을 폴더에 넣기만 하면 그 위에 얹히게 했다.
//
//   그림 있음 → `background-image`가 CSS 도형을 덮는다
//   그림 없음 → 404가 나고 CSS 도형이 그대로 보인다 (콘솔 경고 없음)
//
// 러너처럼 로더가 미리 다 불러 `IMG[이름]`에 담는 방식을 쓰지 않은 이유:
// 이 게임은 캔버스가 아니라 **DOM**이라 브라우저가 알아서 불러오고, 없으면 조용히
// 넘어간다. 로더를 두면 "없는 파일 74장" 경고만 잔뜩 나온다.
//
// 파일이 도착하면 `docs/09`의 목록과 대조해 확인한다.

const BASE = '/assets/pop-clicker/image'

/** CSS `background-image` 값. 파일이 없으면 그냥 안 그려진다. */
export const bg = name => `url('${BASE}/${name}.png')`

/**
 * 이 게임이 기대하는 그림 목록 — **발주서의 정본이다.**
 * 화면 코드는 이 이름들만 쓴다. 이름을 바꾸려면 여기만 고치면 된다.
 */
export const IMAGES = {
  // 클리커 다섯 — 눌리지 않은 상태 / 눌린 상태
  clicker: {
    blue:   { up: 'clicker_blue_up',   down: 'clicker_blue_down' },
    yellow: { up: 'clicker_yellow_up', down: 'clicker_yellow_down' },
    pink:   { up: 'clicker_pink_up',   down: 'clicker_pink_down' },
    purple: { up: 'clicker_purple_up', down: 'clicker_purple_down' },
    green:  { up: 'clicker_green_up',  down: 'clicker_green_down' },
  },

  // 클리커 위에 새길 동작 그림 — **색을 외울 필요를 없애는 장치다**(`docs/09`)
  move: {
    jump:    'move_jump',
    squat:   'move_squat',
    left:    'move_left',
    right:   'move_right',
    armsUp:  'move_arms_up',
  },

  stage: 'stage_platform',   // 클리커 다섯이 올라선 받침
  bgRoom: 'bg_room',         // 배경 (놀이방)
  buddy: 'buddy_cheer',      // 응원하는 캐릭터
  superClicker: 'clicker_super',
  freeze: 'fx_freeze',       // 「얼음!」 연출
}

/** 각 클리커의 CSS 대체색 — 그림이 오기 전까지 이 색으로 보인다. */
export const FALLBACK = {
  blue:   { face: '#5aa8f0', top: '#8fd0ff', edge: '#2f6fb0' },
  yellow: { face: '#f5c13a', top: '#ffe08a', edge: '#b8860b' },
  pink:   { face: '#f56aa8', top: '#ffa8cf', edge: '#b0326e' },
  purple: { face: '#a071e8', top: '#c9a8ff', edge: '#6a3fb0' },
  green:  { face: '#7fc93f', top: '#b6f07a', edge: '#4a8a1e' },
}
