# AI가 만든 GLB를 **게임 규격으로 바꿔** 넣는다.
#
# ── 왜 그대로 못 쓰나 ★ ─────────────────────────────────────
#
# Tripo·Meshy가 주는 GLB는 "보기 좋은 모델"이지 **이 게임의 물건**이 아니다.
# 손대지 않고 넣으면 네 가지가 어긋난다.
#
#   ① 크기      1~2 유닛짜리로 온다. 우리 야자수는 6, 관문은 15다
#   ② 원점      대개 덩어리 한가운데다. 우리 규칙은 **발밑**이라 땅에 반쯤 묻힌다
#   ③ 방향      제멋대로다. 정면이 카메라를 봐야 한다
#   ④ 폴리      너무 많으면 줄인다. 다만 **거의 안 줄인다** — 아래 참고
#
# 그래서 받은 파일은 `tools/ai_inbox/`에 두고 이 스크립트가 옮긴다.
# **원본은 안 건드린다** — 다시 돌릴 수 있어야 값을 고쳐 가며 맞출 수 있다.
#
# ── 크기는 여전히 코드가 정한다 ─────────────────────────────
#
# 아래 `SPEC`의 숫자는 `obstacles3d.js`의 `KINDS`와 `make_*.py`에서 왔다.
# AI가 뭘 주든 **여기서 다시 맞춘다** — 장애물 치수는 판정의 일부이기 때문이다.
#
# ── 쓰는 법 ─────────────────────────────────────────────────
#
#   1. `tools/ai_source/*.png`를 Tripo/Meshy에 올린다
#   2. GLB를 받아 `tools/ai_inbox/`에 **같은 이름**으로 넣는다 (palm.glb …)
#   3. 이 스크립트를 돌린다 → `public/assets/runner3d/`에 들어간다

import sys
sys.path.insert(0, "/Users/ken.choi/Documents/playzera.dev/tools/blender")

import bpy
import bmesh
import math
import os
import importlib
import pzblender as pz
importlib.reload(pz)

ROOT = "/Users/ken.choi/Documents/playzera.dev"
INBOX = os.path.join(ROOT, "tools/ai_inbox")

# ── 규격 ────────────────────────────────────────────────────
#
# height : 세계 단위 높이 (또는 width가 있으면 폭에 맞춘다)
# tris   : 삼각형 **상한**. 목표가 아니다 — 아래 참고
# dir    : 나갈 폴더
# split  : 공룡처럼 부위를 나눠 내보낼지 — `models.js`의 `loadParts`가 읽는다
#
# ── 깎지 않는다 ★★ ─────────────────────────────────────────
#
# 처음엔 500~1500을 **목표**로 잡고 받은 것의 10~14%만 남겼다. 화면이
# **찢어지고 뭉개졌다.** 관문은 리본처럼 너덜거렸고 팻말은 조각나 흩어졌다.
#
# 데시메이트는 모서리를 접으면서 **UV를 같이 뭉갠다.** 90%를 깎으면 텍스처가
# 이음매를 넘어 늘어나고, 그게 "깨져 보인다"의 정체다.
#
# 그 예산은 **손으로 만든 정점색 저폴리** 기준이었다. AI는 이미 최적화된
# 저폴리를 준다(4천~1만). 그리고 실측해 보니 삼각형 91,250에 60fps였다 —
# **삼각형은 병목이 아니다.** 병목은 draw call과 텍스처 메모리다.
#
# 그래서 상한을 크게 올렸다. 웬만하면 **받은 그대로** 나간다.
SPEC = {
    # 좌우 배경
    # 크기는 8/20에 키웠다 — 아이 키가 4.6인데 공룡이 2.6이라 발밑에 붙은
    # 장난감처럼 보였다. 좌우 배경은 **아이보다 크거나 비슷해야** 세계로 읽힌다.
    "palm":           dict(height=8.5, tris=12000, dir="props"),
    "fossil_rock":    dict(height=5.0, tris=12000, dir="props"),
    # 발자국 바위 — 그림이 늦게 와서 오래 회색 도형이었다
    "rock_footprint": dict(height=4.4, tris=30000, dir="props"),
    # ── 고해상도 원본 ★ ────────────────────────────────────
    # Tripo "고품질"로 뽑은 것들은 **190만** 삼각형짜리 스컬프트다.
    #
    # 오래 헤맸다. 1만도 2만5천도 9만도 얼룩덜룩 부서져 보여서 "이 메시가
    # 견디는 한계"라고 결론지었는데, **틀렸다.** 원인은 삼각형 수가 아니라
    # 메시가 갈라져 있는 것이었다(`_decimate`의 붙이기). 붙이고 나니
    # **1만2천에서도 매끈하다.**
    #
    # 3만으로 둔다 — 9만5천과 화면에서 구별이 안 되고 파일은 3분의 1이다.
    "egg_nest":       dict(height=2.4, tris=30000, dir="props"),
    # 수풀 — **숲을 채우는 것은 이쪽 일이다.** 공룡을 늘려 채웠더니 어지러웠다.
    # 낮게 깔려서 시야를 안 막고, 발밑을 덮어 물건이 떠 보이지 않게 한다.
    "flower_bush":    dict(height=2.8, tris=30000, dir="props"),
    # ── 공룡은 **자르지 않는다** ★★ ────────────────────────
    # 몸통·머리·꼬리로 잘라 따로 흔들었더니, 잘린 자리가 **뚫린 채로** 남아
    # 머리가 몸에서 떨어져 나간 것처럼 보였다. 아이가 무서워할 그림이었다.
    # 흔들면 흔들수록 틈이 벌어지니 각도를 줄여도 답이 없다.
    #
    # 통째로 두고 **몸 전체를 흔든다**(`DinoRow`). 관절은 없지만 이음매도 없다.
    # 살아 보이는 데는 고개를 젓는 것보다 **이음매가 없는 게** 먼저다.
    #
    # 크기는 "대형 공룡"으로 키웠다. 아이 키가 4.6이니 브라키오 11이면
    # 아이가 올려다보는 크기다.
    "dino_brachio":   dict(height=11.0, tris=14000, dir="props"),
    "dino_trex":      dict(height=7.5, tris=14000, dir="props"),
    "dino_stego":     dict(height=6.0, tris=14000, dir="props"),
    # 익룡은 **하늘에 뜬다**. 날개를 편 자세라 땅에 두면 넘어진 것처럼 보인다
    "dino_ptero":     dict(height=4.0, tris=14000, dir="props"),
    "dino_ptero2":    dict(height=3.6, tris=14000, dir="props"),
    "dino_para":      dict(height=9.0, tris=14000, dir="props"),
    "dino_raptor":    dict(height=7.0, tris=14000, dir="props"),
    # ── 트랙 장애물 ──
    # 겉폭이 아니라 **아이가 지나갈 자리**가 판정이다.
    #   opening : 좌우 기둥 사이. 트랙(15)보다 넓어야 바깥 레인이 안 막힌다
    #   gap     : 가로대 밑면 높이. 아이 키 4.6에 견줘 숙일 만해야 한다
    "egg_block":    dict(width=4.0, tris=10000, dir="obstacles"),
    # 낮은 허들 — **눌러 늘이지 않는다.** 원본 비율이 1:0.443이라 폭 14.25에
    # 높이를 따로 맞추면 가로로 눌린다("찌그러져 보인다", 8/25).
    # 높이에 균등하게 맞춘 뒤 기둥을 바깥으로 옮긴다(`_widen`).
    #
    # 2.2에서 3.2로 올렸다. 균등 배율이 커지는 만큼 가운데를 덜 늘려도 되고,
    # 기둥도 아이 눈에 기둥으로 보인다. **판정에는 영향이 없다** —
    # 이 장애물은 상자 높이가 아니라 "떠 있었나"로 가른다(`judge.js`).
    "hurdle_low":   dict(width=14.25, height=3.2, widen=True, tris=10000, dir="obstacles"),
    "gate_wide":    dict(width=17.0, tris=14000, dir="obstacles", gap=3.4, opening=15.6),
    "gate_arch":    dict(width=19.0, tris=30000, dir="obstacles", gap=5.2, opening=16.4),
    # 자세 팻말은 **트랙을 다 덮는다.** 작으면 아이가 뭘 하라는 건지 못 읽고
    # 지나가 버린다 — 이 물건의 전부가 그림이다.
    # ── `mirror`는 **그림마다 따로 본다** ★ ──
    # 팻말은 앞에서 본 사람, 캐릭터는 뒤에서 본 사람이라 좌우가 반대로 보인다.
    # 그런데 **어느 팻말을 뒤집어야 하는지는 규칙으로 안 나온다** — 그림마다
    # 그려진 손발이 달라서다. 실제로 런지는 뒤집어야 맞고 옆구리는 원본이 맞았다.
    #
    # 화면에서 캐릭터와 나란히 놓고 보는 수밖에 없다. 픽셀로 재 보려고도 했는데
    # 사람 그림과 막대 그림이라 신호가 너무 약했다(상관계수 0.045).
    "sign_lunge":       dict(width=15.0, tris=30000, dir="obstacles", tex=1152, mirror=True),
    "sign_forwardbend": dict(width=15.0, tris=30000, dir="obstacles", tex=1152),
    "sign_armsopen":    dict(width=15.0, tris=14000, dir="obstacles", tex=1152),
    # ── 결승 포털 — **판 전체에서 딱 한 번** 나온다 ★★ ──────
    #
    # 다른 장애물과 셋이 다르다.
    #
    #   ① 부품이 59개다. 각각 자기 텍스처를 들고 온다 → `atlas=True`
    #      (그대로 두면 draw call이 59다. 예산이 20인데.)
    #   ② 뒷벽을 뚫어야 한다 → `cut`. 문 뒤가 막혀 있으면 통과가 아니라
    #      벽에 부딪히는 그림이 된다.
    #   ③ 문짝은 **빼낸다** → `door`. 반짝이는 문은 그림이 아니라 셰이더다
    #      (`runner3d/portal.js`) — 그림으로 두면 안 반짝인다.
    #
    # 예산도 다르다. 마지막에 화면을 가득 채우고 아이가 **통과하는** 물건이라
    # 5만까지 준다. 지나가는 장애물(1~3만)과 같은 자리에 두지 않는다.
    #
    # 폭 21은 트랙(15)보다 넓다 — 문이 트랙을 다 덮고 기둥이 바깥에 서야
    # "지나간다"가 된다. 기둥이 트랙 안으로 들어오면 바깥 레인이 막힌다.
    "finish_portal": dict(
        width=21.0, tris=50000, dir="obstacles", tex=2048,
        keep_all=True,          # 59개 중 작은 것도 다 물건이다 — 5% 필터를 끈다
        specks=0.008,           # 별·잎사귀가 작다. 기본 2%면 장식을 같이 턴다
        atlas=True,
        # ── 정규 좌표 ──
        #   x  −1…1  (반폭 비율)   y  0…1 (0=앞, 1=뒤)   z  0…1 (0=바닥, 1=꼭대기)
        # 원본 치수에 안 매인다 — AI가 다시 뽑아 줘도 같은 자리를 가리킨다.
        door=dict(x=0.27, y=(0.50, 0.60), z=(0.00, 0.50)),
        cut=dict(x=0.27, y=(0.52, 1.00), z=(0.02, 0.50)),
    ),
}

