-- ============================================================
-- 002_warmup_records.sql
-- 웜업 게임(JAPARI RUN) 기록을 game_results에 수용
-- 실행 환경: Supabase 대시보드 SQL Editor
-- ============================================================
--
-- 배경
--   웜업 게임은 Express + data/records.json 파일로 기록을 저장했다.
--   Render 배포본은 재배포 시 디스크가 초기화되어 기록이 유실됐다(확인: 0건).
--   → Supabase로 전환한다.
--
-- 새 테이블을 만들지 않는다.
--   기존 game_results가 이미 extra_data JSONB를 갖고 있어
--   게임별 고유 지표를 그대로 흡수할 수 있다.
-- ============================================================

-- 1) session_id를 nullable로 완화
--    웜업 게임에는 수업 세션 개념이 없다. 가정에서 혼자 하는 경우도 마찬가지.
--    (gameResult.js의 saveResult()가 sessionId 기본값 null을 넘기고 있어
--     현재 스키마로는 NOT NULL 위반으로 실패한다 — 기존 버그도 함께 해소)
ALTER TABLE game_results
  ALTER COLUMN session_id DROP NOT NULL;

-- 2) player_name도 nullable로 완화
--    1단계에서는 이름 입력 없이 플레이하는 경로가 있다(가정 사용).
ALTER TABLE game_results
  ALTER COLUMN player_name DROP NOT NULL;

-- 3) 운동 데이터 조회용 인덱스
--    "이 아이가 점프를 몇 번 했나" 류의 집계를 위해 extra_data 내부 키 접근이 잦다.
--    001에서 만든 GIN 인덱스가 커버하지만, 시간순 조회가 주 패턴이므로 보강.
CREATE INDEX IF NOT EXISTS idx_game_results_played_at
  ON game_results (played_at DESC);

-- ============================================================
-- extra_data 규약 (웜업 게임)
-- ============================================================
-- {
--   "source":      "warmup-obstacle",
--   "duration_sec": 92,          -- 플레이 시작~종료. 메뉴 시간은 제외됨
--   "active_sec":   78,          -- 실제로 움직인 시간 ★운동량 지표는 이것을 쓴다
--   "completed":    true,
--   "obstacles_cleared": 18,
--   "obstacles_missed":   2,
--   "exercise": {
--     "side_steps": 12,
--     "jumps":       8,
--     "squats":      5,
--     "pose_holds": [ { "pose": "lunge", "hold_sec": 3.2, "success": 1 } ]
--   },
--   "legacy_id":   "ms2r8dmvzps2r",   -- 임포트된 기존 기록만
--   "imported_at": "2026-07-29T..."   -- 임포트된 기존 기록만
-- }
--
-- 컬럼 매핑
--   score          ← score.stars          (별 개수)
--   rounds_cleared ← levelReached         (도달 레벨)
--   game_id        ← 'warmup-obstacle'    (기존 'japari-run'에서 통일)
--   player_name    ← userId 또는 null
--   played_at      ← 실제 플레이 시작 시점 (playStartedAt)
--
-- ⚠️ duration_sec 의미 변경 (2026-07-29)
--   초기 구현은 Stats 생성 시점(= 타이틀 화면 도착)부터 계산해서
--   타이틀·카메라 준비·튜토리얼에 머문 시간이 전부 포함됐다.
--   실측 예: duration_sec 58 / active_sec 6  → 52초가 메뉴 시간이었다.
--   이후 playStartedAt 기준으로 교정했고, 세션 시작 시각은
--   extra_data.session_started_at 으로 따로 남긴다.
--
--   임포트된 33건(legacy_id 있음)은 교정 전 값이므로
--   duration_sec을 운동량으로 신뢰할 수 없다. → active_sec을 쓸 것.
-- ============================================================

-- 4) 확인용 뷰 — 운동 데이터 요약
CREATE OR REPLACE VIEW exercise_summary AS
SELECT
  game_id,
  player_name,
  COUNT(*)                                              AS sessions,
  SUM((extra_data->>'duration_sec')::int)               AS total_duration_sec,
  SUM((extra_data->>'active_sec')::int)                 AS total_active_sec,
  SUM((extra_data->'exercise'->>'jumps')::int)          AS total_jumps,
  SUM((extra_data->'exercise'->>'squats')::int)         AS total_squats,
  SUM((extra_data->'exercise'->>'side_steps')::int)     AS total_side_steps,
  COUNT(*) FILTER (WHERE (extra_data->>'completed')::boolean) AS completed_count,
  MAX(played_at)                                        AS last_played_at
FROM game_results
WHERE extra_data ? 'exercise'
GROUP BY game_id, player_name;
