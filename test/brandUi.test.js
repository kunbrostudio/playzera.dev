// 플레이 제라 **공통 UI**는 한 벌이다 ★★
//
// 게임마다 컨셉과 규칙이 달라도 "플레이 제라 안에서 놀고 있다"는 느낌을
// 이어 주는 것은 네 가지다 — Home · 햄버거 메뉴 · 나가기 · 종료 확인.
// 나가는 법이 게임마다 다르면 그건 게임 모음이지 하나의 플랫폼이 아니다.
//
// ── 왜 테스트로 못박나 ──────────────────────────────────────
//
// 실제로 이렇게 어긋났다. 3D 타이틀이 자기만의 메뉴를 `#r3-menu-panel`로
// 따로 그렸는데, **닫는 CSS는 공용 id(`#pz-menu-panel`)에만 걸려 있었다.**
// 그래서 아무도 열지 않았는데 아이콘 셋이 화면에 그대로 나와 있었다(8/27).
//
// 눈으로 보면 "메뉴가 이상하다"지만, 원인은 **한 벌이어야 할 것이 두 벌이
// 된 것**이다. 새 게임을 붙일 때마다 되풀이될 종류의 실수라 여기서 막는다.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { sysBarMarkup, SYSBAR_CSS } from '../src/games/runner/ui/systemBar.js'

/** `src/` 아래 모든 소스. 주석은 뺀다 — "전에는 이랬다"는 기록이 남아야 한다. */
function sources() {
  const out = []
  const walk = dir => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) { if (!e.name.startsWith('_')) walk(p) }
      else if (/\.(js|css)$/.test(e.name)) out.push([p, fs.readFileSync(p, 'utf8')])
    }
  }
  walk('src')
  return out
}

