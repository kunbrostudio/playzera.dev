// 배지 목록 — **데이터다.** 배지를 추가하려면 여기 한 줄이면 된다.
//
// ── 아이콘은 배지와 1:1이 아니다 ─────────────────────────────
//
// 처음에는 "파일 이름 = 배지 id"로 하려 했는데, 실제 그림이 나오고 보니
// **그림은 모티프 단위로 그려진다**(점프·별·하트·시계…). 배지 14개마다 그림을
// 따로 그리면 비슷한 그림을 여러 장 그리게 된다.
//
// 그래서 아이콘을 **돌려 쓰는 라이브러리**로 둔다. 배지는 `icon`으로 하나를 고른다.
//   → 그림 10장으로 배지 14개를 덮는다
//   → 새 배지가 기존 모티프를 쓰면 **그림 없이** 추가된다
//
// 조건 종류는 `progress/conditions.js`에 넷뿐이다(total · daysInWindow · variety · event).
// 새 배지가 그중 하나를 쓰면 코드도 안 건드린다.

export const BADGE_ICON_DIR = '/assets/badges'

// 지금 있는 아이콘. 그림을 추가하면 여기 한 줄.
export const ICONS = [
  'attendance', 'attendance02', 'check', 'egg', 'friend',
  'heart', 'jump', 'pose', 'star', 'time',
]

export const iconUrl = name => `${BADGE_ICON_DIR}/${name}.png`
export const badgeIcon = id => iconUrl(getBadge(id)?.icon ?? 'star')

// 갈래 — 화면에서 묶어 보여줄 때 쓴다
export const GROUPS = {
  start: '시작',
  move: '동작',
  time: '시간',
  habit: '꾸준함',
  explore: '탐험',
  grow: '성장',
}

export const BADGES = [
  // ── 시작 ──────────────────────────────────────────────────
  // 첫 보상은 **첫날에** 준다. 멀면 그전에 그만둔다.
  { id: 'first_play', icon: 'star', group: 'start', name: '첫 걸음', desc: '처음 놀았어요',
    cond: { kind: 'total', metric: 'sessions', n: 1 } },

  { id: 'first_buddy', icon: 'friend', group: 'start', name: '친구를 만났어요', desc: '알을 골랐어요',
    cond: { kind: 'event', event: 'buddy_chosen' } },

  // ── 동작 ──────────────────────────────────────────────────
  // ⚠️ '피하기 횟수'(dodgeCount)는 쓰지 않는다. **가만히 서 있어도 오른다.**
  //    실제로 자리를 옮긴 횟수(side_steps)만 운동으로 센다. (docs/05 4-1)
  { id: 'jump_20', icon: 'jump', group: 'move', name: '점프 챔피언', desc: '점프 20번 했어요',
    cond: { kind: 'total', metric: 'jumps', n: 20 } },

  { id: 'side_30', icon: 'check', group: 'move', name: '날쌘돌이', desc: '옆으로 30번 피했어요',
    cond: { kind: 'total', metric: 'side_steps', n: 30 } },

  { id: 'squat_20', icon: 'check', group: 'move', name: '앉았다 일어나기 대장', desc: '앉기 20번 했어요',
    cond: { kind: 'total', metric: 'squats', n: 20 } },

  { id: 'pose_5', icon: 'pose', group: 'move', name: '포즈 히어로', desc: '포즈 5번 성공했어요',
    cond: { kind: 'total', metric: 'pose_holds', n: 5 } },

  // 유산소와 균형 — 지금까지 세던 것에 통째로 빠져 있던 두 축 (docs/07)
  { id: 'run_100', icon: 'jump', group: 'move', name: '달리기 대장', desc: '제자리 달리기 100걸음',
    cond: { kind: 'total', metric: 'high_knees', n: 100 } },

  { id: 'balance_60', icon: 'pose', group: 'move', name: '외발 서기 챔피언', desc: '한 발로 다 합쳐 1분',
    cond: { kind: 'total', metric: 'balance_sec', n: 60 } },

  // ── 시간 ──────────────────────────────────────────────────
  { id: 'active_10m', icon: 'time', group: 'time', name: '10분 놀았어요', desc: '다 합쳐 10분',
    cond: { kind: 'total', metric: 'active_sec', n: 600 } },

  { id: 'active_60m', icon: 'time', group: 'time', name: '움직임 마스터', desc: '다 합쳐 1시간',
    cond: { kind: 'total', metric: 'active_sec', n: 3600 } },

  // ── 꾸준함 ────────────────────────────────────────────────
  // "연속"이 아니라 "기간 안에 몇 번"이다.
  //
  // 아이는 자기가 놀 수 있는지를 못 정한다 — 아프거나, 여행 가거나, 부모가 바쁘면 끊긴다.
  // 자기 잘못이 아닌 일로 기록이 사라지면 벌처럼 느껴진다.
  // 월·수·금이어도 "이번 주 3일"이다. (docs/05 4-1)
  { id: 'week_3', icon: 'heart', group: 'habit', name: '꾸준한 최고!', desc: '이번 주에 3일 놀았어요',
    cond: { kind: 'daysInWindow', days: 7, n: 3 } },

  { id: 'month_10', icon: 'attendance', group: 'habit', name: '한 달의 챔피언', desc: '이번 달에 10일 놀았어요',
    cond: { kind: 'daysInWindow', days: 30, n: 10 } },

  // ── 탐험 ──────────────────────────────────────────────────
  { id: 'explorer_2', icon: 'star', group: 'explore', name: '호기심쟁이', desc: '게임 2가지 해봤어요',
    cond: { kind: 'variety', of: 'games', n: 2 } },

  { id: 'explorer_3', icon: 'attendance02', group: 'explore', name: '탐험가', desc: '게임 3가지 해봤어요',
    cond: { kind: 'variety', of: 'games', n: 3 } },

  // ── 성장 ──────────────────────────────────────────────────
  // 운동이 아닌 보상. `event` 종류가 이런 걸 담는 자리다.
  { id: 'hatched', icon: 'egg', group: 'grow', name: '알이 깨졌다!', desc: '친구가 태어났어요',
    cond: { kind: 'event', event: 'hatch' } },

  { id: 'first_form', icon: 'friend', group: 'grow', name: '쑥쑥 자랐어요', desc: '새로운 모습이 열렸어요',
    cond: { kind: 'event', event: 'form_unlocked' } },
]

export const getBadge = id => BADGES.find(b => b.id === id) ?? null
