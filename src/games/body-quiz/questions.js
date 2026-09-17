// 바디 퀴즈 문제 사전 — 문제를 데이터로 둔다(게임·버디·배지와 같은 규칙).
//
// 실제 BODY QUIZ answer asset이 있는 문제만 활성화한다. 늘어날 때도 이 배열에 항목만
// 추가하면 된다 — game.js·play.js는 문제가 몇 개인지 모른다.

export const SIDE = { LEFT: 'left', RIGHT: 'right' }

export const BODY_QUIZ_LOCALES = Object.freeze({
  ko: Object.freeze({
    answers: Object.freeze({ elephant: '코끼리', tiger: '호랑이' }),
    prompts: Object.freeze({
      'animal-nose': '코가 긴 동물은 누구일까?',
      'animal-stripes': '몸에 줄무늬가 있는 동물은 누구일까?',
      'animal-big-ears': '귀가 크고 몸집이 큰 동물은 누구일까?',
      'animal-roar': '어흥 하고 우는 동물은 누구일까?',
      'animal-water-spray': '코로 물을 뿌릴 수 있는 동물은 누구일까?',
      'animal-big-cat': '커다란 고양이처럼 생긴 동물은 누구일까?',
    }),
  }),
  en: Object.freeze({
    answers: Object.freeze({ elephant: 'Elephant', tiger: 'Tiger' }),
    prompts: Object.freeze({
      'animal-nose': 'Which animal has a long trunk?',
      'animal-stripes': 'Which animal has stripes?',
      'animal-big-ears': 'Which animal has big ears and a large body?',
      'animal-roar': 'Which animal says roar?',
      'animal-water-spray': 'Which animal can spray water with its trunk?',
      'animal-big-cat': 'Which animal looks like a big cat?',
    }),
  }),
})

const ANSWERS = Object.freeze({
  elephant: Object.freeze({
    id: 'elephant',
    labelKey: 'answers.elephant',
    image: '/assets/body-quiz/answers/animal_elephant.png',
  }),
  tiger: Object.freeze({
    id: 'tiger',
    labelKey: 'answers.tiger',
    image: '/assets/body-quiz/answers/animal_tiger.png',
  }),
})

function localizedAnswer(id, locale = 'ko') {
  return { ...ANSWERS[id], label: BODY_QUIZ_LOCALES[locale].answers[id] }
}

function animalQuestion({ id, correctSide }) {
  return {
    id,
    category: 'animal',
    promptKey: `prompts.${id}`,
    prompt: BODY_QUIZ_LOCALES.ko.prompts[id],
    left: localizedAnswer('elephant'),
    right: localizedAnswer('tiger'),
    correctSide,
    exercise: { key: 'squat', targetReps: 5 },
  }
}

export const QUESTIONS = [
  animalQuestion({ id: 'animal-nose', correctSide: SIDE.LEFT }),
  animalQuestion({ id: 'animal-stripes', correctSide: SIDE.RIGHT }),
  animalQuestion({ id: 'animal-big-ears', correctSide: SIDE.LEFT }),
  animalQuestion({ id: 'animal-roar', correctSide: SIDE.RIGHT }),
  animalQuestion({ id: 'animal-water-spray', correctSide: SIDE.LEFT }),
  animalQuestion({ id: 'animal-big-cat', correctSide: SIDE.RIGHT }),
]

export const getQuestion = id => QUESTIONS.find(q => q.id === id) ?? null

/** 현재 UI 계약(prompt/label)을 유지하면서 이후 locale 전환 지점을 한곳에 둔다. */
export function localizeBodyQuizQuestion(question, locale = 'ko') {
  const copy = BODY_QUIZ_LOCALES[locale] ?? BODY_QUIZ_LOCALES.ko
  return {
    ...question,
    prompt: copy.prompts[question.id] ?? BODY_QUIZ_LOCALES.ko.prompts[question.id] ?? question.prompt,
    left: { ...question.left, label: copy.answers[question.left.id] ?? question.left.label },
    right: { ...question.right, label: copy.answers[question.right.id] ?? question.right.label },
  }
}
