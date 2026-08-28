// 3D 러너의 앞 화면 둘 — **타이틀**과 **튜토리얼.**
//
// ── 왜 라우트가 아니라 플레이 안인가 ★ ──────────────────────
//
// `/intro?id=`·`/tutorial?id=` 라우트를 쓸 수도 있었다. 안 쓴 이유가 둘이다.
//
// ① **카메라를 두 번 켜게 된다.** 튜토리얼에서 몸을 움직여 보려면 카메라가
//    필요한데, 라우트가 갈리면 화면마다 열고 닫는다. 그러면 참조가 0이 되어
//    카메라가 껐다 켜지고 권한 표시등이 깜빡인다(`CLAUDE.md`의 카메라 규칙).
// ② **기존 러너 셋이 이미 그렇게 한다.** "러너는 자체 타이틀 화면이 인트로
//    역할을 한다"(`registry.js`) — 화면 하나를 더 두면 아이가 거치는 단계가 는다.
//
// ── 튜토리얼은 **몸으로 해봐야** 넘어간다 ────────────────────
//
// 읽고 넘어가는 설명은 4~8세에게 안 남는다. 동작을 실제로 한 번 하면 체크가
// 켜지고, 넷을 다 채워야 다음으로 간다. 못 하는 아이를 가두지 않으려고
// 건너뛰기를 늘 열어 둔다.

import { icon } from '../../core/icons.js'
import { UI } from '../../core/uiAssets.js'
import { CUE } from '../runner/ui/cues.js'
// ── 공통 UI는 **만들지 않고 받아 쓴다** ★ ──────────────────────
// 전에는 타이틀이 자기만의 메뉴(`#r3-menu-panel`)를 따로 그렸다. 모양 CSS는
// 공용 것(`#pz-menu-panel`)에 걸려 있어서 **닫히는 규칙이 안 붙었고**, 메뉴가
// 늘 펼쳐진 채로 화면 오른쪽에 아이콘 셋이 그대로 보였다(8/27).
// 한 벌만 두면 이런 어긋남이 생길 자리가 없다.
import { sysBarMarkup, ensureSysBarStyle, bindSysBar } from '../runner/ui/systemBar.js'
import { isBgmMuted, isSfxMuted, toggleBgmMute, toggleSfxMute } from '../runner/audio.js'
import { POSE_BUTTONS } from '../runner/ui/touchPad.js'

const STYLE_ID = 'pz-r3-screens-css'

