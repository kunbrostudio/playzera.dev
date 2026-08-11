// 보상 표시 — 새로 딴 배지와 오른 레벨.
//
// **여기가 보상이 도착하는 자리다.** 방금 몸을 움직인 직후라 감정이 열려 있다.
// 나중에 마이페이지에서 확인하는 것과는 무게가 다르다.
//
// 게임팩이 아니라 core에 둔 이유 — 웜업도 같은 걸 쓴다. 게임마다 축하가 다르면
// 아이가 매번 새로 배워야 한다.

import { getBadge, badgeIcon } from './badges.js'
import { levelFromTotals, levelHint } from './level.js'
import { getProgress } from './state.js'

let styleEl = null

function ensureStyle() {
  if (styleEl?.isConnected) return
  styleEl = document.createElement('style')
  styleEl.id = 'pz-reward-style'
  styleEl.textContent = `
    .pz-reward { display: flex; flex-direction: column; align-items: center; gap: 10px; width: 100%; }

    /* 새 배지 — 점수보다 **위에** 온다 */
    .pz-reward-badges { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
    .pz-badge-pop {
      display: flex; flex-direction: column; align-items: center; gap: 2px;
      width: clamp(72px, 12vw, 104px);
      animation: pzBadgePop 0.5s cubic-bezier(.2,1.4,.4,1) both;
    }
    .pz-badge-pop img { width: 100%; aspect-ratio: 1; object-fit: contain; }
    .pz-badge-pop .n {
      font-size: clamp(0.66rem, 1.2vw, 0.8rem); font-weight: 900;
      color: #7c3aed; text-align: center; line-height: 1.2;
    }
    @keyframes pzBadgePop {
      0%   { opacity: 0; transform: scale(0.3) rotate(-14deg); }
      100% { opacity: 1; transform: scale(1) rotate(0); }
    }
    .pz-reward-title {
      font-size: clamp(0.9rem, 1.7vw, 1.1rem); font-weight: 900; color: #c026d3;
    }

    /* 레벨 게이지 — 방금 한 운동이 눈에 보이게 차오른다 */
    .pz-reward-lv { display: flex; align-items: center; gap: 10px; width: min(100%, 320px); }
    .pz-reward-lv .lv {
      font-size: clamp(0.9rem, 1.6vw, 1.1rem); font-weight: 900; color: #7c3aed; white-space: nowrap;
    }
    .pz-reward-bar {
      flex: 1; height: 12px; border-radius: 999px; overflow: hidden;
      background: rgba(124,58,237,0.18);
    }
    /* 0에서 차오르는 걸 **CSS가 한다.**
       rAF로 다음 프레임에 값을 넣는 방식은 탭이 뒤에 있으면 콜백이 안 돌아
       게이지가 빈 채로 남았다(실제로 그랬다).
       그렇다고 키프레임 안에서 width: var(--to)를 쓰면 그것도 안 먹는다 —
       최종 폭은 인라인으로 박고, **차오르는 건 scaleX로** 한다. transform은 확실하다. */
    .pz-reward-fill {
      height: 100%; border-radius: 999px;
      background: linear-gradient(90deg, #ffd23e, #ff8a3d);
      transform-origin: left center;
      animation: pzFill 0.9s cubic-bezier(.2,.8,.3,1) both;
    }
    @keyframes pzFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .pz-reward-hint { font-size: clamp(0.76rem, 1.3vw, 0.92rem); font-weight: 800; color: #a78bda; }
    .pz-reward-up {
      font-size: clamp(1rem, 2vw, 1.3rem); font-weight: 900; color: #f59e0b;
      animation: pzBadgePop 0.5s cubic-bezier(.2,1.4,.4,1) both;
    }

    /* 움직임을 줄여 달라고 한 사람에게는 결과만 보여준다.
       애니메이션을 지우면 transform이 none이 되어 게이지가 제 폭으로 선다 —
       **보상 자체는 사라지지 않는다.** */
    @media (prefers-reduced-motion: reduce) {
      .pz-reward-fill, .pz-badge-pop, .pz-reward-up { animation: none; }
    }
  `
  document.head.appendChild(styleEl)
}

/**
 * 결과 화면 안에 보상을 그린다.
 *
 * @param {HTMLElement} host  그려 넣을 자리
 * @param {object} reward     recordSession()이 돌려준 것
 */
export function mountReward(host, reward) {
  if (!host) return
  ensureStyle()

  const lv = levelFromTotals(getProgress().totals)
  const badges = (reward?.newBadges ?? []).map(getBadge).filter(Boolean)

  host.innerHTML = `
    <div class="pz-reward">
      ${badges.length ? `
        <div class="pz-reward-title">⭐ 새 배지!</div>
        <div class="pz-reward-badges">
          ${badges.map((b, i) => `
            <div class="pz-badge-pop" style="animation-delay:${i * 0.12}s">
              <img src="${badgeIcon(b.id)}" alt="" onerror="this.style.visibility='hidden'" />
              <div class="n">${b.name}</div>
            </div>`).join('')}
        </div>` : ''}

      ${reward?.leveledUp ? `<div class="pz-reward-up">🎉 레벨 ${reward.to}이 됐어요!</div>` : ''}

      <div class="pz-reward-lv">
        <span class="lv">LV.${lv.level}</span>
        <div class="pz-reward-bar">
          <div class="pz-reward-fill" style="width:${Math.round(lv.ratio * 100)}%"></div>
        </div>
      </div>
      <div class="pz-reward-hint">${levelHint(lv.ratio)}</div>
    </div>
  `
}

// 보상이 아무것도 없으면 굳이 자리를 차지하지 않는다.
// 매번 팡파레를 울리면 아무것도 특별하지 않다.
export const hasReward = reward =>
  !!(reward && ((reward.newBadges?.length ?? 0) > 0 || reward.leveledUp))
