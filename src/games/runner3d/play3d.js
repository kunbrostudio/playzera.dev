// 3D 러너의 플레이 화면 — **셸을 쓴다.**
//
// ── 무엇을 새로 만들지 않았나 ★ ─────────────────────────────
//
//   준비 화면    `core/readyScreen.js`
//   안내·결과    `core/gameShell.js`
//   기록 저장    `gameShell`의 `makeRecorder` — 게임팩이 직접 `saveResult`를
//                부르지 않는다. 붙이는 걸 잊으면 그 게임의 운동 데이터가
//                통째로 사라진다(`CLAUDE.md` 규칙, 실제로 겪었다)
//   코스·판정    `runner3d/course3d.js` · `judge.js`
//   동작 감지    `core/pose/detectors/moves.js`
//
// 여기서 하는 일은 **잇는 것**뿐이다.

import { onLeave, navigate } from '../../core/router.js'
import { showReadyScreen } from '../../core/readyScreen.js'
import { showGameOver, showEnding, makeRecorder } from '../../core/gameShell.js'
import { poseEngineCore } from '../../core/pose/poseEngine.js'
import { MoveDetector, MOVE } from '../../core/pose/detectors/moves.js'
import { icon } from '../../core/icons.js'
import { burstConfetti } from '../../core/confetti.js'
import { hasReward, mountReward } from '../../progress/rewardView.js'
import { CONFIG } from '../runner/config.js'
// 자세 채점은 **2D 러너와 같은 것**을 쓴다. 두 벌이 되면 반드시 어긋나고,
// 아이는 같은 동작을 게임마다 다르게 판정받는다.
// `jointScores`는 총점 옆에 `mirrored`(어느 쪽으로 맞았나)도 준다 —
// 런지·옆구리늘리기처럼 좌우가 있는 자세에서 캐릭터가 아이가 실제로
// 하는 쪽을 그대로 보여주는 데 쓴다(아래 카메라 판정, `character.js`의 `setPose`).
import { matchPose, jointScores } from '../runner/input/poseMatcher.js'
import { hudMarkup, ensureHudStyle, updateHud } from '../runner/ui/hud.js'
// 방향 힌트·카운트다운·배너 그림은 러너들이 같이 쓴다(`_shared/`).
import {
  CUE, CHEER, cuesMarkup, ensureCuesStyle, showHint, runCountdown, showCue,
  levelCompleteAsset, hintFor, showJudge,
} from '../runner/ui/cues.js'
import { touchPadMarkup, ensureTouchPadStyle, bindTouchPad, POSE_BUTTONS } from '../runner/ui/touchPad.js'
import { sysBarMarkup, ensureSysBarStyle, bindSysBar } from '../runner/ui/systemBar.js'
// 소리는 **2D 러너와 같은 모듈**을 쓴다. 경로만 manifest에서 온다.
import {
  initAudio, unlockAudio, playSfx, startBgm, stopBgm,
  toggleBgmMute, toggleSfxMute, playMissBuzz, playGameOverJingle,
} from '../runner/audio.js'
import { ACTION } from './judge.js'
// 자동재생 — 카메라도 손도 없이 코스를 미리 보고 대신 진행한다(ken 요청 9/2).
// 러너를 모르는 순수 로직이라 여기서는 캐릭터를 감싸 넘기기만 한다.
import { createAutopilot } from '../runner/game/autopilot.js'
// 속도 설정 — 타이틀 화면에서 고른 배율을 씬을 만들 때 한 번 읽는다(ken 요청, 9/3).
import { runnerSpeedMultiplier } from '../../core/runnerSpeed.js'
import { showTitle3d, showTutorial3d } from './screens.js'
// 스토리 대화는 **이 게임(쥬라기 대탐험)만** 쓴다. `manifest.story`가 없으면
// 아래에서 전부 건너뛴다 — 엔진은 여전히 스토리가 있는지 모른다.
import { showStoryScene, showRestBeat } from './storyDialogue.js'
import { markPlayed } from '../../core/recent.js'

const MAX_LEVELS = CONFIG.levels.length

/**
 * **이 게임의 처음**(타이틀)으로 돌아간다.
 *
 * 라우트가 그대로라 `navigate`로는 화면이 안 바뀐다 — 해시가 같으면 라우터가
 * 아무것도 안 한다. 다시 불러오면 `play3d`가 처음부터 돌아 타이틀이 뜬다.
 * 결과 화면의 "한 번 더"(`onAgain`)가 이미 같은 길을 쓴다.
 */
const restartGame = () => location.reload()

/**
 * 결승 포털을 **지나는 데** 주는 시간.
 *
 * 판정은 문 앞에서 걸린다. 여기서 바로 끝내면 화면이 문 앞에서 툭 끊겨,
 * 통과한 그림이 아니라 문에 막힌 그림이 된다. 900ms면 속도 0.9에서 문이
 * 카메라 뒤로 넘어가고 뚫어 놓은 통로 안이 한 번 보인다.
 */
const PASS_MS = 900

// ── 자세 키는 `e.code`로 읽는다 ★ ───────────────────────────
// 한글 입력기가 켜져 있으면 A·S·D를 눌러도 `e.key`가 'ㅁ'·'ㄴ'·'ㅇ'로 온다.
// 그래서 **자세 장애물에서만 키가 안 먹었다** — 방향키는 IME를 안 타서
// 멀쩡했고, 그게 원인을 찾기 어렵게 만들었다.
// `e.code`는 입력기·자판 배열과 무관하게 물리적 키 위치를 그대로 준다.
const POSE_KEY = { KeyA: 'lunge', KeyS: 'forwardbend', KeyD: 'armsopen' }

/**
 * 튜토리얼이 "지금 이 동작을 했다"를 어디서 듣나.
 *
 * 판정과 **같은 감지기·같은 채점**을 쓴다. 두 벌이 되면 튜토리얼은 통과했는데
 * 판에서는 안 세어지는 일이 생기고, 아이 눈에는 게임이 고장 난 것으로 보인다.
 *
 * @param {boolean} motion 카메라를 쓰나
 * @returns {(onAction: (kind: string) => void) => Function} 구독 함수
 */
function tutorialInput(motion) {
  return onAction => {
    if (!motion) {
      // 키보드·화면 버튼도 튜토리얼을 통과시킨다. 카메라를 못 쓰는 아이가
      // 여기서 막히면 게임 자체를 못 한다.
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'jump', ArrowDown: 'duck' }
      const h = e => {
        if (map[e.code]) onAction(map[e.code])
        else if (POSE_KEY[e.code]) onAction('pose')
      }
      addEventListener('keydown', h)
      return () => removeEventListener('keydown', h)
    }
    const det = new MoveDetector()
    return poseEngineCore.onLandmarks(lms => {
      const t = performance.now() / 1000
      for (const m of det.update(lms, t)) {
        if (m === MOVE.JUMP) onAction('jump')
        else if (m === MOVE.SQUAT) onAction('duck')
        else if (m === MOVE.LEFT) onAction('left')
        else if (m === MOVE.RIGHT) onAction('right')
      }
      // 자세는 **아무거나 하나** 잡으면 통과다. 여기서 셋을 다 시키면
      // 튜토리얼이 판보다 길어진다.
      for (const p of POSE_BUTTONS) {
        if (matchPose(lms, p.pose) >= CONFIG.pose.matchThreshold) { onAction('pose'); break }
      }
    })
  }
}

