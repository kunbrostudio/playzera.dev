# 좌우 배경 오브젝트 — 화석 바위 · 알 둥지 · 아기 공룡 둘
#
# 야자수(`make_palm.py`)에서 정한 규격을 그대로 따른다.
#   · 원점은 발밑(z = 0)      · 밝기는 정점 색에 굽는다
#   · 부품은 하나로 합친다     · 500~1500 삼각형
#
# ── 공룡만 다르다 ★ ────────────────────────────────────────
#
# 공룡은 **머리와 꼬리를 따로 내보낸다.** 뼈대를 심어 GLB에 애니메이션을 담는
# 방법도 있지만, 그러면 파일이 무거워지고 스키닝 계산이 붙는다 — 우리는 이미
# MediaPipe와 GPU를 나눠 쓴다(`docs/10` §4).
#
# 부위를 나눠 두면 게임 코드가 `mesh.rotation`만 흔들면 된다. 공짜이고,
# 흔드는 속도를 코드에서 바로 고칠 수 있다.

import sys
sys.path.insert(0, "/Users/ken.choi/Documents/playzera.dev/tools/blender")

import math
import random
import importlib
import pzblender as pz
importlib.reload(pz)

C = {
    "rock":     pz.rgb("#b0a08c"),
    "rock_dk":  pz.rgb("#8d7f6d"),
    "bone":     pz.rgb("#efe3c4"),
    "moss":     pz.rgb("#6fbf3c"),
    "leaf":     pz.rgb("#3fa32a"),
    "leaf_dk":  pz.rgb("#2f7d20"),
    "trunk":    pz.rgb("#c07a3e"),
    "flower_r": pz.rgb("#e8452c"),
    "flower_y": pz.rgb("#ffc02e"),
    "straw":    pz.rgb("#d8a856"),
    "egg":      pz.rgb("#f2e6c8"),
    "spot_g":   pz.rgb("#7cc242"),
    "spot_o":   pz.rgb("#f2762e"),
    "spot_r":   pz.rgb("#ef8b6e"),
    "brach":    pz.rgb("#8a63d6"),
    "brach_lo": pz.rgb("#cbb8ee"),
    "brach_sp": pz.rgb("#f2865a"),
    "trex":     pz.rgb("#ef5a24"),
    "trex_lo":  pz.rgb("#f5b02c"),
    "claw":     pz.rgb("#f3ead4"),
    "eye":      pz.rgb("#2a1a12"),
    "eye_w":    pz.rgb("#ffffff"),
}


def mound(parts, tag, spots, color=None, ground_k=0.42, rough=0.36, seed=0):
    """돌 받침. `spots` = [(x, y, 반지름), ...]. 어느 오브젝트든 밑동에 깐다."""
    rnd = random.Random(seed)
    for i, (dx, dy, r) in enumerate(spots):
        rk = pz.blob(f"{tag}_rk{i}", r=r, sides=6, rows=3,
                     squash=(1.0, 1.0, 0.56), seed=seed * 20 + i, rough=rough)
        pz.place(rk, loc=(dx, dy, r * 0.24), rot=(0, 0, rnd.uniform(0, 3.1)))
        pz.shade(rk, color or C["rock"], ground=r * 0.8, ground_k=ground_k, jitter=0.16)
        parts.append(rk)


def tufts(parts, tag, n, radius, color=None, length=0.62, seed=0, z=0.10):
    """풀 다발. 밑동을 덮어 **땅에 심어진 것**으로 보이게 한다."""
    rnd = random.Random(seed + 77)
    for i in range(n):
        a = 2 * math.pi * i / n + rnd.uniform(-0.3, 0.3)
        d = radius * rnd.uniform(0.8, 1.2)
        t = pz.leaf(f"{tag}_tf{i}", length=length * rnd.uniform(0.8, 1.25),
                    width=0.12, segs=3, rise=0.5, droop=0.9, crease=0.05)
        pz.place(t, loc=(math.cos(a) * d, math.sin(a) * d, z),
                 rot=(0, -0.95 + rnd.uniform(-0.3, 0.3), a))
        pz.shade(t, color or C["moss"], lo=0.6, hi=1.25)
        parts.append(t)


