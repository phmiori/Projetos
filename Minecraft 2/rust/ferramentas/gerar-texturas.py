# -*- coding: utf-8 -*-
"""Refaz as texturas dos blocos em 64 px por face, no estilo realista da pedra e dos minérios.

Uso (na pasta "Minecraft 2"):  python rust/ferramentas/gerar-texturas.py [nome ...]
Sem nomes, refaz todas as texturas de 16 px da pasta textures/ (as de 64 px, como pedra e minérios, ficam).
Cada PNG é um "cubo aberto" de 4 x 3 células:   [topo] / [esquerda][frente][direita][trás] / [base].
A cor de cada face vem da textura antiga (16 px), então cada bloco continua reconhecível; o relevo, os
veios, as rachaduras e a luz são gerados aqui. Os materiais naturais são feitos do zero; os blocos com
desenho (baú, porta, fornalha, plantas...) são ampliados e ganham a textura do material.
"""
import hashlib
import os
import sys

import numpy as np
from PIL import Image

N = 64  # pixels por face
DIR = "textures"
# as texturas de 16 px de antes: de onde vêm as cores (assim dá para rodar de novo e ajustar)
SRC = os.path.join(DIR, "originais-16px")
# célula (coluna, linha) de cada face no PNG
CELLS = {"top": (1, 0), "left": (0, 1), "front": (1, 1), "right": (2, 1), "back": (3, 1), "bottom": (1, 2)}
SIDES = ["left", "front", "right", "back"]


# ----------------------------------------------------------------------------- ruído que emenda nas bordas
def rng_for(*key):
    h = hashlib.sha1("/".join(str(k) for k in key).encode()).digest()
    return np.random.default_rng(int.from_bytes(h[:8], "little"))


def smooth(t):
    return t * t * (3 - 2 * t)


