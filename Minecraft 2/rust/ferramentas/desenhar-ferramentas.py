# -*- coding: utf-8 -*-
"""Desenha os ícones das ferramentas (picareta, pá, machado, espada e enxada de madeira, pedra, ferro e
diamante) em 32 x 32, no estilo da pá e da picareta de diamante: cabo de madeira na diagonal, cabeça grande
com degradê do claro (em cima à esquerda) para o escuro, e um pontinho do material na ponta do cabo.

Uso (na pasta "Minecraft 2"):  python rust/ferramentas/desenhar-ferramentas.py
Grava em textures/itens/<ferramenta>_de_<material>.png. A pá e a picareta de diamante não são redesenhadas
(são o modelo); o gerar-icones.py deixa as ferramentas para este script.
"""
import hashlib
import os

import numpy as np
from PIL import Image

DIR = os.path.join("textures", "itens")
N = 32
TOOLS = ["picareta", "pa", "machado", "espada", "enxada"]
MATERIALS = ["madeira", "pedra", "ferro", "diamante", "ouro", "esmeralda", "cobre", "rubi", "safira", "ametista"]
KEEP = {"picareta_de_diamante", "pa_de_diamante"}  # o modelo: ficam como estão

# (claro, médio, escuro) de cada material da cabeça
PALETTE = {
    "madeira": ((0.86, 0.67, 0.42), (0.66, 0.48, 0.26), (0.42, 0.28, 0.13)),
    "pedra": ((0.70, 0.70, 0.70), (0.50, 0.50, 0.51), (0.30, 0.30, 0.32)),
    "ferro": ((0.96, 0.96, 0.98), (0.78, 0.79, 0.82), (0.50, 0.52, 0.56)),
    "diamante": ((0.80, 0.99, 0.98), (0.38, 0.86, 0.84), (0.12, 0.52, 0.53)),
    "ouro": ((1.00, 0.96, 0.60), (0.96, 0.78, 0.22), (0.62, 0.42, 0.08)),
    "esmeralda": ((0.70, 1.00, 0.78), (0.25, 0.82, 0.45), (0.06, 0.45, 0.22)),
    "cobre": ((0.98, 0.72, 0.52), (0.86, 0.48, 0.28), (0.52, 0.25, 0.12)),
    "rubi": ((1.00, 0.62, 0.66), (0.88, 0.14, 0.24), (0.48, 0.04, 0.10)),
    "safira": ((0.66, 0.80, 1.00), (0.20, 0.42, 0.94), (0.07, 0.16, 0.50)),
    "ametista": ((0.90, 0.74, 1.00), (0.66, 0.38, 0.92), (0.34, 0.14, 0.52)),
}
# o desenho dos detalhes (riscos do metal, faíscas da gema) de cada material
LOOK = {"ouro": "ferro", "cobre": "ferro", "esmeralda": "diamante", "rubi": "diamante", "safira": "diamante", "ametista": "diamante"}
HANDLE = ((0.60, 0.42, 0.23), (0.44, 0.29, 0.14), (0.24, 0.15, 0.07))

yy, xx = np.mgrid[0:N, 0:N].astype(float) + 0.5
U = np.array([1.0, -1.0]) / np.sqrt(2)  # ao longo do cabo (para cima à direita)
V = np.array([1.0, 1.0]) / np.sqrt(2)  # perpendicular (para baixo à direita)


def coords(origin):
    """Coordenadas (u ao longo do cabo, v perpendicular) de cada pixel, a partir de `origin`."""
    dx, dy = xx - origin[0], yy - origin[1]
    return dx * U[0] + dy * U[1], dx * V[0] + dy * V[1]


def shade(mask, pal, rng=None, kind=""):
    """Pinta a figura: degradê ao longo da diagonal, borda clara em cima à esquerda e escura embaixo à direita."""
    light, mid, dark = (np.array(c) for c in pal)
    out = np.zeros((N, N, 3))
    if not mask.any():
        return out
    t = (xx + yy)  # cresce para baixo à direita
    lo, hi = t[mask].min(), t[mask].max()
    g = np.clip((t - lo) / max(1.0, hi - lo), 0, 1)[..., None]
    out = np.where(g < 0.5, light + (mid - light) * (g / 0.5), mid + (dark - mid) * ((g - 0.5) / 0.5) * 0.7)
    nb = lambda dx, dy: np.roll(np.roll(mask, dy, 0), dx, 1)
    top_left = mask & (~nb(1, 0) | ~nb(0, 1) | ~nb(1, 1))  # o vizinho de cima/esquerda está vazio
    bottom_right = mask & (~nb(-1, 0) | ~nb(0, -1) | ~nb(-1, -1))
    out[top_left] = out[top_left] * 0.55 + light * 0.45 + 0.04
    out[bottom_right] = dark * 0.9
    if rng is not None:
        if kind == "pedra":
            spots = (rng.random((N, N)) > 0.78) & mask & ~bottom_right
            out[spots] *= 0.82
            spots = (rng.random((N, N)) > 0.88) & mask & ~bottom_right
            out[spots] = np.minimum(1, out[spots] * 1.15)
        elif kind == "diamante":
            spark = (rng.random((N, N)) > 0.9) & mask & ~bottom_right
            out[spark] = np.minimum(1, out[spark] + 0.22)
        elif kind == "ferro":
            u, v = coords((16, 16))
            streak = mask & (np.abs(v + 1.5) < 0.6)
            out[streak] = np.minimum(1, out[streak] + 0.08)
        elif kind == "madeira":
            grain = (np.sin((xx - yy) * 1.7) > 0.6) & mask & ~bottom_right & ~top_left
            out[grain] *= 0.88
    return out


