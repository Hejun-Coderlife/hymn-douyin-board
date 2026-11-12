/* 抖音视频发布战报：选时间（日 / 周 / 月 / 自选）算各门店完成率，画成 PNG。
   2026-11-06 从 board.js 的「生成战报图」拆出来，总部看板和 report.html（门店赫眉助手里点「抖音战报」打开的）共用，
   两边口径、样子完全一样，改这里两边一起变。
   口径：
     - 应发 = 范围内计划日期 <= 数据截至日 的脚本（抖音导出只到前一天，截至日之后的还没法判断，不算逾期）
     - 完成率 = 当天发了的 ÷ 应发，跟看板一致
     - 范围内一条脚本都没到期（比如脚本开排之前的日子）→ 改算「发布率」= 有发视频的天数 ÷ 天数 */
(function () {
  'use strict';
  var HY = window.HY;

  function range(P) {
    var d = HY.parseYmd(P.date), from, to, title;
    if (P.mode === 'range') {
      from = P.from; to = P.to;
      var f0 = HY.parseYmd(from), t0 = HY.parseYmd(to);
      title = from === to ? (f0.getMonth() + 1) + ' 月 ' + f0.getDate() + ' 日'
        : (f0.getMonth() + 1) + '/' + f0.getDate() + ' – ' + (t0.getMonth() + 1) + '/' + t0.getDate();
    } else if (P.mode === 'day') {
      from = to = P.date;
      title = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    } else if (P.mode === 'week') {
      from = HY.ymd(HY.monday(d)); to = HY.ymd(HY.addDays(HY.parseYmd(from), 6));
      var f = HY.parseYmd(from), t = HY.parseYmd(to);
      title = (f.getMonth() + 1) + '/' + f.getDate() + ' – ' + (t.getMonth() + 1) + '/' + t.getDate() + ' 这一周';
    } else {
      var g = HY.buildMonthGrid(HY.ymOf(P.date));
      from = g.from; to = g.to;
      title = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月';
    }
    return { from: from, to: to, title: title };
  }

  function compute(opt) {
    var rows = opt.stores, r = opt.r, cut = opt.cut;
    var ids = {}; rows.forEach(function (st) { ids[st.douyinId] = 1; });
    var per = {};
    rows.forEach(function (st) { per[st.douyinId] = { st: st, due: 0, done: 0, vids: 0, days: {} }; });
    opt.scripts.forEach(function (s) {
      if (!ids[s.store] || s.date < r.from || s.date > r.to || s.date > cut) return;
      var o = per[s.store]; o.due++;
      if (opt.byScript[s.id]) o.done++;
    });
    opt.videos.forEach(function (v) {
      if (!ids[v.store] || !v.pubDate || v.pubDate < r.from || v.pubDate > r.to) return;
      per[v.store].vids++; per[v.store].days[v.pubDate] = 1;
    });
    var end = r.to < cut ? r.to : cut, nDays = 0;
    for (var d = r.from; d <= end; d = HY.ymd(HY.addDays(HY.parseYmd(d), 1))) nDays++;
    var list = Object.keys(per).map(function (k) { return per[k]; });
    var due = 0, done = 0, vids = 0;
    list.forEach(function (o) { due += o.due; done += o.done; vids += o.vids; });
    var mode = due ? 'rate' : 'pub';
    list.forEach(function (o) {
      var n = Object.keys(o.days).length;
      o.p = mode === 'rate' ? (o.due ? o.done / o.due : null) : (nDays ? n / nDays : null);
      o.nDays = n;
    });
    list.sort(function (a, b) {
      if (a.p == null || b.p == null) return a.p == null ? (b.p == null ? 0 : 1) : -1;
      return b.p - a.p || b.vids - a.vids;
    });
    var dayHits = 0;
    list.forEach(function (o) { dayHits += o.nDays; });
    var total = mode === 'rate' ? (due ? done / due : 0) : (nDays && list.length ? dayHits / (nDays * list.length) : 0);
    return { r: r, cut: cut, list: list, due: due, done: done, vids: vids, mode: mode, total: total,
             nDays: nDays, scope: opt.scope, future: r.from > cut };
  }

  function draw(D, logo, colors) {
    var W = 540, PAD = 36, ROW = 38, S2 = 2;
    var C = { ink: '#16140F', t2: '#4A453C', t3: '#9C958A', line: '#E3DFD6', done: colors.done,
              late: colors.late, track: '#EFEBE3', paper: '#FAF7F2', pink: '#D9A6AE' };
    var NUM = 'Didot, "Bodoni 72", Georgia, serif';
    var SANS = '"PingFang SC", "Helvetica Neue", sans-serif';   // 别写 -apple-system：canvas 的 font 串解析不了会整条作废
    var SONG = '"Songti SC", "STSong", serif';
    var listH = D.list.length * ROW;
    var H = 250 + 44 + listH + 70;
    var cv = document.createElement('canvas');
    cv.width = W * S2; cv.height = H * S2;
    var g = cv.getContext('2d');
    g.scale(S2, S2);
    g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
    // 顶上一条品牌粉细带
    g.fillStyle = C.pink; g.fillRect(0, 0, W, 4);
    // 背景水印「抖」（2026-11-12 用户，跟会员战报的「VIP」水印同一做法）：右上角宋体大字，淡粉，压在内容下面
    g.save(); g.globalAlpha = 0.12; g.fillStyle = C.pink; g.font = '170px ' + SONG; g.textAlign = 'right'; g.textBaseline = 'alphabetic';
    g.fillText('抖', W - PAD + 4, 215); g.restore();

    // 头部：logo + STUDIO / 右边小字标签
    var y = 44;
    if (logo) g.drawImage(logo, PAD, y - 16, 84, 84 * logo.height / logo.width);
    else { g.fillStyle = C.ink; g.font = '600 18px ' + SANS; g.fillText('赫眉 HYMN', PAD, y); }
    g.font = '10px ' + SANS; g.fillStyle = C.t3; g.textAlign = 'right';
    spaced(g, '抖音视频发布战报', W - PAD, y, 2.5, 'right');
    g.textAlign = 'left';

    // 标题：时间范围（宋体大字）+ 门店范围
    y = 104;
    g.fillStyle = C.ink; g.font = '26px ' + SONG;
    g.fillText(D.r.title, PAD, y);
    g.font = '12px ' + SANS; g.fillStyle = C.t3;
    g.fillText(D.scope + (D.r.to > D.cut && !D.future ? ' · 统计到 ' + HY.md(D.cut) : '') +
      (D.mode === 'pub' ? ' · 这段时间还没排脚本，按发布天数算' : ''), PAD, y + 24);

    // 大数字
    y = 196;
    var pct = Math.round(D.total * 100);
    g.fillStyle = D.mode === 'rate' ? C.done : C.ink;
    g.font = '64px ' + NUM;
    g.fillText(D.future ? '—' : String(pct), PAD - 2, y);
    var pw = g.measureText(D.future ? '—' : String(pct)).width;
    g.font = '22px ' + NUM; g.fillText(D.future ? '' : '%', PAD + pw + 2, y);
    g.font = '11px ' + SANS; g.fillStyle = C.t3;
    g.fillText(D.mode === 'rate' ? '完成率' : '发布率', PAD, y + 22);
    // 右边两个小数：跟大数字三等分排，各占一栏，不会挤在一起
    var colW = (W - PAD * 2) / 3;
    var stats = D.mode === 'rate'
      ? [[D.done + '/' + D.due, '已发布 / 应发'], [String(D.vids), '视频总数（条）']]
      : [[String(D.vids), '视频总数（条）'], [String(D.nDays), '统计天数']];
    stats.forEach(function (s, i) {
      var x = PAD + colW * (i + 1) + 10;
      g.fillStyle = C.line; g.fillRect(x - 12, y - 44, 1, 70);
      g.fillStyle = C.ink; g.font = '30px ' + NUM; g.fillText(s[0], x, y);
      g.fillStyle = C.t3; g.font = '11px ' + SANS; g.fillText(s[1], x, y + 22);
    });

    // 分隔 + 小标题
    y = 250;
    g.fillStyle = C.ink; g.fillRect(PAD, y, W - PAD * 2, 1);
    g.font = '11px ' + SANS; g.fillStyle = C.t3;
    spaced(g, '门店排名', PAD, y + 26, 2);
    g.textAlign = 'right';
    g.fillText(D.mode === 'rate' ? '完成率 · 已发/应发 · 视频' : '发布率 · 发布天数 · 视频', W - PAD, y + 26);
    g.textAlign = 'left';

    // 门店行
    y += 44;
    var nameW = 150, barX = PAD + 28 + nameW, barW = 150;
    // 店名后面跟区域经理（2026-10-08 用户要）；全是同一个经理（按经理筛过）就不重复写
    var mgrs = {}; D.list.forEach(function (o) { mgrs[o.st.manager || ''] = 1; });
    var showMgr = Object.keys(mgrs).length > 1;
    D.list.forEach(function (o, i) {
      var cy = y + i * ROW;
      if (i % 2 === 1) { g.fillStyle = C.paper; g.fillRect(PAD - 8, cy, W - PAD * 2 + 16, ROW); }
      var mid = cy + ROW / 2 + 4;
      var rank = i + 1;
      g.fillStyle = rank <= 3 && o.p ? C.done : C.t3; g.font = '15px ' + NUM; g.textAlign = 'right';
      g.fillText(String(rank), PAD + 18, mid);
      g.textAlign = 'left'; g.fillStyle = C.ink; g.font = '13px ' + SANS;
      var mg = showMgr ? (o.st.manager || '') : '';
      var nm = fit(g, o.st.storeName, nameW - 8 - (mg ? 34 : 0));
      g.fillText(nm, PAD + 28, mid);
      if (mg) {
        var nx = PAD + 28 + g.measureText(nm).width + 6;
        g.font = '11px ' + SANS; g.fillStyle = C.t3;
        g.fillText(mg, nx, mid);
      }
      // 进度条
      g.fillStyle = C.track; g.fillRect(barX, mid - 7, barW, 6);
      if (o.p) { g.fillStyle = o.p < 0.5 ? C.late : C.done; g.fillRect(barX, mid - 7, Math.max(2, barW * o.p), 6); }
      // 百分比
      g.textAlign = 'right'; g.font = '17px ' + NUM;
      g.fillStyle = o.p == null ? C.t3 : (o.p < 0.5 ? C.late : C.ink);
      g.fillText(o.p == null ? '—' : Math.round(o.p * 100) + '%', barX + barW + 58, mid);
      g.font = '11px ' + SANS; g.fillStyle = C.t3;
      g.fillText((D.mode === 'rate' ? o.done + '/' + o.due : o.nDays + ' 天') + ' · ' + o.vids + ' 条', W - PAD, mid);
      g.textAlign = 'left';
    });

    // 页脚
    y += listH + 30;
    g.fillStyle = C.line; g.fillRect(PAD, y - 14, W - PAD * 2, 1);
    g.font = '10.5px ' + SANS; g.fillStyle = C.t3;
    var now = new Date();
    g.fillText('抖音数据截至 ' + HY.md(D.cut) + ' · 生成于 ' + (now.getMonth() + 1) + '/' + now.getDate() + ' ' +
      String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0'), PAD, y + 6);
    spaced(g, 'HYMN STUDIO', W - PAD, y + 6, 3, 'right');
    return cv;
  }
  /** 字距拉开的小字（canvas 的 letterSpacing 老浏览器没有，手动一个字一个字画） */
  function spaced(g, text, x, y, sp, align) {
    var chars = text.split(''), w = 0;
    chars.forEach(function (c) { w += g.measureText(c).width + sp; });
    w -= sp;
    var cx = align === 'right' ? x - w : x, old = g.textAlign;
    g.textAlign = 'left';
    chars.forEach(function (c) { g.fillText(c, cx, y); cx += g.measureText(c).width + sp; });
    g.textAlign = old;
  }
  function fit(g, s, w) {
    if (g.measureText(s).width <= w) return s;
    while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1);
    return s + '…';
  }


  /** 视频数据截到哪天：各导出文件「数据日期范围」终点里最晚的，再不晚于昨天 */
  function cutoff(videos, today) {
    return HY.dataEnd(videos, today) || HY.ymd(HY.addDays(HY.parseYmd(today), -1));
  }

  HY.Report = { range: range, compute: compute, draw: draw, cutoff: cutoff, spaced: spaced, fit: fit };
})();
