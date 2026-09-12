import { createClient } from '@supabase/supabase-js'

// ── dev/로컬에서 Supabase가 설정 안 됐을 때 ★ ────────────────────
//
// `.env`가 없거나 `.env.example`의 placeholder(`your_supabase_url` ·
// `example.supabase.co`) 그대로면, 예전에는 두 가지 중 하나였다:
//   · URL이 falsy → `createClient`가 "supabaseUrl is required"로 즉시 던짐
//   · placeholder URL → 매 저장·flush마다 `example.supabase.co`로 fetch가
//     나가 `ERR_NAME_NOT_RESOLVED`가 콘솔에 반복됐다(ken 지적, 9/10)
//
// 이제 **설정 여부를 미리 판별**해서, 미설정이면 네트워크를 아예 안 친다
// (`gameResult.js`가 `isSupabaseConfigured`를 보고 조용히 건너뛴다).
// 운영 배포는 진짜 값이 들어가므로 동작이 전혀 안 바뀐다.

const URL = import.meta.env.VITE_SUPABASE_URL
const ANON = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  URL && ANON &&
  /^https:\/\//.test(URL) &&
  !URL.includes('example.supabase.co') &&
  URL !== 'your_supabase_url' &&
  ANON !== 'your_anon_key',
)

// `createClient`는 URL이 falsy면 던진다 — 미설정이어도 클라이언트 객체는
// 만들어(코드가 `supabase.from(...)`을 참조만 해도 안 터지게), 실제 요청은
// `isSupabaseConfigured`로 막는다.
const supabase = createClient(
  URL || 'http://localhost:54321',
  ANON || 'anon-placeholder',
)

if (!isSupabaseConfigured) {
  console.info('[supabase] 설정 안 됨 — 서버 저장을 건너뜁니다(로컬 진행에는 영향 없음).')
}

export default supabase
