// STEP 1-3 임시 페이지 — 웜업(JAPARI RUN)이 playzera 저장소 안에서
// "예전과 똑같이" 뜨는지만 확인하기 위한 통로다. 게임팩 인터페이스는 아직 안 맞춘다.
// STEP 2에서 registry 기반 실행으로 대체되면 이 파일과 legacy-shell.js는 삭제한다.

import { STAGE_HTML, mountWarmupStyle, unmountWarmupStyle } from '../games/warmup-obstacle/legacy-shell.js'

let booted = false
let cleanupArmed = false

// style.css가 html/body를 덮어쓰므로 다른 라우트로 나가면 걷어낸다.
function armStyleCleanup() {
  if (cleanupArmed) return
  cleanupArmed = true
  window.addEventListener('hashchange', () => {
    if (!window.location.hash.startsWith('#/warmup-legacy')) unmountWarmupStyle()
    else mountWarmupStyle()
  })
}

export async function warmupLegacyPage(app) {
  mountWarmupStyle()
  armStyleCleanup()
  app.innerHTML = STAGE_HTML

  if (booted) {
    // main.js는 최상단 IIFE로 부팅되고 모듈 캐시가 남아 재실행되지 않는다.
    // (STEP 5의 init()/destroy() 규격화 전까지는 재진입 시 새로고침이 필요하다.)
    console.warn('[warmup-legacy] 재진입 감지 — 새로고침 후 다시 들어와야 합니다.')
    return
  }
  booted = true

  await import('../games/warmup-obstacle/main.js')
}
