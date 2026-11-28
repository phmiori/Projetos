# -*- coding: utf-8 -*-
"""Texturas dos blocos no estilo "desenhado": formas limpas (pedras com contorno, tábuas com emendas, veios da
casca, folhas), poucos tons por material com luz e sombra em degraus, e quase nenhum chuvisco. Menos detalhado que
o estilo realista, mas sem ficar liso. 64 px por face.

Uso (na pasta "Minecraft 2"):  python rust/ferramentas/estilizar-texturas.py [nome ...]
Sem nomes, refaz todas. As cores vêm das texturas de 16 px de textures/originais-16px (ou, para pedra, minérios e
afins, de uma tabela aqui). Cada PNG é um "cubo aberto" 4 x 3:  [topo] / [esq][frente][dir][trás] / [base].
"""
import hashlib
import os
import sys

import numpy as np
from PIL import Image

N = 64
DIR = "textures"
SRC = os.path.join(DIR, "originais-16px")
CELLS = {"top": (1, 0), "left": (0, 1), "front": (1, 1), "right": (2, 1), "back": (3, 1), "bottom": (1, 2)}
SIDES = ["left", "front", "right", "back"]
yy, xx = np.mgrid[0:N, 0:N].astype(float)


def rng_for(*key):
    h = hashlib.sha1("/".join(str(k) for k in key).encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "little"))


def C(*c):
    return np.array(c, float)


# ----------------------------------------------------------------------------- ferramentas
def noise(rng, cx, cy=None):
    """Ruído suave de baixa frequência que emenda nas bordas (cx x cy células)."""
    cy = cy or cx
    g = rng.random((cy, cx))
    fx, fy = xx / N * cx, yy / N * cy
    x0, y0 = np.floor(fx).astype(int), np.floor(fy).astype(int)
    tx, ty = fx - x0, fy - y0
    sx, sy = tx * tx * (3 - 2 * tx), ty * ty * (3 - 2 * ty)
    a = g[y0 % cy, x0 % cx]
    b = g[y0 % cy, (x0 + 1) % cx]
    c = g[(y0 + 1) % cy, x0 % cx]
    d = g[(y0 + 1) % cy, (x0 + 1) % cx]
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy


def worley(rng, n, sx=1.0, sy=1.0, pts=None):
    """Células (tileável): distância ao 1º e 2º ponto, índice da célula e vetor do ponto ao pixel."""
    p = pts if pts is not None else rng.random((n, 2)) * N
    best = np.full((N, N), 1e9)
    second = np.full((N, N), 1e9)
    idx = np.zeros((N, N), int)
    vx = np.zeros((N, N))
    vy = np.zeros((N, N))
    for i, (px, py) in enumerate(p):
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                dx, dy = (xx - px - ox) * sx, (yy - py - oy) * sy
                d = np.sqrt(dx * dx + dy * dy)
                closer = d < best
                second = np.where(closer, best, np.minimum(second, d))
                best = np.where(closer, d, best)
                idx = np.where(closer, i, idx)
                vx = np.where(closer, dx, vx)
                vy = np.where(closer, dy, vy)
    return best, second, idx, vx, vy


def steps(x, k=0.07):
    """Arredonda em degraus (o jeito "desenhado": poucos tons)."""
    return np.round(x / k) * k


def paint(color, mult):
    return np.clip(np.asarray(color)[None, None, :] * np.asarray(mult)[..., None], 0, 1)


def rgba(rgb, a=None):
    a = np.ones((N, N)) if a is None else a
    return np.dstack([np.clip(rgb, 0, 1), a])


def blobs(img, rng, count, rmin, rmax, colors, squash=1.0, highlight=1.25, outline=0.6):
    """Pedrinhas/pintas redondas com um pontinho de luz em cima à esquerda e a borda mais escura."""
    for _ in range(count):
        cx, cy = rng.random() * N, rng.random() * N
        r = rmin + rng.random() * (rmax - rmin)
        col = colors[rng.integers(len(colors))]
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d = np.sqrt(((xx - cx - ox) / r) ** 2 + ((yy - cy - oy) / (r * squash)) ** 2)
                img[d <= 1.0] = col
                ring = (d > 0.62) & (d <= 1.0) & ((xx - cx - ox) + (yy - cy - oy) > 0)
                img[ring] = col * outline
                hi = d < 0.45
                hl = hi & ((xx - cx - ox) + (yy - cy - oy) < -0.4 * r)
                img[hl] = np.minimum(1, col * highlight)
    return img


