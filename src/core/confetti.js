// 꽃가루 — **축하하는 순간의 공용 연출.** ★
//
// ── 왜 그림이 아니라 코드인가 ───────────────────────────────
//
// 스프라이트 시트를 만들면 게임·테마 수만큼 는다(`CLAUDE.md`: 연출을 그림
// 파일로 늘리지 않는다). 꽃가루는 색종이 조각이라 사각형 몇 개면 되고,
// 캔버스 하나에 다 그리므로 DOM도 안 늘어난다.
//
// ── 왜 양쪽에서 터지나 ──────────────────────────────────────
//
// 가운데에서 위로 뿌리면 분수처럼 보인다. 아이가 아는 그림은 **빵빠레**다 —
// 양옆 아래에서 비스듬히 쏘아 올려야 "터졌다"로 읽힌다.
//
// ── 화면을 안 막는다 ────────────────────────────────────────
//
// `pointer-events: none`이다. 엔딩은 아무 데나 눌러 넘어갈 수 있어야 하는데
// 꽃가루가 그 클릭을 먹으면 아이는 화면이 멈춘 줄 안다.

/** 아이 화면의 색이다 — 채도가 높고 서로 잘 구별된다. */
const COLORS = ['#ffd23e', '#ff8fa3', '#6ee75a', '#5ec8ff', '#c89bff', '#ffffff', '#ff9d3e']

const rand = (a, b) => a + Math.random() * (b - a)

/**
 * 꽃가루를 터뜨린다.
 *
 * @param {HTMLElement} host  이 요소를 덮는다 (`position`이 있어야 한다)
 * @param {object} [o]
 * @param {number} [o.pieces] 한 번에 터지는 조각 수
 * @param {number} [o.bursts] 몇 번 나눠 터뜨리나. 한 번에 다 뿌리면 한순간에
 *   지나가고, 나눠 터뜨리면 축포가 이어지는 느낌이 난다
 * @param {number} [o.seconds] 이 시간이 지나면 스스로 정리한다
 * @returns {() => void} 멈추는 함수. 화면을 떠날 때 **반드시** 부른다
 */
export function burstConfetti(host, { pieces = 90, bursts = 3, seconds = 5 } = {}) {
  const cv = document.createElement('canvas')
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;'
    + 'pointer-events:none;z-index:2'
  host.appendChild(cv)

  // jsdom·구형 기기에는 2D 컨텍스트가 없을 수 있다. **조용히 넘어간다** —
  // 꽃가루가 없다고 엔딩이 안 뜨면 그게 더 큰 문제다.
  const ctx = cv.getContext?.('2d')
  if (!ctx) { cv.remove(); return () => {} }

  const dpr = Math.min(2, globalThis.devicePixelRatio || 1)
  let W = 0
  let H = 0
  const fit = () => {
    W = host.clientWidth || 800
    H = host.clientHeight || 600
    cv.width = Math.round(W * dpr)
    cv.height = Math.round(H * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }
  fit()
  addEventListener('resize', fit)

  /** @type {{x:number,y:number,vx:number,vy:number,w:number,h:number,a:number,va:number,c:string,life:number}[]} */
  const bits = []

  /** 한 발. `side`가 -1이면 왼쪽 아래에서 오른쪽 위로 쏜다. */
  function shoot(side, n) {
    const x0 = side < 0 ? W * 0.06 : W * 0.94
    const y0 = H * 0.92
    for (let i = 0; i < n; i++) {
      // 속도를 넓게 흩뜨린다. 다 같으면 부채꼴 하나가 통째로 날아가 종이 뭉치로 보인다
      const speed = rand(H * 0.9, H * 1.7)
      const ang = rand(-1.30, -0.55) * (side < 0 ? 1 : -1) + (side < 0 ? 0 : Math.PI)
      bits.push({
        x: x0, y: y0,
        vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed,
        w: rand(6, 13), h: rand(9, 18),
        a: rand(0, Math.PI * 2), va: rand(-9, 9),
        c: COLORS[(Math.random() * COLORS.length) | 0],
        life: 0,
      })
    }
  }

  const timers = []
  for (let b = 0; b < bursts; b++) {
    const fire = () => { shoot(-1, Math.round(pieces / 2)); shoot(1, Math.round(pieces / 2)) }
    if (b === 0) fire()
    else timers.push(setTimeout(fire, b * 380))
  }

  const G = 1400          // 중력. 없으면 조각이 화면 밖으로 곧게 날아간다
  const DRAG = 0.86       // 공기 저항 — 위로 솟았다가 팔랑팔랑 떨어지게 만든다
  let raf = 0
  let last = performance.now()
  let elapsed = 0
  let stopped = false

  const frame = now => {
    if (stopped) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    elapsed += dt
    ctx.clearRect(0, 0, W, H)

    for (let i = bits.length - 1; i >= 0; i--) {
      const p = bits[i]
      p.life += dt
      p.vy += G * dt
      p.vx *= 1 - (1 - DRAG) * dt * 8
      p.vy *= 1 - (1 - DRAG) * dt * 3
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.a += p.va * dt
      if (p.y - p.h > H) { bits.splice(i, 1); continue }

      // 마지막 0.8초는 옅어진다. 툭 사라지면 눈에 띈다
      ctx.globalAlpha = Math.max(0, Math.min(1, (seconds - elapsed) / 0.8))
      ctx.save()
      ctx.translate(p.x, p.y)
      ctx.rotate(p.a)
      ctx.fillStyle = p.c
      // 회전하면서 납작해진다 — 종잇조각이 뒤집히는 것처럼 보인다
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 1.7)))
      ctx.restore()
    }
    ctx.globalAlpha = 1

    if (elapsed >= seconds || (bits.length === 0 && elapsed > 1)) { stop(); return }
    raf = requestAnimationFrame(frame)
  }
  raf = requestAnimationFrame(frame)

  function stop() {
    if (stopped) return
    stopped = true
    cancelAnimationFrame(raf)
    for (const t of timers) clearTimeout(t)
    removeEventListener('resize', fit)
    cv.remove()
  }
  return stop
}
