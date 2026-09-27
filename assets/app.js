
(function () {
  'use strict';

  var DATA = (window.NOVEL_DATA && window.NOVEL_DATA.books) ? window.NOVEL_DATA : { books: [] };
  var BOOKS = DATA.books || [];

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeDecode(s) {
    try { return decodeURIComponent(s); } catch (e) { return s; }
  }

  function findBook(slug) {
    if (!slug) return null;
    var decoded = safeDecode(slug);
    for (var i = 0; i < BOOKS.length; i++) {
      var b = BOOKS[i];
      if (b.slug === slug || b.slug === decoded) return b;
    }
    return null;
  }

  /* ---------- 视图切换 ---------- */
  var viewHome = document.getElementById('view-home');
  var viewBook = document.getElementById('view-book');
  var viewChapter = document.getElementById('view-chapter');

  function showView(name) {
    viewHome.style.display = name === 'home' ? '' : 'none';
    viewBook.style.display = name === 'book' ? '' : 'none';
    viewChapter.style.display = name === 'chapter' ? '' : 'none';
    window.scrollTo(0, 0);
  }

  function route() {
    var hash = location.hash.replace(/^#\/?/, '');
    var parts = hash.split('/').filter(Boolean).map(safeDecode);

    if (parts[0] === 'book' && parts[1]) {
      renderBook(parts[1]);
    } else if (parts[0] === 'read' && parts[1] && parts[2]) {
      renderChapter(parts[1], parseInt(parts[2], 10));
    } else {
      renderHome();
    }
  }

  /* ---------- 首页 ---------- */
  var grid = document.getElementById('book-grid');
  var emptyTip = document.getElementById('empty-tip');
  var filterInput = document.getElementById('filter');
  var sortSelect = document.getElementById('sort');

  function renderHome() {
    showView('home');
    document.title = 'Novel-Site · 书城';
    paintGrid();
  }

  function paintGrid() {
    var q = (filterInput.value || '').trim().toLowerCase();
    var list = BOOKS.slice();

    if (q) {
      list = list.filter(function (b) {
        return (b.title + ' ' + b.author + ' ' + (b.tags || []).join(' ')).toLowerCase().indexOf(q) >= 0;
      });
    }

    var mode = sortSelect.value;
    list.sort(function (a, b) {
      if (mode === 'chapters') return (b.chapters || []).length - (a.chapters || []).length;
      if (mode === 'title') return String(a.title).localeCompare(String(b.title), 'zh');
      return String(b.updated || '').localeCompare(String(a.updated || ''));
    });

    document.getElementById('stat-books').textContent = BOOKS.length;
    document.getElementById('stat-chapters').textContent = BOOKS.reduce(function (n, b) {
      return n + (b.chapters || []).length;
    }, 0);

    if (!list.length) {
      grid.innerHTML = '';
      emptyTip.style.display = '';
      return;
    }
    emptyTip.style.display = 'none';

    grid.innerHTML = list.map(function (b) {
      return '<article class="book-card">' +
        '<h3><a href="#/book/' + encodeURIComponent(b.slug) + '">' + esc(b.title) + '</a></h3>' +
        '<div class="book-meta"><span>' + esc(b.author) + '</span>' +
          '<span>' + (b.chapters || []).length + ' 章</span></div>' +
        '<p class="book-desc">' + esc(b.desc || '') + '</p>' +
        '<div class="tag-row">' + (b.tags || []).map(function (t) {
          return '<span class="tag">' + esc(t) + '</span>';
        }).join('') + '</div>' +
      '</article>';
    }).join('');
  }

  filterInput.addEventListener('input', paintGrid);
  sortSelect.addEventListener('change', paintGrid);

  /* ---------- 作品详情 ---------- */
  function renderBook(slug) {
    var b = findBook(slug);
    if (!b) { location.hash = ''; return; }
    showView('book');
    document.title = b.title + ' · Novel-Site';

    var cover = document.getElementById('detail-cover');
    if (b.cover) {
      cover.innerHTML = '<img src="' + esc(b.cover) + '" alt="' + esc(b.title) + '">';
    } else {
      cover.textContent = String(b.title).slice(0, 1);
    }

    document.getElementById('detail-title').textContent = b.title;
    document.getElementById('detail-byline').textContent =
      '作者：' + b.author + ' · 共 ' + (b.chapters || []).length + ' 章' +
      (b.updated ? ' · 最近更新 ' + b.updated : '');
    document.getElementById('detail-desc').textContent = b.desc || '（暂无简介）';

    document.getElementById('detail-tags').innerHTML = (b.tags || []).map(function (t) {
      return '<span class="tag">' + esc(t) + '</span>';
    }).join('');

    document.getElementById('detail-start').onclick = function () {
      if ((b.chapters || []).length) {
        location.hash = '#/read/' + encodeURIComponent(b.slug) + '/1';
      }
    };
    document.getElementById('detail-back').onclick = function () { location.hash = ''; };

    document.getElementById('detail-toc').innerHTML = (b.chapters || []).map(function (c) {
      return '<a class="toc-item" href="#/read/' + encodeURIComponent(b.slug) + '/' + c.n + '">' +
        '<span class="num">' + c.n + '</span>' +
        '<span class="name">' + esc(c.title) + '</span>' +
        '<span class="date">' + esc(c.date || '') + '</span>' +
      '</a>';
    }).join('');
  }

  /* ---------- 章节阅读 ---------- */
  var readerState = { fontSize: 18, lineHeight: 2 };
  try {
    var saved = JSON.parse(localStorage.getItem('ns-reader') || 'null');
    if (saved && saved.fontSize) readerState = saved;
  } catch (e) {}

  function applyReaderStyle() {
    var body = document.getElementById('chapter-body');
    if (!body) return;
    body.style.fontSize = readerState.fontSize + 'px';
    body.style.lineHeight = readerState.lineHeight;
  }

  function renderChapter(slug, n) {
    var b = findBook(slug);
    if (!b) { location.hash = ''; return; }

    var chapters = b.chapters || [];
    var idx = -1;
    for (var i = 0; i < chapters.length; i++) {
      if (chapters[i].n === n) { idx = i; break; }
    }
    if (idx < 0) { location.hash = '#/book/' + encodeURIComponent(b.slug); return; }

    showView('chapter');
    var c = chapters[idx];
    document.title = c.title + ' · ' + b.title;

    document.getElementById('side-book-title').textContent = b.title;
    document.getElementById('side-toc').innerHTML = chapters.map(function (ch) {
      return '<a class="toc-item' + (ch.n === n ? ' active' : '') +
        '" href="#/read/' + encodeURIComponent(b.slug) + '/' + ch.n + '">' +
        '<span class="num">' + ch.n + '</span>' +
        '<span class="name">' + esc(ch.title) + '</span>' +
      '</a>';
    }).join('');

    document.getElementById('chapter-title').textContent = c.title;
    document.getElementById('chapter-meta').textContent =
      b.title + ' · ' + b.author + (c.date ? ' · ' + c.date : '');

    var bodyEl = document.getElementById('chapter-body');

    if (c.html) {
      bodyEl.innerHTML = c.html;
    } else if (c.file) {
      bodyEl.innerHTML = '<p style="color:var(--text-dim);text-indent:0">正在加载…</p>';
      fetch(c.file, { cache: 'no-cache' })
        .then(function (r) {
          if (!r.ok) throw new Error('HTTP ' + r.status);
          return r.text();
        })
        .then(function (h) { bodyEl.innerHTML = h; })
        .catch(function () {
          bodyEl.innerHTML =
            '<p style="text-indent:0;color:var(--text-dim)">章节内容加载失败，请刷新重试。</p>';
        });
    } else {
      bodyEl.innerHTML = '<p style="text-indent:0;color:var(--text-dim)">（本章暂无内容）</p>';
    }

    applyReaderStyle();

    var prev = chapters[idx - 1];
    var next = chapters[idx + 1];
    document.getElementById('chapter-nav').innerHTML =
      '<a class="' + (prev ? '' : 'disabled') + '" ' +
        (prev ? 'href="#/read/' + encodeURIComponent(b.slug) + '/' + prev.n + '"' : '') + '>' +
        '<span>← 上一章</span><b>' + (prev ? esc(prev.title) : '已经是第一章') + '</b>' +
      '</a>' +
      '<a class="next ' + (next ? '' : 'disabled') + '" ' +
        (next ? 'href="#/read/' + encodeURIComponent(b.slug) + '/' + next.n + '"' : '') + '>' +
        '<span>下一章 →</span><b>' + (next ? esc(next.title) : '已经是最新章') + '</b>' +
      '</a>';

    try {
      localStorage.setItem('ns-last', JSON.stringify({
        slug: b.slug, n: n, title: c.title, book: b.title
      }));
    } catch (e) {}
  }

  /* ---------- 阅读器控件 ---------- */
  document.getElementById('font-plus').addEventListener('click', function () {
    readerState.fontSize = Math.min(30, readerState.fontSize + 1);
    saveReader();
  });
  document.getElementById('font-minus').addEventListener('click', function () {
    readerState.fontSize = Math.max(14, readerState.fontSize - 1);
    saveReader();
  });
  document.getElementById('to-top').addEventListener('click', function () {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  function saveReader() {
    try { localStorage.setItem('ns-reader', JSON.stringify(readerState)); } catch (e) {}
    applyReaderStyle();
  }

  /* ---------- 键盘翻页 ---------- */
  document.addEventListener('keydown', function (e) {
    var tag = (e.target.tagName || '').toUpperCase();
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    var links = document.querySelectorAll('#chapter-nav a');
    if (links.length < 2) return;
    if (e.key === 'ArrowLeft' && !links[0].classList.contains('disabled')) {
      location.hash = links[0].getAttribute('href');
    }
    if (e.key === 'ArrowRight' && !links[1].classList.contains('disabled')) {
      location.hash = links[1].getAttribute('href');
    }
  });

  /* ---------- 主题 ---------- */
  (function () {
    var root = document.documentElement;
    var t = null;
    try { t = localStorage.getItem('ns-theme'); } catch (e) {}
    if (!t) {
      t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark' : 'light';
    }
    root.setAttribute('data-theme', t);

    document.getElementById('theme-toggle').addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('ns-theme', next); } catch (e) {}
    });
  })();

  /* ---------- 启动 ---------- */
  window.addEventListener('hashchange', route);
  route();
})();
