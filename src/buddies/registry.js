// 버디 레지스트리 — 키우는 친구들의 목록.
//
// `games/registry.js`와 같은 방식이다. **버디를 추가할 때 손대는 파일이 여기 하나다.**
// 화면은 이 목록을 그대로 그리므로 버디가 3종이든 30종이든 코드가 같다.
//
//   버디 추가 = manifest 하나 + 그림 폴더 하나 + 아래 배열에 import 한 줄
//
// ⚠️ "캐릭터"는 이 프로젝트에서 세 가지를 뜻한다. 섞이지 않게 이름을 나눴다.
//   프로필(profile)  남자아이 / 여자아이 아바타
//   버디(buddy)      여기 있는 것 — 알에서 키우는 친구
//   게임 스프라이트   똥 피하기의 노란 곰 등. **게임팩 소유**다

import plant from './plant/manifest.json'
import dino  from './dino/manifest.json'
import bunny from './bunny/manifest.json'

export const BUDDIES = [plant, dino, bunny]

export const BUDDY_ASSET_DIR = '/assets/buddies'

export const getBuddy = id => BUDDIES.find(b => b.id === id) ?? null

// 그림 경로는 **계산한다.** manifest에 전체 경로를 적어두면 폴더를 옮길 때
// 파일마다 고쳐야 한다. 규칙은 하나다 — /assets/buddies/{버디}/{그림}
export const buddyImage = (buddyId, image) => `${BUDDY_ASSET_DIR}/${buddyId}/${image}`

/**
 * 이 레벨에서 **열려 있는** 단계들. 배열 순서 = 성장 순서.
 *
 * 형태는 **옷이지 운명이 아니다**(docs/05 §2). 레벨이 문턱을 넘으면 새 단계가
 * 열리기만 하고, 무엇을 입을지는 아이가 고른다. 알 모습 그대로 레벨 40이 될 수 있다.
 */
export function unlockedStages(buddyId, level) {
  const b = getBuddy(buddyId)
  if (!b) return []
  return b.stages.filter(s => level >= s.unlockLevel)
}

// 이 레벨에서 **새로 열린** 단계. 없으면 null.
// 레벨이 오른 직후에 "새 모습이 열렸어요!"를 띄울지 판단하는 데 쓴다.
export function stageUnlockedAt(buddyId, level) {
  const b = getBuddy(buddyId)
  return b?.stages.find(s => s.unlockLevel === level) ?? null
}

/**
 * 실제로 화면에 그릴 단계.
 *
 * 아이가 고른 것(chosenStageId)을 존중하되, 아직 안 열렸거나 값이 이상하면
 * 열린 것 중 마지막으로 떨어진다. **잘못된 값 때문에 빈 화면이 되면 안 된다.**
 */
export function currentStage(buddyId, level, chosenStageId = null) {
  const open = unlockedStages(buddyId, level)
  if (!open.length) return null
  return open.find(s => s.id === chosenStageId) ?? open[open.length - 1]
}