# ── ① 화석 바위 ────────────────────────────────────────────
#
# 컨셉아트에서 가져오는 것: 둥근 바위 덩어리 · **박혀 있는 티라노 뼈** ·
# 이끼가 흘러내린 윗면 · 옆의 야자수 · 발치의 꽃.
#
# 뼈는 갈비뼈 하나하나를 만들지 않는다. **두개골 + 등뼈 + 갈비 몇 대**면
# 25유닛 뒤에서 "화석"으로 읽힌다. 나머지는 예산 낭비다.

def fossil_rock():
    pz.reset()
    P = []
    rnd = random.Random(21)

    # 넓고 낮게. 첫 판은 공처럼 둥글어 **뼈를 보여 줄 앞면이 없었다**
    body = pz.blob("rockbody", r=1.95, sides=9, rows=5,
                   squash=(1.15, 0.78, 0.76), seed=1, rough=0.18)
    pz.place(body, loc=(0, 0.15, 1.30))
    pz.shade(body, C["rock"], lo=0.55, hi=1.24, ground=2.0, ground_k=0.30, jitter=0.10)
    P.append(body)

    # 이끼 — 윗면에만 얹는다. 바위를 통째로 초록으로 칠하면 돌이 아니다.
    for i in range(6):
        a = 2 * math.pi * i / 6 + 0.3
        m = pz.blob(f"moss{i}", r=0.55 + rnd.random() * 0.3, sides=6, rows=3,
                    squash=(1.0, 1.0, 0.30), seed=30 + i, rough=0.4)
        pz.place(m, loc=(math.cos(a) * 1.25, 0.15 + math.sin(a) * 0.8, 2.52 + rnd.uniform(-0.18, 0.08)))
        pz.shade(m, C["moss"], lo=0.65, hi=1.3, jitter=0.16)
        P.append(m)

    # ── 뼈 ── 바위 앞면(-Y)에 얕게 박는다
    Y = -1.16
    skull = pz.blob("skull", r=0.62, sides=6, rows=4,
                    squash=(1.20, 0.36, 0.84), seed=5)
    pz.place(skull, loc=(0.86, Y, 1.72))
    pz.shade(skull, C["bone"], lo=0.7, hi=1.3)
    P.append(skull)

    jaw = pz.blob("jaw", r=0.30, sides=5, rows=3, squash=(1.5, 0.30, 0.34), seed=6)
    pz.place(jaw, loc=(0.74, Y - 0.05, 1.25), rot=(0, 0.16, 0))
    pz.shade(jaw, C["bone"], lo=0.65, hi=1.25)
    P.append(jaw)

    # 등뼈 — 구슬을 이어 붙인다. 관 하나로 하면 뱀처럼 매끈해진다
    for i in range(9):
        t = i / 8
        v = pz.blob(f"spine{i}", r=0.135 - 0.03 * t, sides=5, rows=3, seed=40 + i)
        pz.place(v, loc=(0.30 - 1.7 * t, Y - 0.03 + 0.22 * t * t, 1.86 + 0.30 * math.sin(t * 2.4)))
        pz.shade(v, C["bone"], lo=0.7, hi=1.3)
        P.append(v)

    # 갈비 — 다섯 대. 아래로 휜 얇은 관
    for i in range(5):
        t = i / 4
        rib = pz.tube(f"rib{i}", [(0, 0.055, 0, 0), (0.34, 0.05, 0.05, 0),
                                  (0.66, 0.04, 0.18, 0), (0.90, 0.032, 0.40, 0)], sides=4)
        pz.place(rib, loc=(0.10 - 1.05 * t, Y - 0.09, 1.80 + 0.14 * math.sin(t * 2.2)),
                 rot=(0, math.pi * 0.72, 0))
        pz.shade(rib, C["bone"], lo=0.65, hi=1.25)
        P.append(rib)

    # 앞다리 갈고리 — 화석을 화석으로 읽게 하는 마지막 한 조각
    for i, (x, z) in enumerate([(0.44, 1.10), (0.20, 0.98)]):
        cl = pz.blob(f"claw{i}", r=0.10, sides=4, rows=3, squash=(1.9, 0.5, 0.6), seed=60 + i)
        pz.place(cl, loc=(x, Y - 0.07, z), rot=(0, 0.7, 0))
        pz.shade(cl, C["bone"])
        P.append(cl)

    # ── 옆의 야자수 ──
    rings = [(z, 0.20 * (1 - 0.5 * z / 2.6), 0.30 * (z / 2.6) ** 2, 0) for z in
             [0, 0.5, 1.0, 1.5, 2.0, 2.6]]
    tr = pz.tube("ptrunk", rings, sides=6)
    pz.place(tr, loc=(-2.35, 0.85, 0.4))
    pz.shade(tr, C["trunk"], ground=1.0, ground_k=0.3)
    P.append(tr)
    for i in range(5):
        a = 2 * math.pi * i / 5 + 0.4
        lf = pz.leaf(f"pleaf{i}", length=1.5, width=0.34, segs=5,
                     rise=0.34, droop=0.9, crease=0.14, notch=0.28,
                     sweep=rnd.uniform(-0.14, 0.14))
        pz.place(lf, loc=(-2.05, 0.85, 2.98), rot=(0, -0.40, a))
        pz.shade(lf, C["leaf"] if i % 2 else C["leaf_dk"], lo=0.52, hi=1.3, jitter=0.12)
        P.append(lf)

    mound(P, "fr", [(-1.9, -0.55, 0.64), (1.85, -0.45, 0.58), (0.6, 1.15, 0.52),
                    (-1.1, 1.1, 0.44), (1.4, 0.95, 0.38)], seed=3)
    tufts(P, "fr", 9, 1.75, seed=3)

    for i, (x, y, col) in enumerate([(-1.55, -1.15, C["flower_r"]), (1.55, -1.0, C["flower_y"])]):
        fl = pz.blob(f"fl{i}", r=0.20, sides=5, rows=3, squash=(1, 1, 0.48), seed=80 + i)
        pz.place(fl, loc=(x, y, 0.26))
        pz.shade(fl, col, lo=0.75, hi=1.3)
        P.append(fl)
    return P


