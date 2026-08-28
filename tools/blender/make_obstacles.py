# 트랙 장애물 — 알 받침대 · 허들 · 관문 둘 · 자세 팻말 셋
#
# ── 크기는 코드가 정한다 ★ ─────────────────────────────────
#
# 이 파일의 숫자는 `src/games/runner3d/obstacles3d.js`의 `KINDS`에서 왔다.
# 반대로 하면 안 된다 — 장애물 폭·높이는 **판정의 일부**다. 뛰어넘을 수 있는
# 높이, 숙여서 지나갈 수 있는 틈, 한 레인을 막는 폭이 게임 규칙이기 때문이다.
# 그림이 규칙을 바꾸면 아이가 화면을 보고 판단한 것과 판정이 어긋난다.
#
#   cube        폭 4.0  높이 2.6   레인 하나를 막는다 — **피한다**
#   hurdleLow   폭 14.2 높이 0.9   낮고 넓다 — **뛰어넘는다**
#   hurdleWide  폭 14.2 틈 3.4     위에 걸려 있다 — **숙인다**
#   poseSign    폭 2.6  높이 2.6   자세를 잡는다
#   archGate    폭 15.0 틈 5.2     그냥 지나간다 (결승)
#
# 원점은 **바닥(z=0)**이다. 그래서 `obstacles3d.js`의 `y`(상자 중심 높이)는
# GLB를 쓸 때 0이 된다 — 그 처리도 그쪽에 있다.

import sys
sys.path.insert(0, "/Users/ken.choi/Documents/playzera.dev/tools/blender")

import math
import random
import importlib
import pzblender as pz
importlib.reload(pz)

LANE_W = 5.0
TRACK_W = LANE_W * 3

C = {
    "stone":   pz.rgb("#cda86f"),
    "stone_d": pz.rgb("#94764b"),
    "jade":    pz.rgb("#17a294"),
    "wood":    pz.rgb("#9c6334"),
    "wood_d":  pz.rgb("#7a4a24"),
    "gold":    pz.rgb("#ffc32e"),
    "star":    pz.rgb("#ffd23e"),
    "leaf":    pz.rgb("#3fa32a"),
    "leaf_d":  pz.rgb("#2f7d20"),
    "vine":    pz.rgb("#4fb32e"),
    "tooth":   pz.rgb("#f5eddb"),
    "egg":     pz.rgb("#eddcb4"),
    "spot":    pz.rgb("#f2762e"),
    "spot_g":  pz.rgb("#7cc242"),
    "board":   pz.rgb("#ffc82e"),
    "ink":     pz.rgb("#16120e"),
    "moss":    pz.rgb("#6fbf3c"),
}


def box(name, w, h, d, color, at=(0, 0, 0), rot=(0, 0, 0), **sh):
    """네모 블록. 관문의 벽돌은 전부 이걸로 쌓는다."""
    hx, hy, hz = w / 2, d / 2, h / 2
    v = [(-hx, -hy, -hz), (hx, -hy, -hz), (hx, hy, -hz), (-hx, hy, -hz),
         (-hx, -hy, hz), (hx, -hy, hz), (hx, hy, hz), (-hx, hy, hz)]
    f = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [0, 4, 7, 3]]
    ob = pz.mesh(name, v, f)
    pz.place(ob, loc=at, rot=rot)
    pz.shade(ob, color, **sh)
    return ob


def star(name, r, color, at, rot=(0, 0, 0)):
    """오각별. 관문 꼭대기의 표식 — 이 세계의 물건이라는 표시다."""
    v, f = [], []
    for i in range(10):
        a = math.pi / 2 + i * math.pi / 5
        rr = r if i % 2 == 0 else r * 0.46
        v.append((math.cos(a) * rr, -r * 0.16, math.sin(a) * rr))
        v.append((math.cos(a) * rr, r * 0.16, math.sin(a) * rr))
    cf = len(v); v.append((0, -r * 0.16, 0))
    cb = len(v); v.append((0, r * 0.16, 0))
    for i in range(10):
        a, b = i * 2, ((i + 1) % 10) * 2
        f.append([cf, b, a])
        f.append([cb, a + 1, b + 1])
        f.append([a, b, b + 1, a + 1])
    ob = pz.mesh(name, v, f)
    pz.place(ob, loc=at, rot=rot)
    pz.shade(ob, color, lo=0.85, hi=1.25)
    return ob


