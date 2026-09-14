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
import { mount, mutes, soundHandlers, ensureStyle } from './screens.js'
import { showLoadingScreen, preloadImage } from '../../core/loadingScreen.js'
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
  // mood를 안 준 줄은 `default`로 떨어진다 — 오디세이 런처럼 표정을 한 장만
  // 쓰는 게임이 `cast.odysseus = { default: url }` 하나로 끝낼 수 있게. 쥬라기는
  // player 줄에 늘 mood를 줘서(`manifest.json`) 이 폴백을 안 탄다.
  return bucket?.[line.mood] ?? bucket?.default ?? null
}

/**
 * 대사창에 띄울 **화자명** — 없으면 null(이름 줄 자체를 숨긴다).
 *
 * `line.name`이 있으면 그대로, 없으면 `cast[speaker].name`, 그것도 없으면
 * `speaker` 키를 사람이 읽을 수 있게 살짝만 다듬는다(`player` → 아이가 고른
 * 스킨 이름은 게임팩이 `cast.player.name`으로 준다). 나레이션(발화자 없는 줄,
 * `CLAUDE.md`가 피하라는 그 경우)은 이름도 얼굴도 없다.
 */
function nameFor(cast, line) {
  if (line.name) return line.name
  if (!line.speaker) return null
  if (line.speaker === 'player') return cast?.player?.name ?? null
  return cast?.[line.speaker]?.name ?? null
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
 *   9/2). 결과가 `'skip'`으로 온다(STEP 61부터 곧장 게임을 시작시킨다,
 *   `play3d.js`). 같은 줄이지만 이전·다음과는 반대쪽 끝(오른쪽 정렬)이다
 *   — 아이패드 실사용에서 셋이 뭉쳐 있으니 헷갈렸다(ken 요청, 9/4).
 *   마지막 장면에는 안 켠다 — 이미 끝인데 스킵은 의미가 없다(ken 요청, 9/2),
 *   대신 `startAction`을 쓴다.
 * @param {boolean} [o.startAction] 이 장면의 **마지막 줄**에서 "다음" 대신
 *   "시작"을 보여준다 — 인트로의 마지막 장면(다짐)처럼 그 버튼이 실제로
 *   판을 시작시킬 때 쓴다(ken 요청, 9/2). 자동 넘김은 그대로 살아 있다 —
 *   글자만 바뀐다, 동작은 같다.
 * @param {'last'} [o.startLine] 첫 줄이 아니라 **마지막 줄부터** 보여준다.
 *   대사창 안 "이전"이 장면 첫 줄에서 앞 장면으로 넘어갈 때, 그 장면의
 *   마지막 줄부터 이어받아 줄이 하나로 이어지는 것처럼 보이게 한다
 *   (`play3d.js`의 `prevScene` 처리). 스킵(`'skip'`)은 STEP 61부터 장면을
 *   다시 보여주지 않고 곧장 게임을 시작해서 더는 이 옵션을 안 쓴다.
 * @param {boolean} [o.canGoBack] 이 장면 **앞에 이어지는 장면이 있는지**.
 *   대사창 안의 "이전" 버튼은 줄 단위로 뒤로 간다 — 지금 장면의 첫 줄(`i===0`)에서
 *   더 갈 데가 있으려면 **이 장면 앞에 다른 장면이 있어야** 한다. 없으면(전체
 *   스토리의 첫 장면) 버튼을 꺼 둔다. 있으면 눌렀을 때 `'prevScene'`을
 *   돌려주고, 부르는 쪽이 이전 장면을 **마지막 줄부터**(`startLine:'last'`)
 *   다시 연다 — 줄이 하나 이어지는 것처럼 보이게 하려면 그 장면의 처음이
 *   아니라 끝에서 이어받아야 한다. 인트로·발견·엔딩 전부 같은 규칙이다
 *   (ken 지적, 9/3) — "컷이 바뀌어도 이전 버튼은 계속 눌려야 한다."
 * @param {boolean} [o.disableNextOnLast] 마지막 줄에서 "다음"을 **끝내는
 *   버튼이 아니라 그냥 꺼진 버튼**으로 둔다(STEP 103, 풍선 팡팡 휴식
 *   타임 전용). 기본(false)은 예전 그대로 — 마지막 줄에서 "다음"(또는
 *   `startAction`이면 "시작")을 누르면 `finish('done')`으로 이 장면을
 *   끝내고, 인트로·엔딩처럼 여러 장면을 잇는 흐름에서는 그게 맞다(다음
 *   장면으로 넘어가거나 판이 시작된다). 그런데 **줄이 애초에 하나뿐이고
 *   더 갈 장면도 없는** 호출(휴식 타임 대사 — 카운트다운이 따로 돌고
 *   있어 대화 자체가 "끝"이라는 개념이 없다)에서는 이 기본 동작이
 *   문제였다 — "다음"이 여전히 눌려서, 카운트다운이 다 되기 한참 전에
 *   사용자가 누르면 `finish('done')`이 대화창 DOM을 그 자리에서
 *   지워버렸다(호출부가 `'done'`을 무시하게 짜 놨어도 소용없다 — DOM
 *   삭제는 `finish()` 안에서 결과와 상관없이 일어난다). `true`를 주면
 *   마지막 줄에서 `nextBtn.disabled = true`로 두고 자동 넘김 타이머도
 *   안 걸어서, 대화창이 **저절로도 안 사라지고** 눌러도 안 사라진다 —
 *   부르는 쪽이 직접 `finish()`를 트리거할 다른 수단(휴식 타임은
 *   카운트다운 종료 시 SKIP 버튼을 프로그램적으로 누른다)을 가지고
 *   있을 때만 쓴다.
 * @returns {Promise<'done'|'home'|'back'|'prevScene'|'skip'|'title'>} `'title'`은
 *   오른쪽 위 나가기(X) → 확인창의 "게임 처음으로"다 — 스토리 화면에도
 *   생겼다(ken 요청, 9/2). 어디로 보낼지는 부르는 쪽이 정한다.
 */
