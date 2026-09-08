// arcade2d 스프라이트 필드 — 등장·이동·손 충돌을 한데 묶는 순수 로직.
//
// 풍선 팡팡·비눗방울 팡팡 둘 다 "화면 위 오브젝트 + 손 좌표 충돌"이지만
// 손과 오브젝트가 만나는 방식이 다르다:
//
//   - **터뜨리기(Pop)** — 손이 닿으면 그 즉시 사라진다. 비눗방울은 항상 이
//     방식이고, 풍선도 2부(Balloon Pop)는 이 방식이다. → `popAt`/`popAtHands`.
//   - **잡기(Catch)** — 손이 닿으면 스프라이트가 손을 "따라다니고"(attach),
//     바구니 영역에 들어와야 비로소 사라진다. 풍선 1부(Balloon Catch)만
//     이 방식이다. → `attach`/`collectInBasket`/`release`.
//
// 두 방식이 스프라이트 하나를 놓고 섞이지 않게, `attachedTo`가 있는
// 스프라이트는 `tick()`에서 이동 패턴을 안 타고 손 좌표를 그대로 따라간다.
//
// ── 손은 키가 있는 객체다 ────────────────────────────────────
//
// `{ left, right }` 형태로 받는다(배열이 아니다) — 두 기획서 다 "왼손
// 활동 횟수·오른손 활동 횟수"를 운동 지표로 원해서, 어느 손이 했는지를
// 필드 레벨에서부터 들고 다녀야 게임(`game.js`)이 나중에 다시 알아낼
// 필요가 없다.
//
// ── 여기는 카메라도 화면도 모른다 ────────────────────────────
//
// 좌표는 movement.js와 같은 정규화 좌표(0~1)다. 실제 손 위치를 이
// 좌표계로 바꾸는 일(거울 좌표, 카메라 접근)은 `arcade2d/handTracker.js`
// 몫이고, 여기서는 순수 숫자만 다룬다 — 유닛 테스트가 카메라 없이 돈다.

import { makeSprite, stepSprite, PATTERN } from './movement.js'

const RISING_PATTERNS = new Set([PATTERN.FLOAT, PATTERN.SWAY, PATTERN.CURVE])

export class SpriteField {
  constructor({ rng = Math.random } = {}) {
    this.active = []
    this.rng = rng
    this._nextId = 1
  }

  get count() { return this.active.length }

  /**
   * 스프라이트 하나를 스폰한다. `x`/`y`를 안 주면 패턴에 맞는 시작
   * 위치를 고른다 — 상승 패턴(비눗방울류)은 화면 아래 바깥에서
   * 시작해 위로 떠오르고, 그 외(풍선류)는 화면 안 아무 데서나 시작한다.
   */
  spawn(spec) {
    const r = spec.r ?? 0.05
    const x = spec.x ?? (r + this.rng() * (1 - 2 * r))
    const y = spec.y ?? (RISING_PATTERNS.has(spec.pattern) ? 1 + r : r + this.rng() * (1 - 2 * r))
    const s = makeSprite({ id: this._nextId++, ...spec, x, y })
    this.active.push(s)
    return s
  }

  /**
   * dt초 진행. `hands`는 `{ left: {x,y}|null, right: {x,y}|null }` —
   * flee 패턴(풍선 CHASE POP)이 회피 방향을 계산하는 데 쓴다.
   * @returns {{ removed: object[] }} 이번 틱에 화면 밖으로 사라진(gone) 스프라이트
   */
  tick(dt, hands = {}) {
    const handList = Object.values(hands).filter(Boolean)
    for (const s of this.active) {
      if (s.attachedTo && hands[s.attachedTo]) {
        s.x = hands[s.attachedTo].x
        s.y = hands[s.attachedTo].y
        continue
      }
      stepSprite(s, dt, { hands: handList })
    }
    const removed = this.active.filter(s => s.gone)
    if (removed.length) this.active = this.active.filter(s => !s.gone)
    return { removed }
  }

  // ── 터뜨리기(Pop) ────────────────────────────────────────────

  /**
   * 손 좌표 하나에 가장 가까운, 아직 안 터진 스프라이트를 터뜨린다.
   * @returns {object|null} 터진 스프라이트 (좌표는 터진 순간 그대로 — 팝 이펙트 자리로 쓴다)
   */
  popAt(point, handRadius = 0.03) {
    let best = null, bestDist = Infinity
    for (const s of this.active) {
      if (s.popped || s.attachedTo) continue
      const dist = Math.hypot(s.x - point.x, s.y - point.y)
      if (dist <= s.r + handRadius && dist < bestDist) { best = s; bestDist = dist }
    }
    if (!best) return null
    best.popped = true
    this.active = this.active.filter(s => s !== best)
    return best
  }

  /** 여러 손을 한 프레임에 검사한다. `hands`는 `{left, right}`. */
  popAtHands(hands, handRadius) {
    const out = []
    for (const [handKey, point] of Object.entries(hands)) {
      if (!point) continue
      const s = this.popAt(point, handRadius)
      if (s) out.push({ handKey, sprite: s })
    }
    return out
  }

  // ── 잡기(Catch) ──────────────────────────────────────────────

  /**
   * 손 하나를 스프라이트에 접촉시켜 "붙잡는다" — 이미 다른 손이 잡고
   * 있거나 터진 것은 대상에서 뺀다. 한 손은 한 번에 하나만 붙잡는다
   * (이미 뭔가 붙잡고 있으면 그대로 유지, 새로 잡지 않는다).
   */
  attach(handKey, point, handRadius = 0.03) {
    if (this.active.some(s => s.attachedTo === handKey)) return null
    let best = null, bestDist = Infinity
    for (const s of this.active) {
      if (s.popped || s.attachedTo) continue
      const dist = Math.hypot(s.x - point.x, s.y - point.y)
      if (dist <= s.r + handRadius && dist < bestDist) { best = s; bestDist = dist }
    }
    if (!best) return null
    best.attachedTo = handKey
    return best
  }

  /**
   * `handKey`가 붙잡고 있는 스프라이트가 바구니 영역(정규화 사각형)
   * 안에 있으면 수거하고 필드에서 뺀다.
   */
  collectInBasket(handKey, basketRect) {
    const s = this.active.find(sp => sp.attachedTo === handKey)
    if (!s) return null
    const inside = s.x >= basketRect.x0 && s.x <= basketRect.x1
      && s.y >= basketRect.y0 && s.y <= basketRect.y1
    if (!inside) return null
    this.active = this.active.filter(sp => sp !== s)
    return s
  }

  /** 손이 놓쳤다(주먹을 펴거나 화면을 벗어남 등) — 다시 자유롭게 움직이게 풀어준다. */
  release(handKey) {
    const s = this.active.find(sp => sp.attachedTo === handKey)
    if (s) s.attachedTo = null
  }
}