def vines(parts, tag, at, n=4, length=0.8, seed=0):
    """덩굴 잎. 돌기둥에 붙어야 정글의 유적으로 읽힌다."""
    rnd = random.Random(seed)
    for i in range(n):
        a = rnd.uniform(0, 6.28)
        lf = pz.leaf(f"{tag}_v{i}", length=length * rnd.uniform(0.7, 1.3), width=0.20,
                     segs=3, rise=0.4, droop=0.9, crease=0.06)
        pz.place(lf, loc=(at[0] + rnd.uniform(-0.3, 0.3), at[1] - 0.28,
                          at[2] + rnd.uniform(-0.5, 0.5)),
                 rot=(0, rnd.uniform(-0.5, 0.5), a))
        pz.shade(lf, C["leaf"] if i % 2 else C["leaf_d"], lo=0.6, hi=1.28)
        parts.append(lf)


# ── ① 알 받침대 — 한 레인을 막는다 (cube) ──────────────────

def egg_block():
    pz.reset()
    P = []
    W, H = LANE_W * 0.8, 3.0

    # 받침 — 모자이크 단을 **두 층으로 쌓는다.** 첫 판은 납작한 판 하나여서
    # 알이 그 위에 **떠 있는 것**처럼 보였다. 단이 알을 물고 있어야 한 물건이다.
    P.append(box("base0", W, 0.46, 1.45, C["stone_d"], at=(0, 0, 0.23)))
    for i in range(5):
        x = -W / 2 + W * (i + 0.5) / 5
        P.append(box(f"tile{i}", W / 5 * 0.88, 0.34, 1.25, C["jade"] if i % 2 else C["gold"],
                     at=(x, 0, 0.63)))
    P.append(box("base1", W * 0.72, 0.40, 1.15, C["stone"], at=(0, 0, 1.00)))
    P.append(box("ring", 1.10, 0.40, 0.30, C["gold"], at=(0, -0.62, 0.63)))
    P.append(box("ring_in", 0.58, 0.42, 0.26, C["jade"], at=(0, -0.68, 0.63)))

    egg = pz.blob("egg", r=1.05, sides=8, rows=6, squash=(0.82, 0.70, 1.16), seed=1)
    # 밑동을 단에 **묻는다.** 딱 얹으면 접점이 한 점이라 떠 보인다
    pz.place(egg, loc=(0, 0, 1.14 + 1.05 * 1.16 * 0.74))
    pz.shade(egg, C["egg"], lo=0.58, hi=1.30)
    P.append(egg)

    # 점무늬 — **알의 실제 반지름**을 써야 표면에 붙는다. 첫 판은 구의 반지름을
    # 그대로 써서 눌린 알 **속에** 파묻혔다(그래서 흰 알로만 보였다).
    rnd = random.Random(5)
    ER, EZ = 1.05, 2.04
    rx, ry = ER * 0.82, ER * 0.70
    for j in range(8):
        a = rnd.uniform(0, 6.28)
        h = rnd.uniform(-0.45, 0.55)
        k = math.sqrt(max(0.05, 1 - h * h))          # 높이에 따라 둘레가 준다
        sp = pz.blob(f"sp{j}", r=0.30, sides=6, rows=3, squash=(1, 1, 0.10),
                     seed=100 + j)
        nx, ny = math.cos(a), math.sin(a)
        pz.place(sp, loc=(nx * rx * k * 0.99, ny * ry * k * 0.99,
                          EZ + h * ER * 1.16 * 0.99),
                 rot=(math.pi / 2 - h * 1.1, 0, a + math.pi / 2))
        pz.shade(sp, C["spot"] if j % 2 else C["spot_g"], lo=0.72, hi=1.3)
        P.append(sp)

    vines(P, "eb", (0, 0, 1.25), n=6, length=0.8, seed=2)
    for i, x in enumerate([-W / 2 - 0.1, W / 2 + 0.1]):
        rk = pz.blob(f"rk{i}", r=0.42, sides=6, rows=3, squash=(1, 1, 0.6), seed=8 + i, rough=0.3)
        pz.place(rk, loc=(x, 0, 0.26))
        pz.shade(rk, C["stone"], ground=0.4, ground_k=0.4)
        P.append(rk)
    return P


