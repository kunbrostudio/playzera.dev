// ─── 모든 튜닝 포인트 집약 ───
//
// gesture 블록만 예외다. 똥 피하기도 같은 O/X를 쓰게 되면서 `core/pose/tuning.js`로
// 올렸다 — 값이 두 벌이 되면 반드시 어긋난다.
import { GESTURE } from '../../core/pose/tuning.js'
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
  },

  pose: {
    holdSec: 3.0,           // 포즈 유지 성공 기준 (운동 유효성 우선 — 레벨 무관 고정)
    matchThreshold: 0.75,   // 유사도 기준
    softTimeoutSec: 20,     // 이 시간 지나면 실패 없이 통과
    types: ['lunge', 'forwardbend', 'armsopen'],
  },

  // 모션 인식 임계값 — 전부 bodyHeight(코~발목) 비율 기준
  motion: {
    laneThreshold: 0.12,    // 골반 X 이동
    laneHysteresis: 0.03,
    jumpRise: 0.07,         // 골반 Y 상승량
    jumpVelocity: 0.25,     // 상승 속도(bodyHeight/초)
    jumpCooldown: 0.6,
    duckDrop: 0.14,         // 골반 Y 하강량
    emaAlpha: 0.35,         // 랜드마크 스무딩
    calibrationSec: 1.5,
  },

  judge: {
    hitWindow: 0.35,        // 히트 판정 여유(초)
  },

  // @deprecated STEP 1-4에서 Supabase로 전환됨. Express 서버는 더 이상 없다.
  // stats.js가 core/gameResult.js를 직접 사용한다. 남겨둔 것은 참조 이력 확인용.
  api: { records: null },
  gameId: 'japari-run',
  userId: getCurrentPlayerName(),   // → core/player.js (계정은 기획안 2단계)

  game: { lives: 10 }, // 캐릭터 목숨 — 장애물에 부딪히거나(Miss) 포즈 실패 시 1씩 차감

  // 손 동작(제스처) 컨트롤 — 머리 위로 동그라미(O)=시작/확인/건너뛰기, 엑스(X)=종료/뒤로가기
  gesture: GESTURE,   // → core/pose/tuning.js
};
