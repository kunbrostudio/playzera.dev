-- ============================================================
-- 001_extend_game_results.sql
-- game_results 테이블 확장: 게임별 유연한 지표 저장 구조
-- 실행 환경: Supabase 대시보드 SQL Editor
-- ============================================================

-- 1) extra_data JSONB 컬럼 추가 (게임별 고유 지표 저장)
ALTER TABLE game_results
  ADD COLUMN IF NOT EXISTS extra_data JSONB NOT NULL DEFAULT '{}';

-- 2) center_code 컬럼 추가 (향후 센터별 그룹화)
ALTER TABLE game_results
  ADD COLUMN IF NOT EXISTS center_code TEXT;

-- 3) user_id 컬럼 추가 (향후 로그인 계정 연동)
ALTER TABLE game_results
  ADD COLUMN IF NOT EXISTS user_id UUID;

-- 4) 기존 컬럼 데이터를 extra_data JSONB로 마이그레이션
UPDATE game_results
SET extra_data = jsonb_build_object(
  'dodge_count',      dodge_count,
  'hit_count',        hit_count,
  'reaction_avg_ms',  reaction_avg_ms
);

-- 5) 기존 개별 컬럼 제거
ALTER TABLE game_results DROP COLUMN IF EXISTS dodge_count;
ALTER TABLE game_results DROP COLUMN IF EXISTS hit_count;
ALTER TABLE game_results DROP COLUMN IF EXISTS reaction_avg_ms;

-- 6) extra_data GIN 인덱스 (JSONB 키/값 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_game_results_extra_data
  ON game_results USING GIN (extra_data);

-- 추가 인덱스: game_id 단독 조회용
CREATE INDEX IF NOT EXISTS idx_game_results_game_id
  ON game_results (game_id, played_at DESC);

-- 추가 인덱스: center_code 그룹화용
CREATE INDEX IF NOT EXISTS idx_game_results_center_code
  ON game_results (center_code, played_at DESC);
