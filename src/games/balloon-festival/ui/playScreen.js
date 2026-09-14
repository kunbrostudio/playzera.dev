// 풍선 팡팡 — 실제 플레이 화면 (1부 잡기 + 2부 터뜨리기).
//
// 카메라를 화면 전체에 채우고 그 위에 풍선(그림)·바구니·손 커서를 얹는다.
// 규칙은 전부 `game.js`(BalloonFestivalRun)가 갖고 있다 — 여기는 그리고,
// 감지된 손 좌표를 넣을 뿐이다(다른 게임들과 같은 분업, CLAUDE.md).
//
// 좌표 보정 — **여기는 작은 PIP가 아니라 화면 전체다.** `pipOverlay.js`는
// 랜드마크 좌표(카메라 원본 프레임 기준 0~1)를 보정 없이 그대로 쓰는데,
// PIP 박스가 카메라의 기본 종횡비(16:9)에 가까운 작은 창이라 오차가 크게
// 안 띄었다. 여기서는 `object-fit: cover`로 꽉 채운 화면이 대부분
// 16:9가 아니라서(더 넓거나 더 좁다) 카메라가 잘려 나간 만큼 실제 손
// 위치와 화면에 그려지는 자리가 어긋난다 — ken이 처음 테스트에서 "잘
// 안된다"고 한 원인이 이것이었다(손 커서가 실제 손과 다른 자리에
// 뜸). `mapHandPoint()`가 비디오 실제 해상도와 화면 박스 크기를 재서
// object-fit:cover가 자른 만큼을 되돌린다.
//
// 두 파트가 **한 판**이다. 1부→2부 전환은 축제 장면 스토리를 보여준 뒤
// 이어서 진행한다(스토리 화면이 `app.innerHTML`을 통째로 갈아 끼우므로,
// 돌아오면 플레이 화면을 다시 그린다 — `mountUI()`). 다 깬 뒤에만 엔딩
// 스토리를 보여준다 — 중간에 나간 판은 축하가 아니라 놀림이 된다.

import { icon } from '../../../core/icons.js'
import { navigate, onLeave } from '../../../core/router.js'
import { showGameOver, makeRecorder } from '../../../core/gameShell.js'
import { getBackTo } from '../../registry.js'
import { poseEngineCore } from '../../../core/pose/poseEngine.js'
import { trackHands, trackPlayers } from '../../arcade2d/handTracker.js'
import { createStableTimer } from '../../../core/pose/playerSlots.js'
import { makeHandSmoother } from '../../arcade2d/handSmoother.js'
import { runStory } from '../../arcade2d/storyRunner.js'
import { ensureCuesStyle, showJudge } from '../../runner/ui/cues.js'
import { ensureSysBarStyle, sysBarMarkup, bindSysBar } from '../../runner/ui/systemBar.js'
import { burstConfetti } from '../../../core/confetti.js'
import * as sound from '../../../core/sound.js'
import {
  BalloonFestivalRun, PART, PART2_BASKET_DECOR_COUNTS,
  PART1_LEVEL_CLEAR_LINES, PART2_LEVEL_CLEAR_LINES, LEVEL_REST_SECONDS,
  cheer,
} from '../game.js'
import { BALLOON_SPRITES, BALLOON_POP_SPRITES, colorFor, BASKET_IMAGE } from '../assets.js'
import { pileMetrics } from '../pile.js'
import { getPlayableMode, DEFAULT_PLAY_MODE } from '../modes.js'

// ── 플레이어 확보(Player Acquire) ★ (STEP 105) ─────────────────────
// 게임이 실제로 돌기 직전, 화면 앞에 선 사람을 **새로** 확보한다 — 메뉴를
// 손으로 누른 사람이 그대로 플레이어로 남지 않게. 이만큼 계속 보여야
// 시작한다(요청 권장 1~1.5초). 실기기 미검증.
const ACQUIRE_STABLE_MS = 1200
const SOLO_PRESENT_MS = 400   // SOLO에서 "지금 사람이 보인다"로 볼 최근성
const ACQUIRE_TEXT = {
  solo: {
    title: '화면에 서 주세요',
    sub: n => (n >= 1 ? '좋아요! 곧 시작해요' : '카메라에 몸이 보이게 서 주세요'),
  },
  duo: {
    title: '두 명이 화면에 함께 서 주세요',
    sub: n => (n >= 2 ? '좋아요! 곧 시작해요' : `지금 ${n}명 보여요 · 두 사람 모두 보이게 조금 뒤로 서 주세요`),
  },
  rejoin: {
    title: '다시 화면에 서 주세요',
    sub: n => (n >= 1 ? '좋아요! 곧 이어서 해요' : '잠깐 멈췄어요 · 한 명만 돌아와도 이어서 해요'),
  },
}

const EXIT_RESULTS = new Set(['title', 'home', 'back'])
// 화면 밖으로 심하게 잘리지 않게 Pop FX 자리를 살짝 안쪽으로 당긴다
// (요청 "viewport clamp 적용" — 풍선 자체는 가장자리에서 튕기지만,
// 1.5배 커지는 FX는 그 반경만큼 더 밖으로 나갈 수 있다).
const POP_FX_CLAMP = 0.06

/**
 * @param {HTMLElement} app
 * @param {object} manifest
 * @param {string} [modeId] Play Mode(STEP 104) — `'solo'|'duo'|'group'`,
 *   안 주면 SOLO. quota만 모드 설정(`../modes.js`)에서 가져올 뿐, 그
 *   외 gameplay(잡기·터뜨리기·타이머·Rest·대화·결과·바구니·companion·
 *   Pop FX)는 모드와 무관하게 완전히 똑같이 동작한다 — SOLO는 이
 *   인자를 안 주는 기존 호출과 결과가 같다(회귀 없음).
 */