# ── ② 알 둥지 ──────────────────────────────────────────────

def egg_nest():
    pz.reset()
    P = []
    rnd = random.Random(9)

    eggs = [(0.0, 0.10, 0.95, C["spot_o"]), (-1.02, 0.26, 0.66, C["spot_g"]),
            (0.96, -0.14, 0.58, C["spot_r"])]
    for i, (x, y, r, spot) in enumerate(eggs):
        e = pz.blob(f"egg{i}", r=r, sides=7, rows=5, squash=(0.82, 0.82, 1.12), seed=i)
        pz.place(e, loc=(x, y, r * 1.06))
        pz.shade(e, C["egg"], lo=0.6, hi=1.30)
        P.append(e)
        # 점무늬 — 텍스처가 없으니 **얕은 조각을 붙여** 만든다. 넷이면 충분하다
        for j in range(4):
            a = 2 * math.pi * j / 4 + rnd.uniform(-0.5, 0.5)
            h = rnd.uniform(-0.35, 0.55)
            sp = pz.blob(f"sp{i}_{j}", r=r * 0.34, sides=6, rows=3,
                         squash=(1, 1, 0.10), seed=100 + i * 9 + j)
            nx, ny = math.cos(a), math.sin(a)
            pz.place(sp, loc=(x + nx * r * 0.80, y + ny * r * 0.80, r * 1.06 + h * r),
                     rot=(math.pi / 2 - h * 0.8, 0, a + math.pi / 2))
            pz.shade(sp, spot, lo=0.7, hi=1.3)
            P.append(sp)

    # 지푸라기 — 알 사이로 삐져나온다. 없으면 알이 땅에 놓인 공이다
    for i in range(9):
        a = 2 * math.pi * i / 9 + rnd.uniform(-0.3, 0.3)
        st = pz.leaf(f"straw{i}", length=1.05, width=0.055, segs=3,
                     rise=0.5, droop=0.85, crease=0.03)
        pz.place(st, loc=(math.cos(a) * 0.62, math.sin(a) * 0.62, 0.28),
                 rot=(0, -0.75 + rnd.uniform(-0.35, 0.35), a))
        pz.shade(st, C["straw"], lo=0.65, hi=1.28)
        P.append(st)

    mound(P, "nest", [(-1.62, 0.42, 0.64), (1.60, 0.40, 0.58), (0.12, -1.32, 0.60),
                      (-0.95, -1.05, 0.46), (1.15, -0.92, 0.42), (0.0, 1.32, 0.48)], seed=4)
    tufts(P, "nest", 11, 1.62, seed=4, length=0.7)

    for i in range(4):
        a = 2 * math.pi * i / 4 + 0.9
        lf = pz.leaf(f"nleaf{i}", length=1.15, width=0.34, segs=5,
                     rise=0.55, droop=0.55, crease=0.14, notch=0.22)
        pz.place(lf, loc=(math.cos(a) * 1.75, math.sin(a) * 1.55, 0.26),
                 rot=(0, -1.05 + rnd.uniform(-0.15, 0.15), a))
        pz.shade(lf, C["leaf"] if i % 2 else C["leaf_dk"], lo=0.55, hi=1.3)
        P.append(lf)
    return P


