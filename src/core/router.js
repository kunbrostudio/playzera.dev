// 라우터 경로 구조
//
//   /              → 허브 (게임 목록)
//   /intro?id=     → 게임팩 스플래시   (게임팩이 없으면 건너뛴다)
//   /tutorial?id=  → 게임팩 튜토리얼   (게임팩이 없으면 건너뛴다)
//   /play?id=      → 게임팩 플레이 화면
//   /start         → 첫 실행 (프로필·알 고르기)
//
// **라우터는 게임 이름을 모른다.** 화면 셋 다 `?id=`로 registry를 찾아 게임팩이
// 등록한 로더를 부를 뿐이다. 게임을 추가할 때 이 파일은 건드리지 않는다.
//
// 이전에는 `/game`이 똥 피하기 전용이었고, `/warmup`이 웜업 전용이었고,
// `/tutorial`은 라우터가 똥 피하기 튜토리얼을 직접 import했다. 게임이 늘 때마다
// 라우트와 import가 같이 늘었고, 홈 화면 하나 여는 데 모든 게임 코드가 번들에 딸려 왔다.
//
// 옛 경로(`/game`·`/warmup`)는 당분간 새 경로로 넘겨준다 —
// 기록에 남은 링크나 북마크가 깨지면 "왜 안 되지"부터 시작해야 한다.

import { homePage } from '../pages/home.js'
import { introPage } from '../pages/intro.js'
import { tutorialPage } from '../pages/tutorial.js'
import { playPage } from '../pages/play.js'
import { startPage } from '../pages/start.js'
import { buddyPage } from '../pages/buddy.js'
import { mePage } from '../pages/me.js'
import * as bgm from './bgm.js'

const routes = {
  '/': homePage,
  '/intro': introPage,
  '/tutorial': tutorialPage,
  '/play': playPage,
  '/start': startPage,   // 첫 실행 — 프로필·알 고르기
  '/buddy': buddyPage,   // 내 친구 (아이 화면)
  '/me': mePage,         // 마이페이지 (부모 화면 — 손 커서를 붙이지 않는다)
}

// 개발용 화면. 개발용 더미 게임과 같은 규칙으로 **DEV에서만** 열린다.
// /lab — 감지기가 웹캠으로 실제로 세는지 눈으로 보는 자리
// 들어갈 때 불러온다. 최상위 await를 쓰면 이 모듈이 통째로 비동기가 되어
// 아래 load 리스너 등록이 늦어진다 — 첫 화면이 안 그려질 수 있다.
if (import.meta.env?.DEV) {
  routes['/lab'] = (app, q) => import('../pages/lab.js').then(m => m.labPage(app, q))
}

// ── 소리가 나도 되는 경로 ────────────────────────────────────
//
// **BGM은 게임 안에서만 난다.** 허브·시작·내 친구·마이페이지는 조용해야 한다.
//
// 예전에는 허브 화면이 자기가 그려질 때 stop()을 불렀다. 그런데 소리를 켜는 건
// `main.js`(앱 시작)와 게임팩 둘이었고, 끄는 건 허브 하나였다. 켜는 쪽이 나중에
// 돌면 그대로 새어 나온다 — 실제로 허브에서 음악이 계속 났다.
//
// 그래서 **화면이 아니라 라우터가 판단한다.** 화면이 늘어도 규칙은 그대로다.
// 게임 경로끼리 옮길 때(인트로 → 튜토리얼 → 플레이)는 끄지 않는다.
// 거기서 끊으면 같은 곡이 화면마다 처음부터 다시 시작한다.
//
// 라우터가 게임 *이름*을 아는 게 아니라 **경로의 종류**를 아는 것이다.
const GAME_ROUTES = new Set(['/intro', '/tutorial', '/play'])

// 옛 경로 → 새 경로. 값이 함수면 query를 받아 목적지를 만든다.
const LEGACY = {
  '/game':   q => `/play?id=${q.id ?? 'poop-dodge'}`,
  '/warmup': () => '/play?id=warmup-obstacle',
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

  const legacy = LEGACY[path]
  if (legacy) { window.location.replace(`#${legacy(query)}`); return }

  const page = routes[path] ?? routes['/']
  const app = document.getElementById('app')

  if (_cleanup) {
    const fn = _cleanup
    _cleanup = null
    try { fn() } catch (e) { console.warn('[router] 페이지 정리 중 오류:', e) }
  }

  // 게임 밖으로 나왔으면 소리를 끈다. 화면을 그리기 **전에** 끈다 —
  // 그려진 뒤에 끄면 게임팩이 켠 소리와 순서가 엉킨다.
  if (!GAME_ROUTES.has(path)) bgm.stop()

  app.innerHTML = ''
  page(app, query)
}

export function navigate(path) {
  window.location.hash = path
}

window.addEventListener('hashchange', render)
window.addEventListener('load', render)
