#!/usr/bin/env python3
"""Сборка бренд-кита WE media group.

Берёт исходники из source/ (логотипы и шрифты в том виде, в каком их прислали)
и собирает всё, что раздаёт сайт:

  assets/logos/<logo>/  — каждый логотип в 4 вариантах (чёрный и белый, без
                          фона и с фоном) и форматах SVG, PDF, EPS, PNG, JPG;
  assets/fonts/<brand>/ — шрифты, по семейству ZIP-архив;
  assets/preview/       — облегчённые woff2 для образцов шрифтов на сайте;
  downloads/            — ZIP «всё про платформу» и «весь бренд-кит»;
  js/data.js            — описание всего этого для страницы (генерируется).

Нужны: python3 + fonttools + brotli, ghostscript, inkscape, potrace,
imagemagick (convert), rsvg-convert, svgo. Запуск: python3 tools/build.py
"""

import json
import re
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "source"
ASSETS = ROOT / "assets"
DOWNLOADS = ROOT / "downloads"

# Цвета-заглушки в шаблоне SVG: #C0FF00 — первый цвет логотипа, #C0FF01 —
# второй и т.д. Вместо них подставляются цвета нужной версии.
def ph(i: int) -> str:
    return "#C0FF%02X" % i
WHITE = "#FFFFFF"
BLACK = "#000000"
# Цвета edubridge из брендбука.
EB_BLUE, EB_INK, EB_LIME, EB_LIGHT = "#0A34F5", "#121418", "#C8F169", "#5C7CFF"
PNG_SIZE = 4000  # длинная сторона готовых PNG/JPG, px
PAD = 0.2  # поле вокруг логотипа в вариантах с фоном, доля длинной стороны

