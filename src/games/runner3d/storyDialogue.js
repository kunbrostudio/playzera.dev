// 스토리 대화 화면 — 인트로 · 아기 공룡 발견 · 엔딩. **쥬라기 대탐험(3D) 전용.**
//
// ── 왜 엔진이 아니라 여기 있나 ★ ─────────────────────────────
//
// `manifest.story`가 없으면 이 파일 자체를 아무도 안 부른다. 다른 러너3D
// 테마(우주 등)는 `play3d.js`에서 `manifest.story?.intro` 같은 존재 검사만
// 거치고 지나간다 — 엔진은 여전히 게임 이름도 스토리도 모른다(`CLAUDE.md`).
//
// ── 화면 모양은 새로 안 짠다 ──────────────────────────────────
//
// 타이틀·튜토리얼이 쓰는 `.r3s` 한 벌(`screens.js`)을 그대로 받아 쓴다.
// `mount`·`mutes`·`soundHandlers`가 거기서 export된 이유가 이것이다.
//
// ── 말하는 캐릭터 얼굴(speaker face) ★ ─────────────────────────
//
// 대사창 왼쪽에 붙는 작은 얼굴은 `manifest.story.cast`에서 온다 —
// `{ mom: { worried: url, joy: url }, baby: {...}, player: { boy: {...}, girl: {...} } }`
// 모양이다. 표정(mood)별로 그림이 늘어날 걸 전제로 짰다 — 지금은 `mom.worried`
// 하나뿐이지만, ken이 표정을 하나씩 그려서 보내는 대로 `cast`에 채우기만
// 하면 된다(코드는 안 바뀐다). `speaker: 'player'`는 지금 아이가 고른
// 프로필(`playerSkin`)로 boy/girl을 가른다 — 가입 성별이 아니라 게임 속
// 캐릭터 선택을 따른다(`CLAUDE.md`).
//
// 그림이 아직 없는 조합(`cast[speaker][mood]`가 undefined)은 **조용히
// 얼굴을 안 보여준다** — 이 그림은 연출이지 필수 자산이 아니다.
//
// ── 장면 연출(`scene.fx`) ★ ────────────────────────────────────
//
// `'quake'` — 위급한 장면(인트로·아기 공룡 발견). 배경만 작은 진폭으로
// 계속 흔들고(대사창·버튼은 안 흔든다 — 손 제스처 조준이 흔들리면 안 된다),
// 연기를 몇 개 흘리고, 장면이 뜰 때 폭발음을 한 번 낸다.
// `'confetti'` — 엔딩. 꽃가루를 터뜨리고 폭죽음을 내고, 장면이 떠 있는
// 동안 귀여운 성공 배경음악을 튼다. 둘 다 없으면 지금까지처럼 조용하다.
// `scene.stinger === 'start'`는 `fx`와 별개다 — 인트로의 마지막 장면처럼
// "이제 판이 시작된다"를 알리는 신호음이 필요할 때만 얹는다.

const rand = (a, b) => a + Math.random() * (b - a)

import { icon } from '../../core/icons.js'
import { mount, mutes, soundHandlers } from './screens.js'
import { sysBarMarkup, bindSysBar } from '../runner/ui/systemBar.js'
import { playerSkin } from '../../core/playerSkin.js'
import { burstConfetti } from '../../core/confetti.js'
import {
  playQuakeBoom, playFirework, playLineBlip, playGameStart, startVictoryLoop, stopVictoryLoop,
} from '../runner/audio.js'

/**
 * 줄 하나가 몇 ms 뒤에 자동으로 넘어가나.
 *
 * ── 왜 고정값이 아니라 글자 수 기반인가 ─────────────────────
 *
 * 짧은 한 줄에 5초를 주면 늘어지고, 긴 줄에 3초를 주면 다 못 읽는다.
 * 다음/이전 버튼이 항상 있으니 이 값은 "안 건드리면 이 정도"의 기본값일
 * 뿐이다 — 아이가 다 읽기 전에 버튼을 누르면 그게 우선이다.
 */
function autoMs(line) {
  if (line.ms != null) return line.ms
  const len = (line.text ?? '').length
  return Math.min(8000, Math.max(3500, 2200 + len * 70))
}

