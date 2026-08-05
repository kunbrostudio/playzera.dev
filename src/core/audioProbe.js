// "이 오디오 파일이 진짜 있나?"를 판단한다.
//
// ⚠️ **상태 코드만 보면 안 된다.**
// 해시 라우팅이라 서버가 모르는 경로를 전부 `index.html`로 돌려준다
// (Vite dev도, netlify.toml의 `/* → /index.html 200`도 마찬가지다).
// 그래서 없는 mp3도 `200 OK`로 오고, `res.ok`만 믿으면 **HTML 문서를 오디오로
// 물게 된다.** 실제로 이것 때문에 배경음악과 효과음이 통째로 나오지 않았고,
// 효과음은 캐시가 채워지는 바람에 합성음 폴백까지 막혔다.
//
// Content-Type이 audio인지까지 봐야 한다.
export async function audioFileExists(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    if (!res.ok) return false
    return (res.headers.get('content-type') ?? '').toLowerCase().startsWith('audio')
  } catch {
    return false
  }
}
