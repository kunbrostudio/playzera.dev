// 버디를 크게 보여주는 조각 — `/buddy`(아이 화면)와 `/me`(부모 화면)가 **같이 쓴다.**
//
// 같은 친구가 화면마다 다르게 보이면 아이에게는 같은 친구가 아니다.
// 숨 쉬는 속도, 발밑 그림자, 별의 개수까지 한 곳에서 정한다.
//
// rewardView.js와 같은 방식이다 — 스타일은 한 번만 붙이고, 그리는 함수 하나를 내보낸다.

import { getBuddy, buddyImage, unlockedStages, currentStage } from '../buddies/registry.js'
import { levelFromTotals, levelHint } from './level.js'
import { getProgress } from './state.js'

// 별은 **레벨이 아니라 열린 단계 수**다.
// 레벨은 50까지 간다 — 별 50개는 셀 수도 없고 화면에도 안 들어간다.
// 단계는 넷뿐이고(알·부화·성장·영웅) "지금까지 몇 번 컸나"라 아이가 센다.
export const STAR_MAX = 4

let styleEl = null

function ensureStyle() {
  if (styleEl?.isConnected) return
  styleEl = document.createElement('style')
  styleEl.id = 'pz-buddy-view-style'
  styleEl.textContent = `
    .pz-bd {
      display: flex; flex-direction: column; align-items: center;
      gap: clamp(6px, 1.2vh, 12px); width: 100%; min-height: 0;
    }

    /* 그림이 자리를 다 갖는다. min-height:0이 없으면 원본 크기(512px)가 밀고 들어와
       아래 글자와 버튼을 밖으로 민다. */
    .pz-bd-art {
      position: relative; flex: 1 1 auto; min-height: 0; width: 100%;
      display: flex; align-items: center; justify-content: center;
      min-height: var(--pz-bd-min, 140px);
    }
    /* 뒤에서 은은하게 받쳐주는 빛 — 어두운 판 위에서 버디가 떠 보이게 한다 */
    .pz-bd-art::before {
      content: ''; position: absolute; left: 50%; top: 50%;
      width: 92%; aspect-ratio: 1; transform: translate(-50%, -50%);
      background: radial-gradient(circle, rgba(255,210,62,0.16) 0%, rgba(255,210,62,0.05) 45%, transparent 70%);
      pointer-events: none;
    }
    /* 발밑 그림자 — 없으면 공중에 떠 보인다 */
    .pz-bd-art::after {
      content: ''; position: absolute; bottom: 1%; left: 50%; transform: translateX(-50%);
      width: 42%; height: 14px; border-radius: 50%;
      background: radial-gradient(ellipse, rgba(0,0,0,0.5), transparent 70%);
      pointer-events: none;
    }
    .pz-bd-art img {
      max-width: 100%; max-height: 100%; object-fit: contain; position: relative;
      filter: drop-shadow(0 18px 40px rgba(0,0,0,0.55));
      /* 가만히 있으면 그림이지 친구가 아니다. 숨 쉬듯 아주 조금만 움직인다. */
      animation: pzBdBreath 3.2s ease-in-out infinite;
    }
    .pz-bd-art .pz-bd-fb { position: absolute; font-size: clamp(3rem, 12vh, 7rem); }
    @keyframes pzBdBreath {
      0%, 100% { transform: translateY(0) scale(1); }
      50%      { transform: translateY(-2.5%) scale(1.02); }
    }

    .pz-bd-name {
      font-size: var(--pz-bd-name, clamp(1.1rem, 2.6vw, 1.8rem)); font-weight: 900;
      text-shadow: 0 3px 14px rgba(0,0,0,0.5); text-align: center;
    }
    .pz-bd-stars { font-size: clamp(0.95rem, 2vw, 1.4rem); letter-spacing: 0.08em; white-space: nowrap; }
    .pz-bd-stars .off { opacity: 0.22; }
    .pz-bd-stars .lv {
      font-size: 0.72em; font-weight: 900; color: #ffd23e; margin-left: 8px; letter-spacing: 0;
    }

    .pz-bd-gauge {
      width: min(340px, 92%); height: 14px; border-radius: 999px; overflow: hidden;
      background: rgba(0,0,0,0.34); border: 2px solid rgba(255,255,255,0.14);
    }
    /* 최종 폭은 인라인, 차오르는 건 scaleX.
       키프레임 안 width는 안 먹고, rAF는 탭이 뒤에 있으면 안 돈다(둘 다 겪었다). */
    .pz-bd-fill {
      height: 100%; border-radius: 999px; transform-origin: left center;
      background: linear-gradient(90deg, #ffd23e, #ff8a3d);
      animation: pzBdFill 0.9s cubic-bezier(.2,.8,.3,1) both;
    }
    @keyframes pzBdFill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
    .pz-bd-hint { font-size: clamp(0.82rem, 1.4vw, 1rem); font-weight: 800; color: #ffd23e; }

    @media (prefers-reduced-motion: reduce) {
      .pz-bd-art img, .pz-bd-fill { animation: none; }
    }
  `
  document.head.appendChild(styleEl)
}

/**
 * 버디를 그린다.
 *
 * @param {HTMLElement} host
 * @param {object} o
 * @param {string|null} o.stageId  아이가 골라 입은 단계. 없으면 열린 것 중 마지막
 * @param {boolean} o.stars · o.gauge · o.hint  부분만 보여줄 수 있다
 * @returns {{stage:object|null, level:number}}  화면이 이어서 쓸 정보
 */
export function mountBuddy(host, { stageId = null, stars = true, gauge = true, hint = true } = {}) {
  if (!host) return { stage: null, level: 0 }
  ensureStyle()

  const s = getProgress()
  const buddy = getBuddy(s.buddyId)
  const lv = levelFromTotals(s.totals)
  const stage = currentStage(s.buddyId, lv.level, stageId ?? s.buddyStage)
  const open = unlockedStages(s.buddyId, lv.level)
  const filled = Math.min(STAR_MAX, open.length)
  const src = stage ? buddyImage(s.buddyId, stage.image) : null

  // 그림이 아직 없는 버디가 있다(제작 중). **빈 칸이 되면 안 된다** — 이모지가 받친다.
  host.innerHTML = `
    <div class="pz-bd">
      <div class="pz-bd-art">
        <span class="pz-bd-fb">${stage?.id === 'egg' ? '🥚' : '🐣'}</span>
        ${src ? `<img src="${src}" alt="" onload="this.previousElementSibling?.remove()" onerror="this.remove()" />` : ''}
      </div>
      <div class="pz-bd-name">${s.nickname || buddy?.name || '내 친구'}</div>
      ${stars ? `<div class="pz-bd-stars">${
        Array.from({ length: STAR_MAX }, (_, i) => `<span class="${i < filled ? '' : 'off'}">⭐</span>`).join('')
      }<span class="lv">LV.${lv.level}</span></div>` : ''}
      ${gauge ? `<div class="pz-bd-gauge"><div class="pz-bd-fill" style="width:${Math.round(lv.ratio * 100)}%"></div></div>` : ''}
      ${hint ? `<div class="pz-bd-hint">${levelHint(lv.ratio)}</div>` : ''}
    </div>
  `

  return { stage, level: lv.level, open }
}