/** 이 줄을 말하는 캐릭터의 얼굴 그림 — 없으면 null. */
function faceFor(cast, line) {
  if (!line.speaker) return null
  const bucket = line.speaker === 'player' ? cast?.player?.[playerSkin()] : cast?.[line.speaker]
  return bucket?.[line.mood] ?? null
}

/**
 * 배경 그림 — 소년/소녀 버전이 따로 있으면 지금 아이가 고른 프로필로 고른다.
 * `scene.bg`가 그냥 문자열이면(아직 소녀 버전이 없는 장면) 그대로 쓴다 —
 * **없는 조합을 요구하지 않는다.**
 */
function bgFor(bg) {
  if (typeof bg === 'string') return bg
  return bg?.[playerSkin()] ?? bg?.boy ?? ''
}

/**
 * 대화 한 장면 — 배경 + 대사를 줄마다 넘긴다.
 *
 * ── 왜 결과를 돌려주나 ★ ────────────────────────────────────
 *
 * 타이틀 화면과 같은 이유다. Home을 콜백으로 빼면 판을 나갈 때 `await`가
 * 안 풀려 화면이 빈 채로 멈춘다(`screens.js`의 `showTitle3d` 주석). 여기서도
 * **화면을 떠나는 길이 여럿**(대사 다 읽기 · Home · 뒤로 · 스킵 · 나가기)
 * 이라 결과도 그만큼 갈린다.
 *
 * Home을 누른 뒤 무엇을 할지는 **부르는 쪽이 정한다** — 판이 시작하기 전
 * (인트로)이면 그냥 나가면 되고, 시작한 뒤(발견·엔딩)라면 지금까지의
 * 운동을 저장하고 나가야 한다. 이 파일은 그 차이를 모른다.
 *
 * @param {HTMLElement} app
 * @param {{ bg: string|{boy:string, girl:string}, lines: (string|{text:string, speaker?:string, mood?:string, ms?:number})[], fx?: 'quake'|'confetti', stinger?: 'start' }} scene
 * @param {object} [cast] `manifest.story.cast` — 없으면 얼굴 없이 텍스트만
 * @param {object} [o]
 * @param {boolean} [o.backButton] 이 결과를 `'home'` 대신 `'back'`으로
 *   돌려준다(허브가 아니라 **바로 앞 화면**으로 보내라는 뜻 — 무엇을
 *   "바로 앞"으로 볼지는 부르는 쪽이 정한다). 판이 아직 시작하기 전
 *   (인트로)에만 쓴다 — 판이 이미 시작한 뒤(발견·엔딩)에는 안 쓴다,
 *   그때는 운동 기록이 걸려 있어 뒤로 돌아갈 전 단계라는 게 없고 Home이
 *   정직하다(ken 요청, 9/2). **왼쪽 위에 버튼이 따로 뜨진 않는다** — 대사창
 *   안 "이전"(`canGoBack`)이 컷을 넘나드는 뒤로가기를 이미 다 맡고, 나가기
 *   (X) → 확인창의 "Home으로"도 같은 `onHome`을 부른다. 버튼 하나가 두
 *   군데(왼쪽 위 + 확인창) 있으면 어느 쪽을 눌러도 똑같이 동작하는데도
 *   화면에 고를 게 늘어 보였다(ken 요청, 9/3) — 결과값 자체는 그대로 두고
 *   눈에 보이는 버튼만 뺐다.
 * @param {boolean} [o.skippable] 스킵 버튼을 보여준다. 인트로의 마지막
 *   장면 앞까지만 켠다 — 매 판 다시 보는 화면이라 반복 피로가 있다(ken 요청,
 *   9/2). 결과가 `'skip'`으로 온다. 이전·다음과 같은 줄, 같은 모양이다.
 *   마지막 장면에는 안 켠다 — 이미 끝인데 스킵은 의미가 없다(ken 요청, 9/2),
 *   대신 `startAction`을 쓴다.
 * @param {boolean} [o.startAction] 이 장면의 **마지막 줄**에서 "다음" 대신
 *   "시작"을 보여준다 — 인트로의 마지막 장면(다짐)처럼 그 버튼이 실제로
 *   판을 시작시킬 때 쓴다(ken 요청, 9/2). 자동 넘김은 그대로 살아 있다 —
 *   글자만 바뀐다, 동작은 같다.
 * @param {'last'} [o.startLine] 첫 줄이 아니라 **마지막 줄부터** 보여준다.
 *   스킵이 마지막 장면의 마지막 줄(출발 신호)로 곧장 건너뛸 때 쓴다
 *   (`play3d.js`).
 * @param {boolean} [o.canGoBack] 이 장면 **앞에 이어지는 장면이 있는지**.
 *   대사창 안의 "이전" 버튼은 줄 단위로 뒤로 간다 — 지금 장면의 첫 줄(`i===0`)에서
 *   더 갈 데가 있으려면 **이 장면 앞에 다른 장면이 있어야** 한다. 없으면(전체
 *   스토리의 첫 장면) 버튼을 꺼 둔다. 있으면 눌렀을 때 `'prevScene'`을
 *   돌려주고, 부르는 쪽이 이전 장면을 **마지막 줄부터**(`startLine:'last'`)
 *   다시 연다 — 줄이 하나 이어지는 것처럼 보이게 하려면 그 장면의 처음이
 *   아니라 끝에서 이어받아야 한다. 인트로·발견·엔딩 전부 같은 규칙이다
 *   (ken 지적, 9/3) — "컷이 바뀌어도 이전 버튼은 계속 눌려야 한다."
 * @returns {Promise<'done'|'home'|'back'|'prevScene'|'skip'|'title'>} `'title'`은
 *   오른쪽 위 나가기(X) → 확인창의 "게임 처음으로"다 — 스토리 화면에도
 *   생겼다(ken 요청, 9/2). 어디로 보낼지는 부르는 쪽이 정한다.
 */
