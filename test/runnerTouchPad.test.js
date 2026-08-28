import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import {
  touchPadMarkup, bindTouchPad, POSE_BUTTONS, TOUCHPAD_CSS,
} from '../src/games/runner/ui/touchPad.js'

const mount = () => {
  document.body.innerHTML = `<div id="r">${touchPadMarkup()}</div>`
  return document.querySelector('#r')
}
const press = (root, id, type) =>
  root.querySelector(`#${id}`).dispatchEvent(new Event(type, { bubbles: true, cancelable: true }))

describe('화면 버튼 — 러너가 같이 쓴다 ★', () => {
  it('두 러너가 같은 모듈에서 그린다', () => {
    for (const f of ['src/games/runner/legacy-shell.js', 'src/games/runner3d/play3d.js']) {
      expect(fs.readFileSync(f, 'utf8'), `${f}가 공용 버튼을 안 쓴다`)
        .toMatch(/from '[^']*ui\/touchPad\.js'/)
    }
    // 잇는 것도 한 벌이어야 한다 — 마크업만 공유하고 배선을 따로 짜면
    // 한쪽에서만 `pointerleave`를 빠뜨리게 된다
    for (const f of ['src/games/runner/main.js', 'src/games/runner3d/play3d.js']) {
      expect(fs.readFileSync(f, 'utf8'), `${f}가 bindTouchPad를 안 쓴다`)
        .toContain('bindTouchPad')
    }
  })

  it('마크업과 모양이 같이 온다', () => {
    const css = fs.readFileSync('src/games/runner/style.css', 'utf8')
    expect(TOUCHPAD_CSS).toContain('#touch-controls')
    expect(css, 'style.css에 버튼 규칙이 남아 있다 — 두 벌이다')
      .not.toMatch(/^#touch-controls \{/m)
  })

  it('자세 버튼이 세 개고 이름이 채점기와 같다', async () => {
    const { POSE_TARGETS } = await import('../src/games/runner/input/poseMatcher.js')
    expect(POSE_BUTTONS).toHaveLength(3)
    for (const p of POSE_BUTTONS) {
      expect(POSE_TARGETS[p.pose], `${p.pose} 채점 기준이 없다`).toBeTruthy()
    }
  })

  it('누르면 동작이 돈다', () => {
    const root = mount()
    const act = { left: vi.fn(), right: vi.fn(), jump: vi.fn() }
    bindTouchPad(root, act)
    press(root, 'tc-left', 'pointerdown')
    press(root, 'tc-right', 'pointerdown')
    press(root, 'tc-jump', 'pointerdown')
    expect(act.left).toHaveBeenCalledOnce()
    expect(act.right).toHaveBeenCalledOnce()
    expect(act.jump).toHaveBeenCalledOnce()
  })

  it('★ 손가락이 버튼 밖으로 나가도 **뗀 것으로 친다**', () => {
    // `pointerup`만 들으면 누른 채로 밖으로 나갔을 때 못 받는다.
    // 숙이기·자세는 누르고 있는 동안 유지되는 입력이라 **그대로 굳는다** —
    // 화면은 멀쩡해 보이고 아이만 이상해진다.
    const root = mount()
    const act = { duckStart: vi.fn(), duckEnd: vi.fn() }
    bindTouchPad(root, act)
    press(root, 'tc-duck', 'pointerdown')
    press(root, 'tc-duck', 'pointerleave')
    expect(act.duckEnd).toHaveBeenCalledOnce()

    press(root, 'tc-duck', 'pointerdown')
    press(root, 'tc-duck', 'pointercancel')
    expect(act.duckEnd).toHaveBeenCalledTimes(2)
  })

  it('자세 버튼은 어떤 자세인지 알려 준다', () => {
    const root = mount()
    const act = { poseDown: vi.fn(), poseUp: vi.fn() }
    bindTouchPad(root, act)
    press(root, 'tc-pose-a', 'pointerdown')
    expect(act.poseDown).toHaveBeenCalledWith('lunge')
    press(root, 'tc-pose-a', 'pointerup')
    expect(act.poseUp).toHaveBeenCalledWith('lunge')
  })

  it('signal로 한 번에 뗀다 — 화면을 떠나면 남지 않는다', () => {
    const root = mount()
    const act = { jump: vi.fn() }
    const ac = new AbortController()
    bindTouchPad(root, act, ac.signal)
    ac.abort()
    press(root, 'tc-jump', 'pointerdown')
    expect(act.jump).not.toHaveBeenCalled()
  })
})
