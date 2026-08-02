-- ============================================================
-- 003_input_mode.sql
-- 운동 데이터에서 키보드 모드 기록을 분리
-- 실행 환경: Supabase 대시보드 SQL Editor
-- ============================================================
--
-- 배경
--   웜업 게임의 점프·앉기·피하기 카운트는 "장애물 성공 여부와 무관하게
--   실제 몸 동작 횟수"를 센다. 운동량 지표로는 올바른 설계다.
--
--   문제는 키보드 모드(카메라 없이 플레이)다.
--   방향키를 누르기만 해도 카운트가 올라간다 — 손가락 운동이지 유아체육이 아니다.
--   개발·테스트가 대부분 키보드로 이뤄지므로, 구분하지 않으면
--   "이 아이 이번 달 점프 300회" 같은 리포트에 테스트 기록이 섞인다.
--
--   운동 데이터 누적이 이 플랫폼의 존재 이유이므로 반드시 분리한다.
--
-- 방침
--   기록을 지우지 않는다. extra_data.input_mode로 표시하고
--   운동 통계 뷰에서 'motion'만 집계한다.
-- ============================================================

-- 1) 기존 기록의 input_mode 보정
--
--    임포트된 33건(legacy_id 있음)은 Render 시절 기록이라
--    어느 모드였는지 알 수 없다. 'unknown'으로 표시한다.
--    운동 통계에서는 제외되지만 데이터 자체는 보존된다.
UPDATE game_results
SET extra_data = extra_data || '{"input_mode":"unknown"}'::jsonb
WHERE game_id = 'warmup-obstacle'
  AND NOT (extra_data ? 'input_mode');

-- 2) 운동 통계 뷰 — motion 모드만 집계
--
--    active_sec을 쓴다. duration_sec은 002 주석 참고(교정 전 기록이 섞여 있음).
--
--    ⚠️ CREATE OR REPLACE VIEW는 컬럼을 제거할 수 없다(42P16: cannot drop columns from view).
--       002의 exercise_summary에 있던 total_duration_sec을 빼므로 DROP 후 재생성한다.
DROP VIEW IF EXISTS exercise_summary;
DROP VIEW IF EXISTS play_summary_by_mode;

CREATE VIEW exercise_summary AS
SELECT
  game_id,
  player_name,
  COUNT(*)                                              AS sessions,
  SUM((extra_data->>'active_sec')::int)                 AS total_active_sec,
  SUM((extra_data->'exercise'->>'jumps')::int)          AS total_jumps,
  SUM((extra_data->'exercise'->>'squats')::int)         AS total_squats,
  SUM((extra_data->'exercise'->>'side_steps')::int)     AS total_side_steps,
  COUNT(*) FILTER (WHERE (extra_data->>'completed')::boolean) AS completed_count,
  MAX(played_at)                                        AS last_played_at
FROM game_results
WHERE extra_data ? 'exercise'
  AND extra_data->>'input_mode' = 'motion'   -- ★ 몸으로 한 기록만
GROUP BY game_id, player_name;

-- 3) 전체 현황 뷰 — 모드별로 나눠서 본다 (개발·검증용)
CREATE VIEW play_summary_by_mode AS
SELECT
  game_id,
  COALESCE(extra_data->>'input_mode', 'unknown')        AS input_mode,
  COUNT(*)                                              AS sessions,
  SUM((extra_data->>'active_sec')::int)                 AS total_active_sec,
  SUM((extra_data->'exercise'->>'jumps')::int)          AS total_jumps,
  SUM((extra_data->'exercise'->>'squats')::int)         AS total_squats,
  SUM((extra_data->'exercise'->>'side_steps')::int)     AS total_side_steps,
  MAX(played_at)                                        AS last_played_at
FROM game_results
WHERE extra_data ? 'exercise'
GROUP BY game_id, COALESCE(extra_data->>'input_mode', 'unknown');

-- ============================================================
-- 확인
--   SELECT * FROM play_summary_by_mode;   -- 모드별 현황
--   SELECT * FROM exercise_summary;       -- 실제 운동 데이터만
--
-- 지금 시점에는 exercise_summary가 비어 있는 것이 정상이다.
-- 모션 모드로 플레이한 기록이 아직 없기 때문.
-- ============================================================
