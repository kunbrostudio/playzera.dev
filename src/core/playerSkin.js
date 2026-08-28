// 지금 달리는 아이가 누구로 보이나 — **아이가 고른 프로필을 따른다.**
//
// ── 왜 가입 성별이 아닌가 ────────────────────────────────────
//
// 가입은 부모가 하고 캐릭터는 아이가 논다. 남자아이가 분홍 캐릭터로 달리고 싶을 수
// 있고 그걸 막을 이유가 없다. 그리고 **가입을 안 해도 게임은 돌아간다** — 성별에
// 묶으면 비회원은 처음 보는 화면에서 자기가 아닌 캐릭터를 받는다.
//
// 이미 `/start`에서 물어보고 `progress/state.js`의 `profile`에 담고 있다.
// 계정이 생겨도 이 값이 우선이고, 가입 성별은 **기본값을 고를 때만** 쓰면 된다.
//
// ⚠️ 그림은 테마가 아니라 **이 값**으로 갈린다. 러너 테마 셋이 같은 캐릭터를 쓰므로
// `_shared/char/<skin>/`에 한 벌씩 두고 여기서 어느 벌인지 정한다.
import { getProgress } from '../progress/state.js'

export const SKINS = ['boy', 'girl']

/** 그림이 없는 아이는 없어야 한다 — 고른 게 없으면 기본값으로 떨어진다. */
export function playerSkin() {
  const p = getProgress()?.profile
  return SKINS.includes(p) ? p : 'boy'
}