export function showStoryScene(
  app, scene, cast = {},
  { backButton = false, skippable = false, startAction = false, startLine, canGoBack = false } = {},
) {
  return new Promise(resolve => {
    const lines = scene.lines.map(l => (typeof l === 'string' ? { text: l } : l))
    let i = startLine === 'last' ? lines.length - 1 : 0
    let timer = null

    const el = mount(app, 'r3-story', `
      <div class="r3s-corner r3s-sys">${sysBarMarkup({
        home: false, exit: true, ...mutes(),
      })}</div>
      <div class="r3-story-box">
        <img class="r3-story-face" id="r3-story-face" alt="">
        <div class="r3-story-body">
          <p class="r3-story-line" id="r3-story-line"></p>
          <div class="r3-story-actions">
            <button class="r3s-btn r3-story-prev" id="r3-story-prev" data-pz-hit data-pz-dwell="1200">
              ${icon('back')} 이전
            </button>
            <button class="r3s-btn r3-story-next" id="r3-story-next" data-pz-hit data-pz-dwell="1200">
              다음 ${icon('play')}
            </button>
            ${skippable ? `
            <button class="r3s-btn r3-story-skip" id="r3-story-skip" data-pz-hit data-pz-dwell="1200">
              스킵 ${icon('play')}
            </button>` : ''}
          </div>
        </div>
      </div>`, bgFor(scene.bg))

    const lineEl = el.querySelector('#r3-story-line')
    const faceEl = el.querySelector('#r3-story-face')
    const prevBtn = el.querySelector('#r3-story-prev')
    const nextBtn = el.querySelector('#r3-story-next')

    const clearTimer = () => { if (timer) { clearTimeout(timer); timer = null } }

    // ── 지진(quake) ───────────────────────────────────────────
    // 배경만 흔든다(`.r3s-shake`가 `.r3s-bg`에만 건다, `screens.js`). 연기는
    // 그림 파일 없이 흐린 원 몇 개를 흩뿌려 위로 흘려보낸다 — 자리·크기·
    // 속도를 매번 흩뜨려야 기계적으로 안 보인다(CLAUDE.md).
    let confettiStop = null
    if (scene.fx === 'quake') {
      el.classList.add('r3s-shake')
      const smoke = document.createElement('div')
      smoke.className = 'r3s-smoke'
      for (let k = 0; k < 5; k++) {
        const puff = document.createElement('i')
        const size = rand(70, 160)
        puff.style.cssText = `left:${rand(4, 90)}%; width:${size}px; height:${size}px;`
          + `animation-duration:${rand(3.4, 5.6)}s; animation-delay:${rand(-4, 0)}s;`
        smoke.appendChild(puff)
      }
      el.appendChild(smoke)
      playQuakeBoom()
    } else if (scene.fx === 'confetti') {
      confettiStop = burstConfetti(el, { pieces: 90, bursts: 3, seconds: 6 })
      playFirework()
      startVictoryLoop()
    }

    // ── 게임 시작 신호 ─────────────────────────────────────────
    // 인트로의 마지막 장면에서만(`scene.stinger === 'start'`). 폭발음이 먼저
    // 한 차례 가라앉은 뒤에 울려야 묻히지 않는다 — 조금 늦춰서 낸다.
    let stingerTimer = null
    if (scene.stinger === 'start') {
      stingerTimer = setTimeout(() => { stingerTimer = null; playGameStart() }, 750)
    }

    // ── 타이핑 효과 ────────────────────────────────────────────
    // 한 번에 텍스트가 툭 뜨면 심심하다(ken 요청, 9/2). 한 글자씩 채우고,
    // 채우는 동안만 `.r3s-typing`을 달아 커서를 깜빡인다(`screens.js`).
    let typeTimer = null
    const clearType = () => { if (typeTimer) { clearInterval(typeTimer); typeTimer = null } }
    const typeLine = text => {
      clearType()
      lineEl.textContent = ''
      lineEl.classList.add('r3s-typing')
      let idx = 0
      const stepMs = text.length > 40 ? 26 : 36
      typeTimer = setInterval(() => {
        idx++
        lineEl.textContent = text.slice(0, idx)
        if (idx >= text.length) { clearType(); lineEl.classList.remove('r3s-typing') }
      }, stepMs)
    }

    const show = () => {
      const line = lines[i]
      typeLine(line.text)
      playLineBlip()
      const face = faceFor(cast, line)
      faceEl.src = face ?? ''
      faceEl.style.display = face ? '' : 'none'
      // 지금 장면의 첫 줄이라도, 앞에 다른 장면이 있으면(`canGoBack`) 여전히
      // "더 갈 데"가 있다 — 컷이 바뀌었다고 꺼지면 안 된다(ken 지적, 9/3).
      prevBtn.disabled = i === 0 && !canGoBack
      // 마지막 장면의 마지막 줄만 "시작"이다 — 자동 넘김은 안 바뀐다,
      // 글자로 "이 버튼이 판을 시작시킨다"는 걸 미리 알려줄 뿐이다.
      nextBtn.innerHTML = startAction && i === lines.length - 1
        ? `시작 ${icon('play')}`
        : `다음 ${icon('play')}`
      clearTimer()
      // 자동 넘김 — 버튼을 누르면 `go()`가 다시 이 타이머를 건다(아래).
      timer = setTimeout(() => go(1), autoMs(line))
    }

    const abort = new AbortController()
    let settled = false
    const finish = (result = 'done') => {
      if (settled) return
      settled = true
      clearTimer()
      clearType()
      if (stingerTimer) { clearTimeout(stingerTimer); stingerTimer = null }
      confettiStop?.()
      stopVictoryLoop()
      abort.abort()
      el.remove()
      resolve(result)
    }

    bindSysBar(el, {
      ...soundHandlers(),
      onHome: () => finish(backButton ? 'back' : 'home'),
      onQuit: () => finish('title'),
    }, abort.signal)

    function go(d) {
      const next = i + d
      if (next < 0) {
        // 이 장면 첫 줄에서 더 이전으로 — 앞 장면이 있으면(`canGoBack`)
        // 그리로 넘긴다. 없으면 버튼이 이미 꺼져 있어 여기까지 안 온다(방어선).
        if (canGoBack) finish('prevScene')
        return
      }
      if (next >= lines.length) { finish('done'); return }
      i = next
      show()
    }

    prevBtn.addEventListener('click', () => go(-1))
    nextBtn.addEventListener('click', () => go(1))
    el.querySelector('#r3-story-skip')?.addEventListener('click', () => finish('skip'))

    show()
  })
}
