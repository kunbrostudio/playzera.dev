// Course — 레벨별 장애물 타임라인 생성 (AE 버전 고정 패턴 계승)
// 1사이클: 회피 큐브 6 → 허들 6(점프/숙이기 교차) → 포즈 사인판 3
import { CONFIG } from '../config.js';

export function buildCourse(levelIdx) {
  const level = CONFIG.levels[levelIdx];
  const C = CONFIG.course;
  const speed = level.speed;
  const events = [];
  let t = C.firstDelay;

  for (let cyc = 0; cyc < level.cycles; cyc++) {
    // 1) 회피 큐브 6개 — 차단 레인은 미리 정하지 않고, 스폰 시점(화면에 나타나는 순간)의
    //    캐릭터 실제 위치를 기준으로 결정한다(obstacles.js). 이렇게 해야 "이미 피해있는데
    //    엉뚱한 방향으로 이동하라는" 힌트 불일치가 생기지 않고, 매번 실제로 피해야 하는
    //    장애물이 된다.
    for (let i = 0; i < C.cubeCount; i++) {
      events.push({ type: 'cube', lane: null, hitTime: t });
      t += C.cubeGap / speed;
    }
    t += 1.0 / speed;

    // 2) 허들 6개 — 점프/숙이기 교차
    for (let i = 0; i < C.hurdleCount; i++) {
      events.push({ type: i % 2 === 0 ? 'hurdleLow' : 'hurdleWide', lane: 0, hitTime: t });
      t += C.hurdleGap / speed;
    }
    // 마지막 허들(특히 앉기)에서 곧바로 포즈 사인판으로 이어지는 구간 — 고속 레벨에서
    // 앉기 입력이 씹히던 문제 때문에 다른 구간 전환보다 여유를 더 둔다
    t += C.hurdleToPoseGap / speed;

    // 3) 포즈 사인판 3개 — 런지 → 상체숙이기 → 팔벌리기
    for (const pose of CONFIG.pose.types) {
      events.push({ type: 'poseSign', pose, lane: 0, hitTime: t });
      t += C.poseGap / speed;
    }
    // 다음 사이클로 넘어갈 때만 여유 시간 추가 — 마지막 사이클 뒤에 붙이면 레벨 완료 배너가
    // 뜨기까지 불필요하게 오래 기다리게 되므로 마지막에는 붙이지 않는다.
    if (cyc < level.cycles - 1) t += 1.5 / speed;
  }

  // 주의: 위 루프에서 마지막으로 push한 이벤트 이후에도 t는 한 번 더 gap만큼 증가해 있으므로
  // (다음 이벤트를 위한 값), 꼬리 여유 시간은 t가 아니라 "실제 마지막 이벤트의 hitTime" 기준으로
  // 계산해야 불필요하게 긴 지연이 생기지 않는다.
  const lastHitTime = events[events.length - 1].hitTime;

  // 레벨5 마지막: 결승 아치
  if (levelIdx === CONFIG.levels.length - 1) {
    events.push({ type: 'archGate', lane: 0, hitTime: lastHitTime + 1.5 });
    return { events, duration: lastHitTime + 1.5 + 3, approachSec: level.approachSec, speed };
  }

  // 마지막 장애물(포즈) 판정 + 팝업 애니메이션이 끝날 정도의 짧은 여유만 두고 바로 완료 처리
  return { events, duration: lastHitTime + 2.0, approachSec: level.approachSec, speed };
}