# ----------------------------------------------------------------------------- materiais
def cells_stone(rng, base, n, mortar=0.55, var=0.1, bevel=0.16, gap=1.1, sx=1.0, sy=1.0, tones=None):
    """Pedras com contorno: cada célula um tom, borda clara em cima à esquerda e escura embaixo à direita."""
    f1, f2, idx, vx, vy = worley(rng, n, sx, sy)
    e = (f2 - f1) / 2
    t = 1 + var * (rng.random(n)[idx] * 2 - 1)
    side = np.sign(vx + vy)
    t = t + bevel * np.clip((3.2 - e) / 3.2, 0, 1) * (-side) * 0.8
    t = t * (1 + 0.04 * (noise(rng, 4) - 0.5))
    col = paint(base, steps(t))
    if tones is not None:
        col = np.where((rng.random(n)[idx] > 0.75)[..., None], paint(tones, steps(t)), col)
    col[e < gap] = np.asarray(base) * mortar
    return col


def stone(rng, base):
    """Pedra: placas grandes e lisas, com rachaduras finas."""
    f1, f2, idx, vx, vy = worley(rng, 7, 1.0, 1.35)
    e = (f2 - f1) / 2
    t = 1 + 0.07 * (rng.random(7)[idx] * 2 - 1) + 0.06 * (noise(rng, 3) - 0.5)
    t = t + 0.08 * np.clip((2.5 - e) / 2.5, 0, 1) * -np.sign(vx + vy)
    col = paint(base, steps(t, 0.05))
    col[e < 0.7] = np.asarray(base) * 0.72
    # algumas manchinhas
    return blobs(col, rng, 6, 1.0, 1.8, [np.asarray(base) * 0.86, np.asarray(base) * 1.1], outline=0.92, highlight=1.05)


def ore(rng, base, gem, dark=None):
    col = stone(rng, base)
    dark = np.asarray(gem) * 0.5 if dark is None else dark
    # pedras do minério grandes (uns 8 a 12 px), em 4 grupos de 2 a 4
    for _ in range(4):
        cx, cy = rng.random() * N, rng.random() * N
        for _ in range(rng.integers(2, 5)):
            gx, gy = cx + rng.normal() * 6.5, cy + rng.normal() * 6.5
            r = 3.8 + rng.random() * 2.4
            for ox in (-N, 0, N):
                for oy in (-N, 0, N):
                    d = np.abs(xx - gx - ox) + np.abs(yy - gy - oy)
                    col[d <= r + 1.3] = dark
                    col[d <= r] = gem
                    col[(d <= r) & ((xx - gx - ox) + (yy - gy - oy) > 0.5)] = np.asarray(gem) * 0.78
                    col[(d <= r * 0.5) & ((xx - gx - ox) < 0) & ((yy - gy - oy) < 0)] = np.minimum(1, np.asarray(gem) * 1.35 + 0.1)
    return col


def dirt(rng, base):
    t = steps(1 + 0.12 * (noise(rng, 3) - 0.5) + 0.06 * (noise(rng, 7) - 0.5), 0.06)
    col = paint(base, t)
    return blobs(col, rng, 14, 1.2, 2.4, [np.asarray(base) * 0.75, np.asarray(base) * 1.18, np.asarray(base) * 0.9], outline=0.8)


def grass_top(rng, base):
    t = steps(1 + 0.16 * (noise(rng, 3) - 0.5) + 0.08 * (noise(rng, 6) - 0.5), 0.06)
    col = paint(base, t)
    for _ in range(70):
        x, y = rng.integers(N), rng.integers(N)
        ln = rng.integers(2, 4)
        k = 1.18 if rng.random() < 0.55 else 0.8
        for i in range(ln):
            col[(y + i) % N, x] = np.minimum(1, np.asarray(base) * k)
    return col


def grass_side(rng, grass, dirt_col):
    col = dirt(rng, dirt_col)
    edge = 15 + 4 * noise(rng, 6, 1)[0] + 3 * np.sin(np.arange(N) * 2 * np.pi / 16 + rng.random() * 6)
    # pontas que descem
    for _ in range(6):
        x = rng.integers(N)
        w = rng.integers(2, 4)
        edge[x:x + w] += rng.integers(3, 7)
    g = yy < edge[None, :]
    t = steps(1 + 0.12 * (noise(rng, 4) - 0.5), 0.06)
    gc = paint(grass, t)
    gc[(yy > edge[None, :] - 2.5)] *= 0.82  # a borda de baixo mais escura
    col[g] = gc[g]
    under = (yy >= edge[None, :]) & (yy < edge[None, :] + 1.5)
    col[under] *= 0.7  # sombra da grama na terra
    return col


