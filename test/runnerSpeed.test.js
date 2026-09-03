// 러너 속도 설정 — localStorage 하나짜리 순수 모듈. ★
import { describe, it, expect, beforeEach } from 'vitest'
import {
  SPEED_TIERS, getRunnerSpeedId, setRunnerSpeedId, runnerSpeedMultiplier, runnerSpeedLabel,
} from '../src/core/runnerSpeed.js'

beforeEach(() => localStorage.clear())

describe('러너 속도 설정 ★', () => {
  it('안 골랐으면 "보통"이고 배율은 1이다', () => {
    expect(getRunnerSpeedId()).toBe('normal')
    expect(runnerSpeedMultiplier()).toBe(1)
    expect(runnerSpeedLabel()).toBe('보통')
  })

  it('고르면 저장되고 다시 읽어도 남아 있다', () => {
    setRunnerSpeedId('veryFast')
    expect(getRunnerSpeedId()).toBe('veryFast')
    expect(runnerSpeedMultiplier()).toBeGreaterThan(1)
    expect(runnerSpeedLabel()).toBe('매우 빠르게')
  })

  it('목록에 없는 id는 조용히 무시한다 — 지금 값이 안 바뀐다', () => {
    setRunnerSpeedId('fast')
    setRunnerSpeedId('supersonic')   // 없는 id
    expect(getRunnerSpeedId()).toBe('fast')
  })

  it('저장된 값이 목록에 없으면(옛 버전 흔적 등) 기본값으로 돌아간다', () => {
    localStorage.setItem('pz_runner_speed', 'no-longer-exists')
    expect(getRunnerSpeedId()).toBe('normal')
  })

  it('★ 배율은 1보다 작지 않다 — "빠르게"이지 "느리게"가 아니다', () => {
    // 이 기능의 목적이 "3~5세보다 빠른 아이도 할 수 있게"이므로, 실수로
    // 기본보다 느린 단계가 섞이면 목적과 반대로 간다.
    for (const t of SPEED_TIERS) expect(t.mult).toBeGreaterThanOrEqual(1)
  })

  it('단계는 배율 오름차순으로 정렬돼 있다 — 팝업에 그대로 나열된다', () => {
    // 팝업은 SPEED_TIERS 순서를 그대로 버튼으로 그린다(screens.js) —
    // 순서가 뒤죽박죽이면 "보통·매우 빠르게·빠르게"처럼 헷갈리게 뜬다.
    const mults = SPEED_TIERS.map(t => t.mult)
    expect(mults).toEqual([...mults].sort((a, b) => a - b))
  })

  it('normal 단계는 배율이 정확히 1이다 — 기존 게임 밸런스를 안 건드린다', () => {
    const normal = SPEED_TIERS.find(t => t.id === 'normal')
    expect(normal.mult).toBe(1)
  })
})
