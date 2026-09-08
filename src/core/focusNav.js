// 리모컨이 화면 안을 짚는다 — 포커스와 방향 이동. STEP 75.
//
// ── 왜 이게 필요한가 ★ ───────────────────────────────────────
//
// 리모컨의 명령은 `navigate` 하나뿐이었다. 허브에서 게임을 고르는 것까지는
// 됐지만 **게임 안에 들어가면 보낼 게 없었다** — 타이틀·카메라 준비·스토리·
// 결과는 라우트가 아니라 게임 함수 안의 내부 화면이라 `navigate()`를 안
// 부르기 때문이다. 그래서 "게임은 시작되는데 그 다음이 안 된다"였다.
//
// 화면마다 "이 화면에서 누를 수 있는 것" 목록을 새로 정의하는 길도 있었지만,
// 이 저장소에는 이미 그 목록이 있다 — **`data-pz-hit`**. 손 커서가 짚을 수
// 있는 것에 전부 붙어 있고(68곳), 규칙으로도 못박혀 있다("아이 화면은 전부
// 손 커서로 되어야 한다", CLAUDE.md).
//
//   부모가 폰으로 눌러야 하는 것  =  아이가 손으로 누를 수 있는 것
//
// 그래서 화면마다 따로 할 일이 없다. 앞으로 만들 게임도 그 규칙만 지키면
// 리모컨 지원이 공짜로 따라온다.
//
// ── 안 켜져 있을 땐 아무것도 안 한다 ★ ───────────────────────
//
// 이 저장소는 성능에 예민하다(`#/lab3d`가 존재하는 이유). 그래서 포커스는
// **리모컨이 붙어 있을 때만** 돈다 — `enable()`/`disable()`. 대부분의
// 사용자는 리모컨을 안 쓰고, 그때는 이 모듈이 관찰자도 rAF도 안 돌린다.
//
// ── 화면이 통째로 갈리는 걸 견뎌야 한다 ★ ────────────────────
//
// 이 저장소는 `app.innerHTML = ...`로 화면을 바꾼다. 포커스를 요소에
// **클래스로** 붙여 두면 그 순간 통째로 날아가고, 다시 붙일 방법도 없다.
// 그래서 두 가지로 푼다.
//
//   ① 표시는 **따로 떠 있는 링**이다. 요소에 클래스를 안 건다 — 화면이
//      갈려도 링은 살아 있고, 가리킬 대상만 다시 고르면 된다.
//   ② `MutationObserver`가 "뭔가 바뀌었다"는 깃발만 세우고, 실제 다시
//      고르기는 다음 프레임에 한 번만 한다. 관찰 콜백에서 계산하면
//      게임 중 스프라이트가 움직일 때마다 돌아 프레임을 깎는다.
//
// ── 손 커서와 같이 있어도 된다 ───────────────────────────────
//
// 둘 다 `data-pz-hit`을 보지만 서로 모른다. 확정도 같은 길이다 —
// 손 커서는 머무르기로, 리모컨은 선택 버튼으로, 결국 둘 다 `click()`을
// 부른다. 그래서 화면 코드는 어느 쪽이 눌렀는지 알 필요가 없다.

import { pickInDirection, pickPrimary } from './spatialNav.js'

const HIT = '[data-pz-hit]'
const RING_ID = 'pz-focus-ring'

const STYLE = `
#${RING_ID} {
  position: fixed; z-index: 2147483000; pointer-events: none;
  border: 5px solid var(--pz-gold, #ffd23e); border-radius: 16px;
  box-shadow: 0 0 0 3px rgba(0,0,0,.45), 0 0 22px 4px rgba(255,210,62,.55);
  transition: top .12s ease-out, left .12s ease-out, width .12s ease-out, height .12s ease-out;
  animation: pz-focus-breathe 1.6s ease-in-out infinite;
}
#${RING_ID}.off { display: none; }
@keyframes pz-focus-breathe {
  0%, 100% { box-shadow: 0 0 0 3px rgba(0,0,0,.45), 0 0 22px 4px rgba(255,210,62,.55); }
  50%      { box-shadow: 0 0 0 3px rgba(0,0,0,.45), 0 0 30px 8px rgba(255,210,62,.85); }
}
@media (prefers-reduced-motion: reduce) { #${RING_ID} { animation: none; } }
`

/** 링이 요소보다 이만큼 밖으로 나온다(px) — 딱 맞으면 테두리가 버튼에 묻힌다. */
const RING_PAD = 6

function ensureStyle() {
  if (document.getElementById(`${RING_ID}-css`)) return
  const s = document.createElement('style')
  s.id = `${RING_ID}-css`
  s.textContent = STYLE
  document.head.appendChild(s)
}

/**
 * 지금 짚을 수 있는 것들. **화면에 실제로 보이는 것만** 센다 —
 * `hidden`·`display:none`·크기 0인 것을 빼지 않으면 안 보이는 버튼에
 * 포커스가 가서 화면에서는 링이 사라진 것처럼 보인다.
 */
function collect() {
  const out = []
  for (const el of document.querySelectorAll(HIT)) {
    if (el.disabled || el.hasAttribute('hidden')) continue
    if (el.checkVisibility && !el.checkVisibility()) continue
    const rect = el.getBoundingClientRect()
    if (rect.width <= 0 || rect.height <= 0) continue
    out.push({ id: el, rect })
  }
  return out
}

