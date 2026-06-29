-- 게임 결과 테이블
CREATE TABLE game_results (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT NOT NULL,
  game_id TEXT NOT NULL,
  player_name TEXT NOT NULL,
  score INTEGER DEFAULT 0,
  rounds_cleared INTEGER DEFAULT 0,
  dodge_count INTEGER DEFAULT 0,
  hit_count INTEGER DEFAULT 0,
  reaction_avg_ms INTEGER,
  played_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_game_results_session ON game_results(session_id, played_at);
ALTER TABLE game_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon insert" ON game_results FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "anon select" ON game_results FOR SELECT TO anon USING (true);
