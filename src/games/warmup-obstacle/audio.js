// BGM 루프 + SFX (+ 음소거 상태 관리 — 플레이 제라 다른 게임과 동일한 UX)
const SFX_NAMES = ['countdown_beep','go','dodge','hint_pop','button_press','level_complete','mission_complete'];

const sfx = {};
let bgm = null;
let unlocked = false;
let bgmMuted = false;
let sfxMuted = false;
let wantBgmPlaying = false; // 게임 흐름상 "지금 BGM이 재생 중이어야 하는지" (음소거와 별개)

export function initAudio() {
  for (const n of SFX_NAMES) {
    sfx[n] = new Audio(`/assets/warmup/audio/sfx_${n}.wav`);
    sfx[n].preload = 'auto';
  }
  bgm = new Audio('/assets/warmup/audio/bgm_strawberry_lane.mp3');
  bgm.loop = true;
  bgm.volume = 0.45;
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