# 텍스처 상한 — **물건이 얼마나 가까이 오느냐로 나눈다.** ★
#
# 512 → 1024 → 2048로 올려 보고 나눠 쓰기로 했다. 관문·팻말은 화면을 가득
# 채우며 코앞을 지나가니 1536이 필요하고, 좌우 배경은 트랙 밖 12유닛 너머라
# 1024면 화면에서 차이가 안 난다. 한 값으로 묶으면 둘 중 하나가 손해다.
#
# 공룡 여섯 마리를 1536으로 두니 총량이 7.7MB였다 — 아이가 첫 화면에서
# 기다리는 시간이다. 1024로 내려 5.9MB가 됐고 화면은 그대로다.
TEX_MAX = 1536          # 트랙 장애물 — 코앞까지 온다
TEX_MAX_PROP = 1024     # 좌우 배경 — 12유닛 너머다
# 물건마다 따로 정할 수도 있다(`SPEC`의 `tex`). 자세 팻말은 넓은 판에
# 납작한 색과 사람 그림 하나뿐이라 1536이 필요 없다.


def _import(path, keep_all=False):
    """
    GLB를 불러와 **쓸 메시만** 남긴다.

    ── 리깅된 파일이 온다 ★ ────────────────────────────────────
    Meshy에서 자동 리깅을 켜면 GLB에 뼈대(`UniRigArmature`)와 **보조 메시**가
    같이 온다. 공룡 파일에는 80삼각형짜리 `Icosphere`가 섞여 있었고,
    파이프라인이 그걸 집어서 공룡 대신 구슬 세 개를 내보냈다.
    가장 큰 메시가 물건이고, 5%도 안 되는 것은 도구다 — 버린다.

    뼈대도 버린다. 우리는 부위를 직접 자르고 행렬로 흔든다(`DinoRow`) —
    스킨드 메시는 `InstancedMesh`가 못 쓴다(`CLAUDE.md`).
    """
    before = {o.name for o in bpy.data.objects}
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o.name for o in bpy.data.objects if o.name not in before]

    for n in new:
        o = bpy.data.objects.get(n)
        if o is not None and o.type != "MESH":
            bpy.data.objects.remove(o)

    meshes = [bpy.data.objects[n] for n in new
              if n in bpy.data.objects and bpy.data.objects[n].type == "MESH"]
    if not meshes:
        return []
    meshes.sort(key=lambda o: len(o.data.polygons), reverse=True)
    # ── 5% 필터를 끄는 경우 ★ ────────────────────────────────
    # 이 필터는 "리깅 보조 메시 하나가 섞여 온다"를 잡으려고 만든 것이다.
    # **키트배시에는 못 쓴다** — 결승 포털은 부품이 59개고 큰 것이 32만,
    # 작은 것이 2천 삼각형이다. 그대로 걸면 잎사귀·별·덩굴이 통째로 사라지고
    # 기둥 네 개만 남는다. 그런 파일은 `keep_all`로 끈다.
    if not keep_all:
        big = len(meshes[0].data.polygons)
        keep = [o for o in meshes if len(o.data.polygons) >= big * 0.05]
        for o in [o.name for o in meshes if o not in keep]:
            bpy.data.objects.remove(bpy.data.objects[o])
    else:
        keep = meshes

    # 아마추어 모디파이어는 뼈대가 사라졌으니 쓸모가 없다. 줄이기 전에 걷어낸다
    for o in keep:
        for m in list(o.modifiers):
            o.modifiers.remove(m)
    return keep


