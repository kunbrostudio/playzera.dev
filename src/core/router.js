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
import { remotePage } from '../pages/remote.js'
import { controller } from './remote/controller.js'
import * as bgm from './bgm.js'

const routes = {
  '/': homePage,
  '/intro': introPage,
  '/tutorial': tutorialPage,
  '/play': playPage,
  '/start': startPage,   // 첫 실행 — 프로필·알 고르기
  '/buddy': buddyPage,   // 내 친구 (아이 화면)
  '/me': mePage,         // 마이페이지 (부모 화면 — 손 커서를 붙이지 않는다)
  '/remote': remotePage, // 부모 리모컨 (다른 디바이스에서 QR로 들어온다 — 손 커서 없음)
}

// 개발용 화면. 개발용 더미 게임과 같은 규칙으로 **DEV에서만** 열린다.
// /lab — 감지기가 웹캠으로 실제로 세는지 눈으로 보는 자리
// 들어갈 때 불러온다. 최상위 await를 쓰면 이 모듈이 통째로 비동기가 되어
// 아래 load 리스너 등록이 늦어진다 — 첫 화면이 안 그려질 수 있다.
// /lab3d — 3D 러너 성능 게이트. 포즈와 3D를 **동시에** 돌려 FPS를 잰다.
//          곡률 세기도 여기서 눈으로 고른다 (docs/10 §5의 0단계)
// /labhands — 주먹(Fist) 인식 성능·감각 측정. 포즈와 GestureRecognizer를
//             **동시에** 돌려 FPS가 얼마나 떨어지는지, 인식이 쓸 만한지 잰다.
// /lab-sea — 오디세이 런 바다+배 프로토타입. 물이 "달리는" 느낌이 나는지·
//            로프 레인 회피가 육지와 같은 느낌인지·성능이 버티는지를
//            정식 테마 통합(더 큰 리팩터) 전에 도형으로 먼저 본다.
// /lab-island — 오디세이 런 키클롭스 섬(육지) 프로토타입. 쥬라기 트랙
//               바닥(`ground.js`)을 대리석 팔레트로 다시 칠하고, 트랙
//               바깥을 `lab-sea`의 물로 채운 조합이 맞는지 먼저 본다.
// /lab-ithaca — 오디세이 런 이타카(마지막 스테이지) 프로토타입. 트랙은
//               `lab-island`와 같되 트랙 바깥을 물 대신 사막/흙 팔레트로
//               칠하고, 키클롭스 섬에 잘못 놓였던 8종(기사·개·염소·보물·
//               여신상 둘·목마)을 좌우 배경으로 옮겨 심는다.
if (import.meta.env?.DEV) {
  routes['/lab'] = (app, q) => import('../pages/lab.js').then(m => m.labPage(app, q))
  routes['/lab3d'] = (app, q) => import('../pages/lab3d.js').then(m => m.lab3dPage(app, q))
  routes['/labcam'] = (app, q) => import('../pages/labcam.js').then(m => m.labcamPage(app, q))
  routes['/labhands'] = (app, q) => import('../pages/labhands.js').then(m => m.labhandsPage(app, q))
  routes['/lab-sea'] = (app, q) => import('../pages/labsea.js').then(m => m.labseaPage(app, q))
  routes['/lab-island'] = (app, q) => import('../pages/labisland.js').then(m => m.labislandPage(app, q))
  routes['/lab-ithaca'] = (app, q) => import('../pages/labithaca.js').then(m => m.labithacaPage(app, q))
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

// ── 화면 전환 알림 ────────────────────────────────────────────
//
// `onLeave`와 다르다 — 한 번 쓰고 버리는 정리 훅이 아니라, **앱이 사는 동안
// 계속 듣는** 구독자용이다(여럿 등록 가능). 지금은 리모컨 세션
// (`core/remote/session.js`)이 "지금 주 디바이스가 뭘 하고 있나"를 부모
// 폰에 실시간으로 알리는 데 쓴다 — 리모컨은 페이지가 아니라 앱 전체의
// 상태를 알아야 하므로 특정 화면이 아니라 라우터가 알려주는 게 맞다.
const _routeListeners = new Set()
export function onRouteChange(fn) {
  _routeListeners.add(fn)
  return () => _routeListeners.delete(fn)
}

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

  for (const fn of _routeListeners) {
    try { fn({ path, query }) } catch (e) { console.warn('[router] onRouteChange 구독자 오류:', e) }
  }
}

// **리모컨(폰)이 조종 중일 때는 이 앱의 화면 전환 통로가 이 함수 하나다.**
// 허브의 히어로 버튼도, 게임의 Home 버튼도 결국 여기를 부른다 — 그래서
// `controller.active`일 때 로컬 이동 대신 주 디바이스로 명령만 보내면,
// 폰 화면 자체(허브 마크업)는 한 줄도 안 고치고 "플랫폼 그대로 조종"이
// 된다(`core/remote/controller.js` 상단 주석 참고, STEP 66). 폰 자신의
// 화면은 그대로 허브에 머문다 — 뒤에서 실제로 뭘 하는지는 실제 플레이가
// 일어나는 주 디바이스 화면으로 봐야 한다.
export function navigate(path) {
  if (controller.active) { controller.sendNavigate(path); return }
  window.location.hash = path
}

window.addEventListener('hashchange', render)
window.addEventListener('load', render)
