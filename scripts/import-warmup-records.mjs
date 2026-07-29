#!/usr/bin/env node
/**
 * 웜업 게임 기존 기록 임포트 (STEP 1-4)
 *
 * warm-up-web/data/records.json → Supabase game_results
 *
 * 배경
 *   Express + 파일 저장 방식이라 Render 배포본 기록은 재배포 때 유실됐다(확인: 0건).
 *   로컬에 남은 기록만이 현장 테스트의 유일한 흔적이므로 옮겨둔다.
 *
 * 사용법
 *   node scripts/import-warmup-records.mjs                  # 미리보기 (기본)
 *   node scripts/import-warmup-records.mjs --commit         # 실제 삽입
 *   node scripts/import-warmup-records.mjs --commit --file=경로
 *
 * 선행 조건
 *   supabase/migrations/002_warmup_records.sql 실행 완료
 *   .env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
 */

import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const GAME_ID = 'warmup-obstacle'
const DEFAULT_SOURCE = resolve(ROOT, '../warm-up-web/data/records.json')

// ── 인자 ──────────────────────────────────────────────
const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const fileArg = args.find(a => a.startsWith('--file='))
const SOURCE = fileArg ? resolve(fileArg.slice(7)) : DEFAULT_SOURCE

// ── .env 로드 (Vite 없이 실행되므로 직접 파싱) ──────────
function loadEnv() {
  const path = resolve(ROOT, '.env')
  if (!existsSync(path)) {
    fail('.env 파일이 없습니다.', `기대 위치: ${path}`)
  }
  const env = {}
  for (const line of readFileSync(path, 'utf-8').split('\n')) {
    const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/)
    if (m && !line.trim().startsWith('#')) {
      env[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  }
  return env
}

function fail(...msg) {
  console.error('\n✖', ...msg, '\n')
  process.exit(1)
}

// ── 레코드 변환 ────────────────────────────────────────
// records.json 1건 → game_results 1행
function toRow(rec) {
  return {
    session_id:     null,
    game_id:        GAME_ID,
    player_name:    rec.userId ?? null,
    score:          rec.score?.stars ?? 0,
    rounds_cleared: rec.levelReached ?? 0,
    center_code:    null,
    user_id:        null,
    played_at:      rec.startedAt ?? rec.savedAt ?? new Date().toISOString(),
    extra_data: {
      source:            GAME_ID,
      duration_sec:      rec.durationSec ?? 0,
      active_sec:        rec.exercise?.activeSec ?? 0,
      completed:         !!rec.completed,
      obstacles_cleared: rec.score?.obstaclesCleared ?? 0,
      obstacles_missed:  rec.score?.obstaclesMissed ?? 0,
      exercise: {
        side_steps: rec.exercise?.sideSteps ?? 0,
        jumps:      rec.exercise?.jumps ?? 0,
        squats:     rec.exercise?.squats ?? 0,
        pose_holds: (rec.exercise?.poseHolds ?? []).map(p => ({
          pose:     p.pose,
          hold_sec: p.holdSec,
          success:  p.success,
        })),
      },
      // 중복 임포트 판별용 — 원본 파일의 id를 보존한다
      legacy_id:   rec.id ?? null,
      imported_at: new Date().toISOString(),
    },
  }
}

// ── 실행 ───────────────────────────────────────────────
async function main() {
  if (!existsSync(SOURCE)) fail('원본 파일을 찾을 수 없습니다.', SOURCE)

  const raw = JSON.parse(readFileSync(SOURCE, 'utf-8'))
  if (!Array.isArray(raw)) fail('records.json이 배열이 아닙니다.')

  const rows = raw.map(toRow)

  // 요약
  const sum = rows.reduce((a, r) => {
    const e = r.extra_data
    a.duration += e.duration_sec
    a.active   += e.active_sec
    a.jumps    += e.exercise.jumps
    a.squats   += e.exercise.squats
    a.steps    += e.exercise.side_steps
    if (e.completed) a.completed++
    return a
  }, { duration: 0, active: 0, jumps: 0, squats: 0, steps: 0, completed: 0 })

  console.log(`\n원본       ${SOURCE}`)
  console.log(`레코드     ${rows.length}건`)
  console.log(`기간       ${rows[0]?.played_at?.slice(0, 10)} ~ ${rows.at(-1)?.played_at?.slice(0, 10)}`)
  console.log('\n── 누적 운동 데이터 ──')
  console.log(`  총 플레이     ${sum.duration}초 (${(sum.duration / 60).toFixed(1)}분)`)
  console.log(`  실제 활동     ${sum.active}초 (${(sum.active / 60).toFixed(1)}분)`)
  console.log(`  좌우 이동     ${sum.steps}회`)
  console.log(`  점프          ${sum.jumps}회`)
  console.log(`  앉기          ${sum.squats}회`)
  console.log(`  미션 완료     ${sum.completed}/${rows.length}회`)

  if (!COMMIT) {
    console.log('\n미리보기 모드입니다. 실제로 넣으려면 --commit 을 붙이세요.')
    console.log('예시 1건:')
    console.log(JSON.stringify(rows[0], null, 2))
    return
  }

  const env = loadEnv()
  const url = env.VITE_SUPABASE_URL
  const key = env.VITE_SUPABASE_ANON_KEY
  if (!url || !key) fail('.env에 VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY가 필요합니다.')

  const supabase = createClient(url, key)

  // 중복 방지 — 이미 임포트된 legacy_id는 건너뛴다
  const { data: existing, error: selErr } = await supabase
    .from('game_results')
    .select('extra_data')
    .eq('game_id', GAME_ID)
  if (selErr) fail('기존 기록 조회 실패:', selErr.message)

  const seen = new Set(
    (existing ?? []).map(r => r.extra_data?.legacy_id).filter(Boolean)
  )
  const fresh = rows.filter(r => !seen.has(r.extra_data.legacy_id))

  if (!fresh.length) {
    console.log(`\n이미 ${seen.size}건이 임포트되어 있습니다. 새로 넣을 것이 없습니다.`)
    return
  }
  if (seen.size) console.log(`\n기존 ${seen.size}건은 건너뜁니다.`)

  const { data, error } = await supabase.from('game_results').insert(fresh).select('id')
  if (error) fail('삽입 실패:', error.message)

  console.log(`\n✔ ${data.length}건 삽입 완료`)
  console.log('  확인: Supabase 대시보드 → game_results 또는 exercise_summary 뷰')
}

main().catch(e => fail(e.message))
