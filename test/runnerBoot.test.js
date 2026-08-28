// 러너 모듈은 **테마 없이 import만 해도 터지지 않아야 한다.**
//
// ── 실제로 터졌다 ────────────────────────────────────────────
//
// `legacy-shell.js`의 스테이지 마크업이 `export const STAGE_HTML = \`...\`` 였는데,
// 그 안에 테마 아이콘 경로(`${ui('menu')}`)를 넣는 순간 **import 시점에 평가**됐다.
// 그 시점엔 `setTheme()`이 아직 안 불렸으니 `ui()`가 던지고, 모듈 로드가 실패해
// **우주·정글 두 게임이 다 안 켜졌다.** 빌드는 통과했고 다른 테스트도 다 통과했다.
//
// 함정의 모양이 특이하다 — 테마를 읽는 코드가 함수 안에 있으면 안전한데, 상수
// 초기화식(템플릿 리터럴·객체 리터럴) 안에 있으면 import가 곧 실행이다.
// 눈으로는 구분이 잘 안 간다. 그래서 기계가 본다.
//
// 이 파일은 **`setTheme()`을 부르지 않는다.** 그게 이 테스트의 전부다.
import { describe, it, expect } from 'vitest'

const MODULES = [
  '../src/games/runner/theme.js',
  '../src/games/runner/assets.js',
  '../src/games/runner/audio.js',
  '../src/games/runner/config.js',
  '../src/games/runner/legacy-shell.js',
  '../src/games/runner/screens.js',
  '../src/games/runner/stats.js',
  '../src/games/runner/game/world.js',
  '../src/games/runner/game/character.js',
  '../src/games/runner/game/obstacles.js',
  '../src/games/runner/game/course.js',
]

describe('테마 없이 import — 모듈 로드', () => {
  it.each(MODULES)('%s', async path => {
    await expect(import(path)).resolves.toBeTruthy()
  })
})

describe('테마 없이 쓰면 조용히 넘어가지 않는다', () => {
  it('theme()은 던진다', async () => {
    const { theme } = await import('../src/games/runner/theme.js')
    // 조용히 undefined를 흘리면 게임 이름 없는 기록이 쌓이고 그림이 안 뜬다.
    // 어디서 잘못됐는지 못 찾는다 — 차라리 그 자리에서 멈추는 게 낫다.
    expect(() => theme()).toThrow(/테마가 없다/)
  })

  it('꽂으면 읽힌다', async () => {
    const { setTheme, theme, img, ui } = await import('../src/games/runner/theme.js')
    const space = (await import('../src/games/runner-space/theme.json')).default
    setTheme(space)
    expect(theme().id).toBe('warmup-obstacle')
    expect(img('bg_sky')).toBe('/assets/runner/space/image/bg_sky.png')
    // 메뉴 아이콘은 **모든 게임이 같이 쓰는 공용 그림**이라 테마 폴더 밖에 있다
    expect(ui('menu')).toBe('/assets/runner/_shared/ico_menu.png')
    expect(img('_shared/signs_up')).toBe('/assets/runner/_shared/signs_up.png')
  })

  it('테마에 없는 UI 키를 물으면 던진다', async () => {
    const { ui } = await import('../src/games/runner/theme.js')
    expect(() => ui('없는키')).toThrow(/ui\.없는키/)
  })

  it('스테이지 마크업은 테마를 꽂은 뒤에 만들어진다', async () => {
    // stageHtml()이 상수가 아니라 함수인 이유가 이것이다.
    const { stageHtml } = await import('../src/games/runner/legacy-shell.js')
    expect(typeof stageHtml).toBe('function')
    expect(stageHtml()).toContain('/assets/runner/_shared/')
  })
})
