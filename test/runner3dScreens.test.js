import { describe, it, expect, vi } from 'vitest'
import fs from 'node:fs'
import { showTitle3d, showTutorial3d } from '../src/games/runner3d/screens.js'
import { CUE } from '../src/games/runner/ui/cues.js'

const manifest = {
  id: 'test-runner', title: '테스트 러너',
  hero: '/assets/runner/jurassic/image/fx_title_screen.png',
  titleBg: '/assets/runner/jurassic/image/fx_title_bg.png',
  logo: '/assets/runner/jurassic/image/fx_title_logo.png',
}

/** 첫 장을 다 채워 둘째 장으로 넘긴다. */
const fillPage1 = async fire => {
  for (const k of ['left', 'jump', 'duck']) fire(k)
  await new Promise(r => setTimeout(r, 900))
}

/** 튜토리얼은 결과를 돌려준다 — 다 하면 `'done'`이다. */
const tut = (app, opts) => showTutorial3d(app, manifest, { subscribe: () => () => {}, ...opts })

const host = () => {
  document.body.innerHTML = '<div id="app"></div>'
  return document.querySelector('#app')
}

describe('3D 러너 앞 화면 ★', () => {
  it('타이틀은 시작을 눌러야 넘어간다', async () => {
    const app = host()
    let got = null
    showTitle3d(app, manifest).then(r => { got = r })
    await Promise.resolve()
    expect(got, '누르기 전에 넘어갔다').toBe(null)
    app.querySelector('#r3-start').click()
    await Promise.resolve()
    expect(got).toBe('start')
    expect(app.querySelector('#r3-title'), '화면이 안 지워졌다').toBe(null)
  })

  it('아이 화면이므로 손 커서로 눌린다', async () => {
    // `CLAUDE.md`: 아이 화면은 전부 손 커서로 되어야 한다(`data-pz-hit`).
    const app = host()
    showTitle3d(app, manifest)
    expect(app.querySelector('#r3-start').hasAttribute('data-pz-hit')).toBe(true)
    showTutorial3d(app, manifest, { subscribe: () => () => {} })
    expect(app.querySelector('#r3-tut-skip').hasAttribute('data-pz-hit')).toBe(true)
  })

  it('★ 튜토리얼 그림은 판에서 만날 것과 같다', () => {
    // 다른 그림을 보여주면 아이가 배운 것과 판에서 만나는 것이 달라진다.
    // 게임팩이 장애물 그림을 주면 그걸 쓰고, 없으면 인게임 힌트 팻말로 물러난다.
    const src = fs.readFileSync('src/games/runner3d/screens.js', 'utf8')
    expect(src).toMatch(/from '\.\.\/runner\/ui\/cues\.js'/)
    for (const k of ['CUE.right', 'CUE.up', 'CUE.down', 'CUE.pose']) {
      expect(src, `${k}를 안 쓴다`).toContain(k)
    }
    // 쥬라기는 실제 장애물 그림을 갖고 있다 — 파일이 있는지까지 본다
    const m = JSON.parse(fs.readFileSync('src/games/jurassic-run-3d/manifest.json', 'utf8'))
    for (const [k, p] of Object.entries({ ...m.tutorialArt, ...m.poseArt })) {
      expect(fs.existsSync(`public${p}`), `${k} (${p})가 없다`).toBe(true)
    }
  })

  it('★ 타이틀 배경은 **글자 없는 판**이다', () => {
    // `hero`(허브 썸네일)에는 게임 로고가 박혀 있다. 그걸 깔고 위에 로고를
    // 또 얹으면 타이틀이 두 겹으로 겹친다 — 실제로 그렇게 보였다.
    const m = JSON.parse(fs.readFileSync('src/games/jurassic-run-3d/manifest.json', 'utf8'))
    expect(m.titleBg, 'titleBg가 없다').toBeTruthy()
    expect(m.titleBg).not.toBe(m.hero)
    expect(fs.existsSync(`public${m.titleBg}`), '배경 파일이 없다').toBe(true)
  })

  it('★ 허브로 나가는 길도 **약속을 푼다**', async () => {
    // 콜백으로만 알리고 `resolve`를 안 했더니, 부르는 쪽이 `await`에서
    // 영원히 멈췄다. 화면은 비고 그 아래 직전 게임의 배경이 드러나
    // "똥 피하기 배경이 나온다"로 보였다(8/26).
    const app = host()
    let got = null
    showTitle3d(app, manifest).then(r => { got = r })
    await Promise.resolve()
    app.querySelector('#pz-home').click()
    await Promise.resolve()
    expect(got, '허브를 눌렀는데 약속이 안 풀렸다').toBe('hub')
    expect(app.querySelector('#r3-title'), '화면이 안 지워졌다').toBe(null)
  })

  it('★ 화면을 떠나는 길이 둘이면 결과도 둘이다', async () => {
    // 어느 쪽으로 나가든 `await`가 풀려야 한다 — 한쪽만 풀면 그 길에서 멈춘다.
    for (const [id, want] of [['r3-start', 'start'], ['pz-home', 'hub']]) {
      const app = host()
      let got = null
      showTitle3d(app, manifest).then(r => { got = r })
      await Promise.resolve()
      app.querySelector(`#${id}`).click()
      await Promise.resolve()
      expect(got, `${id}에서 안 풀렸다`).toBe(want)
    }
  })

  it('인트로에도 햄버거 메뉴가 있다 — 종료 버튼은 안 보인다', async () => {
    // 타이틀에서 나가는 길은 왼쪽 위 Home이지 종료가 아니다.
    // 아직 판이 시작되지 않아 저장할 운동도 없다.
    const app = host()
    showTitle3d(app, manifest)
    expect(app.querySelector('#pz-menu'), '메뉴가 없다').toBeTruthy()
    expect(app.querySelector('#pz-music'), '음악 버튼이 없다').toBeTruthy()
    expect(app.querySelector('#pz-home').classList.contains('hidden'), 'Home이 숨겨져 있다').toBe(false)
    expect(app.querySelector('#pz-exit').classList.contains('hidden'), '타이틀에 종료 버튼이 보인다').toBe(true)
  })

  it('★ 메뉴 아이콘은 **햄버거 안에** 있다 — 처음엔 닫혀 있다', () => {
    // 타이틀이 자기만의 메뉴(`#r3-menu-panel`)를 따로 그렸을 때, 닫는 CSS는
    // 공용 id(`#pz-menu-panel`)에만 걸려 있어서 **패널이 늘 펼쳐진 채**
    // 아이콘 셋이 화면 오른쪽에 그대로 나와 있었다(8/27).
    const app = host()
    showTitle3d(app, manifest)
    const panel = app.querySelector('#pz-menu-panel')
    expect(panel, '메뉴 패널이 없다').toBeTruthy()
    expect(panel.classList.contains('hidden'), '메뉴가 처음부터 열려 있다').toBe(true)

    app.querySelector('#pz-menu').click()
    expect(panel.classList.contains('hidden'), '눌러도 안 열린다').toBe(false)
  })

  it('★ 튜토리얼에는 메뉴·나가기가 있고 **Home은 없다**', async () => {
    // 앞뒤로 오가는 화면에 한 번에 밖으로 나가는 문까지 두면 고를 것이 셋이
    // 된다(뒤로 · 건너뛰기 · Home). 4~8세에게 셋이면 하나는 잘못 눌린다.
    // 허브로 가는 길은 남아 있다 — 나가기 → 확인창의 "Home으로".
    const app = host()
    tut(app)
    await Promise.resolve()
    expect(app.querySelector('#pz-menu'), '메뉴가 없다').toBeTruthy()
    expect(app.querySelector('#pz-exit').classList.contains('hidden'), '나가기가 없다').toBe(false)
    expect(app.querySelector('#pz-home').classList.contains('hidden'), 'Home이 아직 보인다').toBe(true)
    expect(app.querySelector('#pz-quit-home'), '허브로 가는 길이 아예 없다').toBeTruthy()
  })

  it('★ 뒤로는 **한 장씩** 간다 — 첫 장에서는 카메라 준비로', async () => {
    // 카메라 준비 화면의 "뒤로"와 같은 자리(아래 줄, 건너뛰기 옆)에 둔다.
    const app = host()
    let got = null
    tut(app).then(r => { got = r })
    await Promise.resolve()

    // 둘째 장으로 넘어갔다가 뒤로 → 첫 장
    app.querySelector('#r3-tut-skip').click()
    await new Promise(r => setTimeout(r, 20))
    expect(app.querySelector('#r3-tut h2').textContent).toContain('COPY THE POSE')
    app.querySelector('#r3-tut-back').click()
    await new Promise(r => setTimeout(r, 20))
    expect(app.querySelector('#r3-tut h2').textContent, '첫 장으로 안 돌아왔다').toContain('몸을 움직여')
    expect(got, '한 장 뒤로 갔는데 화면이 통째로 끝났다').toBe(null)

    // 첫 장에서 뒤로 → 화면 밖(카메라 준비)
    app.querySelector('#r3-tut-back').click()
    await new Promise(r => setTimeout(r, 20))
    expect(got).toBe('back')
  })

  it('★ 나가기는 **이 게임의 처음**으로, Home은 허브로', async () => {
    // 나가기 한 번에 허브까지 나가면, 한 번 더 하고 싶어 누른 아이가
    // 게임 밖으로 튕긴다. 한 단계씩 뒤로 간다.
    for (const [id, want] of [['pz-quit', 'title'], ['pz-quit-home', 'hub']]) {
      const app = host()
      let got = null
      tut(app).then(r => { got = r })
      await Promise.resolve()
      app.querySelector('#pz-exit').click()      // 확인창을 거친다
      expect(app.querySelector('#pz-confirm').classList.contains('hidden')).toBe(false)
      app.querySelector(`#${id}`).click()
      // `showTutorial3d`가 한 장을 `await`한 뒤 결과를 그대로 넘기므로
      // 마이크로태스크 한 번으로는 안 풀린다
      await new Promise(r => setTimeout(r, 0))
      expect(got, `${id}에서 안 풀렸다`).toBe(want)
    }
  })

  it('모서리 버튼은 **가운데로 안 끌려온다**', () => {
    // `.r3s`가 flex 가운데 정렬이라, `position: relative`를 덮어씌우면
    // 왼쪽 위에 둔 버튼이 화면 한가운데로 온다 — 실제로 그랬다.
    const src = fs.readFileSync('src/games/runner3d/screens.js', 'utf8')
    expect(src, '모서리 요소를 relative에서 제외하지 않았다')
      .toContain(':not(.r3s-corner)')
  })

  it('★ 두 장이다 — 움직임과 자세는 성격이 다르다', async () => {
    // 넷을 한 장에 몰면 카드가 작아지고, 순간 동작(옆·점프·앉기)과
    // 잠깐 유지하는 자세가 섞인다. 2.5D 러너도 두 장이다.
    const app = host()
    let fire = null
    let done = false
    showTutorial3d(app, manifest, { subscribe: cb => { fire = cb; return () => {} } })
      .then(() => { done = true })
    await Promise.resolve()

    expect(app.querySelectorAll('.r3s-card'), '첫 장은 셋이다').toHaveLength(3)
    for (const k of ['jump', 'duck']) fire(k)
    await Promise.resolve()
    expect(done, '아직 좌우가 남았다').toBe(false)

    await fillPage1(fire)
    expect(done, '첫 장에서 끝나 버렸다').toBe(false)
    expect(app.querySelector('#r3-tut h2').textContent).toContain('COPY THE POSE')
    expect(app.querySelectorAll('.r3s-card'), '둘째 장도 셋이다').toHaveLength(3)

    for (const p of ['lunge', 'forwardbend', 'armsopen']) fire(p)
    await new Promise(r => setTimeout(r, 900))
    expect(done).toBe(true)
  })

  it('★ 좌우는 하나로 친다 — 왼쪽만 되는 아이를 가두지 않는다', async () => {
    const app = host()
    let fire = null
    showTutorial3d(app, manifest, { subscribe: cb => { fire = cb; return () => {} } })
    await Promise.resolve()
    fire('left')
    expect(app.querySelector('#r3-tc-side').classList.contains('done')).toBe(true)
    // 오른쪽을 따로 안 시킨다 — 첫 장의 카드는 셋뿐이다
    expect(app.querySelectorAll('.r3s-card')).toHaveLength(3)
  })

  it('★ 건너뛰기가 **장마다** 열려 있다', async () => {
    // 2.5D도 장마다 건너뛰기가 있다. 한 번에 전부 건너뛰게 하면, 자세만
    // 어려운 아이가 앞의 셋까지 못 해보고 지나간다.
    const app = host()
    let done = false
    showTutorial3d(app, manifest, { subscribe: () => () => {} }).then(() => { done = true })
    await Promise.resolve()

    app.querySelector('#r3-tut-skip').click()
    await new Promise(r => setTimeout(r, 20))
    expect(done, '한 번에 전부 건너뛰었다').toBe(false)
    expect(app.querySelector('#r3-tut h2').textContent).toContain('COPY THE POSE')

    app.querySelector('#r3-tut-skip').click()
    await new Promise(r => setTimeout(r, 20))
    expect(done).toBe(true)
  })

  it('나갈 때 구독을 뗀다 — 지나간 화면이 계속 듣고 있으면 안 된다', async () => {
    const app = host()
    const off = vi.fn()
    showTutorial3d(app, manifest, { subscribe: () => off })
    await Promise.resolve()
    app.querySelector('#r3-tut-skip').click()
    await Promise.resolve()
    expect(off).toHaveBeenCalledOnce()
  })
})