BRANDS = [
    {
        "id": "wemedia",
        "name": "WE media group",
        "slug": "we-media-group",
        "logos": [
            {"id": "wemedia", "name": "WE media group", "src": "wemedia.svg", "file": "we-media-group"},
        ],
        "fonts": [
            {"family": "Non Bureau Extended", "dir": ".", "glob": "NonBureauExtended-*.otf", "license": "OFL"},
            {"family": "Inter", "dir": "Inter", "glob": "*.ttf", "license": "OFL"},
        ],
    },
    {
        "id": "weproject",
        "name": "WE project",
        "slug": "we-project",
        "logos": [
            {"id": "weproject", "name": "WE project", "src": "weproject.eps", "file": "we-project"},
            {"id": "weproject-media", "name": "weproject.media", "src": "weproject-media.eps"},
            {"id": "creative-asia", "name": "Creative Asia", "src": "creative-asia.png", "traced": True},
        ],
        "fonts": [
            {"family": "Raleway", "dir": "Raleway", "glob": "*.ttf", "license": "OFL"},
        ],
    },
    {
        "id": "thetech",
        "name": "THE TECH",
        "slug": "the-tech",
        "logos": [
            {"id": "thetech", "name": "THE TECH", "src": "thetech.jpg", "traced": True, "file": "the-tech"},
            {"id": "thetech-stacked", "name": "THE TECH — в две строки", "src": "thetech-stacked.jpg", "traced": True, "file": "the-tech-stacked"},
        ],
        "fonts": [
            {"family": "Franklin Gothic", "dir": ".", "glob": "FranklinGothic-*.ttf", "license": "commercial"},
        ],
    },
    {
        "id": "gorod24",
        "name": "Город 24",
        "slug": "gorod24",
        "logos": [
            {"id": "gorod24", "name": "Город 24", "src": "gorod24.eps"},
        ],
        "fonts": [
            {"family": "Bravo RG", "dir": ".", "glob": "BravoRG.otf", "license": "commercial"},
        ],
    },
    {
        "id": "office",
        "name": "OFFICE",
        "slug": "office",
        "logos": [
            {"id": "office", "name": "OFFICE", "src": "office.png", "traced": True},
        ],
        "fonts": [
            {"family": "Gotham Pro", "dir": "GothamPro", "glob": "*.ttf", "license": "commercial"},
        ],
    },
    {
        "id": "edubridge",
        "name": "edubridge",
        "slug": "edubridge",
        # Инструкция из бренд-кита: версии логотипа, охранное поле, шрифты.
        "guide": "edubridge-guide.pdf",
        # Фоны из брендбука edubridge (Bridge Blue, Ink, Lime).
        "bg": [
            {"key": "none", "label": "Без фона", "tag": ""},
            {"key": "white", "label": "Белый", "tag": "white", "color": WHITE},
            {"key": "blue", "label": "Bridge Blue", "tag": "blue", "color": EB_BLUE},
            {"key": "ink", "label": "Ink", "tag": "ink", "color": EB_INK},
            {"key": "lime", "label": "Lime", "tag": "lime", "color": EB_LIME},
        ],
        "darkBg": "ink",
        "logos": [
            {
                "id": "edubridge", "name": "edubridge", "src": "edubridge.svg", "file": "edubridge-logo",
                # Пять версий из брендбука: основная, на синем (всё белое),
                # на тёмном (дуга Bridge Light), монохромные Ink и белая.
                "fg": [
                    {"key": "brand", "label": "Основной", "tag": "main"},
                    {"key": "dark", "label": "Для тёмного фона", "tag": "for-dark",
                     "map": {EB_INK: WHITE, EB_BLUE: EB_LIGHT}},
                    {"key": "white", "label": "Белый", "tag": "white", "color": WHITE},
                    {"key": "ink", "label": "Ink", "tag": "ink", "color": EB_INK},
                ],
                "variants": [("brand", "none"), ("brand", "white"), ("white", "blue"), ("dark", "none"),
                             ("dark", "ink"), ("ink", "none"), ("ink", "lime"), ("white", "none")],
                "onDark": "dark",
            },
            {
                "id": "edubridge-arc", "name": "Знак-дуга", "src": "edubridge-arc.svg", "file": "edubridge-arc",
                "fg": [
                    {"key": "brand", "label": "Bridge Blue", "tag": "blue"},
                    {"key": "white", "label": "Белый", "tag": "white", "color": WHITE},
                    {"key": "ink", "label": "Ink", "tag": "ink", "color": EB_INK},
                    {"key": "lime", "label": "Lime", "tag": "lime", "color": EB_LIME},
                ],
                "variants": [("brand", "none"), ("white", "none"), ("ink", "none"), ("lime", "none"),
                             ("white", "blue"), ("lime", "ink"), ("brand", "white")],
            },
            {
                "id": "edubridge-avatar", "name": "Аватар", "src": "edubridge-avatar.svg", "file": "edubridge-avatar",
                "fg": [
                    {"key": "brand", "label": "Основной", "tag": "main"},
                    {"key": "light", "label": "Светлый", "tag": "light", "map": {EB_BLUE: WHITE, WHITE: EB_BLUE}},
                ],
                "bg": [{"key": "none", "label": "Без фона", "tag": ""}],
                "variants": [("brand", "none"), ("light", "none")],
                "onDark": "brand",
                "custom": False,
            },
            {
                "id": "edubridge-favicon", "name": "Фавикон и иконка приложения", "src": "edubridge-favicon.svg",
                "file": "edubridge-favicon",
                "fg": [{"key": "brand", "label": "Основной", "tag": "main"}],
                "bg": [{"key": "none", "label": "Без фона", "tag": ""}],
                "variants": [("brand", "none")],
                "onDark": "brand",
                "custom": False,
            },
        ],
        "fonts": [
            {"family": "Onest", "dir": "Onest", "glob": "*.ttf", "license": "OFL"},
            {"family": "Unbounded", "dir": "Unbounded", "glob": "*.ttf", "license": "OFL"},
        ],
    },
]

