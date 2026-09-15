import { describe, expect, it } from 'vitest'
import {
  BODY_QUIZ_MOTION_HUD_CSS,
  bodyQuizMotionHudMarkup,
  createBodyQuizMotionHud,
} from '../src/games/body-quiz/motionHud.js'

describe('BODY QUIZ 공통 Motion HUD', () => {
  function mount(state = {}) {
    document.body.innerHTML = bodyQuizMotionHudMarkup({ idPrefix: 'test', ...state })
    const root = document.querySelector('#test-motion-hud')
    return { root, hud: createBodyQuizMotionHud(root) }
  }

  it('운동 아이콘·count·energy·lock을 한 구조로 만든다', () => {
    const { root } = mount()
    expect(root.querySelector('#test-motion-icon svg.bq-motion-pictogram')).not.toBeNull()
    expect(root.querySelector('#test-squat').textContent).toBe('SQUAT 0/5')
    expect(root.querySelector('#test-energy-pct').textContent).toBe('0%')
    expect(root.querySelector('#test-move-state').textContent).toBe('MOVE LOCK')
    expect(root.querySelectorAll('.bq-motion-state')).toHaveLength(1)
    expect([...root.children].map(element => element.className)).toEqual([
      'bq-motion-icon',
      'bq-motion-count',
      'bq-motion-energy',
      'bq-motion-energy-pct',
      'bq-motion-state',
    ])
    expect(root.querySelector('#test-motion-icon').parentElement).toBe(root)
    expect(root.querySelector('#test-motion-count').parentElement).toBe(root)
    const energy = root.querySelector('#test-energy')
    expect(energy.parentElement).toBe(root)
    expect(root.querySelector('#test-energy-label').parentElement).toBe(energy)
    expect(root.querySelector('#test-energy-bar').parentElement).toBe(energy)
    expect(root.querySelector('#test-energy-pct').parentElement).toBe(root)
    expect(root.querySelector('#test-move-state').parentElement).toBe(root)
    expect(BODY_QUIZ_MOTION_HUD_CSS).toContain('display: flex; flex-wrap: nowrap')
    expect(BODY_QUIZ_MOTION_HUD_CSS).toContain('min-width: max-content; flex: 0 0 auto; display: block')
    expect(BODY_QUIZ_MOTION_HUD_CSS).toContain('min-width: 0; flex: 1 1 150px')
    expect(BODY_QUIZ_MOTION_HUD_CSS).toContain('flex: 0 0 4.5ch')
    expect(BODY_QUIZ_MOTION_HUD_CSS).toContain('min-width: 116px; max-width: 100%; flex: 0 0 auto')
  })

  it('demo와 real state가 같은 update API로 count/energy/unlock에 반영된다', () => {
    const { root, hud } = mount()
    hud.update({ currentCount: 5, targetCount: 5, energyPercent: 100, moveLocked: false })
    expect(root.querySelector('#test-squat').textContent).toBe('SQUAT 5/5')
    expect(root.querySelector('#test-energy-bar i').style.width).toBe('100%')
    expect(root.querySelector('#test-energy-pct').textContent).toBe('100%')
    expect(root.querySelector('#test-move-state').textContent).toBe('MOVE UNLOCK')
    expect(root.classList.contains('unlocked')).toBe(true)
  })

  it('잘못된 energy 값은 안전하게 0~100 범위로 제한한다', () => {
    const { root, hud } = mount()
    hud.update({ energyPercent: 140, moveLocked: false })
    expect(root.querySelector('#test-energy-pct').textContent).toBe('100%')
    hud.update({ energyPercent: -20, moveLocked: true })
    expect(root.querySelector('#test-energy-pct').textContent).toBe('0%')
  })
})
