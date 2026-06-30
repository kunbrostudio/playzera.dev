// 라우터 경로 구조 안내
//
// 현재 (v1 — 똥피하기 단독):
//   /            → home.js  (임시 스플래시 → 향후 게임 목록 허브로 교체)
//   /game        → game.js  (게임 플로우: 모드선택 → 세션 → 역할 → 플레이)
//   /control     → control.js
//   /camera      → camera.js
//
// 향후 허브 추가 시 확장 예시:
//   /            → hub.js           (게임 목록 허브)
//   /game        → game.js          (그대로 유지, ?id= 파라미터로 게임 구분)
//   /game/intro  → game/intro.js    (게임별 인트로 — 현재 home.js 내용 이동)

import { homePage } from '../pages/home.js'
import { gamePage } from '../pages/game.js'
import { controlPage } from '../pages/control.js'
import { cameraPage } from '../pages/camera.js'

const routes = {
  '/': homePage,
  '/game': gamePage,
  '/control': controlPage,
  '/camera': cameraPage,
}

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
