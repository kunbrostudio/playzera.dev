// 러너 테마 규격 — **새 테마에서 키 하나가 빠져도 화면은 멀쩡해 보인다.**
//
// 그림이 안 뜨거나 색이 undefined면 캔버스는 아무 말 없이 그냥 안 그린다.
// 게임은 돌아가고 아이도 논다. 며칠 뒤에야 "정글은 왜 바닥이 검지?" 하고 발견한다.
// 그래서 테마가 엔진이 읽는 것을 다 갖췄는지 여기서 잠근다.
//
// 똥 피하기가 `extra_data.exercise` 키를 빠뜨려 운동 통계에서 통째로 빠졌던 사고와
// 같은 종류다 — 조용히 없어지는 것이 제일 위험하다.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { EXERCISES } from '../src/progress/exercises.js'

// 테마 팩을 **스스로 찾는다.** 목록을 여기 적어두면 네 번째 테마를 만들 때 이 파일을
// 고치는 걸 잊고, 그 테마만 아무 검사 없이 지나간다 — 검사가 없는 게 제일 위험하다.
const PACKS = readdirSync('src/games')
  .filter(d => d.startsWith('runner-'))
  .map(pack => ({
    pack,
    theme: JSON.parse(readFileSync(`src/games/${pack}/theme.json`, 'utf8')),
    manifest: JSON.parse(readFileSync(`src/games/${pack}/manifest.json`, 'utf8')),
  }))

const themeOf = id => PACKS.find(p => p.theme.id === id).theme
const spaceTheme = themeOf('warmup-obstacle')

// 엔진이 실제로 읽는 것들. 코드에서 쓰는 자리가 늘면 여기도 늘어야 한다.
const UI_KEYS = [
  'title', 'startButton', 'startWord', 'missionComplete', 'podium',
  'menu', 'menuClose', 'fullscreen', 'exit', 'music', 'musicOff', 'sfxOn', 'sfxOff',
]
const PALETTE_KEYS = [
  'skyFallback', 'floorFar', 'floorMid', 'floorNear', 'floorSeam', 'floorGloss',
  'fog', 'toneLift', 'shadow',
  'curbTop', 'curbTopFar', 'curbFace', 'curbRim', 'curbLamp',
  'track', 'trackEdge', 'trackEdgeDark', 'trackSheen', 'laneNeon', 'chevron', 'chevronGlow',
]
// 알파를 붙여 쓰는 색은 `[r,g,b]` 배열이어야 한다 — 문자열이면 rgba() 조립이 깨진다.
const RGB_KEYS = ['floorSeam', 'floorGloss', 'fog', 'curbLamp', 'trackSheen', 'laneNeon', 'chevron', 'chevronGlow']

const POSES = ['lunge', 'forwardbend', 'armsopen']

// 테마 안의 모든 이미지 이름을 걷는다 (assets.js의 imageNames와 같은 규칙)
function allImageNames(t) {
  const out = new Set()
  const walk = v => {
    if (typeof v === 'string') out.add(v)
    else if (Array.isArray(v)) v.forEach(walk)
    else if (v && typeof v === 'object') Object.values(v).forEach(walk)
  }
  walk(t.sprites); walk(t.ui)
  for (const p of [...t.world.props.left, ...t.world.props.right,
                   ...t.world.horizonFillers, ...t.world.skyDeco]) out.add(p.name)
  out.add(t.world.sky); out.add(t.world.skyline); out.add(t.world.curbStar)
  for (const n of t.images ?? []) out.add(n)
  return [...out].filter(Boolean)
}

