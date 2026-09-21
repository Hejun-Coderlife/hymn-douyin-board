/* 门店页（手机）—— store.html?store=<抖音号>
   2026-09-21 整页重做：杂志式排版 + 底部固定标签栏（设计经过见 assets/store-mobile.css 的头注释）。

   四个标签：今天 / 本周 / 日历 / 我的。
   数据来自 data/scripts-index.js（日期、内容方向、拍摄形式）+ 按需加载的
   data/scripts/<门店编号>-<年月>.js 分片（开头 3 秒、分镜、标签）。
   **分片只在要用到那个月时才拉**，一次一个月约 70KB，手机上不会卡。

   状态怎么定（跟旧版一致，别改）：店员手机上通常没有视频数据，
   所以**不猜发没发** —— 过了计划日只说「计划日期已过」，不说「逾期未发」。
   只有本机真导入过视频数据时，才显示已发布/逾期。 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  var LOGIN = window.HY_LOGIN_PAGE || 'login.html';
  var CREW = '两个店员';        // 载入门店后按 staff 改写，见下面 loadData
  var qs = new URLSearchParams(location.search);
  var id = qs.get('store');
  if (id) HY.MyStore.set(id);
  else { id = HY.MyStore.get(); if (!id) { location.replace(LOGIN); return; } }

  var TODAY = HY.ymd(new Date());
  var D, STORE, MINE = {}, HASVIDEO = false, MATCH = null;
  var WD = ['日', '一', '二', '三', '四', '五', '六'];

  /* ---------- 工具 ---------- */
  function ymOf(d) { return d.slice(0, 7); }
  function addMonth(ym, n) {
    var y = +ym.slice(0, 4), m = +ym.slice(5, 7) - 1 + n;
    var t = new Date(y, m, 1);
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2);
  }
  function mondayOf(dstr) { return HY.ymd(HY.monday(HY.parseYmd(dstr))); }
  function shift(dstr, n) { return HY.ymd(HY.addDays(HY.parseYmd(dstr), n)); }
  function label(s) {
    if (s.date === TODAY) return { t: '今天 · 待拍', c: 'now' };
    if (HASVIDEO) {
      var stt = HY.statusOf(s, MATCH.byScript[s.id], TODAY);
      return { t: HY.STATUS_CN[stt], c: stt };
    }
    return s.date < TODAY ? { t: '计划日期已过', c: 'late' } : { t: '待拍', c: 'todo' };
  }
  function titleOf(s) {
    var full = HY.detail(s.id);
    return (full && full.title) || (s.topic + '｜' + s.format);
  }

  /* 分片按需加载：要用到哪几个月就拉哪几个月，拉过的不重复拉 */
  var loaded = {};
  function needMonths(yms) {
    var todo = yms.filter(function (y) { return !loaded[y]; });
    todo.forEach(function (y) { loaded[y] = 1; });
    if (!todo.length) return Promise.resolve();
    return Promise.all(todo.map(function (y) {
      return HY.loadDetail(STORE.code, y).catch(function () {});
    }));
  }

  /* ---------- 渲染：某一天的完整脚本（今天 / 详情共用） ---------- */
  function scriptHTML(s, opts) {
    var full = HY.detail(s.id) || s;
    var shots = full.shots || [];
    var tags = (full.hashtags || []).filter(function (t) { return t !== full.tag; });
    var dd = HY.parseYmd(s.date);
    var head =
      '<div class="dh">' +
        '<div class="d">' + esc(HY.md(s.date)) + ' 周' + WD[dd.getDay()] +
          (s.date === TODAY ? ' · 今天' : '') + '</div>' +
        '<h1>' + esc(titleOf(s)) + '</h1>' +
        '<div class="meta">' + esc(full.format || '') + '<i>·</i>' +
          esc(full.duration || '') + '<i>·</i>' + shots.length + ' 幕</div>' +
        // 每一条都得标明这是参考，不是必须照着念的稿子（2026-09-21 用户要求）。
        // 放在标题正下方，店员看第一眼就知道分寸。
        '<div class="ref">参考脚本 · 用自己的话说就行</div>' +
      '</div>';
    // 这块原来放「开头 3 秒」，但那句就是第 1 幕的台词，同一句念两遍。
    // 2026-09-21 用户圈出来：「改成整个视频想表达的意思」。
    // gist 是新字段（见 content_lib 的 SAY.gist）；老数据没有就退回 hook，页面不会空。
    // 悬挂的「」去掉了 —— 那是"要念的话"的标记，这句是落点不是台词。
    var gist = full.gist || (full.hook ? String(full.hook).replace(/^「/, '') : '');
    var quote = gist ?
      '<div class="quote"><div class="h">这条想说什么</div>' +
        '<div class="body nomark"><p>' + esc(gist) + '</p></div></div>' : '';
    var list = shots.map(function (sh, i) {
      var last = i === shots.length - 1;
      return '<div class="shot' + (last ? ' end' : '') + '">' +
        '<div class="no"><b>' + (last ? '尾' : ('0' + (i + 1)).slice(-2)) + '</b>' +
          '<span>' + esc(sh.sec != null ? sh.sec + 's' : '') + '</span></div>' +
        '<div><span class="lab">画面</span><div class="sc">' + esc(sh.scene || '') + '</div>' +
          (sh.line ? '<span class="lab say">台词</span>' +
                     '<div class="ln">' + esc(sh.line) + '</div>' : '') +
        '</div></div>';
    }).join('');
    return (opts && opts.back ? '<div class="back" data-back="1">‹ 返回</div>' : '') +
      head + quote +
      '<div class="blk"><div class="h">分镜</div>' +
        // 人手写死成「两个店员」是错的：梅林店只有一个人，分镜明明已经按单人生成了，
        // 这行字还在说要两个人（2026-09-21 用户截图指出）。改成读门店自己的 staff。
        '<div class="sub">' + shots.length + ' 幕 · 一部手机 · ' + CREW + '</div>' + list + '</div>' +
      (tags.length ?
        '<div class="blk" style="border-top:.5px solid var(--line)"><div class="h">话题标签</div>' +

          '<div class="hash">' + tags.map(function (t) {
            return '<span>' + esc(t) + '</span>';
          }).join('') + '</div></div>' : '') +
      '<div class="acts">' +
        '<button class="main" data-copy="all" data-id="' + esc(s.id) + '">复制整条脚本</button>' +
        '<button class="sub2" data-copy="tags" data-id="' + esc(s.id) + '">只复制标签</button>' +
      '</div>';
  }

  /* ---------- 列表 ---------- */
  var RANGES = {
    week:   function () { var m = mondayOf(TODAY); return { t: '本周', from: m, to: shift(m, 6) }; },
    next:   function () { var m = shift(mondayOf(TODAY), 7); return { t: '下周', from: m, to: shift(m, 6) }; },
    month:  function () { var y = ymOf(TODAY); return { t: '本月', from: y + '-01', to: y + '-31' }; },
    nextmo: function () { var y = addMonth(ymOf(TODAY), 1); return { t: '下月', from: y + '-01', to: y + '-31' }; }
  };
  var curRange = 'week';

  function inRange(s, r) { return s.date >= r.from && s.date <= r.to; }

  function paintList() {
    var r = RANGES[curRange]();
    var rows = Object.keys(MINE).map(function (k) { return MINE[k]; })
      .filter(function (s) { return inRange(s, r); })
      .sort(function (a, b) { return a.date < b.date ? -1 : 1; });

    var yms = {}; rows.forEach(function (s) { yms[ymOf(s.date)] = 1; });
    needMonths(Object.keys(yms)).then(function () {
      $('#rangeTitle').textContent = r.t + ' ' +
        HY.md(rows.length ? rows[0].date : r.from) + '–' +
        HY.md(rows.length ? rows[rows.length - 1].date : r.to);
      $('#rangeCnt').textContent = rows.length + ' 条';

      var c = { done: 0, late: 0, todo: 0, now: 0 };
      rows.forEach(function (s) { var l = label(s); if (c[l.c] != null) c[l.c]++; });
      var sum = HASVIDEO
        // 第三个值 = 给哪个数上色：1=品牌粉（要处理的），2=墨绿（已完成的）
        ? [['已发布', c.done, 2], ['逾期', c.late, 1], ['今天', c.now, 0]]
        : [['已到期', c.late, 1], ['待拍', c.todo, 0], ['今天', c.now, 0]];
      $('.sum').innerHTML = sum.map(function (x) {
        return '<div><div class="v' + (x[2] === 1 ? ' p' : x[2] === 2 ? ' g' : '') + '">' + x[1] + '</div>' +
               '<div class="l">' + x[0] + '</div></div>';
      }).join('');

      $('#list').innerHTML = rows.map(function (s) {
        var l = label(s), dd = HY.parseYmd(s.date);
        return '<div class="row ' + l.c + '" data-id="' + esc(s.id) + '">' +
          '<div class="dt"><b>' + dd.getDate() + '</b><span>' + WD[dd.getDay()] + '</span></div>' +
          '<div class="mid"><div class="t">' + esc(titleOf(s)) + '</div>' +
            '<div class="s' + (l.c === 'late' ? ' late' : '') + '">' + l.t + '</div></div>' +
          '<div class="go">›</div></div>';
      }).join('') || '<div class="none" style="padding:26px 0;color:var(--dim)">这段时间还没有脚本</div>';
    });
  }

  /* ---------- 日历 ---------- */
  var calYm;
  function paintCal() {
    needMonths([calYm]).then(function () {
      var y = +calYm.slice(0, 4), m = +calYm.slice(5, 7);
      $('#calMo').innerHTML = m + ' 月<small>' + y + '</small>';
      var first = new Date(y, m - 1, 1), days = new Date(y, m, 0).getDate();
      var lead = (first.getDay() + 6) % 7;            // 周一开头
      var g = '';
      for (var i = 0; i < lead; i++) g += '<div class="day out"><b></b><i></i></div>';
      for (var dnum = 1; dnum <= days; dnum++) {
        var ds = calYm + '-' + ('0' + dnum).slice(-2);
        var s = MINE[ds], cls = 'day';
        if (s) { var l = label(s); cls += ' ' + l.c; }
        else cls += ' out';
        g += '<div class="' + cls + '"' + (s ? ' data-id="' + esc(s.id) + '"' : '') +
             '><b>' + dnum + '</b><i></i></div>';
      }
      var tail = (lead + days) % 7;
      if (tail) for (var j = 0; j < 7 - tail; j++) g += '<div class="day out"><b></b><i></i></div>';
      $('#calGrid').innerHTML = g;
    });
  }

  /* ---------- 复制 ---------- */
  function tagsOf(sid) {
    var f = HY.detail(sid) || {};
    return (f.hashtags || []).filter(function (t) { return t !== f.tag; }).join(' ');
  }
  function scriptText(sid) {
    var f = HY.detail(sid); if (!f) return '';
    var L = [f.title || (f.topic + '｜' + f.format),
             '（参考脚本，用自己的话说就行）', '',
             '这条想说什么：' + (f.gist || f.hook || ''), ''];
    (f.shots || []).forEach(function (sh, i) {
      L.push((i + 1) + '. 【' + (sh.sec != null ? sh.sec + 's' : '') + '】画面：' + (sh.scene || ''));
      if (sh.line) L.push('   台词：' + sh.line);
    });
    var t = tagsOf(sid); if (t) { L.push(''); L.push(t); }
    return L.join('\n');
  }
  /* file:// 和非 https 下 navigator.clipboard 会被禁 —— 必须留 execCommand 这条退路 */
  function copyText(t) {
    if (!t) { toast('这条还没有内容'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('已复制'); }, fb);
    } else fb();
    function fb() {
      var ta = document.createElement('textarea');
      ta.value = t; ta.style.cssText = 'position:fixed;left:-9999px';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); toast('已复制'); }
      catch (e) { toast('复制失败，长按选中'); }
      document.body.removeChild(ta);
    }
  }
  var toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast';
      document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(function () { toastEl.classList.remove('on'); }, 1400);
  }

  /* ---------- 视图切换 ---------- */
  var VIEWS = {};
  function show(k) {
    Object.keys(VIEWS).forEach(function (n) { VIEWS[n].classList.toggle('hide', n !== k); });
    $('#viewB').classList.add('hide');
    $('#viewPick').classList.add('hide');
    $$('#tabbar a').forEach(function (a) { a.classList.toggle('on', a.dataset.v === k); });
    scrollTo(0, 0);
  }
  /* 从哪一屏点进详情，返回就回哪一屏（从日历点进去再返回，别把人甩回本周） */
  var backTo = 'week';
  function openDay(sid) {
    Object.keys(VIEWS).forEach(function (n) {
      if (!VIEWS[n].classList.contains('hide')) backTo = n;
    });
    var idx = null;
    Object.keys(MINE).forEach(function (k) { if (MINE[k].id === sid) idx = MINE[k]; });
    if (!idx) return;
    needMonths([ymOf(idx.date)]).then(function () {
      $('#viewB').innerHTML = scriptHTML(idx, { back: true });
      Object.keys(VIEWS).forEach(function (n) { VIEWS[n].classList.add('hide'); });
      $('#viewPick').classList.add('hide');
      $('#viewB').classList.remove('hide');
      scrollTo(0, 0);
    });
  }

  /* ---------- 切换门店 ---------- */
  function paintStores(kw) {
    var q = (kw || '').trim();
    var rows = q ? D.stores.filter(function (s) {
      return (s.storeName + (s.brandLine || '') + s.douyinId).indexOf(q) >= 0; }) : D.stores;
    $('#pickCnt').textContent = rows.length + ' / ' + D.stores.length + ' 家';
    if (!rows.length) { $('#pickList').innerHTML = '<div class="none">没有叫「' + esc(q) + '」的门店</div>'; return; }
    $('#pickList').innerHTML = rows.map(function (s) {
      var cur = s.douyinId === id;
      return '<div class="st' + (cur ? ' cur' : '') + '" data-sid="' + esc(s.douyinId) + '">' +
        '<div class="ini">' + esc(s.storeName.charAt(0)) + '</div>' +
        '<div class="nm"><b>' + esc(s.storeName) +
          (s.brandLine ? ' <span style="display:inline;font-family:inherit;font-size:11px;' +
            'color:var(--dim);letter-spacing:.06em">' + esc(s.brandLine) + '</span>' : '') + '</b>' +
          '<span>' + esc(s.douyinId) + '</span></div>' +
        (cur ? '<span class="on">当前</span>' : '<span class="go">›</span>') + '</div>';
    }).join('');
  }

  /* ---------- 启动 ---------- */
  HY.loadData().then(function (d) {
    D = d;
    STORE = d.storeById[id];
    // stores.json 的 staff == '1' 表示店里只有一个人（见 tools/content_lib.py 的 solo）
    CREW = String(STORE.staff || '') === '1' ? '一个人' : '两个店员';
    if (!STORE) {
      HY.MyStore.clear();
      $('#storeLine').innerHTML = '没找到这家门店　<a href="' + LOGIN + '">重新选择 →</a>';
      HY.bootDone();
      return Promise.reject(new Error('门店不存在'));
    }
    d.scripts.forEach(function (s) { if (s.store === id) MINE[s.date] = s; });
    var videos = HY.Videos.list().filter(function (v) { return v.store === id; });
    HASVIDEO = videos.length > 0;
    MATCH = HY.match(Object.keys(MINE).map(function (k) { return MINE[k]; }), videos);

    /* 头部 */
    var nm = STORE.storeName + (STORE.brandLine ? ' · ' + STORE.brandLine : '');
    $('#storeLine').textContent = nm;
    $('#avIni').textContent = STORE.storeName.charAt(0);
    $('#meIni').textContent = STORE.storeName.charAt(0);
    $('#meName').textContent = STORE.storeName;
    // 光一串数字没人看得懂（2026-09-21 用户问「下面那串数字什么意思」），
    // 前面加两个字说清楚它是什么。
    $('#meId').innerHTML = '<span>抖音号</span>' + esc(STORE.douyinId);
    $('#meStoreName').textContent = STORE.storeName;

    var all = Object.keys(MINE);
    var thisMo = all.filter(function (k) { return ymOf(k) === ymOf(TODAY); });
    var past = all.filter(function (k) { return k < TODAY; });
    $('#stAll').textContent = all.length;
    $('#stRate').textContent = thisMo.length;
    $('#stPast').textContent = past.length;

    VIEWS = { week: $('#viewA'), today: $('#viewToday'), cal: $('#viewCal'), me: $('#viewMe') };
    calYm = ymOf(TODAY);

    /* 今天 */
    return needMonths([ymOf(TODAY)]).then(function () {
      var s = MINE[TODAY];
      $('#viewToday').innerHTML = s ? scriptHTML(s, {}) :
        '<div class="dh"><div class="d">' + TODAY + '</div><h1>今天没有排脚本</h1></div>';
      paintList();
      HY.bootDone();
    });
  }).catch(function () { HY.bootDone(); });

  /* ---------- 事件 ---------- */
  document.addEventListener('click', function (e) {
    var t;
    if ((t = e.target.closest('[data-copy]'))) {
      copyText(t.dataset.copy === 'tags' ? tagsOf(t.dataset.id) : scriptText(t.dataset.id)); return; }
    if ((t = e.target.closest('[data-back]'))) { $('#viewB').classList.add('hide'); show(backTo); return; }
    if ((t = e.target.closest('.row[data-id], .day[data-id]'))) { openDay(t.dataset.id); return; }
    if ((t = e.target.closest('#tabbar a[data-v]'))) { show(t.dataset.v); return; }
    if ((t = e.target.closest('.chips a'))) {
      var keys = ['week', 'next', 'month', 'nextmo'];
      $$('.chips a').forEach(function (x, i) { x.classList.toggle('on', x === t); if (x === t) curRange = keys[i]; });
      paintList(); scrollTo(0, 0); return;
    }
    if (e.target.closest('#calPrev')) { calYm = addMonth(calYm, -1); paintCal(); return; }
    if (e.target.closest('#calNext')) { calYm = addMonth(calYm, 1); paintCal(); return; }
    if (e.target.closest('#goPick')) {
      paintStores($('#q').value);
      Object.keys(VIEWS).forEach(function (n) { VIEWS[n].classList.add('hide'); });
      $('#viewPick').classList.remove('hide'); scrollTo(0, 0); return;
    }
    if (e.target.closest('#pickBack')) { $('#viewPick').classList.add('hide'); show('me'); return; }
    if ((t = e.target.closest('.st[data-sid]'))) {
      HY.MyStore.set(t.dataset.sid);
      location.href = 'store.html?store=' + encodeURIComponent(t.dataset.sid); return;
    }
    if (e.target.closest('#goOut')) { location.href = LOGIN + '?switch=1'; return; }
  });

  /* 日历第一次进才画，省一次分片加载 */
  var calPainted = false;
  document.addEventListener('click', function (e) {
    if (e.target.closest('#tabbar a[data-v="cal"]') && !calPainted) { calPainted = true; paintCal(); }
  });

  /* 搜索：中文输入法打一半不筛（踩过的坑） */
  (function () {
    var q = $('#q'), composing = false, tm = null;
    if (!q) return;
    function go() { if (composing) return; clearTimeout(tm); tm = setTimeout(function () { paintStores(q.value); }, 150); }
    q.addEventListener('compositionstart', function () { composing = true; });
    q.addEventListener('compositionend', function () { composing = false; go(); });
    q.addEventListener('input', go);
  })();
})();