def _join(objs, name):
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    return ob


def _drop_specks(bm, frac=0.02):
    """
    **떨어져 나온 부스러기를 버린다.** ★

    숙이기 관문에 5~6면짜리 조각 셋이 붙어 있었다. 하나는 하늘에, 하나는
    길바닥에 점처럼 떠 있었다 — AI 생성물에 흔히 딸려 오는 찌꺼기다.

    면 수로는 못 거른다. 이 모델들은 잎사귀·돌·이빨이 각각 떨어진
    **키트배시**라 정상 부품도 5~90면이다. 대신 **크기**로 본다:
    부스러기는 모델 전체의 0.5~0.9%인데 제일 작은 잎사귀도 3.7%다.
    2%면 사이가 넉넉하다.

    붙인 **뒤에** 불러야 한다. 안 붙인 메시는 삼각형 하나하나가 다 섬이다.
    """
    bm.faces.ensure_lookup_table()
    seen, groups = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, comp = [f], []
        seen.add(f.index)
        while stack:
            cur = stack.pop()
            comp.append(cur)
            for e in cur.edges:
                for nf in e.link_faces:
                    if nf.index not in seen:
                        seen.add(nf.index)
                        stack.append(nf)
        groups.append(comp)
    if len(groups) < 2:
        return 0

    def span(faces):
        vs = [v.co for f in faces for v in f.verts]
        return max(max(v[k] for v in vs) - min(v[k] for v in vs) for k in range(3))

    whole = span(bm.faces)
    junk = [g for g in groups if span(g) < whole * frac]
    if not junk:
        return 0
    bmesh.ops.delete(bm, geom=[f for g in junk for f in g], context="FACES")
    # 면이 사라지면서 남은 정점·모서리도 같이 턴다
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    return len(junk)


def _decimate(ob, target, specks=0.02):
    """
    삼각형 수를 줄인다. **줄이기 전에 삼각형으로 만든다** — 사각 메시에
    데시메이트를 걸면 비율이 면 수 기준이라 결과가 예상과 어긋난다.
    """
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    # ── 먼저 **붙인다** ★★ ──────────────────────────────────
    # 이것이 "깨져 보인다"의 진짜 원인이었다. AI가 주는 메시는 삼각형이
    # **정점을 공유하지 않은 채로** 온다 — 190만 삼각형에 비매니폴드 모서리가
    # 35만 개였다. 메시가 통짜가 아니라 갈라진 조각 더미인 것이다.
    #
    # 데시메이트 collapse는 **경계 모서리를 못 접는다.** 그런 갈라진 자리가
    # 온 표면에 깔려 있으니, 목표 비율을 맞추려고 접을 수 있는 안쪽만 마구
    # 무너뜨리고 갈라진 자리는 뾰족한 파편으로 남긴다. 그게 화면에서
    # 얼룩덜룩한 조각으로 보였다. 블렌더 솔리드 뷰에서도 똑같이 보였으니
    # 텍스처가 아니라 **기하**였다.
    #
    # 붙이고 나면 비매니폴드가 13만 → 177로 떨어지고, 같은 9만5천 삼각형이
    # **매끈하게** 나온다. 거리는 3e-4 — 원본이 1유닛쯤이니 0.03%다.
    # 붙일 것만 붙고 모양이 뭉개지지는 않는 크기다.
    bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=3e-4)
    _drop_specks(bm, specks)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    # 붙이다 보면 같은 정점을 두 번 쓰는 면이 남는다. 그대로 내보내면
    # glTF가 "not valid"라고 경고하고 조용히 이상하게 굽는다 — 여기서 턴다.
    me.validate(verbose=False)
    me.update()
    me.calc_loop_triangles()
    n = len(me.loop_triangles)
    if n <= target:
        return n
    # ── 한 번에 안 줄어든다 ★ ────────────────────────────────
    # 비율만 계산해 한 번 걸면 되는 줄 알았는데, 25만짜리에 0.04를 줬더니
    # 9만에서 멈췄다. 데시메이트 collapse는 **경계 모서리를 못 접는다** —
    # AI 모델은 물샐틈없지 않아서 경계가 많고, 그 부분은 비율과 무관하게 남는다.
    # 남은 것을 다시 재서 또 거는 수밖에 없다. (관문 치수도 같은 이유로 반복이다)
    #
    # 안 줄면 멈춘다. 못 줄이는 메시에 계속 걸어 봐야 시간만 쓴다.
    bpy.context.view_layer.objects.active = ob
    for _ in range(5):
        if n <= target:
            break
        m = ob.modifiers.new("dec", "DECIMATE")
        m.ratio = target / n
        m.use_collapse_triangulate = True
        # `bpy.ops.object.modifier_apply`는 **컨텍스트를 탄다** — 새 파일을 연
        # 직후에는 poll이 실패한다. 뎁스그래프에서 결과 메시를 직접 굽는 쪽이
        # 같은 일을 하면서 어디서 불러도 돌아간다.
        dg = bpy.context.evaluated_depsgraph_get()
        baked = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        ob.modifiers.remove(m)
        old_me = ob.data
        ob.data = baked
        if old_me.users == 0:
            bpy.data.meshes.remove(old_me)
        _drop_loose(ob)
        ob.data.calc_loop_triangles()
        after = len(ob.data.loop_triangles)
        if after >= n * 0.95:      # 더 못 줄인다
            n = after
            break
        n = after
    return n


def _drop_loose(ob):
    """
    면에 안 붙은 정점·모서리를 버린다. ★

    디시메이트는 이런 걸 남긴다. 눈에는 안 보이지만 **블렌더의 경계상자는
    세고 glTF는 안 내보낸다** — 그래서 블렌더에서 잰 치수와 실제 파일이 달랐다.
    관문 틈을 3.4로 맞췄는데 파일은 5.1이었던 게 이것 때문이다. 유령 정점 위에서
    계산하고 있었던 것이다.
    """
    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    loose_e = [e for e in bm.edges if not e.link_faces]
    if loose_e:
        bmesh.ops.delete(bm, geom=loose_e, context="EDGES")
    loose_v = [v for v in bm.verts if not v.link_faces]
    if loose_v:
        bmesh.ops.delete(bm, geom=loose_v, context="VERTS")
    bm.to_mesh(me); bm.free()
    # 데시메이트가 같은 정점을 두 번 쓰는 면을 남길 수 있다. 그대로 내보내면
    # glTF가 "not valid"라고 경고하고 조용히 이상하게 굽는다 — 매번 턴다.
    me.validate(verbose=False)
    me.update()


