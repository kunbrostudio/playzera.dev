// 풍선 팡팡 — 쉬는 타임 UX 재작업(STEP 99).
//
// STEP 98에서는 쉬는 타임 전용의 작은 커스텀 오버레이(`#bf-rest`)를 새로
// 만들었는데, ken이 실제로 보고 "기존 큰 Dialogue UI와 너무 다르고 작다,
// 새로 만들지 말고 기존 컴포넌트를 재사용하라"고 지적했다. STEP 99는 그
// 커스텀 박스를 걷어내고 공용 스토리 대화창(`storyDialogue.js`)을
// `transparent: true` 옵션으로 그대로 재사용한다 — 카메라·손 트래커가
// 얽힌 화면이라 DOM/카메라 없이는 실행할 수 없는 함수들이고, 이 저장소의
// 다른 무거운 화면들(오디세이 런 등)과 같은 방식으로 소스 문자열 검사 +
// 실제 자산 존재 확인으로 검증한다.
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'

const playScreenSrc = readFileSync('src/games/balloon-festival/ui/playScreen.js', 'utf8')
const storyRunnerSrc = readFileSync('src/games/arcade2d/storyRunner.js', 'utf8')
const screensSrc = readFileSync('src/games/runner3d/screens.js', 'utf8')
const storyDialogueSrc = readFileSync('src/games/runner3d/storyDialogue.js', 'utf8')
const titleScreenSrc = readFileSync('src/games/balloon-festival/ui/titleScreen.js', 'utf8')

// storyDialogue.js는 최상위 함수라 닫는 중괄호가 들여쓰기 없이 온다
// (`fn()`은 클래스/객체 메서드용 2-space 들여쓰기를 가정한다).
function topFn(src, name) {
  const start = src.indexOf(name)
  expect(start, `${name}이 없다`).toBeGreaterThan(-1)
  const end = src.indexOf('\n}', start)
  return src.slice(start, end)
}

function fn(src, name) {
  const start = src.indexOf(name)
  expect(start, `${name}이 없다`).toBeGreaterThan(-1)
  const end = src.indexOf('\n  }', start)
  return src.slice(start, end)
}

describe('쉬는 타임 — 기존 큰 Dialogue UI 재사용, 커스텀 박스 없음 ★', () => {
  it('showRestWithDialogue가 이제 runStory(공용 스토리 대화창)를 직접 부른다', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    expect(body.includes('runStory(app, scenes')).toBe(true)
  })

  it('transparent: true로 켜서 카메라가 계속 보이게 한다', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    expect(body.includes('transparent: true')).toBe(true)
  })

  it('예전의 커스텀 박스(#bf-rest-box·#bf-rest-dialogue)는 완전히 제거됐다', () => {
    expect(playScreenSrc.includes('bf-rest-box')).toBe(false)
    expect(playScreenSrc.includes('bf-rest-dialogue')).toBe(false)
  })
})

describe('쉬는 타임 — 암전 제거(transparent variant) ★', () => {
  it('mount()가 opts.transparent를 받아 .r3s-transparent 클래스를 붙인다', () => {
    expect(screensSrc.includes("opts.transparent ? 'r3s r3s-transparent' : 'r3s'")).toBe(true)
  })

  it('.r3s-transparent .r3s-bg 배경이 옅은 반투명이다(불투명한 기본값을 덮어쓴다)', () => {
    const m = screensSrc.match(/\.r3s-transparent \.r3s-bg\s*\{[^}]*background-color:\s*rgba\(([^)]+)\)/)
    expect(m).toBeTruthy()
    const alpha = parseFloat(m[1].split(',').pop())
    expect(alpha).toBeLessThanOrEqual(0.4)
  })

  it('showStoryScene이 opts.transparent를 mount()로 그대로 넘긴다', () => {
    expect(storyDialogueSrc.includes('transparent = false')).toBe(true)
    expect(storyDialogueSrc.includes('{ transparent }')).toBe(true)
  })

  it('다른 게임 호출(transparent 옵션 없음)은 기본값 false라 기존 동작 그대로다', () => {
    // mount() 시그니처의 opts 기본값이 {}이므로 transparent 없이 부르면
    // 항상 불투명 — 오디세이 런·쥬라기 대탐험은 이 옵션 자체를 안 쓴다.
    expect(screensSrc.includes('opts = {}')).toBe(true)
  })
})

