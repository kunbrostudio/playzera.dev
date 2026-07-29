// Stats — 운동 데이터 카운팅 + 플레이 제라 공통 스키마로 서버 전송
import { CONFIG } from './config.js';

export class Stats {
  constructor() {
    this.startedAt = new Date();
    this.stars = 0;
    this.cleared = 0;
    this.missed = 0;
    this.sideSteps = 0;   // 실제 레인 이동 동작 수
    this.jumps = 0;       // 실제 점프 동작 수
    this.squats = 0;      // 실제 숙이기 동작 수
    this.poseHolds = {};  // pose -> { holdSec, success }
    this.levelReached = 1;
    this.completed = false;
    this._activeStart = null;
    this.activeSec = 0;
  }

  // 실제 몸 동작 카운트 (장애물 성공 여부와 별개 — "운동량"의 기준)
  countSideStep() { this.sideSteps++; }
  countJump() { this.jumps++; }
  countSquat() { this.squats++; }

  // 장애물 판정 결과
  record(kind, ok) { ok ? this.cleared++ : this.missed++; }
  addStar(n) { this.stars += n; }

  recordPoseHold(pose, holdSec, success) {
    if (!this.poseHolds[pose]) this.poseHolds[pose] = { holdSec: 0, success: 0 };
    this.poseHolds[pose].holdSec += holdSec;
    if (success) this.poseHolds[pose].success++;
  }

  startActive() { if (!this._activeStart) this._activeStart = performance.now(); }
  stopActive() {
    if (this._activeStart) {
      this.activeSec += (performance.now() - this._activeStart) / 1000;
      this._activeStart = null;
    }
  }

  toRecord() {
    this.stopActive();
    return {
      gameId: CONFIG.gameId,
      userId: CONFIG.userId,
      startedAt: this.startedAt.toISOString(),
      durationSec: Math.round((Date.now() - this.startedAt.getTime()) / 1000),
      levelReached: this.levelReached,
      completed: this.completed,
      score: { stars: this.stars, obstaclesCleared: this.cleared, obstaclesMissed: this.missed },
      exercise: {
        sideSteps: this.sideSteps,
        jumps: this.jumps,
        squats: this.squats,
        poseHolds: Object.entries(this.poseHolds).map(([pose, v]) => ({
          pose, holdSec: Math.round(v.holdSec * 10) / 10, success: v.success,
        })),
        activeSec: Math.round(this.activeSec),
      },
    };
  }

  // 서버 저장 (실패 시 localStorage 큐잉)
  async save() {
    const rec = this.toRecord();
    try {
      const res = await fetch(CONFIG.api.records, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec),
      });
      if (!res.ok) throw new Error('server error');
      return { ok: true };
    } catch {
      const q = JSON.parse(localStorage.getItem('pz_pending_records') || '[]');
      q.push(rec);
      localStorage.setItem('pz_pending_records', JSON.stringify(q));
      return { ok: false, queued: true };
    }
  }

  // 이전에 실패한 기록 재전송
  static async flushPending() {
    const q = JSON.parse(localStorage.getItem('pz_pending_records') || '[]');
    if (!q.length) return;
    const remain = [];
    for (const rec of q) {
      try {
        const res = await fetch(CONFIG.api.records, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rec),
        });
        if (!res.ok) remain.push(rec);
      } catch { remain.push(rec); }
    }
    localStorage.setItem('pz_pending_records', JSON.stringify(remain));
  }
}