describe.each(PACKS)('테마 규격 — $pack', ({ theme, manifest }) => {
  it('id가 manifest와 같다', () => {
    // 다르면 기록이 엉뚱한 게임 이름으로 쌓인다. stats.js가 테마의 id를 쓴다.
    expect(theme.id).toBe(manifest.id)
  })

  it('assetBase가 있고 슬래시로 끝나지 않는다', () => {
    expect(theme.assetBase).toMatch(/^\/assets\/runner\/[a-z-]+$/)
  })

  it('캐릭터 스프라이트가 다 있다', () => {
    const c = theme.sprites.character
    expect(c.idle.length).toBeGreaterThanOrEqual(1)
    expect(c.run.length).toBeGreaterThanOrEqual(2)
    for (const k of ['jumpPrep', 'jumpAir', 'slide']) expect(c[k]).toBeTruthy()
    for (const p of POSES) expect(c.pose[p]).toBeTruthy()
  })

  it('장애물 스프라이트가 다 있다', () => {
    const o = theme.sprites.obstacle
    for (const k of ['cubeLeft', 'cubeCenter', 'cubeRight', 'hurdleLow', 'hurdleWide', 'archGate']) {
      expect(o[k], k).toBeTruthy()
    }
    for (const p of POSES) expect(o.poseSign[p], p).toBeTruthy()
  })

  it('방향 힌트 사인판 다섯 개가 다 있다', () => {
    for (const k of ['left', 'right', 'up', 'down', 'pose']) {
      expect(theme.sprites.hint[k], k).toBeTruthy()
    }
  })

  it('UI 그림이 다 있다', () => {
    for (const k of UI_KEYS) expect(theme.ui[k], k).toBeTruthy()
    expect(theme.ui.countdown).toHaveLength(3)
    // 레벨은 CONFIG.levels가 5개다. 모자라면 마지막 것을 쓰지만 선언은 채워둔다.
    expect(theme.ui.levelComplete.length).toBeGreaterThanOrEqual(5)
  })

  it('팔레트가 다 있고, 알파를 붙이는 색은 [r,g,b] 배열이다', () => {
    for (const k of PALETTE_KEYS) expect(theme.world.palette[k], k).toBeDefined()
    for (const k of RGB_KEYS) {
      const v = theme.world.palette[k]
      expect(Array.isArray(v), `${k}는 [r,g,b] 배열이어야 한다`).toBe(true)
      expect(v).toHaveLength(3)
    }
  })

  it('좌우 프롭 목록이 넉넉하다', () => {
    // 목록이 짧으면 통 한 바퀴가 오브젝트 수명보다 빨리 돌아 같은 것이 한 화면에 둘 선다.
    // 화면에 살아 있는 개수는 대략 travel(3.6s) / gap(0.46s) × 2줄 ≈ 15.
    for (const side of ['left', 'right']) {
      expect(theme.world.props[side].length, side).toBeGreaterThanOrEqual(10)
      for (const p of theme.world.props[side]) {
        expect(p.name, side).toBeTruthy()
        expect(p.h, `${p.name}.h`).toBeGreaterThan(0)
        if (p.tier) expect(['hero', 'mid', 'small']).toContain(p.tier)
      }
    }
  })

  it('manifest.metrics가 전부 운동 사전에 있다', () => {
    const known = new Set(EXERCISES.map(e => e.key))
    for (const m of manifest.metrics) expect(known, m).toContain(m)
  })

  it('선언한 그림 파일이 실제로 있다', () => {
    // 도형 플레이스홀더라도 있어야 한다. 없으면 그 자리가 조용히 빈다.
    // 테마 폴더 밖이 두 층이다 — `theme.js`의 img()와 같은 규칙으로 푼다.
    //   `ui/...`      앱 전체 공용 (똥 피하기·팝팝 클리커도 같이 쓴다)
    //   `_shared/...` 러너들끼리 공용
    // 캐릭터는 프로필별로 한 벌씩 있다 — **두 벌 다 있어야 한다.**
    // 한쪽만 채우면 그 프로필을 고른 아이 화면에서 주인공이 통째로 사라진다.
    const pathOf = n =>
      n.startsWith('ui/') ? `public/assets/${n}.png`
      : n.startsWith('_shared/char_') ? `public/assets/runner/_shared/char/boy/${n.slice(8)}.png`
      : n.includes('/') ? `public/assets/runner/${n}.png`
      : `public${theme.assetBase}/image/${n}.png`
    const girlPathOf = n => `public/assets/runner/_shared/char/girl/${n.slice(8)}.png`
    const names = allImageNames(theme)
    const missing = names.filter(n => !existsSync(pathOf(n)))
    expect(missing).toEqual([])

    const girlMissing = names.filter(n => n.startsWith('_shared/char_') && !existsSync(girlPathOf(n)))
    expect(girlMissing, '여자아이 캐릭터').toEqual([])
  })
})