/**
 * 세로로 든 화면은 **가로로 돌려 달라고 한다.**
 *
 * 세로에서는 카메라 화각을 아무리 넓혀도 트랙 15유닛이 안 들어간다(`docs/10`).
 * 트랙을 좁혀 맞추는 안도 있지만 그러면 레인 간격이 좁아져 **몸을 크게 움직일
 * 이유가 없어진다** — 운동 게임에서는 지면 안 되는 싸움이다.
 */
function rotateHint() {
  const el = document.createElement('div')
  el.id = 'r3-rotate'
  el.innerHTML = `
    <style>
      #r3-rotate {
        position: fixed; inset: 0; z-index: 90; display: none;
        flex-direction: column; align-items: center; justify-content: center; gap: 18px;
        background: #150a2e; color: #fff; font-family: var(--font-main, 'Jua', sans-serif);
        text-align: center; padding: 24px;
      }
      /* 세로 **그리고** 좁을 때만. 세로로 긴 데스크톱 창에서 뜨면 방해다. */
      @media (orientation: portrait) and (max-width: 900px) { #r3-rotate { display: flex; } }
      #r3-rotate .ico { font-size: 3rem; animation: r3turn 1.6s ease-in-out infinite; }
      @keyframes r3turn { 0%,60%,100% { transform: rotate(0) } 80% { transform: rotate(-90deg) } }
      #r3-rotate .t { font-size: clamp(1.1rem, 4vw, 1.5rem); font-weight: 900; }
      #r3-rotate .s { font-size: 0.9rem; color: #a78bda; }
    </style>
    <div class="ico">${icon('phone', 2.4)}</div>
    <div class="t">화면을 가로로 돌려 주세요</div>
    <div class="s">넓게 봐야 좌우로 피할 자리가 보여요</div>`
  return el
}

/**
 * 3D 러너 화면을 만든다 — **게임팩이 자기 manifest를 넘긴다.** ★
 *
 * ── 왜 엔진이 게임 이름을 모르나 ────────────────────────────
 *
 * 전에는 `GAME_ID = 'jurassic-run-3d'`가 이 파일에 박혀 있었다. 3D 게임이
 * 하나뿐일 때는 티가 안 났지만, **러너를 전부 3D로 옮기기로 한 이상**
 * 그대로 두면 두 번째 3D 게임의 운동 데이터가 쥬라기 기록에 합쳐진다.
 * 섞인 것은 되돌릴 수 없다(`CLAUDE.md`).
 *
 * 2D 엔진의 `makeRunnerPlay(theme)`와 같은 모양이다 — 엔진은 규칙만 알고
 * 이름·그림은 게임팩이 갖는다.
 */