# ── ③ 아기 공룡 ────────────────────────────────────────────
#
# **부위를 나눠 돌려준다.** 몸통은 하나로 합치고 머리·꼬리는 따로 남긴다.
# 게임에서 `mesh.rotation`만 흔들면 살아 있는 것처럼 보인다.

def _disc(parts, tag, r=1.15):
    """받침 원반. 공룡은 다리가 가늘어 그림자 없이는 반드시 떠 보인다."""
    d = pz.blob(f"{tag}_disc", r=r, sides=9, rows=3, squash=(1, 1, 0.14), seed=7)
    pz.place(d, loc=(0, 0, 0.07))
    pz.shade(d, C["moss"], lo=0.7, hi=1.15, jitter=0.08)
    parts.append(d)


def _legs(parts, tag, spots, color, r=0.19, h=0.5):
    for i, (x, y) in enumerate(spots):
        lg = pz.tube(f"{tag}_leg{i}", [(0, r * 1.15, 0, 0), (h * 0.5, r, 0, 0),
                                       (h, r * 1.1, 0, 0)], sides=5)
        pz.place(lg, loc=(x, y, 0.06))
        pz.shade(lg, color, ground=h * 0.6, ground_k=0.35)
        parts.append(lg)


def _eyes(parts, tag, spots, r=0.11):
    for i, (x, y, z) in enumerate(spots):
        w = pz.blob(f"{tag}_ew{i}", r=r, sides=5, rows=3, squash=(1, 0.6, 1.1), seed=90 + i)
        pz.place(w, loc=(x, y, z))
        pz.shade(w, C["eye_w"], lo=0.9, hi=1.1)
        parts.append(w)
        b = pz.blob(f"{tag}_eb{i}", r=r * 0.58, sides=5, rows=3, squash=(1, 0.6, 1.1), seed=95 + i)
        pz.place(b, loc=(x, y - r * 0.42, z))
        pz.shade(b, C["eye"], lo=1.0, hi=1.0)
        parts.append(b)