describe('쉬는 타임 — 대사와 10초 카운트가 동시에 뜬다 ★', () => {
  it('카운트다운(setInterval)이 runStory를 부르기 전에 이미 시작돼 있다', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    const tickIdx = body.indexOf('tickTimer = setInterval')
    const runStoryIdx = body.indexOf('runStory(app, scenes')
    expect(tickIdx).toBeGreaterThan(-1)
    expect(runStoryIdx).toBeGreaterThan(-1)
    expect(tickIdx).toBeLessThan(runStoryIdx)
  })
})

describe('쉬는 타임 — 3·2·1 시작 카운트 제거 ★', () => {
  it('runCountdown(그림 기반 3·2·1·START 연출)을 어디에서도 안 쓴다', () => {
    expect(playScreenSrc.includes('runCountdown')).toBe(false)
  })

  it('10 → 1까지 평범한 숫자만 쓰고, 0이 되면 대화창의 SKIP을 강제로 눌러 곧장 끝낸다', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    expect(body.includes('if (n <= 0)')).toBe(true)
    expect(body.includes("querySelector('#r3-story-skip')?.click()")).toBe(true)
  })
})

describe('쉬는 타임 — Rest 종료는 정확히 한 곳(finishRest)에서만 일어난다(STEP 100) ★', () => {
  it('finishRest가 resolved 플래그로 중복 호출을 막는다 — next level 정확히 한 번', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    expect(body.includes('const finishRest = result =>')).toBe(true)
    expect(body.includes('if (resolved) return')).toBe(true)
    expect(body.includes('resolved = true')).toBe(true)
  })

  it('runStory가 "done"(대사 스스로 종료)으로 끝나도 Rest는 안 끝난다 — 카운트다운만이 기준', () => {
    // 이게 STEP 100의 핵심 버그 수정이다: 공용 스토리 컴포넌트의
    // 읽는-속도 자동 넘김(autoMs, 최대 8초)이 10초 카운트다운보다
    // 먼저 'done'을 냈었다 — 그걸 무시해야 10초를 다 채운다.
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    const thenIdx = body.indexOf('.then(result =>')
    expect(thenIdx).toBeGreaterThan(-1)
    const afterThen = body.slice(thenIdx, thenIdx + 500)
    expect(afterThen.includes("result === 'skip'")).toBe(true)
    expect(afterThen.includes("result === 'home'")).toBe(true)
    // 'done' 분기에서 finishRest를 안 부른다 — 주석으로 명시돼 있다.
    expect(afterThen.includes('아무 것도 안 한다')).toBe(true)
  })

  it('카운트다운(setInterval)이 0에 닿을 때만 finishRest가 자동으로 불린다', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    const tickIdx = body.indexOf('tickTimer = setInterval')
    expect(tickIdx).toBeGreaterThan(-1)
    const tickBody = body.slice(tickIdx, tickIdx + 200)
    expect(tickBody.includes("finishRest('done')")).toBe(true)
  })

  it('runLevelTransition은 done·skip 둘 다 "진행"으로 다룬다 — home/title만 예외', () => {
    const body = fn(playScreenSrc, 'async function runLevelTransition')
    expect(body.includes("rr === 'home'")).toBe(true)
    expect(body.includes("rr === 'title'")).toBe(true)
    // 'skip'을 따로 분기하지 않는다 — home/title이 아니면 전부 진행.
    expect(body.includes("rr === 'skip'")).toBe(false)
  })
})

describe('SKIP 라벨 통일 — "SKIP" ★', () => {
  it('storyRunner.js가 스킵 버튼 글자를 "SKIP"으로 바꿔 단다(공용 파일의 "스킵"은 안 건드림)', () => {
    expect(storyRunnerSrc.includes("'SKIP '")).toBe(true)
  })

  it('공용 컴포넌트(storyDialogue.js) 자체의 라벨은 그대로 "스킵"이다 — 다른 게임 영향 없음', () => {
    expect(storyDialogueSrc.includes('스킵')).toBe(true)
  })

  it('MutationObserver로 장면이 바뀔 때마다 다시 생기는 스킵 버튼도 잡는다', () => {
    expect(storyRunnerSrc.includes('MutationObserver')).toBe(true)
  })
})

