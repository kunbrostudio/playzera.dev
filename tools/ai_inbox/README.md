# AI 원본을 두는 곳

Tripo·Meshy에서 받은 GLB를 **슬롯 이름 그대로** 여기 넣는다.
`tools/blender/import_ai.py`의 `SPEC`에 있는 이름이어야 하고, 다르면 **건너뛴다** —
실수가 아니라 안전장치다. 엉뚱한 모델이 장애물 자리에 들어가면 아이가 화면을
보고 판단한 것과 판정이 어긋난다.

## 이 폴더는 깃에 안 올라간다

파일 하나가 56~64MB다. 깃허브는 50MB를 넘으면 경고하고 100MB를 넘으면 막는데,
무엇보다 **한 번 올리면 이력에서 빼기 어렵고** 그때부터 클론하는 사람마다 다 받는다.

재현이 걱정될 수 있지만 이 파이프라인은 어차피 **블렌더가 있어야** 돈다.
원본만 있다고 다른 컴퓨터에서 돌아가지 않는다.
**정본은 원본이 아니라 만드는 방법이고, 그건 `tools/blender/*.py`에 남아 있다.**

결과물(`public/assets/runner3d/**/*.glb`)은 Draco로 압축돼 200~700KB이고 커밋한다.

## 쓰는 법

```
1. tools/ai_source/*.png 를 Tripo/Meshy에 올린다
2. 받은 GLB를 여기에 SPEC의 이름으로 넣는다   (예: finish_portal.glb)
3. 블렌더에서
     import import_ai; import_ai.run(only={"finish_portal"})
   → public/assets/runner3d/ 에 들어간다
```

## 지금 들어 있어야 할 이름

`import_ai.py`의 `SPEC` 키가 정본이다. 여기 옮겨 적으면 반드시 어긋난다.
