// /buddy — 내 친구. **아이 화면이다.**
//
// docs/06 §4. 목업의 "나의 파트너" 카드를 한 화면 전체로 키운 것.
//
// 부모 화면(/me)과 규칙이 반대다.
//   글자를 줄인다        4~8세는 못 읽는다. 별·게이지·그림으로 말한다
//   숫자를 앞세우지 않는다 레벨은 별로도 보여준다
//   버튼은 둘            세 개를 넘기면 고르는 게 일이 된다
//   손 커서로 다 된다     data-pz-hit이 붙지 않은 조작은 여기 없어야 한다
//
// 쌓인 걸 확인하는 자리이지 보상이 도착하는 자리가 아니다. 축하는 게임 결과에서
// 이미 했다(progress/rewardView.js). 여기는 **다시 보러 오는 곳**이다.

import { navigate, onLeave } from '../core/router.js'
import { handSession } from '../core/handSession.js'
import { bindHandButton } from '../core/handControl.js'
import { getBuddy, buddyImage, unlockedStages, currentStage } from '../buddies/registry.js'
import { mountBuddy } from '../progress/buddyView.js'
import { BADGES, badgeIcon } from '../progress/badges.js'
import { levelFromTotals } from '../progress/level.js'
import { getProgress, markBuddySeen, wearStage, hasStarted } from '../progress/state.js'

