// 이미지 로더.
//
// **무엇을 불러올지는 테마가 정한다.** 예전에는 이름 목록이 이 파일에 박혀 있었는데,
// 그러면 정글 테마의 나무를 `bg_rocket_pink`라고 불러야 한다. 파일 이름은 디자인
// 쪽에서 오는 것이지 코드가 정할 것이 아니다(`CLAUDE.md`의 규칙).
//
// 테마가 선언한 이름을 그대로 읽어 `IMG[이름]`에 담는다. 엔진이 이름으로 직접
// 찾아 쓰는 것(캐릭터·장애물·사인판)은 테마의 `sprites`가 어떤 이름인지 알려준다.
import { theme, img as imgUrl } from './theme.js';
import { playerSkin } from '../../core/playerSkin.js';

export const IMG = {};

// 지금 IMG에 담긴 그림이 **어느 테마의 것인지**.
//
// 이게 없어서 정글이 우주 하늘을 썼다. `main.js`가 `assetsReady` 불리언 하나로
// "이미 불렀나"를 기억했는데, 앱 수명 동안 하나라서 **두 번째 테마는 로딩을 통째로
// 건너뛰었다.** 두 테마가 `bg_sky` 같은 **같은 이름**을 쓰므로 앞 테마 그림이 그대로
// 남아 화면에 섞여 나왔다. 게임은 멀쩡히 돌아서 더 헷갈렸다.
//
// **스킨도 키에 넣는다.** 캐릭터가 프로필에 따라 갈리므로, 테마 id만 보면
// 남자아이로 한 판 하고 프로필을 바꿔도 앞의 그림이 그대로 남는다.
let loadedKey = null;
const keyOf = id => `${id}|${playerSkin()}`;

/** 지금 테마·프로필의 그림이 이미 올라와 있나. */
export const assetsReadyFor = id => loadedKey === keyOf(id);

/** 테마가 불러야 할 이미지 이름 전체 — 목록·스프라이트·UI·배경에서 모은다. */
export function imageNames(t = theme()) {
  const out = new Set(t.images ?? []);
  const add = v => {
    if (typeof v === 'string') out.add(v);
    else if (Array.isArray(v)) v.forEach(add);
    else if (v && typeof v === 'object') Object.values(v).forEach(add);
  };
  add(t.sprites);
  add(t.ui);
  // 배경 프롭·장식은 `{ name, h }` 꼴이라 name만 걷는다
  for (const p of [...(t.world?.props?.left ?? []), ...(t.world?.props?.right ?? []),
                   ...(t.world?.horizonFillers ?? []), ...(t.world?.skyDeco ?? [])]) add(p.name);
  add(t.world?.sky);
  add(t.world?.skyline);
  add(t.world?.curbStar);
  out.delete(undefined);
  return [...out];
}

export async function loadAssets(onProgress) {
  const t = theme();
  const names = imageNames(t);

  // **앞 테마의 그림을 반드시 비운다.** 남겨두면 이번 테마에 없는 이름이 그대로 살아
  // 있다가, 이름이 겹치는 자리에서 앞 테마 그림이 그려진다. 정글 하늘 자리에 우주
  // 밤하늘이 나온 것이 이것이다.
  for (const k of Object.keys(IMG)) delete IMG[k];
  loadedKey = null;

  let done = 0;
  const missing = [];
  await Promise.all(names.map(name => new Promise(resolve => {
    const el = new Image();
    el.onload = () => { IMG[name] = el; done++; onProgress?.(done / names.length); resolve(); };
    el.onerror = () => { missing.push(name); done++; onProgress?.(done / names.length); resolve(); };
    el.src = imgUrl(name);
  })));
  // 조용히 넘어가면 새 테마에서 그림 하나가 빠져도 **안 그려지고 끝난다.**
  // 화면에는 아무 일도 없어 보여서 원인을 찾는 데 한나절이 간다.
  if (missing.length) console.warn(`[runner] 테마 '${t.id}' 이미지 ${missing.length}장 없음:`, missing);
  loadedKey = keyOf(t.id);
  return { total: names.length, missing };
}
