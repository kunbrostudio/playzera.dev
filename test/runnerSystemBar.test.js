import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import {
  sysBarMarkup, bindSysBar, SYS_ICON, SYSBAR_CSS,
} from '../src/games/runner/ui/systemBar.js'

const mount = () => {
  document.body.innerHTML = `<div id="r">${sysBarMarkup()}</div>`
  return document.querySelector('#r')
}
const click = (root, id) => root.querySelector(`#${id}`).click()

describe('상단 시스템 버튼 ★', () => {
  it('선언한 아이콘이 실제로 있다', () => {
    for (const [k, p] of Object.entries(SYS_ICON)) {
      expect(fs.existsSync(`public${p}`), `${k} (${p})가 없다`).toBe(true)
    }
  })

  it('메뉴는 열고 닫힌다 — 아이콘도 같이 바뀐다', () => {
    const root = mount()
    bindSysBar(root, {})
    const panel = root.querySelector('#pz-menu-panel')
    expect(panel.classList.contains('hidden')).toBe(true)
    click(root, 'pz-menu')
    expect(panel.classList.contains('hidden')).toBe(false)
    expect(root.querySelector('#pz-menu img').src).toContain('ico_menu_close')
    click(root, 'pz-menu')
    expect(panel.classList.contains('hidden')).toBe(true)
  })

  it('★ 메뉴가 열려 있으면 판이 멈춘다', () => {
    // 안 멈추면 아이가 메뉴를 보는 사이에 장애물이 지나가고,
    // 돌아왔을 때 목숨이 줄어 있다.
    const root = mount()
    const onPause = vi.fn()
    bindSysBar(root, { onPause })
    click(root, 'pz-menu')
    expect(onPause).toHaveBeenLastCalledWith(true)
    click(root, 'pz-menu')
    expect(onPause).toHaveBeenLastCalledWith(false)
  })

  it('음소거 아이콘은 **토글 결과**를 보고 바뀐다', () => {
    // 화면이 자기 상태를 따로 들면 실제 음소거와 어긋난다 —
    // 소리는 나는데 아이콘은 꺼져 있는 식이 된다.
    const root = mount()
    let muted = false
    bindSysBar(root, { onToggleMusic: () => (muted = !muted) })
    click(root, 'pz-music')
    expect(root.querySelector('#pz-music img').src).toContain('btn_main_music_off')
    click(root, 'pz-music')
    expect(root.querySelector('#pz-music img').src).toContain('btn_main_music.png')
  })

  it('★ 종료는 확인창을 거친다 — 바로 안 나간다', () => {
    // 그냥 나가면 그때까지의 운동 기록을 저장하는 경로를 건너뛴다.
    const root = mount()
    const onQuit = vi.fn()
    bindSysBar(root, { onQuit })
    click(root, 'pz-exit')
    expect(onQuit, '확인 없이 나갔다').not.toHaveBeenCalled()
    expect(root.querySelector('#pz-confirm').classList.contains('hidden')).toBe(false)
    click(root, 'pz-quit')
    expect(onQuit).toHaveBeenCalledOnce()
  })

  it('계속하기를 누르면 확인창이 닫히고 판이 다시 돈다', () => {
    const root = mount()
    const onPause = vi.fn()
    bindSysBar(root, { onPause })
    click(root, 'pz-exit')
    expect(onPause).toHaveBeenLastCalledWith(true)
    click(root, 'pz-resume')
    expect(onPause).toHaveBeenLastCalledWith(false)
  })

  it('아이 화면이므로 손 커서로 눌린다', () => {
    const root = mount()
    for (const id of ['pz-menu', 'pz-exit', 'pz-resume', 'pz-quit']) {
      expect(root.querySelector(`#${id}`).hasAttribute('data-pz-hit'), `${id}`).toBe(true)
    }
  })

  it('반응형 — 고정 픽셀로 못 박지 않는다', () => {
    // 태블릿부터 데스크톱까지 같은 화면을 쓴다. 버튼 크기를 px로 박으면
    // 작은 화면에서 화면을 덮고 큰 화면에서 점이 된다.
    for (const sel of ['.pz-sys-btn img', '.pz-menu-item img', '.pz-btn']) {
      const block = SYSBAR_CSS.slice(SYSBAR_CSS.indexOf(sel))
      expect(block.slice(0, 240), `${sel}에 clamp가 없다`).toContain('clamp(')
    }
  })

  it('3D 러너가 이 모듈을 쓴다', () => {
    const src = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
    expect(src).toMatch(/from '\.\.\/runner\/ui\/systemBar\.js'/)
    expect(src).toContain('bindSysBar')
  })
})