/** 주석은 뺀다 — 판단 근거는 남기되 검사 대상에서는 제외한다. */
const stripComments = s => s
  .replace(/\/\*[\s\S]*?\*\//g, '')       // 블록 주석 (CSS·JSDoc·HTML 안의 것)
  .replace(/<!--[\s\S]*?-->/g, '')        // 마크업 주석
  .replace(/^\s*\/\/.*$/gm, '')           // 줄 주석

describe('브랜드 공통 UI는 한 벌이다 ★★', () => {
  const src = sources()

  it('메뉴 패널을 자기 id로 다시 만들지 않는다', () => {
    // `#pz-menu-panel`이 정본이다. 화면이 자기 id로 패널을 그리면 공용 CSS의
    // `display: none`이 안 걸려 메뉴가 열린 채로 남는다 — 3D 타이틀이 실제로
    // 그랬다(8/27).
    //
    // ── 아직 안 옮긴 둘 ★ ────────────────────────────────────
    //
    //   legacy-shell.js  2.5D 러너. **보관 대상**이다 — 러너는 전부 3D로 간다
    //                    (Second Brain의 `runners-all-3d`). 옮기기 전에 사라진다.
    //   poop-dodge       메뉴 안에 손 컨트롤 토글·팔로 X 게이지가 더 있다.
    //                    공용 바에 그 자리를 만들기 전에는 못 옮긴다.
    //
    // 목록에 적힌 것만 봐준다. **새 화면은 여기 못 들어온다** — 새로 추가하려면
    // 이 주석에 "왜 공용을 못 쓰는지"를 같이 적어야 한다.
    const ALLOW = [
      'src/games/runner/ui/systemBar.js',      // 정본
      'src/games/runner/legacy-shell.js',
      'src/games/poop-dodge/play.js',
      'src/games/poop-dodge/intro.js',
    ].map(p => path.normalize(p))

    for (const [p, code] of src) {
      if (ALLOW.includes(path.normalize(p))) continue
      expect(stripComments(code), `${p}가 메뉴 패널을 따로 만든다`)
        .not.toMatch(/id\s*=\s*["'][\w-]*menu-panel/)
    }
  })

  it('나가기·확인창의 버튼도 공용 것을 쓴다', () => {
    // 확인창을 화면마다 따로 만들면 "계속하기 / 게임 처음으로 / Home으로"
    // 셋의 순서와 말이 갈린다. 아이는 게임을 옮길 때마다 다시 배운다.
    const html = sysBarMarkup()
    for (const id of ['pz-menu', 'pz-menu-panel', 'pz-music', 'pz-sfx', 'pz-full',
      'pz-exit', 'pz-home', 'pz-confirm', 'pz-resume', 'pz-quit', 'pz-quit-home']) {
      expect(html, `${id}가 공용 마크업에 없다`).toContain(`id="${id}"`)
    }
  })

  it('★ 메뉴는 **닫힌 것이 기본**이다', () => {
    expect(SYSBAR_CSS, '패널을 닫는 규칙이 없다')
      .toMatch(/#pz-menu-panel\.hidden\s*\{\s*display:\s*none/)
    expect(sysBarMarkup(), '패널이 열린 채로 그려진다')
      .toMatch(/id="pz-menu-panel"\s+class="hidden"/)
  })

  it('★ 확인창은 **세로로** 쌓는다', () => {
    // 셋이 가로로 서면 좁은 화면에서 줄이 넘치고, 머무르기 커서로 가운데
    // 버튼을 겨누기 어렵다.
    expect(SYSBAR_CSS).toMatch(/\.pz-confirm-actions\s*\{[^}]*flex-direction:\s*column/)
    const legacy = fs.readFileSync('src/games/runner/style.css', 'utf8')
    expect(legacy, '2.5D 확인창이 아직 가로다')
      .toMatch(/\.confirm-actions\s*\{[^}]*flex-direction:\s*column/)
  })

  it('★ 나가는 버튼의 이름은 **가는 곳**이다 — "게임 목록"은 안 쓴다', () => {
    // 아이가 보는 글자가 게임마다 다르면 나가는 법을 게임마다 다시 배운다.
    // 허브의 이름은 Home 하나로 통일한다.
    for (const [p, code] of src) {
      const body = stripComments(code)
      // 주석·aria가 아닌 **화면에 뜨는 글자**만 본다
      expect(body.replace(/aria-label="[^"]*"/g, ''), `${p}에 옛 이름이 남아 있다`)
        .not.toMatch(/>\s*[^<]*게임 목록/)
    }
  })

  it('★ 확인창의 셋은 **모든 게임에서 같은 순서**다', () => {
    const order = ['pz-resume', 'pz-quit', 'pz-quit-home']
    const html = sysBarMarkup()
    let at = -1
    for (const id of order) {
      const i = html.indexOf(`id="${id}"`)
      expect(i, `${id}가 없다`).toBeGreaterThan(at)
      at = i
    }
    // 2.5D도 같은 순서다 (계속하기 → 게임 처음으로 → Home으로)
    const shell = fs.readFileSync('src/games/runner/legacy-shell.js', 'utf8')
    const a = shell.indexOf('btn-resume')
    const b = shell.indexOf('btn-quit-confirm')
    const c = shell.indexOf('btn-quit-home')
    expect(b, '2.5D의 순서가 다르다').toBeGreaterThan(a)
    expect(c, '2.5D의 순서가 다르다').toBeGreaterThan(b)
  })

  it('아이 화면이므로 공용 버튼은 손 커서로 눌린다', () => {
    // `CLAUDE.md`: 아이 화면은 전부 손 커서로 되어야 한다(`data-pz-hit`).
    const html = sysBarMarkup({ home: true })
    for (const id of ['pz-home', 'pz-menu', 'pz-exit', 'pz-resume', 'pz-quit', 'pz-quit-home']) {
      const tag = html.slice(html.indexOf(`id="${id}"`))
      expect(tag.slice(0, tag.indexOf('>')), `${id}에 손 커서가 없다`).toContain('data-pz-hit')
    }
  })
})