# Версии логотипа по умолчанию. fg — «цвет знака»: brand (фирменные цвета
# исходника) или один цвет на всё; bg — фон (none — прозрачный). tag идёт в
# имя файла. Бренд или логотип может задать свои списки (см. edubridge).
FG_DEFAULT = [
    {"key": "brand", "label": "Фирменный", "tag": "black"},
    {"key": "white", "label": "Белый", "tag": "white", "color": WHITE},
]
BG_DEFAULT = [
    {"key": "none", "label": "Без фона", "tag": ""},
    {"key": "white", "label": "Белый", "tag": "white", "color": WHITE},
    {"key": "black", "label": "Чёрный", "tag": "black", "color": BLACK},
]
VARIANTS_DEFAULT = [("brand", "none"), ("white", "none"), ("brand", "white"), ("white", "black")]

# Трассировка растровых логотипов: во сколько раз увеличить перед potrace
# и насколько размыть (сглаживает «лесенку» пикселей).
TRACE = {
    "office.png": {"alpha": True, "scale": 800, "blur": 9},
    "creative-asia.png": {"alpha": True, "scale": 800, "blur": 8},
    "thetech.jpg": {"alpha": False, "scale": 800, "blur": 4},
    "thetech-stacked.jpg": {"alpha": False, "scale": 400, "blur": 3},
}


def run(*cmd, **kw):
    subprocess.run([str(c) for c in cmd], check=True, capture_output=True, **kw)


def inkscape_plain(src: Path, dst: Path):
    """SVG/PDF → простой SVG, обрезанный точно по рисунку."""
    run("inkscape", src, "--export-type=svg", "--export-plain-svg",
        "--export-area-drawing", "--export-text-to-path", "-o", dst)


def trace(src: Path, dst: Path, tmp: Path):
    opt = TRACE[src.name]
    pbm = tmp / (src.stem + ".pbm")
    cmd = ["convert", src]
    cmd += ["-alpha", "extract", "-negate"] if opt["alpha"] else ["-colorspace", "gray"]
    cmd += ["-trim", "+repage", "-filter", "Lanczos", "-resize", f"{opt['scale']}%",
            "-blur", f"0x{opt['blur']}", "-threshold", "50%", pbm]
    run(*cmd)
    raw = tmp / (src.stem + ".potrace.svg")
    run("potrace", "-s", "--flat", "-a", "1.2", "-O", "0.8", "-t", "20", pbm, "-o", raw)
    inkscape_plain(raw, dst)


def detect_color(svg_text: str) -> str:
    """Самый частый непрозрачный цвет в исходнике — «фирменный чёрный»."""
    found = re.findall(r'(?:fill|stroke)(?:=\"|:)\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]*\))', svg_text)
    colors = {}
    for c in found:
        colors[c] = colors.get(c, 0) + 1
    if not colors:
        return "#000000"
    c = max(colors, key=colors.get)
    if c.startswith("rgb"):
        parts = [p.strip() for p in c[4:-1].split(",")]
        vals = [round(float(p[:-1]) * 2.55) if p.endswith("%") else int(p) for p in parts]
        c = "#%02X%02X%02X" % tuple(vals)
    if len(c) == 4:
        c = "#" + "".join(ch * 2 for ch in c[1:])
    c = c.upper()
    # Белый логотип в исходнике (WE media group) — фирменным считаем чёрный.
    return "#000000" if c == WHITE else c


def norm_color(v: str) -> str | None:
    v = v.strip()
    if v in ("none", "transparent", "currentColor") or v.startswith("url("):
        return None
    if v.startswith("rgb"):
        parts = [p.strip() for p in v[v.index("(") + 1:-1].split(",")]
        vals = [round(float(p[:-1]) * 2.55) if p.endswith("%") else int(p) for p in parts[:3]]
        return "#%02X%02X%02X" % tuple(vals)
    if re.fullmatch(r"#[0-9a-fA-F]{3}", v):
        v = "#" + "".join(ch * 2 for ch in v[1:])
    return v.upper() if v.startswith("#") else {"white": WHITE, "black": BLACK}.get(v.lower(), v)


