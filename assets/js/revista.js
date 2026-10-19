/* ===================================================================
   Revista de Drept Penal — reader
   1. Paginates the articles (kept as plain HTML in #tvArticles) into
      fixed 600 × 900 pages, with footnotes at the foot of the page that
      cites them.
   2. Binds the pages into a flip book (StPageFlip, assets/vendor).
   3. Offers a continuous "reading mode" built from the same HTML.
   =================================================================== */
(function () {
  "use strict";

  var PW = 600, PH = 900, LH = 20;
  var ISSUE = window.REVISTA_ISSUE;
  var STORE = "adp-revista-" + ISSUE.id;

  var UI = {
    ro: {
      cover: "Coperta", backCover: "Coperta a IV-a", pages: "Paginile", page: "Pagina", of: "din",
      contents: "Cuprins", reading: "Mod lectură", flip: "Pagini", full: "Ecran complet",
      back: "Revista", hint: "Trage de colțul paginii, apasă pe pagină sau folosește săgețile ← →",
      hintTouch: "Glisează sau atinge marginea paginii ca să întorci foaia",
      resume: "Ai rămas la pagina", cont: "Continuă", preparing: "Se așază paginile…",
      notes: "Note", prev: "Pagina anterioară", next: "Pagina următoare", close: "Închide",
      frontMatter: "Coperta și cuprinsul", backMatter: "Coperta a IV-a"
    },
    en: {
      cover: "Cover", backCover: "Back cover", pages: "Pages", page: "Page", of: "of",
      contents: "Contents", reading: "Reading mode", flip: "Pages", full: "Full screen",
      back: "Journal", hint: "Drag a page corner, click a page or use the ← → keys",
      hintTouch: "Swipe or tap the edge of the page to turn it",
      resume: "You stopped at page", cont: "Continue", preparing: "Laying out the pages…",
      notes: "Notes", prev: "Previous page", next: "Next page", close: "Close",
      frontMatter: "Cover and contents", backMatter: "Back cover"
    }
  };
  var lang = "ro";
  try { if (localStorage.getItem("adp-lang") === "en") lang = "en"; } catch (e) {}
  function t(k) { return UI[lang][k]; }

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var src = $("#tvArticles");
  var articles = Array.prototype.slice.call(src.querySelectorAll("article.art"));

  /* ---------------------------------------------------------------
     Tokenizing a block into words that keep their inline formatting
     --------------------------------------------------------------- */
  function tokenize(el) {
    var atoms = [];
    function last() { return atoms[atoms.length - 1]; }
    (function walk(node, marks) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var ch = node.childNodes[i];
        if (ch.nodeType === 3) {
          var parts = ch.data.match(/\s+|[^\s]+/g) || [];
          for (var j = 0; j < parts.length; j++) {
            if (/^\s+$/.test(parts[j])) { if (atoms.length) last().sp = " "; }
            else atoms.push({ w: parts[j], m: marks, fn: "", ids: [], sp: "" });
          }
        } else if (ch.nodeType === 1) {
          if (ch.matches("sup.fn")) {
            var a = ch.querySelector("a");
            var html = '<sup class="fn"><a href="' + a.getAttribute("href") + '" data-fn="' + a.dataset.fn + '">' + a.textContent + "</a></sup>";
            if (!atoms.length || last().sp) atoms.push({ w: "", m: marks, fn: "", ids: [], sp: "" });
            last().fn += html; last().ids.push(a.dataset.fn);
          } else if (ch.tagName === "BR") {
            if (atoms.length) last().sp = "<br>";
          } else {
            walk(ch, marks.concat([ch]));
          }
        }
      }
    })(el, []);
    return atoms;
  }
  function openTag(el) {
    var s = "<" + el.tagName.toLowerCase();
    for (var i = 0; i < el.attributes.length; i++) {
      var at = el.attributes[i];
      if (at.name !== "id") s += " " + at.name + '="' + at.value.replace(/"/g, "&quot;") + '"';
    }
    return s + ">";
  }
  function esc(s) { return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
  function render(atoms, a, b) {
    var out = "", stack = [];
    for (var i = a; i < b; i++) {
      var m = atoms[i].m, k = 0;
      while (k < stack.length && k < m.length && stack[k] === m[k]) k++;
      while (stack.length > k) { out += "</" + stack.pop().tagName.toLowerCase() + ">"; }
      for (; k < m.length; k++) { out += openTag(m[k]); stack.push(m[k]); }
      out += esc(atoms[i].w) + atoms[i].fn + (i < b - 1 ? atoms[i].sp : "");
    }
    while (stack.length) out += "</" + stack.pop().tagName.toLowerCase() + ">";
    return out;
  }
  function idsIn(atoms, a, b) {
    var ids = [];
    for (var i = a; i < b; i++) ids = ids.concat(atoms[i].ids);
    return ids;
  }

  /* ---------------------------------------------------------------
     Pagination
     --------------------------------------------------------------- */
  var measure = document.createElement("div");
  measure.className = "measure";
  document.body.appendChild(measure);

  var pages = [];          // {html, kind, first}
  var unitPage = {};       // source block id -> page index where it starts
  var articleStart = [];   // page index of each article's first page

  function side(i) { return i % 2 === 1 ? "l" : "r"; }

  function makePaper(kind) {
    var i = pages.length;
    var el = document.createElement("div");
    el.className = "pg paper " + side(i) + (kind ? " " + kind : "");
    el.innerHTML = '<div class="rh"><span></span><span></span></div><div class="pb"></div><div class="pn"></div><div class="folio">&nbsp;</div>';
    measure.innerHTML = "";
    measure.appendChild(el);
    return { el: el, pb: el.querySelector(".pb"), pn: el.querySelector(".pn"), notes: [], list: null, listSrc: null, first: null, index: i };
  }
  function commit(p, kind) {
    pages.push({ html: p.el.outerHTML, kind: kind || "paper", first: p.first });
  }
  function special(kind, html) {
    var i = pages.length;
    var cls = kind === "cover" ? "pg cover" : kind === "inside" ? "pg inside " + side(i) : "pg paper " + side(i);
    pages.push({ html: '<div class="' + cls + '">' + (html || "") + "</div>", kind: kind, first: null });
  }

  function fits(p) { return p.pb.scrollHeight <= p.pb.clientHeight + 0.5; }
  function contentBottom(p) {
    var lastEl = p.pb.lastElementChild;
    if (!lastEl) return 0;
    var r = lastEl.getBoundingClientRect(), top = p.pb.getBoundingClientRect().top;
    return r.bottom - top;
  }
  function noteHtml(art, id) {
    var li = art.querySelector("#" + id);
    var clone = li.cloneNode(true);
    var back = clone.querySelector(".fn-back");
    var n = back ? back.textContent : li.dataset.k;
    if (back) back.remove();
    return '<p class="note"><span class="note__n">' + n + "</span>" + clone.innerHTML.trim() + "</p>";
  }
  function setNotes(p, art, extra) {
    var all = p.notes.slice();
    extra.forEach(function (id) { if (all.indexOf(id) < 0) all.push(id); });
    p.pn.innerHTML = all.map(function (id) { return noteHtml(art, id); }).join("");
    return all;
  }

  function flowArticle(art, artIndex) {
    var author = art.dataset.author;
    var units = [];
    var n = 0;
    function tag(el) { el.dataset.b = art.id + "-" + (n++); return el; }
    units.push({ type: "opener", el: tag(art.querySelector(".art__head")) });
    art.querySelectorAll(".abs > p").forEach(function (p) { units.push({ type: "p", el: tag(p) }); });
    units.push({ type: "absend" });
    Array.prototype.forEach.call(art.querySelector(".art__body").children, function (ch) {
      if (ch.matches("h3,h4")) units.push({ type: "h", el: tag(ch) });
      else if (ch.matches("ol,ul")) {
        Array.prototype.forEach.call(ch.children, function (li, k) { units.push({ type: "li", el: tag(li), list: ch, index: k }); });
      } else units.push({ type: "p", el: tag(ch) });
    });

    var p = null;
    function newPage(opener) {
      if (p) commit(p);
      p = makePaper(opener ? "opener-pg" : "");
      var rh = p.el.querySelector(".rh");
      if (opener) rh.classList.add("rh--none");
      rh.children[0].textContent = side(p.index) === "l" ? ISSUE.running : author;
      rh.children[1].textContent = "";
      p.pb.setAttribute("lang", art.getAttribute("lang"));
      return p;
    }
    function mark(u) {
      if (!p.first && u.el) p.first = u.el.dataset.b;
      if (u.el && !(u.el.dataset.b in unitPage)) unitPage[u.el.dataset.b] = p.index;
    }
    function empty() { return !p.pb.firstElementChild; }

    articleStart[artIndex] = pages.length;
    newPage(true);

    units.forEach(function (u) {
      if (u.type === "opener") {
        var box = document.createElement("div");
        box.className = "opener art__head";
        Array.prototype.forEach.call(u.el.children, function (c) { var k = c.cloneNode(true); k.removeAttribute("id"); box.appendChild(k); });
        p.pb.appendChild(box);
        mark(u);
        return;
      }
      if (u.type === "absend") {
        var hr = document.createElement("div"); hr.className = "abs-end";
        p.pb.appendChild(hr);
        if (!fits(p)) hr.remove();
        return;
      }
      if (u.type === "h") {
        var h = u.el.cloneNode(true); h.removeAttribute("id");
        p.pb.appendChild(h);
        // keep a heading with at least three lines of what follows
        if (!fits(p) || p.pb.clientHeight - contentBottom(p) < LH * 3 + 4) {
          h.remove(); newPage(false); p.pb.appendChild(h);
        }
        p.list = null;
        mark(u);
        return;
      }
      placeSplittable(u);
    });
    if (p) commit(p);

    function container(u) {
      if (u.type !== "li") { p.list = null; return p.pb; }
      if (p.list && p.listSrc === u.list) return p.list;
      var l = document.createElement(u.list.tagName.toLowerCase());
      l.className = u.list.className;
      if (u.list.tagName === "OL") l.setAttribute("start", u.index + 1);
      p.pb.appendChild(l);
      p.list = l; p.listSrc = u.list;
      return l;
    }
    function placeSplittable(u) {
      var atoms = tokenize(u.el);
      var start = 0, guard = 0;
      if (!atoms.length) return;
      while (start < atoms.length && guard++ < 400) {
        var createdList = !(u.type === "li" && p.list && p.listSrc === u.list);
        var hadContent = !!p.pb.firstElementChild;
        var box = container(u);
        var node = document.createElement(u.type === "li" ? "li" : "p");
        if (u.el.className) node.className = u.el.className;
        if (u.type === "li" && u.list.tagName === "OL") node.value = u.index + 1;
        if (start > 0) node.classList.add("cont");
        node.dataset.b = u.el.dataset.b;
        box.appendChild(node);

        var tryFill = function (a, b) {
          node.innerHTML = render(atoms, a, b);
          setNotes(p, art, idsIn(atoms, a, b));
          return fits(p);
        };
        if (tryFill(start, atoms.length)) {
          p.notes = setNotes(p, art, idsIn(atoms, start, atoms.length));
          mark(u);
          return;
        }
        // break only where the source has a space
        var cands = [];
        for (var k = start + 1; k < atoms.length; k++) if (atoms[k - 1].sp) cands.push(k);
        var lo = 0, hi = cands.length - 1, best = -1;
        while (lo <= hi) {
          var mid = (lo + hi) >> 1;
          if (tryFill(start, cands[mid])) { best = mid; lo = mid + 1; } else hi = mid - 1;
        }
        var cut = best >= 0 ? cands[best] : start;
        if (cut > start) {
          tryFill(start, cut);
          if (node.getBoundingClientRect().height < LH * 2 - 2 && hadContent) cut = start;
        }
        if (cut === start) {
          node.remove();
          if (createdList && box !== p.pb && !box.children.length) { box.remove(); p.list = null; }
          setNotes(p, art, []);
          if (empty()) { // nothing fits even on an empty page: place it anyway
            box = container(u); box.appendChild(node); tryFill(start, atoms.length);
            p.notes = setNotes(p, art, idsIn(atoms, start, atoms.length)); mark(u); return;
          }
          newPage(false);
          continue;
        }
        tryFill(start, cut);
        node.classList.add("brk");
        p.notes = setNotes(p, art, idsIn(atoms, start, cut));
        mark(u);
        start = cut;
        newPage(false);
      }
    }
  }

  function tocHtml() {
    var items = articles.map(function (a, i) {
      var title = a.querySelector(".art__title").textContent;
      return '<a data-goto="' + (articleStart[i] + 1) + '"><span><span class="tocpg__au">' + esc(a.dataset.author) +
        '</span><span class="tocpg__ti">' + esc(title) + '</span></span><span class="tocpg__pg">' + (articleStart[i] + 1) + "</span></a>";
    }).join("");
    return '<div class="rh rh--none"><span></span><span></span></div><div class="pb">' +
      '<div class="tocpg__mast"><small>' + esc(ISSUE.publisher) + "</small><strong>" + esc(ISSUE.title) + "</strong><span>" + esc(ISSUE.issue) + "</span></div>" +
      '<h2 class="tocpg__title">Cuprins</h2><nav class="tocpg__list">' + items + "</nav></div><div class=\"pn\"></div><div class=\"folio\">3</div>";
  }

  function paginate() {
    pages = []; unitPage = {}; articleStart = [];
    special("cover", '<img src="' + ISSUE.front + '" alt="' + esc(ISSUE.frontAlt) + '">');
    special("inside");
    special("toc", ""); // filled once article pages are known
    articles.forEach(function (a, i) { flowArticle(a, i); });
    if ((pages.length + 2) % 2 === 1) special("blank");
    special("inside");
    special("cover", '<img src="' + ISSUE.back + '" alt="' + esc(ISSUE.backAlt) + '">');
    pages[2].html = '<div class="pg paper tocpg ' + side(2) + '">' + tocHtml() + "</div>";
    // page numbers
    pages.forEach(function (pg, i) {
      if (pg.kind === "paper") pg.html = pg.html.replace('<div class="folio">&nbsp;</div>', '<div class="folio">' + (i + 1) + "</div>");
    });
    measure.innerHTML = "";
  }

  /* ---------------------------------------------------------------
     The book
     --------------------------------------------------------------- */
  var stage = $("#stage"), book = null, host = null, box = null, portrait = false;
  var current = 0;

  function layout() {
    var W = stage.clientWidth, H = stage.clientHeight;
    var pad = W > 760 ? 96 : 12, vpad = W > 760 ? 28 : 14;
    var aw = W - pad * 2, ah = H - vpad * 2;
    portrait = aw / ah < 1.02;
    var pageH = portrait ? Math.min(ah, aw * 1.5) : Math.min(ah, (aw / 2) * 1.5);
    var pageW = Math.floor(pageH / 1.5);
    return { width: portrait ? pageW : pageW * 2, pageW: pageW, portrait: portrait };
  }
  function setScale() {
    if (!book) return;
    var r = book.getBoundsRect();
    if (r && r.pageWidth) host.style.setProperty("--s", (r.pageWidth / PW).toFixed(5));
  }
  function buildBook(startPage) {
    if (book) { try { book.destroy(); } catch (e) {} book = null; }
    if (box) box.remove();
    var L = layout();
    // the engine stretches its root to 100% width, so size a box around it
    box = document.createElement("div");
    box.className = "book-box";
    box.style.width = L.width + "px";
    host = document.createElement("div");
    host.className = "book-host";
    box.appendChild(host);
    stage.insertBefore(box, $("#navNext"));
    var els = pages.map(function (pg, i) {
      var d = document.createElement("div");
      d.className = "page";
      if (pg.kind === "cover") d.dataset.density = "hard";
      d.innerHTML = pg.html;
      return d;
    });
    els.forEach(function (d) { host.appendChild(d); });
    book = new St.PageFlip(host, {
      width: PW, height: PH, size: "stretch",
      // single page when the box is narrower than two minimum widths
      minWidth: L.portrait ? Math.ceil(L.width * 0.75) : 40, maxWidth: 4000, minHeight: 60, maxHeight: 6000,
      showCover: true, usePortrait: true, autoSize: true,
      maxShadowOpacity: 0.42, flippingTime: 820, mobileScrollSupport: false,
      swipeDistance: 24, startPage: startPage || 0, startZIndex: 1
    });
    book.on("flip", function (e) { current = e.data; onPage(); });
    book.on("changeState", function (e) {
      // start sliding to the centre as soon as a cover begins to open
      if (e.data === "flipping" && (current <= 0 || current >= total() - 1)) box.style.transform = "none";
    });
    book.on("init", function () { setScale(); onPage(); });
    book.on("changeOrientation", setScale);
    book.loadFromHTML(els);
    setScale();
    current = book.getCurrentPageIndex();
    onPage();
  }
  var resizeT;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () {
      if (!book || document.body.classList.contains("reading")) return;
      var L = layout();
      if (L.portrait !== portrait || Math.abs(L.width - box.offsetWidth) > 2) buildBook(current);
      else setScale();
    }, 140);
  });

  function total() { return pages.length; }
  function go(n) { // n: 0-based page index
    n = Math.max(0, Math.min(total() - 1, n));
    if (!book) return;
    if (Math.abs(n - current) <= 2) book.flip(n);
    else { book.turnToPage(n); current = n; box.classList.remove("is-fading"); void box.offsetWidth; box.classList.add("is-fading"); onPage(); }
  }
  function next() { if (book) book.flipNext(); }
  function prev() { if (book) book.flipPrev(); }

  /* ---------------------------------------------------------------
     Toolbar state
     --------------------------------------------------------------- */
  var where = $("#where"), range = $("#range"), tip = $("#scrubTip");
  function label(i) {
    var T = total();
    if (i <= 0) return "<b>" + t("cover") + "</b>";
    if (i >= T - 1) return "<b>" + t("backCover") + "</b>";
    if (portrait || !book || book.getOrientation() === "portrait") return t("page") + " <b>" + (i + 1) + "</b> " + t("of") + " " + T;
    var a = i % 2 === 1 ? i : i - 1;
    return t("pages") + " <b>" + (a + 1) + "–" + (a + 2) + "</b> " + t("of") + " " + T;
  }
  // a closed book sits centred: shift by half a page on the covers
  function centre(i) {
    if (!box) return;
    var land = book && book.getOrientation() === "landscape";
    box.style.transform = !land ? "none" : i <= 0 ? "translateX(-25%)" : i >= total() - 1 ? "translateX(25%)" : "none";
  }
  function onPage() {
    centre(current);
    where.innerHTML = label(current);
    range.max = total();
    range.value = current + 1;
    $("#navPrev").disabled = current <= 0;
    $("#navNext").disabled = current >= total() - 1;
    try {
      history.replaceState(null, "", current > 0 ? "#p" + (current + 1) : location.pathname + location.search);
      if (current > 2) localStorage.setItem(STORE, String(current));
    } catch (e) {}
    if (current > 0) dismissHint();
  }
  function ticks() {
    var box = $("#ticks"); box.innerHTML = "";
    articleStart.forEach(function (s) {
      var i = document.createElement("i");
      i.style.left = ((s) / Math.max(1, total() - 1) * 100) + "%";
      box.appendChild(i);
    });
  }
  range.addEventListener("input", function () {
    var v = +range.value, pct = (v - 1) / Math.max(1, total() - 1);
    tip.textContent = v === 1 ? t("cover") : v === total() ? t("backCover") : t("page") + " " + v;
    tip.style.left = "calc(" + (pct * 100) + "% + " + (8 - pct * 16) + "px)";
    tip.classList.add("is-on");
  });
  range.addEventListener("change", function () { tip.classList.remove("is-on"); go(+range.value - 1); });
  range.addEventListener("blur", function () { tip.classList.remove("is-on"); });

  $("#navPrev").addEventListener("click", prev);
  $("#navNext").addEventListener("click", next);
  $("#btnPrev").addEventListener("click", prev);
  $("#btnNext").addEventListener("click", next);

  document.addEventListener("keydown", function (e) {
    if (e.target.matches("input, textarea")) return;
    if (e.key === "Escape") { closeDrawer(); hidePop(); return; }
    if (document.body.classList.contains("reading")) return;
    if (e.key === "ArrowRight" || e.key === "PageDown") { e.preventDefault(); next(); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); prev(); }
    else if (e.key === "Home") { e.preventDefault(); go(0); }
    else if (e.key === "End") { e.preventDefault(); go(total() - 1); }
  });

  // touch: a quick tap on the outer thirds of the book turns the page
  // (the engine itself only reacts to swipes and drags)
  var tap = null;
  stage.addEventListener("touchstart", function (e) {
    var t0 = e.changedTouches[0];
    tap = { x: t0.clientX, y: t0.clientY, t: Date.now() };
  }, { passive: true });
  stage.addEventListener("touchend", function (e) {
    if (!tap || !box) return;
    var t1 = e.changedTouches[0];
    var moved = Math.abs(t1.clientX - tap.x) + Math.abs(t1.clientY - tap.y);
    var quick = Date.now() - tap.t < 350;
    tap = null;
    if (moved > 12 || !quick || e.target.closest("a,button")) return;
    var r = box.getBoundingClientRect();
    if (t1.clientY < r.top || t1.clientY > r.bottom) return;
    var rel = (t1.clientX - r.left) / r.width;
    if (rel > 0.66) next(); else if (rel < 0.34) prev();
  }, { passive: true });

  // links inside pages (contents page) and footnote links
  stage.addEventListener("click", function (e) {
    var a = e.target.closest("a");
    if (!a) return;
    e.preventDefault();
    if (a.dataset.goto) go(+a.dataset.goto - 1);
  });

  /* hint + resume */
  var hint = $("#hint");
  function dismissHint() {
    if (hint.classList.contains("is-gone")) return;
    hint.classList.add("is-gone");
    try { localStorage.setItem(STORE + "-hint", "1"); } catch (e) {}
  }

  /* fullscreen */
  $("#btnFull").addEventListener("click", function () {
    var d = document;
    if (!d.fullscreenElement) { (d.documentElement.requestFullscreen || function () {}).call(d.documentElement); }
    else d.exitFullscreen();
  });
  if (!document.documentElement.requestFullscreen) $("#btnFull").hidden = true;

  /* ---------------------------------------------------------------
     Contents drawer
     --------------------------------------------------------------- */
  var drawer = $("#drawer"), scrim = $("#scrim");
  function openDrawer() { buildDrawer(); drawer.classList.add("is-open"); scrim.classList.add("is-on"); $("#btnToc").setAttribute("aria-expanded", "true"); setTimeout(function () { drawer.querySelector("button").focus(); }, 50); }
  function closeDrawer() { drawer.classList.remove("is-open"); scrim.classList.remove("is-on"); $("#btnToc").setAttribute("aria-expanded", "false"); }
  $("#btnToc").addEventListener("click", function () { drawer.classList.contains("is-open") ? closeDrawer() : openDrawer(); });
  scrim.addEventListener("click", closeDrawer);
  $("#drawerClose").addEventListener("click", closeDrawer);
  function buildDrawer() {
    var list = $("#tocList");
    var h = '<button class="toc-cover" data-p="0"><span>' + t("frontMatter") + "</span><span>1–3</span></button>";
    articles.forEach(function (a, i) {
      h += '<button class="toc-item" data-p="' + articleStart[i] + '" data-a="' + a.id + '"><span class="toc-item__top"><span class="toc-item__author">' +
        esc(a.dataset.author) + '</span><span class="toc-item__pg">' + (articleStart[i] + 1) + '</span></span><span class="toc-item__title">' +
        esc(a.querySelector(".art__title").textContent) + "</span></button>";
      a.querySelectorAll(".art__body .art__h").forEach(function (hd) {
        var pg = unitPage[hd.dataset.b];
        if (pg == null) return;
        h += '<button class="toc-sub' + (hd.tagName === "H4" ? " is-l1" : "") + '" data-p="' + pg + '" data-h="' + (hd.id || "") + '"><span>' +
          esc(hd.textContent.trim()) + "</span><span>" + (pg + 1) + "</span></button>";
      });
    });
    h += '<button class="toc-cover" data-p="' + (total() - 1) + '"><span>' + t("backMatter") + "</span><span>" + total() + "</span></button>";
    list.innerHTML = h;
  }
  $("#tocList").addEventListener("click", function (e) {
    var b = e.target.closest("button");
    if (!b) return;
    closeDrawer();
    if (document.body.classList.contains("reading")) {
      var target = b.dataset.h ? document.getElementById(b.dataset.h) : b.dataset.a ? document.getElementById(b.dataset.a) : null;
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
      else tv.scrollTo({ top: 0, behavior: "smooth" });
    } else go(+b.dataset.p);
  });

  /* ---------------------------------------------------------------
     Reading mode
     --------------------------------------------------------------- */
  var tv = $("#tv"), pop = $("#fnpop");
  function setReading(on, keepScroll) {
    var target = current;
    if (!on) {
      // the page holding the first block visible in the text
      var blocks = src.querySelectorAll("[data-b]");
      for (var j = 0; j < blocks.length; j++) {
        if (blocks[j].getBoundingClientRect().bottom > 90) {
          if (blocks[j].dataset.b in unitPage) target = unitPage[blocks[j].dataset.b];
          break;
        }
      }
    }
    document.body.classList.toggle("reading", on);
    tv.classList.toggle("is-on", on);
    $("#btnRead").setAttribute("aria-pressed", on ? "true" : "false");
    $("#btnRead .lbl").textContent = on ? t("flip") : t("reading");
    if (on) {
      // scroll to the block that opens the current page
      var pgIdx = current, b = null;
      for (var i = pgIdx; i >= 0 && !b; i--) b = pages[i] && pages[i].first;
      var el = b && src.querySelector('[data-b="' + b + '"]');
      if (!keepScroll) tv.scrollTop = el ? el.getBoundingClientRect().top + tv.scrollTop - 80 : 0;
      try { history.replaceState(null, "", "#text"); } catch (e) {}
    } else {
      buildBook(target);
    }
  }
  $("#btnRead").addEventListener("click", function () { setReading(!document.body.classList.contains("reading")); });
  $("#readPill").addEventListener("click", function () { setReading(true); });
  window.addEventListener("hashchange", function () {
    if (location.hash === "#text" && !document.body.classList.contains("reading")) setReading(true);
  });

  function hidePop() { pop.hidden = true; }
  tv.addEventListener("click", function (e) {
    var a = e.target.closest("sup.fn a");
    if (!a) { if (!e.target.closest(".fnpop")) hidePop(); return; }
    e.preventDefault();
    var li = document.getElementById(a.dataset.fn);
    if (!li) return;
    var c = li.cloneNode(true); var back = c.querySelector(".fn-back"); if (back) back.remove();
    pop.innerHTML = '<b class="n">' + a.textContent + "</b>" + c.innerHTML;
    pop.hidden = false;
    var r = a.getBoundingClientRect();
    var w = pop.offsetWidth, x = Math.min(window.innerWidth - w - 12, Math.max(12, r.left - w / 2));
    var y = r.bottom + 10;
    if (y + pop.offsetHeight > window.innerHeight - 12) y = r.top - pop.offsetHeight - 10;
    pop.style.left = x + "px"; pop.style.top = y + "px";
  });
  tv.addEventListener("scroll", hidePop, { passive: true });

  /* ---------------------------------------------------------------
     Language of the interface
     --------------------------------------------------------------- */
  function applyLang() {
    document.querySelectorAll("[data-ui]").forEach(function (el) { el.textContent = t(el.dataset.ui); });
    document.querySelectorAll("[data-ui-label]").forEach(function (el) { el.setAttribute("aria-label", t(el.dataset.uiLabel)); el.title = t(el.dataset.uiLabel); });
    $("#btnRead .lbl").textContent = document.body.classList.contains("reading") ? t("flip") : t("reading");
    src.querySelectorAll(".notes").forEach(function (n) { n.dataset.label = t("notes"); });
    hint.textContent = matchMedia("(hover:none)").matches ? t("hintTouch") : t("hint");
    document.querySelectorAll(".lang [data-l]").forEach(function (s) { s.classList.toggle("on", s.dataset.l === lang); });
    if (book) onPage();
  }
  $("#lang").addEventListener("click", function () {
    lang = lang === "en" ? "ro" : "en";
    try { localStorage.setItem("adp-lang", lang); } catch (e) {}
    applyLang();
  });

  /* ---------------------------------------------------------------
     Start
     --------------------------------------------------------------- */
  function fontsReady() {
    if (!document.fonts || !document.fonts.load) return Promise.resolve();
    var f = ['400 13.4px "Newsreader"', 'italic 400 13.4px "Newsreader"', '600 13.4px "Newsreader"', '500 13.4px "Newsreader"',
      'italic 600 13.4px "Newsreader"', '600 9px "Public Sans"', '400 9px "Public Sans"'];
    return Promise.all(f.map(function (x) { return document.fonts.load(x, "ăîșțâ"); })).then(function () { return document.fonts.ready; }).catch(function () {});
  }
  applyLang();
  var bar = $("#loadBar");
  bar.style.width = "35%";
  fontsReady().then(function () {
    bar.style.width = "70%";
    requestAnimationFrame(function () {
      var t0 = performance.now();
      paginate();
      window.__revistaStats = { pages: pages.length, ms: Math.round(performance.now() - t0), articleStart: articleStart.slice() };
      ticks();
      var h = location.hash, start = 0;
      var m = /^#p(\d+)$/.exec(h);
      if (m) start = Math.max(0, Math.min(pages.length - 1, +m[1] - 1));
      var ma = /^#a(\d+)$/.exec(h); // link to an article: open at its first page
      if (ma && articleStart[+ma[1] - 1] != null) { start = articleStart[+ma[1] - 1]; m = ma; }
      bar.style.width = "100%";
      buildBook(start);
      $("#loading").classList.add("is-done");
      var seen = false; try { seen = localStorage.getItem(STORE + "-hint") === "1"; } catch (e) {}
      if (seen || start > 0) hint.classList.add("is-gone");
      else setTimeout(dismissHint, 9000);
      if (/^#text/.test(h)) { setReading(true, true); var a = h.split("-")[1]; if (a && document.getElementById(a)) document.getElementById(a).scrollIntoView(); }
      else if (!m) {
        var saved = 0; try { saved = +localStorage.getItem(STORE) || 0; } catch (e) {}
        if (saved > 2 && saved < pages.length - 1) {
          var toast = $("#toast");
          $("#toastText").textContent = t("resume") + " " + (saved + 1) + ".";
          toast.hidden = false;
          $("#toastGo").onclick = function () { toast.hidden = true; go(saved); };
          $("#toastX").onclick = function () { toast.hidden = true; };
          setTimeout(function () { toast.hidden = true; }, 12000);
        }
      }
    });
  });
})();
