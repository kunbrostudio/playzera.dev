// 풍선 팡팡 — Play Mode(같이 하는 인원 수) 1차 기반 작업(STEP 104).
//
// 이번 단계는 "Mode UI + Config + Audit"이 우선이고, 실제 다인 입력을
// 성급하게 구현하지 않는다 — 그래서 이 파일이 검사하는 것도 딱 그만큼:
// (1) SOLO는 기존 값과 완전히 같은가(회귀 없음, 가장 중요), (2) DUO·
// GROUP config가 요청값 그대로 있는가(3배, 5배 아님), (3) 타이틀 화면의
// 모드 선택 UI가 오디세이 런 팝업과 같은 공용 클래스를 쓰는가, (4)
// `runBalloonPlay`가 모드별 quota를 실제로 `BalloonFestivalRun`에
// 넘기는가. gameplay 판정(잡기·터뜨리기·다인 손 입력)은 이 파일이
// 검사하지 않는다 — 아직 구현 대상이 아니다(요청 7번).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { BalloonFestivalRun, PART1_LEVEL_QUOTAS, PART2_LEVEL_QUOTAS } from '../src/games/balloon-festival/game.js'
import { PLAY_MODES, PLAY_MODE_LIST, DEFAULT_PLAY_MODE, getPlayMode } from '../src/games/balloon-festival/modes.js'

const titleScreenSrc = readFileSync('src/games/balloon-festival/ui/titleScreen.js', 'utf8')
const playScreenSrc = readFileSync('src/games/balloon-festival/ui/playScreen.js', 'utf8')
const playSrc = readFileSync('src/games/balloon-festival/play.js', 'utf8')

describe('Play Mode config(modes.js) — SOLO 보호가 최우선 ★', () => {
  it('기본 모드는 SOLO다', () => {
    expect(DEFAULT_PLAY_MODE).toBe('solo')
    expect(getPlayMode(undefined).id).toBe('solo')
    expect(getPlayMode('nonsense-id').id).toBe('solo')   // 모르는 값도 SOLO로 떨어진다
  })

  it('★ SOLO quota는 game.js의 기존 PART1/PART2_LEVEL_QUOTAS와 정확히 같다 — 여기서 숫자가 갈리면 조용한 회귀다', () => {
    expect(PLAY_MODES.solo.part1Quotas).toEqual(PART1_LEVEL_QUOTAS)
    expect(PLAY_MODES.solo.part2Quotas).toEqual(PART2_LEVEL_QUOTAS)
    expect(PLAY_MODES.solo.part1Quotas).toEqual([5, 10, 15])
  })

  it('DUO quota는 10/20/30이다', () => {
    expect(PLAY_MODES.duo.part1Quotas).toEqual([10, 20, 30])
    expect(PLAY_MODES.duo.part2Quotas).toEqual([10, 20, 30])
    expect(PLAY_MODES.duo.players).toBe(2)
  })

  it('★ GROUP quota는 15/30/45다 — 1인의 5배가 아니라 3배(요청 2번, 5배 적용 금지)', () => {
    expect(PLAY_MODES.group.part1Quotas).toEqual([15, 30, 45])
    expect(PLAY_MODES.group.part2Quotas).toEqual([15, 30, 45])
    // 5배였다면 25/50/75가 됐을 것 — 명시적으로 아님을 못박는다.
    expect(PLAY_MODES.group.part1Quotas).not.toEqual([25, 50, 75])
    expect(PLAY_MODES.group.players).toBe('3+')
  })

  it('표시 이름이 요청 그대로다(혼자 하기·둘이 하기·함께 하기, 3명 이상)', () => {
    expect(PLAY_MODES.solo.label).toBe('혼자 하기')
    expect(PLAY_MODES.duo.label).toBe('둘이 하기')
    expect(PLAY_MODES.group.label).toBe('함께 하기')
    expect(PLAY_MODES.group.sublabel).toBe('3명 이상')
  })

  it('팝업이 그릴 순서는 혼자→둘이→함께다', () => {
    expect(PLAY_MODE_LIST.map(m => m.id)).toEqual(['solo', 'duo', 'group'])
  })

  it('모든 모드가 레벨 3개(quota 배열 길이 3)다 — game.js가 레벨 인덱스로 찾는 다른 배열(BALLOON_R 등)과 어긋나지 않는다', () => {
    for (const m of PLAY_MODE_LIST) {
      expect(m.part1Quotas).toHaveLength(3)
      expect(m.part2Quotas).toHaveLength(3)
    }
  })
})

describe('BalloonFestivalRun — 모드별 quota를 옵션으로 그대로 받는다(회귀 없음) ★', () => {
  it('옵션 없이 만들면(기존 SOLO 호출과 동일) 여전히 5/10/15다', () => {
    const run = new BalloonFestivalRun()
    expect(run.part1Quotas).toEqual([5, 10, 15])
    expect(run.part2Quotas).toEqual([5, 10, 15])
  })

  it('DUO config를 넘기면 실제로 10/20/30 레벨로 시작한다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: PLAY_MODES.duo.part1Quotas, part2Quotas: PLAY_MODES.duo.part2Quotas })
    expect(run.quota).toBe(10)          // 1부 레벨 1
    expect(run.field.count).toBe(10)    // quota만큼 실제로 스폰됐다(기존 규칙 그대로)
  })

  it('GROUP config를 넘기면 실제로 15/30/45 레벨로 시작한다', () => {
    const run = new BalloonFestivalRun({ part1Quotas: PLAY_MODES.group.part1Quotas, part2Quotas: PLAY_MODES.group.part2Quotas })
    expect(run.quota).toBe(15)
    expect(run.field.count).toBe(15)
  })
})

