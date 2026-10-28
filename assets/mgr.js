/* 区域经理页（手机，只读）—— mgr.html[?m=经理名]
   2026-10-28 加。经理在手机上看自己名下门店：本月发布完成率、逾期、每天的格子，以及接下来 7 天定时排了几家。

   口径跟总部看板一致（board.js topStats / statusOfScript），别各算各的：
   - 状态 = HY.statusOf(脚本, 匹配到的视频, judge)，judge = 视频数据截止日的后一天（HY.judgeDay）；
   - 完成率 = 已发布 ÷ (已发布 + 逾期)；含定时完成率 = (已发布 + 标了定时的待拍) ÷ (已到期 + 标了定时的待拍)；
   - 过了今天但视频数据还没到的日子算「数据还没更新」，不算逾期。
   门店归属读 stores[].manager（data/stores.js，跟看板「分配门店」是同一个字段）。
   定时标记读云端（HY.Marks.pull），每 2 分钟和切回页面时再拉一次。本页不写任何数据。 */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var LS_ME = 'hymn_my_mgr';
  var WD = ['日', '一', '二', '三', '四', '五', '六'];
  var S = { mgr: '', ym: '', sort: 'rate', day: '', open: {} };
  var D;                                     // { stores, storeById, scripts }

  function shift(d, n) { return HY.ymd(HY.addDays(HY.parseYmd(d), n)); }
  function wd(d) { return WD[HY.parseYmd(d).getDay()]; }
  function addMonth(ym, n) {
    var t = new Date(+ym.slice(0, 4), +ym.slice(5, 7) - 1 + n, 1);
    return t.getFullYear() + '-' + ('0' + (t.getMonth() + 1)).slice(-2);
  }

  /* ---------- 算 ---------- */
  function recompute() {
    S.today = HY.ymd(new Date());
    S.videos = HY.Videos.list();
    S.m = HY.match(D.scripts, S.videos);
    S.judge = HY.judgeDay(S.videos, S.today);
    S.end = HY.dataEnd(S.videos, S.today);
    S.byKey = {};
    D.scripts.forEach(function (s) { S.byKey[s.store + '|' + s.date] = s; });
  }
  function mgrList() {
    var c = {};
    D.stores.forEach(function (st) { if (st.manager) c[st.manager] = (c[st.manager] || 0) + 1; });
    return Object.keys(c).sort(function (a, b) { return c[b] - c[a]; }).map(function (k) { return { name: k, n: c[k] }; });
  }
  function myStores() {
    return D.stores.filter(function (st) { return st.manager === S.mgr; });
  }
  /** 一天一格的状态：done / late / sched / unk（日子过了、数据没到）/ todo / none（那天没排脚本） */
  function cellOf(store, date, mk) {
    var s = S.byKey[store + '|' + date];
    if (!s) return 'none';
    var t = HY.statusOf(s, S.m.byScript[s.id], S.judge);
    if (t !== 'todo') return t;
    if (mk[store + '|' + date]) return 'sched';
    return date < S.today ? 'unk' : 'todo';
  }
  function storeStat(st, days, mk) {
    var c = { done: 0, late: 0, sched: 0, cells: [], lateDays: [], schedDays: [] };
    days.forEach(function (d) {
      var t = cellOf(st.douyinId, d, mk);
      c.cells.push(t);
      if (t === 'done') c.done++;
      else if (t === 'late') { c.late++; c.lateDays.push(d); }
      else if (t === 'sched') c.sched++;
    });
    c.due = c.done + c.late;
    c.rate = c.due ? Math.round(c.done / c.due * 100) : null;
    var d2 = c.due + c.sched;
    c.rate2 = d2 ? Math.round((c.done + c.sched) / d2 * 100) : null;
    // 接下来 7 天（含今天）排了几天定时：不跟月份走
    c.next = 0;
    for (var i = 0; i < 7; i++) {
      var dd = shift(S.today, i), t2 = cellOf(st.douyinId, dd, mk);
      if (t2 === 'sched' || t2 === 'done') c.next++;
      if (t2 === 'sched') c.schedDays.push(dd);
    }
    return c;
  }

  /* ---------- 画 ---------- */
  function render() {
    if (!S.mgr) return renderPick();
    $('#viewPick').classList.add('hide');
    $('#viewMain').classList.remove('hide');
    var rows = myStores(), mk = HY.Marks.read();
    $('#mgrName').innerHTML = esc(S.mgr) + '<small>' + rows.length + ' 家店</small>';
    $('#upto').textContent = (S.end ? '视频数据截至 ' + HY.md(S.end) : '还没有视频数据') + ' · 定时标记是实时的';

    // 月份：本月往前两个月
    var cur = HY.ymOf(S.today);
    if (!S.ym) S.ym = cur;
    $('#moChips').innerHTML = [0, -1, -2].map(function (n) {
      var ym = addMonth(cur, n);
      return '<a data-ym="' + ym + '"' + (ym === S.ym ? ' class="on"' : '') + '>' +
        (n === 0 ? '本月' : (+ym.slice(5)) + ' 月') + '</a>';
    }).join('');

    var days = HY.buildMonthGrid(S.ym).days.map(function (d) { return d.date; });
    var stats = rows.map(function (st) { return { st: st, c: storeStat(st, days, mk) }; });

    // 汇总
    var t = { done: 0, late: 0, sched: 0 };
    stats.forEach(function (x) { t.done += x.c.done; t.late += x.c.late; t.sched += x.c.sched; });
    var due = t.done + t.late, rate = due ? Math.round(t.done / due * 100) : null;
    var d2 = due + t.sched, rate2 = d2 ? Math.round((t.done + t.sched) / d2 * 100) : null;
    $('#sum').innerHTML =
      '<div><div class="v p">' + (rate == null ? '–' : rate + '<small>%</small>') + '</div><div class="l">完成率</div></div>' +
      '<div><div class="v">' + (rate2 == null ? '–' : rate2 + '<small>%</small>') + '</div><div class="l">含定时</div></div>' +
      '<div><div class="v p">' + t.late + '</div><div class="l">逾期未发</div></div>';

    renderWeek(rows, mk);

    // 门店排序
    var key = {
      rate: function (x) { return x.c.rate == null ? 999 : x.c.rate; },
      late: function (x) { return -x.c.late; },
      sched: function (x) { return x.c.next; }
    }[S.sort];
    stats.sort(function (a, b) { return key(a) - key(b) || (a.st.code < b.st.code ? -1 : 1); });
    var cols = 'grid-template-columns:repeat(' + days.length + ',1fr)';
    $('#stores').innerHTML = stats.map(function (x) {
      var st = x.st, c = x.c, id = st.douyinId;
      var strip = c.cells.map(function (k, i) {
        return '<i class="' + (k === 'none' ? '' : k) + (days[i] === S.today ? ' now' : '') + '"></i>';
      }).join('');
      var vids = S.videos.filter(function (v) { return v.store === id && HY.ymOf(v.pubDate) === S.ym; })
        .sort(function (a, b) { return b.pubTs - a.pubTs; });
      var more =
        '<div><span class="k">逾期</span>' + (c.lateDays.length ? c.lateDays.map(HY.md).join('、') : '没有') + '</div>' +
        '<div><span class="k">接下来已排定时</span>' + (c.schedDays.length ? c.schedDays.map(function (d) { return HY.md(d) + ' 周' + wd(d); }).join('、') : '还没排') + '</div>' +
        '<div><span class="k">本月发了</span>' + vids.length + ' 条' +
          (vids[0] ? '，最近一条 ' + HY.md(vids[0].pubDate) + (vids[0].url ? ' <a href="' + esc(vids[0].url) + '" target="_blank" rel="noopener">看视频</a>' : '') : '') + '</div>';
      return '<div class="st' + (S.open[id] ? ' open' : '') + '" data-id="' + esc(id) + '">' +
        '<div class="h"><span class="nm">' + esc(st.storeName) + '<small>' + esc(st.code || '') + '</small></span>' +
          '<span class="r' + (c.rate != null && c.rate < 80 ? ' lo' : '') + '">' + (c.rate == null ? '–' : c.rate + '<small>%</small>') + '</span></div>' +
        '<div class="sub">已发 <b>' + c.done + '</b> / ' + c.due + (c.late ? ' · 逾期 <b class="p">' + c.late + '</b>' : '') +
          ' · 接下来 7 天已排 <b>' + c.next + '</b> / 7</div>' +
        '<div class="strip" style="' + cols + '">' + strip + '</div>' +
        '<div class="more2">' + more + '</div>' +
      '</div>';
    }).join('') || '<div class="wkmiss">名下还没有分配门店。</div>';
  }

  function renderWeek(rows, mk) {
    var n = rows.length, html = '';
    if (!S.day || S.day < S.today) S.day = '';
    for (var i = 0; i < 7; i++) {
      var d = shift(S.today, i), k = 0;
      rows.forEach(function (st) {
        var t = cellOf(st.douyinId, d, mk);
        if (t === 'sched' || t === 'done') k++;
      });
      html += '<a data-d="' + d + '"' + (S.day === d ? ' class="on"' : '') + '>' +
        '<div class="d">' + (i === 0 ? '今天' : '周' + wd(d)) + '</div>' +
        '<div class="n">' + k + '<small>/' + n + '</small></div>' +
        '<div class="b"><i style="width:' + (n ? Math.round(k / n * 100) : 0) + '%"></i></div></a>';
    }
    $('#wk').innerHTML = html;
    if (!S.day) { $('#wkMiss').innerHTML = ''; return; }
    var miss = rows.filter(function (st) {
      var t = cellOf(st.douyinId, S.day, mk);
      return t !== 'sched' && t !== 'done' && t !== 'none';
    });
    $('#wkMiss').innerHTML = HY.md(S.day) + ' 周' + wd(S.day) + (miss.length
      ? ' 还没排定时（' + miss.length + ' 家）：<b>' + miss.map(function (st) { return esc(st.storeName); }).join('、') + '</b>'
      : ' 全部排好了');
  }

  function renderPick() {
    $('#viewMain').classList.add('hide');
    $('#viewPick').classList.remove('hide');
    $('#pickList').innerHTML = mgrList().map(function (m) {
      return '<a data-m="' + esc(m.name) + '">' + esc(m.name) + '<small>' + m.n + ' 家店 ›</small></a>';
    }).join('');
  }

  /* ---------- 交互 ---------- */
  function setMgr(name) {
    S.mgr = name; S.day = ''; S.open = {};
    try { name ? localStorage.setItem(LS_ME, name) : localStorage.removeItem(LS_ME); } catch (e) {}
    var u = new URL(location.href);
    name ? u.searchParams.set('m', name) : u.searchParams.delete('m');
    history.replaceState(null, '', u);
    render();
    window.scrollTo(0, 0);
  }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('[data-m]');
    if (a) return setMgr(a.dataset.m);
    if (e.target.closest('#goPick')) return setMgr('');
    if ((a = e.target.closest('#moChips [data-ym]'))) { S.ym = a.dataset.ym; return render(); }
    if ((a = e.target.closest('#sortChips [data-s]'))) {
      S.sort = a.dataset.s;
      Array.prototype.forEach.call(document.querySelectorAll('#sortChips a'), function (x) { x.classList.toggle('on', x === a); });
      return render();
    }
    if ((a = e.target.closest('#wk [data-d]'))) { S.day = S.day === a.dataset.d ? '' : a.dataset.d; return render(); }
    if (e.target.closest('.st a')) return;           // 「看视频」链接照常跳
    if ((a = e.target.closest('.st'))) {
      S.open[a.dataset.id] = !S.open[a.dataset.id];
      a.classList.toggle('open');
    }
  });

  function pull() {
    return HY.Marks.pull().then(function () { recompute(); render(); }, function () {});
  }

  HY.loadData().then(function (d) {
    D = d;
    var q = new URLSearchParams(location.search).get('m');
    var saved = '';
    try { saved = localStorage.getItem(LS_ME) || ''; } catch (e) {}
    var names = mgrList().map(function (m) { return m.name; });
    S.mgr = names.indexOf(q) >= 0 ? q : (names.indexOf(saved) >= 0 ? saved : '');
    if (S.mgr) try { localStorage.setItem(LS_ME, S.mgr); } catch (e) {}
    recompute();
    render();
    HY.bootDone();
    pull();
    setInterval(pull, 120000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) pull(); });
  }).catch(function (err) {
    HY.bootDone();
    document.querySelector('.ph').insertAdjacentHTML('beforeend', '<div class="wkmiss">加载失败：' + esc(err && err.message) + '</div>');
  });
})();
