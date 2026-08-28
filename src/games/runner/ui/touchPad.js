// 화면 버튼 — 키보드가 없는 기기에서 키보드를 대신한다. **러너들이 같이 쓴다.** ★
//
// ── 왜 필요한가 ─────────────────────────────────────────────
//
// 이 게임은 **몸으로 하는 것이 본체**다. 화면 버튼은 카메라를 못 쓸 때의 폴백이고,
// 폴백이 없으면 태블릿에서 게임이 통째로 안 돌아간다(키보드가 없다).
//
// ── 무엇이 여기 있나 ────────────────────────────────────────
//
// 마크업 · 모양 · **누르고 있는 동안 유지되는 배선**까지. 배선을 게임마다
// 새로 짜면 `pointerleave`를 빠뜨려서 손가락이 버튼 밖으로 나갔을 때
// **앉은 채로 굳는** 버그가 생긴다 — 실제로 그런 종류의 실수는 조용하다.
//
// 어떤 동작을 시킬지는 게임이 정한다. 이 모듈은 `left`·`right`·`jump`·
// `duckStart`/`duckEnd`·`poseDown`/`poseUp`을 부를 뿐 게임을 모른다.

const STYLE_ID = 'pz-runner-touchpad-css'

/**
 * 자세 버튼 — 키 이름과 설명. `poseMatcher.js`의 자세 이름을 그대로 쓴다.
 *
 * `label`은 **버튼 안에 들어갈 짧은 말**이고 `full`은 튜토리얼처럼 자리가
 * 넉넉한 곳에서 쓴다. 두 곳에서 따로 적으면 같은 동작을 화면마다 다르게
 * 부르게 된다 — 아이가 "숙이기"와 "상체 숙이기"를 다른 것으로 배운다.
 */
export const POSE_BUTTONS = [
  { pose: 'lunge', key: 'A', label: '런지', full: '런지' },
  { pose: 'forwardbend', key: 'S', label: '숙이기', full: '상체 숙이기' },
  { pose: 'armsopen', key: 'D', label: '벌리기', full: '팔 벌리기' },
]

export const TOUCHPAD_CSS = `
#touch-controls { position: absolute; inset: 0; z-index: 26; pointer-events: none; }
#touch-controls > * { pointer-events: auto; }

.tc-pad { position: absolute; left: 3%; bottom: 4%; display: flex; flex-direction: column; align-items: center; gap: 10px; }
.tc-pad-row { display: flex; gap: 10px; }
.tc-pose-group { position: absolute; right: 3%; bottom: 4%; display: flex; gap: 10px; }

.tc-btn {
  width: clamp(52px, 7vw, 82px); height: clamp(52px, 7vw, 82px);
  border-radius: 20px; border: 3px solid rgba(255,255,255,.4);
  background: rgba(20, 8, 46, .58); color: #fff;
  font-family: inherit;
  font-size: clamp(20px, 2.8vw, 32px); font-weight: 900;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; -webkit-tap-highlight-color: transparent; user-select: none;
  touch-action: none; transition: background .1s, transform .08s;
}
.tc-btn:active { background: rgba(255,210,62,.6); transform: scale(.92); }

.tc-pose { flex-direction: column; gap: 2px; }
.tc-pose b { font-size: clamp(20px, 2.6vw, 30px); }
.tc-pose span { font-size: clamp(10px, 1.2vw, 14px); font-weight: 700; opacity: .85; }
`

export function ensureTouchPadStyle(doc = document) {
  if (doc.getElementById(STYLE_ID)) return
  const s = doc.createElement('style')
  s.id = STYLE_ID
  s.textContent = TOUCHPAD_CSS
  doc.head.appendChild(s)
}

/**
 * 버튼 마크업. **id를 바꾸지 않는다** — 2D의 `main.js`가 이 이름들로 붙어 있다.
 * @param {boolean} hidden 처음에 숨겨 둘지 (2D는 타이틀 화면에서 감춘다)
 */
export function touchPadMarkup({ hidden = false } = {}) {
  const poses = POSE_BUTTONS.map(p =>
    `<button id="tc-pose-${p.key.toLowerCase()}" class="tc-btn tc-pose" aria-label="${p.label}">`
    + `<b>${p.key}</b><span>${p.label}</span></button>`).join('\n      ')
  return `
  <div id="touch-controls" class="${hidden ? 'hidden' : ''}">
    <div class="tc-pad">
      <button id="tc-jump" class="tc-btn tc-jump" aria-label="점프">▲</button>
      <div class="tc-pad-row">
        <button id="tc-left" class="tc-btn" aria-label="왼쪽">◀</button>
        <button id="tc-duck" class="tc-btn" aria-label="앉기">▼</button>
        <button id="tc-right" class="tc-btn" aria-label="오른쪽">▶</button>
      </div>
    </div>
    <div class="tc-pose-group">
      ${poses}
    </div>
  </div>`
}

/**
 * 버튼 하나를 잇는다.
 *
 * ── `pointerleave`·`pointercancel`까지 잡는다 ★ ──────────────
 * `pointerup`만 들으면, 누른 채로 손가락이 버튼 밖으로 나갔을 때 뗀 것을
 * 못 받는다. 숙이기·자세처럼 **누르고 있는 동안 유지되는** 입력에서는
 * 그대로 굳어 버린다 — 화면은 멀쩡해 보이고 아이만 이상해진다.
 */
function bind(root, id, onDown, onUp, signal) {
  const el = root.querySelector(`#${id}`)
  if (!el) return
  const start = ev => { ev.preventDefault(); onDown?.() }
  const end = ev => { ev.preventDefault(); onUp?.() }
  el.addEventListener('pointerdown', start, { signal })
  el.addEventListener('pointerup', end, { signal })
  el.addEventListener('pointerleave', end, { signal })
  el.addEventListener('pointercancel', end, { signal })
}

/**
 * 버튼 전부를 게임의 동작에 잇는다.
 *
 * @param {ParentNode} root 버튼을 찾을 범위
 * @param {object} act
 * @param {Function} act.left · act.right · act.jump
 * @param {Function} act.duckStart · act.duckEnd
 * @param {(pose: string) => void} act.poseDown · act.poseUp
 * @param {AbortSignal} [signal] 화면을 떠날 때 한 번에 떼기 위한 것
 */
export function bindTouchPad(root, act, signal) {
  bind(root, 'tc-left', act.left, null, signal)
  bind(root, 'tc-right', act.right, null, signal)
  bind(root, 'tc-jump', act.jump, null, signal)
  bind(root, 'tc-duck', act.duckStart, act.duckEnd, signal)
  for (const p of POSE_BUTTONS) {
    bind(root, `tc-pose-${p.key.toLowerCase()}`,
      () => act.poseDown?.(p.pose), () => act.poseUp?.(p.pose), signal)
  }
}