def _measure_gate(ob):
    """
    관문의 **입구**와 **가로대 밑면**을 잰다.

    가운데에는 기둥이 없으므로, x가 가운데인 정점들의 가장 낮은 z가 곧
    가로대의 밑면이다. 입구는 그 높이의 절반쯤에서 좌우 기둥의 안쪽 면 사이다.
    """
    vs = ob.data.vertices
    if not len(vs):
        return None, None
    xs = [v.co.x for v in vs]
    zs = [v.co.z for v in vs]
    # ★ **바닥을 먼저 찾는다.** 이 시점엔 아직 발밑 정렬 전이라 z가 음수일 수 있고,
    #   그걸 그대로 높이로 쓰면 `gap`이 음수가 돼 측정이 통째로 실패한다.
    #   실제로 그래서 관문 맞추기가 조용히 건너뛰어졌다(8/20).
    z0 = min(zs)
    cx = (min(xs) + max(xs)) / 2
    hw = (max(xs) - min(xs)) / 2
    mid = [v.co.z - z0 for v in vs if abs(v.co.x - cx) < hw * 0.18]
    gap = min(mid) if mid else None
    if gap is None or gap < 0.05:
        return None, None
    lo, hi = z0 + gap * 0.25, z0 + gap * 0.75
    left = max((v.co.x for v in vs if v.co.x < cx and lo < v.co.z < hi), default=None)
    right = min((v.co.x for v in vs if v.co.x > cx and lo < v.co.z < hi), default=None)
    opening = (right - left) if (left is not None and right is not None) else None
    return gap, opening


def _fit_gate(ob, spec):
    """
    관문을 **기둥은 옮기고 가로대만 늘려** 맞춘다. ★

    ── 왜 통째로 늘리면 안 되나 ────────────────────────────────
    처음엔 x를 통째로 1.77배 늘렸다. 입구·틈 숫자는 맞았지만 화면에서
    **기둥이 찌그러지고 무늬가 뭉개져 보였다** — 돌 하나하나가 옆으로 눌리니
    깨진 그림처럼 읽힌다.
    AI 관문의 비율(입구/틈 ≈ 1.7)과 우리 규칙(15.6/3.4 ≈ 4.6)이 애초에 다르다.
    그림을 늘려 규칙을 맞추는 대신 **기둥을 바깥으로 옮긴다.** 돌기둥은 모양이
    그대로 남고, 늘어나는 것은 통나무 가로대뿐이라 티가 안 난다.

    높이는 균등하게 줄인다 — 그건 세계에서 물건이 작아지는 것이라 자연스럽다.
    """
    gap, opening = _measure_gate(ob)
    if not gap:
        return
    # ① 틈을 균등 스케일로 맞춘다. 모양은 안 상한다
    k = spec["gap"] / gap
    ob.scale = (k, k, k)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bpy.context.view_layer.update()

    need = spec.get("opening")
    if not need:
        return
    gap, opening = _measure_gate(ob)
    if not opening or opening >= need:
        return

    # ② 기둥은 **평행이동**, 가로대만 늘린다
    half = opening / 2
    push = (need - opening) / 2
    for v in ob.data.vertices:
        if v.co.x < -half:
            v.co.x -= push
        elif v.co.x > half:
            v.co.x += push
        else:
            v.co.x *= need / opening       # 가운데(가로대)만 늘어난다
    ob.data.update()
    bpy.context.view_layer.update()


def _widen(ob, width):
    """
    **높이는 그대로 두고 폭만 넓힌다** — 기둥은 옮기고 가운데만 늘려서. ★

    ── 왜 통째로 늘리면 안 되나 ────────────────────────────────
    낮은 허들은 `flat=True`로 폭 14.25 · 높이 2.2에 맞췄다. 원본 비율이
    1 : 0.443이라 x는 14.25배, z는 4.97배 — **가로로 2.9배 눌린 그림**이 된다.
    화면에서는 기둥이 납작하게 퍼지고 무늬가 늘어져 "찌그러져 보인다"가 됐다.

    관문에서 쓴 방법이 그대로 답이다(`_fit_gate`). 균등 배율로 높이를 맞춘 뒤,
    **기둥은 평행이동하고 가로대만 늘린다.** 돌기둥은 모양이 그대로 남고
    늘어나는 것은 통나무·덩굴뿐이라 티가 안 난다.

    ── 기둥이 어디까지인지 **재서** 찾는다 ★ ──────────────────
    처음엔 "양 끝에서 30%"로 어림했다. 그 선이 기둥 안쪽을 잘라서, 기둥의
    일부가 같이 늘어났다 — 기둥이 옆으로 퍼져 여전히 찌그러져 보였다.

    허들에는 관문 같은 틈이 없어 틈으로는 못 잰다. 대신 **바닥에 닿는 곳**이
    기둥이다. x를 잘게 나눠 각 칸의 밑면 높이를 보면, 기둥 자리는 0 근처이고
    가로대만 있는 자리는 공중에 떠 있다. 그 경계가 진짜 기둥 안쪽이다.
    """
    bpy.context.view_layer.update()
    now = ob.dimensions.x
    if now >= width:
        return
    xs = [v.co.x for v in ob.data.vertices]
    lo_x, hi_x = min(xs), max(xs)
    mid = (lo_x + hi_x) / 2
    zs = [v.co.z for v in ob.data.vertices]
    floor, top = min(zs), max(zs)
    ground = floor + (top - floor) * 0.25      # 이보다 낮으면 "바닥에 닿았다"

    BINS = 48
    w = (hi_x - lo_x) / BINS
    grounded = [False] * BINS
    for v in ob.data.vertices:
        if v.co.z <= ground:
            b = min(BINS - 1, int((v.co.x - lo_x) / max(w, 1e-9)))
            grounded[b] = True
    # 왼쪽 기둥의 오른쪽 끝 / 오른쪽 기둥의 왼쪽 끝
    left = 0
    while left < BINS and grounded[left]:
        left += 1
    right = BINS - 1
    while right >= 0 and grounded[right]:
        right -= 1
    if left >= right:                          # 통짜다 — 늘릴 가운데가 없다
        return
    inner_l = lo_x + left * w - mid
    inner_r = lo_x + (right + 1) * w - mid

    # ── 늘어남을 **가운데로 몰아넣는다** ★ ──
    # 기둥만 옮기고 나머지를 통째로 늘렸더니, 기둥 옆의 **무늬 있는 통나무**가
    # 4배로 늘어나 잎사귀 조각이 납작해졌다 — 그게 "세로로 찌그러져 보인다"였다.
    # 가로대 한가운데는 민무늬 구간이라 늘려도 티가 안 난다. 안쪽 45%만
    # 늘리고, 기둥과 그 옆 장식은 **통째로 민다.**
    push = (width - now) / 2
    core_l = inner_l * 0.45
    core_r = inner_r * 0.45
    span_l = max(-core_l, 1e-6)
    span_r = max(core_r, 1e-6)
    for v in ob.data.vertices:
        x = v.co.x - mid
        if x <= core_l:
            v.co.x = x - push + mid            # 왼쪽 절반 — 통째로 옮긴다
        elif x >= core_r:
            v.co.x = x + push + mid            # 오른쪽 절반 — 통째로 옮긴다
        elif x < 0:
            v.co.x = x * ((span_l + push) / span_l) + mid
        else:
            v.co.x = x * ((span_r + push) / span_r) + mid
    ob.data.update()
    bpy.context.view_layer.update()


