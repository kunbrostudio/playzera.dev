// 첫 실행 — 프로필 고르기 → 알 고르기.
//
// **세 걸음을 넘지 않는다.** 놀기 전에 넘어야 할 벽이 길면 그전에 그만둔다.
// 이름도 나이도 묻지 않는다 — 4~8세에게 키보드는 벽이다.
// 이름은 부모가 마이페이지에서 고쳐준다.
//
// 손 제스처로도 고를 수 있어야 한다. 카드가 크고, 서로 **가로로** 떨어져 있다.

import { navigate, onLeave } from '../core/router.js'
import { handSession } from '../core/handSession.js'
import { bindHandButton } from '../core/handControl.js'
import { BUDDIES, buddyImage } from '../buddies/registry.js'
import { PROFILES, profileImage } from '../profiles/registry.js'
import { startWith, hasStarted } from '../progress/state.js'

export function startPage(app) {
  let step = 0            // 0 프로필 · 1 알 · 2 확인
  let profile = null
  let buddyId = null

  app.innerHTML = `
    <style>
      #st, #st * { box-sizing: border-box; }
      #st {
        position: fixed; inset: 0; overflow: hidden;
        display: flex; flex-direction: column; align-items: center; justify-content: center;
        gap: clamp(16px, 3.5vh, 40px);
        padding: clamp(14px, 3vh, 32px);
        padding-bottom: max(clamp(14px, 3vh, 32px), env(safe-area-inset-bottom));
        font-family: var(--font-main, 'Jua', sans-serif); color: #fff;
        background: linear-gradient(180deg, #2b1b52 0%, #150a2e 100%);
        touch-action: none; user-select: none;
      }
      #st-q {
        font-size: clamp(1.3rem, 3.4vw, 2.4rem); font-weight: 900; text-align: center;
        text-shadow: 0 3px 16px rgba(0,0,0,0.5);
      }
      #st-sub { font-size: clamp(0.9rem, 1.8vw, 1.2rem); font-weight: 800; color: #ffd23e; }

      /* 고르는 카드 — 손 커서로 겨눌 수 있게 크고, 서로 가로로 떨어져 있다 */
      #st-choices { display: flex; align-items: stretch; justify-content: center; gap: clamp(12px, 2.4vw, 28px); flex-wrap: wrap; }
      .st-card {
        display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
        gap: 10px; padding: clamp(12px, 2vh, 20px);
        width: clamp(130px, 21vw, 210px); min-height: clamp(160px, 28vh, 260px);
        background: rgba(255,255,255,0.08);
        border: 3px solid rgba(255,255,255,0.16); border-radius: 26px;
        color: #fff; font: inherit; cursor: pointer;
        -webkit-tap-highlight-color: transparent;
        transition: transform 0.14s, background 0.14s, border-color 0.14s;
      }
      .st-card:hover { background: rgba(255,255,255,0.16); transform: translateY(-4px); }
      .st-card.on {
        border-color: #ffd23e; background: rgba(255,210,62,0.18);
        box-shadow: 0 0 0 4px rgba(255,210,62,0.25), 0 12px 34px rgba(0,0,0,0.45);
      }
      /* 높이를 못 박는다.
         flex:1 만 주면 그림의 원본 크기(490×512)가 그대로 밀고 들어와
         **카드 밖으로 넘친다.** flex 자식은 기본이 min-height:auto라 안 줄어든다.
         (주석 안에 백틱을 쓰면 이 템플릿 리터럴이 거기서 끊긴다 — 실제로 겪었다) */
      .st-art {
        flex: 1 1 auto; min-height: 0; width: 100%; overflow: hidden;
        height: clamp(88px, 15vh, 150px);
        display: flex; align-items: center; justify-content: center;
        font-size: clamp(3rem, 7vw, 5rem); line-height: 1;
      }
      /* 그림과 이모지는 **겹쳐 둔다.** 나란히 두면 둘 다 보일 때 자리를 나눠 갖는다. */
      .st-art { position: relative; }
      .st-art img, .st-art .st-fb {
        position: absolute; inset: 0;
        display: flex; align-items: center; justify-content: center;
      }
      .st-art img { width: 100%; height: 100%; object-fit: contain; }
      .st-name { font-size: clamp(0.95rem, 1.8vw, 1.25rem); font-weight: 900; }
      .st-tag { font-size: clamp(0.75rem, 1.4vw, 0.95rem); opacity: 0.6; }

      #st-foot { display: flex; align-items: center; gap: 14px; min-height: 62px; }
      .st-btn {
        min-height: 60px; padding: 0 clamp(22px, 3.4vw, 40px);
        border-radius: 9999px; border: none; font: inherit;
        font-size: clamp(1rem, 1.9vw, 1.3rem); font-weight: 900;
        cursor: pointer; -webkit-tap-highlight-color: transparent; transition: transform 0.12s;
      }
      .st-btn:active { transform: scale(0.95); }
      #st-next {
        background: #ffd23e; color: #4a2a00;
        box-shadow: 0 5px 0 #c89800, 0 10px 26px rgba(0,0,0,0.4);
      }
      #st-next:disabled { opacity: 0.35; box-shadow: none; cursor: default; }
      #st-back { background: rgba(255,255,255,0.12); color: #fff; border: 2px solid rgba(255,255,255,0.28); }
      #st-back.hide { visibility: hidden; }

      #st-hand {
        position: fixed; top: clamp(12px, 2vw, 24px); right: clamp(12px, 2vw, 24px); z-index: 100;
        min-height: 52px; padding: 0 18px; border-radius: 9999px;
        display: inline-flex; align-items: center; gap: 8px;
        background: rgba(255,255,255,0.12); color: #fff;
        border: 2px solid rgba(255,255,255,0.28); font: inherit; font-weight: 800; cursor: pointer;
      }
      #st-hand[aria-pressed="true"] { background: #ffd23e; color: #4a2a00; border-color: transparent; }
      #st-toast {
        position: fixed; left: 50%; top: 14px; transform: translateX(-50%); z-index: 120;
        padding: 10px 20px; border-radius: 9999px; background: rgba(10,6,22,0.9);
        font-weight: 700; opacity: 0; pointer-events: none; transition: opacity 0.2s;
      }
      #st-toast.on { opacity: 1; }

      @media (max-width: 620px) {
        #st-hand span { display: none; }
        #st-hand { padding: 0; width: 46px; justify-content: center; }
      }
    </style>

    <div id="st">
      <div id="st-q"></div>
      <div id="st-sub"></div>
      <div id="st-choices"></div>
      <div id="st-foot">
        <button class="st-btn" id="st-back" data-pz-hit data-pz-dwell="900">← 뒤로</button>
        <button class="st-btn" id="st-next" data-pz-hit data-pz-dwell="1200" disabled>다음</button>
      </div>
      <button id="st-hand" data-pz-hit data-pz-dwell="900">✋ <span id="st-hand-label">손 컨트롤 모드</span></button>
      <div id="st-toast"></div>
    </div>
  `

  const $ = s => app.querySelector(s)
  const qEl = $('#st-q'), subEl = $('#st-sub'), choicesEl = $('#st-choices')
  const nextBtn = $('#st-next'), backBtn = $('#st-back')

  handSession.setPointerActive(true)

  const toastEl = $('#st-toast')
  let toastTimer = null
  const toast = m => {
    toastEl.textContent = m
    toastEl.classList.add('on')
    clearTimeout(toastTimer)
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 2600)
  }
  const unbindHand = bindHandButton({ el: $('#st-hand'), labelEl: $('#st-hand-label'), onToast: toast })

  // 그림이 아직 없을 수 있다. **없다고 빈 칸이 되면 안 된다** — 이모지가 뒤를 받친다.
  //
  // 둘을 겹쳐두고 **먼저 나온 쪽만 남긴다.**
  //   그림이 뜨면  → 이모지를 지운다
  //   그림이 없으면 → 그림을 지우고 이모지가 남는다
  // (처음엔 실패할 때만 지웠더니 그림과 이모지가 나란히 보였다)
  const art = (src, fallback) => `
    <div class="st-art">
      <span class="st-fb">${fallback}</span>
      <img src="${src}" alt=""
           onload="this.previousElementSibling?.remove()"
           onerror="this.remove()" />
    </div>`

  function render() {
    if (step === 0) {
      qEl.textContent = '누가 놀 거예요?'
      subEl.textContent = ''
      choicesEl.innerHTML = PROFILES.map(p => `
        <button class="st-card ${profile === p.id ? 'on' : ''}" data-pick="${p.id}"
                data-pz-hit data-pz-dwell="1200">
          ${art(profileImage(p.id), p.emoji)}
          <div class="st-name">${p.label}</div>
        </button>`).join('')
      nextBtn.textContent = '다음'
      nextBtn.disabled = !profile
      backBtn.classList.add('hide')
    } else if (step === 1) {
      qEl.textContent = '친구를 골라요!'
      subEl.textContent = '함께 놀면 알이 깨져요'
      choicesEl.innerHTML = BUDDIES.map(b => {
        const egg = b.stages[0]
        return `
        <button class="st-card ${buddyId === b.id ? 'on' : ''}" data-pick="${b.id}"
                data-pz-hit data-pz-dwell="1200">
          ${art(buddyImage(b.id, egg.image), '🥚')}
          <div class="st-name">${b.name}</div>
          <div class="st-tag">${b.species}</div>
        </button>`
      }).join('')
      nextBtn.textContent = '시작하기'
      nextBtn.disabled = !buddyId
      backBtn.classList.remove('hide')
    }

    // 카드는 어디서 골라도 같은 동작이다 (마우스 · 손 머무르기 둘 다)
    choicesEl.querySelectorAll('.st-card').forEach(card => {
      const pick = () => {
        if (step === 0) profile = card.dataset.pick
        else            buddyId = card.dataset.pick
        render()
      }
      card.addEventListener('click', pick)
      card.addEventListener('pz-dwell', e => { e.preventDefault(); pick() })
    })
  }

  nextBtn.addEventListener('click', () => {
    if (nextBtn.disabled) return
    if (step === 0) { step = 1; render(); return }
    // 알까지 골랐다 — 저장하고 허브로
    startWith({ profile, buddyId })
    navigate('/')
  })

  backBtn.addEventListener('click', () => { if (step > 0) { step--; render() } })

  render()
  onLeave(() => { unbindHand(); clearTimeout(toastTimer) })
}

// 허브가 첫 방문인지 물어볼 때 쓴다
export { hasStarted }