# ── ② 관문 — 기둥 둘 + 가로대 ──────────────────────────────
#
# 낮은 것(`hurdleWide`, 틈 3.4)과 높은 것(`archGate`, 틈 5.2)이 **같은 함수**에서
# 나온다. 크기만 다르고 세계의 물건으로는 같은 것이어야 한다.

def gate(gap, name_tag, post_w=1.5):
    P = []
    span = TRACK_W
    top = gap + 0.55
    for s in (-1, 1):
        x = s * (span / 2 + post_w / 2 - 0.2)
        # 벽돌을 쌓는다. 한 덩어리로 두면 유적이 아니라 기둥이다
        n = max(3, int(top / 0.9))
        for i in range(n):
            h = top / n
            col = C["stone"] if (i + (s > 0)) % 2 else C["jade"]
            P.append(box(f"{name_tag}_p{s}_{i}", post_w * (1.14 if i == 0 else 1.0), h * 0.94,
                         post_w * (1.14 if i == 0 else 1.0), col, at=(x, 0, h * (i + 0.5))))
        # 발자국 표식
        P.append(box(f"{name_tag}_m{s}", post_w * 0.62, 0.62, 0.16, C["gold"],
                     at=(x, -post_w * 0.56, top * 0.55)))
        # 어금니 — 컨셉아트에서 이 세계를 알려 주는 조각
        for k, dx in enumerate((-0.42, 0.42)):
            P.append(box(f"{name_tag}_t{s}{k}", 0.16, 0.42, 0.16, C["tooth"],
                         at=(x + dx, -post_w * 0.52, top + 0.05)))
        P.append(star(f"{name_tag}_st{s}", 0.46, C["star"], (x, -0.1, top + 0.62)))
        vines(P, f"{name_tag}_v{s}", (x, 0, top * 0.6), n=5, length=0.9, seed=int(s) + 3)

    # 가로대 — 통나무와 옥돌을 번갈아
    bar_h = 0.55
    seg = 5
    for i in range(seg):
        w = span / seg
        P.append(box(f"{name_tag}_bar{i}", w * 0.98, bar_h, 0.62,
                     C["wood"] if i % 2 else C["jade"],
                     at=(-span / 2 + w * (i + 0.5), 0, gap + bar_h / 2)))
    P.append(box(f"{name_tag}_baru", span * 0.98, 0.12, 0.7, C["gold"],
                 at=(0, 0, gap + bar_h + 0.06)))
    return P


def gate_wide():
    pz.reset()
    return gate(3.4, "gw", post_w=1.9)


def gate_arch():
    pz.reset()
    return gate(5.2, "ga", post_w=2.1)


# ── ③ 허들 — 뛰어넘는다 ────────────────────────────────────

def hurdle_low():
    pz.reset()
    P = []
    span = TRACK_W * 0.95
    for s in (-1, 1):
        x = s * (span / 2 - 0.3)
        P.append(box(f"hl_p{s}", 0.7, 0.95, 0.7, C["stone"], at=(x, 0, 0.47)))
        P.append(box(f"hl_c{s}", 0.86, 0.16, 0.86, C["jade"], at=(x, 0, 0.98)))
    seg = 7
    for i in range(seg):
        w = span / seg
        P.append(box(f"hl_bar{i}", w * 0.98, 0.42, 0.5,
                     C["wood"] if i % 2 else C["wood_d"],
                     at=(-span / 2 + w * (i + 0.5), 0, 0.72)))
    P.append(box("hl_top", span * 0.99, 0.10, 0.56, C["gold"], at=(0, 0, 0.96)))
    vines(P, "hl", (0, 0, 0.5), n=4, length=0.55, seed=6)
    return P


# ── ④ 자세 팻말 ────────────────────────────────────────────
#
# **사람 그림이 이 물건의 전부다.** 아이는 팻말을 보고 무엇을 할지 안다.
# 그래서 자세마다 따로 만든다 — 하나로 두면 "뭔가 하라는 것"까지만 전해진다.