def _mirror_x(ob):
    """
    좌우를 뒤집는다 — **그림만.** ★

    자세 팻말의 사람 그림과 캐릭터의 자세가 좌우 반대였다. 팻말은 앞에서 본
    사람이고 캐릭터는 뒤에서 본 사람이라 같은 동작이 화면에서는 반대로
    보이는 것인데, 4~8세에게는 그냥 **다른 동작**으로 읽힌다.

    `_shared/pose01~03` 실루엣 힌트는 캐릭터와 같은 쪽이다. 즉 팻말만
    혼자 반대였다 — 그래서 팻말을 뒤집는다.

    판정은 안 바뀐다. `poseMatch.matchTargets`가 원본과 거울을 **둘 다**
    채점해 높은 쪽을 쓰므로, 아이가 어느 다리를 앞으로 내밀든 통과한다.
    """
    for v in ob.data.vertices:
        v.co.x = -v.co.x
    # 뒤집으면 면이 안팎으로 뒤집힌다. 되돌리지 않으면 뒷면이 보인다.
    ob.data.flip_normals()
    ob.data.update()
    bpy.context.view_layer.update()


def _fit(ob, spec):
    """
    크기와 자리를 **우리 세계에 맞춘다.**

    ── 관문은 겉폭이 아니라 **입구와 틈**이 판정이다 ★ ────────
    처음엔 겉폭만 맞췄다. 그러니 기둥이 트랙 안쪽으로 들어와 **입구가 12.6**이
    됐다 — 트랙이 15인데 바깥 레인을 달리던 아이가 기둥에 박힌다. 가로대도
    9.5 높이에 있어서 "숙이기"인데 그냥 지나가면 되는 물건이 됐다.
    그림이 규칙을 바꾼 것이고, 그러면 아이가 화면을 보고 판단한 것과 판정이 어긋난다.

    그래서 관문은 **z를 틈에, x를 입구에** 따로 맞춘다. 늘어나긴 하지만
    사람이 쌓은 돌기둥이라 티가 덜 나고, 무엇보다 **규칙이 먼저다.**
    """
    bpy.context.view_layer.update()
    d = ob.dimensions
    if spec.get("widen"):
        # 높이에 균등하게 맞춘 뒤 폭은 **기둥을 옮겨** 넓힌다(`_widen`).
        # 눌러 늘이지 않는다 — 그게 "찌그러져 보인다"의 정체였다.
        k = spec["height"] / max(d.z, 1e-6)
        ob.scale = (k, k, k)
    elif spec.get("flat"):
        # ── 폭과 높이를 **따로** 맞춘다 ──
        # 허들만 이렇게 한다. 받은 그림이 관문이라 비율이 우리 규칙과 다른데,
        # 뛰어넘는 물건은 **낮아야 한다**는 게 규칙의 전부다. 눌린 돌기둥은
        # 낮은 받침으로 읽히고, 가로대는 통나무라 눌려도 통나무다.
        #
        # ── 앞뒤는 **높이를 따라간다** ★ ──
        # 처음엔 1.0으로 뒀다(= 안 건드림). 폭을 14배 늘리면서 앞뒤만 원본
        # 그대로 두니 깊이가 0.27이 나왔다 — 14미터 너비에 종잇장 두께다.
        # 옆에서 보면 판지로 오린 것처럼 보인다.
        #
        # 폭 배율을 그대로 쓰면 반대로 4유닛짜리 뚱뚱한 물건이 되어, 판정
        # 상자(`KINDS.hurdleLow`의 d=0.8)보다 훨씬 두꺼워진다 — 아이가
        # 그림 속을 통과하는 것처럼 보인다. **높이 배율을 쓰면** 1.4쯤이 되어
        # 판정 상자와 비슷하고 통나무로도 읽힌다.
        kz = spec["height"] / max(d.z, 1e-6)
        ob.scale = (spec["width"] / max(d.x, 1e-6), kz, kz)
    else:
        k = (spec["width"] / max(d.x, 1e-6)) if spec.get("width") \
            else (spec["height"] / max(d.z, 1e-6))
        ob.scale = (k, k, k)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)

    if spec.get("gap"):
        _fit_gate(ob, spec)
    if spec.get("widen"):
        _widen(ob, spec["width"])

    # 원점을 **발밑 한가운데**로. 우리 규칙이자, 이게 없으면 프롭이 땅에 묻힌다
    bpy.context.view_layer.update()
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    bpy.context.view_layer.update()
    lo = min((ob.matrix_world @ v.co).z for v in ob.data.vertices)
    for v in ob.data.vertices:
        v.co.z -= lo - ob.location.z
    ob.location = (0, 0, 0)
    ob.data.update()