// 두 테마가 **같은 이름**을 여럿 쓴다(`bg_sky` · `char_run01` · `signs_up` …).
// 그래서 테마를 바꿀 때 앞 테마 그림을 비우지 않으면 그 자리에 옛 그림이 그대로 나온다.
// 실제로 정글 하늘 자리에 우주 밤하늘이 떴다 — 게임은 멀쩡히 돌아서 더 헷갈렸다.
describe('테마를 바꾸면 그림도 바뀐다', () => {
  it('테마들이 같은 이름을 여럿 쓴다 (그래서 위험하다)', () => {
    const space = new Set(allImageNames(spaceTheme))
    for (const { pack, theme } of PACKS) {
      if (theme === spaceTheme) continue
      const shared = allImageNames(theme).filter(n => space.has(n))
      expect(shared.length, pack).toBeGreaterThan(10)
      expect(shared, pack).toContain('bg_sky')
    }
  })

  it('loadAssets가 앞 테마 그림을 비운다', async () => {
    const { setTheme } = await import('../src/games/runner/theme.js')
    const { IMG, loadAssets, assetsReadyFor } = await import('../src/games/runner/assets.js')

    // 브라우저 Image가 없으니 로드는 전부 실패한다. 비우는 동작만 본다.
    globalThis.Image = class { set src(_) { queueMicrotask(() => this.onerror?.()) } }

    // 테마를 차례로 갈아 끼우며, 앞 테마 그림이 남지 않는지 매번 확인한다.
    let prev = null
    for (const { pack, theme } of PACKS) {
      setTheme(theme)
      expect(assetsReadyFor(theme.id), `${pack}: 테마가 바뀌면 다시 불러야 한다`).toBe(false)
      await loadAssets()
      expect(IMG.bg_sky, `${pack}: 앞 테마(${prev}) 그림이 남아 있으면 안 된다`).toBeUndefined()
      expect(assetsReadyFor(theme.id), pack).toBe(true)
      IMG.bg_sky = { fake: pack }     // 로드된 척 — 다음 테마가 이걸 지워야 한다
      prev = pack
    }
  })
})

