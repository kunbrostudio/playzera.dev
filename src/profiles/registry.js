// 프로필 — 아이가 고르는 아바타.
//
// 버디(`src/buddies/registry.js`)와 같은 방식이다. **늘어날 것을 데이터로 둔다.**
// 프로필을 추가하려면 아래 배열에 한 줄 + 그림 한 장.
//
// ⚠️ "캐릭터"가 이 프로젝트에서 세 가지를 뜻해 이름을 나눠 뒀다.
//   프로필(profile)  여기 — 남자아이 / 여자아이 아바타
//   버디(buddy)      알에서 키우는 친구
//   게임 스프라이트   똥 피하기의 노란 곰. **게임팩 소유**

export const PROFILE_DIR = '/assets/profiles'

// image는 **파일 이름 그대로** 적는다.
// id에서 경로를 계산하면 파일명을 id에 맞춰 바꿔야 하는데, 그림은 디자인 쪽에서
// 나오는 것이라 이름을 우리가 정할 수 없다. 이름은 데이터로 받는 편이 덜 깨진다.
export const PROFILES = [
  { id: 'girl', label: '여자아이', image: 'profile_girl.png', emoji: '👧' },
  { id: 'boy',  label: '남자아이', image: 'profile_boy.png',  emoji: '👦' },
]

export const getProfile = id => PROFILES.find(p => p.id === id) ?? null

export const profileImage = id => {
  const p = getProfile(id)
  return p ? `${PROFILE_DIR}/${p.image}` : null
}

// 그림이 없을 때 대신 보여줄 것. 화면이 비면 안 된다.
export const profileEmoji = id => getProfile(id)?.emoji ?? '🙂'