const CSS = `
.r3s {
  position: fixed; inset: 0; z-index: 70; overflow: hidden;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: clamp(12px, 2.6vh, 26px); padding: clamp(14px, 3vh, 30px);
  font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
  text-align: center; touch-action: none; user-select: none;
}
.r3s-bg { position: absolute; inset: 0; z-index: 0; background-size: cover; background-position: center; }
/* 가운데 세로로 쌓이는 것들만 위로 올린다.
   **.r3s-corner는 빼야 한다** — position: relative가 절대 위치를 덮어서
   왼쪽 위에 둔 "게임 목록"이 화면 한가운데로 끌려왔다(8/26). */
.r3s > *:not(.r3s-bg):not(.r3s-corner) { position: relative; z-index: 1; }

/* 화면 모서리에 붙는 것 — 2.5D 타이틀과 같은 자리다. */
.r3s-corner {
  position: absolute; z-index: 3;
  top: clamp(10px, 2.5vh, 26px); left: clamp(10px, 2vw, 28px);
}
.r3s-corner-r { left: auto; right: clamp(10px, 2vw, 28px); }
/* 공통 UI(ui/systemBar.js)를 담는 자루. **자리를 잡지 않는다** — 안에 든
   것들이 각자 .r3s 기준으로 절대 위치를 쓴다. .r3s-corner를 같이 붙이는
   것은 위의 position: relative 규칙에서 빠지기 위해서다. */
.r3s-sys { position: static; top: auto; left: auto; }

/* 타이틀 — 배경 그림이 주인공이라 덮개를 얇게 둔다 */
#r3-title .r3s-bg { background-image: var(--bg); }
#r3-title .logo { width: min(56vw, 520px); height: auto; filter: drop-shadow(0 8px 20px rgba(0,0,0,.45)); }
#r3-title .start { width: clamp(160px, 26vw, 300px); height: auto; cursor: pointer;
                   filter: drop-shadow(0 6px 16px rgba(0,0,0,.45)); transition: transform .12s; }
#r3-title .start:active { transform: scale(.94); }
/* 왼쪽 위 Home 버튼은 공용이다 — 모양도 자리도 ui/systemBar.js가 갖는다.
   **플레이 중에는 안 보인다.** 거기서 바로 나가면 운동 기록을 저장하는 경로를
   건너뛴다 — 대신 나가기 → 확인창 안에 "Home으로"를 둔다. */

/* 튜토리얼 — 글을 읽어야 하므로 배경을 어둡게 덮는다 */
#r3-tut .r3s-bg { background-image: linear-gradient(rgba(10,4,28,.84), rgba(10,4,28,.9)), var(--bg); }
#r3-tut h1 { margin: 0; font-size: clamp(1.3rem, 3.4vw, 2.2rem); color: #ffd23e; letter-spacing: .06em; }
#r3-tut h2 { margin: 0; font-size: clamp(.95rem, 2vw, 1.3rem); font-weight: 700; opacity: .92; }
.r3s-note {
  margin: 0; padding: clamp(8px, 1.4vh, 14px) clamp(14px, 2.4vw, 26px);
  border: 2px solid #ffd23e; border-radius: 9999px;
  background: rgba(255,210,62,.10); color: #fff;
  font-size: clamp(.78rem, 1.4vw, 1rem); font-weight: 700;
  max-width: min(92vw, 900px);
}
.r3s-note b { color: #ffd23e; }
.r3s-row { display: flex; flex-wrap: wrap; justify-content: center; gap: clamp(10px, 2vw, 24px); }
.r3s-card {
  width: clamp(168px, 25vw, 320px); padding: clamp(12px, 2.2vh, 24px);
  border-radius: 24px; background: rgba(255,255,255,.10);
  border: 2px solid rgba(255,255,255,.18);
  display: flex; flex-direction: column; align-items: center; gap: clamp(6px, 1vh, 10px);
  transition: background .2s, border-color .2s, transform .2s;
}
/* 그림이 카드의 주인공이다 — 2.5D 튜토리얼처럼 크게 둔다.
   가로가 긴 관문과 세로가 긴 알이 섞여 있으므로 **높이로 맞추고 폭은 제한**한다.
   안 그러면 관문이 카드를 뚫고 나간다. */
.r3s-card img { height: clamp(96px, 19vh, 210px); width: auto; max-width: 100%; object-fit: contain; }
.r3s-card .k { font-size: clamp(1rem, 2vw, 1.35rem); font-weight: 900; }
.r3s-card .d { font-size: clamp(.82rem, 1.5vw, 1.05rem); opacity: .85; line-height: 1.35; }
.r3s-card .chk { font-size: clamp(1.2rem, 2.4vw, 1.7rem); height: 1.5em; color: #6ee75a; }
.r3s-card.done { background: rgba(110,231,90,.18); border-color: #6ee75a; transform: scale(1.03); }
/* 아래 버튼 줄 — 카메라 준비 화면의 [뒤로][키보드로 하기][시작]과 같은 모양이다.
   화면마다 버튼 생김새가 다르면 아이는 "여기서는 어디를 눌러야 하지"를 매번
   다시 본다. 가로로 두는 것은 여기뿐이다 — 셋이 아니라 둘이라 안 넘친다. */
.r3s-actions { display: flex; gap: clamp(10px, 1.8vw, 20px); justify-content: center; flex-wrap: wrap; }
.r3s-btn {
  min-height: 48px; padding: 0 clamp(18px, 3vw, 30px); border-radius: 9999px;
  border: 2px solid rgba(255,255,255,.3); background: rgba(255,255,255,.12); color: #fff;
  font: inherit; font-size: clamp(.9rem, 1.7vw, 1.1rem); font-weight: 900; cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  display: inline-flex; align-items: center; justify-content: center; gap: 8px;
}
.r3s-btn:active { transform: scale(.95); }
`

