# -*- coding: utf-8 -*-
"""Refaz os ícones dos itens (ferramentas, comida, ovos...) em 32 x 32, com mais detalhe que os de 16 px.

Uso (na pasta "Minecraft 2"):  python rust/ferramentas/gerar-icones.py [nome ...]
Lê os desenhos de 16 px guardados em textures/itens/originais-16px (as formas e as cores) e grava os novos em
textures/itens/<nome>.png, que o jogo carrega ao abrir. O desenho é ampliado sem os degraus (Scale2x), cada
parte ganha volume e luz de cima à esquerda, e o material dela: veios na madeira, brilho no metal, facetas nas
pedras preciosas e uma textura leve no resto. Os blocos não entram (o ícone deles é o cubinho com a textura).
"""
import colorsys
import hashlib
import os
import sys

import numpy as np
from PIL import Image

DIR = os.path.join("textures", "itens")
SRC = os.path.join(DIR, "originais-16px")
N = 32


def rng_for(name):
    return np.random.default_rng(int.from_bytes(hashlib.sha1(name.encode()).digest()[:8], "little"))


def scale2x(img):
    """EPX/Scale2x: dobra o tamanho arredondando as diagonais (nada de degrau duplo)."""
    h, w = img.shape[:2]
    pad = np.pad(img, ((1, 1), (1, 1), (0, 0)), mode="edge")
    out = np.zeros((h * 2, w * 2, img.shape[2]), img.dtype)
    eq = lambda a, b: np.all(a == b, axis=-1)
    for y in range(h):
        for x in range(w):
            P = pad[y + 1, x + 1]
            A, B, C, D = pad[y, x + 1], pad[y + 1, x + 2], pad[y + 1, x], pad[y + 2, x + 1]
            e1 = e2 = e3 = e4 = P
            if eq(C, A) and not eq(C, D) and not eq(A, B):
                e1 = A
            if eq(A, B) and not eq(A, C) and not eq(B, D):
                e2 = B
            if eq(D, C) and not eq(D, B) and not eq(C, A):
                e3 = C
            if eq(B, D) and not eq(B, A) and not eq(D, C):
                e4 = D
            out[2 * y, 2 * x], out[2 * y, 2 * x + 1], out[2 * y + 1, 2 * x], out[2 * y + 1, 2 * x + 1] = e1, e2, e3, e4
    return out


def erode_distance(mask, steps=4):
    """Quantos passos até a borda (para o volume de cada parte)."""
    d = np.zeros(mask.shape)
    cur = mask.copy()
    for i in range(steps):
        d += cur
        nb = np.pad(cur, 1, constant_values=False)
        cur = cur & nb[:-2, 1:-1] & nb[2:, 1:-1] & nb[1:-1, :-2] & nb[1:-1, 2:]
    return d / steps


def kind_of(rgb):
    r, g, b = rgb
    hh, l, s = colorsys.rgb_to_hls(r, g, b)
    if s < 0.16 and l > 0.45:
        return "metal"
    if (0.38 < hh < 0.58) and s > 0.45 and l > 0.35:
        return "gema"  # diamante (ciano), esmeralda (verde)
    if 0.04 < hh < 0.12 and s > 0.25 and l < 0.5:
        return "madeira"
    if 0.11 < hh < 0.17 and s > 0.6 and l > 0.45:
        return "ouro"
    return "outro"


def build(name):
    src = np.asarray(Image.open(os.path.join(SRC, name + ".png")).convert("RGBA"))
    if src.shape[:2] != (16, 16):
        src = np.asarray(Image.fromarray(src).resize((16, 16), Image.NEAREST))
    rng = rng_for(name)
    # cada cor diferente do desenho é uma parte (cabo, lâmina, gema...); o Scale2x leva o número junto
    flat = src.reshape(-1, 4)
    colors, inv = np.unique(flat, axis=0, return_inverse=True)
    ids = inv.reshape(16, 16, 1).astype(np.int32)
    both = np.concatenate([src.astype(np.int32), ids], axis=2)
    big = scale2x(both)
    rgba = big[..., :4].astype(float) / 255
    part = big[..., 4]
    a = rgba[..., 3] > 0.5
    rgb = rgba[..., :3].copy()

    # volume: cada parte fica arredondada a partir da borda dela; o desenho todo também
    whole = erode_distance(a, 4)
    h = whole * 0.55
    kinds = {}
    for p in np.unique(part[a]):
        m = (part == p) & a
        h += erode_distance(m, 3) * 0.45 * m
        kinds[p] = kind_of(colors[p][:3] / 255)
        if kinds[p] == "madeira" and ("couro" in name or "escudo" in name):
            kinds[p] = "outro"  # couro não tem veio de madeira
    gx = np.zeros_like(h)
    gy = np.zeros_like(h)
    gx[:, 1:-1] = (h[:, 2:] - h[:, :-2]) / 2
    gy[1:-1] = (h[2:] - h[:-2]) / 2
    light = np.clip(1.0 + (-gx * -0.7 - gy * -0.7) * 1.6, 0.6, 1.35)  # luz de cima à esquerda
    rgb *= light[..., None]

    yy, xx = np.mgrid[0:N, 0:N]
    noise = rng.random((N, N))
    soft = (noise + np.roll(noise, 1, 0) + np.roll(noise, 1, 1) + np.roll(noise, -1, 0) + np.roll(noise, -1, 1)) / 5
    for p, k in kinds.items():
        m = (part == p) & a
        if k == "madeira":
            grain = 0.5 + 0.5 * np.sin((xx + yy) * 1.3 + soft * 4)
            rgb[m] *= (0.88 + 0.2 * grain[m])[:, None]
        elif k in ("metal", "ouro"):
            # brilho na diagonal e no alto de cada parte
            spec = np.clip(1 - np.abs((xx - yy) - (xx[m] - yy[m]).mean()) / 3, 0, 1) * 0.25
            rgb[m] += (spec[m] * (h[m] > 0.45))[:, None]
            rgb[m] *= (0.95 + 0.1 * soft[m])[:, None]
        elif k == "gema":
            facet = ((xx // 3 + yy // 3) % 2) * 0.12
            rgb[m] *= (0.92 + facet[m])[:, None]
            sparkle = (noise > 0.93) & (h > 0.5)
            rgb[m & sparkle] = np.minimum(1, rgb[m & sparkle] + 0.35)
        else:
            rgb[m] *= (0.93 + 0.14 * soft[m])[:, None]

    # contorno: os pixels da borda da figura um pouco mais escuros
    nb = np.pad(a, 1, constant_values=False)
    edge = a & ~(nb[:-2, 1:-1] & nb[2:, 1:-1] & nb[1:-1, :-2] & nb[1:-1, 2:])
    rgb[edge] *= 0.62
    out = np.dstack([np.clip(rgb, 0, 1), a.astype(float)])
    Image.fromarray((out * 255 + 0.5).astype(np.uint8)).save(os.path.join(DIR, name + ".png"))


if __name__ == "__main__":
    # as ferramentas são desenhadas pelo desenhar-ferramentas.py (só a pá e a picareta de diamante, o modelo, vêm daqui)
    tools = {f"{t}_de_{m}" for t in ("picareta", "pa", "machado", "espada", "enxada") for m in ("madeira", "pedra", "ferro", "diamante")}
    tools -= {"picareta_de_diamante", "pa_de_diamante"}
    names = sys.argv[1:] or sorted(f[:-4] for f in os.listdir(SRC) if f.endswith(".png") and f[:-4] not in tools)
    for n in names:
        build(n)
    print(f"{len(names)} ícones refeitos em {N}x{N}")
