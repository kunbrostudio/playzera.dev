# BODY QUIZ 문제 확장용 에셋 목록

현재 활성 answer asset은 `animal_elephant.png`, `animal_tiger.png` 두 장뿐이다.
이 두 장으로 명확히 성립하는 신규 동물 문제 4개는 활성화했다. 깨진 이미지나 다른
게임 에셋 결합을 피하기 위해 아래 16문제는 전용 PNG가 준비된 뒤 `questions.js`에
등록한다. 각 행은 같은 두 이미지를 재사용하는 정·역방향 문제 2개이며, 파일은 투명
배경의 동일 카드 규격으로 제작한다.

현재 에셋으로 활성화한 신규 문제:

- 귀가 크고 몸집이 큰 동물 → 코끼리
- 어흥 하고 우는 동물 → 호랑이
- 코로 물을 뿌릴 수 있는 동물 → 코끼리
- 커다란 고양이처럼 생긴 동물 → 호랑이

| 범주 | 문제 1 | 문제 2 | 필요한 BODY QUIZ answer asset |
|---|---|---|---|
| 음식 | 건강한 과일은? → 사과 | 달콤한 간식은? → 사탕 | `food_apple.png`, `food_candy.png` |
| 음식 | 주황색 채소는? → 당근 | 차가운 디저트는? → 아이스크림 | `food_carrot.png`, `food_icecream.png` |
| 자연 | 낮에 밝게 빛나는 것은? → 해 | 밤하늘에 뜨는 것은? → 달 | `nature_sun.png`, `nature_moon.png` |
| 자연 | 비 올 때 보이는 것은? → 비구름 | 겨울에 내리는 것은? → 눈송이 | `nature_raincloud.png`, `nature_snowflake.png` |
| 생활 | 이를 닦을 때 쓰는 것은? → 칫솔 | 놀 때 쓰는 것은? → 장난감 | `habit_toothbrush.png`, `habit_toy.png` |
| 생활 | 손을 씻을 때 쓰는 것은? → 비누 | 책을 읽을 때 보는 것은? → 책 | `habit_soap.png`, `habit_book.png` |
| 탈것 | 여러 사람이 함께 타는 것은? → 버스 | 페달을 밟아 가는 것은? → 자전거 | `vehicle_bus.png`, `vehicle_bicycle.png` |
| 탈것 | 하늘을 나는 것은? → 비행기 | 물 위를 가는 것은? → 배 | `vehicle_airplane.png`, `vehicle_boat.png` |

이번 목표 20문제 중 활성화 4개, 에셋 대기 16개다. 필요한 신규 이미지는 총 16장이다.
이미지가 들어오기 전에는 활성 사전에 등록하지 않는다. 현재 전체 활성 문제는 6개라
세션도 6개를 사용하며, 에셋 추가 뒤에는 `BODY_QUIZ_SESSION_LIMIT`의 최대 10문제만
중복 없이 뽑는다.