describe('타이틀 화면 — Play Mode selector UI(STEP 104) ★', () => {
  it('오디세이 런 속도 팝업과 같은 공용 팝업 뼈대(상자·액션 묶음)를 그대로 쓴다(새 팝업 모양을 안 짠다)', () => {
    expect(titleScreenSrc.includes('class="pz-confirm-box"')).toBe(true)
    expect(titleScreenSrc.includes('class="pz-confirm-actions"')).toBe(true)
    // STEP 106 — 옵션 카드 자체는 이 게임 전용 통일 디자인(.bf-mode-opt)이다
    // (요청: "옵션마다 색이 달라 임시 화면처럼 보인다" → 공통 베이스로 정리).
    // 팝업의 뼈대(오버레이·상자·액션 묶음)만 공용, 카드 스타일은 이 파일 것.
    expect(titleScreenSrc.includes('class="bf-mode-opt"')).toBe(true)
  })

  it('그 공용 클래스가 실제로 그려지려면 ensureSysBarStyle을 불러야 한다', () => {
    expect(titleScreenSrc.includes("import { ensureSysBarStyle } from '../../runner/ui/systemBar.js'")).toBe(true)
    expect(titleScreenSrc.includes('ensureSysBarStyle(')).toBe(true)
  })

  it('오디세이 런 파일(screens.js) 자체는 안 건드렸다(read-only 참고)', () => {
    // 이 저장소에 있는 그 파일이 이번 세션에서 변경됐는지는 git이 안다 —
    // 여기서는 최소한 "임포트해서 재사용"이 아니라 클래스 이름만 맞춘
    // 독립 구현임을 확인한다(오디세이 런의 내부 함수를 안 부른다).
    expect(titleScreenSrc.includes("from '../../runner3d/screens.js'")).toBe(false)
  })

  it('모드 버튼과 팝업 옵션이 실제로 존재한다', () => {
    expect(titleScreenSrc.includes('id="bf-mode-btn"')).toBe(true)
    expect(titleScreenSrc.includes('id="bf-mode-popup"')).toBe(true)
    expect(titleScreenSrc.includes('id="bf-mode-close"')).toBe(true)
  })

  it('선택 상태는 .on 클래스로 표시한다(오디세이 속도 팝업과 같은 패턴)', () => {
    expect(titleScreenSrc.includes('.bf-mode-opt.on')).toBe(true)
    expect(titleScreenSrc.includes("classList.toggle('on', b.dataset.id === modeId)")).toBe(true)
  })

  it('showTitleScreen이 { result, mode }를 돌려준다 — 옛 문자열 하나만 반환하던 것에서 바뀌었다', () => {
    expect(titleScreenSrc.includes("resolve({ result: 'start', mode: modeId })")).toBe(true)
    expect(titleScreenSrc.includes("resolve({ result: 'home', mode: modeId })")).toBe(true)
  })

  it('초기 모드를 인자로 받는다(Replay 시 방금 고른 모드를 유지하기 위해)', () => {
    expect(titleScreenSrc.includes('export function showTitleScreen(app, initialModeId = DEFAULT_PLAY_MODE)')).toBe(true)
  })
})

describe('play.js — 모드 lifecycle(선택값을 세션 동안 들고 있다가 넘긴다) ★', () => {
  it('루프 시작 전 SOLO로 초기화하고, 루프 안에서 goTitle 결과로 갱신한다', () => {
    expect(playSrc.includes('let mode = DEFAULT_PLAY_MODE')).toBe(true)
    expect(playSrc.includes('const { result: titleResult, mode: chosenMode } = await showTitleScreen(app, mode)')).toBe(true)
    expect(playSrc.includes('mode = chosenMode')).toBe(true)
  })

  it('실제 플레이 화면(runBalloonPlay)에 선택된 mode를 넘긴다', () => {
    expect(playSrc.includes('await runBalloonPlay(app, manifest, mode)')).toBe(true)
  })
})