def brachio():
    """보라 브라키오 — 목이 길다. 목+머리가 흔드는 부위다."""
    pz.reset()
    body_parts, head_parts, tail_parts = [], [], []

    _disc(body_parts, "br")
    torso = pz.blob("br_torso", r=0.78, sides=7, rows=5,
                    squash=(0.92, 1.30, 0.86), seed=2)
    pz.place(torso, loc=(0, 0, 0.95))
    pz.shade(torso, C["brach"], lo=0.55, hi=1.26)
    body_parts.append(torso)

    belly = pz.blob("br_belly", r=0.60, sides=6, rows=4, squash=(0.86, 1.15, 0.62), seed=12)
    pz.place(belly, loc=(0, -0.06, 0.72))
    pz.shade(belly, C["brach_lo"], lo=0.6, hi=1.2)
    body_parts.append(belly)

    _legs(body_parts, "br", [(-0.42, 0.60), (0.42, 0.60), (-0.42, -0.62), (0.42, -0.62)],
          C["brach"], r=0.21, h=0.62)

    for i in range(5):
        s = pz.blob(f"br_spot{i}", r=0.20, sides=5, rows=3, squash=(1, 1, 0.3), seed=200 + i)
        a = 2.1 + i * 1.05
        pz.place(s, loc=(math.cos(a) * 0.66, math.sin(a) * 0.9, 1.12 + 0.16 * math.sin(i)),
                 rot=(math.pi / 2, 0, a + math.pi / 2))
        pz.shade(s, C["brach_sp"], lo=0.75, hi=1.25)
        body_parts.append(s)

    # ── 목 + 머리 (흔드는 부위) ──
    # 원점을 **목이 몸통에 붙는 자리**에 둔다. 안 그러면 흔들 때 목이 통째로 돈다.
    neck = pz.tube("br_neck", [(0, 0.32, 0, 0), (0.44, 0.27, 0, -0.10),
                               (0.88, 0.23, 0, -0.30), (1.26, 0.21, 0, -0.58)], sides=6)
    pz.shade(neck, C["brach"], lo=0.58, hi=1.24)
    head_parts.append(neck)
    head = pz.blob("br_head", r=0.36, sides=6, rows=4, squash=(0.86, 1.30, 0.86), seed=4)
    pz.place(head, loc=(0, -0.74, 1.34), rot=(0.5, 0, 0))
    pz.shade(head, C["brach"], lo=0.6, hi=1.26)
    head_parts.append(head)
    snout = pz.blob("br_snout", r=0.17, sides=5, rows=3, squash=(0.9, 1.1, 0.8), seed=14)
    pz.place(snout, loc=(0, -1.08, 1.22))
    pz.shade(snout, C["brach_lo"], lo=0.65, hi=1.2)
    head_parts.append(snout)
    _eyes(head_parts, "br", [(-0.25, -0.88, 1.46), (0.25, -0.88, 1.46)])

    # ── 꼬리 ──
    tail = pz.tube("br_tail", [(0, 0.30, 0, 0), (0.50, 0.22, 0, 0.06),
                               (0.95, 0.14, 0, 0.22), (1.30, 0.07, 0, 0.48)], sides=5)
    pz.shade(tail, C["brach"], lo=0.55, hi=1.24)
    tail_parts.append(tail)

    return body_parts, head_parts, tail_parts, \
        (0, 0.92, 1.45), (0, -1.02, 1.02)      # 목·꼬리가 붙는 자리


