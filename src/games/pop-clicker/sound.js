// 클리커 소리 — **이 게임에서는 소리가 곧 보상이다.**
//
// 파일이 아직 없어서 WebAudio로 그 자리에서 만든다. 클리커 소리는 짧은 어택 하나라
// 합성으로도 꽤 그럴듯하고, **파일을 불러오는 지연이 없다는 게 더 크다** —
// 이 게임의 생명은 동작에서 소리까지 150ms 안이다.
//
// 클리커마다 음정이 다르다(`game.js`의 `note`). 연속 묶음이 짧은 멜로디가 되고,
// 반복 3회는 같은 음 세 번 + 마지막에 한 옥타브 위로 `팡`.
// 소개서의 *"효과음이 연결되어 짧은 멜로디처럼 들리고"*가 이것이다.
//
// 진짜 소리 파일이 오면 `play(note)`만 갈아 끼우면 된다.

let ctx = null
let master = null
let muted = false

/** 사용자 제스처 안에서 한 번 불러야 소리가 난다 (브라우저 자동재생 정책). */
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return }
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return
  ctx = new AC()
  master = ctx.createGain()
  master.gain.value = 0.35
  master.connect(ctx.destination)
}

export function setMuted(v) { muted = v }
export function isMuted() { return muted }

export function close() {
  try { ctx?.close() } catch { /* 이미 닫혔으면 그만 */ }
  ctx = null; master = null
}

const freq = semitone => 261.63 * Math.pow(2, semitone / 12)   // 도(C4) 기준

/**
 * 클리커 눌림 — 짧고 통통한 `뽁`.
 *
 * 사인파 하나 + 빠르게 떨어지는 게인. 어택을 0으로 두면 딸깍 소리가 나므로
 * 2ms만 준다. 그보다 길면 물렁해져서 클리커 느낌이 사라진다.
 */
export function pop(semitone = 0, { strong = false } = {}) {
  if (!ctx || muted) return
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const g = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq(semitone + (strong ? 12 : 0)), t)
  // 살짝 내려가며 끝나야 "눌렸다"로 들린다 (올라가면 튕긴 느낌)
  osc.frequency.exponentialRampToValueAtTime(freq(semitone - 5), t + 0.09)
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(strong ? 0.9 : 0.6, t + 0.002)
  g.gain.exponentialRampToValueAtTime(0.0001, t + (strong ? 0.25 : 0.12))
  osc.connect(g); g.connect(master)
  osc.start(t); osc.stop(t + 0.3)
}

/** 반복을 다 채웠을 때 — 한 옥타브 위 `팡`. */
export function pang(semitone = 0) { pop(semitone, { strong: true }) }

/** 「얼음!」 시작 — 낮고 짧게. */
export function freeze() { pop(-12) }

/** 한 판 끝 — 올라가는 세 음. */
export function fanfare() {
  if (!ctx || muted) return
  ;[0, 4, 7, 12].forEach((n, i) => setTimeout(() => pop(n, { strong: i === 3 }), i * 120))
}