def to_template(plain: Path) -> tuple[str, float, float, list[str]]:
    """Шаблон: каждый цвет исходника → своя заглушка ph(i), viewBox от 0,0.
    Возвращает ещё список исходных цветов в порядке заглушек."""
    ET.register_namespace("", "http://www.w3.org/2000/svg")
    tree = ET.parse(plain)
    root = tree.getroot()
    vb = [float(v) for v in root.get("viewBox").split()]
    palette: list[str] = []

    def slot(v: str) -> str:
        c = norm_color(v)
        if c is None:
            return v
        if c not in palette:
            palette.append(c)
        return ph(palette.index(c))

    # Корень с fill="none" (так в исходнике WE media group) — снимаем, иначе
    # элементы без своего fill пропадут.
    if root.get("fill") == "none":
        del root.attrib["fill"]
    for el in root.iter():
        for attr in ("fill", "stroke"):
            v = el.get(attr)
            if v:
                el.set(attr, slot(v))
        style = el.get("style")
        if style:
            style = re.sub(r"(fill|stroke):\s*([^;]+)", lambda m: f"{m.group(1)}:{slot(m.group(2))}", style)
            el.set("style", style)
        for attr in list(el.attrib):
            if attr in ("id",) or attr.startswith("{http://www.inkscape.org") or attr.startswith("{http://sodipodi"):
                del el.attrib[attr]
    if not palette:
        palette.append(BLACK)
    if not root.get("fill"):
        root.set("fill", ph(0))
    inner = "".join(ET.tostring(ch, encoding="unicode") for ch in root)
    inner = re.sub(r'\sxmlns(:\w+)?="[^"]+"', "", inner)
    # fill корня переносим на обёртку — у шаблона свой корень.
    w, h = vb[2], vb[3]
    body = f'<g fill="{root.get("fill")}" transform="translate({-vb[0]:.4f} {-vb[1]:.4f})">{inner}</g>'
    return body, w, h, palette


def paint(body: str, colors: list[str] | None) -> str:
    if colors is None:
        return body
    return re.sub(r"#C0FF([0-9A-F]{2})", lambda m: colors[int(m.group(1), 16)], body)


def svg_doc(body: str, w: float, h: float, colors: list[str] | None, bg: str | None) -> str:
    content = paint(body, colors)
    if bg is None:
        return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w:.2f}" height="{h:.2f}" '
                f'viewBox="0 0 {w:.4f} {h:.4f}">{content}</svg>')
    p = PAD * max(w, h)
    W, H = w + 2 * p, h + 2 * p
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.2f}" height="{H:.2f}" '
            f'viewBox="0 0 {W:.4f} {H:.4f}"><rect width="{W:.4f}" height="{H:.4f}" fill="{bg}"/>'
            f'<g transform="translate({p:.4f} {p:.4f})">{content}</g></svg>')


def raster_size(w, h, long_side):
    if w >= h:
        return long_side, max(1, round(h * long_side / w))
    return max(1, round(w * long_side / h)), long_side


def rel(p: Path) -> str:
    return p.relative_to(ROOT).as_posix()


def fsize(p: Path) -> int:
    return p.stat().st_size


