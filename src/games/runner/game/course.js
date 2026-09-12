// Course — 레벨별 장애물 타임라인 생성 (AE 버전 고정 패턴 계승)
// 1사이클: 회피 큐브 6 → 허들 6(점프/숙이기 교차) → 포즈 사인판 3
import { CONFIG } from '../config.js';

// 좌우가 있는 자세만 방향을 바꾼다. 팔벌리기(armsopen)는 좌우 대칭인 T포즈라
// 뒤집어도 똑같이 보이므로 대상에서 뺀다.
const MIRROR_POSES = new Set(['lunge', 'forwardbend']);

/**
 * @param {number} levelIdx
 * @param {number} [speedMult] 러너 속도 설정 배율(`core/runnerSpeed.js`).
 *   기본 1 — 안 주면 기존 동작과 완전히 같다(순수 함수 유지, 테스트가
 *   `buildCourse(0)`만 불러도 깨지지 않는다). `speed`에만 곱한다 —
 *   `approachSec`(반응 여유)는 그대로 둔다. 이유는 `core/runnerSpeed.js`에.
 * @param {object} [opts]
 * @param {typeof CONFIG.levels} [opts.levels] 레벨 표를 통째로 갈아 낀다(기본
 *   `CONFIG.levels` — 쥬라기·2D 러너 셋이 그대로 쓴다). **오디세이 런은 6판이
 *   한 표로 이어지는 자기 표를 넘긴다** — `CONFIG.levels`(5개)를 늘리면
 *   `manifest.levels` 없는 쥬라기 3D가 6판이 되어 버린다(회귀).
 * @param {boolean|((levelIdx:number, levels:any[]) => boolean)} [opts.archGate]
 *   결승 포털(`archGate`) 이벤트를 어느 레벨에 넣을지. 기본 `true` = **마지막
 *   레벨만**(쥬라기 — `runner3d/portal.js`가 그린다). `false` = 안 넣는다.
 *   **함수를 주면 레벨마다 물어본다** — 오디세이 런은 스테이지 경계(Lv2·Lv4·
 *   Lv6)마다 정식 Finish Gate lifecycle을 태우려고 `isStageFinale`을 넘긴다
 *   (`docs/04` STEP 82). archGate 이벤트가 있으면 `play3d.js`의 passThrough →
 *   레벨 완료/finish 흐름을 그대로 탄다.
 */
export function buildCourse(levelIdx, speedMult = 1, opts = {}) {
  const { levels = CONFIG.levels, archGate = true } = opts;
  const wantArchGate = typeof archGate === 'function'
    ? archGate(levelIdx, levels)
    : (archGate && levelIdx === levels.length - 1);
  const level = levels[levelIdx];
  const C = CONFIG.course;
  const speed = level.speed * speedMult;
  const events = [];
  let t = C.firstDelay;

  // ── 포즈 사인판 좌우 번갈아 보여주기 ★ ──────────────────────
  // 채점(`core/pose/poseMatch.js`의 `mirrorFeatures`)은 원래 아이가 어느 쪽으로
  // 하든 통과시킨다 — 그런데 사인판 그림과 캐릭터 시범은 늘 한쪽만 보여줬다.
  // 그러면 아이는 반대쪽을 할 생각을 아예 못 한다. 자세마다 나올 때마다
  // 번갈아 뒤집어서 두 쪽 다 몸을 쓰게 한다.
  //
  // 시작값을 레벨 번호로 삼는다 — 사이클이 하나뿐인 레벨(1·2)도 서로 다른
  // 쪽에서 시작해서, 레벨을 이어 하면(1→5) 전체적으로 고르게 섞인다.
  // 레벨 하나만 다시 해도(같은 levelIdx) 항상 같은 순서라 예측 가능하고
  // 테스트할 수 있다 — 무작위로 두면 "이번엔 왜 이쪽이지"를 아무도 답 못 한다.
  const mirrorSeed = { lunge: levelIdx, forwardbend: levelIdx };

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
      const mirror = MIRROR_POSES.has(pose) && (mirrorSeed[pose]++ % 2 === 1);
      events.push({ type: 'poseSign', pose, lane: 0, hitTime: t, mirror });
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

  // 레벨5 마지막: 결승 포털 (`runner3d/portal.js`)
  //
  // ── 여유를 크게 둔다 ★ ──
  // 1.5초였다. 자세를 잡고 있던 아이가 팻말을 지나자마자 결승선이 코앞이라
  // **끝났다는 걸 알아차릴 새가 없었다.** 결승선은 마지막 장애물이 아니라
  // 도착 지점이고, 도착에는 다가가는 시간이 있어야 한다.
  if (wantArchGate) {
    const gateTime = lastHitTime + C.finishGap;
    events.push({ type: 'archGate', lane: 0, hitTime: gateTime });
    // 판이 끝나는 것은 문을 지난 뒤다(`play3d.js`의 `PASS_MS` = 0.9초).
    // 마지막 레벨은 `PASS_MS` 타이머가 먼저 끝나 이 `duration`은 안전망일
    // 뿐이지만, **스테이지 경계**(오디세이 Lv2·Lv4 — `passThrough()`가 거기선
    // `passing`만 세우고 끝내지 않는다, `play3d.js` 주석)에서는 이 값이
    // **유일한** 완료 트리거다. 예전 값(+3)은 `PASS_MS`와 안 맞아 "문을
    // 지나고도 3초를 더 달린 뒤에야 완료 배너가 뜬다"로 보였다(ken QA,
    // STEP 87) — `PASS_MS`와 같은 길이로 맞춰 스테이지 경계도 최종 레벨과
    // 똑같이 빠르게 느껴지게 한다.
    return { events, duration: gateTime + 0.9, approachSec: level.approachSec, speed };
  }

  // 마지막 장애물(포즈) 판정 + 팝업 애니메이션이 끝날 정도의 짧은 여유만 두고 바로 완료 처리
  return { events, duration: lastHitTime + 2.0, approachSec: level.approachSec, speed };
}