def value_noise(rng, px, py=None):
    """Ruído de valor com `px` x `py` células, repetindo nas bordas (as faces emendam com os vizinhos)."""
    py = py or px
    px, py = max(1, int(round(px))), max(1, int(round(py)))
    g = rng.random((py, px))
    ys = np.arange(N) * py / N
    xs = np.arange(N) * px / N
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = smooth(ys - y0)[:, None]
    fx = smooth(xs - x0)[None, :]
    y1, x1 = (y0 + 1) % py, (x0 + 1) % px
    a = g[y0][:, x0]
    b = g[y0][:, x1]
    c = g[y1][:, x0]
    d = g[y1][:, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def fbm(rng, base=4, octaves=4, gain=0.5, sx=1, sy=1):
    s = np.zeros((N, N))
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        p = base * 2 ** o
        s += value_noise(rng, max(1, p * sx), max(1, p * sy)) * amp
        tot += amp
        amp *= gain
    return s / tot


def worley(rng, n):
    """Células (pedrinhas): distância ao ponto mais perto (f1), ao segundo (f2) e o número da célula."""
    pts = rng.random((n, 2)) * N
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    best = np.full((N, N), 1e9)
    second = np.full((N, N), 1e9)
    ident = np.zeros((N, N), int)
    for i, (px, py) in enumerate(pts):
        for ox in (-N, 0, N):
            for oy in (-N, 0, N):
                d = np.hypot(xx - px - ox, yy - py - oy)
                closer = d < best
                second = np.where(closer, best, np.minimum(second, d))
                ident = np.where(closer, i, ident)
                best = np.where(closer, d, best)
    return best, second, ident


def shade(h, strength=3.0, light=(-0.55, -0.65, 0.52)):
    """Luz de relevo: a altura vira normal, iluminada de cima à esquerda (como a pedra)."""
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * 0.5 * strength * 8
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * 0.5 * strength * 8
    nz = 1.0 / np.sqrt(gx * gx + gy * gy + 1)
    l = np.array(light) / np.linalg.norm(light)
    d = (-gx * l[0] - gy * l[1] + l[2]) * nz
    return np.clip(1.0 + 0.85 * (d - l[2]), 0.35, 1.45)


def blur(a, r=1):
    out = a.copy()
    for _ in range(r):
        out = (out + np.roll(out, 1, 0) + np.roll(out, -1, 0) + np.roll(out, 1, 1) + np.roll(out, -1, 1)) / 5
    return out


def tint(albedo_scalar, color, spread=0.35):
    """Cor = cor média da face antiga, variando com o mapa (0..1)."""
    c = np.array(color, float)[None, None, :]
    k = 1 + (albedo_scalar[..., None] - 0.5) * 2 * spread
    return np.clip(c * k, 0, 1)


def rgba(rgb, alpha=None):
    a = np.ones((N, N)) if alpha is None else alpha
    return np.dstack([np.clip(rgb, 0, 1), np.clip(a, 0, 1)])


# ----------------------------------------------------------------------------- a textura antiga (cores e formas)
class Old:
    def __init__(self, name):
        src = os.path.join(SRC, name + ".png")
        if not os.path.exists(src):
            src = os.path.join(DIR, name + ".png")
        self.img = np.asarray(Image.open(src).convert("RGBA")).astype(float) / 255
        self.cell = self.img.shape[1] // 4

    def face(self, f):
        cx, cy = CELLS[f]
        c = self.cell
        return self.img[cy * c:(cy + 1) * c, cx * c:(cx + 1) * c]

    def mean(self, f, mask=None):
        a = self.face(f)
        m = a[..., 3] > 0.5
        if mask is not None:
            m &= mask
        if not m.any():
            return np.array([0.5, 0.5, 0.5])
        return a[..., :3][m].mean(0)

    def up(self, f, smooth_edges=False):
        """A face antiga ampliada para 64 px (vizinho mais próximo; com smooth_edges o contorno fica arredondado)."""
        a = self.face(f)
        k = N // a.shape[0]
        big = np.repeat(np.repeat(a, k, 0), k, 1)
        if smooth_edges:
            al = big[..., 3]
            soft = blur(al, 3)
            big = big.copy()
            big[..., 3] = (soft > 0.5).astype(float)
            # a cor dos pixels que entraram no contorno vem dos vizinhos
            col = big[..., :3] * al[..., None]
            w = blur(al, 3)[..., None] + 1e-6
            filled = blur_rgb(col, 3) / w
            big[..., :3] = np.where(al[..., None] > 0.5, big[..., :3], filled)
        return big


def blur_rgb(c, r):
    return np.dstack([blur(c[..., i], r) for i in range(c.shape[2])])


# ----------------------------------------------------------------------------- materiais
STONE_DETAIL = None


def stone_detail():
    """A luminância da face da pedra nova: o mesmo grão para tudo o que é rocha."""
    global STONE_DETAIL
    if STONE_DETAIL is None:
        p = Old("pedra")
        f = p.face("front")
        im = Image.fromarray((f * 255).astype(np.uint8)).resize((N, N), Image.BILINEAR)
        lum = np.asarray(im).astype(float)[..., :3].mean(2) / 255
        STONE_DETAIL = (lum - lum.min()) / (lum.max() - lum.min() + 1e-6)
    return STONE_DETAIL


def dirt(rng, color):
    h = fbm(rng, 4, 4) * 0.7 + fbm(rng, 16, 2) * 0.3
    _, _, ident = worley(rng, 26)
    f1, _, _ = worley(rng, 26)
    pebbles = np.clip(1 - f1 / 3.2, 0, 1)
    cell_tone = rng.random(26)[ident]
    alb = h * 0.75 + pebbles * (cell_tone - 0.5) * 0.6 + 0.12
    rgb = tint(alb, color, 0.4) * shade(h * 0.7 + pebbles * 0.18, 2.0)[..., None]
    return rgb


def grass_top(rng, color):
    blades = fbm(rng, 16, 3, sx=1, sy=1) * 0.6 + fbm(rng, 32, 1) * 0.4
    patches = fbm(rng, 3, 3)
    alb = blades * 0.7 + patches * 0.3
    rgb = tint(alb, color, 0.45)
    # um pouco de amarelo onde está mais claro
    rgb[..., 0] += (patches - 0.5) * 0.08
    return np.clip(rgb * shade(blades, 2.5)[..., None], 0, 1)


def grass_side(rng, grass_col, dirt_col):
    d = dirt(rng, dirt_col)
    g = grass_top(rng_for("gs", rng.random()), grass_col)
    edge = 9 + fbm(rng, 8, 2, sy=0.01)[0] * 10  # quanto a grama desce em cada coluna
    tufts = (value_noise(rng, 32, 1)[0] > 0.62) * 6
    edge = edge + tufts
    yy = np.arange(N)[:, None]
    m = (yy < edge[None, :]).astype(float)
    shadow = np.clip(1 - (yy - edge[None, :]) / 4, 0, 1) * (yy >= edge[None, :])
    rgb = g * m[..., None] + d * (1 - m[..., None]) * (1 - 0.35 * shadow[..., None])
    return rgb


def sand(rng, color, ripples=True):
    h = fbm(rng, 4, 4) * 0.55 + fbm(rng, 32, 1) * 0.25 + value_noise(rng, 64) * 0.2
    if ripples:
        yy, xx = np.mgrid[0:N, 0:N]
        h = h * 0.88 + 0.12 * (0.5 + 0.5 * np.sin((yy + fbm(rng, 2, 2) * 14) * 2 * np.pi / 21))
    rgb = tint(h, color, 0.16) * shade(h, 0.55)[..., None]
    grains = value_noise(rng, 64) > 0.93
    rgb[grains] *= 0.86
    return rgb


def sandstone(rng, color, face):
    if face in ("top", "bottom"):
        h = fbm(rng, 4, 4) * 0.75 + value_noise(rng, 64) * 0.25
        return tint(h, color, 0.14) * shade(h, 0.6)[..., None]
    yy = np.arange(N)[:, None] + fbm(rng, 2, 2, sy=1) * 3
    bands = 0.5 + 0.25 * np.sin(yy * 2 * np.pi / 10.7) * (0.6 + 0.4 * fbm(rng, 4, 2))
    h = bands * 0.4 + fbm(rng, 8, 3) * 0.35 + value_noise(rng, 64) * 0.25
    rgb = tint(h, color, 0.16) * shade(h, 1.0)[..., None]
    # faixa de cima e de baixo mais lisas, como o arenito talhado
    for y0, y1 in ((0, 6), (N - 6, N)):
        rgb[y0:y1] = tint(h[y0:y1] * 0.4 + 0.3, color, 0.1)
    rgb[6] *= 0.88
    rgb[N - 7] *= 0.88
    return rgb


def stones(rng, color, n, mortar_dark=0.45, mortar=0.16, spread=0.45, relief=4.0):
    f1, f2, ident = worley(rng, n)
    edge = f2 - f1
    tone = rng.random(n)[ident]
    detail = stone_detail()
    dome = np.clip(edge / 6, 0, 1)
    h = dome * 0.65 + detail * 0.25 + fbm(rng, 16, 2) * 0.1
    alb = tone * 0.55 + detail * 0.45
    rgb = tint(alb, color, spread) * shade(h, relief)[..., None]
    gap = edge < N * mortar / 6
    rgb[gap] *= mortar_dark
    return rgb


def bedrock(rng, color):
    f1, f2, ident = worley(rng, 22)
    tone = rng.random(22)[ident]
    h = np.clip((f2 - f1) / 5, 0, 1) * 0.6 + fbm(rng, 8, 3) * 0.4
    alb = tone * 0.6 + fbm(rng, 16, 2) * 0.4
    rgb = tint(alb, color, 0.75) * shade(h, 4)[..., None]
    return rgb


def snow(rng, color):
    h = fbm(rng, 4, 4)
    rgb = tint(h, color, 0.05) * shade(h, 1.0)[..., None]
    rgb[..., 2] = np.minimum(1, rgb[..., 2] * 1.03)
    sparkle = value_noise(rng, 64) > 0.95
    rgb[sparkle] = np.minimum(1, rgb[sparkle] * 1.08)
    return rgb


def ice(rng, color, cracks=0.6, streak=True):
    h = fbm(rng, 2, 4) * 0.7
    if streak:
        h += fbm(rng, 1, 3, sx=1, sy=6) * 0.3
    f1, f2, _ = worley(rng, 9)
    crack = np.clip(1 - (f2 - f1) / 1.2, 0, 1) * (fbm(rng, 4, 2) > 0.45)
    rgb = tint(h, color, 0.12)
    rgb = rgb * (1 - crack[..., None] * 0.25 * cracks) + crack[..., None] * 0.15 * cracks
    return np.clip(rgb * shade(h, 0.8)[..., None], 0, 1)


def water(rng, color):
    h = fbm(rng, 4, 3) * 0.6 + fbm(rng, 2, 2, sx=2, sy=1) * 0.4
    return tint(h, color, 0.12)


def lava(rng, color):
    flow = fbm(rng, 2, 4)
    swirl = fbm(rng, 4, 3)
    hot = np.array([1.0, 0.9, 0.42])
    mid = np.array([0.98, 0.5, 0.08])
    deep = np.array([0.78, 0.22, 0.03])
    t = np.clip(flow * 1.4 - 0.2, 0, 1)[..., None]
    rgb = hot * (1 - t) + mid * t
    rgb = rgb * (1 - np.clip(swirl - 0.6, 0, 1)[..., None] * 1.5) + deep * np.clip(swirl - 0.6, 0, 1)[..., None] * 1.5
    f1, f2, _ = worley(rng, 10)
    crust = np.clip((0.42 - flow) * 5, 0, 1) * np.clip((f2 - f1) / 5 - 0.2, 0, 1)
    dark = np.array([0.3, 0.07, 0.02])
    rgb = rgb * (1 - crust[..., None]) + dark * crust[..., None]
    return np.clip(rgb * shade(swirl * 0.3 + crust * 0.4, 1.2)[..., None], 0, 1)


def bark(rng, color, birch=False):
    grooves = fbm(rng, 8, 3, sx=1, sy=0.125)
    fine = fbm(rng, 32, 1, sx=1, sy=0.25)
    h = grooves * 0.75 + fine * 0.25
    if birch:
        rgb = tint(fbm(rng, 4, 2) * 0.3 + 0.6, np.maximum(color, 0.75), 0.15)
        # marcas pretas na horizontal
        marks = fbm(rng, 4, 3, sx=0.6, sy=4)
        m = np.clip((marks - 0.64) * 9, 0, 1)
        m = blur(m, 1)
        rgb = rgb * (1 - m[..., None] * 0.7)
        return np.clip(rgb * shade(h * 0.4 + m * 0.3, 1.5)[..., None], 0, 1)
    rgb = tint(h, color, 0.45)
    deep = h < 0.36
    rgb[deep] *= 0.75
    return np.clip(rgb * shade(h, 2.6)[..., None], 0, 1)


def rings(rng, wood_color, bark_color):
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    r = np.hypot(xx - 31.5, yy - 31.5) + fbm(rng, 4, 3) * 5
    ring = 0.5 + 0.5 * np.sin(r * 2 * np.pi / (3.4 + fbm(rng, 2, 2) * 2.5))
    rgb = tint(ring * 0.35 + fbm(rng, 16, 2) * 0.35 + fbm(rng, 4, 2) * 0.3, wood_color, 0.3)
    edge = np.maximum(np.abs(xx - 31.5), np.abs(yy - 31.5)) > 27
    rgb[edge] = bark(rng, bark_color)[edge]
    crack = (np.abs(np.arctan2(yy - 31.5, xx - 31.5) - 0.7) < 0.04) & (r < 22)
    rgb[crack] *= 0.55
    return rgb * shade(ring * 0.15 + fbm(rng, 16, 1) * 0.15, 1.2)[..., None]


def planks(rng, color):
    rgb = np.zeros((N, N, 3))
    yy, xx = np.mgrid[0:N, 0:N]
    for b in range(4):
        y0 = b * 16
        sub = rng_for("tabua", rng.random())
        grain = fbm(sub, 2, 4, sx=1, sy=8)
        knots_f1, _, _ = worley(sub, 2)
        knot = np.clip(1 - knots_f1 / 4, 0, 1) * (sub.random() > 0.4)
        tone = 0.9 + sub.random() * 0.2
        g = grain * 0.8 + 0.2 * (0.5 + 0.5 * np.sin(xx * 0.35 + grain * 9))
        board = tint(g - knot * 0.6, color * tone, 0.32)
        rgb[y0:y0 + 16] = board[y0:y0 + 16]
        # emenda vertical de cada tábua, desencontrada
        sx = (b * 23 + 11) % N
        rgb[y0:y0 + 16, sx] *= 0.55
        rgb[y0:y0 + 16, (sx + 1) % N] *= 0.85
        rgb[y0] *= 0.5
        rgb[(y0 + 15)] *= 0.78
        rgb[y0 + 1] *= 1.08
    h = fbm(rng, 2, 3, sx=1, sy=8)
    return np.clip(rgb * shade(h, 1.2)[..., None], 0, 1)


def leaves(rng, color, pink=False):
    f1, f2, ident = worley(rng, 120)
    tone = rng.random(120)[ident]
    leaf = np.clip(1 - f1 / 4.5, 0, 1)
    a = (leaf * 0.6 + fbm(rng, 8, 2) * 0.6 > 0.36).astype(float)
    h = np.clip((f2 - f1) / 3, 0, 1) * 0.5 + fbm(rng, 16, 2) * 0.5
    alb = tone * 0.55 + h * 0.45
    rgb = tint(alb, color, 0.55) * shade(h, 1.8)[..., None]
    if pink:
        blossom = value_noise(rng, 32) > 0.75
        rgb[blossom] = np.minimum(1, rgb[blossom] * 1.15 + 0.05)
    # o fundo de dentro da copa, mais escuro, onde não há folha (fica opaco nas bordas da folhagem)
    return rgb, a


def bricks(rng, color, rows=4, cols=2, mortar_col=(0.72, 0.70, 0.66), stone=False):
    rgb = np.zeros((N, N, 3))
    hgt = np.zeros((N, N))
    bh, bw = N // rows, N // cols
    yy, xx = np.mgrid[0:N, 0:N]
    detail = stone_detail()
    for r in range(rows):
        off = (bw // 2) * (r % 2)
        for c in range(cols + 1):
            x0 = c * bw - off
            sub = rng_for("tijolo", r, c, rng.random())
            tone = 0.85 + sub.random() * 0.3
            m = (yy >= r * bh) & (yy < (r + 1) * bh) & (((xx - x0) % N) < bw)
            n = fbm(sub, 8, 3) if not stone else detail
            local = tint(n, np.array(color) * tone, 0.3 if not stone else 0.38)
            rgb[m] = local[m]
            ly, lx = yy - r * bh, (xx - x0) % N
            dome = np.minimum(np.minimum(ly, bh - 1 - ly), np.minimum(lx, bw - 1 - lx))
            hgt[m] = np.clip(dome[m] / 3, 0, 1) * 0.8 + n[m] * 0.2
    gap = hgt < 0.2
    mort = tint(fbm(rng, 16, 2), mortar_col, 0.25)
    rgb[gap] = mort[gap]
    return np.clip(rgb * shade(hgt, 3.5)[..., None], 0, 1)


def metal_block(rng, color, gem=False):
    yy, xx = np.mgrid[0:N, 0:N]
    brushed = fbm(rng, 1, 3, sx=32, sy=0.5) * 0.6 + value_noise(rng, 64) * 0.4
    border = np.minimum(np.minimum(xx, N - 1 - xx), np.minimum(yy, N - 1 - yy))
    h = np.clip(border / 4, 0, 1)
    if gem:
        # placas facetadas
        cell = ((xx // 32) + (yy // 32)) % 2
        h = h * 0.6 + (0.4 * cell)
        brushed = fbm(rng, 4, 2) * 0.5 + 0.25
    rgb = tint(brushed, color, 0.22)
    sh = shade(h, 3.0)
    rgb = rgb * sh[..., None]
    shine = np.clip(1 - np.abs(xx - yy - 8) / 10.0, 0, 1) * 0.18
    rgb = rgb + shine[..., None]
    rgb[border < 1] *= 0.6
    return np.clip(rgb, 0, 1)


def wool(rng, color):
    fib = fbm(rng, 8, 3) * 0.5 + fbm(rng, 4, 2, sx=2, sy=1) * 0.35 + value_noise(rng, 64) * 0.15
    return tint(fib, color, 0.1) * shade(fib, 0.7)[..., None]


def hay(rng, color, face):
    if face in ("top", "bottom"):
        yy, xx = np.mgrid[0:N, 0:N].astype(float)
        straw = fbm(rng, 2, 3, sx=6, sy=1) * 0.5 + fbm(rng, 2, 3, sx=1, sy=6) * 0.5
        return tint(straw, color, 0.42) * shade(straw, 1.8)[..., None]
    straw = fbm(rng, 1, 3, sx=32, sy=0.5)
    rgb = tint(straw, color, 0.45)
    for y in (14, 15, 48, 49):  # as cordas
        rgb[y] = rgb[y] * 0.55 + np.array([0.55, 0.12, 0.08]) * 0.45
    return rgb * shade(straw, 2.4)[..., None]


def ribbed(rng, color, face, ribs=8, stem=None, stripes=False):
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    if face in ("top", "bottom"):
        r = np.hypot(xx - 31.5, yy - 31.5)
        ang = np.arctan2(yy - 31.5, xx - 31.5)
        h = 0.5 + 0.18 * np.cos(ang * ribs + fbm(rng, 2, 2) * 2) * np.clip((r - 6) / 26, 0, 1)
        rgb = tint(h * 0.4 + fbm(rng, 8, 3) * 0.6, color, 0.3) * shade(h * 0.6 + np.clip(1 - r / 8, 0, 1) * 0.3, 1.6)[..., None]
        if stem is not None and face == "top":
            m = r < 5
            rgb[m] = tint(fbm(rng, 16, 1), stem, 0.3)[m]
        return rgb
    n = fbm(rng, 4, 3)
    h = 0.5 + 0.5 * np.cos((xx + (fbm(rng, 1, 2, sx=1, sy=2) - 0.5) * 6) * 2 * np.pi / (N / (ribs / 2)))
    if stripes:
        st = (np.sin((xx + n * 6) * 2 * np.pi / 16) > 0.35)
        base = tint(n, color, 0.3)
        base[st] *= 0.62
        return base * shade(h * 0.5 + n * 0.2, 2)[..., None]
    return tint(h * 0.5 + n * 0.5, color, 0.35) * shade(h * 0.8, 2.5)[..., None]


def cactus(rng, color, face):
    yy, xx = np.mgrid[0:N, 0:N].astype(float)
    n = fbm(rng, 4, 3)
    if face in ("top", "bottom"):
        r = np.hypot(xx - 31.5, yy - 31.5)
        h = n * 0.7 + 0.3 * np.clip(1 - r / 30, 0, 1)
        rgb = tint(h, color * 1.08, 0.3) * shade(h, 1.5)[..., None]
        spines = (value_noise(rng, 64) > 0.95)
        rgb[spines] = np.array([0.93, 0.92, 0.78])
        return rgb
    h = 0.5 + 0.5 * np.cos(xx * 2 * np.pi / 16)
    rgb = tint(h * 0.6 + n * 0.4, color, 0.4) * shade(h, 2.5)[..., None]
    spines = (value_noise(rng, 64) > 0.94) & (h > 0.7)
    rgb[spines] = np.array([0.93, 0.92, 0.78])
    return rgb


def glass(rng, old_face):
    a = old_face[..., 3]
    rgb = old_face[..., :3].copy()
    yy, xx = np.mgrid[0:N, 0:N]
    border = np.minimum(np.minimum(xx, N - 1 - xx), np.minimum(yy, N - 1 - yy))
    frame = border < 3
    out_a = np.where(frame, 1.0, 0.0)
    streak = (np.abs((xx + yy) - 40) < 2) | (np.abs((xx + yy) - 48) < 1)
    streak &= (xx > 8) & (yy > 8) & (xx < 40)
    out_a = np.where(streak, 0.55, out_a)
    col = np.where(frame[..., None], np.array([0.82, 0.88, 0.9]) * (0.8 + 0.2 * fbm(rng, 16, 1)[..., None]), 1.0)
    col[border == 0] *= 0.7
    return np.dstack([col, out_a])


# ----------------------------------------------------------------------------- blocos com desenho: ampliar e dar textura
def is_wood(c):
    r, g, b = c
    return r > g > b and r - b > 0.12 and r < 0.95


def is_gray(c):
    return max(c) - min(c) < 0.08


def detailize(rng, big, plant=False):
    """Mantém o desenho (cores e formas) e põe o grão do material de cada pedaço: madeira, pedra ou fino."""
    rgb = big[..., :3].copy()
    a = big[..., 3]
    wood = fbm(rng, 2, 4, sx=1, sy=8) * 0.7 + fbm(rng, 16, 1) * 0.3
    stone = stone_detail()
    fine = fbm(rng, 16, 2) * 0.6 + value_noise(rng, 64) * 0.4
    k = 4
    small = big[::k, ::k, :3]
    kind = np.zeros(small.shape[:2], int)
    for y in range(small.shape[0]):
        for x in range(small.shape[1]):
            c = small[y, x]
            kind[y, x] = 1 if is_wood(c) else 2 if is_gray(c) else 0
    kind = np.repeat(np.repeat(kind, k, 0), k, 1)
    det = np.where(kind == 1, wood, np.where(kind == 2, stone, fine))
    amp = np.where(kind == 1, 0.36, np.where(kind == 2, 0.42, 0.22 if not plant else 0.14))
    rgb = rgb * (1 + (det - 0.5) * amp)[..., None]
    # cada pixel antigo vira um pouco arredondado: sombra embaixo e à direita, brilho em cima e à esquerda
    lum = blur(rgb.mean(2), 1)
    rgb = rgb * shade(lum * (0.5 if not plant else 0.35) + det * (0.15 if not plant else 0.05), 2.2)[..., None]
    if plant:
        # contorno escuro onde a planta encosta no transparente
        edge = (a > 0.5) & (blur(a, 1) < 0.85)
        rgb[edge] *= 0.75
    return np.dstack([np.clip(rgb, 0, 1), a])


# ----------------------------------------------------------------------------- receitas de cada arquivo
PLANTS = {"flor_amarela", "flor_vermelha", "grama_alta", "muda", "muda_betula", "muda_cerejeira", "cana", "tocha",
          "pingente_gelo", "escada_mao"} | {f"{c}_{i}" for c in ("trigo", "batata", "cenoura", "beterraba") for i in (1, 2, 3)}
DESIGNED = {"bancada", "bau", "cama", "dinamite", "fornalha", "fornalha_acesa", "porta_baixo", "porta_cima",
            "porta_betula_baixo", "porta_betula_cima", "sino"}


def faces_for(name, old):
    rng = rng_for(name)
    m = old.mean
    out = {}
    same = lambda fn: {f: fn(rng_for(name, f), f) for f in CELLS}
    if name in ("terra", "caminho", "terra_arada"):
        dc = m("front")
        for f in CELLS:
            out[f] = rgba(dirt(rng_for(name, f), dc))
        if name == "caminho":
            t = dirt(rng_for(name, "t"), m("top") * 1.05)
            out["top"] = rgba(t * (0.92 + 0.12 * fbm(rng, 2, 2))[..., None])
        if name == "terra_arada":
            yy = np.arange(N)[:, None]
            furrow = 0.5 + 0.5 * np.sin(yy * 2 * np.pi / 16)
            t = dirt(rng_for(name, "t"), m("top") * 0.9)
            out["top"] = rgba(t * (0.75 + 0.35 * furrow)[..., None] * shade(np.repeat(furrow, N, 1) * 0.5, 2)[..., None])
        return out
    if name == "grama":
        gc, dc = m("top"), m("bottom")
        out["top"] = rgba(grass_top(rng_for(name, "top"), gc))
        out["bottom"] = rgba(dirt(rng_for(name, "bottom"), dc))
        for f in SIDES:
            out[f] = rgba(grass_side(rng_for(name, f), gc, dc))
        return out
    if name == "areia":
        return {f: rgba(sand(rng_for(name, f), m(f))) for f in CELLS}
    if name == "arenito":
        return {f: rgba(sandstone(rng_for(name, f), m(f), f)) for f in CELLS}
    if name == "cascalho":
        return {f: rgba(stones(rng_for(name, f), m(f), 30, 0.55, 0.1, 0.55, 3.0)) for f in CELLS}
    if name == "pedregulho":
        return {f: rgba(stones(rng_for(name, f), m(f) * 1.3, 11, 0.5, 0.24, 0.4, 4.0)) for f in CELLS}
    if name == "rocha_mae":
        return {f: rgba(bedrock(rng_for(name, f), m(f))) for f in CELLS}
    if name == "neve":
        return {f: rgba(snow(rng_for(name, f), m(f))) for f in CELLS}
    if name in ("gelo", "gelo_azul", "gelo_compacto"):
        cr = {"gelo": 0.6, "gelo_azul": 1.0, "gelo_compacto": 0.35}[name]
        return {f: rgba(ice(rng_for(name, f), m(f), cr, name != "gelo_azul"), old.up(f)[..., 3]) for f in CELLS}
    if name == "agua":
        return {f: rgba(water(rng_for(name, f), m(f)), old.up(f)[..., 3]) for f in CELLS}
    if name == "lava":
        return {f: rgba(lava(rng_for(name, f), m(f))) for f in CELLS}
    if name.startswith("tronco"):
        birch = name == "tronco_betula"
        bc = m("front")
        wood = m("top", None)
        for f in SIDES:
            out[f] = rgba(bark(rng_for(name, f), bc, birch))
        for f in ("top", "bottom"):
            out[f] = rgba(rings(rng_for(name, f), wood, bc))
        return out
    if name.startswith("tabuas"):
        return {f: rgba(planks(rng_for(name, f), m(f))) for f in CELLS}
    if name.startswith("folhas"):
        for f in CELLS:
            rgb, a = leaves(rng_for(name, f), m(f), name == "folhas_cerejeira")
            out[f] = rgba(rgb, a)
        return out
    if name == "tijolos":
        return {f: rgba(bricks(rng_for(name, f), m(f) * 1.04, 4, 2)) for f in CELLS}
    if name == "tijolos_pedra":
        return {f: rgba(bricks(rng_for(name, f), m(f) * 1.1, 2, 2, (0.25, 0.25, 0.26), stone=True)) for f in CELLS}
    if name.startswith("tabuas_cerejeira"):
        return {f: rgba(planks(rng_for(name, f), m(f))) for f in CELLS}
    if name in ("bloco_ferro", "bloco_ouro", "bloco_cobre"):
        return {f: rgba(metal_block(rng_for(name, f), m(f) * 1.05)) for f in CELLS}
    if name == "bloco_esmeralda":
        return {f: rgba(metal_block(rng_for(name, f), m(f), gem=True)) for f in CELLS}
    if name == "la":
        return {f: rgba(wool(rng_for(name, f), m(f))) for f in CELLS}
    if name == "feno":
        return {f: rgba(hay(rng_for(name, f), m(f), f)) for f in CELLS}
    if name == "abobora":
        return {f: rgba(ribbed(rng_for(name, f), m(f), f, 10, stem=np.array([0.35, 0.42, 0.15]))) for f in CELLS}
    if name == "melancia":
        return {f: rgba(ribbed(rng_for(name, f), m(f), f, 8, stem=np.array([0.42, 0.36, 0.16]), stripes=True)) for f in CELLS}
    if name == "cacto":
        return {f: rgba(cactus(rng_for(name, f), m(f), f), old.up(f)[..., 3]) for f in CELLS}
    if name == "vidro":
        return {f: glass(rng_for(name, f), old.up(f)) for f in CELLS}
    if name in PLANTS:
        return {f: detailize(rng_for(name, f), old.up(f, smooth_edges=name not in ("escada_mao", "tocha")), plant=True) for f in CELLS}
    # blocos com desenho (e qualquer outro que aparecer)
    return {f: detailize(rng_for(name, f), old.up(f)) for f in CELLS}


def build(name):
    old = Old(name)
    if old.cell != 16:
        return False  # já é de alta resolução (pedra, minérios...)
    faces = faces_for(name, old)
    net = np.zeros((3 * N, 4 * N, 4))
    for f, img in faces.items():
        cx, cy = CELLS[f]
        net[cy * N:(cy + 1) * N, cx * N:(cx + 1) * N] = img
    Image.fromarray((np.clip(net, 0, 1) * 255 + 0.5).astype(np.uint8), "RGBA").save(os.path.join(DIR, name + ".png"))
    return True


if __name__ == "__main__":
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith(".png"))
    done = [n for n in names if build(n)]
    print(f"{len(done)} texturas refeitas: {', '.join(done)}")