def _limb(parts, tag, i, a, b, r=0.11):
    """두 점을 잇는 막대. 팔·다리·몸통을 이걸로만 그린다."""
    ax, az = a
    bx, bz = b
    dx, dz = bx - ax, bz - az
    ln = math.hypot(dx, dz)
    ob = pz.tube(f"{tag}_l{i}", [(0, r, 0, 0), (ln, r, 0, 0)], sides=4)
    pz.place(ob, loc=(ax, -0.20, az), rot=(0, math.pi / 2 - math.atan2(dz, dx), 0))
    pz.shade(ob, C["ink"], lo=1.0, hi=1.0)
    parts.append(ob)


FIGURES = {
    # (머리 자리, [(from, to), ...])
    "armsopen": ((0, 0.62), [((0, 0.44), (0, -0.06)), ((0, 0.34), (-0.52, 0.52)),
                             ((0, 0.34), (0.52, 0.52)), ((0, -0.06), (-0.36, -0.60)),
                             ((0, -0.06), (0.36, -0.60))]),
    "forwardbend": ((-0.30, 0.58), [((-0.26, 0.42), (0.16, -0.10)),
                                    ((-0.20, 0.36), (0.34, 0.46)),
                                    ((-0.20, 0.36), (-0.44, 0.06)),
                                    ((0.16, -0.10), (0.10, -0.62)),
                                    ((0.16, -0.10), (0.46, -0.58))]),
    "lunge": ((0.10, 0.60), [((0.08, 0.44), (0.04, -0.04)), ((0.04, 0.30), (-0.30, 0.18)),
                             ((0.04, 0.30), (0.36, 0.10)), ((0.04, -0.04), (-0.50, -0.58)),
                             ((0.04, -0.04), (0.42, -0.34)), ((0.42, -0.34), (0.42, -0.62))]),
}


def pose_sign(pose):
    pz.reset()
    P = []
    W, H = 2.6, 1.55
    Z = 2.05                       # 판의 가운데 높이

    for s in (-1, 1):
        x = s * (W / 2 + 0.36)
        for i in range(3):
            P.append(box(f"ps_p{s}{i}", 0.62, 1.05, 0.62,
                         C["stone"] if i % 2 else C["stone_d"], at=(x, 0, 0.52 + i * 1.02)))
        P.append(box(f"ps_m{s}", 0.42, 0.42, 0.14, C["gold"], at=(x, -0.34, 1.95)))
        P.append(star(f"ps_st{s}", 0.34, C["star"], (x, -0.08, 3.32)))
        vines(P, f"ps_v{s}", (x, 0, 1.6), n=3, length=0.6, seed=int(s) + 9)

    P.append(box("ps_frame", W + 0.5, H + 0.42, 0.34, C["wood"], at=(0, 0, Z)))
    P.append(box("ps_board", W, H, 0.30, C["board"], at=(0, -0.08, Z)))
    P.append(box("ps_beam", W + 1.5, 0.32, 0.36, C["wood_d"], at=(0, 0, Z + H / 2 + 0.34)))

    head, limbs = FIGURES[pose]
    hd = pz.blob(f"ps_head", r=0.16, sides=6, rows=4, squash=(1, 0.55, 1), seed=1)
    pz.place(hd, loc=(head[0], -0.20, Z + head[1] * 0.62))
    pz.shade(hd, C["ink"], lo=1.0, hi=1.0)
    P.append(hd)
    for i, (a, b) in enumerate(limbs):
        _limb(P, "ps", i, (a[0], Z + a[1] * 0.62), (b[0], Z + b[1] * 0.62))
    return P


RESULT = {
    "egg_block": pz.export(egg_block(), "egg_block", subdir="obstacles"),
    "hurdle_low": pz.export(hurdle_low(), "hurdle_low", subdir="obstacles"),
    "gate_wide": pz.export(gate_wide(), "gate_wide", subdir="obstacles"),
    "gate_arch": pz.export(gate_arch(), "gate_arch", subdir="obstacles"),
    **{f"sign_{p}": pz.export(pose_sign(p), f"sign_{p}", subdir="obstacles")
       for p in FIGURES},
}