describe('SKIP 예외 없이 — 기본값이 마지막 장면에도 적용된다 ★', () => {
  it('runStory 기본값이 skipEvenOnLast !== false다(모든 화면에 SKIP)', () => {
    expect(storyRunnerSrc.includes('opts.skipEvenOnLast !== false')).toBe(true)
  })

  it('인트로(단일 장면) 호출도 특별한 플래그 없이 SKIP이 보인다 — 기본값 덕분', () => {
    const playSrc = readFileSync('src/games/balloon-festival/play.js', 'utf8')
    expect(/runStory\(app, story\.intro\?\.scenes, \{\}, \{\s*skippable: true/.test(playSrc)).toBe(true)
  })
})

describe('대화창 좌우 캐릭터(Dialogue Companion) — 실제 자산 연결(STEP 101) ★', () => {
  it('세 세트(point·rest·clap) 6장이 실제 repo 자산 경로로 등록돼 있다', () => {
    for (const name of [
      'char_boy_point.png', 'char_girl_point.png',
      'char_boy_rest.png', 'char_girl_rest.png',
      'char_boy_clap.png', 'char_girl_clap.png',
    ]) {
      expect(storyRunnerSrc.includes(name), name).toBe(true)
    }
  })

  it('★ 실제 파일이 worktree에 존재한다 — 더 이상 "자리만 준비"가 아니다', () => {
    for (const name of [
      'char_boy_point.png', 'char_girl_point.png',
      'char_boy_rest.png', 'char_girl_rest.png',
      'char_boy_clap.png', 'char_girl_clap.png',
    ]) {
      expect(existsSync(`public/assets/balloon-festival/dialogue/${name}`), name).toBe(true)
    }
  })

  it('★ preload 완료를 기다리지 않고 즉시 그린다(STEP 101 race condition fix) — 실패한 낱장만 onerror로 조용히 지운다', () => {
    expect(storyRunnerSrc.includes('onerror="this.remove()"')).toBe(true)
    expect(storyRunnerSrc.includes("ready.has('boy')")).toBe(false)
  })

  it('배치는 항상 왼쪽 boy · 오른쪽 girl로 고정된다(발화자와 무관)', () => {
    expect(storyRunnerSrc.includes('class="bf-dlg-char left" src="${poses.boy}"')).toBe(true)
    expect(storyRunnerSrc.includes('class="bf-dlg-char right" src="${poses.girl}"')).toBe(true)
  })

  it('레벨 1 → point, 레벨 2 → rest, 레벨 3 → clap으로 매핑된다', () => {
    const body = fn(playScreenSrc, 'function companionPresetFor')
    expect(body.includes("{ 1: 'point', 2: 'rest', 3: 'clap' }")).toBe(true)
  })

  it('쉬는 타임 대화(showRestWithDialogue)가 레벨별 companionPreset을 실제로 넘긴다', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    expect(body.includes('companionPreset: companionPresetFor(res)')).toBe(true)
  })

  it('마지막 레벨(gameDone) 전용 대사(showFinalClearDialogue) 함수 자체는 STEP 100에서 제거됐다', () => {
    expect(playScreenSrc.includes('function showFinalClearDialogue')).toBe(false)
    expect(playScreenSrc.includes('await showFinalClearDialogue')).toBe(false)
  })

  it('★ 인트로(스토리 화면)에는 companion을 아예 안 준다(STEP 102 — 스토리 컷 자체에 이미 캐릭터가 그려져 있다)', () => {
    const playSrc = readFileSync('src/games/balloon-festival/play.js', 'utf8')
    // 주석(설명)에는 "companionPreset을 안 준다"는 말이 나올 수 있으니
    // **실제 옵션으로 쓰였는지**(`companionPreset:` 키-값 형태)만 본다.
    expect(/companionPreset\s*:/.test(playSrc)).toBe(false)
  })

  it('★ 파트 전환(transition)·엔딩 스토리도 companion을 안 준다', () => {
    const transitionCall = playScreenSrc.slice(
      playScreenSrc.indexOf('story.transition?.scenes'),
      playScreenSrc.indexOf('story.transition?.scenes') + 80,
    )
    const endingCall = playScreenSrc.slice(
      playScreenSrc.indexOf('story.ending?.scenes'),
      playScreenSrc.indexOf('story.ending?.scenes') + 80,
    )
    expect(transitionCall.includes('companionPreset')).toBe(false)
    expect(endingCall.includes('companionPreset')).toBe(false)
  })

  it('캐릭터 오버레이는 대화창(z-index 70)보다 위, HUD를 침범 안 하는 z-index다', () => {
    const m = storyRunnerSrc.match(/\.bf-dlg-chars\s*\{[^}]*z-index:\s*(\d+)/)
    expect(m).toBeTruthy()
    expect(Number(m[1])).toBeGreaterThan(70)
  })

  it('반응형 안전영역 변수(--dialogue-*)가 정의돼 있다', () => {
    for (const v of ['--dialogue-safe-x', '--dialogue-safe-bottom', '--dialogue-character-size', '--dialogue-panel-max-width']) {
      expect(storyRunnerSrc.includes(v), v).toBe(true)
    }
  })

  it('작은 화면(모바일 가로) 전용 breakpoint가 있다', () => {
    expect(storyRunnerSrc.includes('@media (max-height:')).toBe(true)
  })

  it('★ (STEP 102) 상반신 크롭 — object-fit: cover + object-position: top으로 다리를 잘라낸다', () => {
    expect(storyRunnerSrc.includes('object-fit: cover')).toBe(true)
    expect(storyRunnerSrc.includes('object-position: top center')).toBe(true)
  })

  it('★ (STEP 102) 캐릭터 프레임 높이가 예전(90~220px)보다 확실히 커졌다', () => {
    const m = storyRunnerSrc.match(/--dialogue-character-size:\s*clamp\((\d+)px,\s*[\d.]+vh,\s*(\d+)px\)/)
    expect(m, 'clamp 형태가 아니다').toBeTruthy()
    expect(Number(m[1])).toBeGreaterThan(90)
    expect(Number(m[2])).toBeGreaterThan(220)
  })

  it('★ (STEP 102) 너비는 실제 대화창 폭(min(94vw,980px))에서 남는 여백에 맞춰 스스로 줄어든다', () => {
    expect(storyRunnerSrc.includes('--dlg-side-gap')).toBe(true)
    expect(storyRunnerSrc.includes('980px')).toBe(true)
  })

  it('★ (STEP 102) 대화창을 실측(getBoundingClientRect)해서 캐릭터를 그 옆에 직접 붙인다', () => {
    expect(storyRunnerSrc.includes('function positionCompanions')).toBe(true)
    expect(storyRunnerSrc.includes(".querySelector('.r3-story-box')")).toBe(true)
    expect(storyRunnerSrc.includes('getBoundingClientRect')).toBe(true)
  })

  it('★ (STEP 102) 대화창이 다시 그려지거나(장면 전환) 창 크기가 바뀌면 위치를 다시 잰다', () => {
    // storyRunner.js는 최상위 함수라 닫는 중괄호가 들여쓰기 없이 온다
    // (`fn()`은 클래스/객체 메서드용 2-space 들여쓰기를 가정한다) —
    // 여기서는 다음 최상위 `\n}`까지를 함수 본문으로 직접 자른다.
    const start = storyRunnerSrc.indexOf('function showCompanions')
    expect(start, 'function showCompanions이 없다').toBeGreaterThan(-1)
    const end = storyRunnerSrc.indexOf('\n}', start)
    const body = storyRunnerSrc.slice(start, end)
    expect(body.includes('new MutationObserver(sync)')).toBe(true)
    expect(body.includes("addEventListener('resize', sync)")).toBe(true)
  })
})

describe('결과 화면 — Odyssey Run 스타일(공용 옵션) 재사용, 실제 데이터만 ★', () => {
  it('finish()가 bg·scoreBlock·sparkle을 완주 시에만 켠다(Odyssey와 같은 공용 옵션)', () => {
    const body = fn(playScreenSrc, 'function finish(completed)')
    expect(body.includes('scoreBlock:')).toBe(true)
    expect(body.includes('sparkle: true')).toBe(true)
  })

  it('scoreBlock 값이 풍선 팡팡 자체 데이터다(run.score·run.bestCombo) — 오디세이 데이터 없음', () => {
    const body = fn(playScreenSrc, 'function finish(completed)')
    expect(body.includes('score: run.score')).toBe(true)
    expect(body.includes('streak: run.bestCombo')).toBe(true)
    expect(body.includes('odyssey')).toBe(false)
  })

  it('배경은 이미 있는 타이틀 그림을 재사용한다 — 새 그림 없음', () => {
    const body = fn(playScreenSrc, 'function finish(completed)')
    expect(body.includes('manifest.thumbnail')).toBe(true)
  })
})

describe('엔딩 이미지 preload — 마지막 레벨 완료 뒤 암전 원인 제거 ★', () => {
  it('preloadEndingImages가 존재하고 게임 시작 직후 호출된다', () => {
    expect(playScreenSrc.includes('function preloadEndingImages')).toBe(true)
    expect(playScreenSrc.includes('preloadEndingImages()')).toBe(true)
  })

  it('story.ending의 배경 그림을 대상으로 한다', () => {
    const body = fn(playScreenSrc, 'function preloadEndingImages')
    expect(body.includes('story.ending?.scenes')).toBe(true)
  })
})

describe('Pop FX 보존 — 이번 작업으로 안 깨졌는지 회귀 확인 ★', () => {
  it('preloadPopFx·spawnPopFx·popFxSrc가 그대로 있다', () => {
    expect(playScreenSrc.includes('function preloadPopFx')).toBe(true)
    expect(playScreenSrc.includes('function spawnPopFx')).toBe(true)
    expect(playScreenSrc.includes('const popFxSrc =')).toBe(true)
  })
})

describe('Part 2 최종 완료 — 불필요한 Dialogue/암전 제거(STEP 100) ★', () => {
  it('gameDone 분기가 대사 없이 곧장 startNextLevel → showEnding으로 간다', () => {
    const start = playScreenSrc.indexOf('if (res.gameDone) {')
    const end = playScreenSrc.indexOf('\n    }', start)   // if 블록(4칸 들여쓰기 닫힘)
    const body = playScreenSrc.slice(start, end)
    expect(body.includes('run.startNextLevel()')).toBe(true)
    expect(body.includes('await showEnding()')).toBe(true)
    // 실제 호출은 없다 — "왜 없앴는지" 설명하는 주석 안에 옛 이름이
    // 남아 있는 것과는 별개다(위 테스트가 함수 자체의 삭제를 확인한다).
    expect(body.includes('await showFinalClearDialogue')).toBe(false)
  })
})

describe('LEVEL CLEAR 별 위치 — 카드 바깥 가장자리만(STEP 100) ★', () => {
  it('별(.bf-sparkle)이 카드(.bf-clear-box)와 분리된 층(.bf-clear-fx)에 있다 — 형제 div, 안쪽 자식 아님', () => {
    const body = fn(playScreenSrc, 'function showLevelClearBanner')
    // el.innerHTML = `<div class="bf-clear-fx">${stars}</div><div class="bf-clear-box">...` —
    // fx 층이 stars를 담고, 그 뒤에 형제로 box가 온다(안에 stars가 없다).
    const fxIdx = body.indexOf('class="bf-clear-fx">${stars}</div>')
    const boxIdx = body.indexOf('class="bf-clear-box">')
    expect(fxIdx).toBeGreaterThan(-1)
    expect(boxIdx).toBeGreaterThan(fxIdx)
    // 박스 자체 마크업엔 stars가 안 들어간다.
    const boxMarkup = body.slice(boxIdx, body.indexOf('`', boxIdx))
    expect(boxMarkup.includes('${stars}')).toBe(false)
  })

  it('별 좌표가 카드 중앙이 아니라 화면 가장자리 띠에서만 뽑힌다', () => {
    const body = fn(playScreenSrc, 'function showLevelClearBanner')
    expect(body.includes('EDGE_ZONES')).toBe(true)
  })

  it('.bf-clear-fx의 z-index가 카드(.bf-clear-box)보다 낮다 — 별이 텍스트를 덮지 않는다', () => {
    const fxZ = playScreenSrc.match(/\.bf-clear-fx\s*\{[^}]*z-index:\s*(\d+)/)
    const boxZ = playScreenSrc.match(/\.bf-clear-box\s*\{[^}]*z-index:\s*(\d+)/)
    expect(fxZ).toBeTruthy()
    expect(boxZ).toBeTruthy()
    expect(Number(fxZ[1])).toBeLessThan(Number(boxZ[1]))
  })
})

describe('타이틀 화면 START 버튼 — 하단 CTA로 이동(STEP 103) ★', () => {
  it('세로 위치가 더 이상 화면 중앙(top: 56%)이 아니라 하단 고정(bottom)이다', () => {
    expect(titleScreenSrc.includes('top: 56%')).toBe(false)
    // STEP 104에서 시작 버튼 + 모드 버튼을 한 세로 묶음(.actions)으로
    // 옮기면서, 위치 고정 자체는 이제 그 부모 컨테이너가 맡는다.
    const m = titleScreenSrc.match(/#bf-title \.actions \{[^}]*bottom:\s*clamp\(/)
    expect(m, 'bottom: clamp(...)로 하단에 고정돼야 한다').toBeTruthy()
  })

  it('가로 정렬은 그대로 화면 가운데다(손 커서로 겨누기 쉬운 자리 유지)', () => {
    const m = titleScreenSrc.match(/#bf-title \.actions \{([^}]*)\}/)
    expect(m).toBeTruthy()
    expect(m[1].includes('left: 50%')).toBe(true)
    expect(m[1].includes('translateX(-50%)')).toBe(true)
  })

  it('펄스 애니메이션은 이제 scale만 한다(위치는 부모가 고정하므로 translate 보정이 필요 없다)', () => {
    expect(titleScreenSrc.includes('translate(-50%, -50%)')).toBe(false)
    const m = titleScreenSrc.match(/@keyframes bf-title-pulse \{([^}]*\{[^}]*\}[^}]*)\}/)
    expect(m, 'keyframes 블록을 못 찾았다').toBeTruthy()
    expect(m[1].includes('scale(1.05)')).toBe(true)
  })
})