function ensureStyle() {
  // 메뉴 버튼 모양은 인게임 시스템 바와 **같은 것**을 쓴다
  ensureSysBarStyle()
  if (document.getElementById(STYLE_ID)) return
  const s = document.createElement('style')
  s.id = STYLE_ID
  s.textContent = CSS
  document.head.appendChild(s)
}

/** 화면 하나를 띄우고, 끝나면 지운다. */
function mount(app, id, html, bg) {
  ensureStyle()
  const el = document.createElement('div')
  el.className = 'r3s'
  el.id = id
  el.style.setProperty('--bg', `url("${bg}")`)
  el.innerHTML = `<div class="r3s-bg"></div>${html}`
  app.appendChild(el)
  return el
}

/**
 * 타이틀 — 게임의 얼굴.
 *
 * ── **결과를 돌려준다** ★★ ──────────────────────────────────
 *
 * 처음엔 START에서만 `resolve`하고 허브 버튼은 콜백(`onHub`)으로 빼 뒀다.
 * 그런데 허브를 누르면 화면만 지워지고 **약속이 영원히 안 풀렸다** —
 * 부르는 쪽은 `await`에서 멈춘 채로 빈 화면만 남았다. 화면이 비니 그 아래
 * `body` 배경(직전 게임의 것)이 드러나 "똥 피하기 배경이 나온다"로 보였다.
 *
 * `showReadyScreen`이 `mode`를 돌려주는 것과 같은 모양으로 맞췄다.
 * **화면을 떠나는 길이 둘이면 결과도 둘이어야 한다.**
 *
 * @returns {Promise<'start'|'hub'>}
 */
export function showTitle3d(app, manifest) {
  return new Promise(resolve => {
    const logo = manifest.logo
      ? `<img class="logo" src="${manifest.logo}" alt="${manifest.title}">`
      : `<h1 style="font-size:clamp(1.6rem,5vw,3rem)">${manifest.title}</h1>`
    // ── 배경은 **글자 없는 판**이다 ★ ──
    // `hero`는 허브 썸네일이라 그림에 게임 로고가 박혀 있다. 그걸 깔고 그 위에
    // 우리 로고를 또 얹으니 타이틀이 두 겹으로 겹쳐 보였다.
    // `titleBg`가 있으면 그것을, 없으면 `hero`로 물러난다.
    //
    // 나가기 버튼은 없다 — 아직 판이 없어 저장할 운동도 없고, 여기서 나가는
    // 길은 왼쪽 위 Home 하나면 된다.
    const el = mount(app, 'r3-title', `
      <div class="r3s-corner r3s-sys">${sysBarMarkup({ home: true, exit: false, ...mutes() })}</div>
      ${logo}
      <img class="start" id="r3-start" data-pz-hit data-pz-dwell="1200"
           src="${UI.startButton}" alt="시작">`, manifest.titleBg ?? manifest.hero)

    const abort = new AbortController()
    let settled = false
    const finish = result => {
      if (settled) return
      settled = true
      abort.abort()          // 화면이 사라지면 document·window에 건 것도 같이 뗀다
      el.remove()
      resolve(result)
    }

    bindSysBar(el, { ...soundHandlers(), onHome: () => finish('hub') }, abort.signal)

    const btn = el.querySelector('#r3-start')
    // 눌린 그림 — 4~8세는 "눌렀다"는 신호가 눈에 보여야 다시 누르지 않는다
    const down = () => { btn.src = UI.startButtonPressed }
    const up = () => { btn.src = UI.startButton }
    btn.addEventListener('pointerdown', down)
    btn.addEventListener('pointerup', up)
    btn.addEventListener('pointerleave', up)
    btn.addEventListener('click', () => finish('start'))
  })
}

