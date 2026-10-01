(function () {
  'use strict';

  var DATA = (window.NOVEL_DATA && window.NOVEL_DATA.books) ? window.NOVEL_DATA : { books: [] };
  var BOOKS = DATA.books || [];

  var CONFIG = {
    tts: { enabled: false, api: '', voice: 'zh-CN', rate: 1, pitch: 1, headers: {} }
  };

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
    var d = safeDecode(slug);
    for (var i = 0; i < BOOKS.length; i++) {
      var b = BOOKS[i];
      if (b.slug === slug || b.slug === d || b.title === d) return b;
      if (b.slug && String(b.slug).toLowerCase() === String(d).toLowerCase()) return b;
    }
    return null;
  }
  function coverHTML(b, cls) {
    var initial = esc(String(b.title || '书').slice(0, 1));
    if (!b.cover) return '<div class="' + cls + '"><span class="cover-initial">' + initial + '</span></div>';
    return '<div class="' + cls + '">' +
      '<img src="' + esc(b.cover) + '" alt="' + esc(b.title) + '" loading="lazy" ' +
      'onerror="this.style.display=\'none\';if(this.nextElementSibling)this.nextElementSibling.style.display=\'flex\';">' +
      '<span class="cover-initial" style="display:none">' + initial + '</span></div>';
  }

  /* ---------- TTS ---------- */
  var TTS = {
    queue: [],
    index: 0,
    audio: null,
    utterance: null,
    state: 'idle',

    split: function (container) {
      var nodes = container.querySelectorAll('p, h1, h2, h3, h4, h5, h6, li, blockquote');
      var buf = [];
      if (nodes.length) {
        Array.prototype.forEach.call(nodes, function (el) {
          var t = (el.textContent || '').replace(/\s+/g, ' ').trim();
          if (t) buf.push(t);
        });
      } else {
        var t = (container.textContent || '').replace(/\s+/g, ' ').trim();
        if (t) buf.push(t);
      }
      var queue = [];
      var MAX = 180;
      buf.forEach(function (p) {
        if (p.length <= MAX) { queue.push(p); return; }
        var parts = p.split(/(?<=[。！？；.!?;])/);
        var cur = '';
        parts.forEach(function (s) {
          if ((cur + s).length > MAX && cur) { queue.push(cur); cur = s; }
          else cur += s;
        });
        if (cur) queue.push(cur);
      });
      return queue;
    },

    load: function (container) {
      this.stop();
      this.queue = this.split(container);
      this.index = 0;
    },

    play: function () {
      var self = this;
      if (this.index >= this.queue.length) {
        this.state = 'idle';
        this.index = 0;
        updateTtsBtn();
        return;
      }
      this.state = 'playing';
      updateTtsBtn();
      var text = this.queue[this.index];

      if (CONFIG.tts.api) {
        fetch(CONFIG.tts.api, {
          method: 'POST',
          headers: Object.assign({ 'Content-Type': 'application/json' }, CONFIG.tts.headers || {}),
          body: JSON.stringify({ text: text, voice: CONFIG.tts.voice, format: 'mp3' })
        })
          .then(function (r) {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            var ct = r.headers.get('content-type') || '';
            if (ct.indexOf('application/json') >= 0) {
              return r.json().then(function (d) {
                if (d.url) return d.url;
                if (d.audio) return 'data:audio/mpeg;base64,' + d.audio;
                throw new Error('no audio');
              });
            }
            return r.blob().then(function (b) { return URL.createObjectURL(b); });
          })
          .then(function (url) {
            var audio = new Audio(url);
            self.audio = audio;
            audio.onended = function () {
              if (url.indexOf('blob:') === 0) URL.revokeObjectURL(url);
              self.index++;
              self.play();
            };
            audio.onerror = function () {
              self.index++;
              self.play();
            };
            audio.play().catch(function () { self.speakBrowser(text); });
          })
          .catch(function () { self.speakBrowser(text); });
      } else {
        this.speakBrowser(text);
      }
    },

    speakBrowser: function (text) {
      if (!('speechSynthesis' in window)) {
        this.index++;
        this.play();
        return;
      }
      var self = this;
      var u = new SpeechSynthesisUtterance(text);
      u.lang = CONFIG.tts.voice || 'zh-CN';
      u.rate = CONFIG.tts.rate || 1;
      u.pitch = CONFIG.tts.pitch || 1;
      u.onend = function () { self.index++; self.play(); };
      u.onerror = function () { self.index++; self.play(); };
      this.utterance = u;
      speechSynthesis.speak(u);
    },

    pause: function () {
      if (this.audio) this.audio.pause();
      if ('speechSynthesis' in window && speechSynthesis.speaking) speechSynthesis.pause();
      this.state = 'paused';
      updateTtsBtn();
    },

    resume: function () {
      if (this.audio) this.audio.play();
      if ('speechSynthesis' in window && speechSynthesis.paused) speechSynthesis.resume();
      this.state = 'playing';
      updateTtsBtn();
    },

    stop: function () {
      if (this.audio) { this.audio.pause(); this.audio = null; }
      if ('speechSynthesis' in window) speechSynthesis.cancel();
      this.utterance = null;
      this.state = 'idle';
      this.index = 0;
      updateTtsBtn();
    }
  };

  function updateTtsBtn() {
    var btn = document.getElementById('tts-toggle');
    if (!btn) return;
    if (TTS.state === 'playing') { btn.textContent = '⏸'; btn.title = '暂停'; }
    else if (TTS.state === 'paused') { btn.textContent = '▶'; btn.title = '继续'; }
    else { btn.textContent = '🔊'; btn.title = '听书'; }
  }

  function initTtsUI() {
    var btn = document.getElementById('tts-toggle');
    if (!btn) return;
    if (!CONFIG.tts.enabled) { btn.style.display = 'none'; return; }
    btn.style.display = 'flex';
    btn.addEventListener('click', function () {
      var bodyEl = document.getElementById('chapter-body');
      if (!bodyEl) return;
      if (TTS.state === 'idle') {
        TTS.load(bodyEl);
        if (!TTS.queue.length) { alert('本章暂无内容可朗读'); return; }
        TTS.play();
      } else if (TTS.state === 'playing') {
        TTS.pause();
      } else if (TTS.state === 'paused') {
        TTS.resume();
      }
    });
  }

  /* ---------- 视图 ---------- */
  var vHome = document.getElementById('view-home');
  var vBook = document.getElementById('view-book');
  var vChapter = document.getElementById('view-chapter');
  function showView(n) {
    vHome.style.display = n === 'home' ? '' : 'none';
    vBook.style.display = n === 'book' ? '' : 'none';
    vChapter.style.display = n === 'chapter' ? '' : 'none';
    window.scrollTo(0, 0);
  }

  function route() {
    var h = location.hash.replace(/^#\/?/, '');
    var p = h.split('/').filter(Boolean).map(safeDecode);
    if (p[0] === 'book' && p[1]) renderBook(p[1]);
    else if (p[0] === 'read' && p[1] && p[2]) renderChapter(p[1], parseInt(p[2], 10));
    else renderHome();
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
    if (!list.length) { grid.innerHTML = ''; emptyTip.style.display = ''; return; }
    emptyTip.style.display = 'none';
    grid.innerHTML = list.map(function (b) {
      var url = '#/book/' + encodeURIComponent(b.slug);
      return '<article class="book-card">' +
        coverHTML(b, 'book-card-cover') +
        '<div class="book-card-body">' +
          '<h3><a href="' + url + '">' + esc(b.title) + '</a></h3>' +
          '<div class="book-meta"><span>' + esc(b.author) + '</span>' +
          '<span>' + (b.chapters || []).length + ' 章</span></div>' +
          '<p class="book-desc">' + esc(b.desc || '（暂无简介）') + '</p>' +
          '<div class="tag-row">' + (b.tags || []).map(function (t) {
            return '<span class="tag">' + esc(t) + '</span>';
          }).join('') + '</div>' +
        '</div></article>';
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
      cover.innerHTML = '<img src="' + esc(b.cover) + '" alt="' + esc(b.title) + '" ' +
        'onerror="this.style.display=\'none\';if(this.nextElementSibling)this.nextElementSibling.style.display=\'flex\';">' +
        '<span class="cover-initial" style="display:none">' + esc(String(b.title).slice(0, 1)) + '</span>';
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
      if ((b.chapters || []).length) location.hash = '#/read/' + encodeURIComponent(b.slug) + '/1';
    };
    document.getElementById('detail-back').onclick = function () { location.hash = ''; };
    document.getElementById('detail-toc').innerHTML = (b.chapters || []).map(function (c) {
      return '<a class="toc-item" href="#/read/' + encodeURIComponent(b.slug) + '/' + c.n + '">' +
        '<span class="num">' + c.n + '</span>' +
        '<span class="name">' + esc(c.title) + '</span>' +
        '<span class="date">' + esc(c.date || '') + '</span></a>';
    }).join('');
  }

  /* ---------- 阅读 ---------- */
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
    TTS.stop();

    var b = findBook(slug);
    if (!b) { location.hash = ''; return; }
    var chapters = b.chapters || [];
    var idx = -1;
    for (var i = 0; i < chapters.length; i++) if (chapters[i].n === n) { idx = i; break; }
    if (idx < 0) { location.hash = '#/book/' + encodeURIComponent(b.slug); return; }

    showView('chapter');
    var c = chapters[idx];
    document.title = c.title + ' · ' + b.title;
    document.getElementById('side-book-title').textContent = b.title;
    document.getElementById('side-toc').innerHTML = chapters.map(function (ch) {
      return '<a class="toc-item' + (ch.n === n ? ' active' : '') +
        '" href="#/read/' + encodeURIComponent(b.slug) + '/' + ch.n + '">' +
        '<span class="num">' + ch.n + '</span><span class="name">' + esc(ch.title) + '</span></a>';
    }).join('');
    document.getElementById('chapter-title').textContent = c.title;
    document.getElementById('chapter-meta').textContent =
      b.title + ' · ' + b.author + (c.date ? ' · ' + c.date : '');

    var bodyEl = document.getElementById('chapter-body');
    if (c.html) bodyEl.innerHTML = c.html;
    else if (c.file) {
      bodyEl.innerHTML = '<p style="color:var(--text-dim);text-indent:0">正在加载…</p>';
      fetch(c.file, { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (h) { bodyEl.innerHTML = h; })
        .catch(function () {
          bodyEl.innerHTML = '<p style="text-indent:0;color:var(--text-dim)">章节内容加载失败，请刷新重试。</p>';
        });
    } else bodyEl.innerHTML = '<p style="text-indent:0;color:var(--text-dim)">（本章暂无内容）</p>';

    applyReaderStyle();

    var prev = chapters[idx - 1], next = chapters[idx + 1];
    document.getElementById('chapter-nav').innerHTML =
      '<a class="' + (prev ? '' : 'disabled') + '" ' +
        (prev ? 'href="#/read/' + encodeURIComponent(b.slug) + '/' + prev.n + '"' : '') + '>' +
        '<span>← 上一章</span><b>' + (prev ? esc(prev.title) : '已经是第一章') + '</b></a>' +
      '<a class="next ' + (next ? '' : 'disabled') + '" ' +
        (next ? 'href="#/read/' + encodeURIComponent(b.slug) + '/' + next.n + '"' : '') + '>' +
        '<span>下一章 →</span><b>' + (next ? esc(next.title) : '已经是最新章') + '</b></a>';

    updateTtsBtn();

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
    if (e.key === 'ArrowLeft' && !links[0].classList.contains('disabled')) location.hash = links[0].getAttribute('href');
    if (e.key === 'ArrowRight' && !links[1].classList.contains('disabled')) location.hash = links[1].getAttribute('href');
  });

  /* ---------- 主题 ---------- */
  (function () {
    var root = document.documentElement;
    var t = null;
    try { t = localStorage.getItem('ns-theme'); } catch (e) {}
    if (!t) t = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    root.setAttribute('data-theme', t);
    document.getElementById('theme-toggle').addEventListener('click', function () {
      var next = root.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('ns-theme', next); } catch (e) {}
    });
  })();

  /* ---------- 加载配置后启动 ---------- */
  fetch('config.json', { cache: 'no-cache' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (cfg) {
      if (cfg && cfg.tts) CONFIG.tts = Object.assign(CONFIG.tts, cfg.tts);
    })
    .catch(function () {})
    .then(function () {
      initTtsUI();
      window.addEventListener('hashchange', route);
      route();
    });
})();
