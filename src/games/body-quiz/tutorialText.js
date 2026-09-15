// 바디 퀴즈 튜토리얼 문구 사전 — ko/en.
//
// 앱 전체 i18n 시스템은 아직 없다(이 프로젝트는 지금까지 전부 한국어를
// 코드에 직접 적어 왔다). 여기서 전역 i18n을 새로 만들지 않는다 — 이
// 화면 하나가 쓰는 아주 얇은 사전이다. 나중에 실제 언어 설정이 생기면
// `DEFAULT_LOCALE`을 그 값으로 바꿔주기만 하면 된다.
//
// 텍스트를 이미지에 박지 않는 이유는 그대로다 — 언어가 늘 때마다
// 그림을 다시 만들 수는 없다.

export const DEFAULT_LOCALE = 'ko'
export const LOCALES = ['ko', 'en']

const TEXT = {
  ko: {
    badge: 'BODY QUIZ',
    title: 'TUTORIAL',
    moveLockBanner: 'MOVE LOCK!',
    moveUnlockBanner: 'MOVE UNLOCK!',
    correctBadge: '정답! +100',
    prev: '이전',
    next: '다음',
    skip: '건너뛰기',
    start: '게임 시작!',
    steps: [
      { title: '문제와 답을 먼저 확인해요!', guide: '먼저 문제와 두 개의 답을 잘 봐요!' },
      { title: '먼저 운동 미션을 해요!', guide: '먼저 운동 미션을 따라 하고 에너지를 채워요!' },
      { title: '에너지가 100% 되면 이동할 수 있어요!', guide: '에너지가 다 차면 이제 몸을 움직일 수 있어요!' },
      { title: '몸을 움직여 정답을 선택해요!', guide: '정답 쪽으로 몸을 움직이면 선택 완료! 이제 시작해 볼까요?' },
    ],
  },
  en: {
    badge: 'BODY QUIZ',
    title: 'TUTORIAL',
    moveLockBanner: 'MOVE LOCK!',
    moveUnlockBanner: 'MOVE UNLOCK!',
    correctBadge: 'Correct! +100',
    prev: 'Prev',
    next: 'Next',
    skip: 'Skip',
    start: 'Start!',
    steps: [
      { title: 'Check the question and answers!', guide: 'Look at the question and both answers first!' },
      { title: 'Do the exercise mission!', guide: 'Follow the exercise mission to fill your energy!' },
      { title: 'Full energy means you can move!', guide: 'Once energy is full, you can move your body!' },
      { title: 'Move your body to choose!', guide: 'Move toward the right answer to pick it! Ready to start?' },
    ],
  },
}

/** 이 로케일의 문구 뭉치. 없으면 기본(ko)로 떨어진다 — 텍스트가 통째로 안 뜨는 것보다 낫다. */
export function getText(locale = DEFAULT_LOCALE) {
  return TEXT[locale] ?? TEXT[DEFAULT_LOCALE]
}
