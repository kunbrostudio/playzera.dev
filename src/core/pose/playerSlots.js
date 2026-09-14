// 다인 플레이어 슬롯 — "Player 1 / Player 2" 자리를 세션 동안 유지한다 ★ (STEP 105)
//
// `personLock.js`는 여럿 중 "그 아이 한 명"만 고르는 모듈이다. 풍선 팡팡
// DUO(둘이 하기)는 **두 사람을 동시에** 게임 입력으로 써야 해서, 한 명만
// 내주는 그 길을 건드리지 않고 옆에 이 모듈을 따로 둔다 — SOLO와 다른
// 게임들은 여전히 personLock 한 길만 탄다.
//
// ── 배열 순서를 믿지 않는다 ★ ──────────────────────────────────
//
// MediaPipe가 내주는 `result.landmarks`의 순서는 프레임마다 바뀔 수 있다
// (A 프레임엔 [아이, 부모], B 프레임엔 [부모, 아이]). 인덱스를 그대로
// 자리 번호로 쓰면 Player 1·2가 수시로 뒤바뀐다. 그래서 자리마다 **마지막
// 몸 중심(골반 → 없으면 어깨, personLock의 `anchorOf`와 같은 기준)**을
// 들고 있다가, 이번 프레임 후보와 **거리가 가까운 순서로** 짝짓는다.
// 얼굴 인식 같은 개인정보 기반 식별은 쓰지 않는다 — 공간 연속성만 본다.
//
// ── 자리 상태 ──────────────────────────────────────────────────
//
//   empty   한 번도 사람이 앉지 않았다
//   active  최근(loseGraceMs 안)에 봤다. 이번 프레임에 안 보여도 유예 안이면
//           자리를 비우지 않는다 — 잠깐 가려진 걸로 본다(요청 13번)
//   lost    유예를 넘겨 못 봤다. 그 사람 포인터는 끄고, 새로 들어오는
//           사람이 이 자리에 앉을 수 있다(재합류, 요청 14번)
//
// ── 시간은 밖에서 받는다 ──────────────────────────────────────
//
// `performance.now()`를 안에서 읽지 않는다(프로젝트 공통 규칙) — 합성
// 프레임으로 테스트할 수 있어야 한다.

import { anchorOf } from './personLock.js'

/** 같은 사람으로 이어 볼 최대 거리(정규화) — personLock의 TRACK_MATCH_DIST와 같은 눈금. 실기기 미검증. */
export const SLOT_MATCH_DIST = 0.30
/** 이만큼 못 보면 자리를 lost로 돌린다(ms). 너무 짧으면 잠깐 가린 것도 놓치고, 길면 재합류가 늦다. 실기기 미검증. */
export const SLOT_LOSE_GRACE_MS = 1500
/** "지금 화면에 있다"로 볼 최근성(ms) — 추론이 화면보다 느려서 몇 프레임은 비어 있을 수 있다. */
export const SLOT_PRESENT_MS = 400
/**
 * 이보다 가까운 두 후보는 한 사람이 겹쳐 두 번 잡힌 것으로 본다 — 한 사람이
 * 두 자리를 다 차지하는 걸 막는다. 몸 중심(골반) 기준이라 서로 다른 두 사람은
 * 어깨를 맞대도 대개 이보다 멀다. 처음엔 0.08로 뒀는데 나란히 붙어 선
 * 부모·아이를 한 사람으로 합칠 만큼 넓어서 줄였다. 실기기 미검증.
 */
export const SLOT_MIN_SEPARATION = 0.05

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * @param {object} [opts]
 * @param {number} [opts.maxSlots] 자리 수 — DUO는 2
 * @returns {{ update: Function, statusAt: Function, reset: Function, slots: object[] }}
 */
