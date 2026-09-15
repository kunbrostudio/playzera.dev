// BODY QUIZ Motion HUD — tutorial demo와 실제 play state가 함께 쓰는 UI.
// 운동별 정식 asset이 오면 MOTION_ICON_PATHS/renderer만 교체하면 된다.

const MOTION_ICON_PATHS = {
  squat: '<circle cx="12" cy="4" r="2"/><path d="m9.5 8.5 2.5-1.5 2.5 1.5 1.8 4.2"/><path d="m9.5 9-2.8 4.2 3.8 2.1-2.2 4.2"/><path d="m14.3 12.5 2.7 2.8 3.4.2"/><path d="m10.5 15.3 4 .2 2.2 4"/>',
  jump: '<circle cx="12" cy="4" r="2"/><path d="m8 8 4 2 4-2"/><path d="m12 10-1 5-4 4"/><path d="m11 15 4 4"/><path d="M4 6 2 4M20 6l2-2"/>',
  run: '<circle cx="13" cy="4" r="2"/><path d="m8 10 3-3 4 3 3 1"/><path d="m12 9-1 5-4 5"/><path d="m11 14 4 2 2 4"/>',
  pose: '<circle cx="12" cy="4" r="2"/><path d="M12 7v7"/><path d="m12 9-5 3"/><path d="m12 9 5 3"/><path d="m12 14-4 6"/><path d="m12 14 4 6"/>',
}

/** BODY QUIZ 안에서 먼저 쓰는 교체형 운동 pictogram. */
export function bodyQuizMotionIcon(key) {
  const paths = MOTION_ICON_PATHS[key] ?? MOTION_ICON_PATHS.pose
  return `<svg class="bq-motion-pictogram" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`
}

export const BODY_QUIZ_MOTION_HUD_CSS = `
  .bq-motion-hud {
    align-self: center; justify-self: center; width: min(72vw, 560px); min-width: 0;
    display: flex; flex-wrap: nowrap; align-items: center; gap: clamp(10px, 1.2vw, 16px);
    padding: clamp(8px, 1.2dvh, 13px) clamp(14px, 2vw, 24px);
    border: 4px solid #6fd6ff; border-radius: clamp(18px, 2vw, 28px);
    background: linear-gradient(180deg, rgba(255,255,255,.96), rgba(222,244,255,.94));
    box-shadow: inset 0 2px 0 #fff, 0 6px 0 rgba(28,96,146,.74), 0 12px 30px rgba(0,0,0,.34), 0 0 24px rgba(92,213,255,.48);
    color: #24346f; transition: border-color .2s, box-shadow .2s, transform .2s;
  }
  .bq-motion-hud.unlocked {
    border-color: #ffe066;
    box-shadow: inset 0 2px 0 #fff, 0 6px 0 #b9770b, 0 0 30px rgba(255,210,62,.78);
  }
  .bq-motion-count {
    min-width: max-content; flex: 0 0 auto; display: block;
  }
  .bq-motion-icon {
    width: clamp(34px, 3.4vw, 46px); height: clamp(34px, 3.4vw, 46px); flex: 0 0 auto;
    display: inline-flex; align-items: center; justify-content: center;
    border: 2px solid #fff; border-radius: 9999px; color: #fff;
    background: linear-gradient(180deg, #63ddff, #237bd8);
    box-shadow: inset 0 2px 0 rgba(255,255,255,.38), 0 3px 0 #1555a3;
  }
  .bq-motion-pictogram { width: 68%; height: 68%; display: block; }
  .bq-motion-name { font-size: clamp(1rem, 2vw, 1.4rem); font-weight: 900; white-space: nowrap; }
  .bq-motion-energy {
    min-width: 0; flex: 1 1 150px;
    display: flex; flex-wrap: nowrap; align-items: center; gap: clamp(5px, .7vw, 8px);
  }
  .bq-motion-energy-label, .bq-motion-energy-pct {
    font-size: clamp(.72rem, 1.25vw, .94rem); font-weight: 900; white-space: nowrap;
  }
  .bq-motion-energy-label { flex: 0 0 auto; }
  .bq-motion-energy-pct {
    width: 4.5ch; min-width: 4.5ch; flex: 0 0 4.5ch; text-align: right;
    font-variant-numeric: tabular-nums;
  }
  .bq-motion-energy-bar {
    width: auto; height: clamp(12px, 1.8dvh, 17px); min-width: 40px; flex: 1 1 80px; overflow: hidden;
    border: 2px solid #fff; border-radius: 9999px; background: rgba(35,23,77,.22);
    box-shadow: inset 0 2px 5px rgba(24,13,62,.35);
  }
  .bq-motion-energy-bar i {
    display: block; width: 0%; height: 100%; border-radius: inherit;
    background: linear-gradient(90deg, #ffd23e, #ff9d2e, #ff4fa4);
    transition: width .2s ease;
  }
  .bq-motion-state {
    width: max-content; min-width: 116px; max-width: 100%; flex: 0 0 auto; padding: 5px 12px;
    display: inline-flex; align-items: center; justify-content: center;
    border-radius: 9999px; text-align: center; line-height: 1.1; overflow: visible;
    color: #fff; background: linear-gradient(180deg, #967fe2, #624db7);
    box-shadow: 0 3px 0 #43328b;
    font-size: clamp(.72rem, 1.25vw, .94rem); font-weight: 900; white-space: nowrap;
  }
  .bq-motion-hud.unlocked .bq-motion-state {
    color: #563700; background: linear-gradient(180deg, #fff39a, #ffd23e); box-shadow: 0 3px 0 #bd7f11;
  }

  @media (max-width: 920px), (max-height: 520px) {
    .bq-motion-hud {
      width: min(88vw, 500px); gap: 8px; padding: 5px 10px; border-width: 2px; border-radius: 16px;
      box-shadow: inset 0 1px 0 #fff, 0 3px 0 rgba(28,96,146,.74), 0 6px 15px rgba(0,0,0,.3);
    }
    .bq-motion-hud.unlocked { box-shadow: inset 0 1px 0 #fff, 0 3px 0 #b9770b, 0 0 18px rgba(255,210,62,.7); }
    .bq-motion-name { font-size: clamp(.74rem, 3dvh, .9rem); }
    .bq-motion-icon { width: 27px; height: 27px; border-width: 1px; box-shadow: 0 2px 0 #1555a3; }
    .bq-motion-energy-label, .bq-motion-energy-pct, .bq-motion-state { font-size: clamp(.58rem, 2.2dvh, .7rem); }
    .bq-motion-energy-bar { height: 10px; border-width: 1px; }
    .bq-motion-state { min-width: 104px; padding: 3px 8px; box-shadow: 0 2px 0 #43328b; }
  }

  @media (max-width: 700px) and (orientation: landscape) {
    .bq-motion-hud { width: 96%; padding-inline: 7px; gap: 7px; }
    .bq-motion-energy { gap: 4px; }
    .bq-motion-energy-bar { min-width: 32px; }
    .bq-motion-state { min-width: 98px; }
  }
`