export function makeRunner3dPlay(manifest, engineOpts = {}) {
  return async function play3d(app, { backTo = '/' } = {}) {
  // ── 레벨 수는 게임팩이 정할 수 있다 ★ ──────────────────────────
  // 쥬라기는 `CONFIG.levels` 다섯 판을 다 쓴다(기본). 게임팩이 `manifest.levels`를
  // 주면 그 수가 정본이다 — 오디세이 런은 6판이고, 자기 씬(`odyssey-run/scene.js`)이
  // 6판짜리 코스 표를 `buildCourse3d`에 주입한다(엔진의 `CONFIG.levels`와 무관).
  // `CONFIG.levels` 길이로 자르지 않는다 — 자르면 오디세이가 5판에서 멈춘다.
  const LEVELS = manifest.levels ?? MAX_LEVELS
  // ── 타이틀 ──
  // 기존 러너 셋과 같은 자리다 — "러너는 자체 타이틀 화면이 인트로 역할을
  // 한다"(`registry.js`). 라우트를 하나 더 두면 아이가 거치는 단계가 는다.
  app.innerHTML = ''

  // ── 정리는 **맨 앞에** 건다 ★★ ──────────────────────────────
  //
  // `onLeave`는 라우터가 하나만 들고 있고, 화면 중간에서 나가는 길이 여럿이다.
  // 전에는 정리 등록이 파일 아래쪽에 있어서, **준비 화면에서 뒤로 나가면
  // 등록되기 전에 떠났고 BGM이 허브까지 따라갔다.**
  //
  // 목록에 쌓고 하나가 훑는다. 자원을 잡는 자리마다 바로 넣으면 "이 길로
  // 나가면 안 꺼진다"는 구멍이 안 생긴다.
  const cleanups = []
  onLeave(() => { for (const f of cleanups.splice(0)) { try { f() } catch { /* 계속 */ } } })

  // ── 소리 ──
  // 브라우저 자동재생 정책상 무음 자동재생은 안 된다. **첫 상호작용**에서
  // 잠금을 풀고 BGM을 켠다 — 타이틀의 START를 누르기 전이라도 어디든 한 번
  // 누르면 음악이 나온다(2D 러너와 같은 방식).
  initAudio(manifest.audio ?? {})
  const unlockOnce = () => {
    unlockAudio()
    startBgm()
    removeEventListener('pointerdown', unlockOnce)
    removeEventListener('keydown', unlockOnce)
  }
  addEventListener('pointerdown', unlockOnce)
  addEventListener('keydown', unlockOnce)
  cleanups.push(() => {
    stopBgm()
    removeEventListener('pointerdown', unlockOnce)
    removeEventListener('keydown', unlockOnce)
  })

  // ── 앞 화면 셋: 타이틀 → 카메라 준비 → 튜토리얼 ★★ ──────────
  //
  // **뒤로 가는 길이 한 단계씩이다.** 각 화면의 "뒤로"는 방금 온 화면으로
  // 돌아간다 — 허브로 보내면 한 번 잘못 눌렀을 때 게임 밖으로 튕겨 나간다.
  //
  //   튜토리얼 ─뒤로→ 카메라 준비 ─뒤로→ 타이틀 ─Home→ 허브
  //
  // 그래서 고리가 둘이다. 안쪽이 준비↔튜토리얼, 바깥이 타이틀이다.
  // 하나로 두면 튜토리얼의 "뒤로"가 타이틀까지 튕겨 나간다.
  //
  // ── 튜토리얼이 3D 씬보다 **먼저**다 ★ ────────────────────────
  //
  // 전에는 씬을 다 만든 뒤에 띄웠다. 그러면 뒤로 갈 수가 없다 — 준비 화면으로
  // 돌아가려면 이미 만든 씬을 도로 부숴야 한다. 튜토리얼에 카메라가 필요한데
  // 그건 준비 화면이 잡아 둔 참조로 충분하다(`ready`가 아직 안 놓았다).
  let ready = null
  let motion = false
  // 카메라도 손도 없이 자동조종이 대신 진행하는 판인지(`runner/game/autopilot.js`,
  // ken 요청 9/2). 카메라 준비 화면에서 고른다 — "카메라가 없을 때"의
  // 대체가 아니라 항상 나란히 뜨는 선택지다(`readyScreen.js`의 `allowAuto`).
  let auto = false
  title: for (;;) {
    // **결과를 받는다.** 콜백으로 빼 뒀더니 허브를 눌러도 약속이 안 풀려
    // 여기서 영원히 멈췄다 — 화면은 비고 그 아래 직전 게임의 배경이 드러났다.
    if (await showTitle3d(app, manifest) === 'hub') { navigate(backTo); return }
    playSfx('button_press')
    markPlayed(manifest.id)

    ready_loop: for (;;) {
      // 칸 수 선택은 안 붙인다. 이 게임은 3칸 고정이다 — 코스(`course.js`)가
      // 3칸을 전제로 짜여 있고, 그걸 바꾸면 밸런스가 다른 게임이 된다.
      // 준비 화면에 **이 게임의 세계**를 깐다. 기본 보라색은 어느 게임에도 안
      // 어울리지 않지만 어느 게임처럼 보이지도 않는다 — 아이는 방금 고른
      // 게임에서 넘어오는데 거기서 세계가 한 번 끊긴다.
      ready = await showReadyScreen(app, {
        title: '카메라 준비', showZones: true,
        backdrop: manifest.titleBg ?? manifest.hero,
        allowAuto: true,
      })
      if (ready.mode === 'back') { ready.release(); continue title }
      motion = ready.mode === 'motion'
      auto = ready.mode === 'auto'

      // 스토리 인트로에서 "뒤로"를 누르면 튜토리얼 **둘째 장**부터 다시
      // 보여준다(`tutStart`) — 한 번에 두 단계를 건너뛰지 않게(아래).
      let tutStart = 1
      for (;;) {
        // ── 튜토리얼 ──
        // **매 판 띄운다.** `hasSeenTutorial`로 첫 판에만 띄웠더니 한 번 보고
        // 나면 다시는 안 떴다. 2.5D 러너 셋은 매 판 띄운다 — 넘어가는 데 1초도
        // 안 걸리고(건너뛰기), 몸으로 하는 게임에서는 **판 시작 전에 한 번
        // 움직여 보는 것 자체가 준비운동**이다.
        //
        // ── 자동재생은 건너뛴다 ★ ──────────────────────────────
        // 튜토리얼은 "아이가 세 동작을 직접 해보는" 화면이다. 자동재생은
        // 아무도 동작을 안 하니 보여줄 게 없다 — `tutorialInput(motion)`도
        // 구독할 카메라·키보드가 없어서 그냥 영원히 안 끝난다.
        const way = auto ? 'done' : await showTutorial3d(app, manifest, {
          keyboard: !motion,
          subscribe: tutorialInput(motion),
          startPage: tutStart,
        })
        if (way === 'hub') { ready.release(); navigate(backTo); return }
        if (way === 'title') { ready.release(); continue title }
        if (way === 'back') { ready.release(); continue ready_loop }   // 카메라 준비로

        // way === 'done'
        //
        // ── 스토리: 인트로 ★ ──────────────────────────────────
        // 튜토리얼 다음, 판이 시작하기 전이다. **아직 `record`가 없다** —
        // 여기서 "뒤로"를 눌러도 저장할 운동이 없으니 튜토리얼로 돌아가면
        // 그만이고(`quit()`을 안 거친다), 확정된 나가기(Home)도 없어서
        // 인트로에는 홈 대신 **뒤로** 버튼을 쓴다(`backButton`, ken 요청, 9/2).
        //
        // 인트로가 여러 장면(평온 → 흔들림 → 폭발 → 다짐)으로 늘어나서
        // (9/2) 장면 사이도 한 단계씩 뒤로 가게 만들었다 — 첫 장면에서
        // "뒤로"는 튜토리얼로, 그 뒤 장면에서는 **바로 앞 장면**으로.
        //
        // ── 스킵 ★ ──────────────────────────────────────────────
        // 판을 다시 시작할 때마다(`onAgain`이 `location.reload()`라 인트로도
        // 매번 새로 뜬다) 같은 이야기를 또 보고 싶지 않을 수 있다(ken 요청,
        // 9/2). 처음엔 스킵하면 **마지막 장면의 마지막 줄**(소년의 출발
        // 대사 — 시작 버튼이 있는 화면)로 건너뛰었는데, 아이패드 실사용
        // 테스트에서 사용자가 스킵을 누르면 그냥 곧장 게임이 시작되길
        // 기대한다는 게 확인됐다(ken 요청, 9/4) — 마지막 장면조차 다시
        // 보여주지 않고 **곧장 게임을 시작한다.** `sceneIdx`를 장면
        // 배열 길이로 밀어 두면 while 조건이 그대로 거짓이 되어 루프를
        // 빠져나가고, 그 아래 title 블록을 마저 벗어나는 줄로 이어져
        // 'done'으로 인트로를 다 본 것과 같은 길을 탄다 — 게임 시작
        // 신호음(stinger)은 마지막 장면 자체를 건너뛰므로 이번엔 안
        // 울린다(스킵이니 자연스럽다).
        if (manifest.story?.intro) {
          const introScenes = manifest.story.intro.scenes ?? []
          let sceneIdx = 0
          let introBackToTutorial = false
          let jumpToLastLine = false
          while (sceneIdx < introScenes.length) {
            const isLast = sceneIdx === introScenes.length - 1
            // Skip은 **모든 장면에 항상** 켠다(ken 요청 — 절대 누락 금지).
            // 마지막 장면도 예외 없이 보이되, "다음" 자리는 "시작"으로
            // 바뀐다(`startAction`, ken 요청, 9/2) — 자동 넘김은 그대로다.
            const introResult = await showStoryScene(
              app, introScenes[sceneIdx], manifest.story.cast, {
                backButton: true, skippable: true, startAction: isLast,
                startLine: jumpToLastLine ? 'last' : undefined,
                canGoBack: sceneIdx > 0,
              },
            )
            jumpToLastLine = false
            if (introResult === 'back') {
              if (sceneIdx === 0) { introBackToTutorial = true; break }
              sceneIdx--
              continue
            }
            // 대사창 안 "이전"을 장면 첫 줄에서 눌렀다 — 앞 장면의
            // **마지막 줄**부터 이어받는다(줄이 하나로 이어지는 것처럼).
            // 위 `backButton`(왼쪽 위 "뒤로")과는 다른 버튼·다른 결과다 —
            // 그건 장면째 처음으로 되돌아가고, 이건 줄 단위로 한 걸음만 간다.
            if (introResult === 'prevScene') {
              sceneIdx--
              jumpToLastLine = true
              continue
            }
            if (introResult === 'skip') {
              sceneIdx = introScenes.length   // 루프 조건을 거짓으로 만들어 곧장 게임 시작
              continue
            }
            // 나가기(X) → 확인창의 "게임 처음으로" — 튜토리얼의 같은
            // 버튼과 똑같이 이 게임의 타이틀로 보낸다.
            if (introResult === 'title') { ready.release(); continue title }
            sceneIdx++              // 'done' — 다음 장면으로
          }
          if (introBackToTutorial) { tutStart = 2; continue }   // 튜토리얼 둘째 장으로
        }
        break title
      }
    }
  }

  app.innerHTML = `
    <style>
      #r3, #r3 * { box-sizing: border-box; }
      #r3 {
        position: fixed; inset: 0; overflow: hidden; background: #7ec8f0;
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        touch-action: none; user-select: none;
      }
      #r3-cv { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
      #r3-flash {
        position: absolute; inset: 0; z-index: 4; pointer-events: none;
        background: radial-gradient(120% 90% at 50% 60%, transparent 40%, rgba(255,60,60,0.55));
        opacity: 0; transition: opacity 0.25s;
      }
      #r3-flash.on { opacity: 1; transition: opacity 0.05s; }
    </style>

    <div id="r3">
      <canvas id="r3-cv"></canvas>
      <div id="r3-flash"></div>
      ${cuesMarkup()}
      ${hudMarkup({ auto })}
      ${auto ? '' : touchPadMarkup()}
      ${sysBarMarkup({ home: false, exit: true })}
    </div>`

  const $ = s => app.querySelector(s)
  // HUD의 모양은 마크업과 한 몸이다 — 2D의 `style.css`를 안 부르므로 여기서 심는다
  ensureHudStyle()
  ensureCuesStyle()
  ensureTouchPadStyle()
  ensureSysBarStyle()
  app.appendChild(rotateHint())

  // three는 **여기서만** 부른다 — 허브 번들에 들어가면 안 된다.
  // 게임팩이 자기 씬을 주입할 수 있다(`engineOpts.createScene`) — 오디세이
  // 런처럼 세계가 다른 게임은 쥬라기 전용 `scene.js` 대신 자기 씬을 넘긴다.
  // 계약(course·run·headScreen·update·dispose)은 같아야 한다.
  const { createScene } = engineOpts.createScene
    ? { createScene: engineOpts.createScene }
    : await import('./scene.js')
  const view = createScene($('#r3-cv'), { speedMult: runnerSpeedMultiplier() })
  // 하트를 몇 개 그릴지. **판이 시작할 때의 목숨**이 곧 최대치다 —
  // 숫자를 여기 또 적으면 `judge.js`의 기본값과 어긋난다.
  const LIVES = view.run.lives

  const fit = () => view.resize(window.innerWidth, window.innerHeight)
  fit()
  addEventListener('resize', fit)

  let level = 0
  let activeMs = 0
  let over = false
  // 자동재생은 몸을 안 움직였으니 `motion=false`와 똑같이 EXP·배지 없이
  // 기기에는 안 남긴다 — 다만 서버에는 "그냥 재생만 했다"가 구분되게
  // `input_mode: 'auto'`로 남긴다(`gameShell.js`).
  const record = makeRecorder({ gameId: manifest.id, motion, inputMode: auto ? 'auto' : undefined })

  // ── HUD ──
  // HUD는 **2D 러너와 같은 코드**가 그린다(`runner/ui/hud.js`).
  // 여기서 하는 것은 이 게임의 값을 그 모양에 맞춰 넘기는 것뿐이다.
  //
  // `stars` 칸에는 점수를 넣는다. 2D는 주워 모은 별이고 3D는 점수인데,
  // **그 판단은 게임이 한다** — HUD가 알면 그 모듈이 게임을 알게 된다.
  const hud = () => {
    const r = view.run
    updateHud(app, {
      level: level + 1,
      stars: r.score,
      lives: r.lives, maxLives: LIVES,
      jumps: r.exercise.jumps,
      squats: r.exercise.squats,
      sideSteps: r.exercise.side_steps,
      auto,
    })
  }

  // 글자 배너(`#r3-banner`)는 걷어냈다. 카운트다운과 레벨 완료가 **그림**으로
  // 바뀌면서 부르는 곳이 없어졌다 — 남겨 두면 다음에 읽는 사람이 "이건 언제
  // 뜨나" 하고 찾는다.

  // ── 방향 힌트 ★ ──
  // **무엇을 시키는 이벤트인가**는 `judge.js`의 `ACTION`이 안다. 여기서 종류를
  // 다시 나열하면 판정과 힌트가 따로 놀고, 그러면 아이는 화살표를 보고 한 일로
  // 맞았는데 판정은 틀렸다고 하는 경우를 만난다.
  const root = $('#r3')
  function syncHint() {
    const e = view.upcoming
    const action = e ? ACTION[e.type] : null
    if (!action) { showHint(root, null); return }

    // 큐브는 **아직 그 칸에 서 있을 때만** 띄운다. 이미 비켜 있는데 화살표가
    // 남아 있으면 "엉뚱한 방향으로 가라"는 힌트가 된다.
    if (action === 'side') {
      const me = c()?.lane
      if (e.lane == null || me == null || me !== e.lane) { showHint(root, null); return }
      // 어느 쪽으로 피할지는 **스폰 때 이미 정해져 있다**(`assignCubeLane`).
      // 여기서 계산하면 매번 같은 쪽이 나와 "오른쪽만 하는 게임"이 된다.
      showHint(root, hintFor('side', e.hintLane > e.lane ? 1 : -1))
      return
    }
    showHint(root, hintFor(action))
  }

  const flash = $('#r3-flash')
  view.onResult((r, e) => {
    // ── 결승 포털은 판정이 아니다 ★ ──────────────────────────
    // 맞고 틀리고가 없는 물건이라(`judge.js`) Great!을 띄우면 마지막 장애물을
    // 하나 더 통과한 것처럼 보인다. 여기서는 **끝났다**를 말해야 한다.
    if (e?.type === 'archGate') { passThrough(); return }
    const hit = r === 'hit'
    if (hit) {
      flash.classList.add('on')
      setTimeout(() => flash.classList.remove('on'), 160)
      playMissBuzz()
    } else {
      playSfx('dodge', 0.7)
    }
    // ── 장애물마다 **즉시** 답을 준다 ★ ──────────────────────
    // 전에는 빨간 섬광과 하트 하나가 전부였다. 4~8세는 "무엇 때문에 줄었나"를
    // 스스로 못 잇는다 — 방금 그 장애물을 지나온 **자기 머리 위**에 글자가
    // 떠야 원인과 결과가 붙는다. 그래서 화면 한가운데가 아니라 캐릭터 위다.
    showJudge(root, hit ? 'miss' : 'great', view.headScreen())
    hud()
    if (view.run.over && !over) finish(false)
  })
  hud()

  // ── 입력 ──
  const c = () => view.character
  const act = {
    left:  () => { c()?.moveLane(-1); view.run.record('side') },
    right: () => { c()?.moveLane(1);  view.run.record('side') },
    jump:  () => { c()?.jump();       view.run.record('jump') },
    duck:  () => { c()?.duck(true);   view.run.record('duck') },
  }

  // ── 자동재생 ★ ────────────────────────────────────────────
  // `act.*`가 아니라 캐릭터를 **직접** 움직인다 — `act.*`는 운동량을 세는
  // 자리라(위 `holdPose` 주석과 같은 이유), 자동재생이 그 길로 들어가면
  // 몸을 안 움직였는데 운동 기록이 쌓인다. `getCourse`를 매번 다시 읽는
  // 이유는 `runner/game/autopilot.js`에 적었다 — 레벨이 바뀌면 코스
  // 객체 자체가 새로 만들어진다.
  const autopilot = auto ? createAutopilot(() => view.course, {
    getLane: () => c()?.lane,
    setLane: l => c()?.setLane(l),
    jump: () => c()?.jump(),
    duck: on => on ? c()?.duck(true) : c()?.duckEnd(),
    setPose: (p, m) => c()?.setPose(p, m),
  }, { lanes: 3 }) : null

  // ── 자세는 **한 곳으로 모은다** ★ ────────────────────────────
  //
  // 키보드와 카메라가 각자 `setPose`를 부르면 운동량을 세는 자리도 둘이 된다.
  // 실제로 그래서 `record('pose')`를 **아무 데서도 안 불렀다** — manifest에
  // `pose_holds`를 선언해 두고 값은 언제나 빈 배열이었다.
  //
  // 한 팻말에 한 번만 센다. 자세는 누르고 있는 동안 유지되므로, 프레임마다
  // 세면 "1초 서 있기"가 60회가 된다.
  let counted = null
  // `mirror`를 안 주면(키보드·화면 버튼) **사인판이 보여준 쪽**을 그대로 쓴다 —
  // 그 입력들은 실제 몸 방향을 모르니, 사인판과 다른 쪽을 보여줄 근거가 없다.
  // 카메라 쪽만 실제로 감지한 방향(`jointScores`의 `mirrored`)을 넘겨서 덮어쓴다.
  function holdPose(p, mirror) {
    const sign = view.askedPose
    c()?.setPose(p, mirror ?? sign?.mirror ?? false)
    if (p && sign && sign.pose === p && counted !== sign) {
      counted = sign
      // **판정과 따로 센다.** 늦어서 팻말을 놓쳤어도 자세는 잡은 것이고,
      // 그건 운동이다(`judge.js`의 `record` 주석과 같은 규율).
      view.run.record('pose', p)
    }
  }

  let unsub = null
  if (motion) {
    const det = new MoveDetector()
    unsub = poseEngineCore.onLandmarks(lms => {
      const t = performance.now() / 1000
      for (const m of det.update(lms, t)) {
        if (m === MOVE.JUMP) act.jump()
        else if (m === MOVE.SQUAT) { act.duck(); setTimeout(() => c()?.duckEnd(), 400) }
        else if (m === MOVE.LEFT) act.left()
        else if (m === MOVE.RIGHT) act.right()
      }
      // ── 자세 판정 ★ ──
      // 이게 없어서 **카메라로 놀면 자세 팻말이 무조건 벽이었다.** 감지기는
      // 점프·앉기·좌우만 보고, 자세는 아무도 안 보고 있었다 — 키보드에만
      // 붙어 있었고 그건 어른이 테스트할 때만 도는 길이다.
      //
      // 채점은 2D 러너와 **같은 것**을 쓴다(`core/pose/poseMatch.js`).
      // 두 벌이 되면 반드시 어긋나고, 아이는 게임마다 다른 판정을 만난다.
      const sign = view.askedPose
      if (sign) {
        // ── 아이가 실제로 어느 쪽으로 하고 있나 ★ ──────────────
        // 채점(`poseMatch.js`의 `matchTargets`)은 원래 좌우 어느 쪽이든
        // 통과시킨다 — 사인판이 왼쪽으로 나왔어도 아이가 오른쪽으로 했으면
        // 그것대로 맞는 것이다. 그런데 캐릭터가 계속 사인판 쪽만 보여주면
        // 아이 눈에는 "나는 반대로 했는데 캐릭터는 왜 저래"가 된다.
        // `jointScores`가 채점 도중에 이미 계산해 둔 `mirrored`를 그대로
        // 받아서 캐릭터가 아이가 실제로 하는 쪽을 보여주게 한다.
        const detail = jointScores(lms, sign.pose)
        const ok = detail.total >= CONFIG.pose.matchThreshold
        holdPose(ok ? sign.pose : null, ok ? detail.mirrored : undefined)
      } else if (c()?.posing) {
        holdPose(null)          // 팻말이 지나갔으면 자세를 푼다
      }
    })
  }
  // 준비 화면이 들고 있던 카메라 참조는 **여기서** 놓는다 (1 → 2 → 1)
  ready.release()

  // 키보드는 늘 열어 둔다 — 카메라가 안 되는 아이도 놀 수 있어야 한다.
  // 자세 키를 `e.code`로 읽는 이유는 위 `POSE_KEY` 주석에 있다.
  const onKey = e => {
    // 자동재생 중에는 입력을 안 받는다 — 여기서 끼어들면 `act.*`가 운동량을
    // 세고, "몸을 안 움직였으니 기록도 없다"는 자동재생의 약속이 깨진다.
    if (auto) return
    if (e.code === 'ArrowLeft')  { e.preventDefault(); act.left() }
    if (e.code === 'ArrowRight') { e.preventDefault(); act.right() }
    if (e.code === 'ArrowUp' || e.code === 'Space') { e.preventDefault(); act.jump() }
    if (e.code === 'ArrowDown' && !e.repeat) { e.preventDefault(); act.duck() }
    const p = POSE_KEY[e.code]
    if (p) { e.preventDefault(); holdPose(p) }
  }
  const onKeyUp = e => {
    if (auto) return
    if (e.code === 'ArrowDown') c()?.duckEnd()
    if (POSE_KEY[e.code]) holdPose(null)
  }
  addEventListener('keydown', onKey)
  addEventListener('keyup', onKeyUp)

  // ── 화면 버튼 ──
  // 태블릿에는 키보드가 없다. 몸으로 하는 것이 본체지만, 카메라를 못 쓸 때
  // **폴백이 없으면 게임이 통째로 안 돌아간다.**
  // 자세는 키보드와 **같은 길**(`holdPose`)로 들어간다 — 입구가 둘이 되면
  // 운동량을 세는 자리도 둘이 된다(위 주석 참고).
  const padAbort = new AbortController()

  // ── 상단 시스템 버튼 ──
  // 메뉴가 열려 있는 동안 **판을 멈춘다.** 안 멈추면 아이가 메뉴를 보는 사이에
  // 장애물이 지나가고, 돌아왔을 때 목숨이 줄어 있다.
  let paused = false
  const sysBar = bindSysBar($('#r3'), {
    onToggleMusic: () => { playSfx('button_press'); return toggleBgmMute() },
    onToggleSfx: () => toggleSfxMute(),
    onPause: p => { paused = p },
    // ── 나가기는 **이 게임의 처음**으로 간다 ★ ────────────────
    // 전에는 곧장 허브였다. 아이가 한 번 더 하고 싶어 나가기를 눌렀다가
    // 게임 밖으로 튕겨 나가고, 다시 들어오려면 허브에서 카드를 찾아야 했다.
    // **한 단계씩 뒤로 간다** — 완전히 나가는 길은 확인창의 "Home으로"다.
    onQuit: () => { playSfx('button_press'); quit(restartGame) },
    onHome: () => { playSfx('button_press'); quit(() => navigate(backTo)) },
  }, padAbort.signal)

  /**
   * 어디로 나가든 **저장을 먼저 한다.** 확인창을 거치는 이유가 이것이다 —
   * 그냥 나가면 그때까지의 운동이 통째로 사라진다(`CLAUDE.md`).
   */
  function quit(go) {
    if (!over && played) finish(false)
    go()
  }
  // 자동재생 화면에는 애초에 버튼을 안 그렸다(위 템플릿) — 누를 게 없는데
  // 잇기만 하면 죽은 배선이 남는다.
  if (!auto) {
    bindTouchPad($('#r3'), {
      left: act.left,
      right: act.right,
      jump: act.jump,
      duckStart: act.duck,
      duckEnd: () => c()?.duckEnd(),
      poseDown: holdPose,
      poseUp: () => holdPose(null),
    }, padAbort.signal)
  }

  let started = false
  // ── 한 번이라도 달렸나 ★ ────────────────────────────────────
  // 나가는 길마다 "지금까지의 운동을 저장"을 부르는데, **판이 시작도 안 한
  // 화면**(튜토리얼·안내)에서 나가면 0짜리 기록이 하나 남는다. 그러면 하루
  // 목표 30분 집계에 "놀았지만 아무것도 안 한 판"이 섞인다.
  let played = false
  // 화면을 떠났나. 카운트다운처럼 **기다리는 연출**이 이 값을 본다 —
  // 안 보면 나간 뒤에도 타이머가 돌아 이미 비워진 DOM을 만진다.
  // `onLeave`는 라우터가 **하나만** 들고 있으므로 아래 정리 블록에서 같이 세운다.
  let left = false

  // ── 튜토리얼 다음은 **바로 카운트다운**이다 ★ ────────────────
  //
  // 여기 안내 화면(`mountGuide` — 제목·"어떻게 하나"·"왜 좋은가")이 있었다.
  // 걷어냈다. **방금 튜토리얼에서 세 동작을 직접 해보고 온 아이에게** 같은
  // 말을 글로 한 번 더 읽히는 셈이었고, 넘기려면 버튼을 한 번 더 눌러야 했다.
  // 몸으로 하는 게임에서 화면이 하나 늘면 그만큼 안 움직이는 시간이 는다.
  //
  // 3 · 2 · 1 · START! 그림은 러너 넷이 같이 쓴다(`ui/cues.js`) —
  // 아이가 게임마다 다른 출발 신호를 배우지 않게.
  ;(async () => {
    await runCountdown(root, { onStep: playSfx, cancelled: () => left || over })
    if (left || over) return
    started = true
    played = true
  })()

  // ── 루프 ──
  let raf = null
  let last = performance.now()
  const loop = now => {
    raf = requestAnimationFrame(loop)
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    if (!started || over || paused) { view.render(); return }

    activeMs += dt * 1000
    // `view.course.speed`를 쓴다 — **배속(`core/runnerSpeed.js`)이 이미 곱해진
    // 값**이다. `CONFIG.levels[level].speed`(배속 전 원본)를 그대로 썼더니
    // 배경·프롭 스크롤은 원래 속도로 흐르는데 장애물의 실제 z 위치(`course3d.js`의
    // `zOf`, `course.speed` 사용)는 배속대로 빨리 다가와 **둘이 어긋났다** —
    // 배속을 올려도 화면이 그만큼 빨라진 것처럼 안 보인 이유가 이것이었다
    // (ken 지적, 9/3 — "장애물이 다가오는 속도가 엄청 빨랐으면 좋겠어").
    view.update(dt, view.course.speed)
    // `view.update()` 다음이다 — 큐브가 레인을 이번 프레임에 막 받았을
    // 수 있고(`assignCubeLane`), `view.now`도 이번 프레임 것으로 갱신된
    // 뒤라야 자동조종이 지금 시각을 정확히 본다.
    autopilot?.update(view.now)
    view.render()
    syncHint()

    // 레벨을 다 달렸나
    if (view.now >= view.course.duration) {
      if (level < LEVELS - 1) {
        // **방금 끝낸** 레벨을 칭찬하는 그림이다. 올리고 나서 읽으면 다음 레벨을
        // 축하하게 되니 올리기 전에 잡아 둔다 (1부터 센다).
        const cleared = level + 1
        level++
        // ── 다음 레벨은 **스토리가 끝난 뒤에** 짓는다 ★★ ──────────────
        // 전에는 여기서 바로 `view.setLevel(level)`을 불렀다. 쥬라기는
        // `setLevel`이 코스만 새로 만들어 시각 차이가 없었지만, 오디세이 런은
        // `setLevel`이 **스테이지 시각을 통째로 바꾼다**(섬 → 바다 → 이타카).
        // 그래서 레벨 완료 배너·전환 스토리가 나오기 **전에** 화면이 먼저
        // 다음 스테이지로 튀었다. 순서는 "이전 스테이지 종료 → 스토리 →
        // 다음 스테이지 화면"이 맞다(ken 지적, 9/10). `setLevel` 호출을 아래
        // `showCue().then()` 맨 끝, `started = true` 직전으로 옮겼다.
        //
        // **목숨과 점수는 이어진다.** 레벨마다 초기화하면 판이 여러 개가 되고
        // 한 판의 운동량이라는 말이 성립하지 않는다.
        //
        // ── 배너가 뜨는 동안 세계를 **멈춘다** ★ ──
        // `started = false`라 아래 루프가 `view.update`를 안 부른다. `firstDelay`
        // (2초)는 `setLevel`이 `now = 0`으로 되감으므로 스토리가 끝난 뒤부터 흐른다.
        started = false
        playSfx('level_complete')
        // ── 다음 스테이지 장애물 GLB를 **지금** 당겨 둔다 ★ ──────────
        // `view.setLevel(level)`은 전환 스토리가 끝난 뒤에 부른다 — 거기서야
        // 다음 스테이지 GLB 로드가 시작되면 첫 장애물이 도형으로 잠깐
        // 나왔다가 GLB로 바뀐다(pop-in). 스토리가 뜨는 십수 초 동안 미리
        // 받아 두면(three 내장 Cache) `setLevel`이 즉시 그린다. 스테이지가
        // 안 바뀌는 레벨엔 아무 일도 안 한다(`view.preloadStage`가 판단).
        view.preloadStage?.(level)
        showCue(root, levelCompleteAsset(cleared), 1200).then(async () => {
          if (left || over) return
          // ── 스토리: 레벨 완료 뒤 이야기 컷 ★ ──────────────────
          // 레벨 완료 배너 **다음**에 온다 — "레벨을 깼다"는 이미 배너가
          // 말했으니 겹치지 않는다. 방금 깬 레벨 번호(`cleared`, 1부터)와
          // `afterLevel`이 맞는 비트만 뜬다.
          //
          // 쥬라기는 비트가 하나다(`story.found` — 아기 공룡 발견 → 백팩에
          // 업기). 오디세이 런은 스테이지가 셋이라 스테이지 전환마다 비트가
          // 있다(`story.beats` 배열). `found`는 `beats` 한 칸으로 접어 하위
          // 호환한다 — `carry`(백팩 말풍선)는 그 비트에만 딸린다.
          const beats = manifest.story?.beats
            ?? (manifest.story?.found
              ? [{ afterLevel: manifest.story.found.afterLevel, scenes: manifest.story.found.scenes, carry: manifest.story.carryBubble }]
              : [])
          const beat = beats.find(b => b.afterLevel === cleared)
          if (beat) {
            // ── 휴식(REST) 비트 — 게임 화면 위 대사창 + N초 카운트다운 ★ ──
            // 별도 전체화면 그림이 아니라 오버레이. 세계는 이미 멈춰 있다
            // (`started = false`). Skip이면 남은 것 전부 건너뛰고 즉시 끝.
            // 스토리 컷(`beat.scenes`)과 공존 가능하지만 오디세이 afterLevel:1은
            // rest만 있다.
            if (beat.rest) {
              const restRes = await showRestBeat(root, { ...beat.rest, cast: manifest.story.cast })
              if (left || over) return
              if (restRes === 'home') { quit(() => navigate(backTo)); return }
              if (restRes === 'title') { quit(restartGame); return }
              // 'done' | 'skip' → 계속 (아래 scenes가 있으면 이어서, 없으면 다음 레벨)
            }
            const beatScenes = beat.scenes ?? []
            // 인덱스로 도는 이유는 인트로와 같다(위 참고) — "이전"이 컷을
            // 건너 앞으로 갈 수 있으려면 `for...of`로는 못 되돌아간다.
            let fIdx = 0
            let jumpToLastLine = false
            while (fIdx < beatScenes.length) {
              // ── 스킵은 **모든** 컷에 **항상** 있다(예외 없음) ★ ──────
              // ken 요청: "절대 누락 금지" — 마지막 컷도 예외 없이 보인다.
              // 스킵 → 이 비트의 남은 컷을 전부 건너뛰고 다음 레벨/
              // 스테이지로(중복 전환 없음).
              const result = await showStoryScene(root, beatScenes[fIdx], manifest.story.cast, {
                canGoBack: fIdx > 0,
                skippable: true,
                startLine: jumpToLastLine ? 'last' : undefined,
              })
              jumpToLastLine = false
              if (left || over) return
              if (result === 'home') { quit(() => navigate(backTo)); return }
              // 나가기(X) → "게임 처음으로" — 인게임 시스템 바의 같은
              // 버튼과 똑같이 `quit(restartGame)`을 쓴다(ken 요청, 9/2).
              if (result === 'title') { quit(restartGame); return }
              if (result === 'prevScene') { fIdx--; jumpToLastLine = true; continue }
              if (result === 'skip') break   // 남은 전환 컷 건너뛰기
              fIdx++
            }
            if (beat.carry) { await c()?.setCarrying(beat.carry, true); if (left || over) return }
          }
          if (left || over) return
          // 스토리가 끝났다 — 이제 다음 레벨/스테이지를 짓는다(위 주석 참고).
          view.setLevel(level)
          // 다음 스테이지에도 archGate가 있다(오디세이 Lv4·Lv6) — passThrough의
          // 재진입 가드(`passing`)를 여기서 푼다. 안 풀면 두 번째 관문이 안 걸린다.
          passing = false
          started = true
        })
        hud()
      } else {
        // ── 마지막 레벨은 반드시 passThrough()를 거친다 ★★★ ──────────
        // 예전엔 여기서 곧장 `finish(true)`를 불렀다 — `duration`(관문
        // hitTime + 0.9초, STEP 87에서 3초→0.9초로 줄임)이 `passThrough()`의
        // `PASS_MS`(900ms) `setTimeout`과 **거의 같은 실시간 간격**이 되면서,
        // 브라우저의 setTimeout 지연(백그라운드 탭·GC·이벤트 루프 혼잡)에
        // 따라 이 duration 안전망이 먼저 발동해 **관문을 실제로 지나기도
        // 전에 Result가 뜨는** 경쟁 상태가 됐다(ken QA, STEP 88 — "Ithaca
        // 마지막 레벨이 Finish Gate 전에 Result로 끝난다", BLOCKER).
        //
        // 고친 것은 duration 값이 아니라 **경로 자체**다 — `passThrough()`는
        // `passing`으로 멱등하다: archGate 판정(`onResult`)이 이미 불렀으면
        // 여기서 다시 불러도 조용히 무시되고, 혹시 그 판정이 어떤 이유로든
        // 안 불렸을 때만 이 안전망이 정식 통과 연출(폭죽 → PASS_MS →
        // finish)을 **그제야** 시작한다. `finish(true)`를 직접 부르는 경로가
        // 이제 하나도 안 남아, "통과 연출 없이 곧장 결과"가 구조적으로
        // 불가능하다.
        passThrough()
      }
    }
  }
  raf = requestAnimationFrame(loop)

  // ── 결승 포털을 **지나는 중** ★ ─────────────────────────────
  //
  // 판정이 걸리는 순간은 아이가 문 **앞**에 선 때다. 거기서 바로 끝내면
  // 화면이 문 앞에서 툭 끊긴다 — 통과한 그림이 아니라 문에 막힌 그림이다.
  //
  // 세계를 조금 더 굴려서 문이 카메라 뒤로 넘어가게 둔다. 그동안 뒷벽을
  // 뚫어 놓은 통로 안이 보이고, 그다음에 엔딩이 온다.
  let passing = false
  let stopConfetti = null
  function passThrough() {
    if (passing || over) return
    passing = true
    // ── 관문을 지난 즉시 짧게 폭죽 ★ ─────────────────────────
    // 마지막 레벨이든 스테이지 경계든 **문을 지나는 순간이 공통으로 축하할
    // 지점**이다(ken QA, STEP 87 — "통과 직후 폭죽 효과"). 짧게(1.6초) +
    // 가볍게(조각 60개) 터뜨리고 스스로 정리한다 — 다음 화면(레벨 완료
    // 배너 z-index 30+·REST·전환 스토리)이 이보다 늦게 뜨고 그 위를
    // 덮으므로 서로 안 겹친다. 이전 것이 아직 안 끝났으면(연속 관문) 먼저 멈춘다.
    stopConfetti?.()
    stopConfetti = burstConfetti(root, { pieces: 60, bursts: 2, seconds: 1.6 })
    // ── 마지막 레벨에서만 여기서 끝낸다 ★ ──────────────────────
    // 쥬라기는 archGate가 마지막 판에만 있어 늘 여기서 finish 한다. 오디세이
    // 런은 스테이지 경계(Lv2·Lv4)에도 archGate가 있는데, 거기서는 **관문을
    // 지난 뒤 레벨 완료 → 전환 스토리 → 다음 스테이지**로 가야 한다 — 그건
    // 아래 루프의 `now >= duration`이 맡는다(문 hitTime 뒤로 `PASS_MS`와
    // 같은 0.9초 여유, STEP 87 — 예전엔 3초라 "통과하고도 한참 더 달린다"로
    // 보였다). 여기서 finish 하면 스테이지1에서 게임이 끝나 버린다.
    if (level >= LEVELS - 1) {
      playSfx('mission_complete')
      // 통과 연출 중에 나가면(`left`) 끝내지 않는다 — 이미 비워진 DOM에
      // 결과 화면을 그리려 하지 않게.
      setTimeout(() => { if (!left && !over) finish(true) }, PASS_MS)
    }
    // 스테이지 경계에서는 소리를 안 낸다 — 0.9초 뒤 레벨 완료 배너가
    // `level_complete`를 낸다(겹치면 지저분하다).
  }

  // ── 끝 ──
  function finish(cleared) {
    if (over) return
    over = true
    sysBar.close()
    // **BGM은 게임 안에서만 난다**(`CLAUDE.md`). 끄는 걸 잊으면 허브까지 음악이 따라간다.
    stopBgm()
    if (!cleared) playGameOverJingle()
    else if (!passing) playSfx('mission_complete')   // 포털 없이 끝난 길
    const r = view.run
    const snapshot = {
      score: r.score,
      cleared: cleared ? LEVELS : level,
      rounds: LEVELS,
      active_sec: Math.round(activeMs / 1000),
      ...r.exercise,
      // `pose_holds`는 배열이라 기록기가 숫자만 거른다 — 개수로 넘긴다
      pose_holds: r.exercise.pose_holds.length,
    }
    const reward = record(snapshot)

    // ── 오디세이 런 전용 완주 연출(STEP 90, ken QA — "공용 Result처럼
    // 보여서 엔딩 느낌이 부족하다") ★ ──────────────────────────────
    // **끝까지 깼을 때만** + **이 게임일 때만** 켠다 — 게임 오버(중간에
    // 목숨이 다함)는 축하가 아니므로 그대로 공용 화면이고, 다른 게임
    // (쥬라기 등)은 `manifest.id`가 안 맞아 이 조건이 늘 false라 이전과
    // 완전히 같은 화면을 그대로 받는다(공용 `showGameOver` 자체는 옵션이
    // 없으면 옛 모양 그대로 — 위 정의 참고). 배경은 홈 카드에 이미 쓰는
    // 썸네일(`manifest.thumbnail`)을 그대로 재사용 — 새 그림을 안 만든다.
    const odysseyFinale = cleared && manifest.id === 'odyssey-run'
    const over_ = () => showGameOver($('#r3'), {
      title: odysseyFinale ? '오디세이 런 완주!' : (cleared ? '다 달렸어요!' : '수고했어요!'),
      line: `점수 ${r.score} · 최고 연속 ${r.bestCombo}`,
      reward: hasReward(reward) ? host => mountReward(host, reward) : null,
      onAgain: () => location.reload(),
      onQuit: () => navigate(backTo),
      ...(odysseyFinale ? {
        bg: manifest.thumbnail,
        scoreBlock: { score: r.score, streak: r.bestCombo },
        sparkle: true,
      } : {}),
    })

    // ── 엔딩은 **끝까지 깼을 때만** ★ ────────────────────────
    // 중간에 목숨이 다한 아이에게 축하 화면을 띄우면 축하가 아니라 놀림이다.
    // 기록은 어느 쪽이든 이미 남았다(`record` 위).
    //
    // 엔딩 → 결과 순서다. 문을 지난 직후가 감정이 제일 큰 순간이라 그때는
    // 아무것도 안 읽히고 그림만 보인다. 읽을 것(점수·배지)은 그다음이다.
    if (!cleared) { over_(); return }

    // ── P0 슬림 흐름: 피니시 스토리 → 결과 화면 ★ ────────────────
    // 쥬라기는 무성 엔딩(`showEnding`) → 엔딩 스토리 → `restartGame`이다.
    // 스테이지 하나짜리 슬라이스(오디세이 런 P0)는 `manifest.story.finish`로
    // 그 순번을 대신한다 — 짧은 스토리 몇 컷을 보여주고 **결과 화면으로
    // 끝낸다**(다시 하기 버튼이 있는 화면). `showEnding`/`found`는 안 탄다.
    if (manifest.story?.finish) {
      const scenes = manifest.story.finish.scenes ?? []
      ;(async () => {
        let k = 0
        let jumpToLastLine = false
        while (k < scenes.length) {
          const res = await showStoryScene($('#r3'), scenes[k], manifest.story.cast, {
            canGoBack: k > 0,
            skippable: true,   // 마지막 컷도 예외 없이(ken: 절대 누락 금지)
            startLine: jumpToLastLine ? 'last' : undefined,
          })
          jumpToLastLine = false
          if (left) return
          if (res === 'home') { navigate(backTo); return }
          if (res === 'title') { restartGame(); return }
          if (res === 'prevScene') { k = Math.max(0, k - 1); jumpToLastLine = true; continue }
          if (res === 'skip') break
          k++
        }
        over_()
      })()
      return
    }

    showEnding($('#r3'), {
      bg: manifest.endingBg ?? manifest.titleBg ?? manifest.hero,
      art: CUE.missionComplete,
      // ── 아이 **둘 다** 세운다 ★ ──
      // 지금 달리던 캐릭터 하나만 세울 수도 있다. 그런데 여기는 "네가
      // 해냈다"보다 **"우리가 다 왔다"**에 가까운 화면이고, 한쪽만 서면
      // 화면 반이 빈다. 프로필로 갈리는 건 달리는 캐릭터다(`playerSkin`).
      cast: CHEER,
    }).done.then(async () => {
      if (left) return
      // ── 스토리: 엄마에게 돌아가기 ★ ────────────────────────────
      // 무성 엔딩(`showEnding`) 다음이다. **`record`가 이미 위에서 불렸으니**
      // 여기서 Home을 눌러도 운동 기록은 이미 저장돼 있다 — `quit()`을
      // 안 거쳐도 된다.
      const endingScenes = manifest.story?.ending?.scenes ?? []
      // 인덱스로 도는 이유는 인트로와 같다(위 참고).
      let eIdx = 0
      let jumpToLastLine = false
      while (eIdx < endingScenes.length) {
        const result = await showStoryScene($('#r3'), endingScenes[eIdx], manifest.story.cast, {
          canGoBack: eIdx > 0,
          startLine: jumpToLastLine ? 'last' : undefined,
        })
        jumpToLastLine = false
        if (left) return
        if (result === 'home') { navigate(backTo); return }
        if (result === 'title') { restartGame(); return }
        if (result === 'prevScene') { eIdx--; jumpToLastLine = true; continue }
        eIdx++
      }
      // 모든 미션을 다 깼을 때는 다시하기 버튼이 있는 결과 화면(`over_`)
      // 대신 곧장 쥬라기 게임의 처음(인트로)으로 되돌린다(ken 요청, 9/2) —
      // "한 번 더"가 이미 쓰는 길과 같다.
      restartGame()
    })
  }

  // 정리는 **맨 위의 목록**에 쌓는다(`cleanups`). 라우터는 `onLeave`를 하나만
  // 들고 있어서, 여기서 다시 `onLeave`를 부르면 앞의 것이 통째로 덮인다 —
  // 실제로 그래서 준비 화면에서 나갈 때 BGM이 안 꺼졌다.
  cleanups.push(() => {
    left = true
    padAbort.abort()
    cancelAnimationFrame(raf)
    removeEventListener('resize', fit)
    removeEventListener('keydown', onKey)
    removeEventListener('keyup', onKeyUp)
    unsub?.()
    stopConfetti?.()
    if (motion) poseEngineCore.release()
    // 중간에 나가도 **움직인 만큼은 남는다**(`docs/05` 4-1).
    // 단 한 번도 안 달렸으면 안 남긴다 — 0짜리 기록은 집계를 흐린다.
    if (!over && played) finish(false)
    view.dispose()
  })
}
}
