// 결승 포털과 엔딩 — **끝까지 깬 아이만 보는 것들.** ★
//
// 화면으로 확인이 안 되는 자리라 특히 조용히 깨진다. 마지막 레벨을 다 달려야
// 나오는 물건이고, 어른이 테스트할 때는 거기까지 잘 안 간다.

import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import { DOOR, FIRE } from '../src/games/runner3d/portal.js'
import { KINDS } from '../src/games/runner3d/obstacles3d.js'
import { ACTION } from '../src/games/runner3d/judge.js'
import { showEnding, showGameOver } from '../src/core/gameShell.js'
import { CUE, CHEER } from '../src/games/runner/ui/cues.js'

const manifest = JSON.parse(fs.readFileSync('src/games/jurassic-run-3d/manifest.json', 'utf8'))
const play = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
const scene = fs.readFileSync('src/games/runner3d/scene.js', 'utf8')
const noComments = s => s.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')

describe('결승 포털 ★', () => {
  it('그림 파일이 있다', () => {
    expect(fs.existsSync('public/assets/runner3d/obstacles/finish_portal.glb'),
      'finish_portal.glb가 없다 — tools/blender/import_ai.py를 돌린다').toBe(true)
  })

  it('★ 인스턴싱 통에 **안 들어간다**', () => {
    // 하나뿐이고, 문은 반짝이고 불은 흔들린다. `InstancedMesh`는 인스턴스마다
    // 다른 재질·다른 시간을 못 준다 — 넣으면 문이 죽은 판때기가 된다.
    expect(KINDS.archGate, '아직 장애물 통에 있다').toBeUndefined()
    // 판정에는 남아 있어야 한다. 빠지면 결승선을 지나도 아무 일도 안 일어난다.
    expect(ACTION).toHaveProperty('archGate')
    expect(ACTION.archGate, '결승선이 무언가를 시킨다').toBe(null)
  })

  it('★ 문 자리는 **블렌더가 잰 값**이다', () => {
    // 손으로 적으면 모델을 다시 뽑을 때 조용히 어긋난다 — 문은 벽에 남고
    // 빛만 허공에 뜬다. `import_ai.py`가 `door`로 돌려주는 숫자를 옮겨 적는다.
    expect(DOOR.w).toBeGreaterThan(4)
    expect(DOOR.h).toBeGreaterThan(8)
    // 문 아래끝이 땅에 닿아야 한다. 떠 있으면 아이가 문 밑으로 지나간다.
    expect(Math.abs(DOOR.y - DOOR.h / 2), '문이 땅에서 떴다').toBeLessThan(0.4)
    // 불은 문보다 훨씬 위 — 탑 꼭대기(20.17)다
    expect(FIRE.base).toBeGreaterThan(DOOR.y + DOOR.h / 2)
    // 좌우 한 쌍이고, 문 구멍(±2.7) 밖 · 포털 반폭(10.5) 안이어야 탑 위다.
    // 어림으로 8.35를 적었더니 불이 탑 바깥 허공에 떠 있었다 — 그래서 쟀다.
    expect(FIRE.x).toBeGreaterThan(5)
    expect(FIRE.x).toBeLessThan(10.5)
    // 문은 뚫어 놓은 구멍(±2.7) 안에 들어가야 한다. 넘치면 돌 프레임을 뚫는다
    expect(DOOR.w / 2, '문이 구멍보다 넓다').toBeLessThan(2.7)
  })

  it('★ 문 뒤가 **뚫려 있어야** 통과다', () => {
    // 받은 모델은 뒷면이 벽이었다. 안 뚫으면 아이가 문을 지나는 게 아니라
    // 벽에 부딪히는 그림이 된다 — 결승선인데 통과가 안 되는 셈이다.
    const py = fs.readFileSync('tools/blender/import_ai.py', 'utf8')
    expect(py).toMatch(/"finish_portal":\s*dict\(/)
    const spec = py.slice(py.indexOf('"finish_portal"'))
    expect(spec, '뒷벽을 뚫는 상자가 없다').toContain('cut=dict(')
    expect(spec, '문짝을 빼내지 않는다').toContain('door=dict(')
    expect(spec, '부품 59개를 한 장으로 안 묶는다').toContain('atlas=True')
  })

  it('★ 문은 **빛이라 뒤를 안 가린다**', () => {
    const src = fs.readFileSync('src/games/runner3d/portal.js', 'utf8')
    // 깊이를 쓰면 판 뒤의 길이 지워진다 — 그러면 문이 아니라 노란 벽이다
    expect(noComments(src), 'depthWrite를 안 껐다').toMatch(/depthWrite:\s*false/)
    expect(noComments(src), '가산 합성이 아니다').toContain('AdditiveBlending')
    // 세계와 같은 곡률을 받아야 한다. 안 받으면 문만 안 휘어 떠 보인다
    expect(src).toContain('uCurve')
  })

  it('★ 문 앞에서는 가운데 레인으로 모은다', () => {
    // 문은 5.83이고 트랙은 15다. 바깥 레인으로 온 아이는 문이 아니라 기둥에
    // 박힌다 — 마지막에 "피하기"를 하나 더 시키는 셈이다.
    expect(noComments(scene), '깔때기가 없다').toMatch(/PORTAL_FUNNEL/)
    expect(noComments(scene)).toMatch(/character\.setLane\(1\)/)
  })
})

describe('엔딩 → 결과 ★', () => {
  it('엔딩 그림이 다 있다', () => {
    expect(manifest.endingBg, 'endingBg가 없다').toBeTruthy()
    expect(fs.existsSync(`public${manifest.endingBg}`), '엔딩 그림 파일이 없다').toBe(true)
    expect(fs.existsSync(`public${CUE.missionComplete}`)).toBe(true)
    // 만세 그림은 **캐릭터 세트 안**에 있다 — 따로 두면 캐릭터를 바꿀 때
    // 한 장이 옛 그림으로 남는다
    expect(CHEER).toHaveLength(2)
    for (const p of CHEER) {
      expect(p, '캐릭터 폴더 밖에 있다').toContain('/char/')
      expect(fs.existsSync(`public${p}`), `${p}가 없다`).toBe(true)
    }
  })

  it('★ 결승선은 마지막 장애물과 **충분히 떨어져** 있다', () => {
    // 1.5초였다. 자세를 잡고 있던 아이가 팻말을 지나자마자 결승선이 코앞이라
    // 끝났다는 걸 알아차릴 새가 없었다.
    const { CONFIG } = require('../src/games/runner/config.js')
    expect(CONFIG.course.finishGap, '결승선 여유가 너무 짧다').toBeGreaterThanOrEqual(4)
    // **speed로 안 나눈다** — 연출이라 레벨이 빨라져도 같은 시간이어야 한다.
    // 나누면 하필 결승선이 나오는 마지막 레벨에서 제일 짧아진다.
    const course = fs.readFileSync('src/games/runner/game/course.js', 'utf8')
    expect(course).toMatch(/lastHitTime \+ C\.finishGap/)
    expect(course, 'finishGap을 speed로 나눴다').not.toMatch(/C\.finishGap\s*\/\s*speed/)
  })

  it('★ 꽃가루가 화면을 **안 막는다**', () => {
    // 엔딩은 아무 데나 눌러 넘어갈 수 있어야 하는데, 꽃가루 캔버스가 그
    // 클릭을 먹으면 아이는 화면이 멈춘 줄 안다.
    const src = fs.readFileSync('src/core/confetti.js', 'utf8')
    expect(src).toContain('pointer-events:none')
    // 2D 컨텍스트가 없는 환경(jsdom·구형 기기)에서 **조용히 넘어가야** 한다.
    // 꽃가루가 없다고 엔딩이 안 뜨면 그게 더 큰 문제다.
    expect(src).toMatch(/if \(!ctx\)/)
  })

  it('★ 엔딩은 **끝까지 깼을 때만** 뜬다', () => {
    // 목숨이 다한 아이에게 축하 화면을 띄우면 축하가 아니라 놀림이다.
    const code = noComments(play)
    const at = code.indexOf('showEnding(')
    const guard = code.indexOf('if (!cleared)')
    expect(at, '엔딩을 안 부른다').toBeGreaterThan(-1)
    expect(guard, '못 깬 경우를 안 가른다').toBeGreaterThan(-1)
    expect(guard, '가르기가 엔딩보다 뒤에 있다').toBeLessThan(at)
  })

  it('★ 문을 **지난 뒤**에 끝난다', () => {
    // 판정은 문 앞에서 걸린다. 거기서 바로 끝내면 화면이 문 앞에서 툭 끊겨
    // 통과한 그림이 아니라 막힌 그림이 된다.
    const code = noComments(play)
    expect(code, '포털을 지나는 시간이 없다').toContain('PASS_MS')
    expect(code, '포털에서 바로 끝낸다').toMatch(/archGate'\s*\)\s*\{\s*passThrough\(\)/)
  })

  it('엔딩은 눌러도 넘어가고 안 눌러도 넘어간다', async () => {
    // 글자를 못 읽는 아이가 버튼을 못 찾아 멈춰 있으면 안 된다.
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    const { el, done } = showEnding(host, {
      bg: '/x.png', art: '/y.png', cast: ['/a.png', '/b.png'], sec: 0.05,
    })
    expect(host.querySelector('.pz-ending')).toBeTruthy()
    expect(el.style.backgroundImage).toContain('/x.png')
    // 아이는 좌우 하나씩. 배너보다 **뒤에** 서야 읽을 것이 안 가린다
    expect(el.querySelectorAll('.pz-ending-kid')).toHaveLength(2)
    expect(el.querySelector('.pz-ending-kid.left')).toBeTruthy()
    expect(el.querySelector('.pz-ending-kid.right')).toBeTruthy()
    await done
    expect(host.querySelector('.pz-ending'), '스스로 안 사라졌다').toBe(null)
  })

  it('★ 아이는 **둘까지만** 선다', () => {
    // 셋이면 배너를 가린다. 넘겨도 안 터지고 앞의 둘만 쓴다.
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    const { el } = showEnding(host, { cast: ['/a.png', '/b.png', '/c.png'], sec: 0.05 })
    expect(el.querySelectorAll('.pz-ending-kid')).toHaveLength(2)
  })

  it('★ 엔딩이 뜨자마자 눌리지 않는다', async () => {
    // 문을 지나며 누르고 있던 손가락이 엔딩을 스치고 지나간다 —
    // 실제로 결과 화면이 곧바로 떴다.
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    let gone = false
    const { el, done } = showEnding(host, { sec: 5 })
    done.then(() => { gone = true })
    el.click()
    await new Promise(r => setTimeout(r, 20))
    expect(gone, '뜨자마자 눌려서 넘어갔다').toBe(false)
  })
})

// ── showGameOver의 bg/scoreBlock/sparkle — 게임팩별 조건부 꾸미기(STEP 90) ★
// 오디세이 런이 "공용 Result처럼 보인다"고 해서 옵션 셋을 추가했다. 셋 다
// **기본값이 꺼짐**이므로 기존 호출(쥬라기 등, 옵션 안 줌)이 예전과 완전히
// 같은 화면을 받는지가 핵심 회귀 포인트다.
describe('showGameOver — bg/scoreBlock/sparkle (STEP 90) ★', () => {
  it('옵션을 안 주면(기존 호출) 예전 그대로다 — .pz-line + 테마 클래스 없음', () => {
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    const el = showGameOver(host, { title: '다 달렸어요!', line: '점수 100 · 최고 연속 5' })
    expect(el.className).toBe('pz-veil pz-over')   // pz-over-themed 없음
    expect(el.querySelector('.pz-line')?.textContent).toBe('점수 100 · 최고 연속 5')
    expect(el.querySelector('.pz-score-block')).toBeNull()
    expect(el.querySelector('.pz-over-bg')).toBeNull()
    expect(el.querySelector('.pz-over-overlay')).toBeNull()
  })

  it('★ bg를 주면 배경 그림 + 오버레이가 생기고 테마 클래스가 붙는다', () => {
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    const el = showGameOver(host, { title: '오디세이 런 완주!', bg: '/thumb.webp' })
    expect(el.className).toContain('pz-over-themed')
    const bgEl = el.querySelector('.pz-over-bg')
    expect(bgEl).toBeTruthy()
    expect(bgEl.style.backgroundImage).toContain('/thumb.webp')
    expect(el.querySelector('.pz-over-overlay')).toBeTruthy()
  })

  it('★ scoreBlock을 주면 SCORE/BEST STREAK이 실제 값 그대로 뜨고 .pz-line은 안 뜬다', () => {
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    const el = showGameOver(host, {
      title: '오디세이 런 완주!', line: '이건 안 보여야 한다',
      scoreBlock: { score: 33150, streak: 168 },
    })
    expect(el.querySelector('.pz-line')).toBeNull()
    const rows = el.querySelectorAll('.pz-score-row')
    expect(rows).toHaveLength(2)
    expect(el.querySelector('.pz-score-block').textContent).toContain('33,150')
    expect(el.querySelector('.pz-score-block').textContent).toContain('168')
    expect(el.querySelector('.pz-score-block').textContent).toContain('SCORE')
    expect(el.querySelector('.pz-score-block').textContent).toContain('BEST STREAK')
  })

  it('sparkle:true라도 버튼 클릭이 안 터진다 (jsdom엔 2D 캔버스가 없어 조용히 no-op)', () => {
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    let again = false
    const el = showGameOver(host, {
      title: '오디세이 런 완주!', bg: '/thumb.webp', sparkle: true,
      onAgain: () => { again = true },
    })
    expect(() => el.querySelector('[data-act="again"]').click()).not.toThrow()
    expect(again).toBe(true)
  })

  // ── 중앙 콘텐츠 배경 박스(STEP 92) ★ — ken 지적: "중앙 콘텐츠가 그냥
  // 붕 떠 있는 느낌". themed(bg 있음)일 때만 제목·점수·버튼을 .pz-over-box
  // 하나로 묶는다 — 기본 결과 화면(bg 없음, 쥬라기 등)은 이 래퍼 없이
  // 예전과 완전히 같은 마크업이어야 회귀가 없다.
  it('★ bg가 있으면 제목·점수·버튼이 .pz-over-box 하나로 묶인다', () => {
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    const el = showGameOver(host, {
      title: '오디세이 런 완주!', bg: '/thumb.webp',
      scoreBlock: { score: 33150, streak: 168 },
    })
    const box = el.querySelector('.pz-over-box')
    expect(box, '.pz-over-box가 없다').toBeTruthy()
    expect(box.querySelector('h2')?.textContent).toBe('오디세이 런 완주!')
    expect(box.querySelector('.pz-score-block')).toBeTruthy()
    expect(box.querySelector('.pz-actions')).toBeTruthy()
    // 배경/오버레이는 박스 밖(형제)이다 — 박스 안에 또 배경을 깔지 않는다.
    expect(el.querySelector('.pz-over-bg').parentElement).toBe(el)
    expect(el.querySelector('.pz-over-overlay').parentElement).toBe(el)
  })

  it('bg가 없으면(기본 결과 화면) .pz-over-box 없이 예전과 같은 평평한 마크업이다', () => {
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    const el = showGameOver(host, {
      title: '다 달렸어요!', scoreBlock: { score: 100, streak: 5 },
    })
    expect(el.querySelector('.pz-over-box')).toBeNull()
    expect(el.querySelector('.pz-score-block')?.parentElement).toBe(el)
  })

  it('다시 하기/Home 버튼은 bg/scoreBlock/sparkle 여부와 무관하게 그대로 동작한다', () => {
    document.body.innerHTML = '<div id="h"></div>'
    const host = document.querySelector('#h')
    let again = false, quit = false
    const el = showGameOver(host, {
      title: '오디세이 런 완주!', bg: '/thumb.webp', scoreBlock: { score: 1, streak: 1 }, sparkle: true,
      onAgain: () => { again = true }, onQuit: () => { quit = true },
    })
    el.querySelector('[data-act="again"]').click()
    el.querySelector('[data-act="quit"]').click()
    expect(again).toBe(true)
    expect(quit).toBe(true)
  })
})
