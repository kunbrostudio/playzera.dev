// ─── 모든 튜닝 포인트 집약 ───
//
// gesture 블록만 예외다. 똥 피하기도 같은 O/X를 쓰게 되면서 `core/pose/tuning.js`로
// 올렸다 — 값이 두 벌이 되면 반드시 어긋난다.
import { GESTURE, MOVES } from '../../core/pose/tuning.js'
import { getCurrentPlayerName } from '../../core/player.js'

export const CONFIG = {
  canvas: { w: 1600, h: 900 },

  world: {
    horizonY: 380,          // 소실점 y
    charBaseY: 810,         // 캐릭터 발 위치 y
    laneSpacing: 240,       // 캐릭터 위치에서의 레인 간격(px)
    trackHalfWidthNear: 430,
    trackHalfWidthFar: 26,
    scrollSpeedBase: 1.0,   // 트랙 스크롤 체감 속도 배율
  },

  character: {
    height: 300,            // 렌더 높이(px), 캐릭터 위치 기준
    runFps: 10,
    jumpDuration: 0.75,     // 점프 체공(초)
    jumpHeight: 220,
    laneLerpSpeed: 9,       // 레인 이동 보간 속도
  },

  // 레벨 설계 — AE 교훈: 여유시간 최우선
  levels: [
    { cycles: 1, speed: 1.0,  approachSec: 3.2 },
    { cycles: 1, speed: 1.15, approachSec: 2.8 },
    { cycles: 2, speed: 1.3,  approachSec: 2.5 },
    { cycles: 2, speed: 1.45, approachSec: 2.2 },
    { cycles: 3, speed: 1.6,  approachSec: 2.0 },
  ],

  // 코스 패턴 간격(초) — 레벨 speed로 나눠 적용
  course: {
    cubeGap: 3.0, cubeCount: 6,
    hurdleGap: 4.0, hurdleCount: 6,
    // 앉기(hurdleWide) 허들 직후 포즈 사인판으로 넘어가는 구간 — 다른 구간 전환(1.0)보다
    // 여유를 더 줌. 레벨 3부터 속도가 붙으면서 이 구간이 너무 빨리 이어져 마지막 허들을
    // 피하려고 앉는 도중에 다음 포즈 사인판이 판정 대기 상태로 들어와 앉기 입력이 씹히던
    // 문제(아래 character.js의 근본 수정과 함께) 완화용
    hurdleToPoseGap: 2.5,
    poseGap: 6.0,
    firstDelay: 2.0,
    // ── 마지막 포즈 팻말 → 결승 포털 ★ ────────────────────────
    // 1.5였다. 자세를 잡고 있던 아이가 팻말을 지나자마자 결승선이 코앞이라
    // **너무 빨리 지나가 버렸다** — 끝났다는 걸 알아차릴 새가 없다.
    //
    // 다른 간격과 달리 **speed로 안 나눈다.** 이건 규칙이 아니라 연출이라
    // 레벨이 빨라져도 같은 시간 동안 보여야 한다. 나누면 마지막 레벨
    // (speed 1.6)에서 제일 짧아지는데, 하필 거기가 결승선이 나오는 판이다.
    //
    // 5초면 포털이 안개에서 걸어 나오고, 아이가 가운데로 모이고
    // (`PORTAL_FUNNEL` 26유닛), 문이 밝아지는 것까지 다 보인다.
    finishGap: 5.0,
  },

  pose: {
    holdSec: 3.0,           // 포즈 유지 성공 기준 (운동 유효성 우선 — 레벨 무관 고정)
    // 유사도 기준. 0.75였던 걸 0.68로 낮췄다(ken 요청, 9/4) — 아이패드
    // 실사용 테스트에서 포즈 인식이 안 된다는 보고가 반복됐다. 자세가
    // 틀려서가 아니라 **기준이 아이에게 너무 빡빡했던 쪽**으로 봤다 —
    // `poses.js`의 요가 문턱이 이미 같은 이유로 0.68이다("아이의 요가는
    // 모양이 아니라 시도가 목적"). 포즈 장애물도 같은 값으로 맞췄다 —
    // 자세가 정확해서가 아니라 "인식이 안 돼서" 반복 실패하면 자신감이
    // 깎이는 쪽이 운동 데이터 정밀도보다 더 나쁘다는 판단이다.
    //
    // **더 낮추지 못한 이유**가 있다 — `test/poseMatcher.test.js`로 실제
    // 값을 재보니, 그냥 서 있는 자세가 `armsopen`으로 0.667점, 몸통을
    // 안 기울이고 팔만 든 자세가 `forwardbend`로 0.667점이 나온다(둘 다
    // "그 포즈가 아닌데 통과하면 안 되는" 경계 테스트다). 0.60까지
    // 내렸더니 이 둘이 실제로 통과해 버렸다 — 아무 자세나 잡아도 포즈
    // 장애물을 넘는 건 "인식이 후해진 것"이 아니라 "운동이 아닌 게
    // 운동으로 세어지는 것"이다(`CLAUDE.md`: 대충 흔들어도 오르는 값은
    // 운동 데이터가 아니다). 0.68은 그 경계(0.667)보다 위, 진짜 포즈
    // 점수(0.92~0.98)보다는 한참 아래라 여유가 있다. 포즈별 목표각·비율
    // (`POSE_TARGETS`)은 그대로 뒀다 — 포즈끼리 구별하는 섬세한 값들이라
    // 전체 기준 하나만 낮추는 쪽이 더 안전하다.
    //
    // 실기기 미검증 — 다음 테스트에서 "이제 쉽게 되는지"·"엉뚱한 자세가
    // 새치기하지 않는지" 둘 다 확인이 필요하다.
    matchThreshold: 0.68,
    softTimeoutSec: 20,     // 이 시간 지나면 실패 없이 통과 (미사용 — 아무도 안 부른다, STEP 62에서 발견)
    types: ['lunge', 'forwardbend', 'armsopen'],
  },

  // 모션 인식 임계값 — 전부 bodyHeight(코~발목) 비율 기준
  // 동작 문턱 — **정본은 `core/pose/tuning.js`의 MOVES다.**
  // 클리커 게임이 같은 넷을 쓰게 되면서 올렸다. 여기 숫자를 다시 적으면 두 벌이 된다.
  // `duckDrop`은 MOVES에서 `squatDrop`으로 이름이 바뀌었다 — 같은 값, 같은 판정이다.
  motion: { ...MOVES, duckDrop: MOVES.squatDrop },

  judge: {
    hitWindow: 0.35,        // 히트 판정 여유(초)
  },

  // @deprecated STEP 1-4에서 Supabase로 전환됨. Express 서버는 더 이상 없다.
  // stats.js가 core/gameResult.js를 직접 사용한다. 남겨둔 것은 참조 이력 확인용.
  api: { records: null },
  // gameId는 여기 없다 — **테마가 갖는다**(`theme.json`의 `id`).
  // 러너 엔진을 여러 게임이 공유하므로 설정 파일에 하나만 둘 수 없다.
  userId: getCurrentPlayerName(),   // → core/player.js (계정은 기획안 2단계)

  game: { lives: 10 }, // 캐릭터 목숨 — 장애물에 부딪히거나(Miss) 포즈 실패 시 1씩 차감

  // 손 동작(제스처) 컨트롤 — 머리 위로 동그라미(O)=시작/확인/건너뛰기, 엑스(X)=종료/뒤로가기
  gesture: GESTURE,   // → core/pose/tuning.js
};