/** 지금 음소거 상태 — 아이콘을 켜진 대로 그려야 아이가 헷갈리지 않는다. */
const mutes = () => ({ bgmMuted: isBgmMuted(), sfxMuted: isSfxMuted() })

/** 소리 버튼의 동작. 앞 화면 둘이 똑같이 쓴다. */
const soundHandlers = () => ({
  onToggleMusic: () => toggleBgmMute(),
  onToggleSfx: () => toggleSfxMute(),
})

/**
 * 튜토리얼 — **두 장이다.** 2.5D 러너와 같은 구성이다.
 *
 *   ① 몸을 움직여 보세요  — 옆으로 · 점프 · 앉기
 *   ② COPY THE POSE      — 런지 · 상체 숙이기 · 팔 벌리기
 *
 * 넷을 한 장에 몰아 봤는데 카드가 작아지고, 무엇보다 **성격이 다른 둘이
 * 섞였다.** 앞의 셋은 순간 동작이고 자세는 잠깐 유지하는 것이다 —
 * 아이에게는 다른 종류의 일이라 화면을 나누는 편이 읽힌다.
 *
 * 그림은 **판에서 만날 장애물**이다(`manifest.tutorialArt`). 없으면 인게임
 * 힌트 팻말로 물러난다(`ui/cues.js`) — 어느 쪽이든 판에서 보는 것과 같다.
 *
 * @param {object} o
 * @param {(cb: Function) => Function} o.subscribe
 *   동작이 감지되면 부를 함수를 받아 간다. 반환값은 구독 해제 함수.
 * @param {boolean} o.keyboard 키보드 모드면 키 안내를 같이 보여준다
 * @returns {Promise<'done'|'back'|'title'|'hub'>} 나가는 길마다 다른 결과 —
 *   `'back'`은 **바로 앞 화면**(카메라 준비)으로, `'title'`은 이 게임의 처음으로,
 *   `'hub'`는 플레이 제라 홈으로.
 */
export async function showTutorial3d(app, manifest, { subscribe, keyboard = false } = {}) {
  const art = manifest.tutorialArt ?? {}

  const page1 = () => tutorialPage(app, manifest, {
    subscribe, keyboard,
    title: '몸을 움직여 보세요!',
    // 카드 순서는 판에서 만나는 순서다 — 코스가 큐브 → 허들 → 자세로 흐른다.
    cards: [
      { id: 'side', img: art.side ?? CUE.right, k: '◀ 옆으로 피하기 ▶', d: '몸을 왼쪽/오른쪽으로 움직여요', key: '◀ ▶' },
      { id: 'jump', img: art.jump ?? CUE.up, k: '▲ 점프', d: '제자리에서 폴짝 뛰어요', key: '▲' },
      { id: 'duck', img: art.duck ?? CUE.down, k: '▼ 앉기', d: '무릎을 굽혀 웅크려요', key: '▼' },
    ],
  })

  const page2 = () => tutorialPage(app, manifest, {
    subscribe, keyboard,
    title: 'COPY THE POSE — 사인판의 자세를 따라해요',
    note: keyboard
      ? `${icon('keyboard')} 키보드 모드: <b>A</b> · <b>S</b> · <b>D</b> 키를 누르고 있으면 해당 자세를 취한 걸로 인식돼요`
      : null,
    cards: POSE_BUTTONS.map(p => ({
      id: p.pose,
      img: (manifest.poseArt ?? {})[p.pose] ?? CUE.pose,
      k: `${p.full}${keyboard ? ` (${p.key})` : ''}`,
      d: '1초 유지하면 성공!',
      key: p.key,
    })),
  })

  // ── "뒤로"는 **한 장씩** 간다 ★ ─────────────────────────────
  // 둘째 장에서 뒤로 누르면 첫 장, 첫 장에서 누르면 카메라 준비 화면이다.
  // 두 장을 한 번에 건너뛰면 자세만 어려운 아이가 카메라 화면까지 밀려난다.
  for (;;) {
    const a = await page1()
    if (a !== 'done') return a
    const b = await page2()
    if (b === 'back') continue        // 첫 장으로
    return b
  }
}

