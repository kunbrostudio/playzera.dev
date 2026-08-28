// BGM 루프 + SFX (+ 음소거 상태 관리 — 플레이 제라 다른 게임과 동일한 UX)
//
// 효과음 **이름**은 엔진이 정한다(판정에 쓰는 이름이라 테마마다 달라지면 코드가 갈린다).
// 실제 소리 파일은 테마 폴더에서 온다 — 이름은 같고 내용이 다르다.
// ── 소리 경로를 **밖에서 받는다** ★ ─────────────────────────
//
// 전에는 `theme()`을 직접 읽었다. 그러면 2.5D 테마 홀더에 꽂혀 있어야만
// 소리가 나서 **3D 러너에서는 쓸 수가 없었다** — 같은 게임인데 한쪽만 조용했다.
//
// `initAudio({ base, bgm })`으로 열어 뒀다. 안 넘기면 예전처럼 테마에서 읽으니
// 2.5D 쪽 호출부는 한 글자도 안 바뀐다.
import { theme, audioUrl } from './theme.js';
const SFX_NAMES = ['countdown_beep','go','dodge','hint_pop','button_press','level_complete','mission_complete'];

const sfx = {};
let bgm = null;
let unlocked = false;
let bgmMuted = false;
let sfxMuted = false;
let wantBgmPlaying = false; // 게임 흐름상 "지금 BGM이 재생 중이어야 하는지" (음소거와 별개)

/**
 * @param {object} [o]
 * @param {string} [o.base] 소리 폴더. 게임팩의 manifest에서 온다.
 *   안 넘기면 테마에서 읽는다 — 2.5D 러너의 기존 동작이다.
 *   **여기에 경로를 적지 않는다** — 테스트가 엔진 코드의 에셋 경로를 잡는다.
 * @param {string} [o.bgm]  배경음악 파일 이름
 */
export function initAudio({ base = null, bgm: bgmFile = null } = {}) {
  const url = f => (base ? `${base}/${f}` : audioUrl(f));
  for (const n of SFX_NAMES) {
    sfx[n] = new Audio(url(`sfx_${n}.wav`));
    sfx[n].preload = 'auto';
  }
  bgm = new Audio(url(bgmFile ?? theme().audio.bgm));
  bgm.loop = true;
  bgm.volume = 0.45;
  // ── 미리 받아 둔다 ★ ──
  // 효과음에는 `preload`가 붙어 있었는데 BGM에는 없었다. mp3는 몇 백 KB라
  // **첫 상호작용 때 그제야 받기 시작해서 음악이 몇 초 늦게 났다.**
  // 여기서 시작해 두면 아이가 타이틀을 보는 동안 받아 놓는다.
  bgm.preload = 'auto';
  bgm.load();
}

export function unlockAudio() { unlocked = true; }

export function playSfx(name, volume = 1) {
  if (!unlocked || sfxMuted || !sfx[name]) return;
  const a = sfx[name].cloneNode();
  a.volume = volume;
  a.play().catch(() => {});
}

export function startBgm() {
  wantBgmPlaying = true;
  if (unlocked && !bgmMuted && bgm) bgm.play().catch(() => {});
}
export function stopBgm() {
  wantBgmPlaying = false;
  if (bgm) { bgm.pause(); bgm.currentTime = 0; }
}

// ── 코드로 즉석 합성하는 짧은 효과음 (전용 오디오 파일이 없는 판정용) ──
let actx = null;
function getActx() {
  if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
  return actx;
}

// 장애물 못 피함/포즈 실패 — 짧은 "부웅" 하강음
export function playMissBuzz() {
  if (!unlocked || sfxMuted) return;
  try {
    const ctx = getActx();
    const t0 = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t0);
    osc.frequency.exponentialRampToValueAtTime(90, t0 + 0.22);
    gain.gain.setValueAtTime(0.22, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + 0.26);
  } catch { /* AudioContext 미지원 등은 조용히 무시 */ }
}

// 목숨 소진(게임 오버) — 귀여운 하강 아르페지오
export function playGameOverJingle() {
  if (!unlocked || sfxMuted) return;
  try {
    const ctx = getActx();
    const t0 = ctx.currentTime;
    const notes = [392.00, 329.63, 261.63, 196.00]; // G4-E4-C4-G3
    notes.forEach((f, i) => {
      const start = t0 + i * 0.16;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(f, start);
      gain.gain.setValueAtTime(0.001, start);
      gain.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.2);
    });
  } catch { /* 무시 */ }
}

export function isBgmMuted() { return bgmMuted; }
export function toggleBgmMute() {
  bgmMuted = !bgmMuted;
  if (bgm) {
    if (bgmMuted) bgm.pause();
    else if (wantBgmPlaying && unlocked) bgm.play().catch(() => {});
  }
  return bgmMuted;
}

export function isSfxMuted() { return sfxMuted; }
export function toggleSfxMute() { sfxMuted = !sfxMuted; return sfxMuted; }
