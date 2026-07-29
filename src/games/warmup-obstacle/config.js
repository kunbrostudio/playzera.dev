// ─── 모든 튜닝 포인트 집약 ───
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

  api: { records: '/api/records' },
  gameId: 'japari-run',
  userId: 'local-default',

  game: { lives: 10 }, // 캐릭터 목숨 — 장애물에 부딪히거나(Miss) 포즈 실패 시 1씩 차감

  // 손 동작(제스처) 컨트롤 — 머리 위로 동그라미(O)=시작/확인/건너뛰기, 엑스(X)=종료/뒤로가기
  gesture: {
    startHoldSec: 3.0,          // 카메라 준비 화면: O 포즈 유지 시간 → 캘리브레이션 시작
    confirmHoldSec: 1.5,        // 종료 확인/게임오버 화면: O(계속)·X(종료) 유지 시간
    tutorialHoldSec: 1.0,       // 튜토리얼 화면: O=건너뛰기, X=이전 화면으로
    duringPlayExitHoldSec: 1.5, // 게임 진행 중: X 유지 시 종료 확인창 열기
    armsUpMargin: 0.12,     // O: 손목이 코보다 이만큼(bodyHeight 비율) 위에 있어야 "든" 것으로 인정
    closeMargin: 0.28,      // O: 두 손목 사이 거리가 이 이내(bodyHeight 비율)면 동그라미로 인정
    crossSeparation: 0.15,  // X: 두 손목이 최소 이만큼(어깨너비 비율)은 벌어져야 교차로 인정(낮을수록 쉬움) — 발목 대신 어깨너비 기준으로 변경(플레이 중에도 안정적으로 인식되도록)
  },
};