def _clean_material(ob, near=True, tex=None):
    """
    **기본색만 남기고 다 버린다.** ★

    AI는 세 장을 준다 — base_color · metallic_roughness · normal. 뒤의 둘은
    **빛이 있어야 쓸모가 있는 것**인데 우리 게임엔 실시간 조명이 0개다.
    그대로 두면 쓰지도 않을 그림 두 장을 아이 기기가 받아서 GPU에 올린다.
    실제로 알 받침대 하나가 6.6MB였고, 그중 기본색은 3분의 1이었다.

    남은 한 장도 512로 줄인다. 25~90유닛 뒤에서는 그보다 크게 안 보인다.
    """
    kept = []
    for slot in ob.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        # ── 노드 비교는 **이름으로** 한다 ★ ──
        # 블렌더는 RNA를 만질 때마다 새 파이썬 래퍼를 준다. `is`로 견주면
        # 같은 노드인데도 다르다고 나온다 — 그래서 기본색 노드까지 지워졌고,
        # 알 받침대가 텍스처 없는 흰 덩어리로 나왔다.
        bsdf = next((n.name for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        base = None
        if bsdf:
            link = next((l for l in nt.links if l.to_node.name == bsdf
                         and l.to_socket.name == "Base Color"), None)
            node = link.from_node if link else None
            # 색이 바로 안 오고 중간 노드를 거칠 수 있다 — 한 단계만 더 따라간다
            if node is not None and node.type != "TEX_IMAGE":
                nm = node.name
                up = next((l for l in nt.links if l.to_node.name == nm), None)
                node = up.from_node if up else None
            if node is not None and node.type == "TEX_IMAGE":
                base = node.name
        for n in list(nt.nodes):
            if n.type in ("TEX_IMAGE", "NORMAL_MAP", "SEPARATE_COLOR") and n.name != base:
                nt.nodes.remove(n)
        base = nt.nodes.get(base) if base else None
        if base and base.image:
            im = base.image
            # ── 알파를 떼야 JPEG로 나간다 ★ ──
            # glTF 내보내기는 **알파가 있으면 PNG를 고집한다.** Meshy의 기본색에
            # 쓰이지도 않는 알파 채널이 있어서, 2048 텍스처 하나가 4MB PNG로
            # 나갔다(전부 합쳐 28MB). 조명이 0개인 우리는 알파를 안 쓴다.
            im.alpha_mode = "NONE"
            cap = tex or (TEX_MAX if near else TEX_MAX_PROP)
            if max(im.size) > cap:
                k = cap / max(im.size)
                im.scale(max(1, int(im.size[0] * k)), max(1, int(im.size[1] * k)))
            kept.append(f"{im.size[0]}x{im.size[1]}")
    return kept


# ── 정규 상자 ───────────────────────────────────────────────
#
# 자를 자리를 원본 치수로 적으면 AI가 모델을 다시 뽑을 때마다 숫자를 고쳐야
# 한다. 대신 **경계상자 안의 비율**로 적는다.
#
#   x  −1…1  반폭 대비 (0이 한가운데)
#   y   0…1  0 = 앞(-Y), 1 = 뒤(+Y)
#   z   0…1  0 = 바닥, 1 = 꼭대기


def _box_world(ob, box):
    """정규 상자를 이 메시의 실제 좌표로 바꾼다."""
    vs = ob.data.vertices
    xs = [v.co.x for v in vs]; ys = [v.co.y for v in vs]; zs = [v.co.z for v in vs]
    x0, x1 = min(xs), max(xs); y0, y1 = min(ys), max(ys); z0, z1 = min(zs), max(zs)
    cx, hw = (x0 + x1) / 2, (x1 - x0) / 2
    return dict(
        x=(cx - box["x"] * hw, cx + box["x"] * hw),
        y=(y0 + (y1 - y0) * box["y"][0], y0 + (y1 - y0) * box["y"][1]),
        z=(z0 + (z1 - z0) * box["z"][0], z0 + (z1 - z0) * box["z"][1]),
    )


def _faces_in(ob, w):
    """상자 안에 **면 중심**이 든 면들. 정점 하나만 걸쳐도 지우면 가장자리가 뜯긴다."""
    out = []
    for p in ob.data.polygons:
        c = p.center
        if w["x"][0] <= c.x <= w["x"][1] and w["y"][0] <= c.y <= w["y"][1] \
           and w["z"][0] <= c.z <= w["z"][1]:
            out.append(p.index)
    return out


def _cut(ob, box):
    """
    **문 뒤를 뚫는다.** ★

    받은 포털은 뒷면이 벽돌 벽이다(정면만 보고 만든 모델이다). 그대로 두면
    아이가 문을 지나는 게 아니라 **벽에 부딪히는** 그림이 된다 — 결승선인데
    통과가 안 되는 셈이다.

    부품을 통째로 지우지 않는다. 뒷벽 판은 문보다 넓어서, 다 지우면 문 위쪽
    까지 뻥 뚫려 하늘이 보인다. **문 앞 기둥 사이 기둥꼴(prism)에 든 면만**
    턴다 — 그 자리가 곧 아이가 지나갈 통로다.

    바닥 근처(z < 2%)는 남긴다. 트랙 바닥이 어차피 덮고, 지우면 옆에서 볼 때
    문지방이 잘려 나간 것처럼 보인다.
    """
    w = _box_world(ob, box)
    idx = set(_faces_in(ob, w))
    if not idx:
        return 0
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in idx], context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data); bm.free()
    ob.data.validate(verbose=False)
    ob.data.update()
    return len(idx)


def _take_door(ob, box):
    """
    문짝을 **빼내고 그 자리를 알려준다.** ★

    문은 그림이 아니라 연출이다 — 반투명하고 반짝여야 한다(`runner3d/portal.js`).
    구운 텍스처로 두면 아무리 밝게 칠해도 **안 움직인다.**

    그래서 여기서는 지우기만 하고, **잰 사각형을 돌려준다.** 게임 쪽은 그
    숫자대로 판 하나를 세운다. 자리를 코드에 손으로 적으면 모델을 다시 뽑을
    때 조용히 어긋난다 — 문은 벽에 남고 빛만 허공에 뜬다.

    ── 왜 비율로 돌려주나 ★ ────────────────────────────────────
    이 함수는 **크기를 맞추기 전**(원본 0.2유닛 세계)에 돈다. 여기서 잰
    숫자를 그대로 넘기면 게임에서 문이 점만 하게 뜬다. 경계상자 대비 비율로
    돌려주고, 맞춘 뒤에 최종 치수를 곱한다(`_door_world`).

    @returns dict — 경계상자 대비 비율
    """
    w = _box_world(ob, box)
    idx = _faces_in(ob, w)
    if not idx:
        return None
    # 지우기 **전에** 잰다. 지운 뒤에는 잴 것이 없다.
    vs = ob.data.vertices
    pts = [vs[i].co for p in idx for i in ob.data.polygons[p].vertices]
    xs = [p.x for p in pts]; ys = [p.y for p in pts]; zs = [p.z for p in pts]
    all_v = ob.data.vertices
    ax = [v.co.x for v in all_v]; ay = [v.co.y for v in all_v]; az = [v.co.z for v in all_v]
    W = max(ax) - min(ax); D = max(ay) - min(ay); H = max(az) - min(az)
    rect = dict(
        w=(max(xs) - min(xs)) / W,                       # 폭 / 전체 폭
        h=(max(zs) - min(zs)) / H,                       # 높이 / 전체 높이
        z=((min(zs) + max(zs)) / 2 - min(az)) / H,       # 바닥에서 문 한가운데까지
        y=(sum(ys) / len(ys) - min(ay)) / D,             # 앞면에서 문까지
    )
    bm = bmesh.new(); bm.from_mesh(ob.data)
    bm.faces.ensure_lookup_table()
    keep = set(idx)
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index in keep], context="FACES")
    loose = [v for v in bm.verts if not v.link_faces]
    if loose:
        bmesh.ops.delete(bm, geom=loose, context="VERTS")
    bm.to_mesh(ob.data); bm.free()
    ob.data.validate(verbose=False)
    ob.data.update()
    return rect


def _door_world(ob, rect):
    """비율로 잰 문을 **최종 세계 단위**로 바꾼다. 크기를 맞춘 뒤에 부른다."""
    bpy.context.view_layer.update()
    d = ob.dimensions
    ys = [v.co.y for v in ob.data.vertices]
    return dict(
        w=round(rect["w"] * d.x, 3),
        h=round(rect["h"] * d.z, 3),
        z=round(rect["z"] * d.z, 3),                  # 바닥에서 문 한가운데
        y=round(min(ys) + rect["y"] * d.y, 3),        # 문이 놓인 깊이
        depth=round(d.y, 3),
    )


def _base_image(ob):
    """이 부품의 기본색 그림 하나. 없으면 None."""
    for slot in ob.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        link = next((l for l in nt.links if l.to_node.name == bsdf.name
                     and l.to_socket.name == "Base Color"), None)
        node = link.from_node if link else None
        if node is not None and node.type != "TEX_IMAGE":
            up = next((l for l in nt.links if l.to_node.name == node.name), None)
            node = up.from_node if up else None
        if node is not None and node.type == "TEX_IMAGE" and node.image:
            return node.image
    return None