def build_logo(brand, logo, tmp: Path):
    src = SRC / "logos" / logo["src"]
    plain = tmp / f"{logo['id']}.plain.svg"
    if src.suffix == ".eps":
        pdf = tmp / f"{logo['id']}.pdf"
        # -dNoOutputFonts: надписи сразу в кривые — иначе inkscape подменит
        # шрифт, которого нет в системе, и текст «поедет».
        run("gs", "-q", "-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-dNoOutputFonts",
            "-sDEVICE=pdfwrite", f"-sOutputFile={pdf}", src)
        inkscape_plain(pdf, plain)
        color = detect_color(plain.read_text())
    elif src.suffix == ".svg":
        inkscape_plain(src, plain)
        color = detect_color(src.read_text())
    else:
        trace(src, plain, tmp)
        color = "#000000"

    body, w, h, source_palette = to_template(plain)
    # Фирменные цвета: у одноцветного логотипа — «фирменный чёрный» из
    # исходника, у многоцветного — все его цвета как есть.
    brand_colors = source_palette if len(source_palette) > 1 else [color]
    n = len(brand_colors)

    def resolve(preset):
        if "color" in preset:
            return [preset["color"]] * n
        if "map" in preset:
            return [preset["map"].get(c, c) for c in source_palette]
        return list(brand_colors)

    fg_presets = [{**p, "colors": resolve(p)} for p in logo.get("fg", FG_DEFAULT)]
    bg_presets = logo.get("bg", brand.get("bg", BG_DEFAULT))
    fg_by, bg_by = {p["key"]: p for p in fg_presets}, {p["key"]: p for p in bg_presets}

    out = ASSETS / "logos" / logo["id"]
    if out.exists():
        shutil.rmtree(out)
    out.mkdir(parents=True)
    base = logo.get("file", logo["id"])

    variants = {}
    for fg_key, bg_key in logo.get("variants", VARIANTS_DEFAULT):
        fgp, bgp = fg_by[fg_key], bg_by[bg_key]
        colors, bg = fgp["colors"], bgp.get("color")
        vid = fgp["tag"] + (f"-on-{bgp['tag']}" if bg else "")
        stem = out / f"{base}_{vid}"
        svg = stem.with_suffix(".svg")
        svg.write_text(svg_doc(body, w, h, colors, bg))
        run("svgo", "-q", "--multipass", "-i", svg, "-o", svg)
        pdf, eps, png = stem.with_suffix(".pdf"), stem.with_suffix(".eps"), stem.with_suffix(".png")
        run("inkscape", svg, "--export-type=pdf", "--export-text-to-path", "-o", pdf)
        run("inkscape", svg, "--export-type=eps", "--export-text-to-path", "-o", eps)
        sw = w + (2 * PAD * max(w, h) if bg else 0)
        sh = h + (2 * PAD * max(w, h) if bg else 0)
        pw, ph_ = raster_size(sw, sh, PNG_SIZE)
        run("rsvg-convert", "-w", pw, "-h", ph_, svg, "-o", png)
        files = {"svg": svg, "pdf": pdf, "eps": eps, "png": png}
        if bg:
            jpg = stem.with_suffix(".jpg")
            run("convert", png, "-background", bg, "-flatten", "-quality", "92", jpg)
            files["jpg"] = jpg
        variants[vid] = {
            "fg": fg_key,
            "bg": bg_key,
            "px": [pw, ph_],
            "files": {k: {"url": rel(f), "size": fsize(f)} for k, f in files.items()},
        }

    # Всё про один логотип — одним архивом, по папкам форматов.
    zpath = out / f"{base}_all-formats.zip"
    with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
        for vid, v in variants.items():
            for fmt, f in v["files"].items():
                z.write(ROOT / f["url"], f"{logo['name'].replace('—', '-')}/{fmt.upper()}/{Path(f['url']).name}")

    # Шаблон — для раскраски в свой цвет и предпросмотра прямо на странице.
    return {
        "id": logo["id"],
        "name": logo["name"],
        "file": base,
        "traced": bool(logo.get("traced")),
        "w": round(w, 2),
        "h": round(h, 2),
        "pad": PAD,
        "template": svg_doc(body, w, h, None, None),
        "fg": [{k: p[k] for k in ("key", "label", "tag", "colors")} for p in fg_presets],
        "bg": [{"key": p["key"], "label": p["label"], "tag": p["tag"], "color": p.get("color")} for p in bg_presets],
        "onDark": logo.get("onDark", "white"),
        "darkBg": logo.get("darkBg", brand.get("darkBg", "black")),
        "custom": logo.get("custom", True),
        "variants": variants,
        "zip": {"url": rel(zpath), "size": fsize(zpath)},
    }


