#!/usr/bin/env python3
"""Шрифты самого сайта (не бренд-кита): облегчённые woff2 в fonts/.

Inter — интерфейс и текст: вариативный, оставляем только жирность 400–700
и оптический размер 14. Non Bureau Extended Black и Bold — заголовки.
Все — только латиница, кириллица и типографские знаки.
Запуск: python3 tools/webfonts.py
"""

import io
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source" / "fonts" / "wemedia"
OUT = ROOT / "fonts"

UNICODES = "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0301,U+0304,U+0308,U+0329,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2000-206F,U+20AC,U+2116,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD"


def save_subset(font: TTFont, dst: Path):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "ccmp", "locl", "mark", "mkmk", "tnum", "case"]
    sub = subset.Subsetter(opts)
    sub.populate(unicodes=subset.parse_unicodes(UNICODES))
    sub.subset(font)
    font.flavor = "woff2"
    font.save(dst)
    print(f"✓ {dst.name}: {dst.stat().st_size // 1024} КБ")


def main():
    inter = TTFont(SRC / "Inter" / "Inter-VariableFont_opsz,wght.ttf")
    inter = instancer.instantiateVariableFont(inter, {"opsz": 14, "wght": (400, 700)})
    # Пересохраняем и читаем заново — иначе subset спотыкается о «ленивые»
    # таблицы после instancer.
    buf = io.BytesIO()
    inter.save(buf)
    buf.seek(0)
    inter = TTFont(buf)
    save_subset(inter, OUT / "inter.woff2")
    for style in ("Bold", "Black"):
        save_subset(TTFont(SRC / f"NonBureauExtended-{style}.otf"), OUT / f"nonbureau-extended-{style.lower()}.woff2")


if __name__ == "__main__":
    main()