def _atlas(objs, name, size=2048, pad=4):
    """
    부품마다 딸려 온 텍스처를 **한 장으로 묶는다.** ★★

    ── 왜 필요한가 ─────────────────────────────────────────────

    결승 포털은 부품이 59개고 **각각 자기 텍스처**를 들고 온다(키트배시).
    그대로 합치면 재질이 59개인 메시가 되고, three.js는 재질마다 한 번씩
    그린다 — **draw call 59개.** 우리 예산이 20이다.

    ── 왜 굽지 않고 옮겨 붙이나 ────────────────────────────────

    보통은 Cycles로 베이크한다. 하지만 그건 **다시 그리는** 일이라 200만
    삼각형에서 오래 걸리고, 결과가 굽기 설정에 좌우된다.

    여기서는 그럴 필요가 없다. 확인해 보니 **59개 전부 UV가 0…1 안에** 있다.
    그러면 그림을 타일로 늘어놓고 UV를 그 칸으로 옮기기만 하면 된다 —
    픽셀은 축소만 되고, 결과가 매번 똑같다.

    ── 칸 크기는 **삼각형 수**로 준다 ──────────────────────────

    59개를 똑같이 나누면 화면을 채우는 기둥(32만 삼각형)과 구석의 잎사귀
    한 장이 같은 해상도를 받는다. 큰 부품이 곧 크게 보이는 부품이다.

    ── 가장자리는 **늘려 채운다** ★ ────────────────────────────

    칸을 딱 붙여 놓으면 밉맵과 선형 보간이 옆 칸 색을 빨아들여, 물건 테두리에
    엉뚱한 색 실선이 생긴다. 그림을 칸보다 `pad`만큼 작게 넣고 남는 테두리를
    **가장자리 색으로 늘려** 둔다. UV를 안으로 밀어 넣는 방법도 있지만 그건
    그림이 미세하게 줄어드는 것이라 무늬가 어긋난다.
    """
    import numpy as np

    items = []
    for o in objs:
        img = _base_image(o)
        if img is None:
            continue
        tris = len(o.data.polygons)
        tile = 512 if tris >= 100000 else 256 if tris >= 20000 else 128
        items.append([o, img, tile])
    if not items:
        return None

    # 큰 칸부터 선반에 얹는다. 작은 것부터 놓으면 큰 칸이 들어갈 자리가 안 남는다.
    items.sort(key=lambda it: -it[2])
    while True:
        x = y = shelf = 0
        spots, ok = [], True
        for _, _, tile in items:
            if x + tile > size:
                x = 0; y += shelf; shelf = 0
            if y + tile > size:
                ok = False
                break
            spots.append((x, y))
            x += tile
            shelf = max(shelf, tile)
        if ok:
            break
        # 안 들어가면 **칸을 줄인다.** 아틀라스를 키우면 아이가 받을 용량이 는다.
        if max(it[2] for it in items) <= 64:
            return None
        for it in items:
            it[2] = max(64, it[2] // 2)

    atlas = np.zeros((size, size, 4), dtype=np.float32)
    atlas[..., 3] = 1.0
    for (o, img, tile), (tx, ty) in zip(items, spots):
        inner = max(1, tile - pad * 2)
        cp = img.copy()
        cp.scale(inner, inner)
        buf = np.empty(inner * inner * 4, dtype=np.float32)
        cp.pixels.foreach_get(buf)
        bpy.data.images.remove(cp)
        cell = buf.reshape(inner, inner, 4)
        # 칸을 가장자리 색으로 채운 뒤 가운데에 그림을 얹는다 (= 테두리 늘리기)
        block = np.empty((tile, tile, 4), dtype=np.float32)
        ys = np.clip(np.arange(tile) - pad, 0, inner - 1)
        xs = np.clip(np.arange(tile) - pad, 0, inner - 1)
        block[:] = cell[np.ix_(ys, xs)]
        atlas[ty:ty + tile, tx:tx + tile] = block

        # UV를 이 칸으로 옮긴다. 그림이 안쪽 `inner`에 있으므로 거기로 보낸다.
        u0, v0 = (tx + pad) / size, (ty + pad) / size
        k = inner / size
        uv = o.data.uv_layers.active
        if uv:
            arr = np.empty(len(uv.data) * 2, dtype=np.float32)
            uv.data.foreach_get("uv", arr)
            arr = arr.reshape(-1, 2)
            np.clip(arr, 0.0, 1.0, out=arr)
            arr[:, 0] = u0 + arr[:, 0] * k
            arr[:, 1] = v0 + arr[:, 1] * k
            uv.data.foreach_set("uv", arr.reshape(-1))

    im = bpy.data.images.new(f"{name}_atlas", size, size, alpha=False)
    im.colorspace_settings.name = "sRGB"
    im.pixels.foreach_set(atlas.reshape(-1))
    im.update()

    # 부품마다 다르던 재질을 **하나로** 바꾼다. 이래야 합쳤을 때 한 덩어리다.
    mat = bpy.data.materials.new(f"{name}_mat")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = im
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    for o, _, _ in items:
        o.data.materials.clear()
        o.data.materials.append(mat)
    return dict(size=size, tiles=len(items),
                biggest=max(it[2] for it in items), smallest=min(it[2] for it in items))


def _split_dino(ob, name, out_dir):
    """
    공룡을 **몸통·머리·꼬리**로 자른다.

    AI는 한 덩어리로 준다. `DinoRow`가 부위를 따로 흔들려면 나뉘어 있어야 하고,
    부위의 원점이 **붙는 자리**에 있어야 축이 맞는다(`CLAUDE.md`).

    자르는 자리는 y다 — 우리 규격에서 앞이 -Y이므로, 앞쪽 덩어리가 머리이고
    뒤쪽이 꼬리다. 정확한 해부가 아니라 **흔들었을 때 자연스러운 경계**를 찾는 일이다.
    """
    bpy.context.view_layer.update()
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    y0, y1 = min(ys), max(ys)
    z1 = max(zs)
    head_y = y0 + (y1 - y0) * 0.30       # 앞 30%
    tail_y = y0 + (y1 - y0) * 0.78       # 뒤 22%
    head_z = z1 * 0.45                   # 머리는 위쪽만 — 앞발까지 흔들면 안 된다

    groups = {"body": [], "head": [], "tail": []}
    me = ob.data
    me.calc_loop_triangles()
    for poly in me.polygons:
        c = poly.center
        if c.y < head_y and c.z > head_z:
            groups["head"].append(poly.index)
        elif c.y > tail_y:
            groups["tail"].append(poly.index)
        else:
            groups["body"].append(poly.index)

    made = []
    for part, idxs in groups.items():
        if not idxs:
            continue
        cp = ob.copy(); cp.data = ob.data.copy(); cp.name = part
        bpy.context.collection.objects.link(cp)
        bm = bmesh.new(); bm.from_mesh(cp.data)
        bm.faces.ensure_lookup_table()
        keep = set(idxs)
        bmesh.ops.delete(bm, geom=[f for f in bm.faces if f.index not in keep], context="FACES")
        bm.to_mesh(cp.data); bm.free(); cp.data.update()
        made.append((part, cp))

    # 붙는 자리 = 그 부위 조각의 **몸통 쪽 끝**. 거기를 축으로 돌아야 목이 안 빠진다
    for part, cp in made:
        bpy.context.view_layer.update()
        vs = cp.data.vertices
        if not len(vs):
            continue
        if part == "head":
            at = (0.0, max(v.co.y for v in vs), sum(v.co.z for v in vs) / len(vs))
        elif part == "tail":
            at = (0.0, min(v.co.y for v in vs), sum(v.co.z for v in vs) / len(vs))
        else:
            at = (0.0, 0.0, 0.0)
        for v in vs:
            v.co.x -= at[0]; v.co.y -= at[1]; v.co.z -= at[2]
        cp.data.update()
        cp.location = at

    bpy.data.objects.remove(ob)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for _, cp in made:
        cp.select_set(True)
    bpy.context.view_layer.objects.active = made[0][1]
    path = os.path.join(ROOT, "public/assets/runner3d", out_dir, name + ".glb")
    _export(path)
    return {p: [round(v, 3) for v in cp.location] for p, cp in made}


def _export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_normals=True,
        # **재질을 살린다.** 스크립트 에셋과 다른 점이 이것이다 — AI 모델은
        # 색이 텍스처에 있다. 인스턴싱에서는 종류마다 재질이 달라도
        # draw call이 안 늘어서(= InstancedMesh 개수) 이래도 예산에 안 걸린다.
        export_materials="EXPORT",
        export_image_format="JPEG", export_jpeg_quality=92,
        export_cameras=False, export_lights=False, export_animations=False,
        # ── 정점은 압축해 보낸다 ★ ──────────────────────────
        # AI 고품질 모델은 25만 삼각형이다. 게임 규격으로 줄이는데 1만까지
        # 깎으면 **UV가 뭉개져 잎사귀가 진흙이 된다**(8/25). 2만5천은 멀쩡한데
        # 파일이 2MB고 그런 물건이 넷이면 8MB — 아이가 기다리는 시간이다.
        #
        # 깎느냐 키우느냐의 양자택일 같았지만 셋째 길이 있었다. **압축하면
        # 둘 다 안 줄여도 된다.** 화면에 그려지는 것은 압축 전과 똑같다.
        #
        # 받는 쪽은 `models.js`가 `DRACOLoader`로 푼다. **둘은 한 몸이다** —
        # 여기만 켜고 저쪽을 안 켜면 게임에서 모델이 통째로 안 뜬다.
        #
        # 위치 14비트는 15유닛짜리 관문에서 1mm다. 판정에 영향이 없다.
        #
        # UV는 한 번 의심했다 — 알 둥지가 얼룩덜룩해서 12비트가 섬 경계를
        # 넘겼나 싶었다. **16비트로 올려 봤더니 화면이 똑같았다.** 파일만 18%
        # 커졌다. 얼룩의 정체는 압축이 아니라 **디시메이트**였다(`SPEC` 참고).
        # 재 보지 않고 고쳤으면 엉뚱한 값을 정본으로 남길 뻔했다.
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14,
    )