STYLE_NAMES = [
    ("extrabolditalic", "ExtraBold Italic", 800, True), ("extralightitalic", "ExtraLight Italic", 200, True),
    ("semibolditalic", "SemiBold Italic", 600, True), ("blackitalic", "Black Italic", 900, True),
    ("bolditalic", "Bold Italic", 700, True), ("mediumitalic", "Medium Italic", 500, True),
    ("lightitalic", "Light Italic", 300, True), ("thinitalic", "Thin Italic", 100, True),
    ("extrabold", "ExtraBold", 800, False), ("extralight", "ExtraLight", 200, False),
    ("semibold", "SemiBold", 600, False), ("black", "Black", 900, False), ("bold", "Bold", 700, False),
    ("medium", "Medium", 500, False), ("light", "Light", 300, False), ("thin", "Thin", 100, False),
    ("demi", "Demi", 600, False), ("italic", "Italic", 400, True), ("regular", "Regular", 400, False),
]

PREVIEW_TEXT = ("АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя"
                "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
                " .,:;!?-–—«»\"'()&@#%№/+=*")


def font_style(path: Path):
    f = TTFont(path)
    name = f["name"]
    sub = (name.getDebugName(17) or name.getDebugName(2) or "Regular").strip()
    variable = "fvar" in f
    stem = path.stem.lower().replace("-", "").replace("_", "")
    label, weight, italic = sub, f["OS/2"].usWeightClass, bool(f["OS/2"].fsSelection & 1)
    for key, lab, wgt, it in STYLE_NAMES:
        if stem.endswith(key):
            label, weight, italic = lab, wgt, it
            break
    else:
        if variable:
            label = "Variable Italic" if "italic" in stem else "Variable"
    extra = ""
    m = re.search(r"_(\d+)pt", path.stem)
    if m:
        extra = f" · {m.group(1)}pt"
    if "narrow" in stem:
        extra += " · Narrow"
    if "cond" in stem:
        extra += " · Condensed"
    return {"label": label + extra, "weight": weight, "italic": italic, "variable": variable}


def opsz(label: str) -> int:
    m = re.search(r"(\d+)pt", label)
    return int(m.group(1)) if m else 0


def build_fonts(brand):
    out_root = ASSETS / "fonts" / brand["id"]
    if out_root.exists():
        shutil.rmtree(out_root)
    prev_root = ASSETS / "preview"
    prev_root.mkdir(parents=True, exist_ok=True)
    families = []
    for fam in brand["fonts"]:
        src_dir = SRC / "fonts" / brand["id"] / fam["dir"]
        files = sorted(src_dir.glob(fam["glob"]))
        fam_slug = fam["family"].replace(" ", "")
        out = out_root / fam_slug
        out.mkdir(parents=True)
        items = []
        for f in files:
            dst = out / f.name
            shutil.copy2(f, dst)
            st = font_style(f)
            prev = prev_root / f"{fam_slug}-{re.sub(r'[^A-Za-z0-9]+', '-', f.stem)}.woff2"
            opts = subset.Options()
            opts.flavor = "woff2"
            opts.layout_features = ["*"]
            fnt = TTFont(f)
            sub = subset.Subsetter(opts)
            sub.populate(text=PREVIEW_TEXT)
            sub.subset(fnt)
            fnt.flavor = "woff2"
            fnt.save(prev)
            items.append({**st, "file": f.name, "url": rel(dst), "size": fsize(dst), "preview": rel(prev)})
        lic = src_dir / "OFL.txt"
        if lic.exists():
            shutil.copy2(lic, out / "OFL.txt")
        # Порядок: сначала обычные, по жирности; вариативные в конце.
        items.sort(key=lambda i: (i["variable"], opsz(i["label"]), i["italic"], i["weight"]))
        zpath = out_root / f"{fam_slug}.zip"
        with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
            for p in sorted(out.iterdir()):
                z.write(p, f"{fam['family']}/{p.name}")
        # Образец на карточке — обычное начертание (или ближайшее к 400/500).
        statics = [i for i in items if not i["variable"] and not i["italic"]] or items
        main = min(statics, key=lambda i: (opsz(i["label"]), abs(i["weight"] - 500)))
        families.append({
            "family": fam["family"],
            "license": fam["license"],
            "files": items,
            "main": main["preview"],
            "mainWeight": main["weight"],
            "zip": {"url": rel(zpath), "size": fsize(zpath)},
        })
    return families


