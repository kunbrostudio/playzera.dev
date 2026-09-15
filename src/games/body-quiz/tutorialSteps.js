// 바디 퀴즈 튜토리얼 4단계 — **무엇을 보여줄지**만 데이터로 둔다.
//
// tutorial.js는 이 배열의 길이도, 내용도 모르는 채로 같은 렌더 함수를
// 인덱스만 바꿔가며 다시 부른다. 스텝을 늘리거나 순서를 바꿀 때 이
// 파일만 고치면 된다(게임·버디·배지 registry와 같은 원칙).
//
// **정답 카드는 여기서 'left'/'right'를 못박지 않는다.** 문제가 바뀌면
// 정답 쪽도 바뀌므로, 강조할 자리는 `question.correctSide`를 그대로
// 가리키게 `highlightCorrectSide: true`로만 표시한다 — 데이터를
// 중복해서 적으면 문제와 튜토리얼이 서로 다른 답을 가리키는 사고가 날 수 있다.
//
// squatProgress는 실제 게임 공식(squats/target*100, game.js)과 같은 셈을
// 쓴다 — 연출값이 규칙과 벌어지면 아이가 게임에서 다른 숫자를 보게 된다.
// (test/bodyQuizTutorial.test.js가 이 관계를 지킨다.)
//
// ── boyImage/girlImage가 스텝마다 있는데 지금은 다 같은 값이다 ──
//
// 지금 실제로 있는 캐릭터 그림은 `boy_point.png`(가리키는 자세)·
// `girl_guide.png`(설명하는 자세) 둘뿐이다. 스쿼트·이동 전용 자세 그림은
// 아직 없다 — 없는 자세를 억지로 왜곡해서 만들지 않는다(ken 지시).
// 필드를 스텝마다 남겨 둔 이유는 그림이 생겼을 때 이 파일의 값만
// 바꾸면 되는 자리를 미리 만들어 두기 위해서다(tutorial.js는 안 바뀐다).
//
// ── centerImage / squatImages — 답안 카드 사이 중앙 설명 그림 ──
//
// 보드 바깥 좌우의 boy_point·girl_guide와는 별개다. 이건 답안 두 장 사이
// 빈자리에 놓여 "지금 이 단계가 무슨 뜻인지"를 그림으로 보여준다.
// STEP 2만 그림이 두 장(스쿼트 down/up)이라 `centerImage` 대신
// `squatImages: {down, up}`을 쓴다 — 하나만 더 있다고 배열로 일반화하면
// 나머지 세 스텝이 다 "그림 한 장짜리 배열"이 되어 오히려 읽기 어렵다.

const BOY_POINT = '/assets/body-quiz/tutorial/boy_point.png'
const GIRL_GUIDE = '/assets/body-quiz/tutorial/girl_guide.png'

const THINK_IMG = '/assets/body-quiz/tutorial/tutorial_think.png'
const SQUAT_DOWN_IMG = '/assets/body-quiz/tutorial/tutorial_squat_down.png'
const SQUAT_UP_IMG = '/assets/body-quiz/tutorial/tutorial_squat_up.png'
const UNLOCK_IMG = '/assets/body-quiz/tutorial/tutorial_unlock.png'
const MOVE_IMG = '/assets/body-quiz/tutorial/tutorial_move.png'

export const TUTORIAL_STEPS = [
  {
    id: 'read',
    animateExercise: false,
    squatProgress: 0,
    showAnswers: true,
    highlightCorrectSide: false,
    moveLocked: true,
    boyImage: BOY_POINT,
    girlImage: GIRL_GUIDE,
    centerImage: THINK_IMG,
    squatImages: null,
  },
  {
    id: 'exercise',
    animateExercise: true,
    squatProgress: 5,
    showAnswers: true,
    highlightCorrectSide: false,
    moveLocked: true,
    boyImage: BOY_POINT,
    girlImage: GIRL_GUIDE,
    centerImage: null,
    squatImages: { down: SQUAT_DOWN_IMG, up: SQUAT_UP_IMG },
  },
  {
    id: 'unlock',
    animateExercise: false,
    squatProgress: 5,
    showAnswers: true,
    highlightCorrectSide: false,
    moveLocked: false,
    boyImage: BOY_POINT,
    girlImage: GIRL_GUIDE,
    centerImage: UNLOCK_IMG,
    squatImages: null,
  },
  {
    id: 'answer',
    animateExercise: false,
    squatProgress: 5,
    showAnswers: true,
    highlightCorrectSide: true,
    moveLocked: false,
    boyImage: BOY_POINT,
    girlImage: GIRL_GUIDE,
    centerImage: MOVE_IMG,
    squatImages: null,
    isLast: true,
  },
]
