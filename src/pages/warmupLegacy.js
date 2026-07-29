// STEP 1-3 임시 페이지 — 웜업(JAPARI RUN)이 playzera 저장소 안에서
// "예전과 똑같이" 뜨는지만 확인하기 위한 통로다. 게임팩 인터페이스는 아직 안 맞춘다.
// STEP 2에서 registry 기반 실행으로 대체되면 이 파일과 legacy-shell.js는 삭제한다.

import { STAGE_HTML, mountWarmupStyle, unmountWarmupStyle } from '../games/warmup-obstacle/legacy-shell.js'
import { play as hubBgmPlay, stop as hubBgmStop } from '../core/bgm.js'

let booted = false
let cleanupArmed = false

// 웜업은 자기 BGM(bgm_strawberry_lane)을 직접 틀기 때문에 허브 BGM(Kingdom)을 꺼야
// 두 곡이 겹쳐 나오지 않는다. 또 style.css가 html/body를 덮어쓰므로 나갈 때 걷어낸다.
function armRouteCleanup() {
  if (cleanupArmed) return
  cleanupArmed = true
  window.addEventListener('hashchange', () => {
    if (window.location.hash.startsWith('#/warmup-legacy')) {
      mountWarmupStyle()
      hubBgmStop()
    } else {
      unmountWarmupStyle()
      hubBgmPlay()
    }
  })
}

export async function warmupLegacyPage(app) {
  mountWarmupStyle()
  hubBgmStop()
  armRouteCleanup()
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
