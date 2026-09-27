/* ============================================================
 * Novel-Site · 前端应用
 * 数据来源：window.NOVEL_DATA（由 scripts/build.py 生成）
 * ============================================================ */
(function () {
  'use strict';

  /* ---------- 演示数据（构建脚本运行前的回退） ---------- */
  var DEMO_BOOKS = [
    {
      slug: 'demo-xinghai',
      title: '星海拾遗',
      author: '陆时舟',
      desc: '在废弃的空间站里，拾荒者捡到了一段不属于任何已知文明的记忆。',
      tags: ['科幻', '连载'],
      updated: '2026-09-24',
      chapters: [
        { n: 1, title: '第一章 漂流物', date: '2026-08-02',
          html: '<p>（这是演示章节。真正的正文会在构建时由 GitHub Issue 的 Markdown 转换而来。）</p>' +
                '<p>在废弃空间站的第七层，拾荒者关掉了头灯。黑暗里，有什么东西正在发光。</p>' +
                '<blockquote>「你听见了吗？那是回声。」</blockquote>' }
      ]
    },
    {
      slug: 'demo-changan',
      title: '长安客栈',
      author: '沈砚',
      desc: '一间开在西市尽头的客栈，来来往往的客人，都揣着不能说的故事。',
      tags: ['古风', '单元剧'],
      updated: '2026-09-20',
      chapters: [
        { n: 1, title: '第一章 雨夜来客', date: '2026-07-11',
          html: '<p>（演示章节）雨下了三天，客栈的门第一次被敲响。</p>' }
      ]
    }
  ];

  var DATA = (window.NOVEL_DATA && window.NOVEL_DATA.books && window.NOVEL_DATA.books.length)
    ? window.NOVEL_DATA
    : { generated: '', books: DEMO_BOOKS };

  var BOOKS = DATA.books;

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function findBook(slug) {
    for (var i = 0; i < BOOKS.length; i++) if (BOOKS[i].slug === slug) return BOOKS[i];
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
    var parts = hash.split('/').filter(Boolean);
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

    if (!list.length) {
      grid.innerHTML = '';
      emptyTip.style.display = '';
      return;
    }
    emptyTip.style.display = 'none';

    grid.innerHTML = list.map(function (b) {
      return '<article class="book-card">' +
        '<h3><a href="#/book/' + esc(b.slug) + '">' + esc(b.title) + '</a></h3>' +
        '<div class="book-meta"><span>' + esc(b.author) + '</span>' +
          '<span>' + (b.chapters || []).length + ' 章</span></div>' +
        '<p class="book-desc">' + esc(b.desc || '') + '</p>' +
        '<div class="tag-row">' + (b.tags || []).map(function (t) {
          return '<span class="tag">' + esc(t) + '</span>';
        }).join('') + '</div>' +
      '</article>';
    }).join('');

    document.getElementById('stat-books').textContent = BOOKS.length;
    document.getElementById('stat-chapters').textContent = BOOKS.reduce(function (n, b) {
      return n + (b.chapters || []).length;
    }, 0);
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
      location.hash = '#/read/' + b.slug + '/1';
    };
    document.getElementById('detail-back').onclick = function () { location.hash = ''; };

    document.getElementById('detail-toc').innerHTML = (b.chapters || []).map(function (c) {
      return '<a class="toc-item" href="#/read/' + b.slug + '/' + c.n + '">' +
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

    var idx = -1;
    for (var i = 0; i < (b.chapters || []).length; i++) {
      if (b.chapters[i].n === n) { idx = i; break; }
    }
    if (idx < 0) { location.hash = '#/book/' + b.slug; return; }

    showView('chapter');
    var c = b.chapters[idx];
    document.title = c.title + ' · ' + b.title;

    document.getElementById('side-book-title').textContent = b.title;
    document.getElementById('side-toc').innerHTML = b.chapters.map(function (ch) {
      return '<a class="toc-item' + (ch.n === n ? ' active' : '') +
        '" href="#/read/' + b.slug + '/' + ch.n + '">' +
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

    var prev = b.chapters[idx - 1];
    var next = b.chapters[idx + 1];
    document.getElementById('chapter-nav').innerHTML =
      '<a class="' + (prev ? '' : 'disabled') + '" ' +
        (prev ? 'href="#/read/' + b.slug + '/' + prev.n + '"' : '') + '>' +
        '<span>← 上一章</span><b>' + (prev ? esc(prev.title) : '已经是第一章') + '</b>' +
      '</a>' +
      '<a class="next ' + (next ? '' : 'disabled') + '" ' +
        (next ? 'href="#/read/' + b.slug + '/' + next.n + '"' : '') + '>' +
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
