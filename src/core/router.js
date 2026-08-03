// 라우터 경로 구조
//
// 현재 (STEP 3 — 멀티디바이스 제거 후):
//   /            → home.js    (게임 목록 허브)
//   /intro?id=   → intro.js   (게임별 스플래시)
//   /game?id=    → game.js    (똥 피하기 — 이름 입력 → 플레이)
//   /warmup      → warmup.js  (웜업 게임팩)
//
// `/control`·`/camera`는 여러 대를 연결하던 시절의 경로다. STEP 3에서 삭제했다.
//
// STEP 5(게임팩화) 이후:
//   /play?id=... 하나로 합쳐지고 /intro·/warmup은 사라진다.

import { homePage } from '../pages/home.js'
import { introPage } from '../pages/intro.js'
import { gamePage } from '../pages/game.js'
import { warmupPage } from '../pages/warmup.js'

const routes = {
  '/': homePage,
  '/intro': introPage,
  '/game': gamePage,
  '/warmup': warmupPage,
}

// ── 페이지 정리 훅 ────────────────────────────────────────────
//
// 페이지가 웹캠·rAF·전역 리스너처럼 #app 밖으로 새는 자원을 잡았다면
// 진입 시 onLeave(fn)로 정리 함수를 등록한다. 다음 렌더 직전에 한 번 호출된다.
//
// hashchange 리스너를 페이지가 각자 다는 방식은 등록 순서(라우터가 먼저 렌더해버림)에
// 의존해서, 이미 지워진 DOM을 상대로 정리가 돌았다. 라우터가 직접 부르면 순서가 확실하다.
let _cleanup = null
export function onLeave(fn) { _cleanup = fn }

function parseHash() {
  const hash = window.location.hash.replace('#', '') || '/'
  const [path, qs] = hash.split('?')
  const query = Object.fromEntries(new URLSearchParams(qs))
  return { path: path || '/', query }
}

function render() {
  const { path, query } = parseHash()
  const page = routes[path] ?? routes['/']
  const app = document.getElementById('app')

  if (_cleanup) {
    const fn = _cleanup
    _cleanup = null
    try { fn() } catch (e) { console.warn('[router] 페이지 정리 중 오류:', e) }
  }

  app.innerHTML = ''
  page(app, query)
}

export function navigate(path) {
  window.location.hash = path
}

// 현재 해시와 같은 경로로 재진입해야 할 때 강제 재렌더링
export function reload() {
  render()
}

window.addEventListener('hashchange', render)
window.addEventListener('load', render)
