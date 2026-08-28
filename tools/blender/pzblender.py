# 플레이 제라 — 블렌더 공용 도구
#
# ── 왜 손으로 안 만들고 코드로 만드나 ★ ─────────────────────
#
# 이 게임의 에셋은 **예산에 묶여 있다**(`docs/10` §4) — 오브젝트당 500~1500
# 삼각형, 재질 하나, 실시간 조명 0개. 손으로 만들면 그 예산을 매번 눈으로
# 지켜야 하고, "야자수를 조금 더 어둡게" 같은 요청이 오면 처음부터 다시 한다.
#
# 코드로 두면 색·크기·개수가 **한 줄**이고, 저장소에 남아 언제든 다시 뽑힌다.
# 그림 파일이 아니라 **그림을 만드는 방법**이 저장소에 있는 것이다.
#
# ── 조명을 굽는다 ───────────────────────────────────────────
#
# 게임에는 실시간 조명이 없다(`MeshBasicMaterial`). 그래서 밝기를 **정점 색에
# 미리 넣는다.** 해가 위에 있다는 것만 말해 주면 저폴리는 충분히 입체로 보인다.
#
# 바닥에 가까울수록 조금 어둡게도 한다. 그림자를 못 그리니 이것이 유일한
# "붙어 있다"는 신호다 — `CLAUDE.md`: 오브젝트는 바닥에 붙어 있어야 한다.
#
# ── 좌표 ────────────────────────────────────────────────────
#
# 블렌더는 Z-up, three는 Y-up이다. glTF 내보내기가 `(x, y, z) → (x, z, -y)`로
# 바꿔 준다. 그래서 **블렌더에서 -Y를 보게 만들면 게임에서 카메라를 본다.**
# 원점은 발밑(z = 0)에 둔다 — 안 그러면 프롭이 땅에 박히거나 뜬다.

import bpy
import bmesh
import math
import os
import random
from mathutils import Vector

OUT_ROOT = "/Users/ken.choi/Documents/playzera.dev/public/assets/runner3d"

# 해의 방향(블렌더 Z-up). 게임의 `bakeShade`와 같은 뜻 — 위가 밝다.
SUN = Vector((0.35, -0.5, 1.0)).normalized()


# ── 색 ──────────────────────────────────────────────────────

