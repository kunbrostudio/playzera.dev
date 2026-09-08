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
import { trackHands } from '../../arcade2d/handTracker.js'
import { makeHandSmoother } from '../../arcade2d/handSmoother.js'
import { runStory } from '../../arcade2d/storyRunner.js'
import { ensureCuesStyle, showJudge } from '../../runner/ui/cues.js'
import { ensureSysBarStyle, sysBarMarkup, bindSysBar } from '../../runner/ui/systemBar.js'
import { BalloonFestivalRun, PART, cheer } from '../game.js'
import { BALLOON_SPRITES, colorFor, BASKET_IMAGE } from '../assets.js'
import { pileMetrics } from '../pile.js'

const EXIT_RESULTS = new Set(['title', 'home', 'back'])

export async function runBalloonPlay(app, manifest) {
  ensureCuesStyle()   // Great!/Miss/Catch! 판정 글자 CSS — 이미 있으면 아무것도 안 한다
  ensureSysBarStyle() // 공통 게임 UI(햄버거·나가기·확인창) CSS
  const gameId = manifest.id
  const story = manifest.story ?? {}
  const record = makeRecorder({ gameId, motion: true, minActiveSec: 5 })

  const run = new BalloonFestivalRun()
  const tracker = trackHands()
  const handHits = { left: 0, right: 0 }
  let activeSec = 0
  // `paused`는 화면 전환(스토리·결과) 때문에 멈춘 것, `menuPaused`는 아이가
  // 메뉴·확인창을 연 것. 둘을 한 변수로 합치면 메뉴를 닫는 순간 스토리 중에도
  // 판이 다시 돌아 버린다.
  let raf = null, lastT = null, over = false, paused = true, menuPaused = false
  const els = new Map()          // sprite.id -> <img>
  const handEls = { left: null, right: null }
  let $ = () => null

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

        /* 트래커 — 손을 따라다니는 동그란 포인터. 이 게임에는 **하나만**
           뜬다(handTracker.js 참고). 그래서 왼손·오른손을 색으로 구분하던
           걸 없앴다 — 하나뿐이면 어느 손인지 알려 줄 이유가 없고, 색이
           바뀌면 오히려 "다른 게 떴나?"로 읽힌다. */
        .bf-hand { position: absolute; z-index: 3; width: 56px; height: 56px; border-radius: 50%;
          transform: translate(-50%, -50%); pointer-events: none;
          border: 4px solid var(--pz-gold, #ffd23e); background: rgba(255,210,62,0.18);
          box-shadow: 0 0 0 2px rgba(0,0,0,0.25), 0 0 14px rgba(255,210,62,0.5); }

        /* 바구니 — ken이 보낸 참고 그림(바구니 뒤로 큰 풍선이 한 줄로
           겹쳐 삐져나온 그림)을 그대로 목표로 삼는다. 4차 때 만든 판은
           풍선이 너무 작고 입구 안쪽에 얌전히 들어가 있어서 "담겼다"가
           아니라 "작은 아이콘이 얹혔다"로 보였다.

           바뀐 점 셋.
           ① 크기 — 풍선 하나가 바구니 높이의 62%다(전엔 24%). 참고
              그림처럼 바구니보다 위로 확실히 솟는다.
           ② 자리 — 줄의 밑동을 바구니 몸통 안쪽(bottom 26%)에 두어
              풍선 아래쪽이 바구니에 가린다. 그래야 "안에 담겨 있다"로
              보인다. 위로는 wrap 밖으로 넘치는데, absolute라 넘쳐도
              잘리지 않는다.
           ③ 겹침 정도를 JS가 정한다 — 한 줄 고정(ken: "위로 쌓이게
              하지마")이라 개수가 늘면 줄이 옆으로 길어질 수밖에 없다.
              고정 여백(-32%)으로는 몇 개만 담아도 바구니 밖으로 삐져
              나갔다. 개수를 보고 겹침을 조여서 줄 길이를 바구니 안에
              가둔다(아래 fitPile). CSS는 변수만 읽는다.

           새 풍선은 prepend()로 맨 앞에 넣는다(ken: "뒤로 추가해주면
           돼") — DOM 앞쪽이 먼저 칠해져서 뒤에 깔린다. */
        #bf-basket-wrap { position: absolute; left: 50%; bottom: clamp(6px, 1.5vh, 18px);
          transform: translateX(-50%); z-index: 4; width: clamp(220px, 34vw, 440px); }
        #bf-basket-wrap.off { display: none; }
        #bf-basket { position: relative; z-index: 2; display: block; width: 100%; height: auto;
          filter: drop-shadow(0 8px 16px rgba(0,0,0,0.45)); }
        #bf-basket-pile { position: absolute; z-index: 1; left: 0; right: 0; bottom: 26%;
          display: flex; flex-wrap: nowrap; align-items: flex-end; justify-content: center;
          pointer-events: none; }
        .bf-pile-item { width: var(--bf-item, 34%); height: auto; flex: none;
          filter: drop-shadow(0 3px 5px rgba(0,0,0,0.32)); }
        .bf-pile-item:not(:first-child) { margin-left: calc(-1 * var(--bf-overlap, 30%)); }

        /* HUD가 단계 배너·진단 표시보다 위여야 한다 — 시스템바의 종료
           확인창이 이 안에 들어 있어서, 아래로 깔리면 확인창 위로 배너가
           겹쳐 보인다. */
        #bf-hud { position: absolute; inset: 0; z-index: 8; pointer-events: none; }
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
        /* 목표(담은 개수 / 채워야 할 개수) — 6차에서 단계가 개수 목표로
           바뀌면서 **없으면 안 되는 정보**가 됐다. 몇 개 남았는지 모르면
           아이는 언제 끝나는지 모른 채 그냥 팔만 휘두른다. 점수 badge
           아래, 콤보와 같은 줄 위치를 나눠 쓴다. */
        .bf-badge.goal { top: clamp(10px, 2vh, 18px); left: 50%; transform: translateX(-50%);
          background: linear-gradient(180deg, #35c25a, #1f9640); color: #fff;
          border-color: rgba(255,255,255,0.45); display: none; }
        .bf-badge.goal.on { display: flex; }
        .bf-badge.goal .done { color: var(--pz-gold, #ffd23e); }
        /* 타이머는 시스템바(햄버거·나가기) 왼쪽에 선다 — 시스템바가
           오른쪽 위 자리를 쓰므로 그만큼 비켜 준다. */
        .bf-badge.timer { top: clamp(10px, 2vh, 18px); right: clamp(120px, 15vw, 210px); display: none; }
        .bf-badge.timer.on { display: flex; }
        /* 시간이 10초 밑으로 내려가면 빨강 대신 주황 — 경고색은 아이를
           굳게 만든다(cues.js의 Miss가 분홍인 것과 같은 이유). */
        .bf-badge.timer.hurry { background: linear-gradient(180deg, #ff9f43, #e8761a); color: #fff; }

        #bf-stage { position: absolute; top: clamp(64px, 12vh, 100px); left: 50%; transform: translateX(-50%);
          z-index: 5; text-align: center; font-weight: 900; font-size: clamp(1rem, 2.6vw, 1.6rem);
          color: var(--pz-gold, #ffd23e); text-shadow: 0 3px 10px rgba(0,0,0,0.5);
          opacity: 0; transition: opacity 0.4s; pointer-events: none; }
        #bf-stage.on { opacity: 1; }

        #bf-loading { position: absolute; inset: 0; z-index: 10; display: flex; align-items: center;
          justify-content: center; background: rgba(5,2,18,0.92); font-weight: 800; color: #cbb8ff; }

        /* 시간 초과 안내 — 결과 화면이 아니다. 잠깐 보여주고 스스로
           사라진다(버튼 없음): 글자를 못 읽는 아이가 버튼을 못 찾아
           멈춰 있으면 안 된다(gameShell의 엔딩과 같은 규칙). */
        .bf-timeup { position: absolute; inset: 0; z-index: 20; display: flex;
          align-items: center; justify-content: center; background: rgba(8,3,20,0.72);
          animation: bf-timeup-in 0.25s ease-out; }
        .bf-timeup-box { text-align: center; padding: clamp(20px, 4vh, 40px) clamp(24px, 5vw, 60px);
          background: linear-gradient(var(--pz-navy, #2a1a6e), var(--pz-navy-2, #1c1050));
          border: 4px solid var(--pz-gold, #ffd23e); border-radius: 28px;
          box-shadow: 0 12px 40px rgba(0,0,0,0.5); max-width: min(88vw, 560px); }
        .bf-timeup-box .big { margin: 0 0 10px; font-size: clamp(1.3rem, 3.4vw, 2rem);
          font-weight: 900; color: var(--pz-gold, #ffd23e); }
        .bf-timeup-box .sub { margin: 4px 0; font-size: clamp(0.9rem, 2vw, 1.15rem); font-weight: 800; }
        @keyframes bf-timeup-in { from { opacity: 0; transform: scale(0.94); } to { opacity: 1; transform: none; } }

        /* 진단용 — 손 감지 실측 주기. status:'wip'인 동안만 신경 쓰면 되는
           개발용 표시라 눈에 안 띄게 작고 흐리게 뒀다. */
        #bf-diag { position: absolute; left: clamp(10px, 2vw, 18px); bottom: clamp(6px, 1.5vh, 18px);
          z-index: 5; font-size: 11px; color: rgba(255,255,255,0.45); pointer-events: none; }
      </style>
      <div id="bf">
        <div id="bf-veil"></div>
        <div id="bf-sprites"></div>
        <div id="bf-basket-wrap" class="off">
          <img id="bf-basket" src="${BASKET_IMAGE}" alt="바구니">
          <div id="bf-basket-pile"></div>
        </div>
        <div id="bf-hud">
          <div class="bf-badge score">${icon('star')} <span id="bf-score">0</span></div>
          <div class="bf-badge combo" id="bf-combo">${icon('flame')} <span>0</span>콤보!</div>
          <div class="bf-badge goal" id="bf-goal"><span class="done">0</span>/<span class="need">0</span></div>
          <div class="bf-badge timer" id="bf-timer">${icon('timer')} <span>0초</span></div>
          ${/* 공통 게임 UI — 모양을 따로 짜지 않는다(CLAUDE.md "이것이 브랜드다").
                플레이 중이므로 Home 버튼은 없다(확인창 안에 있다). */
            sysBarMarkup({ home: false, exit: true })}
        </div>
        <div id="bf-stage"></div>
        <div id="pz-judge"></div>
        <div id="bf-diag"></div>
        <div id="bf-loading">카메라를 켜는 중...</div>
      </div>
    `
    const bf = app.querySelector('#bf')
    bf.prepend(tracker.video)
    $ = q => app.querySelector(q)
    els.clear()
    handEls.left = null; handEls.right = null

    // 시스템바는 화면을 다시 그릴 때마다(스토리 뒤 `mountUI()`) 새로 잇는다.
    // **판을 멈추는 것까지 공용 규칙이다** — 안 멈추면 아이가 메뉴를 보는
    // 동안 풍선이 계속 떠다니고 타이머가 줄어든다.
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
    return {
      left: mapHandPoint(tracker.hands.left, rect),
      right: mapHandPoint(tracker.hands.right, rect),
    }
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
  const smoother = makeHandSmoother()
  let lastHandSeq = -1

  function syncHands(hands) {
    for (const side of ['left', 'right']) {
      const p = hands[side]
      if (p) {
        let el = handEls[side]
        if (!el) {
          el = document.createElement('div')
          el.className = 'bf-hand'
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
  // 것인지, 아니면 다른 문제인지). 이 게임이 아직 `status: 'wip'`라
  // 실제 배포엔 안 보이니 지금은 남겨 둔다 — 튜닝이 끝나면 뗀다.
  let diagCount = 0, diagWindowStart = null, diagPrev = null
  function detectDiag(fresh, tSec) {
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

  let stageTimer = null
  function flashStage(name) {
    const el = $('#bf-stage')
    if (!el || !name) return
    el.textContent = name
    el.classList.add('on')
    clearTimeout(stageTimer)
    stageTimer = setTimeout(() => el.classList.remove('on'), 1800)
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
    flashStage(run.stage?.name ?? '')
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

  function frame() {
    raf = requestAnimationFrame(frame)
    if (paused || menuPaused || over) return
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
    $('#bf-basket-wrap').classList.toggle('off', run.part !== PART.CATCH)

    for (const ev of res.events) {
      // grab(붙잡기)은 손 움직임 지표(EXP)에 안 센다 — collect(바구니에
      // 넣기)·pop(터뜨리기)만 "완수된 동작"이다. grab까지 세면 풍선
      // 하나당 두 번(잡을 때+넣을 때) 카운트돼 운동량이 부풀려진다.
      if (ev.type !== 'grab') {
        if (ev.handKey === 'left') handHits.left++
        else if (ev.handKey === 'right') handHits.right++
      }
      const p = hands[ev.handKey]
      if (p) judgeFx(p.x, p.y, ev.type === 'grab' ? 'catch' : 'great')
      if (ev.type === 'collect') addToPile(ev.id)
    }

    $('#bf-score').textContent = run.score
    $('#bf-combo').classList.toggle('on', run.combo >= 2)
    if (run.combo >= 2) $('#bf-combo span').textContent = run.combo
    syncGoal()
    const timerEl = $('#bf-timer')
    const showTimer = run.stageTimeLeft != null
    timerEl.classList.toggle('on', showTimer)
    if (showTimer) {
      timerEl.querySelector('span').textContent = `${Math.ceil(run.stageTimeLeft)}초`
      timerEl.classList.toggle('hurry', run.stageTimeLeft <= 10)
    }

    if (res.stageCleared && !res.partDone) { flashStage(run.stage?.name ?? ''); clearPile() }

    // 시간 안에 목표를 못 채웠다 — "아쉽지만 다시 도전"(ken 4차 요청).
    if (res.timeUp) { paused = true; showTimeUp(); return }

    if (res.gameDone) {
      paused = true
      ;(async () => {
        await showEnding()
        if (over) return
        finish(true)
      })()
      return
    }
    if (res.partDone) { showTransition(); return }
  }

  /** 목표 뱃지 — "3/5". 목표가 없는 단계(테스트용)면 숨긴다. */
  function syncGoal() {
    const el = $('#bf-goal')
    if (!el) return
    const goal = run.quota
    el.classList.toggle('on', goal != null)
    if (goal == null) return
    el.querySelector('.done').textContent = Math.min(run.progress, goal)
    el.querySelector('.need').textContent = goal
  }

  /**
   * 시간 초과 — 실패지만 **혼내지 않는다.**
   *
   * 결과 화면(점수·배지)을 띄우지 않고 짧은 한마디만 보여준 뒤 게임
   * 인트로로 돌려보낸다(ken: "아쉽지만 다시 도전으로 가야해. 메시지
   * 띄우고 게임 인트로 화면으로 이동하게 해"). 읽을 것을 늘리면 다시
   * 하려는 아이가 그만큼 늦게 움직인다.
   */
  function showTimeUp() {
    if (over) return
    over = true
    cancelAnimationFrame(raf)
    record(summary())
    const el = document.createElement('div')
    el.className = 'bf-timeup'
    el.innerHTML = `
      <div class="bf-timeup-box">
        <p class="big">시간이 다 됐어요!</p>
        <p class="sub">${cheer(run)}</p>
        <p class="sub">다시 도전해 볼까요?</p>
      </div>`
    $('#bf').appendChild(el)
    setTimeout(() => { cleanup(); settle('again') }, 2600)
  }

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
    })
  }

  function cleanup() {
    cancelAnimationFrame(raf)
    clearTimeout(stageTimer)
    tracker.release()
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
  paused = false
  lastT = null
  flashStage(run.stage?.name ?? '')
  syncGoal()
  raf = requestAnimationFrame(frame)
  return result
}
