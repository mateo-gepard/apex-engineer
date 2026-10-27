/* APEX Engineer website: navigation, scroll motion, the exploded-car scroll
   sequence and the interactive engineering charts. No libraries. */
(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  root.classList.add("js");
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const fmt = (v, d = 1) => v.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

  /* ---------------------------------------------------------- nav */
  const nav = $(".nav");
  $(".nav-toggle")?.addEventListener("click", () => {
    const open = nav.toggleAttribute("data-open");
    $(".nav-toggle").setAttribute("aria-expanded", String(open));
  });

  /* ---------------------------------------------------------- reveal (transform only) */
  const vh = () => innerHeight;
  const rises = $$(".rise");
  rises.forEach((el) => { if (el.getBoundingClientRect().top > vh() * 0.92) el.classList.add("below"); });
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      e.target.classList.remove("below");
      if (e.target.classList.contains("wipe") && !reduce) e.target.classList.add("sweep");
      if (e.target.dataset.draw !== undefined) drawIn(e.target);
      io.unobserve(e.target);
    }
  }, { rootMargin: "0px 0px -12% 0px" });
  rises.forEach((el) => io.observe(el));
  $$(".wipe").forEach((el) => io.observe(el));
  $$("[data-draw]").forEach((el) => io.observe(el));

  function drawIn(svg) {
    if (reduce) return;
    $$("path.line", svg).forEach((p) => {
      const len = p.getTotalLength();
      p.style.transition = "none";
      p.style.strokeDasharray = len;
      p.style.strokeDashoffset = len;
      p.getBoundingClientRect();
      p.style.transition = "";
      p.style.strokeDashoffset = 0;
    });
  }

  /* ---------------------------------------------------------- hero parallax */
  const heroImg = $(".hero .hero-media img, .page-hero .hero-media img");
  if (heroImg && !reduce) {
    const onScroll = () => {
      const y = scrollY;
      if (y > innerHeight * 1.2) return;
      heroImg.style.transform = `translateY(${y * 0.18}px) scale(${1 + y * 0.00012})`;
    };
    addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---------------------------------------------------------- start lights */
  function lightsOut(g, loop) {
    const pods = $$(".pod", g);
    if (!pods.length) return;
    if (reduce) { return; }
    let i = 0;
    const step = () => {
      if (i < pods.length) { pods[i++].classList.add("on"); setTimeout(step, 1000); return; }
      // F1 procedure: all five on, then a random hold of 0.2 to 3 s, then out together.
      setTimeout(() => {
        pods.forEach((p) => p.classList.remove("on"));
        g.dispatchEvent(new CustomEvent("lightsout"));
        if (loop) setTimeout(() => { i = 0; step(); }, 6000);
      }, 200 + Math.random() * 2800);
    };
    setTimeout(step, 700);
  }
  $$("[data-lights]").forEach((g) => lightsOut(g, g.dataset.lights === "loop"));
  $$("[data-lights]").forEach((g) => g.addEventListener("lightsout", () => {
    const t = $(g.dataset.flash || "");
    if (t) { t.classList.remove("sweep"); void t.offsetWidth; t.classList.add("sweep"); }
  }));

  /* ---------------------------------------------------------- scroll sequence */
  $$("[data-scrub]").forEach((sec) => {
    const canvas = $("canvas", sec);
    const fallback = $(".scrub-frame > img", sec);
    const n = +sec.dataset.frames;
    const pattern = sec.dataset.pattern;
    const steps = $$(".scrub-step", sec);
    const tags = {};
    let labels = null;
    const frames = new Array(n);
    let loaded = 0, current = -1, want = 0;
    const ctx = canvas.getContext("2d");
    const names = JSON.parse(sec.dataset.names || "{}");
    const frameBox = $(".scrub-frame", sec);
    for (const k in names) {
      const t = document.createElement("span");
      t.className = "tag3d";
      t.textContent = names[k];
      frameBox.appendChild(t);
      tags[k] = t;
    }
    fetch(sec.dataset.labels).then((r) => r.json()).then((j) => { labels = j; render(true); }).catch(() => {});
    const load = (i) => new Promise((res) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = () => { frames[i] = img; loaded++; if (i === want || current < 0) render(true); res(); };
      img.onerror = res;
      img.src = pattern.replace("###", String(i).padStart(3, "0"));
    });
    // Load the first, the last and then everything in between.
    (async () => {
      await load(0);
      canvas.hidden = false;
      if (fallback) fallback.style.visibility = "hidden";
      await load(n - 1);
      const order = [];
      for (let s = 16; s >= 1; s = s >> 1) for (let i = 0; i < n; i += s) if (!frames[i] && !order.includes(i)) order.push(i);
      for (let i = 0; i < order.length; i += 6) await Promise.all(order.slice(i, i + 6).map(load));
    })();
    function nearest(i) {
      for (let d = 0; d < n; d++) {
        if (frames[i - d]) return i - d;
        if (frames[i + d]) return i + d;
      }
      return -1;
    }
    function progress() {
      const r = sec.getBoundingClientRect();
      const span = r.height - innerHeight;
      return clamp(-r.top / Math.max(1, span), 0, 1);
    }
    let active = -1;
    function render(force) {
      const p = progress();
      want = Math.round(clamp((p - 0.08) / 0.8, 0, 1) * (n - 1));
      const idx = nearest(want);
      if (idx >= 0 && (idx !== current || force)) {
        const img = frames[idx];
        if (canvas.width !== img.naturalWidth) { canvas.width = img.naturalWidth; canvas.height = img.naturalHeight; }
        ctx.drawImage(img, 0, 0);
        current = idx;
      }
      // Step whose middle is nearest the viewport middle is active.
      let best = -1, bd = 1e9;
      steps.forEach((s, i) => {
        const b = s.getBoundingClientRect();
        const d = Math.abs((b.top + b.bottom) / 2 - innerHeight * 0.55);
        if (d < bd) { bd = d; best = i; }
      });
      if (best !== active) {
        steps.forEach((s, i) => s.toggleAttribute("data-active", i === best));
        active = best;
      }
      const show = (steps[active]?.dataset.tags || "").split(" ").filter(Boolean);
      if (labels && current >= 0) {
        const f = labels[Math.min(labels.length - 1, current)];
        for (const k in tags) {
          const pos = f[k];
          const on = pos && show.includes(k) && pos[0] > 0.02 && pos[0] < 0.96 && pos[1] > 0.04 && pos[1] < 0.96;
          tags[k].classList.toggle("on", !!on);
          if (pos) { tags[k].style.left = pos[0] * 100 + "%"; tags[k].style.top = pos[1] * 100 + "%"; }
        }
      }
    }
    addEventListener("scroll", () => requestAnimationFrame(() => render(false)), { passive: true });
    addEventListener("resize", () => render(true));
  });

  /* ---------------------------------------------------------- weekend flow lights */
  $$("[data-flow]").forEach((sec) => {
    const rows = $$(".flow-row", sec);
    const pods = $$(".sticky-gantry .pod", sec);
    const update = () => {
      let on = 0;
      rows.forEach((r) => {
        const b = r.getBoundingClientRect();
        const lit = b.top < innerHeight * 0.62;
        r.toggleAttribute("data-on", lit);
        if (lit) on++;
      });
      pods.forEach((p, i) => p.classList.toggle("on", i < on));
    };
    addEventListener("scroll", () => requestAnimationFrame(update), { passive: true });
    update();
  });

  /* ---------------------------------------------------------- slide rows (blueprints) */
  $$("[data-slide]").forEach((el, i) => {
    if (reduce) return;
    const r = el.getBoundingClientRect();
    if (r.top < innerHeight) return;
    el.style.transform = `translateX(${(i % 2 ? -1 : 1) * 60}px)`;
    const o = new IntersectionObserver(([e]) => { if (e.isIntersecting) { el.style.transform = ""; o.disconnect(); } }, { rootMargin: "0px 0px -10% 0px" });
    o.observe(el);
  });

  /* ---------------------------------------------------------- copy */
  $$("[data-copy]").forEach((b) => b.addEventListener("click", async () => {
    const text = $(b.dataset.copy).textContent.trim();
    try { await navigator.clipboard.writeText(text); b.textContent = "Kopiert"; }
    catch { const r = document.createRange(); r.selectNodeContents($(b.dataset.copy)); getSelection().removeAllRanges(); getSelection().addRange(r); b.textContent = "Markiert"; }
    setTimeout(() => (b.textContent = "Kopieren"), 1800);
  }));

  /* ---------------------------------------------------------- SVG helpers */
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, parent) {
    const e = document.createElementNS(NS, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function axes(svg, box, x, y, xt, yt, xfmt, yfmt) {
    const g = el("g", { class: "grid" }, svg);
    yt.forEach((v) => {
      el("line", { x1: box.l, x2: box.r, y1: y(v), y2: y(v) }, g);
      const t = el("text", { x: box.l - 10, y: y(v) + 4, "text-anchor": "end" }, svg);
      t.textContent = yfmt(v);
    });
    xt.forEach((v) => {
      const t = el("text", { x: x(v), y: box.b + 20, "text-anchor": "middle" }, svg);
      t.textContent = xfmt(v);
    });
    el("line", { class: "axis", x1: box.l, x2: box.r, y1: box.b, y2: box.b }, svg);
  }
  const range = (input, out, f) => {
    const upd = () => {
      const p = (input.value - input.min) / (input.max - input.min) * 100;
      input.style.setProperty("--p", p + "%");
      if (out) out.textContent = f(+input.value);
    };
    input.addEventListener("input", upd);
    upd();
  };

  /* ---------------------------------------------------------- wing level lab */
  const wingLab = $("#wing-lab");
  if (wingLab) {
    const data = JSON.parse($("#wing-data").textContent);
    const svg = $("svg", wingLab);
    const slider = $("#wing-angle", wingLab);
    const outA = $("#wing-out", wingLab);
    let track = "monza";
    const colors = { monza: "#19d3ff", silverstone: "#f4f4f6", monaco: "#ff2b1c" };
    const W = 760, H = 340, box = { l: 58, r: W - 20, t: 18, b: H - 36 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const xs = (a) => box.l + (a - 8) / (36 - 8) * (box.r - box.l);
    // Lap time as delta to each circuit's own best (seconds).
    const rel = {};
    for (const k in data) { const best = Math.min(...data[k].rows.map((r) => r[1])); rel[k] = data[k].rows.map((r) => [r[0], r[1] - best, r[2]]); }
    const ys = (d) => box.t + clamp(d / 4, 0, 1) * (box.b - box.t);
    axes(svg, box, xs, ys, [8, 12, 16, 20, 24, 28, 32, 36], [0, 1, 2, 3, 4], (v) => v + "°", (v) => "+" + v + " s");
    const lines = {};
    for (const k in rel) {
      const d = rel[k].map((r, i) => (i ? "L" : "M") + xs(r[0]) + " " + ys(r[1])).join(" ");
      lines[k] = el("path", { d, class: "line", fill: "none", stroke: colors[k], "stroke-width": 2.4, "stroke-linejoin": "round", opacity: 0.35 }, svg);
      const best = rel[k].reduce((a, b) => (b[1] < a[1] ? b : a));
      el("circle", { cx: xs(best[0]), cy: ys(best[1]), r: 4, fill: colors[k], opacity: .9 }, svg);
    }
    const cursor = el("line", { y1: box.t, y2: box.b, stroke: "#f4f4f6", "stroke-dasharray": "3 4", opacity: .5 }, svg);
    const dot = el("circle", { r: 6, fill: "#0b0b10", "stroke-width": 3 }, svg);
    const interp = (rows, a, col) => {
      for (let i = 1; i < rows.length; i++) if (rows[i][0] >= a) { const t = (a - rows[i - 1][0]) / (rows[i][0] - rows[i - 1][0]); return lerp(rows[i - 1][col], rows[i][col], t); }
      return rows[rows.length - 1][col];
    };
    const upd = () => {
      const a = +slider.value;
      for (const k in lines) { lines[k].setAttribute("opacity", k === track ? 1 : .28); lines[k].setAttribute("stroke-width", k === track ? 3 : 2); }
      const d = interp(rel[track], a, 1), v = interp(rel[track], a, 2);
      cursor.setAttribute("x1", xs(a)); cursor.setAttribute("x2", xs(a));
      dot.setAttribute("cx", xs(a)); dot.setAttribute("cy", ys(d)); dot.setAttribute("stroke", colors[track]);
      const best = rel[track].reduce((x, y) => (y[1] < x[1] ? y : x));
      $("#wing-lap").textContent = d < 0.005 ? "Bestzeit" : "+" + fmt(d, 2) + " s";
      $("#wing-top").textContent = Math.round(v) + " km/h";
      $("#wing-best").textContent = best[0] + "°";
      $("#wing-track").textContent = data[track].name;
    };
    range(slider, outA, (v) => v + "° Heckflügel");
    slider.addEventListener("input", upd);
    $$("[data-track]", wingLab).forEach((b) => b.addEventListener("click", () => {
      track = b.dataset.track;
      $$("[data-track]", wingLab).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      upd();
    }));
    upd();
  }

  /* ---------------------------------------------------------- plank lab */
  const plankLab = $("#plank-lab");
  if (plankLab) {
    // The game's model (core/setup_physics.gd): wear per lap at average fuel.
    const PLANK_BASE = 0.0142;
    let bumpy = 0.3;
    const rh = $("#plank-rh"), sp = $("#plank-spring");
    const laps = 58;
    const svg = $("svg", plankLab);
    const W = 760, H = 260, box = { l: 58, r: W - 20, t: 16, b: H - 34 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const xs = (h) => box.l + (h - 22) / (42 - 22) * (box.r - box.l);
    const ys = (mm) => box.b - clamp(mm / 3, 0, 1) * (box.b - box.t);
    axes(svg, box, xs, ys, [22, 26, 30, 34, 38, 42], [0, 1, 2, 3], (v) => v + " mm", (v) => v + ",0");
    el("rect", { x: box.l, y: box.t, width: box.r - box.l, height: ys(1) - box.t, fill: "rgba(225,6,0,.08)" }, svg);
    el("line", { x1: box.l, x2: box.r, y1: ys(1), y2: ys(1), stroke: "#e10600", "stroke-width": 1.5, "stroke-dasharray": "6 4" }, svg);
    const lim = el("text", { x: box.r - 4, y: ys(1) - 8, "text-anchor": "end", fill: "#ff2b1c" }, svg);
    lim.textContent = "FIA-GRENZE 1,0 MM";
    const curve = el("path", { fill: "none", stroke: "#19d3ff", "stroke-width": 2.6 }, svg);
    const dot = el("circle", { r: 6, fill: "#0b0b10", stroke: "#f4f4f6", "stroke-width": 3 }, svg);
    const wear = (h, s) => {
      const springs = clamp(1 - 0.9 * (s - 1), 0.7, 1.35);
      return PLANK_BASE * Math.exp((32 - h) / 5.5) * (0.55 + bumpy) * springs * laps * 1.12;
    };
    const upd = () => {
      const h = +rh.value, s = +sp.value;
      let d = "";
      for (let x = 22; x <= 42.01; x += 0.25) d += (d ? "L" : "M") + xs(x) + " " + ys(wear(x, s));
      curve.setAttribute("d", d);
      const w = wear(h, s);
      dot.setAttribute("cx", xs(h)); dot.setAttribute("cy", ys(w));
      $("#plank-out").textContent = fmt(w, 2) + " mm";
      const st = $("#plank-state");
      st.className = "badge" + (w > 1 ? " bad" : w > 0.85 ? " warn" : "");
      st.firstElementChild.textContent = w > 1 ? "Disqualifikation bei Prüfung" : w > 0.85 ? "Knapp im Reglement" : "Im Reglement";
      // Lower runs closer to the floor optimum: the game's floor peaks near 30 mm.
      $("#plank-df").textContent = h < 30 ? "Unterboden am Optimum, Aufsetzrisiko auf Wellen" : (h < 35 ? "Wenig Abtriebsverlust" : "Spürbar weniger Abtrieb vom Unterboden");
    };
    range(rh, $("#plank-rh-out"), (v) => v + " mm");
    range(sp, $("#plank-spring-out"), (v) => "×" + fmt(v, 2));
    rh.addEventListener("input", upd); sp.addEventListener("input", upd);
    $$("[data-bumpy]", plankLab).forEach((b) => b.addEventListener("click", () => {
      bumpy = +b.dataset.bumpy;
      $$("[data-bumpy]", plankLab).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      upd();
    }));
    upd();
  }

  /* ---------------------------------------------------------- strategy lab */
  const stratLab = $("#strat-lab");
  if (stratLab) {
    // core/weekend.gd: lap factor = 1 + compound offset + deg(wear), deg(x) =
    // 0.016x + 0.024x³ (+0.16(x−0.82) beyond 82 %), pit stop 19 s + 2.6 s (2026).
    const TY = { S: { off: -0.009, wear: 0.055 }, M: { off: 0, wear: 0.035 }, H: { off: 0.007, wear: 0.024 } };
    const LAPS = 58, BASE = 80.5, PIT = 21.6, STRESS = 1.0;
    const deg = (x) => { x = Math.max(0, x); let d = 0.016 * x + 0.024 * x * x * x; if (x > 0.82) d += (x - 0.82) * 0.16; return d; };
    const plan = { a: "M", b: "H", pit: 24 };
    function laps(p) {
      const out = [];
      let maxw = 0;
      for (let i = 0; i < LAPS; i++) {
        const st = i < p.pit ? p.a : p.b;
        const age = i < p.pit ? i : i - p.pit;
        out.push(BASE * (1 + TY[st].off + deg(TY[st].wear * STRESS * age)));
      }
      maxw = Math.max(TY[p.a].wear * p.pit, TY[p.b].wear * (LAPS - p.pit));
      let total = out.reduce((a, b) => a + b, 0) + PIT;
      if (maxw > 1.05) total += (maxw - 1.05) * 60;
      return { out, total, maxw };
    }
    function best() {
      let b = null;
      for (const a of "SMH") for (const c of "SMH") {
        if (a === c) continue;
        for (let pit = 3; pit < LAPS - 2; pit++) { const r = laps({ a, b: c, pit }); if (!b || r.total < b.total) b = { a, b: c, pit, total: r.total }; }
      }
      return b;
    }
    const opt = best();
    const svg = $("svg", stratLab);
    const W = 760, H = 300, box = { l: 58, r: W - 20, t: 18, b: H - 34 };
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const xs = (l) => box.l + l / (LAPS - 1) * (box.r - box.l);
    const lo = BASE * 0.988, hi = BASE * 1.045;
    const ys = (t) => box.b - clamp((t - lo) / (hi - lo), 0, 1) * (box.b - box.t);
    axes(svg, box, xs, ys, [0, 10, 20, 30, 40, 50, 57], [lo, lo + (hi - lo) / 3, lo + 2 * (hi - lo) / 3, hi], (v) => "R" + (v + 1), (v) => fmt(v, 1));
    const fillA = el("rect", { y: box.t, height: box.b - box.t, opacity: .07 }, svg);
    const fillB = el("rect", { y: box.t, height: box.b - box.t, opacity: .07 }, svg);
    const ref = el("path", { fill: "none", stroke: "#f4f4f6", "stroke-width": 1.4, opacity: .35, "stroke-dasharray": "4 4" }, svg);
    const line = el("path", { fill: "none", stroke: "#19d3ff", "stroke-width": 2.6, "stroke-linejoin": "round" }, svg);
    const pitL = el("line", { y1: box.t, y2: box.b, stroke: "#f4f4f6", "stroke-width": 1, "stroke-dasharray": "2 4" }, svg);
    const pitT = el("text", { y: box.t + 12, fill: "#f4f4f6" }, svg);
    const col = { S: "#ff3b3b", M: "#ffd12e", H: "#f2f2f2" };
    const path = (arr) => arr.map((t, i) => (i ? "L" : "M") + xs(i) + " " + ys(t)).join(" ");
    ref.setAttribute("d", path(laps(opt).out));
    const pitIn = $("#strat-pit");
    const upd = () => {
      plan.pit = +pitIn.value;
      const r = laps(plan);
      line.setAttribute("d", path(r.out));
      fillA.setAttribute("x", box.l); fillA.setAttribute("width", xs(plan.pit - 0.5) - box.l); fillA.setAttribute("fill", col[plan.a]);
      fillB.setAttribute("x", xs(plan.pit - 0.5)); fillB.setAttribute("width", box.r - xs(plan.pit - 0.5)); fillB.setAttribute("fill", col[plan.b]);
      pitL.setAttribute("x1", xs(plan.pit - 0.5)); pitL.setAttribute("x2", xs(plan.pit - 0.5));
      pitT.setAttribute("x", xs(plan.pit - 0.5) + 6); pitT.textContent = "BOX";
      const dt = r.total - opt.total;
      $("#strat-delta").textContent = dt < 0.05 ? "Schnellste" : "+" + fmt(dt, 1) + " s";
      $("#strat-total").textContent = Math.floor(r.total / 60) + ":" + fmt(r.total % 60, 1).padStart(4, "0");
      $("#strat-wear").textContent = Math.round(r.maxw * 100) + " %";
      $("#strat-wear-box").classList.toggle("warn", r.maxw > 1);
    };
    range(pitIn, $("#strat-pit-out"), (v) => "Runde " + v);
    pitIn.addEventListener("input", upd);
    $$("[data-stint]", stratLab).forEach((b) => b.addEventListener("click", () => {
      const k = b.dataset.stint, c = b.dataset.c;
      plan[k] = c;
      $$(`[data-stint="${k}"]`, stratLab).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      upd();
    }));
    $("#strat-opt").textContent = `${opt.a} → ${opt.b}, Stopp in Runde ${opt.pit}`;
    upd();
  }

  /* ---------------------------------------------------------- correlation (calc → CFD → tunnel → track) */
  const corr = $("#corr");
  if (corr) {
    const stages = $$(".corr-stage", corr);
    const bars = $$("[data-sigma]", corr);
    const set = (i) => {
      stages.forEach((s, k) => s.toggleAttribute("data-on", k <= i));
      bars.forEach((b, k) => b.style.opacity = k <= i ? 1 : .25);
    };
    const upd = () => {
      const r = corr.getBoundingClientRect();
      const p = clamp((innerHeight * 0.7 - r.top) / (r.height * 0.8), 0, 0.999);
      set(Math.floor(p * stages.length));
    };
    addEventListener("scroll", () => requestAnimationFrame(upd), { passive: true });
    upd();
  }

  /* ---------------------------------------------------------- design hotspots */
  const hs = $("#hotspots");
  if (hs) {
    const cards = $$("[data-comp-card]");
    $$(".hotspot", hs).forEach((b) => b.addEventListener("click", () => {
      $$(".hotspot", hs).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      cards.forEach((c) => (c.hidden = c.dataset.compCard !== b.dataset.comp));
    }));
  }
})();