function clampPercent(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) return 0
  return Math.max(0, Math.min(100, Math.round(number)))
}

/** 같은 DOM 구조를 tutorial/play 양쪽에 만든다. idPrefix는 기존 selector 호환용이다. */
export function bodyQuizMotionHudMarkup({
  idPrefix = 'bq',
  className = '',
  exercise = 'squat',
  exerciseLabel = 'SQUAT',
  currentCount = 0,
  targetCount = 5,
  energyPercent = 0,
  moveLocked = true,
} = {}) {
  const percent = clampPercent(energyPercent)
  return `
    <section id="${idPrefix}-motion-hud" class="bq-motion-hud ${className} ${moveLocked ? 'locked' : 'unlocked'}" aria-label="움직임 에너지">
      <span id="${idPrefix}-motion-icon" class="bq-motion-icon" data-motion="${exercise}">${bodyQuizMotionIcon(exercise)}</span>
      <div id="${idPrefix}-motion-count" class="bq-motion-count">
        <div id="${idPrefix}-squat" class="bq-motion-name">${exerciseLabel} ${currentCount}/${targetCount}</div>
      </div>
      <div id="${idPrefix}-energy" class="bq-motion-energy">
        <span id="${idPrefix}-energy-label" class="bq-motion-energy-label">MOVE ENERGY</span>
        <div id="${idPrefix}-energy-bar" class="bq-motion-energy-bar"><i style="width:${percent}%"></i></div>
      </div>
      <span id="${idPrefix}-energy-pct" class="bq-motion-energy-pct">${percent}%</span>
      <div id="${idPrefix}-move-state" class="bq-motion-state">${moveLocked ? 'MOVE LOCK' : 'MOVE UNLOCK'}</div>
    </section>`
}

/** demo/real state 차이 없이 같은 필드로 HUD를 갱신한다. */
export function createBodyQuizMotionHud(hudEl) {
  if (!hudEl) throw new Error('BODY QUIZ Motion HUD root is required')
  const iconEl = hudEl.querySelector('.bq-motion-icon')
  const countEl = hudEl.querySelector('.bq-motion-name')
  const energyFillEl = hudEl.querySelector('.bq-motion-energy-bar i')
  const energyPctEl = hudEl.querySelector('.bq-motion-energy-pct')
  const stateEl = hudEl.querySelector('.bq-motion-state')

  function update({
    exercise = iconEl.dataset.motion || 'squat',
    exerciseLabel = 'SQUAT',
    currentCount = 0,
    targetCount = 5,
    energyPercent = 0,
    moveLocked = true,
  } = {}) {
    const percent = clampPercent(energyPercent)
    if (iconEl.dataset.motion !== exercise) {
      iconEl.dataset.motion = exercise
      iconEl.innerHTML = bodyQuizMotionIcon(exercise)
    }
    countEl.textContent = `${exerciseLabel} ${currentCount}/${targetCount}`
    energyFillEl.style.width = `${percent}%`
    energyPctEl.textContent = `${percent}%`
    stateEl.textContent = moveLocked ? 'MOVE LOCK' : 'MOVE UNLOCK'
    hudEl.classList.toggle('locked', moveLocked)
    hudEl.classList.toggle('unlocked', !moveLocked)
    hudEl.dataset.energy = String(percent)
    hudEl.dataset.locked = String(moveLocked)
  }

  return { element: hudEl, update }
}
