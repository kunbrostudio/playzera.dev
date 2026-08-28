# 야자수 — 첫 에셋. 다른 것들의 규격을 여기서 정한다.
#
# 컨셉아트(8/20)의 특징 중 **저폴리로 옮길 수 있는 것만** 가져온다.
#
#   가져오는 것   휘어 오르는 줄기 · 마디 · 늘어진 잎 여섯 · 코코넛 둘 · 돌 받침
#   버리는 것     잎맥 · 광택 하이라이트 · 줄기의 잔 결
#
# 버린 것들은 화면에서 이 물건이 25~90유닛 뒤에 있기 때문에 어차피 안 보인다.
# 대신 **실루엣**에 예산을 쓴다 — 멀리서 야자수인 걸 아는 건 잎의 늘어진 곡선이다.
#
# 크기: 높이 6유닛. 트랙 폭이 15유닛, 아이 키가 4.6유닛이니 어른 키의 서너 배다.

import sys
sys.path.insert(0, "/Users/ken.choi/Documents/playzera.dev/tools/blender")

import math
import random
import importlib
import pzblender as pz
importlib.reload(pz)

C = {
    "trunk":    pz.rgb("#c07a3e"),
    "trunk_lo": pz.rgb("#9a5c2c"),
    "leaf":     pz.rgb("#3fa32a"),
    "leaf_lo":  pz.rgb("#2f7d20"),
    "coco":     pz.rgb("#7b3f22"),
    "rock":     pz.rgb("#b5a893"),
    "moss":     pz.rgb("#68b53a"),
    "flower":   pz.rgb("#e8452c"),
}

H = 6.0            # 전체 높이
rnd = random.Random(7)


def build():
    pz.reset()
    parts = []

    # ── 줄기 ──
    # 곧게 세우지 않는다. 컨셉아트가 야자수로 읽히는 건 **휘어 오르기** 때문이다.
    # 마디는 반지름을 흔들어 만든다 — 링을 따로 두르면 폴리가 배로 든다.
    rings = []
    N = 11
    TH = H * 0.66
    for i in range(N + 1):
        t = i / N
        z = TH * t
        # S자로 휜다. 위로 갈수록 급해지되 꼭대기에서 살짝 되돌아온다
        bend = 1.15 * t * t - 0.18 * t
        rad = 0.40 * (1 - 0.62 * t)
        rad *= 1.16 if i % 2 == 0 else 0.94       # 마디
        rings.append((z, rad, bend, -bend * 0.42))
    trunk = pz.tube("trunk", rings, sides=7)
    pz.shade(trunk, C["trunk"], lo=0.55, hi=1.28, ground=1.6, ground_k=0.34, jitter=0.10)
    parts.append(trunk)

    top = (rings[-1][2], rings[-1][3], rings[-1][0])

    # 잎이 나오는 자리를 도톰하게. 없으면 잎이 허공 한 점에서 튀어나온다
    crown = pz.blob("crown", r=0.30, sides=7, rows=3, squash=(1, 1, 0.8), seed=3)
    pz.place(crown, loc=top)
    pz.shade(crown, C["trunk_lo"])
    parts.append(crown)

    # ── 잎 ──
    # **두 층**으로 둔다. 한 층이면 우산이라 야자수가 아니다 —
    # 위는 짧고 곧게, 아래는 길고 늘어지게.
    tiers = [
        dict(n=5, length=2.05, width=0.50, rise=0.42, droop=0.62, pitch=-0.62, a0=0.0),
        dict(n=6, length=3.05, width=0.60, rise=0.26, droop=1.05, pitch=-0.16, a0=0.5),
    ]
    li = 0
    for tier in tiers:
        for i in range(tier["n"]):
            a = 2 * math.pi * i / tier["n"] + tier["a0"] + rnd.uniform(-0.20, 0.20)
            lf = pz.leaf(
                f"leaf{li}",
                length=tier["length"] * rnd.uniform(0.88, 1.12),
                width=tier["width"], segs=7,
                rise=tier["rise"] * rnd.uniform(0.85, 1.15),
                droop=tier["droop"] * rnd.uniform(0.85, 1.2),
                crease=0.22,
                sweep=rnd.uniform(-0.16, 0.16),     # 옆으로도 휜다
                notch=0.30,                          # 톱니 실루엣
            )
            pz.place(lf, loc=top,
                     rot=(rnd.uniform(-0.14, 0.14), tier["pitch"] + rnd.uniform(-0.12, 0.12), a))
            pz.shade(lf, C["leaf"] if li % 2 else C["leaf_lo"], lo=0.52, hi=1.30, jitter=0.14)
            parts.append(lf)
            li += 1

    # ── 코코넛 ──
    for i, (dx, dy, dz) in enumerate([(0.30, 0.06, -0.20), (0.14, -0.28, -0.28),
                                      (0.34, -0.16, -0.40)]):
        co = pz.blob(f"coco{i}", r=0.27, sides=6, rows=4, seed=i)
        pz.place(co, loc=(top[0] + dx, top[1] + dy, top[2] + dz))
        pz.shade(co, C["coco"], lo=0.5, hi=1.3)
        parts.append(co)

    # ── 받침 ──
    # 돌과 이끼가 밑동을 덮어야 **땅에 심어진 것**으로 보인다. 줄기만 세우면
    # 땅에 꽂아 둔 막대다(`CLAUDE.md`: 오브젝트는 바닥에 붙어 있어야 한다).
    # 돌은 줄기에 **겹쳐** 놓는다. 떨어뜨려 두면 따로 노는 자갈이 된다.
    for i, (dx, dy, r) in enumerate([(-0.52, 0.14, 0.52), (0.48, 0.26, 0.44),
                                     (0.08, -0.54, 0.48), (-0.26, -0.26, 0.36),
                                     (0.30, 0.44, 0.30)]):
        rk = pz.blob(f"rock{i}", r=r, sides=6, rows=3, squash=(1.0, 1.0, 0.58),
                     seed=10 + i, rough=0.36)
        pz.place(rk, loc=(dx, dy, r * 0.26), rot=(0, 0, rnd.uniform(0, 3.1)))
        pz.shade(rk, C["rock"], ground=r * 0.8, ground_k=0.42, jitter=0.16)
        parts.append(rk)

    for i in range(7):
        a = 2 * math.pi * i / 7 + 0.4
        d = 0.50 + rnd.uniform(-0.1, 0.16)
        tuft = pz.leaf(f"tuft{i}", length=0.72, width=0.13, segs=3,
                       rise=0.5, droop=0.9, crease=0.05)
        pz.place(tuft, loc=(math.cos(a) * d, math.sin(a) * d, 0.10),
                 rot=(0, -0.95 + rnd.uniform(-0.25, 0.25), a))
        pz.shade(tuft, C["moss"], lo=0.6, hi=1.25)
        parts.append(tuft)

    fl = pz.blob("flower", r=0.19, sides=5, rows=3, squash=(1, 1, 0.5), seed=99)
    pz.place(fl, loc=(-0.70, -0.36, 0.30))
    pz.shade(fl, C["flower"], lo=0.7, hi=1.3)
    parts.append(fl)

    return parts


info = pz.export(build(), "palm", subdir="props")