/**
 * 튜토리얼 한 장. 카드를 다 채우거나 건너뛰면 끝난다.
 *
 * ── 왼쪽 위 Home이 없다 ★ ──────────────────────────────────
 *
 * 앞뒤로 오가는 화면에 **한 번에 밖으로 나가는 문**까지 두면 셋이 된다
 * (뒤로 · 건너뛰기 · Home). 4~8세에게 고를 것이 셋이면 그중 하나는 잘못
 * 눌린다. 허브로 가는 길은 남아 있다 — 오른쪽 위 나가기 → 확인창의 "Home으로".
 *
 * 뒤로는 **아래 줄, 건너뛰기 옆**이다. 바로 앞 화면(카메라 준비)의 뒤로가
 * 거기 있어서, 두 화면을 오갈 때 손이 같은 자리를 찾는다.
 */
function tutorialPage(app, manifest, { cards, title, note = null, subscribe, keyboard }) {
  return new Promise(resolve => {
    const el = mount(app, 'r3-tut', `
      <div class="r3s-corner r3s-sys">${sysBarMarkup({ home: false, exit: true, ...mutes() })}</div>
      <h1>TUTORIAL</h1>
      <h2>${title}</h2>
      ${note ? `<p class="r3s-note">${note}</p>` : ''}
      <div class="r3s-row">
        ${cards.map(c => `
          <div class="r3s-card" id="r3-tc-${c.id}">
            <img src="${c.img}" alt="">
            <div class="k">${c.k}</div>
            <div class="d">${c.d}</div>
            <div class="chk"></div>
          </div>`).join('')}
      </div>
      <div class="r3s-actions">
        <button class="r3s-btn" id="r3-tut-back" data-pz-hit data-pz-dwell="1200">
          ${icon('back')} 뒤로
        </button>
        <button class="r3s-btn" id="r3-tut-skip" data-pz-hit data-pz-dwell="1200">
          ${icon('play')} 건너뛰기
        </button>
      </div>`, manifest.hero)

    const abort = new AbortController()
    let unsub = null
    let settled = false
    const finish = (result = 'done') => {
      if (settled) return
      settled = true
      abort.abort()
      unsub?.()
      el.remove()
      resolve(result)
    }

    // Home 버튼은 안 그렸지만 확인창의 "Home으로"는 살아 있다 —
    // 허브로 가는 길이 아예 막히면 안 된다.
    bindSysBar(el, {
      ...soundHandlers(),
      onHome: () => finish('hub'),
      onQuit: () => finish('title'),
    }, abort.signal)

    const ids = new Set(cards.map(c => c.id))
    const done = new Set()
    const check = kind => {
      // 좌우는 **하나로 친다.** 왼쪽만 되는 아이를 오른쪽까지 시켜 붙잡아 두면
      // 튜토리얼이 관문이 된다 — 여기서 볼 것은 "몸을 옆으로 옮길 줄 아나"다.
      const id = (kind === 'left' || kind === 'right') ? 'side' : kind
      if (!ids.has(id) || done.has(id)) return
      done.add(id)
      const card = el.querySelector(`#r3-tc-${id}`)
      if (card) {
        card.classList.add('done')
        card.querySelector('.chk').innerHTML = icon('check')
      }
      if (done.size >= cards.length) setTimeout(finish, 700)
    }

    unsub = subscribe?.(check) ?? null
    // `finish`를 그대로 넘기면 클릭 이벤트가 결과 자리로 들어간다 — 감싼다
    el.querySelector('#r3-tut-skip').addEventListener('click', () => finish('done'))
    el.querySelector('#r3-tut-back').addEventListener('click', () => finish('back'))
  })
}