def sand(rng, base, ripples=True):
    t = 1 + 0.05 * (noise(rng, 3) - 0.5)
    if ripples:
        wob = 3 * noise(rng, 4)
        r = np.sin((yy + wob * 3 + xx * 0.15) * 2 * np.pi / 10.7)
        t = t + np.where(r > 0.82, 0.07, 0) - np.where(r < -0.9, 0.05, 0)
    col = paint(base, steps(t, 0.04))
    return blobs(col, rng, 10, 0.6, 1.1, [np.asarray(base) * 0.82, np.asarray(base) * 1.12], outline=0.95, highlight=1.0)


def sandstone(rng, base, face):
    if face in ("top", "bottom"):
        t = 1 + 0.04 * (noise(rng, 3) - 0.5)
        col = paint(base, steps(t, 0.04))
        border = (np.minimum(np.minimum(xx, N - 1 - xx), np.minimum(yy, N - 1 - yy)) < 3)
        col[border] *= 0.88 if face == "top" else 0.8
        return col
    band = (yy // 8).astype(int)
    k = 1 + 0.06 * (np.array([0, 1, -1, 0.5, -0.5, 1, 0, -1])[band % 8])
    wav = np.sin(xx * 2 * np.pi / 32 + band) * 0.6
    line = (np.abs((yy % 8) - 7 - wav) < 0.7)
    col = paint(base, steps(k, 0.03))
    col[line] *= 0.82
    return col


def bedrock(rng, base):
    col = cells_stone(rng, base * 1.3, 18, mortar=0.25, var=0.35, bevel=0.25, gap=1.4)
    return col


def snow(rng, base):
    t = steps(1 + 0.05 * (noise(rng, 3) - 0.5) - 0.06 * np.clip(noise(rng, 5) - 0.6, 0, 1) * 3, 0.03)
    col = paint(base, t)
    sp = rng.random((N, N)) > 0.992
    col[sp] = 1.0
    return col


def ice(rng, base, cracks=True):
    t = steps(1 + 0.08 * (noise(rng, 2) - 0.5), 0.04)
    col = paint(base, t)
    # brilhos diagonais
    d = (xx + yy) % 64
    col[(np.abs(d - 20) < 1.2) & (noise(rng, 3) > 0.45)] = np.minimum(1, np.asarray(base) * 1.25)
    col[(np.abs(d - 26) < 0.6) & (noise(rng, 3) > 0.5)] = np.minimum(1, np.asarray(base) * 1.18)
    if cracks:
        f1, f2, idx, vx, vy = worley(rng, 5)
        col[(f2 - f1) < 0.9] = np.minimum(1, np.asarray(base) * 1.3 + 0.05)
    return col


def water(rng, base):
    t = 1 + 0.05 * (noise(rng, 2) - 0.5)
    col = paint(base, steps(t, 0.04))
    for k in range(5):
        y0 = (k * 13 + rng.integers(4)) % N
        wave = y0 + 2 * np.sin(xx * 2 * np.pi / 32 + k)
        m = (np.abs(yy - wave) < 0.6) & (((xx + k * 11) % 32) < 18)
        col[m] = np.minimum(1, np.asarray(base) * 1.3 + 0.08)
    return col


def lava(rng, base):
    f1, f2, idx, vx, vy = worley(rng, 9)
    e = (f2 - f1) / 2
    hot = np.clip(1 - f1 / 11, 0, 1)
    col = paint(C(0.95, 0.45, 0.08), steps(0.8 + 0.35 * hot, 0.1))
    col[hot > 0.55] = C(1.0, 0.78, 0.25)
    col[hot > 0.8] = C(1.0, 0.93, 0.6)
    col[e < 2.2] = C(0.55, 0.16, 0.05)
    col[e < 1.0] = C(0.36, 0.09, 0.03)
    return col


def bark(rng, base, kind="oak"):
    """Casca: placas compridas na vertical separadas por sulcos fundos (carvalho e cerejeira), cada placa com a borda
    clara à esquerda e a sombra à direita e uma ou duas rachinhas; a bétula é branca com as marcas pretas."""
    base = np.asarray(base)
    if kind == "birch":
        t = 1 + 0.05 * (noise(rng, 2, 3) - 0.5)
        col = paint(base * 1.05, steps(t, 0.04))
        # manchas cinza-claro suaves
        col[noise(rng, 3, 5) > 0.68] *= 0.9
        for _ in range(13):
            x, y = rng.integers(N), rng.integers(N)
            w = int(rng.integers(5, 15))
            th = 2 if rng.random() < 0.5 else 1
            for i in range(w):
                # a marca afina nas pontas
                thick = th if 1 < i < w - 2 else 1
                for j in range(thick):
                    col[(y + j) % N, (x + i) % N] = C(0.16, 0.15, 0.14)
                col[(y + thick) % N, (x + i) % N] = base * 0.82
        return col
    # colunas de placas com larguras diferentes; as divisas ondulam um pouco (sempre emendando em cima e embaixo)
    widths = []
    while sum(widths) < N - 12:
        widths.append(int(rng.integers(7, 12)))
    widths.append(N - sum(widths))
    bounds = np.cumsum([0] + widths)  # de 0 a 64
    k = len(widths)
    amp = rng.random(k + 1) * 1.6 + 0.6
    freq = rng.integers(1, 3, k + 1)
    ph = rng.random(k + 1) * 6.3
    edge_x = [bounds[i] + amp[i] * np.sin(yy * 2 * np.pi / N * freq[i] + ph[i]) for i in range(k + 1)]
    edge_x[k] = edge_x[0] + N  # a última divisa é a primeira (emenda nos lados)
    col_i = np.zeros((N, N), int)
    for i in range(1, k):
        col_i += (xx >= edge_x[i]).astype(int)
    col_i = np.where(xx < edge_x[0], k - 1, col_i)
    left = np.choose(col_i, [edge_x[i] for i in range(k)])
    right = np.choose(col_i, [edge_x[i + 1] for i in range(k)])
    xs = np.where(xx < edge_x[0], xx + N, xx)
    dl, dr = xs - left, right - xs
    # cada coluna partida em pedaços (16 ou 32 px), com a quebra numa altura diferente
    seg_h = np.array([16 if rng.random() < 0.6 else 32 for _ in range(k)])[col_i]
    seg_o = (rng.random(k) * 32).astype(int)[col_i]
    seg = ((yy + seg_o) // seg_h).astype(int)
    tone = 1 + 0.08 * (rng.random((k, 8)) * 2 - 1)
    t = tone[col_i, seg % 8]
    t = np.where(dl < 3.0, t * 1.13, t)
    t = np.where(dr < 3.0, t * 0.8, t)
    # rachinha no meio de algumas placas
    mid = (left + right) / 2 + 0.8 * np.sin(yy * 2 * np.pi / 32 + col_i)
    has = (rng.random(k) < 0.55)[col_i]
    t = np.where(has & (np.abs(xs - mid) < 0.55) & (dl > 3) & (dr > 3), t * 0.78, t)
    col = paint(base, steps(t, 0.04))
    brk = ((yy + seg_o) % seg_h) < 1.0
    col[brk] = base * 0.55
    groove = (dl < 1.0) | (dr < 1.0)
    col[groove] = base * 0.42
    if kind == "cherry":
        # lenticelas: risquinhos horizontais claros
        for _ in range(16):
            x, y = rng.integers(N), rng.integers(N)
            for i in range(int(rng.integers(3, 7))):
                if not groove[y % N, (x + i) % N]:
                    col[y % N, (x + i) % N] = np.minimum(1, base * 1.35)
    return col


def rings(rng, wood, bark_col):
    r = np.sqrt((xx - 31.5) ** 2 + (yy - 31.5) ** 2)
    wob = 1.5 * (noise(rng, 4) - 0.5)
    ring = (np.sin((r + wob) * 2 * np.pi / 5.5) > 0.55)
    t = np.where(ring, 0.84, 1.0) * (1 + 0.1 * np.clip(1 - r / 30, 0, 1))
    col = paint(wood, steps(t, 0.04))
    sq = np.maximum(np.abs(xx - 31.5), np.abs(yy - 31.5))
    col[sq > 27.5] = np.asarray(bark_col)
    col[(sq > 27.5) & (sq < 29)] = np.asarray(bark_col) * 0.75
    col[r < 2.2] = np.asarray(wood) * 0.75
    return col


def planks(rng, base):
    col = np.zeros((N, N, 3))
    row = (yy // 16).astype(int)
    for r in range(4):
        m = row == r
        tone = 1 + 0.08 * (rng.random() * 2 - 1)
        g = noise(rng, 2, 1)
        grain = np.sin((xx * 0.18 + yy * 1.4 + 6 * g) * 1.0)
        t = tone * np.where(grain > 0.9, 0.88, 1.0)
        t = t * (1 - 0.06 * ((yy % 16) / 15))  # a tábua um pouco mais escura embaixo
        c = paint(base, steps(t, 0.04))
        col[m] = c[m]
        # emenda vertical (onde uma tábua acaba)
        cut = rng.integers(8, 56)
        col[m & (np.abs(xx - cut) < 0.6)] = np.asarray(base) * 0.55
        col[m & (np.abs(xx - cut - 1) < 0.6)] = np.minimum(1, np.asarray(base) * 1.1)
        for nx in (cut - 4, cut + 4):
            ny = r * 16 + 8
            col[ny, nx % N] = np.asarray(base) * 0.45
    col[(yy % 16) < 1] = np.asarray(base) * 0.5
    col[(yy % 16) == 1] = np.minimum(1, np.asarray(base) * 1.12)
    return col


def leaves(rng, base, pink=False, holes=True):
    col = paint(base, np.full((N, N), 0.62))
    alpha = np.ones((N, N))
    tones = [0.8, 0.95, 1.08, 1.2]
    for i in range(150):
        cx, cy = rng.random() * N, rng.random() * N
        ang = rng.random() * np.pi
        a, b = 3.6 + rng.random() * 1.8, 2.0 + rng.random() * 0.7
        k = tones[rng.integers(len(tones))]
        ca, sa = np.cos(ang), np.sin(ang)
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                dx, dy = xx - cx - ox, yy - cy - oy
                u, v = dx * ca + dy * sa, -dx * sa + dy * ca
                d = (u / a) ** 2 + (v / b) ** 2
                m = d <= 1.0
                if not m.any():
                    continue
                col[m] = np.minimum(1, np.asarray(base) * k)
                col[m & (dx + dy > 1.0) & (d > 0.45)] = np.asarray(base) * k * 0.8
                col[m & (np.abs(v) < 0.35) & (np.abs(u) < a * 0.7)] = np.asarray(base) * k * 0.86  # nervura
    if holes:
        f1, f2, idx, vx, vy = worley(rng, 14)
        hole = f1 < 2.2
        alpha[hole] = 0
    if pink:
        pass
    return col, alpha


def bricks(rng, base, rows=4, cols=2, mortar=C(0.74, 0.71, 0.66), bevel=0.14):
    h, w = N / rows, N / cols
    col = np.zeros((N, N, 3))
    r = (yy // h).astype(int)
    off = np.where(r % 2 == 1, w / 2, 0)
    c = ((xx + off) // w).astype(int) % cols
    lx = (xx + off) % w
    ly = yy % h
    tone = 1 + 0.1 * (rng.random((rows, cols)) * 2 - 1)
    t = tone[r, c]
    t = t + bevel * ((lx < 3) | (ly < 3)) * 0.6 - bevel * ((lx > w - 4) | (ly > h - 4)) * 0.7
    t = t * (1 + 0.05 * (noise(rng, 5) - 0.5))
    col = paint(base, steps(t, 0.05))
    m = (lx < 1.5) | (ly < 1.5)
    col[m] = mortar
    return col


def metal(rng, base, gem=False):
    t = np.ones((N, N))
    edge = np.minimum(np.minimum(xx, N - 1 - xx), np.minimum(yy, N - 1 - yy))
    t = np.where(edge < 4, np.where(xx + yy < N - 1, 1.18, 0.72), 1.0)
    inner = 1 + 0.1 * ((N - xx - yy) / N)
    t = np.where(edge >= 4, inner, t)
    col = paint(base, steps(t, 0.05))
    col[(edge >= 4) & (edge < 5)] = np.asarray(base) * 0.62
    if gem:
        d = np.abs(xx - 31.5) + np.abs(yy - 31.5)
        col[d < 20] = paint(base, np.where(xx < 31.5, np.where(yy < 31.5, 1.3, 1.05), np.where(yy < 31.5, 1.0, 0.8)))[d < 20]
        col[(d >= 20) & (d < 21.5)] = np.asarray(base) * 0.55
    else:
        for (px, py) in ((8, 8), (55, 8), (8, 55), (55, 55)):
            m = (np.abs(xx - px) < 1.6) & (np.abs(yy - py) < 1.6)
            col[m] = np.asarray(base) * 0.6
            col[(np.abs(xx - px + 0.6) < 0.6) & (np.abs(yy - py + 0.6) < 0.6)] = np.minimum(1, np.asarray(base) * 1.3)
        # brilho no canto de cima
        col[(xx + yy < 22) & (edge >= 6) & (xx + yy > 14)] = np.minimum(1, np.asarray(base) * 1.12)
    return col


def wool(rng, base):
    f1, f2, idx, vx, vy = worley(rng, 22)
    # tufos macios: pouca diferença entre eles e a sombra só de leve
    t = 1 + 0.035 * (rng.random(22)[idx] * 2 - 1) - 0.04 * ((f2 - f1) < 1.5)
    t = t + 0.035 * np.clip(-(vx + vy) / 8, -1, 1)
    return paint(base, steps(t, 0.05))


def hay(rng, base, face):
    if face in ("top", "bottom"):
        col = paint(base, np.full((N, N), 0.95))
        return blobs(col, rng, 60, 1.0, 1.8, [np.asarray(base) * 0.75, np.asarray(base) * 1.1, np.asarray(base) * 0.9], outline=0.75)
    s = 0.5 + 0.5 * np.sin(xx * 2 * np.pi / 4.3 + 3 * noise(rng, 4, 2))
    t = np.where(s > 0.8, 1.12, np.where(s < 0.2, 0.82, 1.0))
    col = paint(base, steps(t, 0.05))
    for y0 in (12, 48):
        band = np.abs(yy - y0) < 3
        col[band] = C(0.55, 0.32, 0.15)
        col[np.abs(yy - y0 + 2.5) < 0.6] = C(0.68, 0.45, 0.22)
    return col


def ribbed(rng, base, face, ribs, stem=None, stripes=False):
    if face in ("top", "bottom"):
        r = np.sqrt((xx - 31.5) ** 2 + (yy - 31.5) ** 2)
        ang = np.arctan2(yy - 31.5, xx - 31.5)
        rib = 0.5 + 0.5 * np.cos(ang * ribs)
        t = np.where(rib < 0.15, 0.8, 1.0) * (1 - 0.15 * (r / 45))
        col = paint(base, steps(t, 0.05))
        if face == "top" and stem is not None:
            m = (np.abs(xx - 31.5) < 4) & (np.abs(yy - 31.5) < 4)
            col[m] = stem
            col[m & ((xx - 31.5) + (yy - 31.5) > 2)] = stem * 0.75
        return col
    w = N / ribs
    lx = xx % w
    t = 1.0 + 0.14 * np.sin(lx / w * np.pi) - 0.1
    t = np.where(lx < 1.2, 0.7, t)
    if stripes:
        t = np.where(((xx // w).astype(int) % 2 == 0) & (lx > 1.5), t * 0.78, t)
    t = t * (1 - 0.12 * np.abs(yy - 31.5) / 32)
    return paint(base, steps(t, 0.05))


def cactus(rng, base, face):
    if face in ("top", "bottom"):
        r = np.maximum(np.abs(xx - 31.5), np.abs(yy - 31.5))
        t = np.where(r > 26, 0.85, 1.0) * np.where((r % 8) < 1.2, 0.86, 1.0)
        return paint(base, steps(t, 0.05))
    lx = xx % 16
    t = 0.92 + 0.16 * np.sin(lx / 16 * np.pi)
    t = np.where(lx < 1.3, 0.72, t)
    col = paint(base, steps(t, 0.05))
    for _ in range(26):
        x, y = rng.integers(N), rng.integers(N)
        col[y, x] = C(0.95, 0.92, 0.75)
        col[(y + 1) % N, x] = np.asarray(base) * 0.6
    return col


def glass(old_alpha):
    rgb = np.ones((N, N, 3)) * C(0.86, 0.95, 0.98)
    a = np.full((N, N), 0.0)
    edge = np.minimum(np.minimum(xx, N - 1 - xx), np.minimum(yy, N - 1 - yy))
    a[edge < 3] = 1.0
    rgb[edge < 3] = C(0.88, 0.94, 0.96)
    rgb[edge < 1] = C(0.62, 0.72, 0.76)
    for off, w in ((-14, 1.6), (-8, 0.9), (16, 1.1)):
        m = (np.abs((xx + yy) - (N + off)) < w) & (edge >= 3) & (np.abs(xx - yy) < 30)
        a[m] = 0.75
    return rgb, a


# ----------------------------------------------------------------------------- desenhos (baú, porta, plantas...)
def scale2x(img):
    h, w, _ = img.shape
    out = np.zeros((h * 2, w * 2, img.shape[2]), img.dtype)
    p = np.pad(img, ((1, 1), (1, 1), (0, 0)), mode="edge")
    for y in range(h):
        for x in range(w):
            E = p[y + 1, x + 1]
            B, D, F, H = p[y, x + 1], p[y + 1, x], p[y + 1, x + 2], p[y + 2, x + 1]
            eq = lambda a, b: np.allclose(a, b, atol=0.02)
            e0 = D if (eq(D, B) and not eq(B, F) and not eq(D, H)) else E
            e1 = F if (eq(B, F) and not eq(B, D) and not eq(F, H)) else E
            e2 = D if (eq(D, H) and not eq(D, B) and not eq(H, F)) else E
            e3 = F if (eq(H, F) and not eq(D, H) and not eq(B, F)) else E
            out[2 * y, 2 * x], out[2 * y, 2 * x + 1], out[2 * y + 1, 2 * x], out[2 * y + 1, 2 * x + 1] = e0, e1, e2, e3
    return out


def drawn(face16, plant=False):
    """Os desenhos de 16 px ampliados com bordas suaves (Scale2x duas vezes), com uma luz leve de cima."""
    img = scale2x(scale2x(face16))
    rgb, a = img[..., :3].copy(), img[..., 3].copy()
    a = np.where(a > 0.5, 1.0, 0.0) if plant else a
    light = 1.04 - 0.08 * (xx + yy) / (2 * N)
    rgb = np.clip(rgb * light[..., None], 0, 1)
    # contorno um pouco mais escuro onde a figura encosta no transparente
    if (a < 0.5).any():
        solid = a > 0.5
        nb = np.zeros_like(solid)
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nb |= ~np.roll(np.roll(solid, dy, 0), dx, 1)
        rgb[solid & nb] *= 0.78
    return np.dstack([rgb, a])


# ----------------------------------------------------------------------------- cores e receitas
class Old:
    def __init__(self, name):
        p = os.path.join(SRC, name + ".png")
        if not os.path.exists(p):
            p = os.path.join(DIR, name + ".png")
        im = np.asarray(Image.open(p).convert("RGBA")).astype(float) / 255
        self.img, self.cell = im, im.shape[1] // 4

    def face(self, f):
        cx, cy = CELLS[f]
        c = self.cell
        return self.img[cy * c:(cy + 1) * c, cx * c:(cx + 1) * c]

    def mean(self, f):
        fc = self.face(f)
        m = fc[..., 3] > 0.5
        return fc[..., :3][m].mean(0) if m.any() else C(0.5, 0.5, 0.5)

    def alpha(self, f):
        fc = self.face(f)[..., 3]
        k = N // fc.shape[0]
        return np.kron(fc, np.ones((k, k))) if k > 1 else fc


STONES = {
    "pedra": C(0.52, 0.52, 0.53),
    "andesito": C(0.55, 0.55, 0.56),
    "diorito": C(0.74, 0.74, 0.74),
    "granito": C(0.6, 0.43, 0.37),
    "ardosiabismo": C(0.3, 0.3, 0.33),
}
ORES = {
    "minerio_carvao": C(0.16, 0.16, 0.17),
    "minerio_ferro": C(0.86, 0.68, 0.53),
    "minerio_ouro": C(1.0, 0.86, 0.25),
    "minerio_cobre": C(0.9, 0.52, 0.32),
    "minerio_cristal": C(0.42, 0.93, 0.92),
    "minerio_esmeralda": C(0.28, 0.86, 0.45),
    "minerio_rubi": C(0.92, 0.16, 0.24),
    "minerio_safira": C(0.2, 0.42, 0.96),
    "minerio_ametista": C(0.7, 0.4, 0.95),
}
# blocos de gemas (sem textura antiga de 16 px): a cor da gema
GEM_BLOCKS = {"bloco_rubi": C(0.86, 0.16, 0.24), "bloco_safira": C(0.2, 0.4, 0.92), "bloco_ametista": C(0.66, 0.38, 0.9)}
PLANTS = {"flor_amarela", "flor_vermelha", "grama_alta", "muda", "muda_betula", "muda_cerejeira", "cana", "tocha",
          "pingente_gelo", "escada_mao"} | {f"{c}_{i}" for c in ("trigo", "batata", "cenoura", "beterraba") for i in (1, 2, 3)}


def faces_for(name):
    out = {}
    each = lambda fn: {f: fn(rng_for(name, f), f) for f in CELLS}
    if name in STONES:
        b = STONES[name]
        if name == "granito":
            return each(lambda r, f: rgba(blobs(stone(r, b), r, 22, 1.0, 2.0, [C(0.78, 0.6, 0.55), C(0.36, 0.25, 0.22), C(0.85, 0.82, 0.8)], outline=0.85)))
        if name == "diorito":
            return each(lambda r, f: rgba(blobs(stone(r, b), r, 26, 0.9, 1.8, [C(0.35, 0.35, 0.36), C(0.95, 0.95, 0.95)], outline=0.8)))
        if name == "ardosiabismo":
            return each(lambda r, f: rgba(cells_stone(r, b, 10, mortar=0.6, var=0.08, bevel=0.14, gap=0.9, sx=0.6, sy=1.6)))
        return each(lambda r, f: rgba(stone(r, b)))
    if name in ORES:
        return each(lambda r, f: rgba(ore(r, STONES["pedra"], ORES[name], C(0.05, 0.05, 0.06) if name == "minerio_carvao" else None)))
    if name in GEM_BLOCKS:
        return each(lambda r, f: rgba(metal(r, GEM_BLOCKS[name], gem=True)))
    old = Old(name)
    m = old.mean
    if name in ("terra", "caminho", "terra_arada"):
        dc = m("front")
        out = {f: rgba(dirt(rng_for(name, f), dc)) for f in CELLS}
        if name == "caminho":
            t = cells_stone(rng_for(name, "t"), m("top") * 1.02, 9, mortar=0.82, var=0.06, bevel=0.08, gap=0.8)
            out["top"] = rgba(t)
            for f in SIDES:
                s = dirt(rng_for(name, f), dc)
                s[yy < 3] = m("top") * 0.95
                out[f] = rgba(s)
        if name == "terra_arada":
            t = dirt(rng_for(name, "t"), m("top") * 0.92)
            row = (yy % 16)
            t[row < 2] *= 0.7
            t[(row >= 2) & (row < 4)] *= 1.12
            out["top"] = rgba(t)
        return out
    if name == "grama":
        gc, dc = m("top"), m("bottom")
        out["top"] = rgba(grass_top(rng_for(name, "top"), gc))
        out["bottom"] = rgba(dirt(rng_for(name, "bottom"), dc))
        for f in SIDES:
            out[f] = rgba(grass_side(rng_for(name, f), gc, dc))
        return out
    if name == "areia":
        return each(lambda r, f: rgba(sand(r, m(f))))
    if name == "arenito":
        return each(lambda r, f: rgba(sandstone(r, m(f), f)))
    if name == "cascalho":
        return each(lambda r, f: rgba(cells_stone(r, m(f) * 1.05, 34, mortar=0.5, var=0.22, bevel=0.2, gap=1.0, tones=C(0.62, 0.55, 0.5))))
    if name == "pedregulho":
        return each(lambda r, f: rgba(cells_stone(r, m(f) * 1.25, 12, mortar=0.45, var=0.12, bevel=0.2, gap=1.3)))
    if name == "rocha_mae":
        return each(lambda r, f: rgba(bedrock(r, m(f))))
    if name == "neve":
        return each(lambda r, f: rgba(snow(r, m(f) * 1.02)))
    if name in ("gelo", "gelo_azul", "gelo_compacto"):
        return {f: rgba(ice(rng_for(name, f), m(f), name != "gelo_compacto"), old.alpha(f)) for f in CELLS}
    if name == "agua":
        return {f: rgba(water(rng_for(name, f), m(f)), old.alpha(f)) for f in CELLS}
    if name == "lava":
        return each(lambda r, f: rgba(lava(r, m(f))))
    if name.startswith("tronco"):
        kind = {"tronco_betula": "birch", "tronco_cerejeira": "cherry"}.get(name, "oak")
        bc = m("front")
        for f in SIDES:
            out[f] = rgba(bark(rng_for(name, f), bc, kind))
        for f in ("top", "bottom"):
            out[f] = rgba(rings(rng_for(name, f), m("top"), bc))
        return out
    if name.startswith("tabuas"):
        return each(lambda r, f: rgba(planks(r, m(f))))
    if name.startswith("folhas"):
        for f in CELLS:
            rgb, a = leaves(rng_for(name, f), m(f) * 1.05, name == "folhas_cerejeira", (old.face(f)[..., 3] < 0.5).any())
            out[f] = rgba(rgb, a)
        return out
    if name == "tijolos":
        return each(lambda r, f: rgba(bricks(r, m(f) * 1.04, 4, 2)))
    if name == "tijolos_pedra":
        return each(lambda r, f: rgba(bricks(r, m(f) * 1.45, 2, 2, C(0.36, 0.36, 0.37), bevel=0.16)))
    if name in ("bloco_ferro", "bloco_ouro", "bloco_cobre"):
        return each(lambda r, f: rgba(metal(r, m(f) * 1.04)))
    if name == "bloco_esmeralda":
        return each(lambda r, f: rgba(metal(r, m(f), gem=True)))
    if name == "la":
        return each(lambda r, f: rgba(wool(r, m(f))))
    if name == "feno":
        return each(lambda r, f: rgba(hay(r, m(f), f)))
    if name == "abobora":
        return each(lambda r, f: rgba(ribbed(r, m(f), f, 8, stem=C(0.35, 0.42, 0.15))))
    if name == "melancia":
        return each(lambda r, f: rgba(ribbed(r, m(f), f, 8, stem=C(0.42, 0.36, 0.16), stripes=True)))
    if name == "cacto":
        return {f: rgba(cactus(rng_for(name, f), m(f), f), old.alpha(f)) for f in CELLS}
    if name == "vidro":
        res = {}
        for f in CELLS:
            rgb, a = glass(None)
            res[f] = rgba(rgb, a)
        return res
    if old.cell != 16:
        return None  # sem desenho de 16 px para ampliar
    return {f: drawn(old.face(f), plant=name in PLANTS) for f in CELLS}


def build(name):
    faces = faces_for(name)
    if not faces:
        return False
    net = np.zeros((3 * N, 4 * N, 4))
    for f, img in faces.items():
        cx, cy = CELLS[f]
        net[cy * N:(cy + 1) * N, cx * N:(cx + 1) * N] = img
    Image.fromarray((np.clip(net, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(DIR, name + ".png"))
    return True


if __name__ == "__main__":
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(DIR) if f.endswith(".png") and not f.startswith("_"))
    done = [n for n in names if build(n)]
    print(f"{len(done)} texturas: {', '.join(done)}")