describe('게임 화면 좌하단 진단 텍스트 — production에서 숨김(STEP 103) ★', () => {
  it('#bf-diag 마크업 자체가 import.meta.env.DEV일 때만 들어간다', () => {
    expect(playScreenSrc.includes("import.meta.env.DEV ? '<div id=\"bf-diag\"></div>' : ''")).toBe(true)
  })

  it('detectDiag 함수도 DEV가 아니면 곧바로 리턴한다(계산 자체를 안 돈다)', () => {
    const body = fn(playScreenSrc, 'function detectDiag')
    expect(body.trim().startsWith('function detectDiag(fresh, tSec) {\n    if (!import.meta.env.DEV) return')).toBe(true)
  })
})

describe('휴식 타임 대화 "다음" 버튼 — 더 갈 다음이 없으면 비활성화(STEP 103) ★', () => {
  it('showStoryScene이 disableNextOnLast 옵션을 받는다', () => {
    expect(storyDialogueSrc.includes('disableNextOnLast = false')).toBe(true)
  })

  it('마지막 줄에서 disableNextOnLast가 켜져 있으면 다음 버튼을 꺼두고, 자동 넘김 타이머도 안 건다', () => {
    const body = topFn(storyDialogueSrc, 'export function showStoryScene')
    expect(body.includes('nextBtn.disabled = disableNextOnLast && isLastLine')).toBe(true)
    expect(body.includes('if (!(disableNextOnLast && isLastLine)) {')).toBe(true)
  })

  it('go()에도 방어선이 있다 — 혹시 눌려도 disableNextOnLast면 대화를 끝내지 않는다', () => {
    const body = topFn(storyDialogueSrc, 'export function showStoryScene')
    const goStart = body.indexOf('function go(d)')
    expect(goStart).toBeGreaterThan(-1)
    const goBody = body.slice(goStart, body.indexOf('\n    }', goStart))
    expect(goBody.includes('if (disableNextOnLast) return')).toBe(true)
  })

  it('꺼진 다음 버튼도 이전 버튼과 같은 방식으로 흐리게 보인다(CSS)', () => {
    expect(screensSrc.includes('.r3-story-prev:disabled, .r3-story-next:disabled')).toBe(true)
  })

  it('runStory가 disableNextOnLast를 받아 맨 마지막 장면에만 넘긴다(중간 장면엔 안 준다)', () => {
    const body = topFn(storyRunnerSrc, 'export async function runStory')
    expect(body.includes('disableNextOnLast: !!opts.disableNextOnLast && isLast')).toBe(true)
  })

  it('showRestWithDialogue가 disableNextOnLast: true로 넘긴다 — 대화는 카운트다운/SKIP으로만 끝난다', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    expect(body.includes('disableNextOnLast: true')).toBe(true)
  })

  it('★ 예전의 ms: LEVEL_REST_SECONDS * 1000 동기화 트릭은 제거됐다 — 이제 다음 버튼 자체가 꺼져서 필요 없다', () => {
    const body = fn(playScreenSrc, 'function showRestWithDialogue')
    expect(body.includes('ms: LEVEL_REST_SECONDS')).toBe(false)
  })
})