def main():
    for d in (ASSETS, DOWNLOADS):
        if d.exists():
            shutil.rmtree(d)
        d.mkdir(parents=True)
    data = {"brands": []}
    with tempfile.TemporaryDirectory() as t:
        tmp = Path(t)
        for brand in BRANDS:
            logos = [build_logo(brand, l, tmp) for l in brand["logos"]]
            fonts = build_fonts(brand)
            print(f"✓ {brand['name']}: логотипов {len(logos)}, семейств шрифтов {len(fonts)}")
            entry = {"id": brand["id"], "name": brand["name"], "slug": brand["slug"]}
            if brand.get("guide"):
                gdir = ASSETS / "guides"
                gdir.mkdir(exist_ok=True)
                g = gdir / brand["guide"]
                shutil.copy2(SRC / "guides" / brand["guide"], g)
                entry["guide"] = {"url": rel(g), "size": fsize(g)}
            data["brands"].append({**entry,
                                   "logos": logos, "fonts": fonts})

    # ZIP по платформе: все логотипы во всех видах + шрифты.
    everything = DOWNLOADS / "wemedia-group_brand-kit.zip"
    with zipfile.ZipFile(everything, "w", zipfile.ZIP_DEFLATED) as zall:
        for b in data["brands"]:
            zpath = DOWNLOADS / f"{b['slug']}_brand-kit.zip"
            with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
                for l in b["logos"]:
                    for v in l["variants"].values():
                        for fmt, f in v["files"].items():
                            arc = f"Логотипы/{l['name'].replace('—', '-')}/{fmt.upper()}/{Path(f['url']).name}"
                            z.write(ROOT / f["url"], f"{b['name']}/{arc}")
                            zall.write(ROOT / f["url"], f"WE media group — бренд-кит/{b['name']}/{arc}")
                for fam in b["fonts"]:
                    fam_dir = ROOT / Path(fam["files"][0]["url"]).parent
                    for p in sorted(fam_dir.iterdir()):
                        arc = f"Шрифты/{fam['family']}/{p.name}"
                        z.write(p, f"{b['name']}/{arc}")
                        zall.write(p, f"WE media group — бренд-кит/{b['name']}/{arc}")
                if b.get("guide"):
                    g = ROOT / b["guide"]["url"]
                    z.write(g, f"{b['name']}/{g.name}")
                    zall.write(g, f"WE media group — бренд-кит/{b['name']}/{g.name}")
            b["zip"] = {"url": rel(zpath), "size": fsize(zpath)}
    data["zip"] = {"url": rel(everything), "size": fsize(everything)}

    js = ("// Сгенерировано tools/build.py — руками не править.\n"
          f"window.BRANDKIT = {json.dumps(data, ensure_ascii=False, separators=(',', ':'))};\n")
    (ROOT / "js" / "data.js").write_text(js)
    print(f"✓ Весь бренд-кит: {fsize(everything) / 1e6:.1f} МБ")


if __name__ == "__main__":
    main()
