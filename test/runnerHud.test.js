import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import {
  hudMarkup, livesMarkup, countsMarkup, updateHud, HUD_CSS,
} from '../src/games/runner/ui/hud.js'

// HUD를 2D와 3D가 **한 벌로** 쓴다. 두 벌이 되면 버튼 하나 옮길 때 두 군데를
// 고쳐야 하고, 한쪽만 고치면 아이는 게임마다 다른 화면을 만난다.

describe('러너 HUD — 한 벌이다 ★', () => {
  it('두 러너가 같은 모듈에서 그린다', () => {
    const two = ['src/games/runner/main.js', 'src/games/runner3d/play3d.js']
    for (const f of two) {
      expect(fs.readFileSync(f, 'utf8'), `${f}가 공용 HUD를 안 쓴다`)
        .toMatch(/from '[^']*ui\/hud\.js'/)
    }
  })

  it('마크업과 모양이 **같이** 온다', () => {
    // 모양을 `style.css`에 두면 3D는 그 파일을 안 불러서 뼈대만 나온다.
    // 실제로 2D의 style.css에 있던 것을 여기로 옮겼다.
    for (const id of ['#hud-left', '#hud-level', '#hud-lives', '#hud-counts']) {
      expect(HUD_CSS, `${id} 규칙이 없다`).toContain(id)
    }
    const css = fs.readFileSync('src/games/runner/style.css', 'utf8')
    expect(css, 'style.css에 HUD 규칙이 남아 있다 — 두 벌이다')
      .not.toMatch(/^#hud-left \{/m)
  })

  it('목숨은 남은 만큼 차고 나머지는 빈다', () => {
    const html = livesMarkup(2, 5)
    expect((html.match(/life-full/g) || []).length).toBe(2)
    expect((html.match(/life-empty/g) || []).length).toBe(3)
  })

  it('운동 카운트는 넘겨준 값을 그대로 쓴다', () => {
    const html = countsMarkup({ jumps: 3, squats: 2, sideSteps: 8 })
    expect(html).toContain('점프 3')
    expect(html).toContain('앉기 2')
    expect(html).toContain('피하기 8')
  })

  it('★ 값이 없는 칸은 건드리지 않는다', () => {
    // 게임마다 있는 값이 다르다. 없는 것을 0으로 덮으면 화면이 깜빡인다.
    document.body.innerHTML = hudMarkup()
    document.querySelector('#hud-level').textContent = 'LEVEL 7'
    updateHud(document, { stars: 12 })
    expect(document.querySelector('#hud-level').textContent).toBe('LEVEL 7')
    expect(document.querySelector('#hud-stars').innerHTML).toContain('12')
  })

  it('숫자를 해석하지 않는다 — 별 칸에 무엇을 넣을지는 게임이 정한다', () => {
    // 2D는 주워 모은 별, 3D는 점수. HUD가 그걸 알면 게임을 아는 모듈이 된다.
    // 주석은 뺀다 — "왜 그런지"는 적혀 있어야 하고, 그건 게임을 아는 것이 아니다.
    const code = fs.readFileSync('src/games/runner/ui/hud.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
    expect(code).not.toMatch(/jurassic|runner3d|점수/)
  })
})
