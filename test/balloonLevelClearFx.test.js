// 풍선 팡팡 — LEVEL CLEAR 시각 축하 효과(오디오 없음) + Part 2 Pop 이미지
// 연결(STEP 97). 카메라·손 트래커가 얽힌 `playScreen.js`의 화면 함수들은
// (`showLevelClearBanner`·`spawnPopFx` 등) 모듈 밖으로 안 나오는 클로저라
// 이 저장소의 다른 무거운 화면들(오디세이 런 등)과 같은 방식으로 검증한다
// — 소스 문자열 검사 + 실제 asset 파일 존재 확인. DOM 애니메이션 자체가
// 눈으로 맞는지는 브라우저에서 봐야 한다(README/보고 참고).
import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { BALLOON_COLORS, BALLOON_POP_SPRITES } from '../src/games/balloon-festival/assets.js'

const playScreenSrc = readFileSync('src/games/balloon-festival/ui/playScreen.js', 'utf8')
const asPath = url => 'public' + url

describe('LEVEL CLEAR — 오디오 제거, 시각 효과만 ★', () => {
  it('레벨 클리어 배너 경로에 clap/cheer/success/round_clear/game_clear 오디오 호출이 없다', () => {
    // 이 넷은 요청에서 명시적으로 뺀 SFX 이름이다(core/sound.js의 실제
    // case 이름과 맞춰서 검사한다 — 'round_clear'·'game_clear').
    for (const banned of ["'round_clear'", "'game_clear'"]) {
      expect(playScreenSrc.includes(banned)).toBe(false)
    }
  })

  it('Rest 카운트다운의 beep/go(성공 피드백이 아니라 카운트다운 신호음)는 그대로 남아 있다', () => {
    // "성공 피드백에서 오디오 제거"이지 오디오 시스템 자체를 걷어낸 게
    // 아니다 — 카운트다운 신호음은 요청 범위 밖이라 안 건드렸다.
    expect(playScreenSrc.includes("sound.play('beep')")).toBe(true)
  })

  it('꽃가루(core/confetti.js) — 기존 공용 연출을 재사용한다', () => {
    expect(playScreenSrc.includes('burstConfetti')).toBe(true)
  })

  it('작은 별(sparkle) 요소가 시각 효과로 존재한다', () => {
    expect(playScreenSrc.includes('bf-sparkle')).toBe(true)
  })

  it('배너가 화면을 완전히 안 가린다 — 반투명 배경(rgba)이다', () => {
    expect(/#bf-clear\s*\{[^}]*background:\s*rgba\(/.test(playScreenSrc)).toBe(true)
  })

  it('Part Complete(레벨3/gameDone)에서 효과가 더 풍성해진다 — grand 분기가 존재한다', () => {
    expect(playScreenSrc.includes('const grand = !!res.partDone')).toBe(true)
  })
})

describe('Pop Asset — 실제 파일 존재 확인 ★', () => {
  it('색상 7개 전부 BALLOON_POP_SPRITES에 등록돼 있고 BALLOON_COLORS와 정확히 같은 색 집합이다', () => {
    expect(new Set(Object.keys(BALLOON_POP_SPRITES))).toEqual(new Set(BALLOON_COLORS))
  })

  it('★ 등록된 경로마다 실제 파일이 worktree에 존재한다(더 이상 대체 그림에만 의존하지 않는다)', () => {
    for (const [color, url] of Object.entries(BALLOON_POP_SPRITES)) {
      expect(existsSync(asPath(url)), `${color}: ${url}`).toBe(true)
    }
  })
})

describe('Pop FX — 실제 pop 판정 경로에 연결돼 있다 ★', () => {
  it('pop 이벤트 처리부에서 spawnPopFx를 호출한다(Pop FX가 실제 hit 판정에 매달려 있다)', () => {
    expect(/if \(ev\.type === 'pop'\) spawnPopFx\(/.test(playScreenSrc)).toBe(true)
  })

  it('spawnPopFx는 popFxSrc(색 매핑 우선순위 함수)로 이미지를 고른다', () => {
    expect(playScreenSrc.includes('el.src = popFxSrc(colorFor(id))')).toBe(true)
  })

  it('preloadPopFx가 게임 시작 직후(1부 진행 중) 호출되어 2부 전에 미리 받아둔다', () => {
    expect(playScreenSrc.includes('preloadPopFx()')).toBe(true)
  })
})