export function createPlayerSlots({
  maxSlots = 2,
  matchDist = SLOT_MATCH_DIST,
  loseGraceMs = SLOT_LOSE_GRACE_MS,
  presentMs = SLOT_PRESENT_MS,
  minSeparation = SLOT_MIN_SEPARATION,
} = {}) {
  const slots = Array.from({ length: maxSlots }, (_, id) => ({
    id, state: 'empty', center: null, lms: null, lastSeen: null, joinedAt: null,
  }))

  const held = (s, now) => s.state === 'active' && s.lastSeen != null && now - s.lastSeen < loseGraceMs

  function seat(slot, person, now) {
    if (slot.state !== 'active') slot.joinedAt = now
    slot.state = 'active'
    slot.center = person.center
    slot.lms = person.lms
    slot.lastSeen = now
  }

  return {
    slots,

    /**
     * 한 추론 프레임 반영.
     * @param {Array<Array<object>>} candidates 이번 프레임에 잡힌 사람들(거울 좌표 랜드마크)
     * @param {number} now ms
     * @returns {object[]} 자리 배열(같은 객체를 계속 쓴다). 이번 프레임에 짝지어진 자리만 `lms`가 있다.
     */
    update(candidates, now) {
      // 1) 후보 → 사람(몸 중심). 중심을 못 재는 후보는 버리고, 한 사람이
      //    겹쳐 두 번 잡힌 것 같은 후보는 하나만 남긴다.
      const people = []
      for (const lms of candidates ?? []) {
        const center = anchorOf(lms)
        if (!center) continue
        if (people.some(p => dist(p.center, center) < minSeparation)) continue
        people.push({ lms, center })
      }

      for (const s of slots) {
        s.lms = null
        if (s.state === 'active' && !held(s, now)) s.state = 'lost'
      }

      // 2) 이미 앉아 있는(active) 자리 ↔ 사람 — 가까운 짝부터 확정한다.
      //    한 자리·한 사람은 한 번만 짝지어진다(탐욕적 최근접 매칭).
      const pairs = []
      for (const s of slots) {
        if (s.state !== 'active') continue
        people.forEach((p, pi) => {
          const d = dist(s.center, p.center)
          if (d <= matchDist) pairs.push({ s, pi, d })
        })
      }
      pairs.sort((a, b) => a.d - b.d)
      const usedSlots = new Set(), usedPeople = new Set()
      for (const { s, pi } of pairs) {
        if (usedSlots.has(s.id) || usedPeople.has(pi)) continue
        seat(s, people[pi], now)
        usedSlots.add(s.id); usedPeople.add(pi)
      }

      // 3) 남은 사람 → 빈 자리(lost·empty). 유예 중인 active 자리는 안
      //    뺏는다 — 잠깐 가려진 사람의 자리를 다른 사람이 차지하면 안 된다.
      //    lost 자리 중 마지막 위치가 가까운 곳부터(같은 사람이 돌아온 경우).
      people.forEach((p, pi) => {
        if (usedPeople.has(pi)) return
        const free = slots
          .filter(s => s.state !== 'active' && !usedSlots.has(s.id))
          .sort((a, b) => (a.center ? dist(a.center, p.center) : Infinity) - (b.center ? dist(b.center, p.center) : Infinity) || a.id - b.id)
        if (!free.length) return
        seat(free[0], p, now)
        usedSlots.add(free[0].id); usedPeople.add(pi)
      })

      return slots
    },

    /**
     * 지금 시각 기준 요약 — 추론 프레임 사이에도(카메라가 멈춰도) 유예를 넘겼는지 다시 계산한다.
     * @param {number} now ms
     */
    statusAt(now) {
      const view = slots.map(s => {
        const state = s.state === 'active' && !held(s, now) ? 'lost' : s.state
        return { id: s.id, state, present: state === 'active' && now - s.lastSeen < presentMs }
      })
      return {
        slots: view,
        activeCount: view.filter(s => s.state === 'active').length,
        presentCount: view.filter(s => s.present).length,
      }
    },

    /** 세션 경계(게임 진입 직전) — 메뉴를 조작한 사람과 무관하게 처음부터 다시 앉힌다. */
    reset() {
      for (const s of slots) Object.assign(s, { state: 'empty', center: null, lms: null, lastSeen: null, joinedAt: null })
    },
  }
}

/**
 * "조건이 일정 시간 계속 참이었나" — 플레이어 확보 안정화에 쓴다.
 * 조건이 한 번이라도 거짓이 되면 처음부터 다시 잰다.
 * @param {number} holdMs
 */
export function createStableTimer(holdMs) {
  let since = null
  return {
    /** @returns {boolean} holdMs 이상 계속 참이었으면 true */
    update(ok, now) {
      if (!ok) { since = null; return false }
      if (since == null) since = now
      return now - since >= holdMs
    },
    progress(now) { return since == null ? 0 : Math.min(1, (now - since) / holdMs) },
    reset() { since = null },
  }
}
