(function () {
  "use strict";

  const DATA = window.BRANDKIT;
  // В шаблоне логотипа цвета — заглушки #C0FF00, #C0FF01…: номер цвета
  // исходника. Вместо них подставляются цвета выбранной версии.
  const SLOT = /#C0FF([0-9A-F]{2})/gi;
  const SIZES = [512, 1000, 2000, 4000];
  const MAX_SIZE = 8000;
  const FORMATS = [
    { id: "svg", label: "SVG", note: "вектор" },
    { id: "png", label: "PNG", note: "растр" },
    { id: "jpg", label: "JPG", note: "растр" },
    { id: "pdf", label: "PDF", note: "вектор" },
    { id: "eps", label: "EPS", note: "вектор" },
  ];
  const SAMPLE = "Съешь же ещё этих мягких французских булок, да выпей чаю";

  const $ = (sel, root = document) => root.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === "class") node.className = v;
      else if (k === "html") node.innerHTML = v;
      else if (k === "text") node.textContent = v;
      else if (k === "style") node.style.cssText = v;
      else if (k.startsWith("on")) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? "" : v);
    }
    for (const c of [].concat(children)) if (c != null) node.append(c);
    return node;
  };

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }
  function fmtSize(bytes) {
    if (bytes >= 1e6) return (bytes / 1e6).toFixed(bytes >= 1e7 ? 0 : 1).replace(".", ",") + " МБ";
    return Math.max(1, Math.round(bytes / 1e3)) + " КБ";
  }
  const basename = (url) => url.split("/").pop();
  const absUrl = (url) => new URL(url, location.href).href;

  let toastTimer;
  function toast(text) {
    const t = $("#toast");
    t.textContent = text;
    t.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("is-visible"), 2200);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = el("textarea", { style: "position:fixed;opacity:0" });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
  }

  function saveUrl(url, filename) {
    const a = el("a", { href: url, download: filename || "" });
    document.body.append(a);
    a.click();
    a.remove();
  }
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    saveUrl(url, filename);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- SVG логотипа в любом цвете ----------
  function svgInner(logo) {
    const t = logo.template;
    return t.slice(t.indexOf(">") + 1, t.lastIndexOf("</svg>"));
  }
  function logoBox(logo, withBg) {
    if (!withBg) return { w: logo.w, h: logo.h, pad: 0 };
    const pad = logo.pad * Math.max(logo.w, logo.h);
    return { w: logo.w + 2 * pad, h: logo.h + 2 * pad, pad };
  }
  function paint(logo, colors) {
    return svgInner(logo).replace(SLOT, (m, i) => colors[parseInt(i, 16)] || colors[0]);
  }
  function buildSvg(logo, colors, bg, px) {
    const box = logoBox(logo, !!bg);
    const inner = paint(logo, colors);
    const size = px ? ` width="${px[0]}" height="${px[1]}"` : ` width="${box.w}" height="${box.h}"`;
    const head = `<svg xmlns="http://www.w3.org/2000/svg"${size} viewBox="0 0 ${box.w} ${box.h}">`;
    if (!bg) return head + inner + "</svg>";
    return head + `<rect width="${box.w}" height="${box.h}" fill="${bg}"/>` +
      `<g transform="translate(${box.pad} ${box.pad})">${inner}</g></svg>`;
  }
  function inlineSvg(logo, colors, cls) {
    return `<svg xmlns="http://www.w3.org/2000/svg"${cls ? ` class="${cls}"` : ""} viewBox="0 0 ${logo.w} ${logo.h}" width="${logo.w}" height="${logo.h}" role="img" aria-label="${logo.name}">` +
      paint(logo, colors) + "</svg>";
  }
  const fgPreset = (logo, key) => logo.fg.find((p) => p.key === key) || logo.fg[0];
  const bgPreset = (logo, key) => logo.bg.find((p) => p.key === key) || logo.bg[0];
  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    return (0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  }
  function pxFor(box, longSide) {
    return box.w >= box.h
      ? [longSide, Math.max(1, Math.round(box.h * longSide / box.w))]
      : [Math.max(1, Math.round(box.w * longSide / box.h)), longSide];
  }
  function rasterize(svgText, px, type) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = px[0];
        canvas.height = px[1];
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, px[0], px[1]);
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), type, 0.92);
      };
      img.onerror = reject;
      img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgText);
    });
  }

  // ---------- Шрифты: @font-face для образцов ----------
  const fontFaces = [];
  let faceId = 0;
  function faceFor(previewUrl) {
    const name = "bk-face-" + (++faceId);
    fontFaces.push(`@font-face{font-family:"${name}";src:url("${previewUrl}") format("woff2");font-display:swap;}`);
    return name;
  }

  // ---------- Разметка ----------
  function renderNav() {
    const nav = $("#platformNav");
    for (const b of DATA.brands) {
      nav.append(el("a", { class: "platform-tab", href: "#" + b.slug, "data-slug": b.slug, text: b.name }));
    }
  }

  function renderHero() {
    const all = $("#downloadAll");
    all.href = DATA.zip.url;
    $("#downloadAllSize").textContent = "· " + fmtSize(DATA.zip.size);
    const logos = DATA.brands.reduce((s, b) => s + b.logos.length, 0);
    const fams = DATA.brands.reduce((s, b) => s + b.fonts.length, 0);
    const files = DATA.brands.reduce((s, b) => s + b.fonts.reduce((t, f) => t + f.files.length, 0), 0);
    const n = DATA.brands.length;
    $("#heroStats").innerHTML =
      `<span><b>${n}</b> ${plural(n, "платформа", "платформы", "платформ")}</span>` +
      `<span><b>${logos}</b> ${plural(logos, "логотип", "логотипа", "логотипов")}</span>` +
      `<span><b>${fams}</b> ${plural(fams, "семейство", "семейства", "семейств")} шрифтов, <b>${files}</b> ${plural(files, "файл", "файла", "файлов")}</span>` +
      `<span>SVG · PDF · EPS · PNG · JPG</span>`;
  }

  function logoCard(brand, logo) {
    const card = el("article", { class: "logo-card", "data-look": "theme", style: `--dark-bg:${bgPreset(logo, logo.darkBg).color || "#000"}` });
    const stage = el("button", {
      type: "button",
      class: "logo-stage",
      "aria-label": `${logo.name}: настроить и скачать`,
      // Две картинки: фирменные цвета (светлый фон) и версия для тёмного
      // фона — какую показать, решает CSS по теме и выбранному фону карточки.
      html: inlineSvg(logo, fgPreset(logo, "brand").colors, "v-light") +
        inlineSvg(logo, fgPreset(logo, logo.onDark).colors, "v-dark") + '<span class="logo-stage-cta">Настроить и скачать</span>',
      onclick: () => openModal(brand, logo, card),
    });
    const looks = el("div", { class: "look-switch", role: "group", "aria-label": "Фон предпросмотра" });
    for (const [look, title] of [["theme", "Как тема"], ["light", "На белом"], ["dark", "На чёрном"]]) {
      looks.append(el("button", {
        type: "button",
        class: "look-dot",
        "data-look": look,
        title,
        "aria-label": title,
        "aria-pressed": look === "theme" ? "true" : "false",
        onclick: (e) => {
          e.stopPropagation();
          card.dataset.look = look;
          for (const d of looks.children) d.setAttribute("aria-pressed", d.dataset.look === look ? "true" : "false");
        },
      }));
    }
    const stageWrap = el("div", { style: "position:relative" }, [stage, looks]);
    const foot = el("div", { class: "logo-card-foot" }, [
      el("div", {}, [
        el("div", { class: "logo-card-name", text: logo.name }),
        el("div", { class: "logo-card-meta", text: "SVG, PDF, EPS, PNG, JPG" }),
      ]),
      el("div", { class: "logo-card-actions" }, [
        el("a", { class: "chip-dl", href: logo.zip.url, download: "", title: "Все форматы и цвета одним архивом", text: "ZIP · " + fmtSize(logo.zip.size) }),
        el("button", { type: "button", class: "btn btn-primary btn-sm", onclick: () => openModal(brand, logo, card) }, [
          el("span", { class: "icon icon-download", "aria-hidden": "true" }),
          el("span", { text: "Скачать" }),
        ]),
      ]),
    ]);
    card.append(stageWrap, foot);
    return card;
  }

  function fontCard(fam) {
    const mainFace = faceFor(fam.main);
    const exts = [...new Set(fam.files.map((f) => f.file.split(".").pop().toUpperCase()))].join(", ");
    const n = fam.files.length;
    const card = el("article", { class: "font-card", style: `--ff:"${mainFace}"` });
    card.append(
      el("div", { class: "font-top" }, [
        el("div", { class: "font-glyph", style: `font-weight:${fam.mainWeight}`, "aria-hidden": "true", text: "Аа" }),
        el("div", {}, [
          el("h4", { class: "font-name", text: fam.family }),
          el("p", { class: "font-meta", text: `${n} ${plural(n, "начертание", "начертания", "начертаний")} · ${exts}` }),
          el("span", {
            class: "font-badge",
            text: fam.license === "OFL" ? "Свободная лицензия OFL" : "Коммерческий шрифт",
            title: fam.license === "OFL"
              ? "Можно свободно использовать, в том числе в коммерческих проектах"
              : "Права на шрифт принадлежат его автору — используйте по вашей лицензии",
          }),
        ]),
      ]),
      el("p", {
        class: "font-sample",
        contenteditable: "true",
        spellcheck: "false",
        title: "Можно напечатать свой текст",
        style: `font-weight:${fam.mainWeight}`,
        text: SAMPLE,
      }),
      el("div", { class: "font-actions" }, [
        el("a", { class: "btn btn-primary", href: fam.zip.url, download: "" }, [
          el("span", { class: "icon icon-download", "aria-hidden": "true" }),
          el("span", { text: "Скачать семейство" }),
          el("span", { class: "btn-meta", text: "ZIP · " + fmtSize(fam.zip.size) }),
        ]),
      ]),
    );
    const list = el("ul", { class: "font-list" });
    const details = el("details", { class: "font-styles" }, [
      el("summary", {}, [
        el("span", { text: `Все начертания по отдельности (${n})` }),
        el("span", { class: "icon icon-chevron", "aria-hidden": "true" }),
      ]),
      list,
    ]);
    // Образцы начертаний грузятся только когда список открыли.
    details.addEventListener("toggle", () => {
      if (!details.open || list.childElementCount) return;
      const css = [];
      for (const f of fam.files) {
        const face = "bk-row-" + (++faceId);
        css.push(`@font-face{font-family:"${face}";src:url("${f.preview}") format("woff2");font-display:swap;}`);
        list.append(el("li", {}, el("a", { class: "font-row", href: f.url, download: "", title: "Скачать " + f.file }, [
          el("span", { class: "font-row-sample", style: `font-family:"${face}",sans-serif`, text: "Аа Bb" }),
          el("span", { class: "font-row-label", text: f.label }),
          el("span", { class: "font-row-size", text: f.file.split(".").pop().toUpperCase() + " · " + fmtSize(f.size) }),
          el("span", { class: "icon icon-download", "aria-hidden": "true" }),
        ])));
      }
      document.head.append(el("style", { text: css.join("\n") }));
    });
    card.append(details);
    return card;
  }

  // Простейший Markdown для инструкций: заголовки, списки, **жирный**, `код`.
  function mdToHtml(md) {
    const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
    const inline = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`(.+?)`/g, "<code>$1</code>");
    const out = [];
    let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const raw of md.split("\n")) {
      const line = raw.trim();
      let m;
      if (!line) { close(); continue; }
      if (/^# /.test(line)) { close(); continue; }
      if ((m = line.match(/^#{2,3} (.+)/))) { close(); out.push(`<h4>${inline(m[1])}</h4>`); continue; }
      if ((m = line.match(/^[-*] (.+)/)) || (m = line.match(/^\d+\. (.+)/))) {
        const kind = /^\d/.test(line) ? "ol" : "ul";
        if (list !== kind) { close(); out.push(`<${kind}>`); list = kind; }
        out.push(`<li>${inline(m[1])}</li>`);
        continue;
      }
      close();
      out.push(`<p>${inline(line)}</p>`);
    }
    close();
    return out.join("");
  }

  function videoCard(item) {
    const ratio = `${item.w} / ${item.h}`;
    return el("article", { class: "video-card" + (item.logoOnly ? " is-logo" : "") }, [
      el("div", { class: "video-stage" }, el("img", {
        src: item.preview, alt: item.name + " — схема", loading: "lazy",
        style: item.logoOnly ? null : `aspect-ratio:${ratio}`,
      })),
      el("div", { class: "video-foot" }, [
        el("div", {}, [
          el("div", { class: "logo-card-name", text: item.name }),
          el("div", { class: "logo-card-meta", text: item.size + " · PNG без фона" + (item.note ? " · " + item.note : "") }),
        ]),
        el("div", { class: "video-actions" }, item.files.map((f) => el("a", {
          class: f.key === "guide" ? "chip-dl chip-ghost" : "chip-dl",
          href: f.url,
          download: "",
          title: f.key === "guide" ? "Схема зон интерфейса — только для проверки, в видео не вставлять" : `Скачать: ${f.label.toLowerCase()} · ${fmtSize(f.size)}`,
          text: f.label,
        }))),
      ]),
    ]);
  }

  function videoBlock(b) {
    const v = b.video;
    return el("div", { class: "video-block" }, [
      el("div", { class: "sub-head" }, [
        el("h3", { class: "sub-title", text: "Шаблоны для видео" }),
        el("a", { class: "chip-dl", href: v.zip.url, download: "", text: "Все шаблоны · ZIP · " + fmtSize(v.zip.size) }),
      ]),
      el("p", { class: "sub-lead", text: "Прозрачный PNG размером с кадр — логотип уже стоит на своём месте. Положите на верхнюю дорожку в CapCut, Premiere, Final Cut или DaVinci и растяните на весь кадр." }),
      el("div", { class: "video-grid" }, v.items.map(videoCard)),
      el("details", { class: "font-styles video-howto" }, [
        el("summary", {}, [
          el("span", { text: "Инструкция: размеры, позиции и что нельзя" }),
          el("span", { class: "icon icon-chevron", "aria-hidden": "true" }),
        ]),
        el("div", { class: "md", html: mdToHtml(v.instruction) }),
      ]),
    ]);
  }

  function renderBrands() {
    const main = $("#brands");
    for (const b of DATA.brands) {
      const nl = b.logos.length, nf = b.fonts.length;
      const title = el("h2", { class: "section-title" }, [
        el("span", { text: b.name }),
        el("button", {
          type: "button",
          class: "section-link",
          title: "Скопировать ссылку на раздел",
          "aria-label": "Скопировать ссылку на раздел " + b.name,
          onclick: async () => {
            await copyText(absUrl("#" + b.slug));
            toast("Ссылка на «" + b.name + "» скопирована");
          },
        }, el("span", { class: "icon icon-link", "aria-hidden": "true" })),
      ]);
      const head = el("div", { class: "section-head" }, [
        el("div", { class: "section-title-wrap" }, [
          title,
          el("p", {
            class: "section-meta",
            text: `${nl} ${plural(nl, "логотип", "логотипа", "логотипов")} · ${nf} ${plural(nf, "шрифт", "шрифта", "шрифтов")}: ${b.fonts.map((f) => f.family).join(", ")}`,
          }),
        ]),
        el("div", { class: "section-actions" }, [
          b.guide ? el("a", { class: "btn btn-ghost", href: b.guide.url, target: "_blank", rel: "noopener", title: "Правила использования логотипа и шрифтов" }, [
            el("span", { class: "icon icon-layers", "aria-hidden": "true" }),
            el("span", { text: "Инструкция" }),
            el("span", { class: "btn-meta", text: "PDF · " + fmtSize(b.guide.size) }),
          ]) : null,
          el("a", { class: "btn btn-ghost", href: b.zip.url, download: "" }, [
            el("span", { class: "icon icon-download", "aria-hidden": "true" }),
            el("span", { text: "Всё для " + b.name }),
            el("span", { class: "btn-meta", text: "ZIP · " + fmtSize(b.zip.size) }),
          ]),
        ]),
      ]);
      const logos = el("div", { class: "logo-grid" }, b.logos.map((l) => logoCard(b, l)));
      const fonts = el("div", { class: "font-grid" }, b.fonts.map(fontCard));
      main.append(el("section", { class: "brand-section", id: b.slug, "data-slug": b.slug }, [
        head,
        el("h3", { class: "sub-title", text: "Логотипы" }),
        logos,
        el("h3", { class: "sub-title", text: "Шрифты" }),
        fonts,
        b.video ? videoBlock(b) : null,
      ]));
    }
    document.head.append(el("style", { text: fontFaces.join("\n") }));
  }

  // ---------- Окно логотипа ----------
  const modal = $("#logoModal");
  const state = { brand: null, logo: null, fg: "brand", fgCustom: "#E5484D", bg: "none", bgCustom: "#F2EEE6", format: "svg", size: 4000, customSize: "", returnFocus: null };

  function fgColors() {
    const n = state.logo.fg[0].colors.length;
    if (state.fg === "custom") return Array(n).fill(state.fgCustom.toUpperCase());
    return fgPreset(state.logo, state.fg).colors;
  }
  function bgHex() {
    if (state.bg === "custom") return state.bgCustom.toUpperCase();
    return bgPreset(state.logo, state.bg).color || null;
  }
  // Готовый файл на сервере для текущей версии (или null).
  function staticVariant() {
    return Object.values(state.logo.variants).find((v) => v.fg === state.fg && v.bg === state.bg) || null;
  }
  function currentSize() {
    const n = parseInt(state.customSize, 10);
    if (state.customSize && n > 0) return Math.min(MAX_SIZE, Math.max(16, n));
    return state.size;
  }
  const NO_VECTOR = "PDF и EPS готовы только для фирменных версий логотипа. Для этого сочетания возьмите SVG — он тоже векторный.";
  function formatAvailability() {
    const sv = staticVariant();
    const bg = bgHex();
    return {
      svg: { ok: true },
      png: { ok: true },
      jpg: bg ? { ok: true } : { ok: false, why: "JPG не бывает прозрачным — выберите фон, чтобы скачать JPG." },
      pdf: sv ? { ok: true } : { ok: false, why: NO_VECTOR },
      eps: sv ? { ok: true } : { ok: false, why: NO_VECTOR },
    };
  }

  // Кружок версии: один цвет или несколько секторами.
  function dotFill(colors) {
    const list = [].concat(colors).filter((c, i, a) => a.indexOf(c) === i);
    if (list.length === 1) return list[0];
    const step = 100 / list.length;
    return "linear-gradient(135deg," + list.map((c, i) => `${c} ${i * step}% ${(i + 1) * step}%`).join(",") + ")";
  }
  function swatch({ key, group, label, color, pressed, kind, hex }) {
    const dotClass = "swatch-dot" + (kind === "none" ? " is-none" : "") + (kind === "custom" ? " is-custom" + (pressed ? " has-color" : "") : "");
    const btn = el("button", { type: "button", class: "swatch", "aria-pressed": pressed ? "true" : "false", "data-key": key }, [
      el("span", { class: dotClass, style: color ? `--c:${dotFill(color)}` : null }),
      el("span", { text: label }),
      hex ? el("span", { class: "swatch-hex", text: hex }) : null,
    ]);
    if (kind === "custom") {
      const input = el("input", { type: "color", "aria-label": label + ": выбрать цвет", value: color || "#E5484D" });
      input.addEventListener("input", () => {
        if (group === "fg") state.fgCustom = input.value;
        else state.bgCustom = input.value;
        state[group] = "custom";
        update();
      });
      input.addEventListener("click", () => {
        state[group] = "custom";
        update();
      });
      btn.append(input);
    } else {
      btn.addEventListener("click", () => {
        state[group] = key;
        update();
      });
    }
    return btn;
  }

  function renderSwatches() {
    const logo = state.logo;
    const custom = (group) => {
      const val = group === "fg" ? state.fgCustom : state.bgCustom;
      const on = state[group] === "custom";
      return swatch({ key: "custom", group, label: "Свой", color: val, pressed: on, kind: "custom", hex: on ? val.toUpperCase() : null });
    };
    const single = (p) => new Set(p.colors).size === 1;
    $("#fgSwatches").replaceChildren(
      ...logo.fg.map((p) => swatch({
        key: p.key, group: "fg", label: p.label, color: p.colors, pressed: state.fg === p.key,
        hex: p.key === "brand" && single(p) && p.colors[0] !== "#FFFFFF" ? p.colors[0] : null,
      })),
      logo.custom ? custom("fg") : "",
    );
    $("#bgSwatches").replaceChildren(
      ...logo.bg.map((p) => swatch({ key: p.key, group: "bg", label: p.label, color: p.color, pressed: state.bg === p.key, kind: p.color ? null : "none" })),
      logo.custom ? custom("bg") : "",
    );
    $("#bgSwatches").parentElement.hidden = logo.bg.length < 2 && !logo.custom;
  }

  function renderFormats() {
    const av = formatAvailability();
    if (!av[state.format].ok) state.format = state.format === "jpg" ? "png" : "svg";
    const tabs = $("#formatTabs");
    tabs.replaceChildren(...FORMATS.map((f) => el("button", {
      type: "button",
      class: "format-tab",
      "aria-pressed": state.format === f.id ? "true" : "false",
      disabled: !av[f.id].ok,
      title: av[f.id].why || null,
      onclick: () => { state.format = f.id; update(); },
      html: `${f.label}<small>${f.note}</small>`,
    })));
    const hints = FORMATS.map((f) => av[f.id].why).filter(Boolean);
    $("#formatHint").textContent = [...new Set(hints)].join(" ");
  }

  function renderSizes() {
    const raster = state.format === "png" || state.format === "jpg";
    $("#sizeField").hidden = !raster;
    if (!raster) return;
    const row = $("#sizeRow");
    const custom = el("input", {
      class: "size-input" + (state.customSize ? " is-active" : ""),
      type: "number",
      inputmode: "numeric",
      min: "16",
      max: String(MAX_SIZE),
      placeholder: "Свой, px",
      "aria-label": "Свой размер в пикселях",
    });
    custom.value = state.customSize;
    custom.addEventListener("input", () => {
      state.customSize = custom.value;
      custom.classList.toggle("is-active", !!custom.value);
      for (const c of row.querySelectorAll(".size-chip")) c.setAttribute("aria-pressed", !custom.value && +c.dataset.size === state.size ? "true" : "false");
      renderOut();
      renderAction();
    });
    const out = el("div", { class: "size-out", id: "sizeOut" });
    row.replaceChildren(
      ...SIZES.map((s) => el("button", {
        type: "button",
        class: "size-chip",
        "data-size": s,
        "aria-pressed": !state.customSize && state.size === s ? "true" : "false",
        onclick: () => { state.size = s; state.customSize = ""; update(); },
        text: s + " px",
      })),
      custom,
      out,
    );
    renderOut();
  }
  function renderOut() {
    const out = $("#sizeOut");
    if (!out) return;
    const px = pxFor(logoBox(state.logo, !!bgHex()), currentSize());
    out.textContent = `Итог: ${px[0]} × ${px[1]} px`;
  }

  // Что именно скачаем: готовый файл (url) или соберём в браузере (make).
  function plan() {
    const sv = staticVariant();
    const fmt = state.format;
    const raster = fmt === "png" || fmt === "jpg";
    const size = currentSize();
    if (sv && sv.files[fmt] && (!raster || size === Math.max(...sv.px))) {
      const f = sv.files[fmt];
      return { url: f.url, name: basename(f.url), size: f.size };
    }
    const fg = fgColors(), bg = bgHex();
    const base = state.logo.file;
    const hex = (c) => c.replace("#", "").toLowerCase();
    const fgTag = state.fg === "custom" ? hex(fg[0]) : fgPreset(state.logo, state.fg).tag;
    const bgTag = state.bg === "custom" ? hex(bg) : bgPreset(state.logo, state.bg).tag;
    const colorPart = fgTag + (bg ? "-on-" + bgTag : "");
    if (fmt === "svg") {
      return { make: () => new Blob([buildSvg(state.logo, fg, bg)], { type: "image/svg+xml" }), name: `${base}_${colorPart}.svg` };
    }
    const px = pxFor(logoBox(state.logo, !!bg), size);
    return {
      make: () => rasterize(buildSvg(state.logo, fg, bg, px), px, fmt === "png" ? "image/png" : "image/jpeg"),
      name: `${base}_${colorPart}_${px[0]}x${px[1]}.${fmt}`,
    };
  }

  function renderAction() {
    const p = plan();
    $("#modalDownloadLabel").textContent = `Скачать ${state.format.toUpperCase()}` + (p.size ? ` · ${fmtSize(p.size)}` : "");
    const link = $("#modalCopyLink");
    link.disabled = !p.url;
    link.title = p.url ? "Скопировать прямую ссылку на файл" : "Прямая ссылка есть только у готовых файлов (фирменные версии, 4000 px)";
  }

  function renderPreview() {
    const fg = fgColors(), bg = bgHex();
    const stage = $("#modalStage");
    stage.classList.toggle("is-transparent", !bg);
    const lum = fg.reduce((sum, c) => sum + luminance(c), 0) / fg.length;
    stage.dataset.contrast = lum > 0.5 ? "dark" : "light";
    stage.style.background = bg || "";
    $("#modalPreview").innerHTML = inlineSvg(state.logo, fg);
  }

  function update() {
    renderSwatches();
    renderFormats();
    renderSizes();
    renderPreview();
    renderAction();
  }

  function openModal(brand, logo, card) {
    state.brand = brand;
    state.logo = logo;
    state.returnFocus = document.activeElement;
    // Стартовое сочетание — как на карточке: белый на чёрном и т.п.
    const look = card ? card.dataset.look : "theme";
    const has = (key) => logo.bg.some((p) => p.key === key);
    if (look === "light" && has("white")) { state.fg = "brand"; state.bg = "white"; }
    else if (look === "dark" && has(logo.darkBg)) { state.fg = logo.onDark; state.bg = logo.darkBg; }
    else { state.fg = "brand"; state.bg = logo.bg[0].key; }
    state.format = "svg";
    $("#modalBrand").textContent = brand.name === logo.name ? "" : brand.name;
    $("#modalTitle").textContent = logo.name;
    $("#modalZip").href = logo.zip.url;
    $("#modalZip").title = "Все форматы и цвета одним архивом · " + fmtSize(logo.zip.size);
    update();
    modal.hidden = false;
    document.body.classList.add("is-locked");
    history.replaceState(null, "", "#logo-" + logo.id);
    $(".modal-close", modal).focus();
  }
  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("is-locked");
    history.replaceState(null, "", "#" + state.brand.slug);
    if (state.returnFocus) state.returnFocus.focus({ preventScroll: true });
  }

  function bindModal() {
    modal.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeModal();
      // Tab не уходит из открытого окна.
      if (e.key === "Tab" && !modal.hidden) {
        const items = [...modal.querySelectorAll("button:not(:disabled), a[href], input")].filter((n) => n.offsetParent !== null);
        const first = items[0], last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    $("#modalDownload").addEventListener("click", async () => {
      const p = plan();
      const btn = $("#modalDownload");
      if (p.url) {
        saveUrl(p.url, p.name);
        toast("Скачивается " + p.name);
        return;
      }
      btn.disabled = true;
      try {
        const blob = await p.make();
        saveBlob(blob, p.name);
        toast("Готово: " + p.name);
      } catch (err) {
        toast("Не получилось собрать файл — попробуйте размер поменьше");
      } finally {
        btn.disabled = false;
      }
    });
    $("#modalCopyLink").addEventListener("click", async () => {
      const p = plan();
      if (!p.url) return;
      await copyText(absUrl(p.url));
      toast("Ссылка на файл скопирована");
    });
  }

  // ---------- Тема (как в Picta: светлая / тёмная / как в системе) ----------
  function bindTheme() {
    const seg = $("#themeSeg");
    const get = () => document.documentElement.dataset.theme || "auto";
    const paint = () => {
      for (const b of seg.children) b.setAttribute("aria-pressed", b.dataset.themeSet === get() ? "true" : "false");
      const dark = get() === "dark" || (get() === "auto" && matchMedia("(prefers-color-scheme: dark)").matches);
      $('meta[name="theme-color"]').content = dark ? "#0b0b0f" : "#fafafa";
    };
    seg.addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-set]");
      if (!b) return;
      const t = b.dataset.themeSet;
      if (t === "auto") delete document.documentElement.dataset.theme;
      else document.documentElement.dataset.theme = t;
      try { localStorage.setItem("brandkit-theme", t); } catch (err) {}
      paint();
    });
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", paint);
    paint();
  }

  // ---------- Шапка: подложка при прокрутке, активная платформа ----------
  function bindScroll() {
    const bar = $("#topbar");
    const onScroll = () => bar.classList.toggle("is-scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    const tabs = [...document.querySelectorAll(".platform-tab")];
    const setActive = (slug) => {
      for (const t of tabs) {
        const on = t.dataset.slug === slug;
        t.classList.toggle("is-active", on);
        if (on && t.scrollIntoView && innerWidth < 780) t.parentElement.scrollTo({ left: t.offsetLeft - 12, behavior: "smooth" });
      }
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) setActive(e.target.dataset.slug);
    }, { rootMargin: "-45% 0px -50% 0px" });
    document.querySelectorAll(".brand-section").forEach((s) => io.observe(s));
    addEventListener("scroll", () => { if (scrollY < 200) setActive(null); }, { passive: true });
  }

  function openFromHash() {
    const m = location.hash.match(/^#logo-(.+)$/);
    if (!m) return;
    for (const b of DATA.brands) {
      const l = b.logos.find((x) => x.id === decodeURIComponent(m[1]));
      if (l) {
        document.getElementById(b.slug).scrollIntoView();
        openModal(b, l, null);
        return;
      }
    }
  }

  renderNav();
  renderHero();
  renderBrands();
  bindModal();
  bindTheme();
  bindScroll();
  openFromHash();
})();