export function showStoryScene(
  app, scene, cast = {},
  {
    backButton = false, skippable = false, startAction = false, startLine,
    canGoBack = false, transparent = false, disableNextOnLast = false,
  } = {},
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
          <p class="r3-story-name" id="r3-story-name" hidden></p>
          <p class="r3-story-line" id="r3-story-line"></p>
          <div class="r3-story-actions">
            <div class="r3-story-nav">
              <button class="r3s-btn r3-story-prev" id="r3-story-prev" data-pz-hit data-pz-dwell="1200">
                ${icon('playBack')} 이전
              </button>
              <button class="r3s-btn r3-story-next" id="r3-story-next" data-pz-hit data-pz-dwell="1200">
                다음 ${icon('play')}
              </button>
            </div>
            ${skippable ? `
            <button class="r3s-btn r3-story-skip" id="r3-story-skip" data-pz-hit data-pz-dwell="1200">
              스킵 ${icon('play')}
            </button>` : ''}
          </div>
        </div>
      </div>`, bgFor(scene.bg), { transparent })

    const lineEl = el.querySelector('#r3-story-line')
    const nameEl = el.querySelector('#r3-story-name')
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
      // 화자명 — 있으면 대사 위 작은 줄(`.r3-story-name`). 나레이션은 숨긴다.
      const name = nameFor(cast, line)
      nameEl.textContent = name ?? ''
      nameEl.hidden = !name
      // 지금 장면의 첫 줄이라도, 앞에 다른 장면이 있으면(`canGoBack`) 여전히
      // "더 갈 데"가 있다 — 컷이 바뀌었다고 꺼지면 안 된다(ken 지적, 9/3).
      prevBtn.disabled = i === 0 && !canGoBack
      const isLastLine = i === lines.length - 1
      // 마지막 장면의 마지막 줄만 "시작"이다 — 자동 넘김은 안 바뀐다,
      // 글자로 "이 버튼이 판을 시작시킨다"는 걸 미리 알려줄 뿐이다.
      nextBtn.innerHTML = startAction && isLastLine
        ? `시작 ${icon('play')}`
        : `다음 ${icon('play')}`
      // ★ (STEP 103) `disableNextOnLast`가 켜져 있으면 "더 갈 다음이
      // 없다"는 뜻 그대로 버튼을 꺼 둔다 — 대화 자체를 끝낼 수단이
      // 아예 없어야 한다(위 JSDoc 참고).
      nextBtn.disabled = disableNextOnLast && isLastLine
      clearTimer()
      // 자동 넘김 — 버튼을 누르면 `go()`가 다시 이 타이머를 건다(아래).
      // `disableNextOnLast`가 켜진 마지막 줄에서는 이 타이머도 안 건다 —
      // 안 그러면 버튼은 꺼져 있어도 자동 넘김이 똑같이 대화창을
      // 지워 버린다(사용자가 안 눌러도 "그냥 사라지는" 동일 증상).
      if (!(disableNextOnLast && isLastLine)) {
        timer = setTimeout(() => go(1), autoMs(line))
      }
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
      if (next >= lines.length) {
        // ★ (STEP 103) 버튼이 꺼져 있어 정상적으로는 여기 안 온다 — 방어선.
        if (disableNextOnLast) return
        finish('done')
        return
      }
      i = next
      show()
    }

    prevBtn.addEventListener('click', () => go(-1))
    nextBtn.addEventListener('click', () => go(1))
    el.querySelector('#r3-story-skip')?.addEventListener('click', () => finish('skip'))

    show()
  })
}

/**
 * 휴식(REST) 비트 — 스테이지 안(같은 스테이지의 두 레벨 사이). ★
 *
 * ── 스토리 컷과 다른 점 ──────────────────────────────────────
 *
 * `bg`가 없으면 별도 전체화면 그림으로 안 바꾼다 — **게임 캔버스 위에
 * 대사창만 얹는다**(`mount` 대신 배경 없는 `.r3s` 오버레이). 세계는
 * `play3d.js`가 이미 `started = false`로 멈춰 뒀다(장애물·점수·시간 정지).
 * `bg`를 주면(스테이지 전용 REST 그림, ken 지정 `rest_<stage>.png`) 스토리
 * 컷처럼 그 그림으로 덮는다 — `mount()`와 같은 방식으로 미리 받아 둔 뒤 보여준다
 * (`CLAUDE.md`: 큰 배경 그림은 걸기 전에 먼저 받는다).
 *
 * 흐름: `before` 대사 → REST N초 카운트다운 → `after` 대사 → `'done'`.
 * Skip은 남은 것(대사·카운트다운)을 전부 건너뛰고 즉시 `'skip'` — **버튼은
 * 항상 보인다**(누락 금지, ken 요청).
 *
 * 대사창 모양(`.r3-story-box`·`.r3-story-face`·`.r3-story-name`·`.r3-story-line`)은
 * 스토리 컷과 **한 벌**. 여기서 새로 안 짠다(카운트다운 칩만 추가).
 *
 * @param {HTMLElement} app
 * @param {object} o
 * @param {(string|{text:string,speaker?:string})[]} [o.before]  대사(카운트다운 전 대화 흐름)
 * @param {(string|{text:string,speaker?:string})[]} [o.after]   대사(before 뒤로 이어지는 대화)
 * @param {number} [o.seconds]  REST 전체 시간(초, 대화 포함). 기본 20 — 모든
 *   스테이지가 이 값 하나로 통일돼 있다(ken 정책, STEP 89). REST가 시작하는
 *   순간부터 이 초가 줄어들고(대화 중에도 계속), 0이 되면 대화가 안 끝났어도
 *   바로 다음 레벨/스테이지로 넘어간다 — "일반 duration"과 같은 하드 캡이다.
 * @param {object} [o.cast]  `manifest.story.cast`
 * @param {string|null} [o.bg]  스테이지 전용 REST 배경 그림. 없으면(`null`)
 *   게임 화면이 그대로 비치는 투명 오버레이.
 * @returns {Promise<'done'|'skip'|'home'|'title'>}
 */
export function showRestBeat(app, { before = [], after = [], seconds = 20, cast = {}, bg = null } = {}) {
  return new Promise(resolve => {
    ensureStyle()        // .r3s / .r3-story-box CSS (mount 없이 부르므로 직접)
    ensureRestStyle()
    const norm = arr => arr.map(l => (typeof l === 'string' ? { text: l } : l))
    // ── before/after를 한 대화로 잇는다 ★ ─────────────────────────
    // STEP 88까지는 "before 대사 → 카운트다운 → after 대사"가 순서대로
    // 막혀 있었다 — 카운트다운이 대화 중간의 한 **단계**였다. STEP 89부터
    // 카운트다운은 대화와 무관하게 화면 위에서 독립적으로 흐르므로(아래
    // topcount), 대사는 그냥 하나로 이어진 대화다. 내용 자체(각 배열의
    // 순서·문구)는 그대로 — before가 끝나면 곧장 after로 넘어간다.
    const lines = [...norm(before), ...norm(after)]

    const el = document.createElement('div')
    el.className = 'r3s r3-rest'
    el.id = 'r3-rest'
    el.innerHTML = `
      ${bg ? '<div class="r3s-bg"></div>' : ''}
      <div class="r3s-corner r3s-sys">${sysBarMarkup({ home: false, exit: true, ...mutes() })}</div>
      <div class="r3-rest-topcount" id="r3-rest-topcount"></div>
      <div class="r3-story-box">
        <img class="r3-story-face" id="r3-rest-face" alt="">
        <div class="r3-story-body">
          <p class="r3-story-name r3-rest-name" id="r3-rest-name" hidden></p>
          <p class="r3-story-line" id="r3-rest-line"></p>
          <div class="r3-story-actions">
            <div class="r3-story-nav">
              <button class="r3s-btn r3-story-prev" id="r3-rest-prev" data-pz-hit data-pz-dwell="1200">
                ${icon('playBack')} 이전
              </button>
              <button class="r3s-btn r3-story-next" id="r3-rest-next" data-pz-hit data-pz-dwell="1200">
                다음 ${icon('play')}
              </button>
            </div>
            <button class="r3s-btn" id="r3-rest-skip" data-pz-hit data-pz-dwell="1200">
              스킵 ${icon('play')}
            </button>
          </div>
        </div>
      </div>`
    if (bg) {
      // 스토리 컷의 mount()와 같은 순서 — 다 받을 때까지 로딩 화면으로 가리고,
      // 화면 자체는 처음부터 붙여 둔다(스토리컷과 동일 패턴).
      el.style.visibility = 'hidden'
      el.querySelector('.r3s-bg').style.setProperty('--bg', `url("${bg}")`)
      el.querySelector('.r3s-bg').style.backgroundImage = `url("${bg}")`
      const loading = showLoadingScreen()
      preloadImage(bg).finally(() => { el.style.visibility = 'visible'; loading.release() })
    }
    app.appendChild(el)

    const lineEl = el.querySelector('#r3-rest-line')
    const nameEl = el.querySelector('#r3-rest-name')
    const faceEl = el.querySelector('#r3-rest-face')
    const prevBtn = el.querySelector('#r3-rest-prev')
    const nextBtn = el.querySelector('#r3-rest-next')
    const topCountEl = el.querySelector('#r3-rest-topcount')

    const abort = new AbortController()
    let settled = false
    let timer = null
    let typeTimer = null
    let dotTimer = null
    let masterTimer = null
    const clearAll = () => {
      if (timer) { clearTimeout(timer); timer = null }
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null }
      if (dotTimer) { clearInterval(dotTimer); dotTimer = null }
      if (masterTimer) { clearInterval(masterTimer); masterTimer = null }
    }
    const finish = (result) => {
      if (settled) return
      settled = true
      clearAll()
      abort.abort()
      el.remove()
      resolve(result)
    }

    bindSysBar(el, {
      ...soundHandlers(),
      onHome: () => finish('home'),
      onQuit: () => finish('title'),
    }, abort.signal)

    // ── 화면 맨 위 중앙 — REST 전체 시간(대화 포함) ★★ ────────────
    // STEP 89 — 예전엔 대사창 **안**(카운트다운 칩)에 있었다. 대화가 끝나야
    // 나타나던 것도 아니라, REST가 시작하는 순간 **바로** 여기서 20초를
    // 센다 — 대화가 진행되는 중에도 이 숫자는 계속 줄어든다(ken 정책).
    // 0이 되면 대화 상태와 무관하게 곧장 끝낸다 — "일반 duration 종료"와
    // 같은 하드 캡이다(대사가 하나도 안 끝났어도 20초면 넘어간다).
    let masterLeft = Math.max(1, Math.round(seconds))
    const renderTop = () => { topCountEl.textContent = `REST ${masterLeft}` }
    renderTop()
    masterTimer = setInterval(() => {
      masterLeft--
      if (masterLeft <= 0) {
        clearInterval(masterTimer); masterTimer = null
        finish('done')
        return
      }
      renderTop()
    }, 1000)

    // ── 대사 한 줄 ──
    const typeLine = text => {
      if (typeTimer) clearInterval(typeTimer)
      lineEl.textContent = ''
      lineEl.classList.remove('r3-rest-waiting')
      lineEl.classList.add('r3s-typing')
      let idx = 0
      const stepMs = text.length > 40 ? 26 : 36
      typeTimer = setInterval(() => {
        idx++
        lineEl.textContent = text.slice(0, idx)
        if (idx >= text.length) { clearInterval(typeTimer); typeTimer = null; lineEl.classList.remove('r3s-typing') }
      }, stepMs)
    }
    const showLine = (line, onDone) => {
      typeLine(line.text)
      playLineBlip()
      const face = faceFor(cast, line)
      faceEl.src = face ?? ''
      faceEl.style.display = face ? '' : 'none'
      const name = nameFor(cast, line)
      nameEl.textContent = name ?? ''
      nameEl.hidden = !name
      if (timer) clearTimeout(timer)
      timer = setTimeout(onDone, autoMs(line))
    }

    // ── "휴식중..." — 대화가 20초보다 먼저 끝났을 때 ★ ─────────────
    // 대사창은 그대로 두고(ken: "대화창은 그대로 유지") 본문만 바꾼다.
    // 점 1~3개를 0.5초마다 순환 — CSS 애니메이션 대신 기존 파일의
    // 다른 효과(타이핑 등)와 같은 JS 타이머 방식이라 새 keyframe이 안 든다.
    // 화려하게 안 만든다(ken: "너무 화려하게 하지 말고").
    function showWaiting() {
      if (dotTimer) return   // 이미 기다리는 중이면 다시 안 켠다
      if (timer) { clearTimeout(timer); timer = null }
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null }
      prevBtn.hidden = true
      nextBtn.hidden = true
      faceEl.style.display = 'none'
      nameEl.hidden = true
      lineEl.classList.remove('r3s-typing')
      lineEl.classList.add('r3-rest-waiting')
      let n = 1
      const render = () => { lineEl.textContent = '휴식중' + '.'.repeat(n) }
      render()
      dotTimer = setInterval(() => { n = n % 3 + 1; render() }, 500)
    }

    // ── 스텝 시퀀스: 대사를 하나씩, 다 보이면 "휴식중..." ────────────
    // ★ STEP 88 — ken 정책 통일: 모든 대화창(스토리 컷·REST)에 [이전][다음]
    // [스킵]이 항상 같이 보인다. `showStoryScene`의 `.r3-story-nav`(이전+
    // 다음 묶음)와 같은 모양 — 대화 UI는 한 벌(CLAUDE.md).
    let li = 0
    function step() {
      if (settled) return
      if (li < lines.length) {
        prevBtn.hidden = false
        nextBtn.hidden = false
        // 첫 줄이면 더 갈 데가 없다(ken 요청: "직전 대사를 다시 확인" —
        // 컷을 넘나드는 것까지는 아니다, `showStoryScene`의 canGoBack과 다름).
        prevBtn.disabled = li === 0
        showLine(lines[li], () => { li++; step() })
        return
      }
      showWaiting()
    }

    prevBtn.addEventListener('click', () => {
      // 직전 대사를 다시 읽는다. `li===0`이면 버튼이 이미 disabled라
      // 여기 안 온다. "휴식중" 상태에선 prevBtn 자체가 숨어 있다.
      if (li === 0) return
      if (dotTimer) { clearInterval(dotTimer); dotTimer = null }
      li--
      step()
    })
    nextBtn.addEventListener('click', () => {
      // 지금 줄의 자동 넘김을 앞당긴다 — 마지막 줄이면 "휴식중..."으로 이어간다.
      li++
      step()
    })
    el.querySelector('#r3-rest-skip').addEventListener('click', () => finish('skip'))

    step()
  })
}

let restStyled = false
function ensureRestStyle() {
  if (restStyled) return
  restStyled = true
  const s = document.createElement('style')
  s.textContent = `
    /* REST 비트 — 게임 화면 위 오버레이(배경 없음). 대사창은 스토리 컷과
       같은 .r3-story-box를 그대로 쓴다. */
    #r3-rest { background: transparent; justify-content: flex-end; }
    #r3-rest .r3-story-box { background: rgba(15,7,34,.9); }

    /* ── 카운트다운 — 화면 맨 위 중앙, 대화창과 별개 ★ ─────────────
       STEP 87은 대사창 바깥 위쪽에 따로 띄웠다가(화면 딴 곳에 뭔가
       떠 있다는 지적) STEP 88에서 대사창 **안**으로 옮겼다. STEP 89 —
       ken이 다시 밖으로: 이번엔 "대사창 안"이 아니라 **화면 맨 위
       중앙**에 고정하고, REST 전체(대화 포함) 20초를 센다 — 대사창
       위치(하단)와 무관하게 항상 같은 자리에 떠 있어야 "시간이 얼마나
       남았나"를 대화 내용과 안 섞고 한눈에 본다. absolute 자리는
       screens.js의 .r3s > *:not(...) 제외 목록에 등록해 뒀다. */
    .r3-rest-topcount {
      position: absolute; top: clamp(14px, 3vh, 30px); left: 50%;
      transform: translateX(-50%); z-index: 5;
      font-family: var(--font-main, 'Jua', sans-serif); font-weight: 900;
      font-size: clamp(1.4rem, 4vw, 2.4rem); letter-spacing: .06em;
      color: var(--pz-gold, #ffd23e);
      padding: clamp(6px, 1.2vh, 14px) clamp(18px, 3.5vw, 34px);
      border-radius: 999px; background: rgba(15,7,34,.86);
      border: 2px solid var(--pz-gold, #ffd23e);
      text-shadow: 0 2px 8px rgba(0,0,0,.5);
    }
    /* "휴식중..." — 대화가 20초보다 먼저 끝났을 때, 대사창 안 본문 자리에
       그대로 쓴다(대화창은 유지, 글자만 바뀐다). 점 애니메이션은 JS가
       0.5초마다 텍스트를 다시 쓰는 방식(위 typeLine과 같은 결) — 너무
       화려하지 않게, 옅은 색으로만 "아직 기다리는 중"임을 준다. */
    .r3-rest-waiting { opacity: .7; }`
  document.head.appendChild(s)
}