def handle(start, end, width=1.6):
    """Cabo reto de `start` a `end` (máscara), com pixels em degrau como o da picareta de diamante."""
    u, v = coords(start)
    length = np.hypot(end[0] - start[0], end[1] - start[1])
    return (u >= -0.8) & (u <= length) & (np.abs(v) <= width)


def paint_handle(img, mask, rng):
    light, mid, dark = (np.array(c) for c in HANDLE)
    u, v = coords((4, 28))
    col = np.where((v < -0.5)[..., None], light, np.where((v > 0.6)[..., None], dark, mid))
    # nós do cabo: de 3 em 3 pixels um pouco mais escuro (como o modelo)
    knots = (np.floor(u / 2.2) % 2 == 0) & (np.abs(v) <= 0.6)
    col = np.where(knots[..., None], col * 0.88, col)
    img[mask] = np.dstack([col, np.ones((N, N))])[mask]


def pommel(img, at, pal):
    x, y = at
    img[y, x] = [*pal[1], 1.0]
    img[y, x + 1] = [*pal[0], 1.0]
    img[y + 1, x] = [*pal[2], 1.0]


def draw(tool, mat):
    rng = np.random.default_rng(int.from_bytes(hashlib.sha1(f"{tool}{mat}".encode()).digest()[:8], "little"))
    pal = PALETTE[mat]
    img = np.zeros((N, N, 4))
    if tool == "espada":
        # lâmina na diagonal até a ponta, guarda atravessada, cabo curto e o pomo
        grip = handle((5.5, 26.5), (9.0, 23.0), 1.7)
        paint_handle(img, grip, rng)
        u, v = coords((10.5, 21.5))
        blade = (u >= 0) & (u <= 23.5) & (np.abs(v) <= np.where(u > 20.0, (23.5 - u) * 0.75 + 0.2, 2.7))
        guard_c = coords((9.8, 22.2))
        guard = (np.abs(guard_c[0]) <= 1.1) & (np.abs(guard_c[1]) <= 5.2)
        col = shade(blade, pal, rng, LOOK.get(mat, mat))
        ridge = blade & (np.abs(v) <= 0.55) & (u < 22)
        col[ridge] = np.minimum(1, col[ridge] * 0.6 + np.array(pal[0]) * 0.5)
        img[blade] = np.dstack([col, np.ones((N, N))])[blade]
        gcol = shade(guard, HANDLE if mat == "madeira" else pal)
        gcol = gcol * 0.85
        img[guard] = np.dstack([gcol, np.ones((N, N))])[guard]
        pommel(img, (3, 27), pal)
        return img
    end = {"picareta": (21.5, 10.5), "pa": (19.5, 12.5), "machado": (20.5, 11.5), "enxada": (21.5, 10.5)}[tool]
    stick = handle((3.5, 28.5), end, 2.0)
    paint_handle(img, stick, rng)
    E = np.array(end)
    if tool == "pa":
        u, v = coords(E + U * 5.0)
        # lâmina arredondada, um pouco mais larga na ponta
        head = (np.abs(u / 6.2) ** 2.4 + np.abs(v / (4.8 + 0.25 * u)) ** 2.4) <= 1.0
    elif tool == "picareta":
        C = E - U * 13.0
        dx, dy = xx - C[0], yy - C[1]
        r = np.hypot(dx, dy)
        ang = np.arctan2(dx * V[0] + dy * V[1], dx * U[0] + dy * U[1])  # 0 = na direção do cabo
        thick = 3.3 * np.clip(1 - np.abs(ang) / 1.4, 0.32, 1)
        head = (np.abs(r - 13.5) <= thick) & (np.abs(ang) <= 1.18)
    elif tool == "machado":
        u, v = coords(E)
        # lâmina de um lado (em cima à esquerda), com o fio curvo, e o contrapeso do outro lado
        far = -v  # quanto se afasta do cabo, para cima à esquerda
        lo_u = -1.8 - far * 0.42
        hi_u = 3.2 + far * 0.34
        blade = (v <= 1.0) & (u >= lo_u) & (u <= hi_u) & (far <= 10.8 - (u - 0.7) ** 2 / 16.0)
        back = (u >= -1.0) & (u <= 2.8) & (v >= 0) & (v <= 3.0)
        head = blade | back
    else:  # enxada
        u, v = coords(E)
        bar = (u >= -1.6) & (u <= 2.0) & (v <= 2.0) & (v >= -8.5)
        tip = (v >= -8.5) & (v <= -5.2) & (u >= -5.5) & (u <= 2.0)
        head = bar | tip
    col = shade(head, pal, rng, LOOK.get(mat, mat))
    img[head] = np.dstack([col, np.ones((N, N))])[head]
    pommel(img, (2, 28), pal)
    return img


def main():
    done = []
    for t in TOOLS:
        for m in MATERIALS:
            name = f"{t}_de_{m}"
            if name in KEEP:
                continue
            img = draw(t, m)
            Image.fromarray((np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)).save(os.path.join(DIR, name + ".png"))
            done.append(name)
    print(f"{len(done)} ferramentas desenhadas")


if __name__ == "__main__":
    main()