def _s2l(c):
    """sRGB → 리니어. glTF의 COLOR_0은 리니어이고 three도 그렇게 읽는다."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def rgb(hexstr):
    h = hexstr.lstrip("#")
    return tuple(_s2l(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4))


# ── 씬 ──────────────────────────────────────────────────────

def reset():
    """빈 씬으로 되돌린다. 스크립트를 여러 번 돌려도 같은 결과가 나오게."""
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images):
        for b in list(coll):
            if b.users == 0:
                coll.remove(b)


def mesh(name, verts, faces):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    me.validate()
    me.update()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


# ── 밝기 굽기 ───────────────────────────────────────────────

def shade(ob, color, lo=0.62, hi=1.18, ground=0.0, ground_k=0.45, jitter=0.0):
    """
    면 법선으로 밝기를 정점 색에 굽는다. **CORNER 도메인**이라 면마다 딱 끊긴다 —
    저폴리는 면이 갈라져 보여야 형태가 읽힌다.

    ground : 이 높이(로컬 z) 아래를 어둡게 한다. 0이면 안 한다
    jitter : 면마다 밝기를 살짝 흔든다. 같은 색 덩어리가 평평해 보이는 걸 막는다
    """
    me = ob.data
    me.calc_loop_triangles()
    attr = me.color_attributes.get("Col")
    if attr is None:
        attr = me.color_attributes.new(name="Col", type="FLOAT_COLOR", domain="CORNER")
    me.color_attributes.active_color = attr

    r, g, b = color
    rnd = random.Random(hash(ob.name) & 0xFFFF)
    for poly in me.polygons:
        n = poly.normal
        k = lo + (hi - lo) * (n.dot(SUN) * 0.5 + 0.5)
        if jitter:
            k *= 1.0 + (rnd.random() - 0.5) * jitter
        for li in poly.loop_indices:
            z = me.vertices[me.loops[li].vertex_index].co.z
            # 바닥에 가까울수록 어둡게 — 그림자가 없으니 이게 유일한 접지 신호다
            kk = k
            if ground > 0 and z < ground:
                kk *= 1.0 - ground_k * (1.0 - max(0.0, z) / ground)
            attr.data[li].color = (r * kk, g * kk, b * kk, 1.0)
    return ob


# ── 만들기 도구 ─────────────────────────────────────────────

def tube(name, rings, sides=6, twist=0.0):
    """
    `rings` = [(z, 반지름, x오프셋, y오프셋), ...] 을 이어 붙인 관. 줄기·기둥에 쓴다.
    맨 아래와 맨 위는 막는다 — 안 막으면 안쪽이 비쳐 구멍으로 보인다.
    """
    verts, faces = [], []
    n = len(rings)
    for i, (z, rad, ox, oy) in enumerate(rings):
        a0 = twist * i
        for s in range(sides):
            a = a0 + 2 * math.pi * s / sides
            verts.append((ox + math.cos(a) * rad, oy + math.sin(a) * rad, z))
    for i in range(n - 1):
        for s in range(sides):
            a = i * sides + s
            b = i * sides + (s + 1) % sides
            faces.append([a, b, b + sides, a + sides])
    bot = len(verts); verts.append((rings[0][2], rings[0][3], rings[0][0]))
    top = len(verts); verts.append((rings[-1][2], rings[-1][3], rings[-1][0]))
    for s in range(sides):
        faces.append([bot, (s + 1) % sides, s])
        faces.append([top, (n - 1) * sides + s, (n - 1) * sides + (s + 1) % sides])
    return mesh(name, verts, faces)


def blob(name, r=1.0, sides=6, rows=4, squash=(1.0, 1.0, 1.0), seed=0, rough=0.0):
    """저폴리 덩어리. 돌·코코넛·알에 쓴다. `rough`를 주면 바위처럼 울퉁불퉁해진다."""
    rnd = random.Random(seed)
    verts, faces = [], []
    for j in range(1, rows):
        phi = math.pi * j / rows
        for s in range(sides):
            th = 2 * math.pi * s / sides
            k = 1.0 + (rnd.random() - 0.5) * rough
            verts.append((
                math.sin(phi) * math.cos(th) * r * squash[0] * k,
                math.sin(phi) * math.sin(th) * r * squash[1] * k,
                math.cos(phi) * r * squash[2] * k,
            ))
    top = len(verts); verts.append((0, 0, r * squash[2]))
    bot = len(verts); verts.append((0, 0, -r * squash[2]))
    for j in range(rows - 2):
        for s in range(sides):
            a = j * sides + s
            b = j * sides + (s + 1) % sides
            faces.append([a, b, b + sides, a + sides])
    for s in range(sides):
        faces.append([top, (s + 1) % sides, s])
        last = (rows - 2) * sides
        faces.append([bot, last + s, last + (s + 1) % sides])
    return mesh(name, verts, faces)


def leaf(name, length=3.0, width=0.6, segs=7, rise=0.30, droop=0.95,
         crease=0.20, sweep=0.0, notch=0.0):
    """
    잎 한 장 — 가운데가 접힌 띠(V자).

    ── 왜 이 모양이어야 하나 ★ ──────────────────────────────
    첫 판은 곧게 뻗은 판이었는데 **글라이더 날개**처럼 보였다. 야자수를 야자수로
    읽게 하는 건 색도 개수도 아니고 **솟았다가 처지는 곡선**이다. 그래서
    높이를 `rise·sin` − `droop·t²`로 준다 — 앞은 올라가고 뒤는 급히 떨어진다.

    평평한 판으로 두면 옆에서 볼 때 사라진다. 가운데를 접어(`crease`) 어느
    각도에서도 두께가 보이게 한다.

    `notch` : 마디마다 폭을 줄여 **톱니 실루엣**을 만든다. 잎맥을 그리는 것보다
              훨씬 싸고, 멀리서는 이쪽이 더 야자수처럼 보인다.
    `sweep` : 옆으로 휘는 정도. 전부 0이면 잎이 방사형으로만 뻗어 바람개비가 된다.
    """
    verts, faces = [], []
    for i in range(segs + 1):
        t = i / segs
        x = length * t
        z = length * (rise * math.sin(math.pi * t * 0.62) - droop * t * t * 0.5)
        y0 = sweep * length * t * t
        # 폭 — 밑동은 좁고 1/5 지점이 가장 넓고 끝은 뾰족하다
        prof = (0.5 + 2.5 * t) if t < 0.2 else (1 - ((t - 0.2) / 0.8) ** 1.6)
        w = width * max(prof, 0.02)
        if notch and i % 2:
            w *= 1 - notch
        c = crease * (1 - t * 0.7)
        base = len(verts)
        verts += [(x, y0 - w, z), (x, y0, z + c), (x, y0 + w, z)]
        if i > 0:
            p = base - 3
            faces.append([p, p + 1, base + 1, base])
            faces.append([p + 1, p + 2, base + 2, base + 1])
    return mesh(name, verts, faces)


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=1.0):
    ob.location = loc
    ob.rotation_euler = rot
    ob.scale = (scale, scale, scale) if isinstance(scale, (int, float)) else scale
    return ob


# ── 내보내기 ────────────────────────────────────────────────

def export(objs, name, subdir="props"):
    """
    하나로 합쳐 삼각형으로 만들고 GLB로 내보낸다.

    **하나로 합치는 이유**: 게임은 이 모델을 `InstancedMesh`로 수십 개 뿌린다.
    부품이 나뉘어 있으면 draw call이 부품 수만큼 늘어난다(예산 20개).
    """
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name

    # 스케일·회전을 메시에 굳힌다. 안 하면 인스턴싱에서 변환이 두 번 먹는다
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)

    me = ob.data
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    bm.to_mesh(me); bm.free()
    me.update()

    path = os.path.join(OUT_ROOT, subdir, name + ".glb")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_normals=True,
        export_materials="NONE",          # 게임이 자기 재질(곡률 셰이더)을 씌운다
        export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
        export_cameras=False, export_lights=False, export_animations=False,
    )
    return {
        "name": name,
        "path": path,
        "tris": len(me.loop_triangles) if me.loop_triangles else len(me.polygons),
        "verts": len(me.vertices),
        "kb": round(os.path.getsize(path) / 1024, 1),
        "size": [round(v, 2) for v in ob.dimensions],
    }


def export_parts(groups, name, subdir="props"):
    """
    **부위를 나눠** 한 GLB에 담는다. 공룡처럼 움직여야 하는 것에 쓴다.

    `groups` = [(부위이름, [오브젝트], 붙는자리, 회전), ...]

    부위마다 따로 합치고 **원점을 (0,0,0)에 둔 채** 노드 위치만 붙는 자리로 준다.
    그래야 게임에서 `head.rotation`을 흔들 때 **목이 붙은 자리를 축으로** 돈다 —
    원점이 딴 데 있으면 머리가 통째로 궤도를 돈다.

    뼈대를 안 쓰는 이유는 `make_props.py` 첫 주석에 있다.
    """
    made = []
    for part, objs, at, rot in groups:
        for o in bpy.context.selected_objects:
            o.select_set(False)
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        if len(objs) > 1:
            bpy.ops.object.join()
        ob = bpy.context.view_layer.objects.active
        ob.name = part
        ob.rotation_euler = rot
        # 회전만 굽는다. 위치는 노드로 남겨야 게임이 축을 알 수 있다
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        ob.location = at

        me = ob.data
        bm = bmesh.new(); bm.from_mesh(me)
        bmesh.ops.triangulate(bm, faces=bm.faces[:])
        bm.to_mesh(me); bm.free()
        me.update()
        made.append(ob)

    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in made:
        o.select_set(True)
    bpy.context.view_layer.objects.active = made[0]

    path = os.path.join(OUT_ROOT, subdir, name + ".glb")
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path, export_format="GLB", use_selection=True,
        export_yup=True, export_apply=True, export_normals=True,
        export_materials="NONE", export_vertex_color="ACTIVE",
        export_active_vertex_color_when_no_material=True,
        export_cameras=False, export_lights=False, export_animations=False,
    )
    tris = 0
    for o in made:
        o.data.calc_loop_triangles()
        tris += len(o.data.loop_triangles)
    return {
        "name": name, "path": path, "tris": tris,
        "parts": {o.name: [round(v, 3) for v in o.location] for o in made},
        "kb": round(os.path.getsize(path) / 1024, 1),
    }


# ── 미리보기 ────────────────────────────────────────────────

def preview(path, objs=None, size=(720, 720), bg="#7ec8f0", cam=(4.2, -7.0, 3.0),
            look=(0, 0, 1.6), ortho=None):
    """
    **게임에서 보일 그대로** 렌더한다 — 정점 색을 발광으로 직접 내보내고
    조명을 안 쓴다. 블렌더 조명으로 예쁘게 찍으면 게임 화면과 다른 것을 보게 된다.
    """
    mat = bpy.data.materials.get("pz_preview")
    if mat is None:
        mat = bpy.data.materials.new("pz_preview")
        mat.use_nodes = True
        nt = mat.node_tree
        for n in list(nt.nodes):
            nt.nodes.remove(n)
        attr = nt.nodes.new("ShaderNodeVertexColor"); attr.layer_name = "Col"
        emi = nt.nodes.new("ShaderNodeEmission")
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        nt.links.new(attr.outputs["Color"], emi.inputs["Color"])
        nt.links.new(emi.outputs["Emission"], out.inputs["Surface"])
    for ob in (objs or [o for o in bpy.data.objects if o.type == "MESH"]):
        ob.data.materials.clear()
        ob.data.materials.append(mat)

    scn = bpy.context.scene
    scn.render.engine = "BLENDER_EEVEE_NEXT" if "BLENDER_EEVEE_NEXT" in \
        [i.identifier for i in scn.bl_rna.properties["render"].fixed_type
         .properties["engine"].enum_items] else "BLENDER_EEVEE"
    scn.render.film_transparent = False
    scn.world = scn.world or bpy.data.worlds.new("W")
    scn.world.use_nodes = True
    scn.world.node_tree.nodes["Background"].inputs[0].default_value = (*rgb(bg), 1)
    scn.render.resolution_x, scn.render.resolution_y = size
    scn.render.image_settings.file_format = "PNG"

    camd = bpy.data.cameras.new("pz_cam")
    if ortho:
        camd.type = "ORTHO"; camd.ortho_scale = ortho
    camob = bpy.data.objects.new("pz_cam", camd)
    bpy.context.collection.objects.link(camob)
    camob.location = cam
    d = Vector(look) - Vector(cam)
    camob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    scn.camera = camob

    os.makedirs(os.path.dirname(path), exist_ok=True)
    scn.render.filepath = path
    bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camob)
    return path