describe('모든 테마가 같은 엔진을 쓴다', () => {
  const shape = t => JSON.stringify(
    Object.fromEntries(Object.entries(t.sprites).map(([k, v]) =>
      [k, typeof v === 'object' && !Array.isArray(v) ? Object.keys(v).sort() : typeof v])))

  it('스프라이트 키 구조가 전부 같다', () => {
    // 한 테마에만 있는 키를 엔진이 읽을 리 없고, 빠진 키는 그 테마에서 터진다.
    for (const { pack, theme } of PACKS) expect(shape(theme), pack).toBe(shape(spaceTheme))
  })

  it('공용 UI는 테마마다 복사하지 않는다 ★', () => {
    // 방향 힌트·메뉴·음소거는 모든 게임에서 같은 그림이다. 테마마다 복사해 두면
    // 아이콘 하나를 고칠 때 한 곳을 빠뜨려 게임마다 다른 아이콘이 뜬다.
    for (const { pack, theme } of PACKS) {
      for (const [k, v] of Object.entries(theme.sprites.hint)) {
        expect(v, `${pack}.hint.${k}`).toMatch(/^_shared\//)
      }
      for (const k of ['menu', 'menuClose', 'fullscreen', 'exit', 'music', 'musicOff', 'sfxOn', 'sfxOff']) {
        expect(theme.ui[k], `${pack}.ui.${k}`).toMatch(/^_shared\//)
      }
      // START 버튼은 러너 밖(똥 피하기·팝팝 클리커)도 같이 쓴다 — `/assets/ui/` 한 장.
      // 테마 폴더로 되돌아오면 게임마다 다른 시작 버튼이 뜬다.
      for (const k of ['startButton', 'startButtonPressed']) {
        expect(theme.ui[k], `${pack}.ui.${k}`).toMatch(/^ui\//)
      }

      // ── 주인공은 한 아이다 ★ ─────────────────────────────
      //
      // 우주를 달리든 정글을 달리든 **같은 아이가 달린다.** 테마마다 캐릭터를
      // 복사해 두면 우주만 옛 그림이 남는 식으로 갈라지고, 아이는 게임을 옮길 때마다
      // 자기 캐릭터가 바뀌는 걸 본다. 배경이 테마고 주인공은 테마가 아니다.
      const flat = o => Array.isArray(o) ? o
        : typeof o === 'string' ? [o]
        : Object.values(o).flatMap(flat)
      for (const n of flat(theme.sprites.character)) {
        expect(n, `${pack}.sprites.character`).toMatch(/^_shared\//)
      }

      // ── 연출은 한 벌, 장애물은 테마의 것 ★ ────────────────
      //
      // 카운트다운 3-2-1 · 레벨 완료 · 시상대 · GO · 자세 실루엣은 **화면 위의 연출**이라
      // 세계와 상관이 없다. 게임마다 다르면 아이가 매번 다시 배운다.
      const shared = [
        ...flat(theme.sprites.poseSilhouette),
        ...theme.ui.countdown, ...theme.ui.levelComplete,
        theme.ui.missionComplete, theme.ui.podium, theme.ui.startWord,
      ]
      for (const n of shared) expect(n, `${pack} 공용 연출`).toMatch(/^_shared\//)

      // **장애물은 바닥에 놓인 물건이다.** 한때 우주의 보라 네온 큐브를 셋이 같이 쓰게
      // 했는데, 정글 흙바닥과 쥬라기 돌길 위에 놓으니 그 세계의 물건으로 안 보였다.
      // 출발선·관문과 같은 이유다 — 놓이는 것은 테마가 갖는다.
      for (const n of flat(theme.sprites.obstacle)) {
        expect(n, `${pack}.sprites.obstacle`).not.toMatch(/^_shared\//)
      }
      expect(theme.sprites.startLine, `${pack}.startLine`).not.toMatch(/^_shared\//)
    }
  })

  it('id와 에셋 폴더가 서로 겹치지 않는다', () => {
    // id가 겹치면 두 게임의 운동 기록이 한 통에 섞인다. 되돌리기 어렵다.
    const ids = PACKS.map(p => p.theme.id)
    const bases = PACKS.map(p => p.theme.assetBase)
    expect(new Set(ids).size, ids.join(' ')).toBe(ids.length)
    expect(new Set(bases).size, bases.join(' ')).toBe(bases.length)
  })

  it('테마가 둘 이상이다', () => {
    // 하나뿐이면 위의 검사들이 전부 자기 자신과 비교하느라 아무것도 못 잡는다.
    expect(PACKS.length).toBeGreaterThan(1)
  })

  it('러너 엔진 코드에 에셋 경로가 박혀 있지 않다', () => {
    // 여기 하나라도 남으면 그 화면은 테마를 바꿔도 우주 그림을 쓴다.
    const files = [
      'src/games/runner/screens.js', 'src/games/runner/main.js',
      'src/games/runner/legacy-shell.js', 'src/games/runner/audio.js',
      'src/games/runner/assets.js', 'src/games/runner/style.css',
      'src/games/runner/game/world.js', 'src/games/runner/game/obstacles.js',
      'src/games/runner/game/character.js',
    ]
    const bad = files.filter(f => /\/assets\/runner\//.test(readFileSync(f, 'utf8')))
    expect(bad).toEqual([])
  })
})