export function buddyPage(app) {
  // 아직 알을 안 골랐으면 여기 볼 게 없다
  if (!hasStarted()) { navigate('/start'); return }

  const s = getProgress()
  const buddy = getBuddy(s.buddyId)
  const lv = levelFromTotals(s.totals)
  const open = unlockedStages(s.buddyId, lv.level)
  let stage = currentStage(s.buddyId, lv.level, s.buddyStage)

  // 들어온 순간 "봤다"로 친다. 허브의 빨간 점이 꺼진다.
  markBuddySeen()

  app.innerHTML = `
    <style>
      #bd, #bd * { box-sizing: border-box; }
      #bd {
        position: fixed; inset: 0; overflow: hidden;
        display: flex; flex-direction: column; align-items: center;
        gap: clamp(8px, 1.6vh, 18px);
        padding: clamp(12px, 2.4vh, 26px);
        padding-top: max(clamp(12px, 2.4vh, 26px), env(safe-area-inset-top));
        padding-bottom: max(clamp(12px, 2.4vh, 26px), env(safe-area-inset-bottom));
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        background: radial-gradient(120% 90% at 50% 12%, #3a2469 0%, #2b1b52 45%, #150a2e 100%);
        touch-action: none; user-select: none;
      }

      /* ── 머리 ── */
      #bd-top {
        width: 100%; display: flex; align-items: center; justify-content: space-between;
        gap: 10px; flex: none;
      }
      .bd-btn {
        display: inline-flex; align-items: center; gap: 8px;
        min-height: 52px; padding: 0 clamp(14px, 1.8vw, 20px);
        background: rgba(255,255,255,0.12); color: #fff;
        border: 2px solid rgba(255,255,255,0.26); border-radius: 9999px;
        font: inherit; font-weight: 800; font-size: clamp(0.85rem, 1.4vw, 1rem);
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        transition: background 0.12s, border-color 0.12s, transform 0.12s;
        white-space: nowrap;
      }
      .bd-btn:hover { background: rgba(255,255,255,0.2); border-color: #ffd23e; }
      .bd-btn:active { transform: scale(0.95); }
      #bd-hand[aria-pressed="true"] { background: #ffd23e; color: #4a2a00; border-color: transparent; }

      /* 버디 그림·별·게이지는 progress/buddyView.js가 그린다 (/me와 같은 것을 쓴다) */
      #bd-view { flex: 1 1 auto; min-height: 0; width: min(560px, 92vw); display: flex; }
      #bd-view .pz-bd { --pz-bd-min: 160px; }

      /* ── 버튼 둘 ── */
      #bd-foot { flex: none; display: flex; gap: clamp(10px, 2vw, 20px); }
      .bd-big {
        min-height: 62px; padding: 0 clamp(20px, 3.2vw, 38px);
        border-radius: 9999px; border: none; font: inherit;
        font-size: clamp(0.95rem, 1.8vw, 1.25rem); font-weight: 900;
        cursor: pointer; -webkit-tap-highlight-color: transparent;
        background: #ffd23e; color: #4a2a00;
        box-shadow: 0 5px 0 #c89800, 0 10px 26px rgba(0,0,0,0.4);
        transition: transform 0.12s;
      }
      .bd-big.alt { background: rgba(255,255,255,0.14); color: #fff; box-shadow: none; border: 2px solid rgba(255,255,255,0.28); }
      .bd-big:active { transform: translateY(3px); }

      /* ── 겹쳐 뜨는 판 (배지 · 꾸미기) ── */
      #bd-sheet {
        position: fixed; inset: 0; z-index: 60; display: none;
        /* 뒤가 비치면 배지 그림과 버디가 겹쳐 보여 둘 다 안 읽힌다.
           반쯤 비치는 판은 예뻐 보이지만 **보러 온 것을 가린다.** */
        background: rgba(10,6,22,0.97); backdrop-filter: blur(6px);
        padding: clamp(12px, 2.4vh, 26px);
        padding-bottom: max(clamp(12px, 2.4vh, 26px), env(safe-area-inset-bottom));
        flex-direction: column; gap: 12px;
      }
      #bd-sheet.on { display: flex; }
      #bd-sheet-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex: none; }
      #bd-sheet-title { font-size: clamp(1.1rem, 2.4vw, 1.6rem); font-weight: 900; }
      #bd-sheet-body {
        flex: 1 1 auto; min-height: 0; overflow-y: auto; -webkit-overflow-scrolling: touch;
        /* **격자가 아니라 줄바꿈이다.**
           grid의 auto-fill은 내용이 없어도 빈 칸을 만들어 폭을 다 채운다.
           그래서 4칸짜리 꾸미기가 넓은 화면 왼쪽 구석에 몰렸다(justify-content로도
           안 고쳐진다 — 트랙이 이미 폭을 다 먹었기 때문). flex는 있는 것만 세고
           가운데로 모은다. 배지 14개도 같은 규칙으로 줄바꿈된다. */
        display: flex; flex-wrap: wrap; align-content: flex-start; justify-content: center;
        gap: clamp(10px, 1.6vw, 18px); padding: 4px;
      }
      #bd-sheet-body > * { flex: 0 0 clamp(96px, 11vw, 132px); }

      .bd-badge { display: flex; flex-direction: column; align-items: center; gap: 4px; text-align: center; }
      .bd-badge img { width: 100%; aspect-ratio: 1; object-fit: contain; }
      .bd-badge .n { font-size: clamp(0.72rem, 1.2vw, 0.88rem); font-weight: 900; line-height: 1.25; }
      /* 못 딴 배지도 **보여준다.** "저건 어떻게 따지?"가 다음에 또 오는 이유가 된다.
         지우면 아이는 남은 게 있는 줄도 모른다. */
      .bd-badge.locked img { filter: grayscale(1) brightness(0.35); opacity: 0.55; }
      .bd-badge.locked .n { opacity: 0.45; }

      .bd-stage {
        display: flex; flex-direction: column; align-items: center; gap: 6px;
        padding: 10px; border-radius: 20px; font: inherit; color: #fff;
        background: rgba(255,255,255,0.08); border: 3px solid rgba(255,255,255,0.16);
        cursor: pointer; -webkit-tap-highlight-color: transparent;
      }
      .bd-stage.on { border-color: #ffd23e; background: rgba(255,210,62,0.18); }
      .bd-stage.locked { opacity: 0.4; cursor: default; }
      .bd-stage img { width: 100%; aspect-ratio: 1; object-fit: contain; }
      .bd-stage.locked img { filter: grayscale(1) brightness(0.4); }
      .bd-stage .n { font-size: clamp(0.75rem, 1.3vw, 0.92rem); font-weight: 900; }
      #bd-sheet-note {
        flex: none; text-align: center; font-size: clamp(0.78rem, 1.3vw, 0.95rem);
        font-weight: 700; color: #a78bda;
      }

      /* 세로가 짧은 가로 폰 — 그림이 먼저 줄고, 그다음 여백이 준다 */
      @media (max-height: 520px) {
        #bd { gap: 6px; }
        #bd-view .pz-bd { --pz-bd-min: 90px; --pz-bd-name: 1.1rem; }
        #bd-view .pz-bd-hint { display: none; }
        .bd-big { min-height: 54px; }
      }
      @media (max-width: 620px) {
        #bd-hand span { display: none; }
        #bd-hand { padding: 0; width: 46px; justify-content: center; }
      }
      #bd-toast {
        position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 120;
        padding: 10px 20px; border-radius: 9999px; background: rgba(10,6,22,0.92);
        font-weight: 700; opacity: 0; pointer-events: none; transition: opacity 0.2s;
      }
      #bd-toast.on { opacity: 1; }

    </style>

    <div id="bd">
      <div id="bd-top">
        <button class="bd-btn" id="bd-back" data-pz-hit data-pz-dwell="900">← 뒤로</button>
        <button class="bd-btn" id="bd-hand" data-pz-hit data-pz-dwell="900">✋ <span id="bd-hand-label">손 컨트롤 모드</span></button>
      </div>

      <div id="bd-view"></div>

      <div id="bd-foot">
        <button class="bd-big" id="bd-badges" data-pz-hit data-pz-dwell="1100">🏅 내 배지</button>
        <button class="bd-big alt" id="bd-dress" data-pz-hit data-pz-dwell="1100">👕 꾸미기</button>
      </div>
    </div>

    <div id="bd-sheet">
      <div id="bd-sheet-head">
        <div id="bd-sheet-title"></div>
        <button class="bd-btn" id="bd-sheet-close" data-pz-hit data-pz-dwell="900">✕ 닫기</button>
      </div>
      <div id="bd-sheet-body"></div>
      <div id="bd-sheet-note"></div>
    </div>

    <div id="bd-toast"></div>
  `

  const $ = q => app.querySelector(q)
  handSession.setPointerActive(true)

  // 카메라가 안 열릴 수 있다. 왜 안 되는지 말해주지 않으면 아이는 버튼만 계속 누른다.
  const toastEl = $('#bd-toast')
  let toastTimer = null
  const toast = m => {
    toastEl.textContent = m
    toastEl.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600)
  }
  const unbindHand = bindHandButton({ el: $('#bd-hand'), labelEl: $('#bd-hand-label'), onToast: toast })

  // 버디는 /me와 **같은 조각**으로 그린다. 화면마다 다르게 보이면 같은 친구가 아니다.
  const drawBuddy = () => mountBuddy($('#bd-view'), { stageId: stage?.id ?? null })
  drawBuddy()

  // ── 겹쳐 뜨는 판 ────────────────────────────────────────────
  const sheet = $('#bd-sheet')
  const closeSheet = () => sheet.classList.remove('on')

  function openBadges() {
    $('#bd-sheet-title').textContent = '🏅 내 배지'
    const owned = new Set(s.badges)
    // 딴 것을 앞에 세운다. 아래로 내려갈수록 "아직 남은 것"이다.
    const sorted = [...BADGES].sort((a, b) => (owned.has(b.id) ? 1 : 0) - (owned.has(a.id) ? 1 : 0))
    $('#bd-sheet-body').innerHTML = sorted.map(b => `
      <div class="bd-badge ${owned.has(b.id) ? '' : 'locked'}">
        <img src="${badgeIcon(b.id)}" alt="" onerror="this.style.visibility='hidden'" />
        <div class="n">${b.name}</div>
      </div>`).join('')
    $('#bd-sheet-note').textContent = `${owned.size} / ${BADGES.length}`
    sheet.classList.add('on')
  }

  function openDress() {
    $('#bd-sheet-title').textContent = '👕 꾸미기'
    const openIds = new Set(open.map(x => x.id))
    // 형태는 **옷이지 운명이 아니다**(docs/05 §2). 열린 것은 언제든 다시 입는다 —
    // 알 모습 그대로 레벨 40이 될 수 있어야 한다.
    $('#bd-sheet-body').innerHTML = (buddy?.stages ?? []).map(st => {
      const unlocked = openIds.has(st.id)
      return `
        <button class="bd-stage ${unlocked ? '' : 'locked'} ${stage?.id === st.id ? 'on' : ''}"
                data-stage="${st.id}" ${unlocked ? 'data-pz-hit data-pz-dwell="1100"' : 'disabled'}>
          <img src="${buddyImage(s.buddyId, st.image)}" alt="" onerror="this.style.visibility='hidden'" />
          <div class="n">${unlocked ? st.label : '🔒'}</div>
        </button>`
    }).join('')
    $('#bd-sheet-note').textContent = '아이템 꾸미기는 곧 나와요'

    $('#bd-sheet-body').querySelectorAll('.bd-stage:not(.locked)').forEach(btn => {
      const pick = () => {
        const id = btn.dataset.stage
        wearStage(id)
        stage = buddy.stages.find(x => x.id === id) ?? stage
        drawBuddy()
        openDress()          // 고른 표시를 갱신한다
      }
      btn.addEventListener('click', pick)
      btn.addEventListener('pz-dwell', e => { e.preventDefault(); pick() })
    })
    sheet.classList.add('on')
  }

  // 마우스와 손 머무르기는 **같은 동작**이어야 한다. 한쪽만 되면 아이가 배운 게 안 통한다.
  const on = (sel, fn) => {
    const el = $(sel)
    el.addEventListener('click', fn)
    el.addEventListener('pz-dwell', e => { e.preventDefault(); fn() })
  }
  on('#bd-back', () => navigate('/'))
  on('#bd-badges', openBadges)
  on('#bd-dress', openDress)
  on('#bd-sheet-close', closeSheet)

  const onKey = e => { if (e.key === 'Escape') sheet.classList.contains('on') ? closeSheet() : navigate('/') }
  window.addEventListener('keydown', onKey)

  onLeave(() => {
    window.removeEventListener('keydown', onKey)
    unbindHand()
    clearTimeout(toastTimer)
  })
}
