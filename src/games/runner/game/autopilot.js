// 자동재생 — 카메라도 손도 없이, 코스를 미리 보고 각 장애물에 맞는 동작을
// 정해진 타이밍에 대신 실행해 판마다 전부 통과시킨다.
//
// ── 왜 가능한가 ─────────────────────────────────────────────
//
// `judge.js`의 판정은 그 순간의 **상태**만 본다(레인 일치 · 점프 중 · 숙임
// 중 · 자세 일치) — 힘·속도·자세의 정확도를 흉내 낼 필요가 없다. 코스도
// `buildCourse`가 레벨마다 미리 다 정해 둔다(무작위로 실시간 생성되지
// 않는다). 그래서 "이 장애물이 몇 초 뒤에 온다"를 알고 그 전에 상태만
// 맞춰 두면 된다 — 자율주행이 아니라 **답을 미리 아는 채점**에 가깝다.
//
// ── 왜 `act.*`·`holdPose`를 안 부르나 ★ ──────────────────────
//
// 그 함수들은 입력이면서 동시에 **운동량을 세는 자리**다(`play3d.js`의
// "자세는 한 곳으로 모은다" 주석과 같은 이유 — 입구가 둘이면 세는 자리도
// 둘이 된다). 자동재생은 몸을 안 움직였으니 그 함수들을 부르면 안 된다 —
// 운동 데이터가 이 서비스의 존재 이유라, 여기서 실수하면 안 쌓아야 할
// 운동이 쌓인다. 그래서 캐릭터를 **한 단계 아래**(`setLane`·`jump`·`duck`·
// `setPose`)에서 직접 움직인다. 그 함수들은 판정(`judge.js`)이 보는 상태만
// 바꿀 뿐 기록을 남기지 않는다.
//
// ── 러너를 모른다 ───────────────────────────────────────────
//
// 이 모듈은 three도 canvas도 모른다. `course`(이벤트 배열)와 `controls`
// (아래 다섯 함수)만 있으면 된다 — 2D 러너든 3D 러너든, 이 코스 모양을
// 쓰는 어떤 화면이든 자기 캐릭터를 그 다섯 함수로 감싸기만 하면 그대로
// 쓸 수 있다.

/**
 * @typedef {object} AutopilotControls
 * @property {() => number} getLane        지금 캐릭터가 선 레인(정수)
 * @property {(lane: number) => void} setLane
 * @property {() => void} jump
 * @property {(on: boolean) => void} duck   true=웅크린다, false=일어난다
 * @property {(pose: string|null, mirror?: boolean) => void} setPose
 */

// 얼마나 미리 움직이나(초). 판정 창(`HIT_WINDOW`)은 이보다 훨씬 좁다
// (레벨에 따라 0.08~0.12초) — 미리 상태를 만들어 두고 판정 순간에는
// 이미 그 상태이기만 하면 된다.
//
// **자세만 훨씬 길다.** 실제 카메라 모드는 사인판이 화면에 들어오는 순간부터
// 최소 5.5초(`obstacles.js`의 `poseWindow`)까지 자세를 인정한다 — 아이가
// 벽에 닿기 한참 전부터 미리 자세를 잡고 걸어 들어오기 때문이다. 그런데
// 자동재생은 0.15초 전에야 자세를 잡아서 스쳐 지나가듯 잠깐만 보였다
// (ken 지적, 9/2). "사용자도 미리 포즈를 취할 것"이므로 그 흉내를 낸다 —
// 5.5초 전부터 잡으면 화면 저 멀리서부터 우스꽝스럽게 보이니, 사인판이
// 뚜렷이 보이기 시작할 즈음인 1.5초 전으로 잡는다.
const LEAD = { cube: 0.5, hurdleLow: 0.35, hurdleWide: 0.35, poseSign: 1.5 }

// 큐브를 피한 뒤 이만큼(초) 지나면 가운데 레인으로 돌아간다. 판정 창이
// 지나가고도 한숨 돌릴 시간을 준다 — 곧바로 돌아가면 큐브를 스치듯
// 피하고 바로 방향을 트는 것처럼 보인다. 다음 큐브까지는 보통 3초
// 안팎이라(`config.js`) 이 정도면 다음 회피와 안 겹친다.
const RETURN_TO_CENTER_SEC = 0.5

// 숙인 뒤 이만큼 더 지나야 일어난다. 판정 창이 지나갈 시간을 넉넉히 두되,
// 캐릭터 자신의 최소 유지 시간(`CHAR.duckSec` 0.55초)보다 살짝 길게 잡는다 —
// 짧으면 캐릭터 쪽 로직이 어차피 그만큼은 붙잡고 있어 의미가 없다.
const DUCK_HOLD_SEC = 0.6