def trex():
    """주황 아기 티라노 — 머리가 크다. 머리와 꼬리가 흔드는 부위다."""
    pz.reset()
    body_parts, head_parts, tail_parts = [], [], []

    _disc(body_parts, "tx", r=1.0)
    torso = pz.blob("tx_torso", r=0.80, sides=7, rows=5,
                    squash=(0.90, 1.15, 0.92), seed=2)
    pz.place(torso, loc=(0, 0.12, 0.88), rot=(0.22, 0, 0))
    pz.shade(torso, C["trex"], lo=0.55, hi=1.26)
    body_parts.append(torso)

    belly = pz.blob("tx_belly", r=0.58, sides=6, rows=4, squash=(0.82, 1.0, 0.72), seed=12)
    pz.place(belly, loc=(0, -0.14, 0.72))
    pz.shade(belly, C["trex_lo"], lo=0.62, hi=1.2)
    body_parts.append(belly)

    # 뒷다리 둘 — 두 발로 선다
    for i, x in enumerate([-0.44, 0.44]):
        th = pz.blob(f"tx_th{i}", r=0.34, sides=6, rows=4, squash=(0.72, 0.92, 1.0), seed=20 + i)
        pz.place(th, loc=(x, 0.16, 0.62))
        pz.shade(th, C["trex"], lo=0.55, hi=1.22)
        body_parts.append(th)
    _legs(body_parts, "tx", [(-0.44, -0.02), (0.44, -0.02)], C["trex"], r=0.17, h=0.42)

    # 앞발 — 작아야 티라노다
    for i, x in enumerate([-0.52, 0.52]):
        arm = pz.tube(f"tx_arm{i}", [(0, 0.10, 0, 0), (0.30, 0.08, 0.10, 0)], sides=4)
        pz.place(arm, loc=(x, -0.42, 1.02), rot=(1.1, 0, 0))
        pz.shade(arm, C["trex"], lo=0.6, hi=1.2)
        body_parts.append(arm)

    for i in range(4):
        s = pz.blob(f"tx_spot{i}", r=0.17, sides=5, rows=3, squash=(1, 1, 0.3), seed=210 + i)
        pz.place(s, loc=(0.30 - 0.2 * i, 0.62, 1.18 + 0.12 * i),
                 rot=(math.pi / 2 - 0.4, 0, 0))
        pz.shade(s, pz.rgb("#c9341a"), lo=0.8, hi=1.2)
        body_parts.append(s)

    # ── 머리 (흔드는 부위) ── 원점은 목이 붙는 자리
    # 머리를 앞(-Y)으로 확실히 뺀다. 첫 판은 몸에 파묻혀 덩어리로 보였다
    head = pz.blob("tx_head", r=0.52, sides=7, rows=5, squash=(0.90, 1.24, 0.88), seed=4)
    pz.place(head, loc=(0, -0.46, 0.10))
    pz.shade(head, C["trex"], lo=0.55, hi=1.28)
    head_parts.append(head)
    jaw = pz.blob("tx_jaw", r=0.36, sides=6, rows=3, squash=(0.86, 1.20, 0.42), seed=24)
    pz.place(jaw, loc=(0, -0.60, -0.20))
    pz.shade(jaw, C["trex_lo"], lo=0.62, hi=1.22)
    head_parts.append(jaw)
    for i in range(5):
        t = pz.blob(f"tx_tooth{i}", r=0.055, sides=4, rows=3, squash=(1, 1, 1.7), seed=220 + i)
        pz.place(t, loc=(-0.20 + i * 0.10, -1.00, -0.06))
        pz.shade(t, C["claw"], lo=0.9, hi=1.15)
        head_parts.append(t)
    _eyes(head_parts, "tx", [(-0.30, -0.72, 0.30), (0.30, -0.72, 0.30)], r=0.14)

    tail = pz.tube("tx_tail", [(0, 0.30, 0, 0), (0.52, 0.22, 0, 0.10),
                               (1.00, 0.13, 0, 0.30), (1.35, 0.06, 0, 0.62)], sides=5)
    pz.shade(tail, C["trex"], lo=0.55, hi=1.24)
    tail_parts.append(tail)

    return body_parts, head_parts, tail_parts, (0, -0.62, 1.42), (0, 0.78, 1.05)


def build_dino(fn, name):
    """
    몸통·머리·꼬리를 **따로 합쳐** 한 GLB에 담는다.
    게임이 이름으로 찾아 흔든다 — `body` / `head` / `tail`.
    """
    body, head, tail, head_at, tail_at = fn()
    info = pz.export_parts(
        [("body", body, (0, 0, 0), (0, 0, 0)),
         ("head", head, head_at, (0, 0, 0)),
         ("tail", tail, tail_at, (-math.pi * 0.46, 0, 0))],
        name, subdir="props")
    return info


RESULT = {
    "fossil_rock": pz.export(fossil_rock(), "fossil_rock"),
    "egg_nest": pz.export(egg_nest(), "egg_nest"),
    "dino_brachio": build_dino(brachio, "dino_brachio"),
    "dino_trex": build_dino(trex, "dino_trex"),
}