def run(only=None):
    report = {}
    if not os.path.isdir(INBOX):
        return {"error": f"{INBOX} 가 없다"}
    files = sorted(f for f in os.listdir(INBOX) if f.lower().endswith((".glb", ".gltf")))
    for f in files:
        name = os.path.splitext(f)[0]
        if only and name not in only:
            continue
        spec = SPEC.get(name)
        if not spec:
            report[name] = {"skip": "SPEC에 없는 이름 — tools/ai_source/의 이름을 그대로 써야 한다"}
            continue
        pz.reset()
        objs = _import(os.path.join(INBOX, f), keep_all=spec.get("keep_all", False))
        if not objs:
            report[name] = {"error": "메시가 없다"}
            continue
        # ── 아틀라스는 **합치기 전**이다 ★ ──
        # UV를 부품마다 자기 칸으로 옮겨야 하는데, 합치고 나면 어느 삼각형이
        # 어느 부품 것이었는지 알 수 없다.
        atlas = _atlas(objs, name) if spec.get("atlas") else None
        ob = _join(objs, name)

        # ── 자르기는 **깎기 전**이다 ★★ ──────────────────────
        # 처음엔 다 끝난 뒤에 잘랐다. 그러니 뚫은 구멍 테두리가 **톱니처럼
        # 삐죽삐죽했다** — 면 중심으로 지우는데 그때는 삼각형이 이미 커서,
        # 반쯤 걸친 면이 그대로 남거나 통째로 사라진다.
        #
        # 원본 상태에서는 삼각형이 1mm도 안 된다. 거기서 자르면 테두리가
        # 매끄럽고, 이어지는 디시메이트는 **경계 모서리를 못 접으니**
        # 그 테두리를 그대로 지킨다. 같은 성질이 여기서는 도움이 된다.
        door = _take_door(ob, spec["door"]) if spec.get("door") else None
        cut = _cut(ob, spec["cut"]) if spec.get("cut") else 0
        # ── 순서가 중요하다 ★ ──
        # 처음엔 맞추고 → 줄이고 → **다시 맞췄다.** 그런데 디시메이트가 관문의
        # 가로대 밑면을 뭉개서 `틈`이 실제보다 작게 재어졌고, 두 번째 맞추기가
        # 그 거짓말 위에서 z를 1.8배 늘렸다 — 틈 3.4를 시켰는데 5.1이 나왔다.
        # **줄인 다음 한 번만** 맞춘다. 잰 값이 최종 메시의 값이어야 한다.
        tris = _decimate(ob, spec["tris"], spec.get("specks", 0.02))
        if spec.get("mirror"):
            _mirror_x(ob)
        _fit(ob, spec)
        if door:
            door = _door_world(ob, door)
        texs = _clean_material(ob, near=spec["dir"] == "obstacles", tex=spec.get("tex"))

        if spec.get("split") == "dino":
            parts = _split_dino(ob, name, spec["dir"])
            report[name] = {"tris": tris, "textures": texs, "parts": parts}
            continue

        for o in bpy.context.selected_objects:
            o.select_set(False)
        ob.select_set(True)
        bpy.context.view_layer.objects.active = ob
        path = os.path.join(ROOT, "public/assets/runner3d", spec["dir"], name + ".glb")
        _export(path)
        bpy.context.view_layer.update()
        report[name] = {
            "tris": tris, "textures": texs,
            "size": [round(v, 2) for v in ob.dimensions],
            "kb": round(os.path.getsize(path) / 1024, 1),
        }
        if atlas:
            report[name]["atlas"] = atlas
        if door:
            # **이 숫자를 게임에 옮겨 적어야 한다** — `runner3d/portal.js`의 `DOOR`.
            # 문은 여기서 빠졌고, 그 자리에 셰이더 판이 선다.
            report[name]["door"] = door
        if cut:
            report[name]["cut_faces"] = cut
    return report