describe('3D 러너에도 소리가 난다 ★', () => {
  it('2D와 **같은 오디오 모듈**을 쓴다', () => {
    // 두 벌이 되면 음소거 상태가 갈리고, 한쪽만 고치게 된다.
    const src = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
    expect(src).toMatch(/from '\.\.\/runner\/audio\.js'/)
    for (const fn of ['initAudio', 'unlockAudio', 'startBgm', 'stopBgm', 'playSfx']) {
      expect(src, `${fn}을 안 쓴다`).toContain(fn)
    }
  })

  it('★ 정리는 **화면을 그리기 전에** 걸어 둔다', () => {
    // 라우터는 `onLeave`를 **하나만** 들고 있다. 등록이 파일 아래쪽에 있으면,
    // 준비 화면에서 뒤로 나가는 것처럼 **중간에 떠나는 길**에서는 아예 안 걸린다.
    // 실제로 그래서 BGM이 허브까지 따라갔다.
    const src = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
    const body = src.slice(src.indexOf('return async function play3d'))
    const at = body.indexOf('onLeave(')
    expect(at, 'onLeave를 안 건다').toBeGreaterThan(-1)
    // 첫 화면(타이틀)보다 먼저여야 한다
    expect(at, '타이틀을 띄운 뒤에 정리를 건다').toBeLessThan(body.indexOf('showTitle3d('))
    // 그리고 하나만 건다 — 두 번 부르면 앞의 것이 통째로 덮인다
    expect((body.match(/\bonLeave\(/g) || []).length, 'onLeave를 여러 번 부른다').toBe(1)
  })

  it('★ BGM은 게임 안에서만 난다 — 나갈 때 끈다', () => {
    // `CLAUDE.md` 규칙. 끄는 걸 잊으면 허브까지 음악이 따라간다.
    const src = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
    // 소리를 켠 **직후에** 끄는 것을 예약해 둔다
    const after = src.slice(src.indexOf('initAudio('))
    expect(after.slice(0, 900), '소리를 켜고 끄는 것을 안 예약한다').toContain('stopBgm()')
  })

  it('BGM을 미리 받아 둔다 — 몇 초 늦게 나면 안 된다', () => {
    // 효과음에는 `preload`가 있었는데 BGM에는 없어서, 첫 상호작용 때
    // 그제야 받기 시작해 음악이 늦게 났다.
    const src = fs.readFileSync('src/games/runner/audio.js', 'utf8')
    expect(src).toMatch(/bgm\.preload\s*=\s*'auto'/)
    expect(src).toContain('bgm.load()')
  })

  it('소리 경로는 manifest에서 온다 — 엔진에 안 박는다', () => {
    const m = JSON.parse(fs.readFileSync('src/games/jurassic-run-3d/manifest.json', 'utf8'))
    expect(m.audio?.base, 'manifest에 소리 폴더가 없다').toBeTruthy()
    expect(fs.existsSync(`public${m.audio.base}/${m.audio.bgm}`), 'BGM 파일이 없다').toBe(true)
    for (const n of ['countdown_beep', 'go', 'dodge', 'level_complete', 'button_press']) {
      expect(fs.existsSync(`public${m.audio.base}/sfx_${n}.wav`), `sfx_${n}이 없다`).toBe(true)
    }
  })
})
