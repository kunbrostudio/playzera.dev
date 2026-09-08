// 풍선 팡팡 — 실제 그림 자산 (ken 업로드, 2026-09-05).
//
// 색은 스프라이트 로직(`game.js`/`arcade2d/`)이 모른다 — 순수 로직은 몸이
// 몇 개, 어느 방향으로 움직이는지만 안다. 그림을 어느 색으로 그릴지는
// **화면(`ui/playScreen.js`)의 몫**이다(CLAUDE.md: "그림 파일 이름을 id에서
// 계산하지 않는다" — 여기서는 반대로 "무슨 색인지는 화면이 정한다"는 같은 원칙의
// 다른 방향: 로직 쪽에 그림 지식을 섞지 않는다).
export const BALLOON_SPRITES = {
  pink:   '/assets/balloon-festival/sprites/balloon_pink.png',
  blue:   '/assets/balloon-festival/sprites/balloon_blue.png',
  yellow: '/assets/balloon-festival/sprites/balloon_yellow.png',
  green:  '/assets/balloon-festival/sprites/balloon_green.png',
  purple: '/assets/balloon-festival/sprites/balloon_purple.png',
  orange: '/assets/balloon-festival/sprites/balloon_orange.png',
  red:    '/assets/balloon-festival/sprites/balloon_red.png',
}

export const BALLOON_COLORS = Object.keys(BALLOON_SPRITES)

/** 스프라이트 id로 색을 고정해서 배정한다 — 같은 풍선이 프레임마다 색을 안 바꾼다. */
export const colorFor = id => BALLOON_COLORS[id % BALLOON_COLORS.length]

// ken이 두 번째로 준 넙적한 바구니로 교체(2026-09-05) — 원본(basket.png)은
// 세로 비율이 커서 화면 아래 자리에 놓았을 때 두꺼워 보였다.
export const BASKET_IMAGE = '/assets/balloon-festival/sprites/basket_wide.png'

/** 타이틀 화면 겸 썸네일. manifest.json의 thumbnail과 같은 그림이다. */
export const TITLE_IMAGE = '/assets/balloon-festival/image/title.png'