describe('playScreen.js — runBalloonPlay가 모드별 quota를 BalloonFestivalRun에 넘긴다 ★', () => {
  it('modeId 인자가 없으면 DEFAULT_PLAY_MODE(SOLO)로 떨어진다', () => {
    expect(playScreenSrc.includes('export async function runBalloonPlay(app, manifest, modeId = DEFAULT_PLAY_MODE)')).toBe(true)
  })

  it('getPlayableMode로 찾은 quota를 그대로 생성자에 넘긴다 — 숫자를 새로 안 흩뿌린다(STEP 105: 준비 중 모드는 SOLO로 떨어진다)', () => {
    expect(playScreenSrc.includes('const playMode = getPlayableMode(modeId)')).toBe(true)
    expect(playScreenSrc.includes('part1Quotas: playMode.part1Quotas')).toBe(true)
    expect(playScreenSrc.includes('part2Quotas: playMode.part2Quotas')).toBe(true)
  })

  it('★ (STEP 107) 클리어 대사도 같은 run.quotas를 읽는다 — HUD·게임 판정·대사가 전부 한 값을 본다', () => {
    expect(playScreenSrc.includes('return lines[res.clearedLevel - 1]?.(run.quotas) ?? \'\'')).toBe(true)
  })
})

describe('타이틀 화면 — Mode selector·팝업 디자인 정리(STEP 106) ★', () => {
  it('모드 셀렉터 버튼에 펼침 표시(caret)가 있다 — "누르면 더 있다"는 걸 알린다', () => {
    expect(titleScreenSrc.includes('class="caret"')).toBe(true)
  })

  it('옵션 카드가 공통 베이스 클래스 하나를 쓴다(요청 3번 — 색이 제각각인 임시 버튼처럼 안 보이게)', () => {
    // 모든 PLAY_MODE_LIST 항목이 같은 class="bf-mode-opt"로 그려진다 —
    // 세트마다 다른 클래스(예: solo만 다른 색)를 안 준다.
    const matches = titleScreenSrc.match(/class="bf-mode-opt"/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(titleScreenSrc.includes('data-id="${m.id}"')).toBe(true)
  })

  it('선택 표시는 체크 아이콘 + 골드 테두리·글로우다 — 카드를 통째로 채우지 않는다', () => {
    expect(titleScreenSrc.includes("icon('check')")).toBe(true)
    expect(titleScreenSrc.includes('.bf-mode-opt.on {')).toBe(true)
    // "카드 전체를 노란색으로 채우는" 예전 스타일(반응형 없는 단색 배경 채움)이
    // 아니라 테두리+은은한 배경으로 바뀌었다 — background가 불투명 골드가
    // 아니라 반투명(rgba)이어야 한다.
    const onBlock = titleScreenSrc.slice(titleScreenSrc.indexOf('.bf-mode-opt.on {'), titleScreenSrc.indexOf('.bf-mode-opt.on {') + 300)
    expect(onBlock.includes('rgba(255, 210, 62,')).toBe(true)
  })

  it('GROUP은 준비 중 배지로, DUO는 BETA 배지로 표시된다', () => {
    expect(titleScreenSrc.includes("m.badge ?? '준비 중'")).toBe(true)
    expect(titleScreenSrc.includes('m.betaBadge')).toBe(true)
    expect(PLAY_MODES.duo.betaBadge).toBe('BETA')
  })

  it('닫기는 옵션과 비중이 다른 작은 원형 X다(요청 6번) — 더 이상 옵션과 같은 큰 카드가 아니다', () => {
    expect(titleScreenSrc.includes('class="close-x"')).toBe(true)
    expect(titleScreenSrc.includes('닫기')).toBe(true)   // aria-label로 여전히 접근성은 유지
  })

  it('작은 화면에서 팝업이 스크롤되고 잘리지 않는다', () => {
    expect(titleScreenSrc.includes('overflow-y: auto')).toBe(true)
    expect(titleScreenSrc.includes('@media (max-height: 480px)')).toBe(true)
  })
})

describe('TEST/BETA 배포 안전 점검 ★', () => {
  it('★ 카메라 로딩 오버레이보다 HUD(나가기 버튼)가 위에 있다 — 카메라 실패 시 화면에 갇히지 않는다', () => {
    const hudZ = playScreenSrc.match(/#bf-hud \{[^}]*z-index:\s*(\d+)/)
    const loadingZ = playScreenSrc.match(/#bf-loading \{[^}]*z-index:\s*(\d+)/)
    expect(hudZ).toBeTruthy()
    expect(loadingZ).toBeTruthy()
    expect(Number(hudZ[1])).toBeGreaterThan(Number(loadingZ[1]))
  })

  it('production 빌드에서 디버그 텍스트(#bf-diag)가 렌더되지 않는다(STEP 103, 재확인)', () => {
    expect(playScreenSrc.includes("import.meta.env.DEV ? '<div id=\"bf-diag\"></div>' : ''")).toBe(true)
  })

  it('카메라 프레임/이미지를 서버로 업로드하거나 저장하는 코드가 없다', () => {
    const suspects = ['toDataURL', 'toBlob(', 'FormData', 'XMLHttpRequest']
    for (const s of [playScreenSrc, readFileSync('src/core/pose/poseEngine.js', 'utf8')]) {
      for (const bad of suspects) expect(s.includes(bad)).toBe(false)
    }
  })

  it('결과 저장(gameResult.js)은 점수·집계 숫자만 보낸다 — 이미지/비디오 필드가 없다', () => {
    const src = readFileSync('src/core/gameResult.js', 'utf8')
    expect(src.includes('image')).toBe(false)
    expect(src.includes('video')).toBe(false)
    expect(src.includes('frame')).toBe(false)
  })
})