describe('앞 화면의 순서 ★', () => {
  const play = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')

  it('타이틀 → 카메라 준비 → 튜토리얼 순이다', () => {
    // 튜토리얼은 **카메라 다음**이다. 앞에 두면 몸을 움직여 보라고 해 놓고
    // 카메라가 아직 안 켜져 있다.
    const a = play.indexOf('showTitle3d(')
    const b = play.indexOf('showReadyScreen(')
    const c = play.indexOf('showTutorial3d(')
    expect(a).toBeGreaterThan(-1)
    expect(b, '준비 화면이 타이틀보다 먼저다').toBeGreaterThan(a)
    expect(c, '튜토리얼이 카메라보다 먼저다').toBeGreaterThan(b)
  })

  it('★ 튜토리얼 다음은 **바로 카운트다운**이다 — 안내 화면이 없다', () => {
    // 안내 화면(`mountGuide`)이 여기 있었다. 방금 튜토리얼에서 세 동작을 직접
    // 해보고 온 아이에게 같은 말을 글로 한 번 더 읽히는 셈이었고, 넘기려면
    // 버튼을 한 번 더 눌러야 했다. 몸으로 하는 게임에서 화면이 하나 늘면
    // 그만큼 안 움직이는 시간이 는다.
    const code = play.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
    expect(code, '안내 화면이 아직 있다').not.toContain('mountGuide')
    expect(code, '카운트다운을 안 부른다').toContain('runCountdown(')
  })

  it('★ 뒤로 가는 길이 **한 단계씩**이다', () => {
    // 튜토리얼 ─뒤로→ 카메라 준비 ─뒤로→ 타이틀 ─Home→ 허브.
    // 고리가 하나면 튜토리얼의 "뒤로"가 타이틀까지 튕겨 나간다.
    const code = play.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
    expect(code, '바깥 고리에 이름이 없다 — 한 단계씩 못 돌아간다').toMatch(/title:\s*for\s*\(/)
    expect(code, "튜토리얼의 'back'을 안 받는다").toMatch(/way === 'back'/)
    expect(code, '카메라 준비의 back과 튜토리얼의 back이 같은 곳으로 간다')
      .toMatch(/continue title/)
  })

  it('★ 튜토리얼을 **매 판** 띄운다 — 2.5D와 같다', () => {
    // `hasSeenTutorial`로 막았더니 한 번 보고 나면 다시는 안 떴다.
    // 2.5D 러너 셋은 매 판 띄운다 — 넘어가는 데 1초도 안 걸리고,
    // 몸으로 하는 게임에서는 판 시작 전에 한 번 움직여 보는 것이 준비운동이다.
    // 주석은 뺀다 — "왜 뺐는지"는 남아 있어야 한다
    const code = play.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
    expect(code, '튜토리얼을 한 번만 띄운다').not.toContain('hasSeenTutorial')
  })
})

describe('3D 엔진은 게임 이름을 모른다 ★', () => {
  it('`game_id`를 엔진에 박지 않는다', () => {
    // 러너를 전부 3D로 옮기기로 한 이상, 박아 두면 두 번째 3D 게임의 운동
    // 데이터가 쥬라기 기록에 합쳐진다. 섞인 것은 되돌릴 수 없다(`CLAUDE.md`).
    // 주석은 뺀다 — "전에는 여기 박혀 있었다"는 기록은 남아야 한다
    const engine = fs.readFileSync('src/games/runner3d/play3d.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n')
    expect(engine, '엔진에 게임 id가 적혀 있다').not.toContain("'jurassic-run-3d'")
    expect(engine, '게임팩이 넘긴 manifest를 안 쓴다').toContain('makeRunner3dPlay(manifest)')
  })

  it('게임팩이 자기 manifest를 넘긴다', () => {
    const pack = fs.readFileSync('src/games/jurassic-run-3d/play.js', 'utf8')
    expect(pack).toContain("import manifest from './manifest.json'")
    expect(pack).toContain('makeRunner3dPlay(manifest)')
  })
})
