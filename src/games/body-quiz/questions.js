// 바디 퀴즈 문제 사전 — 문제를 데이터로 둔다(게임·버디·배지와 같은 규칙).
//
// 지금은 프로토타입 문제 하나뿐이다. 늘어날 때도 이 배열에 항목만
// 추가하면 된다 — game.js·play.js는 문제가 몇 개인지 모른다.
//
// body_* 신체 부위 문제는 이번 MVP 범위에서 뺐다. color 문제는
// color_yellow·color_green 두 장만 준비돼 있지만, 이번 단계는 상태
// 머신 하나만 검증하는 게 목표라 아직 안 올린다.

export const SIDE = { LEFT: 'left', RIGHT: 'right' }

export const QUESTIONS = [
  {
    id: 'animal-nose',
    prompt: '코가 긴 동물은 누구일까?',
    left:  { id: 'elephant', label: '코끼리', image: '/assets/body-quiz/answers/animal_elephant.png' },
    right: { id: 'tiger',    label: '호랑이', image: '/assets/body-quiz/answers/animal_tiger.png' },
    correctSide: SIDE.LEFT,
    exercise: { key: 'squat', targetReps: 5 },
  },
]

export const getQuestion = id => QUESTIONS.find(q => q.id === id) ?? null
