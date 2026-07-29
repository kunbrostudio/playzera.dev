// Stats — 운동 데이터 카운팅 + 플레이 제라 공통 스키마로 저장
//
// STEP 1-4: Express(/api/records) → Supabase 전환
//   기존 Render 배포는 data/records.json 파일에 저장했고, 재배포 시 유실됐다.
//   이제 game_results 테이블에 저장한다. 게임별 지표는 extra_data JSONB로.
import { CONFIG } from './config.js';
import { saveResult } from '../../core/gameResult.js';

// 허브 공통 game_id — 기존 'japari-run'에서 통일
const GAME_ID = 'warmup-obstacle';

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

  // Supabase 저장 (실패 시 localStorage 큐잉)
  async save() {
    const rec = this.toRecord();
    try {
      await Stats.push(rec);
      return { ok: true };
    } catch (e) {
      // 네트워크 단절·키 누락 등 — 기록을 버리지 않고 브라우저에 쌓아둔다
      const q = JSON.parse(localStorage.getItem('pz_pending_records') || '[]');
      q.push(rec);
      localStorage.setItem('pz_pending_records', JSON.stringify(q));
      console.warn('[stats] 저장 실패 → 큐잉:', e?.message ?? e);
      return { ok: false, queued: true };
    }
  }

  // toRecord() 결과 1건을 game_results 규격으로 변환해 저장
  //
  // 매핑
  //   score          ← score.stars
  //   rounds_cleared ← levelReached
  //   나머지 운동 지표는 extra_data JSONB
  static push(rec) {
    return saveResult({
      gameId:        GAME_ID,
      playerName:    rec.userId ?? null,
      score:         rec.score?.stars ?? 0,
      roundsCleared: rec.levelReached ?? 0,
      extraData: {
        source:            GAME_ID,
        duration_sec:      rec.durationSec ?? 0,
        active_sec:        rec.exercise?.activeSec ?? 0,
        completed:         !!rec.completed,
        obstacles_cleared: rec.score?.obstaclesCleared ?? 0,
        obstacles_missed:  rec.score?.obstaclesMissed ?? 0,
        exercise: {
          side_steps: rec.exercise?.sideSteps ?? 0,
          jumps:      rec.exercise?.jumps ?? 0,
          squats:     rec.exercise?.squats ?? 0,
          pose_holds: (rec.exercise?.poseHolds ?? []).map(p => ({
            pose:     p.pose,
            hold_sec: p.holdSec,
            success:  p.success,
          })),
        },
        ...(rec.startedAt ? { started_at: rec.startedAt } : {}),
      },
    });
  }

  // 이전에 실패해 큐잉된 기록 재전송
  // 성공한 것만 큐에서 빼고, 실패분은 남겨 다음 기회에 다시 시도한다
  static async flushPending() {
    const q = JSON.parse(localStorage.getItem('pz_pending_records') || '[]');
    if (!q.length) return { flushed: 0, remain: 0 };

    const remain = [];
    let flushed = 0;
    for (const rec of q) {
      try {
        await Stats.push(rec);
        flushed++;
      } catch {
        remain.push(rec);
      }
    }
    localStorage.setItem('pz_pending_records', JSON.stringify(remain));
    if (flushed) console.info(`[stats] 큐 ${flushed}건 전송 완료, ${remain.length}건 남음`);
    return { flushed, remain: remain.length };
  }
}
