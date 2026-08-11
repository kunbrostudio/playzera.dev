// 포즈 판정 진단 오버레이 — `?debug=pose`로 켠다.
//
// "포즈가 인식이 안 돼요"는 그 자체로는 고칠 수 없는 정보다. 원인이 최소 넷이다.
//   1. 랜드마크가 안 들어온다 (카메라·모델 문제)
//   2. 몸이 프레임 밖이다 (무릎·발목이 안 보이면 그 관절 점수가 0)
//   3. 자세는 맞는데 기준이 빡빡하다 (임계값 0.75)
//   4. 판정이 아예 호출되지 않는다 (배선 문제)
//
// 이 오버레이는 **관절별 점수를 그대로 보여준다.** 어느 관절이 깎아먹는지 보이면
// 넷 중 무엇인지 한눈에 갈린다. 추측 대신 숫자로 이야기하려고 만들었다.

import { LM } from '../../../core/pose/gesture.js'
import { POSE_TARGETS, jointAngles, jointScores } from './poseMatcher.js'

// 해시에 `?`가 두 번 들어갈 수 있다 — `#/play?id=warmup-obstacle?debug=pose`.
// URLSearchParams로 잘라 쓰면 두 번째 것을 놓친다. 통째로 훑는다.
export function isPoseDebugOn() {
  return /[?&]debug=pose\b/.test(location.hash + location.search)
}

export function createPoseDebug() {
  const el = document.createElement('div')
  el.id = 'pz-pose-debug'
  el.innerHTML = `<style>
    #pz-pose-debug {
      position: fixed; left: 8px; bottom: 8px; z-index: 9998;
      background: rgba(8,4,18,0.88); color: #fff; border-radius: 12px;
      padding: 10px 12px; font: 12px/1.5 ui-monospace, monospace;
      min-width: 230px; pointer-events: none; white-space: pre;
    }
    #pz-pose-debug .ok   { color: #6ee75a; }
    #pz-pose-debug .bad  { color: #ff8a8a; }
    #pz-pose-debug .warn { color: #ffd23e; }
    #pz-pose-debug b { color: #ffd23e; }
  </style><div id="pz-pose-debug-body">포즈 진단 대기…</div>`
  document.body.appendChild(el)
  const body = el.querySelector('#pz-pose-debug-body')

  // 무릎·발목이 프레임 안에 있는지 — armsopen처럼 다리 관절에 가중치가 큰 포즈는
  // 다리가 안 보이면 **구조적으로** 임계값을 넘을 수 없다.
  const legsVisible = lms => {
    if (!lms) return false
    for (const i of [LM.L_KNEE, LM.R_KNEE, LM.L_ANKLE, LM.R_ANKLE]) {
      const p = lms[i]
      if (!p) return false
      if (typeof p.visibility === 'number' && p.visibility < 0.5) return false
      if (p.y < 0 || p.y > 1) return false
    }
    return true
  }

  return {
    update(lms, activePose, threshold) {
      if (!lms) { body.textContent = '랜드마크 없음 — 카메라/모델 확인'; return }
      const lines = []
      lines.push(`다리 보임: ${legsVisible(lms) ? '예' : '아니오 ← 다리 포즈는 이것부터'}`)
      lines.push(`활성 포즈: ${activePose ?? '(없음)'}`)
      lines.push('')
      for (const type of Object.keys(POSE_TARGETS)) {
        const { total, joints } = jointScores(lms, type)
        const mark = total >= threshold ? '✔' : ' '
        lines.push(`${mark} ${type.padEnd(12)} ${total.toFixed(2)}`)
        if (type === activePose) {
          for (const [joint, s, ang, target] of joints) {
            lines.push(`    ${joint.padEnd(10)} ${s.toFixed(2)}  ${Math.round(ang)}° (목표 ${target}°)`)
          }
        }
      }
      lines.push('')
      lines.push(`기준 ${threshold}`)
      body.textContent = lines.join('\n')
    },
    destroy() { el.remove() },
  }
}
