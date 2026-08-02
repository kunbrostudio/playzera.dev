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
    // Stats는 gameFlow 루프 맨 위에서 생성된다 = 타이틀 화면 도착 시점.
    // 그래서 이것을 운동 시간의 기준으로 쓰면 타이틀·카메라 준비·튜토리얼에서
    // 머문 시간이 전부 운동량으로 잡힌다(실측: 58초 기록 중 실제 활동 6초).
    // → sessionStartedAt은 참고용으로만 남기고, 운동 지표는 playStartedAt 기준으로 낸다.
    this.sessionStartedAt = new Date();
    this.playStartedAt = null;   // markPlayStart()가 첫 레벨 시작 때 한 번 설정
    this._saved = false;         // Supabase 저장 완료 여부 (중복 insert 차단)
    // 이 판을 식별하는 키. 이탈 큐에 넣은 기록을 나중에 갱신·제거할 때 쓴다.
    this.runId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    // 'motion' | 'keyboard' — 운동 데이터로 신뢰할 수 있는지를 가르는 값.
    // 키보드 모드는 몸을 움직이지 않아도 점프·앉기 카운트가 올라가므로
    // 운동량 통계에서 반드시 제외해야 한다(개발·테스트 기록이 섞임).
    this.inputMode = null;
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

  // 실제 플레이가 시작된 시점을 기록 (첫 레벨에서 한 번만)
  // main.js에서 playing = true 가 되는 지점에 호출한다.
  markPlayStart() {
    if (!this.playStartedAt) this.playStartedAt = new Date();
  }

  // 카메라 준비 화면에서 모드가 확정되면 호출
  setInputMode(mode) { this.inputMode = mode; }

  // 운동 기록으로 남길 만한 움직임이 있었는지
  get hasMovement() {
    return !!(this.jumps || this.squats || this.sideSteps || Object.keys(this.poseHolds).length);
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
    // 플레이가 실제로 시작된 시점이 기준. 없으면(플레이 전 이탈) 세션 시작으로 대체.
    const base = this.playStartedAt ?? this.sessionStartedAt;
    return {
      runId: this.runId,
      inputMode: this.inputMode ?? 'unknown',
      gameId: CONFIG.gameId,
      userId: CONFIG.userId,
      startedAt: base.toISOString(),
      durationSec: Math.round((Date.now() - base.getTime()) / 1000),
      sessionStartedAt: this.sessionStartedAt.toISOString(),
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
  //
  // 멱등하다 — 같은 Stats 인스턴스로 두 번 호출해도 insert는 한 번만 일어난다.
  // 저장에 성공하면 이탈 큐에 남아 있던 같은 판(runId)의 임시 기록을 제거해서
  // flushPending()이 나중에 중복 insert하지 않게 한다.
  async save() {
    if (this._saved) {
      console.info('[stats] save() 건너뜀 — 이미 저장된 판');
      return { ok: true, skipped: true };
    }
    if (!this.hasMovement) {
      console.info(
        `[stats] save() 건너뜀 — 움직임 없음 (점프 ${this.jumps} / 앉기 ${this.squats} / 피하기 ${this.sideSteps} / 포즈 ${Object.keys(this.poseHolds).length})`
      );
      return { ok: true, skipped: true };
    }

    const rec = this.toRecord();
    console.info(
      `[stats] 저장 시도 — [${rec.inputMode}] 점프 ${this.jumps} / 앉기 ${this.squats} / 피하기 ${this.sideSteps} / 활동 ${rec.exercise.activeSec}초`
      + (rec.inputMode !== 'motion' ? '  ※ 운동 통계에서 제외됨' : '')
    );
    try {
      await Stats.push(rec);
      this._saved = true;
      Stats.dequeue(this.runId);   // 이탈 큐에 있던 부분 기록 제거
      console.info(`[stats] ✔ Supabase 저장 완료 (run_id ${this.runId})`);
      return { ok: true };
    } catch (e) {
      // 네트워크 단절·키 누락 등 — 기록을 버리지 않고 브라우저에 쌓아둔다
      Stats.enqueue(rec);
      console.warn('[stats] 저장 실패 → 큐잉:', e?.message ?? e);
      return { ok: false, queued: true };
    }
  }

  // 이탈 시 기록 보존 (탭 닫기 · 새로고침 · 라우팅 이탈 · 백그라운드 전환)
  //
  // pagehide 시점에는 비동기 네트워크 요청이 브라우저에 의해 취소되므로
  // Supabase를 부르지 않고 localStorage에 동기로 써둔다.
  // 다음 접속 때 flushPending()이 전송한다.
  //
  // ⚠️ _saved를 켜지 않는다.
  //   visibilitychange는 탭을 잠깐 전환할 때도 발동한다. 여기서 저장 완료로
  //   표시해버리면 사용자가 돌아와 완주해도 그 기록이 저장되지 않는다.
  //   대신 runId로 큐를 덮어써서, 나중에 save()가 성공하면 큐에서 제거되게 한다.
  queueOnExit() {
    if (this._saved) return { skipped: true };
    if (!this.hasMovement) return { skipped: true };

    try {
      Stats.enqueue(this.toRecord());   // 같은 runId가 있으면 교체
      console.info(`[stats] 이탈 감지 → 큐에 보존 (run_id ${this.runId})`);
      return { queued: true };
    } catch (e) {
      console.warn('[stats] 큐 저장 실패:', e?.message ?? e);
      return { failed: true };
    }
  }

  // ── localStorage 큐 (동기) ──
  static _readQueue() {
    try { return JSON.parse(localStorage.getItem('pz_pending_records') || '[]'); }
    catch { return []; }
  }
  static _writeQueue(q) {
    localStorage.setItem('pz_pending_records', JSON.stringify(q));
  }

  // 같은 runId가 이미 있으면 최신 내용으로 교체한다.
  // 백그라운드 전환이 여러 번 일어나도 한 판이 여러 건으로 늘어나지 않는다.
  static enqueue(rec) {
    const q = Stats._readQueue();
    const i = rec.runId ? q.findIndex(r => r.runId === rec.runId) : -1;
    if (i >= 0) q[i] = rec; else q.push(rec);
    Stats._writeQueue(q);
  }

  static dequeue(runId) {
    if (!runId) return;
    const q = Stats._readQueue();
    const rest = q.filter(r => r.runId !== runId);
    if (rest.length !== q.length) Stats._writeQueue(rest);
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
        // 'motion'만 운동 데이터로 신뢰할 수 있다. exercise_summary 뷰가 이 값으로 거른다.
        input_mode:        rec.inputMode ?? 'unknown',
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
        ...(rec.sessionStartedAt ? { session_started_at: rec.sessionStartedAt } : {}),
        ...(rec.runId ? { run_id: rec.runId } : {}),
      },
    });
  }

  // 이전에 실패해 큐잉된 기록 재전송
  // 성공한 것만 큐에서 빼고, 실패분은 남겨 다음 기회에 다시 시도한다
  static async flushPending() {
    const q = Stats._readQueue();
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
    Stats._writeQueue(remain);
    if (flushed) console.info(`[stats] 큐 ${flushed}건 전송 완료, ${remain.length}건 남음`);
    return { flushed, remain: remain.length };
  }
}