class FocusNav {
  constructor() {
    this._on = false
    this._el = null          // 지금 포커스된 요소
    this._ring = null
    this._observer = null
    this._raf = null
    this._dirty = true
    this._listeners = new Set()
  }

  get enabled() { return this._on }
  /** 지금 포커스된 것의 이름 — 리모컨 화면의 "지금 선택" 줄이 쓴다. */
  get label() { return this._el ? labelOf(this._el) : null }

  /** 포커스가 바뀔 때마다 알린다(리모컨에 보내는 쪽이 구독한다). */
  onChange(fn) {
    this._listeners.add(fn)
    return () => this._listeners.delete(fn)
  }

  _emit() {
    const label = this.label
    for (const fn of this._listeners) fn({ label })
  }

  /** 리모컨이 붙었을 때 켠다. 꺼져 있으면 아무 비용도 안 든다. */
  enable() {
    if (this._on || typeof document === 'undefined') return
    this._on = true
    ensureStyle()

    this._ring = document.createElement('div')
    this._ring.id = RING_ID
    this._ring.className = 'off'
    document.body.appendChild(this._ring)

    // 화면이 바뀌면 깃발만 세운다 — 실제 계산은 프레임당 한 번(아래 `_tick`).
    this._observer = new MutationObserver(() => { this._dirty = true })
    this._observer.observe(document.body, { childList: true, subtree: true })

    this._dirty = true
    this._tick()
  }

  /** 리모컨이 끊기면 끈다 — 관찰자도 rAF도 멈춘다. */
  disable() {
    if (!this._on) return
    this._on = false
    this._observer?.disconnect()
    this._observer = null
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
    this._ring?.remove()
    this._ring = null
    this._el = null
    this._emit()
  }

  /**
   * 매 프레임 링을 요소에 맞춰 둔다.
   *
   * 매 프레임 `getBoundingClientRect()`를 한 번 부르는 값을 치른다 —
   * 대신 스크롤·애니메이션·레이아웃 변화를 따로 듣지 않아도 링이 절대
   * 어긋나지 않는다. 리모컨이 붙어 있을 때만 도는 비용이다.
   */
  _tick = () => {
    if (!this._on) return
    this._raf = requestAnimationFrame(this._tick)

    if (this._dirty || !this._el?.isConnected) {
      this._dirty = false
      this._reacquire()
    }
    this._place()
  }

  /**
   * 포커스를 다시 잡는다. 지금 것이 아직 화면에 살아 있으면 그대로 둔다 —
   * 게임 중에는 DOM이 쉴 새 없이 바뀌는데, 그때마다 포커스가 옮겨 다니면
   * 부모가 겨누던 버튼이 발밑에서 사라진다.
   */
  _reacquire() {
    const cands = collect()
    if (this._el?.isConnected && cands.some(c => c.id === this._el)) return

    const prev = this._el
    // 화면이 원하는 자리를 지정했으면 그것을 따른다.
    const marked = cands.find(c => c.id.hasAttribute('data-pz-focus-first'))
    this._el = marked ? marked.id : pickPrimary(cands)
    if (this._el !== prev) this._emit()
  }

  _place() {
    if (!this._ring) return
    if (!this._el?.isConnected) { this._ring.classList.add('off'); return }
    const r = this._el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) { this._ring.classList.add('off'); return }
    this._ring.classList.remove('off')
    this._ring.style.left = `${r.left - RING_PAD}px`
    this._ring.style.top = `${r.top - RING_PAD}px`
    this._ring.style.width = `${r.width + RING_PAD * 2}px`
    this._ring.style.height = `${r.height + RING_PAD * 2}px`
  }

  /**
   * 방향키. 그 방향에 아무것도 없으면 제자리에 있는다(안 감긴다).
   * @param {'left'|'right'|'up'|'down'} dir
   * @returns {boolean} 실제로 옮겨졌나
   */
  move(dir) {
    if (!this._on) return false
    const cands = collect()
    if (!this._el?.isConnected) { this._reacquire(); this._place(); return !!this._el }

    const next = pickInDirection(this._el.getBoundingClientRect(), cands, dir)
    if (!next || next === this._el) return false
    this._el = next
    this._place()
    this._emit()
    return true
  }

  /**
   * 선택. 손 커서의 머무르기와 **같은 길**로 끝난다(`click()`) — 그래서
   * 화면 코드는 어느 쪽이 눌렀는지 알 필요가 없다.
   * @returns {boolean} 실제로 눌렀나
   */
  activate() {
    if (!this._on || !this._el?.isConnected) return false
    this._el.click()
    return true
  }
}

/**
 * 버튼 이름. 아이콘만 있는 버튼(햄버거·나가기)은 글자가 없으므로
 * `aria-label`을 먼저 본다 — 이 저장소는 그런 버튼에 이미 전부
 * `aria-label`을 달아 두었다(`systemBar.js` 등).
 */
export function labelOf(el) {
  const aria = el.getAttribute?.('aria-label')
  if (aria) return aria.trim()
  const text = (el.textContent || '').replace(/\s+/g, ' ').trim()
  return text ? text.slice(0, 24) : '버튼'
}

export const focusNav = new FocusNav()
