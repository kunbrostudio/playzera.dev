import { PHASE } from './game.js'

export const BODY_QUIZ_GUIDE_CHARACTERS = {
  girl: { side: 'left', image: '/assets/body-quiz/play/guide_girl.png', alt: 'BODY QUIZ 여자 가이드' },
  boy: { side: 'right', image: '/assets/body-quiz/play/guide_boy.png', alt: 'BODY QUIZ 남자 가이드' },
}

// 문구와 화자를 화면 코드 밖에 둔다. 이후 i18n은 이 객체를 locale data로
// 교체하면 되고, game state/DOM 배선은 바꿀 필요가 없다.
export const BODY_QUIZ_GUIDE_MESSAGES = {
  locked:   { speaker: 'girl', text: '스쿼트를 하면 움직일 힘이 생겨!' },
  active:   { speaker: 'boy',  text: '조금만 더! 힘내!' },
  unlocked: { speaker: 'girl', text: '이제 정답 쪽으로 움직여!' },
  correct:  { speaker: 'boy',  text: '정답이야! 최고!' },
  wrong:    { speaker: 'girl', text: '괜찮아! 다음 문제에 도전!' },
}

export function getBodyQuizGuideCue(game) {
  if (game.phase === PHASE.ANSWER_RESULT) {
    return game.correct ? BODY_QUIZ_GUIDE_MESSAGES.correct : BODY_QUIZ_GUIDE_MESSAGES.wrong
  }
  if (!game.locked) return BODY_QUIZ_GUIDE_MESSAGES.unlocked
  if (game.squatCount > 0) return BODY_QUIZ_GUIDE_MESSAGES.active
  return BODY_QUIZ_GUIDE_MESSAGES.locked
}