export async function runBalloonPlay(app, manifest, modeId = DEFAULT_PLAY_MODE) {
  ensureCuesStyle()   // Great!/Miss/Catch! 판정 글자 CSS — 이미 있으면 아무것도 안 한다
  ensureSysBarStyle() // 공통 게임 UI(햄버거·나가기·확인창) CSS
  const gameId = manifest.id
  const story = manifest.story ?? {}
  const record = makeRecorder({ gameId, motion: true, minActiveSec: 5 })

  sound.load(gameId)   // 게임 전용 실제 음원이 있으면 쓰고, 없으면 합성음으로 대신한다(core/sound.js)

  // ★ (STEP 104) quota만 모드별로 갈아 끼운다 — 생성자가 이미 이
  // 옵션을 받게 돼 있어서(game.js) 여기 한 줄이면 된다. 레벨 수(3)는
  // 모드와 무관하게 항상 같아서 레벨 인덱스로 찾는 다른 값들
  // (BALLOON_R·속도·대사·companion 매핑)은 전혀 안 건드려도 된다.
  // 준비 중인 모드(GROUP)가 넘어와도 SOLO로 떨어진다 — 3명 이상 gameplay는 없다.
  const playMode = getPlayableMode(modeId)
  // ── SOLO와 DUO는 손 추적 길 자체가 다르다 ★ (STEP 105) ──────────
  // SOLO는 예전 그대로 `trackHands()`(personLock 한 사람 → 손 하나)만 탄다 —
  // 두 번째 사람이 화면에 들어와도 애초에 이 길로 안 흘러온다("1인 모드는
  // 무조건 1인"). DUO만 `trackPlayers()`(전원 후보 → 자리 2개 → 자리마다
  // 손 하나)를 쓴다. 판정 규칙은 둘이 같고, 동시에 잡을 수 있는 풍선 수만
  // 플레이어 수(`maxHeld`)로 다르다.
  const isDuo = playMode.players === 2
  const run = new BalloonFestivalRun({
    part1Quotas: playMode.part1Quotas,
    part2Quotas: playMode.part2Quotas,
    maxHeld: isDuo ? 2 : 1,
  })
  const tracker = isDuo ? trackPlayers({ maxPlayers: 2 }) : trackHands()
  const handHits = { left: 0, right: 0 }
  let activeSec = 0
  // `paused`는 화면 전환(스토리·결과) 때문에 멈춘 것, `menuPaused`는 아이가
  // 메뉴·확인창을 연 것. 둘을 한 변수로 합치면 메뉴를 닫는 순간 스토리 중에도
  // 판이 다시 돌아 버린다.
  let raf = null, lastT = null, over = false, paused = true, menuPaused = false
  const els = new Map()          // sprite.id -> <img>
  const handEls = {}             // 손 키(SOLO left/right · DUO p1/p2) -> 포인터 <div>
  let $ = () => null

  // ── Pop FX 자산 — 없을 수 있다 ★ ─────────────────────────────
  //
  // ken이 색상별 Pop 그림 7장(balloon-pop-<색>.png)을 준다고 했지만
  // 2026-09-13 기준 이 worktree에도, 맥 어디에도 실제 파일이 없다(찾아봤다,
  // `assets.js` 주석 참고). 없는 파일을 그냥 <img src>에 넣으면 깨진
  // 아이콘이 뜨거나 아무것도 안 보인다 — 그래서 "실제로 로드되는지"를
  // 먼저 확인해 두고, 안 되는 색은 같은 색 풍선 그림(BALLOON_SPRITES)을
  // 대신 키워서 보여준다(터졌다는 걸 알아야 하니 아무것도 안 보이는
  // 것보단 낫다). 전용 그림이 나중에 그 경로에 그대로 놓이면 코드를
  // 안 고쳐도 자동으로 그쪽을 쓴다.
  const popFxReady = new Set()
  function preloadPopFx() {
    for (const [color, src] of Object.entries(BALLOON_POP_SPRITES)) {
      const img = new Image()
      img.onload = () => popFxReady.add(color)
      img.src = src
    }
  }
  const popFxSrc = color => (popFxReady.has(color) ? BALLOON_POP_SPRITES[color] : BALLOON_SPRITES[color])

  // ── 마지막 레벨 완료 뒤 암전의 실제 원인과 수정 ★ ────────────────
  //
  // "Final Stage 완료 → Ending Story 전 잠깐 검은 화면"의 정체는
  // `runner3d/screens.js`의 `mount()`가 부르는 `showLoadingScreen()`
  // (`core/loadingScreen.js`)이었다 — 배경 그림이 250ms(SHOW_DELAY_MS)
  // 안에 안 뜨면 어두운 로딩 화면으로 덮는 공용 안전장치다. 엔딩 그림
  // (`story_scene_ending.png`, 다른 스토리 컷과 마찬가지로 몇백 KB~
  // 몇 MB)이 이 시점에 처음 요청되면 네트워크에 따라 250ms를 넘기기
  // 쉽다. **버그가 아니라 로딩 안전장치가 실제로 일할 만큼 이미지가
  // 안 받아져 있었던 것** — 그래서 고치는 방법도 "화면 전환 로직을
  // 바꾸는 것"이 아니라 "그 순간 오기 전에 미리 받아 두는 것"이다.
  // 1부를 플레이하는 동안(수십 초는 걸린다) 여유 있게 백그라운드로
  // 받아 두면, 실제로 필요한 순간엔 브라우저 캐시에서 즉시 나온다.
  function preloadEndingImages() {
    for (const scene of story.ending?.scenes ?? []) {
      if (!scene.bg) continue
      const img = new Image()
      img.src = scene.bg
    }
  }

  // ── 나가는 길은 **결과로 돌려준다** ★ ─────────────────────────
  //
  // 예전에는 이 함수 안에서 곧장 `navigate(backTo)`를 했다. `backTo`는
  // `getBackTo()`인데, 이 게임은 registry에 `intro`가 없어서(타이틀·인트로가
  // `/intro` 라우트가 아니라 `play.js` 안에 있다) 항상 `'/'`(허브)로
  // 떨어졌다 — ken이 본 "다시하기를 눌렀는데 허브로 간다"가 이것이다.
  // 결과 화면의 "다시 하기"도 `runBalloonPlay`를 자기 자신 안에서 다시
  // 부르는 재진입이라 타이틀·인트로를 건너뛰었다.
  //
  // 화면을 떠나는 길이 둘이면 결과도 둘이어야 한다(CLAUDE.md) — 여기서는
  // 아무 데도 안 가고 `'again'`(게임 처음으로) · `'home'`(허브)만 돌려주고,
  // 어디로 보낼지는 흐름을 쥔 `play.js`가 정한다. 그래야 "다시 하기"가
  // 진짜 게임 인트로(타이틀)로 돌아간다.
  let settle = () => {}
  const result = new Promise(res => { settle = res })
  const leaveWith = where => {
    if (!over) { over = true; record(summary()) }
    cleanup()
    settle(where)
  }

  function summary() {
    return run.summary({
      left_hand_hits: handHits.left,
      right_hand_hits: handHits.right,
      active_sec: Math.round(activeSec),
    })
  }

  function mountUI() {
    app.innerHTML = `
      <style>
        #bf, #bf * { box-sizing: border-box; }
        #bf { position: fixed; inset: 0; overflow: hidden; background: #050212;
          font-family: var(--font-main, 'Jua', sans-serif); color: #fff; touch-action: none; }
        #bf video { position: absolute; inset: 0; width: 100%; height: 100%;
          object-fit: cover; transform: scaleX(-1); }
        #bf-veil { position: absolute; inset: 0; z-index: 1; pointer-events: none;
          background: rgba(6,3,18,0.32); }

        #bf-sprites { position: absolute; inset: 0; z-index: 2; }
        .bf-balloon { position: absolute; transform: translate(-50%, -50%); pointer-events: none;
          filter: drop-shadow(0 6px 14px rgba(0,0,0,0.35)); }

        /* Pop FX — 풍선이 터진 자리에 잠깐 크게 반짝이는 색 맞는 그림.
           손 충돌·점수·개수 어느 것에도 안 걸리는 순수 연출용 <img>다
           (게임 로직은 이 DOM의 존재 자체를 모른다). 800ms: 살짝
           작은 채로 나타났다가(0~100ms) 잠깐 그대로 보이고(~500ms)
           커지며 사라진다(500~800ms) — "팍 나타남 → 즉시 사라짐"이
           되지 않게 가운데를 충분히 늘렸다. */
        #bf-popfx { position: absolute; inset: 0; z-index: 3; pointer-events: none; }
        .bf-pop-fx { position: absolute; transform: translate(-50%, -50%); pointer-events: none;
          filter: drop-shadow(0 6px 14px rgba(0,0,0,0.35));
          animation: bf-pop-fx 800ms ease-out forwards; }
        @keyframes bf-pop-fx {
          0%   { opacity: 0;   scale: 0.8; }
          12.5%{ opacity: 1;   scale: 1.0; }
          62.5%{ opacity: 1;   scale: 1.0; }
          100% { opacity: 0;   scale: 1.1; }
        }

        /* 트래커 — 손을 따라다니는 동그란 포인터. 이 게임에는 **하나만**
           뜬다(handTracker.js 참고). 그래서 왼손·오른손을 색으로 구분하던
           걸 없앴다 — 하나뿐이면 어느 손인지 알려 줄 이유가 없고, 색이
           바뀌면 오히려 "다른 게 떴나?"로 읽힌다. */
        .bf-hand { position: absolute; z-index: 3; width: 56px; height: 56px; border-radius: 50%;
          transform: translate(-50%, -50%); pointer-events: none;
          border: 4px solid var(--pz-gold, #ffd23e); background: rgba(255,210,62,0.18);
          box-shadow: 0 0 0 2px rgba(0,0,0,0.25), 0 0 14px rgba(255,210,62,0.5); }

        /* 바구니 — ken이 보낸 참고 그림(바구니 뒤로 큰 풍선이 한 줄로
           겹쳐 삐져나온 그림)을 그대로 목표로 삼는다.

           바구니는 이제 1부·2부 내내 화면에 있다(2부는 순수 장식용
           풍선을 담아 둔다 — 재구성 STEP 95 참고). 풍선 하나가 바구니
           높이의 62%, 겹침 정도는 개수를 보고 JS가 조인다(아래 fitPile) —
           한 줄 고정("위로 쌓이게 하지마")이라 개수가 늘면 줄이 옆으로
           길어질 수밖에 없어서다.

           1부에서 새로 잡은(collect) 풍선은 prepend()로 맨 앞에 넣는다
           (ken: "뒤로 추가해주면 돼") — DOM 앞쪽이 먼저 칠해져서 뒤에
           깔린다. 2부의 장식 풍선은 손으로 안 건드리는 정적인 채움이라
           순서가 상관없다(appendChild). */
        #bf-basket-wrap { position: absolute; left: 50%; bottom: clamp(6px, 1.5vh, 18px);
          transform: translateX(-50%); z-index: 4; width: clamp(220px, 34vw, 440px); }
        #bf-basket { position: relative; z-index: 2; display: block; width: 100%; height: auto;
          filter: drop-shadow(0 8px 16px rgba(0,0,0,0.45)); }
        #bf-basket-pile { position: absolute; z-index: 1; left: 0; right: 0; bottom: 26%;
          display: flex; flex-wrap: nowrap; align-items: flex-end; justify-content: center;
          pointer-events: none; }
        .bf-pile-item { width: var(--bf-item, 34%); height: auto; flex: none;
          filter: drop-shadow(0 3px 5px rgba(0,0,0,0.32)); }
        .bf-pile-item:not(:first-child) { margin-left: calc(-1 * var(--bf-overlap, 30%)); }

        /* HUD가 레벨 배너·진단 표시보다 위여야 한다 — 시스템바의 종료
           확인창이 이 안에 들어 있어서, 아래로 깔리면 확인창 위로 배너가
           겹쳐 보인다. ★ (TEST/BETA 배포 점검) 카메라 로딩 오버레이(아래
           bf-loading, z-index 10)보다도 위여야 한다 — 안 그러면 카메라
           권한이 거부됐을 때 "카메라를 못 열었어요" 안내가 화면 전체를
           덮으면서 오른쪽 위 나가기 버튼까지 가려 사용자가 이 화면에
           완전히 갇힌다(실제로 그랬다 — 클릭 좌표까지는 버튼이 있어도
           위에 덮인 로딩 오버레이가 클릭을 먼저 가로챈다). Home·나가기는
           어떤 상태에서도 눌려야 한다. */
        #bf-hud { position: absolute; inset: 0; z-index: 11; pointer-events: none; }
        #bf-hud > * { pointer-events: auto; }
        .bf-badge { position: absolute; display: flex; align-items: center; gap: 6px;
          min-height: 44px; padding: 0 14px; border-radius: 9999px; font-weight: 900;
          font-size: clamp(0.9rem, 2vw, 1.15rem); white-space: nowrap;
          background: linear-gradient(180deg, #3b3fb0, #2a2c86); color: var(--pz-gold, #ffd23e);
          border: 2px solid rgba(255,255,255,0.25); box-shadow: 0 4px 0 rgba(0,0,0,0.25); }
        .bf-badge.score { top: clamp(10px, 2vh, 18px); left: clamp(10px, 2vw, 18px); }
        .bf-badge.combo { top: clamp(58px, 9vh, 74px); left: clamp(10px, 2vw, 18px);
          background: #ff5b9c; color: #fff; border-color: rgba(255,255,255,0.5); display: none; }
        .bf-badge.combo.on { display: flex; }
        /* 레벨 — 지금 몇 레벨인지(HUD 요구사항). 목표 뱃지 위, 화면 상단
           가운데다. */
        .bf-badge.level { top: clamp(10px, 2vh, 18px); left: 50%; transform: translateX(-50%);
          background: linear-gradient(180deg, #5b3fb0, #3a2586); color: #fff;
          border-color: rgba(255,255,255,0.45); }
        /* 목표(담은 개수 / 채워야 할 개수) — 몇 개 남았는지 모르면 아이는
           언제 끝나는지 모른 채 그냥 팔만 휘두른다. 레벨 뱃지 바로 아래. */
        .bf-badge.goal { top: clamp(58px, 9vh, 74px); left: 50%; transform: translateX(-50%);
          background: linear-gradient(180deg, #35c25a, #1f9640); color: #fff;
          border-color: rgba(255,255,255,0.45); display: none; }
        .bf-badge.goal.on { display: flex; }
        .bf-badge.goal .done { color: var(--pz-gold, #ffd23e); }

        #bf-loading { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center;
          justify-content: center; background: rgba(5,2,18,0.92); font-weight: 800; color: #cbb8ff; }

        /* ── 플레이어 확보·다시 찾기 안내 ★ (STEP 105) ─────────────────
           화면을 통째로 덮지 않는다 — 카메라 속 내 모습이 보여야 어디 서야
           할지 안다. 목표 뱃지 아래 가운데에 작은 상자 하나, 사람 얼굴·손을
           최대한 안 가리게. 친구 찾기는 판이 계속 도는 중이라 더 작게. */
        #bf-acquire { position: absolute; top: clamp(104px, 17vh, 150px); left: 50%; transform: translateX(-50%);
          z-index: 15; width: min(90vw, 520px); padding: clamp(10px, 2vh, 18px) clamp(16px, 3vw, 28px);
          border-radius: 22px; background: rgba(15,7,34,0.78); border: 3px solid var(--pz-gold, #ffd23e);
          text-align: center; pointer-events: none; }
        #bf-acquire[hidden], #bf-friend[hidden] { display: none; }
        #bf-acquire .t { margin: 0; font-size: clamp(1.05rem, 2.8vw, 1.6rem); font-weight: 900; color: var(--pz-gold, #ffd23e); }
        #bf-acquire .s { margin: 6px 0 10px; font-size: clamp(0.8rem, 1.8vw, 1.05rem); font-weight: 800; opacity: 0.92; }
        #bf-acquire .bar { height: 8px; border-radius: 9999px; background: rgba(255,255,255,0.18); overflow: hidden; }
        #bf-acquire .bar i { display: block; height: 100%; width: 0; background: var(--pz-gold, #ffd23e); }
        #bf-friend { position: absolute; top: clamp(104px, 17vh, 150px); left: 50%; transform: translateX(-50%);
          z-index: 15; padding: 6px 16px; border-radius: 9999px; background: rgba(15,7,34,0.7);
          font-size: clamp(0.8rem, 1.7vw, 1rem); font-weight: 800; pointer-events: none; white-space: nowrap; }
        /* DUO 두 번째 플레이어 포인터 — 점수판이 아니라 "내 동그라미가 어느
           것인지"만 알게 색만 살짝 다르게(하늘색). SOLO는 이 클래스가 안 붙는다. */
        .bf-hand.p2 { border-color: #7fe3ff; background: rgba(127,227,255,0.18);
          box-shadow: 0 0 0 2px rgba(0,0,0,0.25), 0 0 14px rgba(127,227,255,0.5); }

        /* ── LEVEL CLEAR 성공 배너 + 시각 축하 효과 ★ ─────────────
           레벨 목표를 채운 순간 화면 한가운데에 뜬다. gameplay 위에
           덧씌우는 오버레이일 뿐 — #bf를 다시 그리지 않으므로
           카메라·손 트래커는 그대로 살아 있다(재초기화 없음).

           반투명 배경(0.45)이라 뒤의 게임 화면이 계속 비친다 —
           "화면 전체를 가려 gameplay context를 잃게 만들지 않는다"
           요청 그대로. 오디오는 이 배너에서 안 낸다(요청: "성공
           피드백은 시각 효과만") — 대신 밝은 색·반짝임·꽃가루로만
           축하한다.

           타이밍(요청 그대로):
             0~300ms    박스 scale-in + 별 반짝임 시작
             300~1600ms 꽃가루가 계속 퍼진다(별은 그동안 계속 반짝임)
             1600~2200ms 전체 fade-out(.fade-out 클래스, 아래) */
        #bf-clear { position: absolute; inset: 0; z-index: 20; display: flex; align-items: center;
          justify-content: center; background: rgba(8,3,20,0.45);
          opacity: 1; transition: opacity 0.6s ease-in; }
        #bf-clear.fade-out { opacity: 0; }
        /* ── 카드 vs 연출을 층으로 분리한다 ★ (STEP 100 수정) ────────
           예전엔 별(★)이 .bf-clear-box 안쪽에 있어서(같은 자식)
           카드 안쪽 아무 위치에나 흩뿌려졌고, 실제로 "LEVEL CLEAR!"
           글자 위를 가렸다. 이제 별은 .bf-clear-fx(카드의 형제,
           #bf-clear 전체를 덮는 층)에 두고, 카드 영역(중앙)을 피해
           가장자리에만 놓는다 — showLevelClearBanner()의 좌표 계산
           참고. 카드는 overflow: visible이라 잘리진 않지만, 애초에
           별의 x/y를 가장자리로만 뽑아서 카드 위로 올 수가 없다. */
        .bf-clear-fx { position: absolute; inset: 0; z-index: 1; pointer-events: none; }
        .bf-clear-box { position: relative; z-index: 2; text-align: center;
          padding: clamp(20px, 4vh, 40px) clamp(28px, 6vw, 70px);
          background: linear-gradient(var(--pz-navy, #2a1a6e), var(--pz-navy-2, #1c1050));
          border: 4px solid var(--pz-gold, #ffd23e); border-radius: 28px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.5);
          animation: bf-clear-box-in 0.3s cubic-bezier(.2,1.6,.4,1); }
        .bf-clear-box .big { margin: 0 0 8px; font-size: clamp(1.6rem, 4.4vw, 2.6rem);
          font-weight: 900; color: var(--pz-gold, #ffd23e); text-shadow: 0 3px 10px rgba(0,0,0,0.5); }
        .bf-clear-box .sub { margin: 0; font-size: clamp(1rem, 2.4vw, 1.4rem); font-weight: 800; }
        @keyframes bf-clear-box-in { from { opacity: 0; transform: scale(0.6); } to { opacity: 1; transform: scale(1); } }

        /* 작은 별 — 카드 바깥 가장자리에서만 계속 반짝인다. 캔버스가
           아니라 글자(★) 몇 개라 새 그림·라이브러리가 안 든다. */
        .bf-sparkle { position: absolute; font-size: var(--size, 22px); color: var(--pz-gold, #ffd23e);
          text-shadow: 0 0 6px rgba(255,210,62,0.8); pointer-events: none;
          animation: bf-sparkle-twinkle 900ms ease-in-out infinite; animation-delay: var(--delay, 0ms); }
        @keyframes bf-sparkle-twinkle {
          0%, 100% { opacity: 0.15; transform: scale(0.6) rotate(0deg); }
          50%      { opacity: 1;    transform: scale(1.15) rotate(20deg); }
        }

        /* ── Rest 카운트다운(숫자만) ★ (STEP 99 재작업) ──────────
           대사창 자체는 이제 공용 스토리 컴포넌트(storyDialogue.js,
           transparent: true)를 그대로 재사용한다 — "REST 전용 작은
           UI를 새로 만들지 말고 기존 큰 Dialogue UI를 재사용하라"는
           요청 그대로. 여기 남은 건 그 위에 얹는 카운트 숫자뿐이다.
           대화창(.r3s, z-index 70)보다 위(72)에 고정해 늘 보이게 하고,
           LEVEL·목표 뱃지(top ~18px·~74px) 아래로 내려서 안 겹친다. */
        #bf-rest-count { position: fixed; top: clamp(110px, 18vh, 150px); left: 50%;
          transform: translateX(-50%); z-index: 72; pointer-events: none;
          font-size: clamp(2rem, 7vw, 4rem); font-weight: 900;
          color: var(--pz-gold, #ffd23e); text-shadow: 0 4px 14px rgba(0,0,0,0.6); line-height: 1; }
        #bf-rest-count.hurry { color: #ff9f43; }   /* 마지막 3초 — 경고색(빨강)은 안 쓴다, 기존 정책과 동일 */

        /* 진단용 — 손 감지 실측 주기. status:'wip'인 동안만 신경 쓰면 되는
           개발용 표시라 눈에 안 띄게 작고 흐리게 뒀다. */
        #bf-diag { position: absolute; left: clamp(10px, 2vw, 18px); bottom: clamp(6px, 1.5vh, 18px);
          z-index: 5; font-size: 11px; color: rgba(255,255,255,0.45); pointer-events: none; }
      </style>
      <div id="bf">
        <div id="bf-veil"></div>
        <div id="bf-sprites"></div>
        <div id="bf-popfx"></div>
        <div id="bf-basket-wrap">
          <img id="bf-basket" src="${BASKET_IMAGE}" alt="바구니">
          <div id="bf-basket-pile"></div>
        </div>
        <div id="bf-hud">
          <div class="bf-badge score">${icon('star')} <span id="bf-score">0</span></div>
          <div class="bf-badge combo" id="bf-combo">${icon('flame')} <span>0</span>콤보!</div>
          <div class="bf-badge level" id="bf-level">LEVEL <span>1</span></div>
          <div class="bf-badge goal" id="bf-goal"><span class="done">0</span>/<span class="need">0</span></div>
          ${/* 공통 게임 UI — 모양을 따로 짜지 않는다(CLAUDE.md "이것이 브랜드다").
                플레이 중이므로 Home 버튼은 없다(확인창 안에 있다). */
            sysBarMarkup({ home: false, exit: true })}
        </div>
        <div id="pz-judge"></div>
        <div id="bf-acquire" hidden><p class="t"></p><p class="s"></p><div class="bar"><i></i></div></div>
        <div id="bf-friend" hidden>친구를 찾는 중...</div>
        ${import.meta.env.DEV ? '<div id="bf-diag"></div>' : ''}
        <div id="bf-loading">카메라를 켜는 중...</div>
      </div>
    `
    const bf = app.querySelector('#bf')
    bf.prepend(tracker.video)
    $ = q => app.querySelector(q)
    els.clear()
    for (const k of tracker.keys) handEls[k] = null

    // 시스템바는 화면을 다시 그릴 때마다(스토리 뒤 `mountUI()`) 새로 잇는다.
    // **판을 멈추는 것까지 공용 규칙이다** — 안 멈추면 아이가 메뉴를 보는
    // 동안 풍선이 계속 떠다닌다.
    bindSysBar(bf, {
      onPause: p => { menuPaused = p; if (!p) lastT = null },
      onQuit: () => leaveWith('again'),   // 확인창 "게임 처음으로" → 이 게임의 타이틀
      onHome: () => leaveWith('home'),    // 확인창 "Home으로" → 허브
    })
  }

  function basketRect() {
    const basket = $('#bf-basket')
    const stage = $('#bf')
    const r = basket.getBoundingClientRect()
    const s = stage.getBoundingClientRect()
    return {
      x0: (r.left - s.left) / s.width, x1: (r.right - s.left) / s.width,
      y0: (r.top - s.top) / s.height, y1: (r.bottom - s.top) / s.height,
    }
  }

  function syncSprites() {
    const seen = new Set()
    const host = $('#bf-sprites')
    for (const s of run.field.active) {
      seen.add(s.id)
      let el = els.get(s.id)
      if (!el) {
        el = document.createElement('img')
        el.className = 'bf-balloon'
        el.src = BALLOON_SPRITES[colorFor(s.id)]
        el.alt = ''
        host.appendChild(el)
        els.set(s.id, el)
      }
      el.style.width = `${s.r * 200}vmin`   // r은 화면 짧은 변 기준 정규화 반지름
      el.style.left = `${s.x * 100}%`
      el.style.top = `${s.y * 100}%`
    }
    for (const [id, el] of els) {
      if (!seen.has(id)) { el.remove(); els.delete(id) }
    }
  }

  /**
   * 카메라 원본 프레임 좌표(0~1) → `object-fit: cover`로 꽉 채운 화면
   * 박스 좌표(0~1). 비디오 실제 해상도(`videoWidth/Height`)와 화면
   * 박스 크기가 다른 비율이면 `cover`가 한쪽을 잘라낸다 — 그만큼을
   * 되돌려야 화면에 뜬 손 커서·풍선과 실제 손 위치가 맞는다.
   */
  function mapHandPoint(p, rect) {
    if (!p) return null
    const vw = tracker.video.videoWidth || 16
    const vh = tracker.video.videoHeight || 9
    const cw = rect.width || 1
    const ch = rect.height || 1
    const scale = Math.max(cw / vw, ch / vh)
    const dispW = vw * scale, dispH = vh * scale
    const offX = (dispW - cw) / 2, offY = (dispH - ch) / 2
    return {
      x: (p.x * dispW - offX) / cw,
      y: (p.y * dispH - offY) / ch,
    }
  }

  /** 이번 프레임에 쓸 손 좌표 — 화면 박스 기준으로 보정된 값(아직 부드럽지 않다). */
  function screenHands() {
    const rect = $('#bf').getBoundingClientRect()
    // SOLO는 `{left, right}`(예전과 같은 모양), DUO는 `{p1, p2}` — 손 키는
    // 트래커가 정한다. 키 수가 곧 포인터 최대 개수다(SOLO·DUO 모두 2개 키지만
    // SOLO는 트래커가 한쪽을 늘 비워 둬서 실제로는 1개).
    return Object.fromEntries(tracker.keys.map(k => [k, mapHandPoint(tracker.hands[k], rect)]))
  }

  // ── 손 위치 예측 필터 ★ (4차 피드백 — 지수평활을 걷어내고 다시 짰다) ──
  //
  // STEP 76 후속 2·3은 지수평활(`smooth += (target-smooth)*k`) 하나로
  // 풀려 했는데, ken이 "여전히 잘 안돼"를 두 번째로 재확인했다. 원인은
  // 구조 자체에 있었다 — 지수평활은 "지금 아는 목표"를 **뒤에서만
  // 쫓아가고**, `handTracker.js`가 주는 좌표는 포즈 추론이 화면 갱신보다
  // 느려서 여러 프레임 동안 안 바뀌다가 한 번에 바뀐다. 지수평활은 그
  // 안 바뀌는 구간마다 "다 왔다"고 착각하고 멈췄다가, 값이 실제로
  // 바뀌는 순간 다시 쫓아가길 반복한다 — 손이 계속 움직이는 중엔 늘
  // 뒤처진다.
  //
  // `arcade2d/handSmoother.js`(위치+속도 예측 필터, alpha-beta 필터의
  // 단순화판)로 바꿨다 — 진짜 새 감지가 있을 때만(`fresh`) 위치·속도를
  // 보정하고, 그 사이엔 마지막 속도로 미리 나간다. "진짜 새 감지인지"는
  // `tracker.hands.seq`(핸드트래커가 실제로 값을 갱신할 때만 올리는
  // 카운터)가 지난 프레임과 다른지로 판별한다 — `screenHands()`는 매
  // 프레임 좌표를 새로 계산해서 값 자체만으로는 "진짜 새 정보"와 "같은
  // 값 반복"을 구별할 수 없기 때문이다.
  const smoother = makeHandSmoother({ keys: tracker.keys })
  let lastHandSeq = -1

  function syncHands(hands) {
    for (const side of tracker.keys) {
      const p = hands[side]
      if (p) {
        let el = handEls[side]
        if (!el) {
          el = document.createElement('div')
          el.className = isDuo ? `bf-hand ${side}` : 'bf-hand'
          $('#bf').appendChild(el)
          handEls[side] = el
        }
        el.style.left = `${p.x * 100}%`
        el.style.top = `${p.y * 100}%`
      } else if (handEls[side]) {
        handEls[side].remove()
        handEls[side] = null
      }
    }
  }

  /**
   * 잡힌 풍선을 바구니 위에 "고정"해서 눈으로 성공을 확인하게 한다.
   * `prepend`로 맨 앞에 넣는다 — ken: "뒤로 추가해주면 돼." DOM에서
   * 앞선 형제가 먼저 칠해지므로, 방금 넣은 것이 가장 뒤에 깔린다.
   *
   * **1부(CATCH)에서만 부른다** — 게임이 실제로 넣은 풍선이라
   * `run.totalCollected` 등 지표에 이미 반영된 것들이다.
   */
  function addToPile(spriteId) {
    const pile = $('#bf-basket-pile')
    if (!pile) return
    const img = document.createElement('img')
    img.className = 'bf-pile-item'
    img.src = BALLOON_SPRITES[colorFor(spriteId)]
    img.alt = ''
    pile.prepend(img)
    fitPile(pile)
  }

  /** 개수에 맞춰 겹침을 조인다 — 값 계산은 순수 함수라 따로 테스트한다. */
  function fitPile(pile) {
    const { itemPct, overlapPct } = pileMetrics(pile.children.length)
    pile.style.setProperty('--bf-item', `${itemPct}%`)
    pile.style.setProperty('--bf-overlap', `${overlapPct}%`)
  }

  function clearPile() {
    const pile = $('#bf-basket-pile')
    if (pile) pile.innerHTML = ''
  }

  /**
   * 2부(POP) 전용 — 바구니 안을 **순수 장식**으로 채운다. `run.field`에
   * 안 들어가는 평범한 `<img>`일 뿐이라 손 트래커·충돌·pop·점수·
   * 남은 개수 어느 것에도 안 걸린다(게임 로직이 이 DOM의 존재 자체를
   * 모른다) — 아무리 손을 흔들어도 절대 안 터진다.
   */
  function fillDecorPile(count) {
    const pile = $('#bf-basket-pile')
    if (!pile) return
    pile.innerHTML = ''
    for (let i = 0; i < count; i++) {
      const img = document.createElement('img')
      img.className = 'bf-pile-item'
      img.src = BALLOON_SPRITES[colorFor(i)]
      img.alt = ''
      pile.appendChild(img)
    }
    fitPile(pile)
  }

  /**
   * 2부(POP) 전용 — 풍선이 터진 자리에 색 맞는 Pop FX를 잠깐 띄운다.
   * `run.field`에 안 들어가는 순수 시각 <img>라 손 트래커·충돌·pop·
   * 점수·남은 개수 어느 것에도 안 걸린다 — 애니메이션이 끝나면 스스로
   * 지운다(`animationend`, 800ms 보험 타이머도 같이 둔다).
   *
   * @param {number} x 정규화 x(0~1) — 터진 순간 풍선 중심
   * @param {number} y 정규화 y(0~1)
   * @param {number} r 터진 풍선의 반지름(정규화) — FX는 이보다 1.5배 크게
   * @param {number} id 스프라이트 id — `colorFor(id)`로 같은 색을 고른다
   */
  function spawnPopFx(x, y, r, id) {
    const host = $('#bf-popfx')
    if (!host) return
    const clamp = v => Math.min(1 - POP_FX_CLAMP, Math.max(POP_FX_CLAMP, v))
    const el = document.createElement('img')
    el.className = 'bf-pop-fx'
    el.src = popFxSrc(colorFor(id))
    el.alt = ''
    el.style.width = `${r * 200 * 1.5}vmin`   // 원래 풍선보다 1.4~1.6배(요청) — 1.5배로 고정
    el.style.left = `${clamp(x) * 100}%`
    el.style.top = `${clamp(y) * 100}%`
    host.appendChild(el)
    el.addEventListener('animationend', () => el.remove())
    setTimeout(() => el.remove(), 900)   // 애니메이션이 안 도는 환경의 보험(judgeFx와 같은 방식)
  }

  /**
   * 레벨이 바뀔 때마다(또는 화면을 새로 그릴 때) 바구니 내용물을
   * 지금 파트에 맞게 맞춘다 — 1부는 그동안 담은 것(플레이가 채운다),
   * 2부는 레벨별 장식 개수(`PART2_BASKET_DECOR_COUNTS`, 축제가
   * 끝나가며 줄어든다)로 다시 채운다.
   */
  function syncBasket() {
    if (run.part === PART.CATCH) {
      clearPile()
    } else if (run.part === PART.POP) {
      fillDecorPile(PART2_BASKET_DECOR_COUNTS[run.levelIndex] ?? 0)
    }
  }

  /**
   * 판정 글자 — 쥬라기 런 장애물 판정(Great!/Miss)과 같은 디자인
   * (`runner/ui/cues.js`, ken: "쥬라기 런에서 사용한 디자인 스타일 적용").
   * 손이 닿아 붙잡는 순간엔 'catch'("Catch!" — 아직 성공은 아니다),
   * 바구니에 넣거나(collect) 터뜨리면(pop) 'great'("Great!")를 띄운다.
   */
  function judgeFx(x, y, kind) {
    const box = $('#bf').getBoundingClientRect()
    showJudge($('#bf'), kind, { x: x * box.width, y: y * box.height })
  }

  // ── 진단용 — 실제 감지 주기를 화면에 작게 보여준다 ★ ──────────
  //
  // 4차 피드백에서도 "트래킹이 여전히 안 된다"는 재확인을 받았다.
  // 이번엔 숫자 하나(문턱값)를 또 추측해서 바꾸는 대신, 실제로 초당
  // 몇 번 새 좌표가 오는지(`hands.seq`가 1초에 몇 번 오르는지)를 화면
  // 구석에 작게 띄운다 — 다음에 ken이 재확인해 줄 때 "느낌"이 아니라
  // 숫자로 원인을 좁힐 수 있다(카메라·기기 자체의 추론 속도가 느린
  // 것인지, 아니면 다른 문제인지).
  //
  // ★ (STEP 103) `status: 'wip'`라 허브 목록에는 안 뜨지만 `/play?id=`
  // 직접 접근으로는 production 빌드에서도 보였다(ken 실사용 확인) —
  // 개발자만 보면 되는 정보가 실 배포 화면에 노출된 것. `#bf-diag`
  // 엘리먼트 자체를 `import.meta.env.DEV`일 때만 마크업에 넣도록
  // 고쳤으니(위 render 부분), production 빌드에서는 `$('#bf-diag')`가
  // 애초에 null이라 아래 계산도 의미가 없다 — dev 빌드가 아니면 통째로
  // 건너뛴다(렌더도 안 되고 계산도 안 돈다).
  let diagCount = 0, diagWindowStart = null, diagPrev = null
  function detectDiag(fresh, tSec) {
    if (!import.meta.env.DEV) return
    if (fresh) diagCount++
    if (diagWindowStart == null) diagWindowStart = tSec
    const elapsed = tSec - diagWindowStart
    if (elapsed < 1) return

    // 추론이 돈 횟수와 그중 실제로 사람을 골라 흘린 횟수를 **따로** 센다.
    // 5차에서 "감지 0회/초"의 범인이 추론이 아니라 사람 고르기였다 —
    // 둘을 합쳐 하나로 보여줬으면 어디가 막힌 건지 계속 몰랐을 것이다.
    const s = poseEngineCore.stats
    const rate = n => Math.round(n / elapsed)
    const det = diagPrev ? rate(s.detections - diagPrev.detections) : 0
    const emit = diagPrev ? rate(s.emitted - diagPrev.emitted) : 0
    const el = $('#bf-diag')
    if (el) el.textContent = `추론 ${det}/s · 사람 ${emit}/s · 손 ${rate(diagCount)}/s · ${s.delegate ?? '-'}`

    diagPrev = { detections: s.detections, emitted: s.emitted }
    diagCount = 0
    diagWindowStart = tSec
  }

  /**
   * LEVEL CLEAR 성공 배너 — 화면 위 오버레이일 뿐(`#bf`를 다시 안
   * 그린다) 카메라·손 트래커 재초기화가 없다. 이 안에서는 잡기·터뜨리기
   * 모두 안 걸린다 — `paused=true`가 `frame()` 자체를 멈춰서
   * `run.tick()`이 아예 안 불린다(호출부에서 이미 멈추고 부른다).
   *
   * @param {{ gameDone?: boolean }} res
   * @returns {Promise<void>}
   */
  function showLevelClearBanner(res) {
    return new Promise(resolve => {
      const bf = $('#bf')
      if (!bf) { resolve(); return }
      // Part 완료(1부 레벨3 · 2부 레벨3=gameDone) 쪽을 조금 더 풍성하게
      // — 요청: "Level 3 또는 Part Complete에서는 꽃가루/별의 양을
      // 약간 더 풍성하게".
      const grand = !!res.partDone
      const el = document.createElement('div')
      el.id = 'bf-clear'
      const big = res.gameDone ? 'MISSION COMPLETE!' : 'LEVEL CLEAR!'
      const sub = res.gameDone ? '최고예요!' : '잘했어요!'
      const starCount = grand ? 14 : 8
      // ── 카드 바깥 가장자리에만 놓는다 ★ (STEP 100 수정) ────────
      //
      // 예전엔 카드 중심을 기준으로 각도·거리를 뽑아서(dist 90~210px를
      // 대충 %로 변환) 카드 바로 위에도 별이 떨어졌다 — "LEVEL CLEAR!"
      // 글자를 가리는 원인이었다. 카드는 화면 중앙에 있으니, 화면
      // 네 가장자리(위·아래·왼쪽·오른쪽) 띠에서만 좌표를 뽑으면
      // 중앙(카드 영역)에는 원리적으로 별이 못 온다.
      const EDGE_ZONES = [
        () => ({ x: 10 + Math.random() * 80, y: 2 + Math.random() * 8 }),    // 위쪽 띠
        () => ({ x: 10 + Math.random() * 80, y: 90 + Math.random() * 8 }),  // 아래쪽 띠
        () => ({ x: 2 + Math.random() * 8, y: 15 + Math.random() * 70 }),   // 왼쪽 띠
        () => ({ x: 90 + Math.random() * 8, y: 15 + Math.random() * 70 }),  // 오른쪽 띠
      ]
      const stars = Array.from({ length: starCount }, () => {
        const { x, y } = EDGE_ZONES[Math.floor(Math.random() * EDGE_ZONES.length)]()
        const size = 14 + Math.random() * 16
        const delay = Math.round(Math.random() * 700)
        return `<span class="bf-sparkle" style="left:${x}%; top:${y}%; --size:${size}px; --delay:${delay}ms">★</span>`
      }).join('')
      el.innerHTML = `<div class="bf-clear-fx">${stars}</div><div class="bf-clear-box"><p class="big">${big}</p><p class="sub">${sub}</p></div>`
      bf.appendChild(el)
      // 시각 효과만 — 요청대로 오디오(박수·환호·success·round_clear 등)는
      // 이 배너에서 아예 안 낸다. `core/confetti.js`(기존 공용 연출,
      // 다른 게임도 이미 쓴다)만 재사용한다.
      const stopConfetti = burstConfetti(bf, { pieces: grand ? 110 : 70, bursts: grand ? 4 : 2, seconds: 1.9 })
      // 0~300ms 박스 scale-in은 CSS 애니메이션(`bf-clear-box-in`)이 맡고,
      // 1600~2200ms는 컨테이너 전체를 페이드아웃한다 — 갑자기 툭
      // 사라지면 아이 눈에 오류처럼 보인다.
      const FADE_AT = 1600, TOTAL = 2200
      const fadeTimer = setTimeout(() => el.classList.add('fade-out'), FADE_AT)
      setTimeout(() => { clearTimeout(fadeTimer); stopConfetti(); el.remove(); resolve() }, TOTAL)
    })
  }

  /**
   * 방금 깬 레벨에 맞는 캐릭터 대사 한 줄. ★ (STEP 107) 대사 안 목표
   * 개수는 `run.quotas`(=`run.part1Quotas`/`part2Quotas` — 이번 판이
   * 실제로 쓰는 모드별 값, HUD·게임 판정과 같은 배열)에서 읽는다 —
   * 문자열에 박힌 숫자가 아니다. SOLO(5/10/15)든 DUO(10/20/30)든 이
   * 함수 하나로 항상 실제 quota와 맞는 대사가 나온다.
   */
  function pickClearLine(res) {
    const lines = run.part === PART.CATCH ? PART1_LEVEL_CLEAR_LINES : PART2_LEVEL_CLEAR_LINES
    return lines[res.clearedLevel - 1]?.(run.quotas) ?? ''
  }

  /**
   * 레벨 번호 → 어느 캐릭터 세트(companion preset)를 띄울지 ★ (STEP 101)
   *
   * 요청 매핑: 레벨 1(quota 5) 클리어 = 가리키는 포즈(point), 레벨 2
   * (quota 10) = 쉬는 포즈(rest), 레벨 3(quota 15) = 박수 포즈(clap).
   * 1부·2부 둘 다 레벨이 3개(quota 배열 길이 3)라 레벨 번호 하나로
   * 충분하다 — 파트를 따로 안 물어도 된다. 2부 레벨 3(=gameDone)은
   * 애초에 이 대사 화면 자체를 안 타므로(STEP 100) 'clap'은 실제로는
   * 1부 레벨 3에서만 뜬다 — 요청 5번의 "Part 2 final엔 세트 A를 안
   * 넣어도 된다"를 코드를 안 나눠도 자연히 만족한다.
   */
  function companionPresetFor(res) {
    return { 1: 'point', 2: 'rest', 3: 'clap' }[res.clearedLevel]
  }

  /**
   * LEVEL_CLEAR 배너 다음 화면 — **기존 스토리 대화창(storyDialogue.js)을
   * 그대로 재사용**하되(요청: "REST 전용 작은 UI를 만들지 말고 기존
   * 큰 Dialogue UI를 재사용"), 배경만 반투명(`transparent: true`)으로
   * 켜서 카메라가 계속 보이게 한다 — 대화창의 크기·테두리·배경·
   * typography·버튼 스타일은 인트로 등 다른 스토리 화면과 완전히
   * 같다(같은 컴포넌트라서 다를 수가 없다).
   *
   * 대사와 10초 Rest 카운트다운은 **동시에** 시작한다(요청) — 카운트
   * 오버레이를 대화 호출 **전에** 먼저 띄우고 타이머를 켠 뒤, 대화는
   * 별도로 돈다. 그림 기반 3·2·1·START 연출은 없다 — 10 → 1까지
   * 평범한 숫자만 쓰고 0이 되면 곧장 다음 레벨로 넘어간다.
   *
   * ── Rest 종료 조건은 정확히 둘뿐이다 ★ (STEP 100 버그 수정) ──
   *
   * **버그**: 실제 플레이에서 Rest가 10초를 다 못 채우고 약 5초만에
   * 끝나 버렸다 — 원인은 공용 스토리 컴포넌트(`showStoryScene`)
   * 자체의 **읽는 속도 기반 자동 넘김**(`autoMs()`, 글자 수 비례,
   * 3.5~8초)이었다. 대사 한 줄짜리 장면은 그 시간이 지나면 "다음
   * 줄이 없다"고 판단해 **스스로** `finish('done')`을 불러 대화창을
   * 닫아 버린다 — 우리 10초 카운트다운과는 완전히 무관하게, 대화
   * 자체의 "다 읽었다" 판단 하나로 Rest 전체가 끝나 버린 것이다.
   * 실제 대사("잘했어! 풍선 5개를…")로 계산하면 `autoMs`가 정확히
   * 4.8~5초 근처가 나온다 — 사용자가 본 "약 5초"와 정확히 일치한다.
   *
   * **고친 방법**: `runStory()`가 돌려주는 `'done'`(대사가 스스로
   * 다 읽혔다는 뜻)은 **Rest를 안 끝낸다** — 무시한다. Rest를 끝내는
   * 신호는 오직 둘: (A) 카운트다운이 0에 닿는 것, (B) 사용자가
   * SKIP을 누르는 것(`'skip'`으로 온다). 카운트가 0이 되면 그 순간
   * 대화창이 아직 떠 있으면 SKIP 버튼을 프로그램적으로 눌러(이미
   * 사라졌으면 조용히 무시) 정리하고, **정확히 이 한 자리에서만**
   * 다음 레벨로 넘어간다 — `finishRest()`를 두 번 이상 부르면
   * 아무 일도 안 하도록 막아 뒀다(`resolved` 플래그).
   *
   * ── "다음" 버튼 — 애초에 다음 대사가 없다(STEP 103) ──────────
   *
   * 대사는 항상 줄 하나뿐이고, 대화 자체를 끝내는 시점은 이 함수의
   * 카운트다운(A)/SKIP(B)이 정한다 — "다음"이 유용하게 할 일이 없다.
   * 그런데 예전엔 이 버튼이 그냥 켜져 있어서, 사용자가 카운트다운이
   * 다 되기 한참 전에 눌러 버리면 공용 컴포넌트(`showStoryScene`)가
   * `finish('done')`으로 대화창 DOM을 그 자리에서 지워 버렸다 —
   * `.then()`에서 `'done'`을 무시하게 짜 놨어도 소용없다, DOM 삭제는
   * `finish()` 안에서 결과와 무관하게 일어난다. `disableNextOnLast:
   * true`로 이 버튼을 아예 꺼서(자동 넘김 타이머도 안 걸리게) 막았다
   * — 이제 대화창은 오직 `finishRest()`가 프로그램적으로 SKIP을 눌러야만
   * 사라진다.
   *
   * @returns {Promise<'done'|'home'|'title'>}
   */
  function showRestWithDialogue(res) {
    const speaker = run.part === PART.CATCH ? 'girl' : 'boy'
    const scenes = [{ lines: [{ text: pickClearLine(res), speaker }] }]

    // 카운트다운 — 대화창(.r3s, z-index 70)보다 위(72)에 고정 오버레이로.
    const countEl = document.createElement('div')
    countEl.id = 'bf-rest-count'
    document.body.appendChild(countEl)
    let n = LEVEL_REST_SECONDS
    const renderCount = () => {
      countEl.textContent = n
      countEl.classList.toggle('hurry', n <= 3)
    }
    renderCount()
    sound.play('beep')

    let resolved = false
    let tickTimer = null
    let settle = () => {}
    const outer = new Promise(res => { settle = res })

    // Rest를 끝내는 자리는 **여기 하나뿐**이다 — 카운트다운이 0에 닿거나
    // SKIP이 눌렸을 때만 부른다. 두 번째 호출은 아무 일도 안 한다
    // (`resolved` 플래그) — "next Level이 정확히 한 번만 시작"을 구조로
    // 보장한다.
    const finishRest = result => {
      if (resolved) return
      resolved = true
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null }
      countEl.remove()
      // 대화창이 아직 떠 있으면(카운트다운이 대사 자동 넘김보다 먼저
      // 0에 닿은 경우) SKIP을 프로그램적으로 눌러 그 안의 타이머·DOM도
      // 같이 정리한다 — 이미 사라졌으면 조용히 아무 일도 안 한다.
      document.querySelector('#r3-story-skip')?.click()
      settle(result)
    }

    tickTimer = setInterval(() => {
      n--
      if (n <= 0) { finishRest('done'); return }
      renderCount()
      sound.play('beep')
    }, 1000)

    runStory(app, scenes, {}, {
      skippable: true, transparent: true, companionPreset: companionPresetFor(res), disableNextOnLast: true,
    })
      .then(result => {
        // ★ 대사가 스스로 "다 읽었다"고 끝내는 것('done')은 Rest 종료가
        // 아니다 — Rest의 유일한 종료 기준은 카운트다운(0)과 SKIP뿐이다.
        // 사용자가 실제로 SKIP을 눌렀을 때만('skip') 여기서 Rest를
        // 끝낸다. Home/나가기('home'/'title')는 게임 자체를 나가는
        // 길이라 그대로 Rest도 같이 끝낸다.
        if (result === 'home' || result === 'title') { finishRest(result); return }
        if (result === 'skip') { finishRest('done'); return }
        // result === 'done' — 대사가 스스로 끝났을 뿐, 카운트다운은
        // 그대로 돈다. 아무 것도 안 한다.
      })

    return outer
  }

  async function showTransition() {
    paused = true
    // 스토리에도 스킵을 준다(ken 6차) — 1부를 다시 할 때마다 같은 컷을
    // 끝까지 보게 하면 그만큼 안 움직이는 시간이 는다. 스킵은 곧장
    // 2부로 들어간다(쥬라기 런과 같은 동작).
    const r = await runStory(app, story.transition?.scenes, {}, { skippable: true })
    if (over) return
    if (EXIT_RESULTS.has(r)) { finishExitDuringStory(); return }
    mountUI()
    // `mountUI()`는 `#bf`를 통째로 새로 그리므로 `#bf-loading`("카메라를
    // 켜는 중...")도 매번 새로 생긴다. 맨 처음 진입(아래 `await
    // tracker.ready` 뒤)에서만 지웠지, 여기서는 지운 적이 없었다 —
    // 카메라와 손 트래커는 2부에서도 그대로 이어 쓰는데(같은 `tracker`,
    // `poseEngineCore.acquire()`를 다시 부르지 않는다) 화면만 계속 암전
    // 오버레이에 덮여 있었다. 이미 켜져 있는 카메라라 곧바로 지운다.
    $('#bf-loading')?.remove()
    syncBasket()   // 2부 진입 — 바구니를 장식 풍선으로 채운다
    syncLevelBadge()
    paused = false
    lastT = null
  }

  async function showEnding() {
    return runStory(app, story.ending?.scenes, {}, { skippable: true })
  }

  function finishExitDuringStory() {
    // 스토리 화면의 나가기(X) → 확인창 "게임 처음으로"와 같은 자리다.
    leaveWith('again')
  }

  /**
   * LEVEL_CLEAR → (쉬는 대사+Rest 동시 표시) → NEXT_LEVEL ★
   *
   * 레벨 완료 순간부터 다음 레벨이 실제로 열리기 전까지 새 풍선은
   * 절대 안 생긴다 — `run.startNextLevel()`을 이 시퀀스 맨 끝에서만
   * 부르고, `game.js`의 `tick()`은 그 전까지 `awaitingNext` 때문에
   * 스폰은커녕 아무 것도 안 한다.
   */
  async function runLevelTransition(res) {
    await showLevelClearBanner(res)
    if (over) return

    if (res.gameDone) {
      // ── 마지막 레벨 — 곧장 엔딩으로 (STEP 100 수정) ─────────────
      //
      // 예전엔 여기서 `showFinalClearDialogue()`("축제 준비 완료!
      // 정말 잘했어!")를 한 번 더 보여준 뒤에야 엔딩으로 넘어갔다.
      // 그런데 그 대사는 배경 그림이 없는 화면(공용 스토리 컴포넌트의
      // 기본 불투명 배경, `#150a2e` 짙은 남색 단색)이라 **그 자체가
      // "암전"으로 보였다** — 그리고 곧이어 나오는 진짜 엔딩 스토리
      // (`showEnding()`, `story_scene_ending.png` 등 실제 그림)가 이미
      // "오늘 축제 준비 정말 즐거웠어!"로 같은 내용을 말한다 — 중복
      // 화면이었다. 게임의 모든 미션이 이미 끝난 시점이라 추가
      // Dialogue/Rest가 필요 없다 — LEVEL_CLEAR 배너 다음은 곧장
      // 기존 엔딩 스토리(실제 그림이 있는 정상적인 전환)로 간다.
      // `startNextLevel()`은 `part`를 DONE으로만 넘기고 스폰은 안
      // 한다(quotas를 다 썼다).
      run.startNextLevel()
      await showEnding()
      if (over) return
      finish(true)
      return
    }

    // 대사 + 10초 Rest 카운트다운을 **한 화면에서 동시에** 보여준다 —
    // 카메라는 이 화면 내내 반투명 배경 뒤로 계속 보인다. 'done'(다
    // 읽음)과 'skip'(SKIP으로 Rest 전체를 즉시 끝냄) 둘 다 여기서는
    // 그냥 "진행"이다 — 어느 쪽이든 아래에서 다음 레벨을 딱 한 번 연다.
    const rr = await showRestWithDialogue(res)
    if (over) return
    if (rr === 'home') { leaveWith('home'); return }
    if (rr === 'title') { leaveWith('again'); return }

    // 0초가 된 뒤에만 다음 레벨(또는 파트)을 연다 — 이 호출이 실제로
    // quota만큼 풍선을 스폰하는 유일한 자리다.
    run.startNextLevel()

    if (res.partDone) {
      // Part1 -> Part2 경계 — 기존 축제 준비 완료 일러스트 컷(3장면)도
      // 그대로 보여준다. `showTransition()`이 자기 안에서 mountUI·
      // syncBasket·재개까지 다 한다(기존 동작, 안 건드린다).
      await showTransition()
      return
    }

    syncBasket()
    syncLevelBadge()
    syncGoal()
    paused = false
    lastT = null
  }

  // ── DUO — 잠깐 사라짐 · 재합류 · 둘 다 사라짐 ★ (STEP 105) ──────────
  //
  // 한 명이 잠깐 가려져도 판은 그대로다(자리 유예는 `playerSlots.js`). 유예를
  // 넘기면 그 사람 포인터만 꺼지고, 그 사람이 들고 있던 풍선은 **놓는다** —
  // 안 놓으면 떠난 사람 몫으로 묶여 남은 사람이 못 잡아 레벨이 영영 안
  // 끝날 수 있다. 빈 자리에 사람이 들어오면 자동으로 다시 앉는다(재합류) —
  // quota·레벨·점수는 건드리지 않는다.
  //
  // 둘 다 사라지면 판을 멈춘다. 새 pause 시스템을 만들지 않고 기존
  // `frame()` 앞단에서 `paused`/`menuPaused`와 같은 방식으로 한 틱을 건너뛴다
  // (시간·활동 초도 안 흐른다). 한 명이라도 잠깐 안정적으로 보이면 이어간다.
  let lostPaused = false
  const lostTimer = createStableTimer(ACQUIRE_STABLE_MS)
  const releasedKeys = new Set()

  /** @returns {boolean} true면 이번 프레임은 판을 진행하지 않는다 */
  function duoPresenceGate() {
    const now = performance.now()
    const st = tracker.status(now)
    for (const s of st.slots) {
      const key = tracker.keys[s.id]
      if (s.state === 'lost') {
        if (!releasedKeys.has(key)) { run.releaseHand(key); releasedKeys.add(key) }
      } else {
        releasedKeys.delete(key)
      }
    }
    const friend = $('#bf-friend')
    if (!lostPaused && st.activeCount === 0) { lostPaused = true; lostTimer.reset() }
    if (lostPaused) {
      if (friend) friend.hidden = true
      if (!lostTimer.update(st.presentCount >= 1, now)) {
        syncHands({})   // 포인터를 옛 자리에 얼려 두지 않는다
        showAcquire(ACQUIRE_TEXT.rejoin, st.presentCount, lostTimer.progress(now))
        lastT = null
        return true
      }
      lostPaused = false
      hideAcquire()
      lastT = null
    }
    if (friend) friend.hidden = st.activeCount >= tracker.keys.length
    return false
  }

  function frame() {
    raf = requestAnimationFrame(frame)
    if (paused || menuPaused || over) return
    if (isDuo && duoPresenceGate()) return
    const t = performance.now() / 1000
    const dt = lastT == null ? 0 : Math.min(0.05, t - lastT)
    lastT = t
    activeSec += dt

    const fresh = tracker.hands.seq !== lastHandSeq
    lastHandSeq = tracker.hands.seq
    detectDiag(fresh, t)
    const hands = smoother.step(screenHands(), dt, fresh)
    syncHands(hands)
    const wasCatch = run.part === PART.CATCH
    const res = run.tick(dt, hands, wasCatch ? basketRect() : null)
    syncSprites()

    for (const ev of res.events) {
      // grab(붙잡기)은 손 움직임 지표(EXP)에 안 센다 — collect(바구니에
      // 넣기)·pop(터뜨리기)만 "완수된 동작"이다. grab까지 세면 풍선
      // 하나당 두 번(잡을 때+넣을 때) 카운트돼 운동량이 부풀려진다.
      if (ev.type !== 'grab') {
        // 운동 지표는 여전히 왼손/오른손이다 — DUO 손 키(p1/p2)는 그 순간
        // 그 플레이어가 쓰던 실제 손으로 되돌려 센다(SOLO는 키가 곧 손).
        const side = tracker.sideOf(ev.handKey)
        if (side === 'left') handHits.left++
        else if (side === 'right') handHits.right++
      }
      const p = hands[ev.handKey]
      if (p) judgeFx(p.x, p.y, ev.type === 'grab' ? 'catch' : 'great')
      if (ev.type === 'collect') addToPile(ev.id)
      // 터진 자리(ev.x/y, 정규화)에 색 맞는 Pop FX — 터진 풍선 자체는
      // `syncSprites()`가 이미 `run.field.active`에서 빠진 걸 보고 지운다.
      if (ev.type === 'pop') spawnPopFx(ev.x, ev.y, ev.r, ev.id)
    }

    $('#bf-score').textContent = run.score
    $('#bf-combo').classList.toggle('on', run.combo >= 2)
    if (run.combo >= 2) $('#bf-combo span').textContent = run.combo
    syncGoal()

    // ── 레벨 완료 — quota만이 source of truth다(game.js) ──────
    //
    // PLAYING → LEVEL_CLEAR → INTER_LEVEL_DIALOGUE → REST_COUNTDOWN →
    // NEXT_LEVEL. `paused=true`를 여기서 먼저 세워 `frame()` 자체가
    // 멈추게 한다 — 그 안에서 `run.tick()`이 다시 안 불리니 새 풍선도
    // 안 생기고 점수도 안 바뀐다(요청 그대로).
    if (res.levelCleared) {
      paused = true
      runLevelTransition(res)
      return
    }
  }

  /** 목표 뱃지 — "3/5". 목표가 없으면(방어적) 숨긴다. */
  function syncGoal() {
    const el = $('#bf-goal')
    if (!el) return
    const goal = run.quota
    el.classList.toggle('on', goal != null)
    if (goal == null) return
    el.querySelector('.done').textContent = Math.min(run.progress, goal)
    el.querySelector('.need').textContent = goal
  }

  /** 레벨 뱃지 — "LEVEL n". */
  function syncLevelBadge() {
    const el = $('#bf-level')
    if (el) el.querySelector('span').textContent = run.levelNo
  }

  /**
   * 결과 화면 — Odyssey Run(`runner3d/play3d.js`)이 완주 때 켜는 것과
   * 같은 "themed" 공용 결과 화면(`core/gameShell.js`의 `showGameOver`
   * 옵션 `bg`/`scoreBlock`/`sparkle`)을 그대로 쓴다. **이 옵션들은
   * core가 모든 게임에 이미 열어 둔 것**이지 오디세이 전용이 아니다 —
   * 오디세이의 파일은 read-only로만 참고했고 하나도 안 고쳤다.
   *
   * 데이터는 전부 풍선 팡팡 자체 값이다(`run.score`·`run.bestCombo`) —
   * 오디세이의 레벨·보상·스테이지 데이터는 안 가져왔다. 배경은 이미
   * 있는 타이틀 그림(`manifest.thumbnail`)을 재사용— 새 그림 없음.
   */
  function finish(completed) {
    if (over) return
    over = true
    cancelAnimationFrame(raf)
    showGameOver($('#bf'), {
      title: completed ? '축제 준비 완료!' : '수고했어요!',
      line: cheer(run),
      reward: record(summary()),
      // 두 버튼 다 **여기서 화면을 옮기지 않는다** — 결과만 돌려주고
      // `play.js`가 옮긴다. "다시 하기"는 게임 인트로(타이틀)로 간다.
      onAgain: () => { cleanup(); settle('again') },
      onQuit:  () => { cleanup(); settle('home') },
      ...(completed ? {
        bg: manifest.thumbnail,
        scoreBlock: { score: run.score, streak: run.bestCombo },
        sparkle: true,
      } : {}),
    })
  }

  function cleanup() {
    cancelAnimationFrame(raf)
    if (acquireRaf) { cancelAnimationFrame(acquireRaf); acquireRaf = null }
    tracker.release()
  }

  // ── 플레이어 확보 ★ (STEP 105) ─────────────────────────────────
  let acquireRaf = null

  /** 지금 화면에 보이는 플레이어 수 — SOLO는 personLock이 흘려준 한 사람, DUO는 자리 기준. */
  function presentPlayers(now) {
    if (isDuo) return tracker.status(now).presentCount
    const at = tracker.hands.personAt
    return at != null && now - at < SOLO_PRESENT_MS ? 1 : 0
  }

  function showAcquire(text, n, progress) {
    const el = $('#bf-acquire')
    if (!el) return
    el.hidden = false
    el.querySelector('.t').textContent = text.title
    el.querySelector('.s').textContent = text.sub(n)
    el.querySelector('.bar i').style.width = `${Math.round(progress * 100)}%`
  }
  function hideAcquire() {
    const el = $('#bf-acquire')
    if (el) el.hidden = true
  }

  /** need명이 ACQUIRE_STABLE_MS 동안 계속 보이면 true. 화면을 떠나면 false. */
  function waitForPlayers(need, text) {
    const timer = createStableTimer(ACQUIRE_STABLE_MS)
    return new Promise(resolve => {
      const tick = () => {
        acquireRaf = null
        if (over) { resolve(false); return }
        const now = performance.now()
        // 메뉴·확인창이 열려 있으면 그동안은 안 센다(닫고 다시 서야 시작).
        const n = menuPaused ? 0 : presentPlayers(now)
        if (timer.update(n >= need, now)) { hideAcquire(); resolve(true); return }
        showAcquire(text, n, timer.progress(now))
        acquireRaf = requestAnimationFrame(tick)
      }
      tick()
    })
  }

  /**
   * ── 메뉴 조작자 ≠ 게임 플레이어 ★ ────────────────────────────────
   *
   * 카메라·잠금은 앱 수명 동안 하나라, 타이틀·스토리에서 손으로 메뉴를
   * 누른 보호자(또는 다른 게임 준비 화면에서 잠긴 사람)가 그대로 게임
   * 입력으로 남을 수 있다. 그래서 스토리가 다 끝나고 **판이 돌기 직전**에:
   *   1) personLock 잠금을 푼다 — 메뉴 때 누구였는지와 무관해진다.
   *   2) DUO 자리도 전부 비운다.
   *   3) 실제로 화면 앞에 선 사람을 새로 확보한다(SOLO 1명 · DUO 2명).
   *   4) SOLO는 그 사람으로 잠근다 — 이후 다른 사람이 들어와도 입력이 안 된다.
   */
  async function beginGameplay() {
    poseEngineCore.resetLock()
    tracker.reset?.()
    const ok = await waitForPlayers(isDuo ? 2 : 1, isDuo ? ACQUIRE_TEXT.duo : ACQUIRE_TEXT.solo)
    if (!ok || over) return
    if (!isDuo) poseEngineCore.confirmLock()
    paused = false
    lastT = null
  }

  // 라우터가 화면을 갈아 끼우면(허브로 나가기 등) 여기서도 풀어 준다 —
  // 안 풀면 `await`가 영영 안 끝나 `play.js`의 흐름이 멈춘 채로 남는다.
  onLeave(() => {
    if (!over) { over = true; record(summary()) }
    cleanup()
    settle('left')
  })

  mountUI()
  const ok = await tracker.ready
  if (over) return result
  $('#bf-loading').remove()
  if (!ok) {
    app.querySelector('#bf').insertAdjacentHTML('beforeend',
      '<div id="bf-loading">카메라를 못 열었어요. 카메라 권한을 확인해 주세요.</div>')
    return result
  }
  // 판은 아직 안 돈다(`paused` 그대로) — 아래 `beginGameplay()`가 플레이어를
  // 확보한 뒤에 연다(STEP 105). 바구니·레벨·목표 뱃지는 먼저 보여 둔다.
  syncBasket()
  syncLevelBadge()
  syncGoal()
  // 1부를 플레이하는 동안 백그라운드로 미리 받아 둔다 — 2부 진입하고
  // 처음 터뜨릴 때 로딩 지연이 없어야 한다(요청). `await` 안 한다 —
  // 게임 시작을 늦추면 안 된다. 쉬는 타임 캐릭터는 `storyRunner.js`가
  // 첫 `runStory()` 호출(인트로) 때 알아서 미리 받는다.
  preloadPopFx()
  preloadEndingImages()   // 엔딩 스토리 배경 — 마지막 레벨 클리어 직후 지연 없이 뜨게(요청 9번)
  raf = requestAnimationFrame(frame)
  beginGameplay()   // await 안 한다 — 결과(`result`)는 판이 끝날 때 따로 풀린다
  return result
}