/**
 * @param {() => {events: Array}} getCourse  **매번 새로 읽는다** — 레벨이
 *   바뀌면 코스 객체 자체가 통째로 바뀐다(`scene.js`의 `setLevel`). 생성
 *   시점에 한 번만 붙잡으면 다음 레벨부터는 지난 판을 보고 있게 된다.
 * @param {AutopilotControls} controls
 * @param {object} [opts]
 * @param {number} [opts.lanes] 전체 레인 수 — 가운데 레인을 여기서 계산한다
 *   (`Math.floor(lanes/2)`). 러너3D는 항상 3칸이라 기본값 그대로 쓴다.
 */
export function createAutopilot(getCourse, controls, { lanes = 3 } = {}) {
  const CENTER_LANE = Math.floor(lanes / 2)

  // 이미 명령을 내린 이벤트 — 한 번만 누르게 막는다. 레벨이 바뀌면 코스의
  // 이벤트 배열 자체가 새로 만들어지므로, 지난 레벨의 이벤트가 여기 남아
  // 있어도 새 이벤트와는 다른 객체라 아무 영향이 없다(참조 비교라 안전하다).
  const armed = new Set()
  let duckUntil = -Infinity
  let activePose = null
  // 큐브를 피한 뒤 가운데로 돌아갈 시각. 큐브를 피할 때마다 이 값을 새로
  // 미뤄 두므로, 큐브가 연달아 나와도 마지막 큐브를 지난 뒤 한 번만 돌아간다.
  let returnAt = Infinity

  return {
    /** 매 프레임 부른다. `now`는 코스와 같은 시계(초, `view.now`)다. */
    update(now) {
      if (duckUntil !== -Infinity && now >= duckUntil) {
        controls.duck(false)
        duckUntil = -Infinity
      }
      if (activePose && activePose.done) {
        controls.setPose(null)
        activePose = null
      }
      // ── 다 피했으면 가운데로 ★ ────────────────────────────────
      // 다음 장애물이 어느 칸을 막을지는 그때 가서 정해지므로(`assignCubeLane`),
      // 항상 가운데에서 시작해야 아이가 보기에 "다음 것도 준비된 채로
      // 기다린다"는 안정감이 있다(ken 요청, 9/2) — 한쪽에 치우친 채 다음
      // 장애물을 맞이하면 그다음 회피가 어느 쪽으로 갈지 예측이 안 된다.
      if (now >= returnAt) {
        if (controls.getLane() !== CENTER_LANE) controls.setLane(CENTER_LANE)
        returnAt = Infinity
      }

      const course = getCourse()
      for (const e of course.events) {
        if (e.done || armed.has(e)) continue
        const lead = LEAD[e.type]
        if (lead == null) { armed.add(e); continue }   // 자동조종이 모르는 종류(archGate 등) — 손 안 댄다
        const until = e.hitTime - now
        if (until > lead) continue                     // 아직 이르다
        if (until < -1) { armed.add(e); continue }      // 놓쳤다 — 포기하고 다음으로

        switch (e.type) {
          case 'cube':
            if (e.lane == null) continue                // 아직 안 나타나 레인이 안 정해졌다 — 다음 프레임에 다시 본다
            armed.add(e)
            if (controls.getLane() === e.lane) {
              controls.setLane(e.hintLane ?? (e.lane === 0 ? e.lane + 1 : e.lane - 1))
            }
            returnAt = e.hitTime + RETURN_TO_CENTER_SEC
            break
          case 'hurdleLow':
            armed.add(e)
            controls.jump()
            break
          case 'hurdleWide':
            armed.add(e)
            controls.duck(true)
            duckUntil = now + DUCK_HOLD_SEC
            break
          case 'poseSign':
            // ── 앞 자세가 아직 판정 전이면 기다린다 ★ ──────────────────
            // `LEAD.poseSign`(1.5초)은 고정값인데, 사인판 간격(`poseGap/speed`)은
            // 레벨·배속이 오를수록 좁아진다 — 이타카 Lv6 "매우 빠르게"에서는
            // 1.3초까지 좁아져 간격이 LEAD보다 짧아진다. 그 상태에서 다음
            // 사인판을 미리 세팅해 버리면 **앞 사인판이 자기 판정 순간(hitTime)에
            // 도달하기도 전에 자세가 이미 다음 것으로 바뀌어 있어** 무조건
            // 틀린 것으로 처리된다 — 한 사이클(3개) 중 마지막 하나만 맞고
            // 나머지 둘은 반드시 틀려 목숨이 줄줄이 샌다. 그 결과 결승 관문
            // 도달 전에 목숨이 다해 Result로 넘어갔다(ken 실제 재현, STEP 91
            // BLOCKER) — `duration`/`passThrough` 경로는 정상이었고, 진짜
            // 원인은 자동재생의 이 레이스였다.
            //
            // 앞 자세가 판정되기 전까진 다음 사인판을 건드리지 않고 매 프레임
            // 다시 본다 — 판정은 `activePose.done`이 서는 순간(대개 앞
            // 사인판의 hitTime 부근) 풀리므로, 특정 레벨·배속에 숫자를
            // 맞추지 않아도 어떤 속도에서도 안전하다.
            if (activePose) continue
            armed.add(e)
            controls.setPose(e.pose, e.mirror)
            activePose = e
            break
        }
      }
    },
  }
}
