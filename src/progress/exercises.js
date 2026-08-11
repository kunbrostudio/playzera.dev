// 운동 사전 — **동작을 데이터로 둔다.**
//
// 게임·버디·배지를 registry 한 줄로 늘리는 것과 같은 규칙이다.
// 동작이 늘어도 손대는 곳은 이 배열 하나다 —
// EXP 가중치도, 마이페이지의 칸도, 배지가 쓰는 지표 이름도 전부 여기서 나온다.
//
// ── 왜 이 파일이 생겼나 ──────────────────────────────────────
//
// 지표 이름('jumps'·'squats'…)이 level.js·report.js·badges.js에 흩어져 있었다.
// 동작을 하나 추가하려면 세 파일을 고쳐야 했고, 한 군데를 빠뜨리면
// **EXP는 오르는데 화면에는 안 나오는** 상태가 된다. 정본을 하나로 모은다.
//
// ── 무엇을 운동으로 세는가 ───────────────────────────────────
//
// 기본운동기술(FMS)은 셋이다 — 이동 · 안정 · 조작.
// 우리가 세던 넷(점프·앉기·좌우·포즈)은 전부 "제자리에서 몸통·다리"라
// **유산소와 균형이 통째로 비어 있었다.** 그 둘을 메우는 게 이번 추가다.
//
//   aerobic  숨이 차는 것          — 제자리 달리기
//   balance  한 발로 버티는 것      — 모든 동작의 토대, 넘어짐 예방
//
// ⚠️ **횟수만 세면 안 된다.** 대충 흔들어도 오르는 값은 운동 데이터가 아니다.
//    각 동작에 `quality`(문턱)를 적어 두고 감지기가 그걸 지킨다.

export const GROUPS = {
  base:    '기본',
  power:   '순발력',
  strength:'근력',
  agility: '민첩',
  aerobic: '유산소',
  balance: '균형',
  flex:    '유연',
}

/**
 * key      기록에 쌓이는 이름 (state.totals[key])
 * exp      1회(또는 1초)당 EXP — 활동 1초 = 1이 기준이다
 * unit     화면에 붙는 단위
 * minutes  초로 쌓이지만 분으로 보여줄 값
 * quality  감지기가 지켜야 할 문턱. **숫자가 아니라 약속이다**
 */
export const EXERCISES = [
  {
    key: 'active_sec', label: '활동', emoji: '⏱', unit: '분', minutes: true,
    group: 'base', exp: 1,
    quality: '몸이 실제로 움직이는 동안만. 메뉴·대기 시간은 빼고 센다',
  },
  {
    key: 'jumps', label: '점프', emoji: '🦘', unit: '회',
    group: 'power', exp: 2,
    quality: '골반이 키의 4% 이상 올라가고 상승 속도가 붙어야 1회',
    safety: '연속 10회쯤에서 한 번 쉬어 간다 — 착지가 반복되면 무릎에 부담',
  },
  {
    key: 'squats', label: '앉기', emoji: '🧎', unit: '회',
    group: 'strength', exp: 2,
    quality: '골반이 충분히 내려갔다가 다시 서야 1회. 살짝 굽히는 건 안 센다',
  },
  {
    key: 'side_steps', label: '좌우', emoji: '↔️', unit: '회',
    group: 'agility', exp: 1,
    quality: '실제로 자리를 옮겨야 1회. **피한 개수(dodge)는 쓰지 않는다** — 가만히 서 있어도 오른다',
  },
  {
    key: 'pose_holds', label: '포즈', emoji: '🤸', unit: '회',
    group: 'flex', exp: 5,
    quality: '목표 자세를 2~3초 유지해야 1회',
    safety: '4~8세는 한 자세를 오래 못 버틴다. 3초를 넘겨 요구하지 않는다',
  },

  // ── 여기부터가 이번에 메우는 두 축 ──────────────────────────
  {
    key: 'high_knees', label: '달리기', emoji: '🏃', unit: '걸음',
    group: 'aerobic', exp: 1,
    quality: '무릎이 서 있을 때보다 키의 10% 이상 올라와야 한 걸음',
    safety: '30초 달리고 잠깐 숨 고르기 — 계속 몰아붙이지 않는다',
  },
  {
    key: 'balance_sec', label: '균형', emoji: '🦩', unit: '초',
    group: 'balance', exp: 2,
    quality: '한 발이 확실히 떠 있는 동안만 초를 센다. 잠깐 흔들리는 건 봐준다',
    safety: '넘어질 것에 대비해 주변을 비운다. 한쪽만 오래 하지 않는다',
  },
]

export const getExercise = key => EXERCISES.find(e => e.key === key) ?? null

// EXP 가중치 — **여기가 정본이다.** level.js가 이걸 가져다 쓴다.
export const EXP_WEIGHTS = Object.fromEntries(EXERCISES.map(e => [e.key, e.exp]))

// 마이페이지 '오늘의 활동' 칸. 순서 = 이 배열 순서.
export const METRICS = EXERCISES

export function metricValue(totals = {}, m) {
  const v = totals[m.key] ?? 0
  return m.minutes ? Math.round(v / 60) : v
}
