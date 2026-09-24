/* 总部看板 —— 脚本日历（按天）/ 门店列表 / 视频导入 / 效果统计 */
(function () {
  'use strict';

  var S = {
    stores: [], storeById: {}, scripts: [], scriptById: {}, videos: [],
    weeks: [], today: HY.ymd(new Date()), m: null,
    months: [], view: 'month', ym: '',      // view: 'month' 看某月每天 / 'year' 看全年每月
    byStoreDate: {}, freeByStoreDate: {}, freeByStore: {}
  };
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }

  /* ---------- 计算 ---------- */
  function recompute() {
    S.videos = HY.Videos.list();
    // 月份条 = 有脚本的月 ∪ 有视频发布的月。脚本从 8 月底才开始排，只按脚本算的话
    // 7 月及以前翻不到，那几个月店里自己发的视频就看不见（2026-09-24 用户：「我没法拉到7月」）
    var mo = {};
    HY.monthsIn(S.scripts).forEach(function (m) { mo[m] = 1; });
    S.videos.forEach(function (v) { if (v.pubDate) mo[HY.ymOf(v.pubDate)] = 1; });
    S.months = Object.keys(mo).sort();
    if (!S.ym || S.months.indexOf(S.ym) === -1) {
      var cur = HY.ymOf(S.today);
      S.ym = S.months.indexOf(cur) >= 0 ? cur : (S.months[0] || cur);
    }
    S.m = HY.match(S.scripts, S.videos);

    S.byStoreDate = {};
    S.scripts.forEach(function (s) { S.byStoreDate[s.store + '|' + s.date] = s; });

    // 全年总览要的是「这家店这个月 已发/逾期/待拍 各几条」。
    // 原来是对每个格子扫一遍全量脚本（43 店 × 13 月 × 1.6 万条 ≈ 900 万次），翻到全年总览就卡住。
    // 改成这里一次扫完，格子直接取。
    S.monthAgg = {};
    S.scripts.forEach(function (sc) {
      var k = sc.store + '|' + HY.ymOf(sc.date);
      var a = S.monthAgg[k] || (S.monthAgg[k] = { done: 0, late: 0, todo: 0, n: 0 });
      a[statusOfScript(sc)]++; a.n++;
    });

    // 门店列右边的「视频数」：这家店这个月一共发了几条（按脚本 + 自由发挥都算）
    S.vByStoreYm = {};
    S.videos.forEach(function (v) {
      if (!v.pubDate) return;
      var k = v.store + '|' + HY.ymOf(v.pubDate);
      S.vByStoreYm[k] = (S.vByStoreYm[k] || 0) + 1;
    });

    S.freeByStoreDate = {};
    S.freeByStore = {};
    S.m.free.forEach(function (v) {
      if (!v.pubDate) return;
      (S.freeByStore[v.store] = S.freeByStore[v.store] || []).push(v);
      var k = v.store + '|' + v.pubDate;
      (S.freeByStoreDate[k] = S.freeByStoreDate[k] || []).push(v);
    });
  }

  function statusOfScript(s) { return HY.statusOf(s, S.m.byScript[s.id], S.today); }

  /** 当前视图覆盖的脚本：月视图=该月；全年=全部 */
  function windowScripts() {
    if (S.view === 'year') return S.scripts;
    var g = HY.buildMonthGrid(S.ym);
    return S.scripts.filter(function (s) { return s.date >= g.from && s.date <= g.to; });
  }
  function rangeLabel() {
    return S.view === 'year'
      ? '全年（' + HY.monthLabel(S.months[0]) + ' – ' + HY.monthLabel(S.months[S.months.length - 1]) + '）'
      : HY.monthLabel(S.ym);
  }

  /* ---------- 图块区（灰底方块 + 会动的数据图）----------
     四块：完成率圆环 / 当月每天发布量 / 本月状态构成 / 今天要拍（线描插画）。
     颜色沿用状态色，每块都带文字标签，不靠颜色单独表意。 */
  /* 图块（圆环/柱子/状态构成条）的配色。
     【坑，2026-09-20】这里原来写死成墨绿 '#2F5D45'，改整站配色时够不着 ——
     结果 KPI 的「已发布」已经是粉了，图块里的圆环和柱子还是墨绿，
     两套色同时在页面上（用户：「这里，色系有点不搭」）。
     现在一律去读 CSS 变量，配色只在 style.css 一处定义，不会再脱节。 */
  function cssVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  var TILE_C = {
    done:  cssVar('--done',  '#D4788C'),
    late:  cssVar('--late',  '#9C3B2E'),
    todo:  cssVar('--todo',  '#E3D8C8'),
    track: cssVar('--ring-track', '#DBCEBB')
  };

  function renderTiles(rows) {
    var visible = {};
    rows.forEach(function (st) { visible[st.douyinId] = 1; });
    var ws = windowScripts().filter(function (s) { return visible[s.store]; });
    var c = { done: 0, late: 0, todo: 0 };
    ws.forEach(function (s) { c[statusOfScript(s)]++; });
    var due = c.done + c.late;
    var rate = due ? Math.round(c.done / due * 100) : 0;

    $('#tiles').innerHTML =
      // 「状态构成」「今天的活」两块 2026-09-24 删了（用户：「这2个不要」），发布量图放大占三格
      tileRing(rate, due, c) + tileSpark(visible);
    bindSparkHover();
    layoutSparkNums();
    if (!renderTiles.__rs) {
      renderTiles.__rs = true;
      window.addEventListener('resize', layoutSparkNums);
    }
  }

  /* 图块里的悬停标签：柱状图按周、堆叠条按状态，都在鼠标那块的正上方弹一个黑标签 */
  function bindSparkHover() {
    // 1) 近 13 周柱状图
    var spark = $('#tiles .spark');
    if (spark) {
      var sbox = spark.closest('.tile');             // 必须是 figure.tile（position:relative），挂到 .box 上定位会偏
      var stip = mkTip(sbox);
      var bars = sbox.querySelectorAll('rect.bar');
      sbox.querySelectorAll('rect.hot').forEach(function (hot) {
        hot.onmouseenter = function () {
          var bar = bars[+hot.dataset.i];
          if (bar) bar.classList.add('on');
          showTip(stip, sbox, bar, hot.dataset.lab + ' · ' + hot.dataset.n + ' 条');
        };
        hot.onmouseleave = function () {
          var bar = bars[+hot.dataset.i];
          if (bar) bar.classList.remove('on');
          stip.classList.remove('on');
        };
      });
    }
    // 2) 状态构成堆叠条
    var segs = $$('#tiles rect.seg');
    if (segs.length) {
      var kbox = segs[0].closest('.tile');
      var ktip = mkTip(kbox);
      segs.forEach(function (sg) {
        sg.onmouseenter = function () {
          sg.classList.add('on');
          showTip(ktip, kbox, sg, sg.dataset.lab + ' ' + HY.num(+sg.dataset.n) + ' 条 · ' + sg.dataset.p + '%');
        };
        sg.onmouseleave = function () {
          sg.classList.remove('on');
          ktip.classList.remove('on');
        };
      });
    }
  }
  function mkTip(box) {
    var old = box.querySelector('.sparktip');
    if (old) return old;
    var t = document.createElement('div');
    t.className = 'sparktip';
    box.appendChild(t);
    return t;
  }
  function showTip(tip, box, el, text) {
    if (!el) return;
    var r = el.getBoundingClientRect(), bx = box.getBoundingClientRect();
    tip.textContent = text;
    tip.style.left = Math.min(Math.max(r.left - bx.left + r.width / 2, 54), bx.width - 54) + 'px';
    tip.style.top = (r.top - bx.top) + 'px';
    tip.classList.add('on');
  }

  /* 1) 完成率圆环：单值，中间直接放数字 */
  function tileRing(rate, due, c) {
    var r = 52, cx = 78, cy = 78, circ = 2 * Math.PI * r;
    var off = circ * (1 - rate / 100);
    var svg =
      '<svg viewBox="0 0 156 156" role="img" aria-label="完成率 ' + rate + '%">' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + TILE_C.track + '" stroke-width="9"/>' +
        '<circle class="ring-val" cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" ' +
          'stroke="' + TILE_C.done + '" stroke-width="9" stroke-linecap="butt" ' +
          'transform="rotate(-90 ' + cx + ' ' + cy + ')" ' +
          'stroke-dasharray="' + circ.toFixed(1) + '" stroke-dashoffset="' + off.toFixed(1) + '" ' +
          'style="--dash:' + circ.toFixed(1) + 'px;--off:' + off.toFixed(1) + 'px">' +
          '<title>完成率 ' + rate + '%（已到期 ' + due + ' 条，已发布 ' + c.done + ' 条）</title>' +
        '</circle>' +
      '</svg>' +
      '<div class="tval"><b>' + rate + '<small>%</small></b><i>已发布 ' + c.done + ' / ' + due + '</i></div>';
    return tile(svg, '完成率', rangeLabel() + ' · 已到期 ' + due + ' 条');
  }

  /* 2) 发布量：跟着选中的月份走（2026-09-24 用户要求，原来是固定的「近 13 周」）
     月视图 = 该月每天一根柱；全年总览 = 每月一根柱。
     柱顶标数字 —— 但只在排得下的时候标（用户：「前提是，数字能排得下」）：
     画完后按 SVG 实际显示宽度量一次，一根柱的间距装不下最长的数字就整排不标，
     改窗口大小会重新量（layoutSparkNums）。排不下时照旧靠悬停看。 */
  function viewRange() {
    if (S.view === 'year') {
      return { from: HY.buildMonthGrid(S.months[0]).from, to: HY.buildMonthGrid(S.months[S.months.length - 1]).to };
    }
    var g = HY.buildMonthGrid(S.ym);
    return { from: g.from, to: g.to };
  }
  function tileSpark(visible) {
    var buckets = [], idx = {};
    if (S.view === 'year') {
      S.months.forEach(function (ym, i) {
        idx[ym] = i;
        buckets.push({ lab: HY.monthLabel(ym), short: +ym.slice(5) + '月', n: 0, future: ym > HY.ymOf(S.today) });
      });
    } else {
      HY.buildMonthGrid(S.ym).days.forEach(function (d, i) {
        idx[d.date] = i;
        buckets.push({ lab: HY.md(d.date) + '（周' + d.dow + '）', short: '', n: 0, future: d.date > S.today });
      });
    }
    S.videos.forEach(function (v) {
      if (!v.pubDate || !visible[v.store]) return;
      var k = S.view === 'year' ? HY.ymOf(v.pubDate) : v.pubDate;
      if (idx[k] != null) buckets[idx[k]].n++;
    });
    var max = Math.max.apply(null, buckets.map(function (w) { return w.n; })) || 1;
    var total = buckets.reduce(function (a, w) { return a + w.n; }, 0);
    // 宽图（占三格，box 4:1）：viewBox 也按 4:1 左右排
    var nb = buckets.length, W = 600, H = 112, pitch = W / nb, bw = Math.max(4, Math.min(22, pitch * 0.6));
    var bars = '', nums = '', hots = '';
    buckets.forEach(function (w, i) {
      var h = Math.max(w.n ? 3 : 1, Math.round(w.n / max * (H - 26)));
      var x = pitch * i + (pitch - bw) / 2, y = H - h;
      // 鼠标悬停靠 bindSparkHover() 画自己的标签（原生 <title> 要等 1 秒、字还小）
      bars += '<rect class="bar" x="' + x.toFixed(1) + '" y="' + y + '" width="' + bw.toFixed(1) + '" height="' + h + '" rx="1" ' +
        'fill="' + (w.n ? TILE_C.done : TILE_C.todo) + '" data-lab="' + w.lab + '" data-n="' + w.n + '" ' +
        'style="transform-origin:' + (x + bw / 2).toFixed(1) + 'px ' + H + 'px;animation-delay:' + (0.72 + i * 0.015).toFixed(3) + 's"></rect>';
      if (w.n) {
        nums += '<text class="bnum" x="' + (x + bw / 2).toFixed(1) + '" y="' + (y - 3) + '" text-anchor="middle">' + w.n + '</text>';
      }
      // 透明热区：整列都能触发，不然细柱子太难瞄
      hots += '<rect class="hot" x="' + (pitch * i).toFixed(1) + '" y="-20" width="' + pitch.toFixed(1) + '" height="' + (H + 20) +
        '" fill="transparent" data-lab="' + w.lab + '" data-n="' + w.n + '" data-i="' + i + '"></rect>';
    });
    var foot = S.view === 'year' ? '' :
      (HY.ymOf(S.today) === S.ym ? '今天 ' + (buckets[idx[S.today]] || { n: 0 }).n : '');
    var svg = '<svg class="spark" viewBox="-6 -22 612 152" data-w="612" role="img" aria-label="' + esc(rangeLabel()) + ' 发布量">' +
      '<text x="' + W + '" y="-8" text-anchor="end" font-size="11" fill="#3A3A42">峰值 ' + max + '</text>' +
      bars + '<g class="bnums">' + nums + '</g>' + hots +
      (foot ? '<text x="' + W + '" y="' + (H + 16) + '" text-anchor="end" font-size="11" fill="#7A6E60">' + foot + '</text>' : '') +
      '</svg>';
    return tile(svg, S.view === 'year' ? '每月发布量' : '每天发布量', null, 'tile-wide',
      total ? rangeLabel() + ' · 合计 ' + HY.num(total) + ' 条' : rangeLabel() + ' · 没有视频数据');
  }

  /* 柱顶数字排不排得下：按实际显示宽度算。字号固定显示成 10px（viewBox 缩放多少就反过来除多少） */
  function layoutSparkNums() {
    var svg = $('#tiles svg.spark');
    if (!svg) return;
    var g = svg.querySelector('.bnums'), texts = g ? g.querySelectorAll('text') : [];
    if (!texts.length) return;
    var px = svg.getBoundingClientRect().width;
    if (!px) return;
    var scale = px / +svg.getAttribute('data-w');
    var bars = svg.querySelectorAll('rect.bar');
    var pitchPx = 600 / bars.length * scale;
    var maxDigits = 0;
    texts.forEach(function (t) { maxDigits = Math.max(maxDigits, t.textContent.length); });
    var fontPx = 15, need = maxDigits * fontPx * 0.62 + 3;      // 数字字形约 0.6 个字号宽，再留 3px 缝
    var fit = pitchPx >= need;
    g.style.display = fit ? '' : 'none';
    texts.forEach(function (t) { t.setAttribute('font-size', (fontPx / scale).toFixed(2)); });
  }

  /* 3) 本月状态构成：一根堆叠条 + 四个直接标注（段间留 2px 缝） */
  function tileStack(c, all) {
    var order = [['done', '已发布'], ['late', '逾期未发'], ['todo', '待拍']];
    var W = 200, H = 16, x = 0, segs = '', keys = '';
    order.forEach(function (o) {
      var n = c[o[0]], w = all ? (n / all) * W : 0;
      if (w > 0) {
        segs += '<rect class="seg" x="' + x.toFixed(1) + '" y="0" width="' + Math.max(0, w - 2).toFixed(1) + '" height="' + H + '" ' +
          'fill="' + TILE_C[o[0]] + '" data-lab="' + o[1] + '" data-n="' + n +
          '" data-p="' + Math.round(n / all * 100) + '" ' +
          'style="transform-origin:' + x.toFixed(1) + 'px 0"></rect>';
      }
      x += w;
      keys += '<em><u style="background:' + TILE_C[o[0]] + '"></u>' + o[1] + ' <b>' + n + '</b></em>';
    });
    var svg = '<svg viewBox="-16 -40 232 96" role="img" aria-label="本月状态构成">' + segs + '</svg>' +
      '<div class="note">' + rangeLabel() + ' 共 ' + HY.num(all) + ' 条</div>' +
      '<div class="keys">' + keys + '</div>';
    return tile(svg, '状态构成', '四种状态各占多少');
  }

  /* 4) 今天要拍：线描插画（相机 + 补光灯），笔画逐渐画出来 */
  function tileToday(visible) {
    var n = 0, late = 0;
    S.scripts.forEach(function (s) {
      if (!visible[s.store]) return;
      if (s.date === S.today) n++;
    });
    // 逾期只算当前视图（本月 / 全年），跟圆环和状态构成同一个范围（2026-09-24 改，原来是开排以来全部）
    windowScripts().forEach(function (s) {
      if (visible[s.store] && statusOfScript(s) === 'late') late++;
    });
    var svg =
      '<svg viewBox="0 0 200 196" fill="none" stroke="#7E6849" stroke-width="1.4" ' +
        'stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="今天要拍 ' + n + ' 条">' +
        '<g class="ink-draw" transform="translate(0,-6)" style="--len:760px" stroke-dasharray="760" stroke-dashoffset="0">' +
          '<rect x="26" y="58" width="86" height="56" rx="4"/>' +
          '<path d="M44 58l9-13h32l9 13"/>' +
          '<circle cx="69" cy="86" r="17"/><circle cx="69" cy="86" r="7"/>' +
          '<path d="M100 68h6"/>' +
          '<path d="M150 112V72"/><path d="M136 124h28"/>' +
          '<path d="M133 60h34l-6 12h-22z"/>' +
          '<path d="M150 46v-9M133 50l-6-7M167 50l6-7"/>' +
        '</g>' +
      '</svg>' +
      '<div class="tval" style="justify-content:flex-end;padding-bottom:16px">' +
        '<b>' + n + '<small> 条</small></b><i>今天要拍</i></div>';
    return tile(svg, '今天的活（' + HY.md(S.today) + '）', rangeLabel() + (late ? ' 另有 ' + late + ' 条逾期待补' : ' 没有积压的逾期'));
  }

  function tile(inner, cap, sub, cls, sub2) {
    if (cls) sub = sub2;                      // tile(svg, 标题, null, 类名, 小字)
    return '<figure class="tile' + (cls ? ' ' + cls : '') + '"><div class="box">' + inner + '</div>' +
      '<figcaption>' + cap + '<span>' + esc(sub) + '</span></figcaption></figure>';
  }

  /* ---------- KPI + 排行 ---------- */
  function kpi(lab, val, cls, sub) {
    return '<div class="kpi ' + cls + '"><div class="lab">' + lab + '</div><div class="val">' + val +
           '</div><div class="sub">' + (sub || '') + '</div></div>';
  }

  function renderKpis(rows) {
    var visible = {};
    rows.forEach(function (st) { visible[st.douyinId] = 1; });
    var ws = windowScripts().filter(function (s) { return visible[s.store]; });
    var c = { done: 0, late: 0, todo: 0 };
    ws.forEach(function (s) { c[statusOfScript(s)]++; });
    var due = c.done + c.late;
    var rate = due ? Math.round(c.done / due * 100) : 0;
    // 「自由发挥视频」那格 2026-09-24 删了（用户：「这个不要」）

    $('#kpis').innerHTML = [
      kpi('完成率', rate + '<small>%</small>', '', rangeLabel() + ' · 已到期 ' + due + ' 条'),
      kpi('已发布', c.done, 'done', '计划当天发的才算'),
      kpi('逾期未发', c.late, 'late', '过了计划日仍没匹配到'),
      kpi('待拍', c.todo, '', '计划日期还没到'),
      kpi('门店', rows.length + '<small>/' + S.stores.length + '</small>', '', '当前筛选结果')
    ].join('');
    // 「逾期未发排行」卡片 2026-09-24 删了（用户：「后台这部分不要」），别加回去
  }

  /* ---------- 月份选择条 ---------- */
  function renderMonthBar() {
    var h = '<button class="mchip nav" id="mPrev" title="上一月">‹</button>';
    h += '<div class="mscroll" id="mScroll">';
    S.months.forEach(function (ym) {
      var past = ym < HY.ymOf(S.today), now = ym === HY.ymOf(S.today);
      h += '<button class="mchip' + (S.view === 'month' && ym === S.ym ? ' on' : '') +
        (past ? ' past' : '') + (now ? ' thismonth' : '') + '" data-ym="' + ym + '">' +
        ym.slice(0, 4) + '.' + ym.slice(5) + (now ? ' <i>本月</i>' : '') + '</button>';
    });
    h += '</div>';
    h += '<button class="mchip nav" id="mNext" title="下一月">›</button>';
    h += '<button class="mchip year' + (S.view === 'year' ? ' on' : '') + '" id="mYear">全年总览</button>';
    $('#monthbar').innerHTML = h;

    $$('#monthbar .mchip[data-ym]').forEach(function (el) {
      el.onclick = function () { S.view = 'month'; S.ym = el.dataset.ym; render(); scrollMonthIntoView(); };
    });
    $('#mYear').onclick = function () { S.view = S.view === 'year' ? 'month' : 'year'; render(); };
    $('#mPrev').onclick = function () { stepMonth(-1); };
    $('#mNext').onclick = function () { stepMonth(1); };
    scrollMonthIntoView();
  }
  function stepMonth(d) {
    var i = S.months.indexOf(S.ym) + d;
    if (i < 0 || i >= S.months.length) return;
    S.view = 'month'; S.ym = S.months[i];
    render(); scrollMonthIntoView();
  }
  function scrollMonthIntoView() {
    var el = $('#monthbar .mchip.on');
    if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  /* ---------- 日历大表 ---------- */
  function filtered() {
    var q = $('#fSearch').value.trim();
    var mgr = $('#fMgr').value, picked = selValues($('#fStore'));
    var onlyLate = $('#fLate').checked;
    var ws = onlyLate ? windowScripts() : null;
    return S.stores.filter(function (st) {
      if (mgr && (st.manager || '') !== mgr) return false;
      if (picked.length && picked.indexOf(st.douyinId) === -1) return false;
      if (q && (st.storeName + st.accountName + st.douyinId).indexOf(q) === -1) return false;
      if (onlyLate && !ws.some(function (s) {
        return s.store === st.douyinId && statusOfScript(s) === 'late';
      })) return false;
      return true;
    });
  }

  /* 日历门店列排序（2026-09-24 用户：「无法通过筛选排名吗」）：
     点表头「完成率」「本月视频」排，第一下从高到低，再点从低到高，第三下回到默认顺序。
     完成率没有的店（没脚本也没发视频）一律排最后。图块和 KPI 不受排序影响。 */
  var SORT = { k: '', desc: true };
  function sortRows(rows) {
    if (!SORT.k) return rows;
    var val = SORT.k === 'rate'
      ? function (st) { var r = storeRate(st); return r ? r.p : null; }
      : storeVideoCount;
    var d = SORT.desc ? -1 : 1;
    return rows.map(function (st, i) { return { st: st, v: val(st), i: i }; })
      .sort(function (a, b) {
        if (a.v == null || b.v == null) return a.v == null ? (b.v == null ? a.i - b.i : 1) : -1;
        return a.v === b.v ? a.i - b.i : (a.v - b.v) * d;
      })
      .map(function (x) { return x.st; });
  }

  function render() {
    var rows = filtered();
    renderTiles(rows);
    renderKpis(rows);
    renderMonthBar();
    rows = sortRows(rows);
    $('#board').innerHTML = S.view === 'year' ? yearTable(rows) : monthTable(rows);
    bindCells();
    $$('#board .sk').forEach(function (el) {
      el.onclick = function () {
        var k = el.dataset.k;
        if (SORT.k !== k) SORT = { k: k, desc: true };
        else if (SORT.desc) SORT.desc = false;
        else SORT = { k: '', desc: true };
        render();
      };
    });
  }

  /** 月视图：该月每天一列 */
  function monthTable(rows) {
    var g = HY.buildMonthGrid(S.ym);
    var h = '<thead><tr class="r1"><th class="stcol" rowspan="2">' + stHead(rows.length, '本月') + '</th>';
    // 第一行按周分组
    var i = 0;
    while (i < g.days.length) {
      var j = i;
      while (j + 1 < g.days.length && !g.days[j + 1].wstart) j++;
      var span = j - i + 1;
      var isNow = g.days.slice(i, j + 1).some(function (d) { return d.today; });
      h += '<th class="wk' + (isNow ? ' now' : '') + '" colspan="' + span + '">' +
           g.days[i].dd + '–' + g.days[j].dd + ' 日</th>';
      i = j + 1;
    }
    h += '</tr><tr class="r2">';
    g.days.forEach(function (d) {
      h += '<th class="day' + (d.weekend ? ' wknd' : '') + (d.today ? ' today' : '') +
           (d.wstart ? ' wstart' : '') + '">' + d.dow + '<span class="d">' + d.dd + '</span></th>';
    });
    h += '</tr></thead><tbody>';

    if (!rows.length) h += '<tr><td class="emptyrow" colspan="99">没有符合筛选条件的门店</td></tr>';
    rows.forEach(function (st) {
      h += '<tr>' + storeCell(st);
      g.days.forEach(function (d) {
        var cls = 'cell' + (d.weekend ? ' wknd' : '') + (d.wstart ? ' wstart' : '');
        var sc = S.byStoreDate[st.douyinId + '|' + d.date];
        var free = S.freeByStoreDate[st.douyinId + '|' + d.date];
        h += '<td class="' + cls + '">';
        // 角标 = 当天实际发了几条；只有方块本身说不清的时候才标（单发一条按脚本的不标）
        var nf = free ? free.length : 0;
        if (sc) {
          var stt = statusOfScript(sc);
          var n = (stt === 'done' ? 1 : 0) + nf;
          h += '<span class="dot ' + stt + '"' + (nf ? ' data-n="' + n + '"' : '') +
               ' data-id="' + esc(sc.id) +
               '" data-tip="' + esc(st.storeName + ' · ' + d.date + '（周' + d.dow + '）\n' +
               sc.topic + '·' + sc.format + '\n' + HY.STATUS_CN[stt] +
               (nf ? '\n当天共发 ' + n + ' 条（其中计划外 ' + nf + ' 条）' : '')) + '"></span>';
        } else if (free) {
          h += '<span class="dot free"' + (nf > 1 ? ' data-n="' + nf + '"' : '') +
               ' data-free="' + st.douyinId + '|' + d.date +
               '" data-tip="' + esc(st.storeName + ' · ' + d.date + '（周' + d.dow + '）\n' +
               '当天发了 ' + nf + ' 条计划外视频，点开看链接') + '"></span>';
        } else {
          h += '<span class="dot none"></span>';
        }
        h += '</td>';
      });
      h += '</tr>';
    });
    return h + '</tbody>';
  }

  /** 全年总览：每月一列，格子里是该店该月的完成情况条 */
  function yearTable(rows) {
    var h = '<thead><tr class="r2"><th class="stcol">' + stHead(rows.length, '合计') + '</th>';
    S.months.forEach(function (ym) {
      var now = ym === HY.ymOf(S.today);
      h += '<th class="mcol' + (now ? ' today' : '') + '">' + (+ym.slice(5)) + ' 月' +
           '<span class="d">' + ym.slice(0, 4) + '</span></th>';
    });
    h += '</tr></thead><tbody>';

    if (!rows.length) h += '<tr><td class="emptyrow" colspan="99">没有符合筛选条件的门店</td></tr>';
    rows.forEach(function (st) {
      h += '<tr>' + storeCell(st);
      S.months.forEach(function (ym) {
        var c = S.monthAgg[st.douyinId + '|' + ym] || { done: 0, late: 0, todo: 0, n: 0 };
        var n = c.n, ok = c.done, due = ok + c.late;
        h += '<td class="mcell" data-ym="' + ym + '">';
        if (!n) {
          h += '<span class="muted">—</span>';
        } else {
          var w = function (x) { return n ? (x / n * 100).toFixed(1) + '%' : '0%'; };
          h += '<div class="bar" data-tip="' + esc(st.storeName + ' · ' + HY.monthLabel(ym) +
               '\n共 ' + n + ' 条：已发 ' + ok + ' · 逾期 ' + c.late + ' · 待拍 ' + c.todo +
               '\n点一下进这个月') + '">' +
               '<i class="s-done" style="width:' + w(ok) + '"></i>' +
               '<i class="s-late" style="width:' + w(c.late) + '"></i>' +
               '<i class="s-todo" style="width:' + w(c.todo) + '"></i></div>' +
               '<div class="bnum">' + (due ? ok + '/' + due : n + ' 待拍') + '</div>';
        }
        h += '</td>';
      });
      h += '</tr>';
    });
    return h + '</tbody>';
  }

  function stHead(n, lab) {
    function sk(k, t) {
      var on = SORT.k === k;
      return '<span class="sk' + (on ? ' on' : '') + '" data-k="' + k + '" title="点一下排序">' + t +
        '<i>' + (on ? (SORT.desc ? '▾' : '▴') : '↕') + '</i></span>';
    }
    return '<div class="sth"><span>门店 <span class="muted">(' + n + ')</span>' + sk('rate', '完成率') + '</span>' +
           sk('videos', lab + '视频') + '</div>';
  }
  /** 当前视图里这家店发了几条：月视图 = 该月；全年总览 = 所有月份加起来 */
  function storeVideoCount(st) {
    var yms = S.view === 'year' ? S.months : [S.ym], n = 0;
    yms.forEach(function (ym) { n += S.vByStoreYm[st.douyinId + '|' + ym] || 0; });
    return n;
  }

  /* 门店列收窄（2026-09-23 用户：「太宽了，浪费面积」）：抖音号不再占一行字，挪进悬停提示；
     右边放这家店当前视图的视频总数。 */
  /* 店名后面的完成率（2026-09-24 加）：口径跟顶上 KPI 一致 = 已发布 ÷ 已到期，范围 = 当前视图（本月 / 全年）。
     一次扫完所有脚本存起来，别在每个格子里扫（见 CLAUDE.md「全年总览的计数」那条坑）。 */
  var rateCache = { key: '', map: {} }, firstScript = { n: -1, d: '' };
  function storeRate(st) {
    // 脚本从月中才开始排的月份（8 月只有 31 号一天有脚本）按完成率算只看得到一两天，也改显示发布率
    if (S.view !== 'year' && S.scripts.length) {
      if (firstScript.n !== S.scripts.length) {       // 每家店都要问一次，别每次扫 1.6 万条
        firstScript = { n: S.scripts.length,
          d: S.scripts.reduce(function (m, s) { return s.date < m ? s.date : m; }, S.scripts[0].date) };
      }
      if (HY.buildMonthGrid(S.ym).from < firstScript.d) return pubRate(st);
    }
    var key = S.view + '|' + S.ym + '|' + S.videos.length;
    if (rateCache.key !== key) {
      var map = {};
      windowScripts().forEach(function (s) {
        var t = statusOfScript(s);
        if (t === 'todo') return;
        var o = map[s.store] = map[s.store] || { done: 0, due: 0 };
        o.due++; if (t === 'done') o.done++;
      });
      rateCache = { key: key, map: map };
    }
    var o = rateCache.map[st.douyinId];
    if (o && o.due) return { p: Math.round(o.done / o.due * 100), done: o.done, due: o.due };
    return S.view === 'year' ? null : pubRate(st);
  }

  /* 没有脚本的月份（7 月及以前）显示「视频发布率」= 这个月有几天发了视频 ÷ 天数
     （2026-09-24 用户：「没有脚本的月份，就显示视频发布率」）。
     天数只算到今天和抖音数据截至日为止，没到的日子不算进分母。灰色，跟绿色的完成率区分开。 */
  var pubCache = { key: '', days: {} };
  function pubRate(st) {
    var key = S.ym + '|' + S.videos.length;
    if (pubCache.key !== key) {
      var days = {};
      S.videos.forEach(function (v) {
        if (v.pubDate && HY.ymOf(v.pubDate) === S.ym) (days[v.store] = days[v.store] || {})[v.pubDate] = 1;
      });
      var g = HY.buildMonthGrid(S.ym), end = g.to;
      var upto = window.HY_VIDEOS_PUB && window.HY_VIDEOS_PUB.upto;
      if (S.today < end) end = S.today;
      if (upto && upto < end && !HY.Videos.meta().imports.length) end = upto;
      var total = 0;
      for (var d = g.from; d <= end; d = HY.ymd(HY.addDays(HY.parseYmd(d), 1))) total++;
      pubCache = { key: key, days: days, total: total };
    }
    if (!pubCache.total) return null;
    var n = Object.keys(pubCache.days[st.douyinId] || {}).length;
    return { p: Math.round(n / pubCache.total * 100), pub: 1, n: n, total: pubCache.total };
  }

  function storeCell(st) {
    var n = storeVideoCount(st), r = storeRate(st);
    return '<td class="stcol" title="抖音号 ' + st.douyinId + '"><div class="stc"><div class="stl">' +
      '<div class="nmrow"><span class="nm">' + esc(st.storeName) + '</span>' +
      (r ? (r.pub
        ? '<span class="rate pub" title="这个月没有脚本，显示视频发布率：' + r.total + ' 天里有 ' + r.n + ' 天发了视频">' + r.p + '%</span>'
        : '<span class="rate" title="完成率：已发布 ' + r.done + ' / 已到期 ' + r.due + ' 条">' + r.p + '%</span>') : '') +
      '</div><div class="meta">' +
      (st.brandLine ? '<span class="bl">' + esc(st.brandLine) + '</span>' : '') +
      '<a class="mob" href="store.html?store=' + st.douyinId + '" target="_blank">门店页</a></div></div>' +
      '<div class="vn' + (n ? '' : ' zero') + '">' + n + '</div></div></td>';
  }

  /* 日历上的悬停提示：跟图块区一样自己画（原生 title 要等 1 秒、字还小）。
     整张表只挂一次 mouseover，格子有几千个也不用一个个绑。 */
  function bindBoardTip() {
    var wrap = $('.gridwrap');
    if (!wrap || wrap.__tipbound) return;
    wrap.__tipbound = true;
    var tip = document.createElement('div');
    tip.className = 'celltip';
    document.body.appendChild(tip);
    function hide() { tip.classList.remove('on'); }
    wrap.addEventListener('mouseover', function (e) {
      var el = e.target.closest ? e.target.closest('[data-tip]') : null;
      if (!el) { hide(); return; }
      tip.textContent = el.dataset.tip;
      tip.classList.add('on');
      var r = el.getBoundingClientRect(), w = tip.offsetWidth;
      tip.style.left = Math.min(Math.max(r.left + r.width / 2 - w / 2, 8), window.innerWidth - w - 8) + 'px';
      var top = r.top - tip.offsetHeight - 8;
      tip.style.top = (top < 8 ? r.bottom + 8 : top) + 'px';   // 顶到头就翻到下面去
    });
    wrap.addEventListener('mouseleave', hide);
    wrap.addEventListener('scroll', hide, true);
    window.addEventListener('scroll', hide, true);
  }

  /* 表头冻结靠「整页最多划到表格贴顶」+「表格里面自己滚」。滚轮在表格上时手动分配：
     往下：表格顶还没到屏幕顶 → 先划整页，最多划到贴顶；贴顶后只划表里面，划到底也不再带动整页
           （原来会带着整页继续往上走，表头就被划出屏幕了 —— 用户 2026-09-23）。
     往上：表里面还没回到顶 → 先划表里面；回到顶了才划整页。
     .gridwrap 上配了 overscroll-behavior:contain，浏览器不会自己把滚动串到整页。 */
  function bindGridScroll() {
    var wrap = $('.gridwrap');
    if (!wrap || wrap.__scrollbound) return;
    wrap.__scrollbound = true;
    wrap.addEventListener('wheel', function (e) {
      if (!e.deltaY || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      var dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      var gap = wrap.getBoundingClientRect().top;
      if (dy > 0) {
        if (gap <= 1) return;                        // 已贴顶：交给表里面滚
        e.preventDefault();
        window.scrollBy(0, Math.min(dy, gap));
      } else {
        if (wrap.scrollTop > 0) return;              // 表里面还没回到顶
        e.preventDefault();
        window.scrollBy(0, dy);
      }
    }, { passive: false });
  }

  function bindCells() {
    bindBoardTip();
    bindGridScroll();
    $$('#board .dot[data-id]').forEach(function (el) {
      el.onclick = function () { openScript(el.dataset.id); };
    });
    $$('#board .dot[data-free]').forEach(function (el) {
      el.onclick = function () { openFree(el.dataset.free); };
    });
    $$('#board td.mcell[data-ym]').forEach(function (el) {
      el.onclick = function () { S.view = 'month'; S.ym = el.dataset.ym; render(); };
    });
  }

  /* ---------- 侧栏：脚本详情 ---------- */
  function openDrawer() { $('#drawer').classList.add('open'); $('#backdrop').classList.add('on'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#backdrop').classList.remove('on'); }
  function kv(k, v) { return v ? '<div class="k">' + k + '</div><div>' + esc(v) + '</div>' : ''; }
  /* 台词素材本身可能就带「」，外面别再套一层（会变成「「…」」） */
  function quote(t) {
    t = String(t == null ? '' : t);
    return t.charAt(0) === '\u300c' ? esc(t) : '\u300c' + esc(t) + '\u300d';
  }
  /* 占位数据的 cta 自带「结尾引导：」前缀，跟上面的小标题重复了，剥掉 */
  function ctaText(t) { return String(t == null ? '' : t).replace(/^\u7ed3\u5c3e\u5f15\u5bfc[:\uff1a]\s*/, ''); }
  function list(arr, cls) {
    if (!arr || !arr.length) return '';
    return '<ul class="lines ' + (cls || '') + '">' + arr.map(function (x) {
      return '<li>' + esc(x) + '</li>';
    }).join('') + '</ul>';
  }

  function openScript(id) {
    var light = S.scriptById[id];
    if (!light) return;
    var st = S.storeById[light.store] || {};
    // 详情在按门店分片里，先加载再画
    $('#dTitle').textContent = st.storeName + '｜' + light.topic;
    $('#dSub').textContent = '计划发布 ' + light.date + ' · 载入脚本详情…';
    $('#dBody').innerHTML = '<div class="emptyrow">载入中…</div>';
    openDrawer();
    HY.loadDetail(st.code, HY.ymOf(light.date)).then(function () {
      drawScript(id);
    }, function (e) {
      $('#dBody').innerHTML = '<div class="emptyrow">脚本详情加载失败：' + esc(e.message) + '</div>';
    });
  }

  function drawScript(id) {
    var s = HY.detail(id) || S.scriptById[id];
    if (!s) return;
    var st = S.storeById[s.store] || {};
    var m = S.m.byScript[s.id];
    var stt = HY.statusOf(s, m, S.today);

    $('#dTitle').textContent = st.storeName + '｜' + s.topic;
    $('#dSub').innerHTML = '计划发布 ' + s.date + ' · ' + esc(s.format) +
      (s.duration ? ' · ' + esc(s.duration) : '') + ' · <span class="mono">' + esc(s.id) + '</span>';

    var h = '<span class="pill ' + stt + '">' + HY.STATUS_CN[stt] + '</span>';

    h += '<div class="statusbox">';
    if (m) {
      h += videoInfo(m.video);
      h += '<div class="vmeta">※ 计划当天该门店发了这条视频，就按完成算（没有标签可核对，只看日期）。</div>';
    } else if (stt === 'late') {
      h += '<div class="vmeta">计划日期已过，当天该门店没有视频。晚几天补发的不算，已拍的话重新导入最新数据看看。</div>';
    } else {
      h += '<div class="vmeta">还没到计划日期。</div>';
    }
    h += '</div>';
    // 当天另外发的（自由发挥）也列出来，带链接
    var extra = S.freeByStoreDate[s.store + '|' + s.date] || [];
    if (extra.length) {
      h += '<div class="vmeta" style="margin-top:14px">当天另外还发了 ' + extra.length + ' 条：</div>';
      extra.forEach(function (v) { h += '<div class="statusbox" style="margin-top:8px">' + videoInfo(v) + '</div>'; });
    }

    // 【极简】2026-09-20 用户：「太复杂了，不适合给所有人看，要极简」。
    // 抽屉跟门店页保持一套内容：开头 3 秒 + 分镜 + 标签，别的都不露。
    // 砍掉的：选题（人群/痛点/成因/承诺/对应项目）、标题备选、封面、拍摄要点、避坑、现场（BGM/道具）。
    h += '<div class="sechead">开头 3 秒</div><div class="bigline">' + esc(s.hook) + '</div>';

    var shots = s.shots || [];
    h += '<div class="sechead">分镜 ' + shots.length + ' 幕' + (s.duration ? ' · ' + esc(s.duration) : '') + '</div>';
    shots.forEach(function (sh, i) {
      h += '<div class="shot"><div class="n">' + (i + 1) + '</div><div class="bd">' +
        '<div class="sc">' + esc(sh.scene) + '</div>' +
        (sh.line ? '<div class="ln">' + quote(sh.line) + '</div>' : '') +
        '</div><div class="sec">' + (sh.sec || 0) + 's</div></div>';
    });
    // 结尾那句也是要念的话，并进分镜最后一行
    if (s.cta) {
      h += '<div class="shot end"><div class="n">尾</div><div class="bd">' +
        '<div class="ln">' + quote(ctaText(s.cta)) + '</div></div><div class="sec"></div></div>';
    }

    if (s.hashtags && s.hashtags.length) {
      h += '<div class="sechead">话题标签</div><div class="hashrow">' +
        s.hashtags.filter(function (t) { return t !== s.tag; })   // 专属标签已取消，不再露出
          .map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
        '</div><div class="rowbtns"><button class="btn sm" id="copyAll">复制全部标签</button></div>';
    }

    h += '<div class="rowbtns"><a class="btn sm" href="store.html?store=' + s.store +
         '" target="_blank">打开该门店手机页</a></div>';

    $('#dBody').innerHTML = h;
    $('#dBody').scrollTop = 0;

    var ca = document.getElementById('copyAll');
    if (ca) ca.onclick = function () {
      copy((s.hashtags || []).filter(function (t) { return t !== s.tag; }).join(' '), '标签已全部复制');
    };
  }

  function copy(text, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { HY.toast(okMsg); },
        function () { HY.toast('复制失败，手动选中吧'); });
    } else {
      HY.toast('当前环境不支持一键复制，手动选中吧');
    }
  }

  function openFree(key) {
    var arr = (S.freeByStoreDate[key] || []).slice();
    var p = key.split('|'), st = S.storeById[p[0]] || {};
    $('#dTitle').textContent = st.storeName + '｜计划外视频';
    $('#dSub').textContent = p[1] + ' 当天没对上任何脚本的视频 ' + arr.length + ' 条';
    $('#dBody').innerHTML = arr.map(function (v) {
      return '<div class="statusbox" style="margin-top:10px">' + videoInfo(v) + '</div>';
    }).join('');
    openDrawer();
  }

  /* 一条视频：标题 + 数据 + 明摆着的「打开视频」「复制链接」和链接原文
     （2026-09-23 用户：已发布的视频要给链接 —— 原来只有标题带下划线能点，看不出是链接） */
  function videoInfo(v) {
    var h = '<div class="vtitle">' + esc(v.title || '（无标题）') + '</div>' +
      '<div class="vmeta mono">发布 ' + v.pubDate + ' · 播放 ' + HY.num(v.play) +
      (v.noGmv ? '' : ' · 成交 ¥' + HY.num(v.gmv)) + '</div>';
    if (!v.url) return h + '<div class="vmeta">导入的数据里这条没有链接</div>';
    return h + '<div class="vbtns"><a class="btn primary" href="' + esc(v.url) +
      '" target="_blank" rel="noopener">打开视频 ↗</a>' +
      '<button class="btn" type="button" data-copy="' + esc(v.url) + '">复制链接</button></div>' +
      '<div class="vurl mono">' + esc(v.url) + '</div>';
  }
  // 复制链接：整页只挂一次
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-copy]');
    if (!b) return;
    var t = b.dataset.copy, done = function () {
      b.textContent = '已复制'; setTimeout(function () { b.textContent = '复制链接'; }, 1500);
    };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, function () { prompt('复制这个链接', t); });
    else prompt('复制这个链接', t);
  });

  /* ---------- 门店档案（可直接编辑） ---------- */
  var REGION_HINTS = ['海曙', '江北', '鄞州', '镇海', '北仑', '奉化', '慈溪', '余姚',
                      '象山', '宁海', '绍兴', '台州', '温州'];
  var TYPE_OPTS = ['', '商场店', '社区店', '街边店', '写字楼店'];

  /** 经理名单 = 手工加的名字 ∪ 门店上已经填着的名字 */
  function managerNames() {
    var o = {};
    HY.Managers.list().forEach(function (m) { o[m] = 1; });
    S.stores.forEach(function (x) { if (x.manager) o[x.manager] = 1; });
    return Object.keys(o).sort(function (a, c) { return a.localeCompare(c, 'zh'); });
  }

  function renderStoreList() {
    var cntS = {}, cntV = {};
    S.scripts.forEach(function (x) { cntS[x.store] = (cntS[x.store] || 0) + 1; });
    S.videos.forEach(function (v) { cntV[v.store] = (cntV[v.store] || 0) + 1; });

    var regions = {};
    S.stores.forEach(function (x) { if (x.region) regions[x.region] = 1; });
    REGION_HINTS.forEach(function (r) { regions[r] = 1; });
    $('#regionList').innerHTML = Object.keys(regions).sort().map(function (r) {
      return '<option value="' + esc(r) + '">';
    }).join('');

    var filled = S.stores.filter(function (x) { return x.region; }).length;
    $('#profileStat').innerHTML = '已填区域 <b>' + filled + '/' + S.stores.length + '</b> 家 · ' +
      '本机改动 <b>' + HY.StoreEdits.count() + '</b> 家（存在浏览器里，改完记得导出）';

    var names = managerNames();
    var used = {};
    S.stores.forEach(function (x) { if (x.manager) used[x.manager] = (used[x.manager] || 0) + 1; });
    $('#mgrBar').innerHTML =
      '<span class="k">区域经理</span>' +
      (names.length
        ? names.map(function (m) {
            return '<span class="chip">' + esc(m) + '<i class="n">' + (used[m] || 0) + ' 家</i>' +
                   '<button class="x" data-m="' + esc(m) + '" title="删掉这个名字">×</button></span>';
          }).join('')
        : '<span class="none">还没有经理，先在右边加一个</span>') +
      '<span class="add"><input id="mgrNew" placeholder="新名字，回车添加">' +
      '<button class="btn sm" id="mgrManage">分配门店…</button></span>';

    var h = '<thead><tr><th style="width:52px">编号</th><th>门店</th><th>抖音号</th><th style="width:120px">区域经理</th>' +
      '<th style="width:110px">店里几个人</th>' +
      '<th style="width:110px">区域</th>' +
      '<th style="width:110px">门店类型</th>' +
      '<th>脚本</th><th>视频</th><th></th></tr></thead><tbody>';
    /* 2026-09-24 删掉的列（用户：「这些目前好像用不到」「有留着的必要吗」）：
       - 客群 / 主推项目 / 可拍场景 / 出镜条件：43 家全空，生成脚本也没读它们
       - 店铺手机号：这里填的只存本机，改不了登录；登录用的是 stores.json 的 phoneHash
         （43 家都已有），要换号码走 tools/set_phones.py
       字段都还在数据里，要加回来就是恢复这几行 cellInput。 */
    S.stores.forEach(function (st, i) {
      h += '<tr data-id="' + st.douyinId + '">' +
        '<td class="mono muted">' + (i + 1) + '<span class="code">' + esc(st.code || '') + '</span></td>' +
        '<td><div class="nm2">' + esc(st.storeName) + '</div>' +
        (st.brandLine ? '<div class="bl">' + esc(st.brandLine) + '</div>' : '') + '</td>' +
        '<td class="mono muted">' + st.douyinId + '</td>' +
        cellSelect(st, 'manager', [''].concat(names)) +
        // 只有一个人的店，生成脚本时只派单人能拍的形式。改完记得导出 stores.json 再跑生成。
        cellSelect(st, 'staff', ['', '1'], { '': '两个人', '1': '一个人' }) +
        cellInput(st, 'region', '区域', 'regionList') +
        cellSelect(st, 'storeType', TYPE_OPTS) +
        '<td class="mono">' + (cntS[st.douyinId] || 0) + '</td>' +
        '<td class="mono">' + (cntV[st.douyinId] || 0) + '</td>' +
        '<td><a class="btn sm" href="store.html?store=' + st.douyinId + '" target="_blank">门店页</a></td></tr>';
    });
    $('#storelist').innerHTML = h + '</tbody>';

    var addIn = $('#mgrNew');   // 「添加」按钮 2026-09-24 删了（用户觉得没用），输入框回车照样能加
    function doAdd() {
      var v = addIn.value.trim();
      if (!v) return;
      if (!HY.Managers.add(v)) { HY.toast('「' + v + '」已经在名单里了'); return; }
      addIn.value = '';
      fillFilters();
      renderStoreList();
      HY.toast('已添加 ' + v);
    }
    addIn.onkeydown = function (e) { if (e.key === 'Enter') doAdd(); };
    $('#mgrManage').onclick = openMgrModal;
    $$('#mgrBar .chip .x').forEach(function (el) {
      el.onclick = function () {
        var m = el.dataset.m, n = used[m] || 0;
        if (n && !confirm('「' + m + '」名下还有 ' + n + ' 家门店，删掉名字会把这些门店的区域经理清空。继续？')) return;
        HY.Managers.remove(m);
        S.stores.forEach(function (st) {
          if (st.manager === m) { st.manager = ''; HY.StoreEdits.set(st.douyinId, 'manager', ''); }
        });
        fillFilters();
        renderStoreList();
        render();
        HY.toast('已删除 ' + m);
      };
    });

    $$('#storelist select[data-f]').forEach(function (s) { xsel(s); });   // 表格里的下拉也用自己那套

    $$('#storelist input[data-f], #storelist select[data-f]').forEach(function (el) {
      el.onchange = function () {
        var id = el.closest('tr').dataset.id, f = el.dataset.f, v = el.value.trim();
        HY.StoreEdits.set(id, f, f === 'scenes' ? splitList(v) : v);
        var st = S.storeById[id];
        if (st) st[f] = f === 'scenes' ? splitList(v) : v;
        el.classList.toggle('edited', !!v);
        if (el.__xbox) { el.__xbox.classList.toggle('picked', !!v); xsel(el); }
        if (f === 'manager') renderStoreList();     // 重画一下管理条上的「N 家」
        refreshFiltersAfterEdit();
        $('#profileStat').innerHTML = '已填区域 <b>' +
          S.stores.filter(function (x) { return x.region; }).length + '/' + S.stores.length +
          '</b> 家 · 本机改动 <b>' + HY.StoreEdits.count() + '</b> 家（存在浏览器里，改完记得导出）';
      };
    });
  }
  function splitList(v) {
    return v ? v.split(/[,，、\s]+/).filter(Boolean) : [];
  }
  function val(st, f) {
    var v = st[f];
    return Array.isArray(v) ? v.join('、') : (v || '');
  }
  function cellInput(st, f, ph, listId) {
    var v = val(st, f);
    return '<td><input data-f="' + f + '" class="cellin' + (v ? ' edited' : '') + '" value="' +
      esc(v) + '" placeholder="' + esc(ph) + '"' + (listId ? ' list="' + listId + '"' : '') + '></td>';
  }
  function cellSelect(st, f, opts, labels) {
    var v = val(st, f);
    return '<td><select data-f="' + f + '" class="cellin' + (v ? ' edited' : '') + '">' +
      opts.map(function (o) {
        var lab = labels && labels[o] != null ? labels[o] : (o || '—');
        return '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + esc(lab) + '</option>';
      }).join('') + '</select></td>';
  }

  /** 门店档案改完重画一次（区域/门店类型的筛选器已按用户要求去掉） */
  function refreshFiltersAfterEdit() { fillFilters(); render(); }

  function exportStores() {
    /* 【重要】手机号原文**绝不进导出文件**：它会被提交到公开仓库、发布到 GitHub Pages。
       这里统一换成 phoneHash（见 core.js 的 phoneHash），login.html 比对的就是这个。
       原文只留在你本机 localStorage 的 StoreEdits 里，换台电脑要重新填。 */
    var bad = [];
    var out = S.stores.map(function (st) {
      var o = {};
      Object.keys(st).forEach(function (k) { if (k !== 'phone') o[k] = st[k]; });
      if (st.phone) {
        var hx = HY.phoneHash(st.phone);
        if (hx) o.phoneHash = hx;
        else bad.push(st.storeName + '（' + st.phone + '）');
      }
      return o;
    });
    if (bad.length) {
      HY.toast('这 ' + bad.length + ' 家的手机号不是 11 位，没导出：' + bad.slice(0, 3).join('、') +
               (bad.length > 3 ? ' 等' : ''));
    }
    var blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'stores.json';
    a.click();
    URL.revokeObjectURL(a.href);
    HY.toast('已导出 stores.json，替换到 data/ 里再跑 sync_data.py');
  }

  /* ---------- 导入 ---------- */
  function log(msg, cls) {
    var d = document.createElement('div');
    d.className = cls || '';
    d.textContent = msg;
    $('#log').prepend(d);
  }

  function handleFile(f) {
    if (!f) return;
    log('读取 ' + f.name + ' …');
    var fr = new FileReader();
    fr.onload = function (e) {
      try {
        var wb = XLSX.read(e.target.result, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        // raw:false 让大数按显示文本出来，19 位视频ID 才不会精度丢失
        var rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        var r = HY.rowsToVideos(rows);
        if (!r.videos.length) { log('没解析出有效行，确认是「生意经_视频列表」的导出文件', 'err'); return; }
        var res = HY.Videos.merge(r.videos, f.name);
        log('新增 ' + res.added + ' 条，更新 ' + res.updated + ' 条，累计 ' + res.total +
            ' 条（忽略品牌号 ' + r.skippedBrand + ' 条）', 'ok');
        refreshAll();
      } catch (err) {
        log('解析失败：' + err.message, 'err');
      }
    };
    fr.readAsArrayBuffer(f);
  }

  function renderHint() {
    var n = HY.Videos.list().length;
    if (!n) { $('#datahint').innerHTML = '未导入视频数据'; return; }
    var meta = HY.Videos.meta();
    var last = meta.imports[meta.imports.length - 1];
    var ranges = {};
    S.videos.forEach(function (v) { if (v.rangeFrom) ranges[v.rangeFrom + '~' + v.rangeTo] = 1; });
    $('#datahint').innerHTML = '已累计 <b>' + HY.num(n) + '</b> 条视频<br>统计范围 ' +
      Object.keys(ranges).sort().join('、') +
      (last ? '<br>本机最近导入 ' + new Date(last.at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric',
              hour: '2-digit', minute: '2-digit' }) : '') +
      (window.HY_VIDEOS_PUB ? '<br>线上数据截至 ' + (window.HY_VIDEOS_PUB.upto || '—') : '');
  }

  /* ---------- 效果统计 ---------- */
  /* ---------- 效果统计 ----------
     口径陷阱：播放数只统计导出的「数据日期范围」内，范围外的老视频大量为 0，
     混进来会把均值压垮 —— 所以先按发布时间筛一遍。
     另一个陷阱：平均值会被一条爆款整个带飞，每行都同时给中位数，两个数差得远就说明是个别视频撑的。 */
  var EFF = { dim: 'store', sort: 'medPlay', desc: true };
  var FEW = 5;                       // 少于这么多条就标「样本少」，别拿它下结论

  function median(a) {
    if (!a.length) return 0;
    var b = a.slice().sort(function (x, y) { return x - y; }), n = b.length, h = n >> 1;
    return n % 2 ? b[h] : Math.round((b[h - 1] + b[h]) / 2);
  }
  function aggV(arr) {
    var play = 0, gmv = 0, gk = 0, plays = [];
    arr.forEach(function (v) { play += v.play; gmv += v.gmv; plays.push(v.play); if (!v.noGmv) gk++; });
    return { n: arr.length, gk: gk,   // gk = 有成交金额的条数（只有线上数据的视频没有）
             avgPlay: arr.length ? Math.round(play / arr.length) : 0,
             medPlay: median(plays),
             maxPlay: plays.length ? Math.max.apply(null, plays) : 0,
             gmv: gmv, avgGmv: arr.length ? gmv / arr.length : 0 };
  }
  /** 所有导出文件「数据日期范围」的并集：20260817 -> 2026-08-17 */
  function effRange() {
    var from = null, to = null;
    S.videos.forEach(function (v) {
      if (v.rangeFrom && (!from || v.rangeFrom < from)) from = v.rangeFrom;
      if (v.rangeTo && (!to || v.rangeTo > to)) to = v.rangeTo;
    });
    function dash(x) { return x ? x.slice(0, 4) + '-' + x.slice(4, 6) + '-' + x.slice(6, 8) : null; }
    return { f: dash(from) || '0000-00-00', t: dash(to) || '9999-99-99' };
  }
  function effVideos() {
    var r = effRange();
    return S.videos.filter(function (v) { return v.pubDate >= r.f && v.pubDate <= r.t; });
  }
  function pct(a, b) { return b ? Math.round((a - b) / b * 100) : 0; }
  function signed(n) { return (n >= 0 ? '高 ' : '低 ') + Math.abs(n) + '%'; }

  /* 2026-09-24 整页重做（用户：「我们真实能统计的效果有哪些」→「都改」）。
     原来的「计划日发的 vs 计划外」「按内容方向 / 拍摄形式」都拿掉了：看板只看得到发布日期，
     判断不了视频是不是照脚本拍的，那些分组没有意义。现在只放导出表里真有的东西：
       ① 门店表现（发布天数、断更、播放、千播以上、成交、无标题）  ② 播放 / 成交最高的视频
       ③ 几点发、星期几发      ④ 发得勤有没有用      ⑤ 标题写没写
     比较一律看「一半视频不到」（中位数），平均数会被一条爆款带飞。 */
  var EFF_COLS2 = [
    { k: 'lab', t: '门店', txt: 1 },
    { k: 'n', t: '视频数' },
    { k: 'pubDays', t: '发布天数', fmt: function (x) { return x.pubDays + '/' + x.nDays; } },
    { k: 'gap', t: '最长断更', fmt: function (x) { return x.gap + ' 天'; } },
    { k: 'avgPlay', t: '平均每条播放' },
    { k: 'medPlay', t: '一半视频不到' },
    { k: 'k1', t: '千播以上' },
    { k: 'gmv', t: '成交总额', money: 1 },
    { k: 'noTitle', t: '没写标题' }
  ];
  function effScopeVideos() {
    var mgr = $('#eMgr') ? $('#eMgr').value : '', ok = {};
    S.stores.forEach(function (st) { if (!mgr || (st.manager || '') === mgr) ok[st.douyinId] = st; });
    return { ok: ok, vids: effVideos().filter(function (v) { return ok[v.store]; }) };
  }
  function effDays(r) {
    var out = [];
    for (var d = r.f; d <= r.t; d = HY.ymd(HY.addDays(HY.parseYmd(d), 1))) out.push(d);
    return out;
  }
  function vHour(v) { return v.pubTs ? new Date(v.pubTs).getHours() : null; }
  function hasTitle(v) { return String(v.title || '').trim() !== ''; }

  /** 一组视频 → 条数 / 中位 / 平均，给「几点发」这类小表用 */
  function grpRow(lab, arr, maxMed) {
    var x = aggV(arr), w = maxMed ? Math.round(x.medPlay / maxMed * 100) : 0, few = x.n < FEW;
    return '<tr' + (few ? ' class="dim"' : '') + '><td>' + lab + (few && x.n ? '<span class="few">样本 ' + x.n + ' 条</span>' : '') +
      '</td><td class="mono">' + HY.num(x.n) + '</td><td class="mono">' + HY.num(x.medPlay) +
      '</td><td class="mono">' + HY.num(x.avgPlay) + '</td>' +
      '<td class="barc"><span class="track"><i style="width:' + w + '%"></i></span></td></tr>';
  }
  function grpTable(head, groups) {
    var maxMed = 0;
    groups.forEach(function (g) { if (g[1].length >= FEW) maxMed = Math.max(maxMed, aggV(g[1]).medPlay); });
    return '<table class="mini eff"><thead><tr><th>' + head + '</th><th>视频数</th><th>一半视频不到</th>' +
      '<th>平均每条播放</th><th class="barh">一半视频不到（对比）</th></tr></thead><tbody>' +
      groups.map(function (g) { return grpRow(g[0], g[1], maxMed); }).join('') + '</tbody></table>';
  }

  function renderEffect() {
    if (!S.videos.length) {
      $('#effStores').innerHTML = '<div class="emptyrow">还没有视频数据，先去「视频数据导入」。</div>';
      ['#effTop', '#effWhen', '#effFreq', '#effTitle'].forEach(function (s) { $(s).innerHTML = ''; });
      return;
    }
    var r = effRange(), sc = effScopeVideos(), vids = sc.vids, days = effDays(r);
    var gmvKnown = vids.some(function (v) { return !v.noGmv; });
    $('#effNote').textContent = '统计 ' + HY.md(r.f) + '–' + HY.md(r.t) + ' 发布的 ' + HY.num(vids.length) +
      ' 条视频（抖音导出的统计期，播放只算这段时间内的）';

    /* ① 门店表现 */
    var by = {};
    Object.keys(sc.ok).forEach(function (id) { by[id] = []; });
    vids.forEach(function (v) { by[v.store].push(v); });
    var rows = Object.keys(by).map(function (id) {
      var arr = by[id], x = aggV(arr), dayset = {};
      arr.forEach(function (v) { dayset[v.pubDate] = 1; });
      var gap = 0, run = 0;
      days.forEach(function (d) { if (dayset[d]) run = 0; else { run++; if (run > gap) gap = run; } });
      x.lab = sc.ok[id].storeName; x.pubDays = Object.keys(dayset).length; x.nDays = days.length; x.gap = gap;
      x.k1 = arr.filter(function (v) { return v.play >= 1000; }).length;
      x.noTitle = arr.filter(function (v) { return !hasTitle(v); }).length;
      return x;
    });
    var cols = EFF_COLS2.filter(function (c) { return c.k !== 'gmv' || gmvKnown; });
    if (!cols.some(function (c) { return c.k === EFF.sort; })) EFF.sort = 'medPlay';
    var sk = EFF.sort, dir = EFF.desc ? 1 : -1;
    rows.sort(function (p, q) {
      if (sk === 'lab') return p.lab.localeCompare(q.lab, 'zh') * -dir;
      return (q[sk] - p[sk]) * dir;
    });
    var head = cols.map(function (c) {
      return '<th class="s' + (c.k === sk ? ' on' : '') + '" data-k="' + c.k + '">' + c.t +
        '<i>' + (c.k === sk ? (EFF.desc ? '▾' : '▴') : '▾') + '</i></th>';
    }).join('');
    $('#effStores').innerHTML = '<table class="mini eff"><thead><tr>' + head + '</tr></thead><tbody>' +
      rows.map(function (x) {
        return '<tr>' + cols.map(function (c) {
          if (c.txt) return '<td>' + esc(x.lab) + (x.n < FEW ? '<span class="few">样本 ' + x.n + ' 条</span>' : '') + '</td>';
          var t = c.fmt ? c.fmt(x) : c.money ? '¥' + HY.num(Math.round(x[c.k])) : HY.num(x[c.k]);
          return '<td class="mono' + (x.n < FEW ? ' dim' : '') + '">' + t + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>' +
      '<p class="note" style="margin-top:10px">点表头换排序。「一半视频不到」= 这家店一半的视频播放不到这个数，' +
      '比平均数靠谱（平均数会被一条爆款拉高）。「最长断更」= 统计期里连着几天一条都没发。</p>';
    $$('#effStores th.s').forEach(function (th) {
      th.onclick = function () {
        var k = th.dataset.k;
        if (EFF.sort === k) EFF.desc = !EFF.desc; else { EFF.sort = k; EFF.desc = k !== 'lab'; }
        renderEffect();
      };
    });

    /* ② 播放 / 成交最高的视频 */
    function vlist(arr, key, unit) {
      return '<table class="mini eff vtop"><thead><tr><th>门店</th><th>发布</th><th>标题</th><th>' + unit + '</th><th></th></tr></thead><tbody>' +
        arr.map(function (v) {
          var st = S.storeById[v.store] || {};
          return '<tr><td>' + esc(st.storeName || v.store) + '</td><td class="mono">' + HY.md(v.pubDate) + '</td>' +
            '<td class="tt">' + esc(hasTitle(v) ? v.title : '（没写标题）') + '</td>' +
            '<td class="mono">' + (key === 'gmv' ? '¥' + HY.num(Math.round(v.gmv)) : HY.num(v.play)) + '</td>' +
            '<td>' + (v.url ? '<a href="' + esc(v.url) + '" target="_blank" rel="noopener">打开 ↗</a>' : '') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    var topPlay = vids.slice().sort(function (a, b) { return b.play - a.play; }).slice(0, 10);
    var topGmv = gmvKnown ? vids.filter(function (v) { return v.gmv > 0; })
      .sort(function (a, b) { return b.gmv - a.gmv; }).slice(0, 10) : [];
    $('#effTop').innerHTML = '<h4>播放最高的 10 条</h4>' + vlist(topPlay, 'play', '播放') +
      (gmvKnown
        ? '<h4 style="margin-top:22px">成交最高的 10 条</h4>' + (topGmv.length ? vlist(topGmv, 'gmv', '成交') : '<p class="note">这段时间没有带来成交的视频。</p>')
        : '<p class="note" style="margin-top:14px">成交金额不上线，在本机「视频数据导入」导入 xlsx 后，这里会多一张「成交最高的 10 条」。</p>');

    /* ③ 几点发、星期几发 */
    var HB = [['早上 8 点前', 0, 8], ['上午 8–11 点', 8, 11], ['中午 11–14 点', 11, 14],
              ['下午 14–17 点', 14, 17], ['傍晚 17–20 点', 17, 20], ['晚上 20 点后', 20, 24]];
    var hourG = HB.map(function (b) {
      return [b[0], vids.filter(function (v) { var h = vHour(v); return h != null && h >= b[1] && h < b[2]; })];
    });
    var WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    var wdG = WD.map(function (w, i) {
      return [w, vids.filter(function (v) { return (HY.parseYmd(v.pubDate).getDay() + 6) % 7 === i; })];
    });
    $('#effWhen').innerHTML = '<div class="effgrid"><div>' + grpTable('几点发', hourG) + '</div><div>' +
      grpTable('星期几发', wdG) + '</div></div>';

    /* ④ 发得勤有没有用：每家店每周发几条 → 那一周视频的播放 */
    var wk = {};
    vids.forEach(function (v) {
      var k = v.store + '|' + HY.ymd(HY.monday(HY.parseYmd(v.pubDate)));
      (wk[k] = wk[k] || []).push(v);
    });
    var FB = [['一周 1–2 条', 1, 2], ['一周 3–4 条', 3, 4], ['一周 5–7 条', 5, 7], ['一周 8 条以上', 8, 999]];
    var freqRows = FB.map(function (b) {
      var weeks = Object.keys(wk).map(function (k) { return wk[k]; })
        .filter(function (a) { return a.length >= b[1] && a.length <= b[2]; });
      var all = [].concat.apply([], weeks);
      var wkPlay = weeks.map(function (a) { return a.reduce(function (s, v) { return s + v.play; }, 0); });
      return { lab: b[0], weeks: weeks.length, med: aggV(all).medPlay, wk: median(wkPlay) };
    });
    var maxWk = Math.max.apply(null, freqRows.map(function (x) { return x.weeks >= FEW ? x.wk : 0; })) || 1;
    $('#effFreq').innerHTML = '<table class="mini eff"><thead><tr><th>那一周发了</th><th>店·周数</th>' +
      '<th>每条：一半视频不到</th><th>整周播放（中位）</th><th class="barh">整周播放（对比）</th></tr></thead><tbody>' +
      freqRows.map(function (x) {
        var few = x.weeks < FEW;
        return '<tr' + (few ? ' class="dim"' : '') + '><td>' + x.lab + (few && x.weeks ? '<span class="few">样本 ' + x.weeks + ' 个</span>' : '') +
          '</td><td class="mono">' + x.weeks + '</td><td class="mono">' + HY.num(x.med) + '</td><td class="mono">' + HY.num(x.wk) +
          '</td><td class="barc"><span class="track"><i style="width:' + Math.round(x.wk / maxWk * 100) + '%"></i></span></td></tr>';
      }).join('') + '</tbody></table>' +
      '<p class="note" style="margin-top:10px">把每家店的每一周单独算一次（「店·周」），看发得多的那些周，整周加起来的播放是不是也更多。</p>';

    /* ⑤ 标题 */
    $('#effTitle').innerHTML = grpTable('标题', [
      ['没写标题', vids.filter(function (v) { return !hasTitle(v); })],
      ['写了标题，没带 # 话题', vids.filter(function (v) { return hasTitle(v) && v.title.indexOf('#') === -1; })],
      ['写了标题，带了 # 话题', vids.filter(function (v) { return hasTitle(v) && v.title.indexOf('#') !== -1; })]
    ]);
  }
  function renderEffDim() { renderEffect(); }   // 老调用点（经理下拉）还叫这个名字

  /* ---------- 筛选项 ---------- */
  /* 两个下拉都是「重建式」：经理名字在门店表里改完，这里重新灌一遍就有了 */
  function fillFilters() {
    function uniq(k) {
      var o = {};
      S.stores.forEach(function (x) { if (x[k]) o[x[k]] = 1; });
      return Object.keys(o).sort();
    }
    function fill(sel, all, vals) {
      var keep = sel.multiple ? selValues(sel) : [sel.value];
      sel.innerHTML = '<option value="">' + all + '</option>';
      vals.forEach(function (v) {
        var o = document.createElement('option');
        o.value = v.v; o.textContent = v.t;
        o.selected = keep.indexOf(v.v) !== -1;     // 原来选中的还在就保持
        sel.appendChild(o);
      });
      if (!sel.multiple && selValues(sel).length === 0) sel.value = '';
      sel.disabled = false;
    }
    var mgrOpts = managerNames().map(function (m) { return { v: m, t: m }; });
    fill($('#fMgr'), '全部区域经理', mgrOpts);
    if ($('#eMgr')) fill($('#eMgr'), '全部区域经理', mgrOpts);   // 效果统计那张表也按经理筛
    fillStoreOpts();
    xselAll();
  }

  /* 门店下拉只列当前区域经理名下的店（2026-09-24 用户：选了经理再选店，选到别人的店日历就空了）。
     换经理时，已勾的店不在新经理名下的自动去掉。 */
  function fillStoreOpts() {
    var sel = $('#fStore'), mgr = $('#fMgr').value;
    var keep = selValues(sel);
    var list = S.stores.filter(function (s) { return !mgr || (s.manager || '') === mgr; });
    sel.innerHTML = '<option value="">' + (mgr ? mgr + '的全部门店' : '全部门店') + '</option>';
    list.slice().sort(function (a, c) {
      return a.storeName.localeCompare(c.storeName, 'zh');
    }).forEach(function (s) {
      var o = document.createElement('option');
      o.value = s.douyinId; o.textContent = s.storeName + (s.brandLine ? '（' + s.brandLine + '）' : '');
      o.selected = keep.indexOf(s.douyinId) !== -1;
      sel.appendChild(o);
    });
    sel.disabled = false;
  }

  /* ---------- 自定义下拉（原生 select 在 Mac 上长得跟整站不搭） ----------
     原生 select 留着当数据源和状态，藏起来；外面套一层按钮 + 菜单，样式跟按钮/日历一套：
     直角、1px 线、选中左边一条黑竖条、hover 换浅底。改值后手动派发 change，原有逻辑不用动。 */
  function xselAll() { ['#fMgr', '#fStore', '#eMgr'].forEach(function (s) { xsel($(s)); }); }

  function xsel(sel) {
    if (!sel) return;
    var box = sel.__xbox;
    if (!box) {
      box = document.createElement('div');
      box.className = 'xsel' + (sel.classList.contains('cellin') ? ' mini' : '');
      box.innerHTML = '<button type="button" class="xbtn"><span class="xv"></span><i>▾</i></button>' +
                      '<div class="xmenu"></div>';
      sel.parentNode.insertBefore(box, sel);
      box.appendChild(sel);
      sel.__xbox = box;
      box.querySelector('.xbtn').onclick = function (e) {
        e.stopPropagation();
        var wasOpen = box.classList.contains('open');
        closeAllXsel();
        if (!wasOpen) {
          box.classList.add('open');
          placeMenu(box);
          var on = box.querySelector('.xmenu a.on');
          if (on) on.scrollIntoView({ block: 'nearest' });
        }
      };
      document.addEventListener('click', closeAllXsel);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeAllXsel(); });
      // 手机上滑动时地址栏伸缩会触发 resize，只有宽度真变了才收
      var lastW = window.innerWidth;
      window.addEventListener('resize', function () {
        if (window.innerWidth !== lastW) { lastW = window.innerWidth; closeAllXsel(); }
      });
      // 表格滚动时把菜单收掉 —— 但菜单自己里面的滚动不算，否则门店多选菜单一滑就关，
      // 手机上根本划不下去（2026-09-24 用户：「这里没法上下滑动？」）
      document.addEventListener('scroll', function (e) {
        if (e.target && e.target.closest && e.target.closest('.xmenu')) return;
        closeAllXsel();
      }, true);
    }
    var menu = box.querySelector('.xmenu');
    var multi = sel.multiple, vals = selValues(sel);
    // 多选勾了两家以上，菜单顶上钉一个「清空」（2026-09-24 用户要一键清空；原来的「全部门店」滑下去就找不到了）
    menu.innerHTML = (multi && vals.length > 1 ? '<a data-v="" class="clr">✕ 清空已选的 ' + vals.length + ' 家</a>' : '') +
      Array.prototype.map.call(sel.options, function (o) {
      if (o.value === '') {                                  // 「全部 xx」= 清空选择
        return '<a data-v="" class="' + (vals.length ? '' : 'on') + '">' + esc(o.textContent) + '</a>';
      }
      var on = multi ? vals.indexOf(o.value) !== -1 : o.value === sel.value;
      return '<a data-v="' + esc(o.value) + '" class="' + (on ? 'on' : '') + (multi ? ' ck' : '') + '">' +
             (multi ? '<i class="box"></i>' : '') + esc(o.textContent) + '</a>';
    }).join('') +
    (sel.id === 'fMgr' ? '<a class="more" data-go="stores">＋ 新增 / 管理区域经理</a>' : '');

    box.querySelector('.xv').textContent = multi
      ? (vals.length === 0 ? sel.options[0].textContent
         : vals.length === 1 ? labelOf(sel, vals[0])
         : '已选 ' + vals.length + ' 家')
      : (sel.options[sel.selectedIndex] ? sel.options[sel.selectedIndex].textContent : '');
    box.classList.toggle('picked', multi ? vals.length > 0 : !!sel.value);
    if (box.classList.contains('open')) placeMenu(box);

    Array.prototype.forEach.call(menu.children, function (a) {
      a.onclick = function (e) {
        e.stopPropagation();
        if (a.dataset.go) { closeAllXsel(); openMgrModal(); return; }
        var v = a.dataset.v;
        if (multi) {
          if (v === '') {                                    // 点「全部门店」= 全清
            Array.prototype.forEach.call(sel.options, function (o) { o.selected = false; });
          } else {
            Array.prototype.forEach.call(sel.options, function (o) {
              if (o.value === v) o.selected = !o.selected;
            });
          }
          xsel(sel);                                         // 多选时菜单不关，接着勾
          box.classList.add('open');
        } else {
          sel.value = v;
          closeAllXsel();
          xsel(sel);
        }
        sel.dispatchEvent(new Event('change'));
      };
    });
  }
  function selValues(sel) {
    if (!sel) return [];
    if (!sel.multiple) return sel.value ? [sel.value] : [];
    return Array.prototype.filter.call(sel.options, function (o) { return o.selected && o.value; })
      .map(function (o) { return o.value; });
  }
  function labelOf(sel, v) {
    var hit = Array.prototype.filter.call(sel.options, function (o) { return o.value === v; })[0];
    return hit ? hit.textContent : v;
  }

  /** 菜单是 position:fixed，开的时候按按钮位置摆，空间不够就往上开 */
  function placeMenu(box) {
    var btn = box.querySelector('.xbtn'), menu = box.querySelector('.xmenu');
    var r = btn.getBoundingClientRect();
    menu.style.minWidth = Math.max(r.width, 150) + 'px';
    menu.style.left = Math.min(r.left, window.innerWidth - Math.max(r.width, 150) - 12) + 'px';
    var below = window.innerHeight - r.bottom, want = Math.min(menu.scrollHeight || 260, 340);
    if (below < want + 12 && r.top > below) {
      menu.style.top = ''; menu.style.bottom = (window.innerHeight - r.top + 1) + 'px';
      menu.style.maxHeight = Math.min(340, r.top - 12) + 'px';
    } else {
      menu.style.bottom = ''; menu.style.top = (r.bottom - 1) + 'px';
      menu.style.maxHeight = Math.min(340, below - 12) + 'px';
    }
  }

  function closeAllXsel() {
    $$('.xsel.open').forEach(function (x) { x.classList.remove('open'); });
  }

  /* ---------- 区域经理管理弹窗：左边名单增删，右边勾他负责的门店 ---------- */
  var mmPick = '';                                  // 当前选中的经理

  function openMgrModal() {
    var names = managerNames();
    if (names.indexOf(mmPick) === -1) mmPick = names[0] || '';
    $('#mgrModal').classList.add('open');
    $('#backdrop').classList.add('on');
    mmRender();
    $('#mmNew').focus();
  }
  function closeMgrModal() {
    $('#mgrModal').classList.remove('open');
    $('#backdrop').classList.remove('on');
    fillFilters();
    renderStoreList();
    render();
  }

  function mmCounts() {
    var o = {};
    S.stores.forEach(function (x) { if (x.manager) o[x.manager] = (o[x.manager] || 0) + 1; });
    return o;
  }

  function mmRender() {
    var names = managerNames(), cnt = mmCounts();

    $('#mmList').innerHTML = names.length
      ? names.map(function (m) {
          return '<div class="row' + (m === mmPick ? ' on' : '') + '" data-m="' + esc(m) + '">' +
            '<span class="nm">' + esc(m) + '</span>' +
            '<span class="n">' + (cnt[m] || 0) + ' 家</span>' +
            '<button class="x" data-del="' + esc(m) + '" title="删掉这个名字">×</button></div>';
        }).join('')
      : '<div class="empty">还没有经理，上面加一个</div>';

    $('#mmWho').textContent = mmPick ? ('「' + mmPick + '」负责的门店' + (cnt[mmPick] ? '（' + cnt[mmPick] + ' 家）' : '')) : '先选左边一个经理';

    var q = $('#mmSearch').value.trim();
    var list = S.stores.slice().sort(function (a, c) { return a.storeName.localeCompare(c.storeName, 'zh'); });
    if (q) list = list.filter(function (s) {
      return (s.storeName + s.douyinId + (s.brandLine || '')).indexOf(q) !== -1;
    });
    $('#mmStores').innerHTML = !mmPick
      ? '<div class="empty">选一个经理，再在这里勾门店</div>'
      : (list.length
          ? list.map(function (s) {
              var mine = s.manager === mmPick, other = s.manager && !mine;
              return '<label' + (other ? ' class="taken"' : '') + '>' +
                '<input type="checkbox" data-id="' + s.douyinId + '"' + (mine ? ' checked' : '') + '>' +
                '<span>' + esc(s.storeName) + (s.brandLine ? '（' + esc(s.brandLine) + '）' : '') + '</span>' +
                '<span class="own">' + (other ? '现归 ' + esc(s.manager) : (mine ? '✓' : '')) + '</span></label>';
            }).join('')
          : '<div class="empty">没有匹配的门店</div>');

    var noMgr = S.stores.filter(function (s) { return !s.manager; }).length;
    $('#mmStat').textContent = '共 ' + S.stores.length + ' 家门店，' +
      (noMgr ? '还有 ' + noMgr + ' 家没分配' : '已全部分配');

    $$('#mmList .row').forEach(function (el) {
      el.onclick = function (e) {
        if (e.target.dataset.del) return;
        mmPick = el.dataset.m;
        mmRender();
      };
    });
    $$('#mmList .x').forEach(function (el) {
      el.onclick = function (e) {
        e.stopPropagation();
        var m = el.dataset.del, n = cnt[m] || 0;
        if (n && !confirm('「' + m + '」名下还有 ' + n + ' 家门店，删掉名字会把这些门店的区域经理清空。继续？')) return;
        HY.Managers.remove(m);
        S.stores.forEach(function (st) {
          if (st.manager === m) { st.manager = ''; HY.StoreEdits.set(st.douyinId, 'manager', ''); }
        });
        if (mmPick === m) mmPick = managerNames()[0] || '';
        mmRender();
      };
    });
    $$('#mmStores input[type=checkbox]').forEach(function (cb) {
      cb.onchange = function () {
        var st = S.storeById[cb.dataset.id];
        if (!st) return;
        st.manager = cb.checked ? mmPick : '';
        HY.StoreEdits.set(st.douyinId, 'manager', st.manager);
        mmRender();
      };
    });
  }

  function bindMgrModal() {
    function add() {
      var v = $('#mmNew').value.trim();
      if (!v) return;
      if (!HY.Managers.add(v)) { HY.toast('「' + v + '」已经在名单里了'); return; }
      $('#mmNew').value = '';
      mmPick = v;                       // 加完直接选中，接着就能勾店
      mmRender();
    }
    $('#mmAdd').onclick = add;
    $('#mmNew').onkeydown = function (e) { if (e.key === 'Enter') add(); };
    $('#mmSearch').oninput = mmRender;
    $('#mmDone').onclick = closeMgrModal;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && $('#mgrModal').classList.contains('open')) closeMgrModal();
    });
  }

  /* ---------- 面板切换 ---------- */
  var TITLES = { board: '脚本日历', stores: '门店列表', import: '视频数据导入', effect: '效果统计' };
  function hashView() {
    var m = /(?:^|[#&])view=([a-z]+)/.exec(location.hash || '');
    return m && TITLES[m[1]] ? m[1] : 'board';
  }
  function showPanel(name) {
    if (!TITLES[name]) name = 'board';
    // 注意：hash 不能直接写 '#board'，页面里有 id="board" 的表格，浏览器会跳着滚过去
    if (hashView() !== name) history.replaceState(null, '', '#view=' + name);
    $$('.panel').forEach(function (p) { p.classList.toggle('on', p.id === 'p-' + name); });
    $$('.nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.panel === name); });
    var ttl = $('#ttl');
    if (ttl) ttl.textContent = TITLES[name] || '';   // 顶栏已去掉，这里容错
    if (name === 'effect') renderEffect();
    if (name === 'stores') renderStoreList();
  }

  function refreshAll() {
    recompute();
    render();
    renderHint();
    renderHeroSub();
    if ($('#p-effect').classList.contains('on')) renderEffect();
    if ($('#p-stores').classList.contains('on')) renderStoreList();
  }

  /* 「动效」开关 2026-09-21 删掉（用户：「这个已经没了吧」）。
     背景动效早就整个取消了，body.fxon 这个类没有任何样式挂着，
     按钮点了什么都不会发生。它一直没露出来，是因为被
     `body.hasfx .fxbtn{display:none}` 藏着；顶栏一拆 hasfx 没了，它就冒出来了。
     ——**删掉没用的功能，别留着一个点了没反应的按钮。** */

  function renderHeroSub() {
    var el = $('#heroSub');
    if (el) el.remove();
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $$('.nav a').forEach(function (a) {
      a.onclick = function () { showPanel(a.dataset.panel); };
    });
    bindMgrModal();
    var bi = $('#btnImport');                  // 侧栏那个重复的「导入视频数据」按钮已删，留个保护
    if (bi) bi.onclick = function () { showPanel('import'); };

    // 侧栏折叠，状态记在 localStorage，下次打开保持
    var NAVKEY = 'hymn_navhide';
    function setNav(hide) {
      document.body.classList.toggle('navhide', hide);
      $('#navTog').title = hide ? '展开侧栏' : '收起侧栏';
      try { localStorage.setItem(NAVKEY, hide ? '1' : '0'); } catch (e) {}
    }
    setNav(localStorage.getItem(NAVKEY) === '1');
    $('#navTog').onclick = function () { setNav(!document.body.classList.contains('navhide')); };

    $('#dClose').onclick = closeDrawer;
    $('#backdrop').onclick = function () {
      if ($('#mgrModal').classList.contains('open')) closeMgrModal();
      else if ($('#posterModal').classList.contains('open')) closePoster();
      else closeDrawer();
    };
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

    ['#fStore', '#fLate'].forEach(function (s) { $(s).onchange = render; });
    $('#fMgr').onchange = function () { fillStoreOpts(); xsel($('#fStore')); render(); };

    // 效果统计：维度切换 + 按经理筛（只重画那张表，别惊动日历）
    $$('#effDims .segbtn').forEach(function (b) {
      b.onclick = function () {
        EFF.dim = b.dataset.dim;
        EFF.sort = 'avgPlay'; EFF.desc = true;
        $$('#effDims .segbtn').forEach(function (x) { x.classList.toggle('on', x === b); });
        renderEffDim();
      };
    });
    if ($('#eMgr')) $('#eMgr').onchange = renderEffDim;
    // 搜索框：中文输入法打拼音时（compositionstart~end）先别动，输完再筛；
    // 否则「qn」这种半截拼音也会当成关键词，整页跟着闪（用户 2026-09-17 反馈）
    var si = $('#fSearch'), composing = false, timer = null;
    function schedule() { clearTimeout(timer); timer = setTimeout(render, 180); }
    si.addEventListener('compositionstart', function () { composing = true; });
    si.addEventListener('compositionend', function () { composing = false; schedule(); });
    si.oninput = function () { if (!composing) schedule(); };

    $('#drop').onclick = function () { $('#file').click(); };
    $('#file').onchange = function () { handleFile(this.files[0]); this.value = ''; };
    ['dragenter', 'dragover'].forEach(function (ev) {
      $('#drop').addEventListener(ev, function (e) { e.preventDefault(); this.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      $('#drop').addEventListener(ev, function (e) { e.preventDefault(); this.classList.remove('over'); });
    });
    $('#drop').addEventListener('drop', function (e) {
      if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]);
    });

    $('#btnExportBak').onclick = function () {
      var o = HY.Videos.read();
      var blob = new Blob([JSON.stringify(o)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = '赫眉视频数据备份_' + HY.ymd(new Date()).replace(/-/g, '') + '.json';
      a.click();
      URL.revokeObjectURL(a.href);
      log('已导出备份（' + HY.num(HY.Videos.list().length) + ' 条）', 'ok');
    };
    $('#btnImportBak').onclick = function () { $('#fileBak').click(); };
    $('#fileBak').onchange = function () {
      var f = this.files[0]; this.value = '';
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function (e) {
        try {
          var o = JSON.parse(e.target.result);
          if (!o.videos) throw new Error('不是本看板导出的备份文件');
          var arr = Object.keys(o.videos).map(function (k) { return o.videos[k]; });
          var res = HY.Videos.merge(arr, f.name);   // 合并而不是覆盖，更安全
          log('从备份合并：新增 ' + res.added + '，更新 ' + res.updated + '，累计 ' + res.total, 'ok');
          refreshAll();
        } catch (err) { log('备份导入失败：' + err.message, 'err'); }
      };
      fr.readAsText(f);
    };
    $('#btnExportStores').onclick = exportStores;
    $('#btnResetStores').onclick = function () {
      if (!window.confirm('清掉本机对门店档案的所有修改，回到 data/stores.json 的内容？')) return;
      HY.StoreEdits.clear();
      location.reload();
    };

    $('#btnClear').onclick = function () {
      if (!window.confirm('确定清空这个浏览器里累计的全部视频数据？建议先导出备份。')) return;
      HY.Videos.clear();
      refreshAll();
      log('已清空视频数据', 'err');
    };
  }

  /* ---------- 生成战报图（2026-09-24 用户：选某一天 / 某一周 / 某一月 + 某几家店，
     把完成率这些数据生成图片发微信群，要有赫眉的品牌感） ----------
     门店范围 = 看板当前的筛选结果（区域经理 / 门店多选 / 搜索），弹窗里只选时间。
     直接用 Canvas 画（不引第三方截图库），输出 1080px 宽的 PNG。
     口径：
       - 应发 = 范围内计划日期 <= 数据截至日 的脚本（抖音导出只到前一天，截至日之后的还没法判断，不算逾期）
       - 完成率 = 当天发了的 ÷ 应发，跟看板一致
       - 范围内一条脚本都没到期（比如脚本开排之前的日子）→ 改算「发布率」= 有发视频的天数 ÷ 天数 */
  var PST = { mode: 'week', date: '' };

  function pstRange() {
    var d = HY.parseYmd(PST.date), from, to, title;
    if (PST.mode === 'day') {
      from = to = PST.date;
      title = (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    } else if (PST.mode === 'week') {
      from = HY.ymd(HY.monday(d)); to = HY.ymd(HY.addDays(HY.parseYmd(from), 6));
      var f = HY.parseYmd(from), t = HY.parseYmd(to);
      title = (f.getMonth() + 1) + '/' + f.getDate() + ' – ' + (t.getMonth() + 1) + '/' + t.getDate() + ' 这一周';
    } else {
      var g = HY.buildMonthGrid(HY.ymOf(PST.date));
      from = g.from; to = g.to;
      title = d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月';
    }
    return { from: from, to: to, title: title };
  }

  /** 视频数据截到哪天：各导出文件「数据日期范围」终点里最晚的，再不晚于昨天 */
  function pstCutoff() {
    var t = '';
    S.videos.forEach(function (v) { if (v.rangeTo && v.rangeTo > t) t = v.rangeTo; });
    var y = HY.ymd(HY.addDays(HY.parseYmd(S.today), -1));
    var c = /^\d{8}$/.test(t) ? t.slice(0, 4) + '-' + t.slice(4, 6) + '-' + t.slice(6) : y;
    return c < y ? c : y;
  }

  function pstScope(rows) {
    var mgr = $('#fMgr').value, picked = selValues($('#fStore'));
    if (picked.length) return '已选 ' + rows.length + ' 家店';
    if (mgr) return mgr + ' · ' + rows.length + ' 家店';
    return rows.length === S.stores.length ? '全部 ' + rows.length + ' 家店' : rows.length + ' 家店';
  }

  function pstData() {
    var rows = filtered(), r = pstRange(), cut = pstCutoff();
    var ids = {}; rows.forEach(function (st) { ids[st.douyinId] = 1; });
    var per = {};
    rows.forEach(function (st) { per[st.douyinId] = { st: st, due: 0, done: 0, vids: 0, days: {} }; });
    S.scripts.forEach(function (s) {
      if (!ids[s.store] || s.date < r.from || s.date > r.to || s.date > cut) return;
      var o = per[s.store]; o.due++;
      if (S.m.byScript[s.id]) o.done++;
    });
    S.videos.forEach(function (v) {
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
             nDays: nDays, scope: pstScope(rows), future: r.from > cut };
  }

  var pstLogo = null;
  function pstLoadLogo() {
    if (pstLogo) return Promise.resolve(pstLogo);
    return new Promise(function (ok) {
      var im = new Image();
      im.onload = function () { pstLogo = im; ok(im); };
      im.onerror = function () { ok(null); };
      im.src = 'assets/logo-ink.png';
    });
  }

  function pstDraw(D, logo) {
    var W = 540, PAD = 36, ROW = 38, S2 = 2;
    var C = { ink: '#16140F', t2: '#4A453C', t3: '#9C958A', line: '#E3DFD6', done: TILE_C.done,
              late: TILE_C.late, track: '#EFEBE3', paper: '#FAF7F2', pink: '#D9A6AE' };
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

    // 头部：logo + STUDIO / 右边小字标签
    var y = 44;
    if (logo) g.drawImage(logo, PAD, y - 16, 84, 84 * logo.height / logo.width);
    else { g.fillStyle = C.ink; g.font = '600 18px ' + SANS; g.fillText('赫眉 HYMN', PAD, y); }
    g.font = '10px ' + SANS; g.fillStyle = C.t3; g.textAlign = 'right';
    pstSpaced(g, '抖音视频发布战报', W - PAD, y, 2.5, 'right');
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
    pstSpaced(g, '门店排名', PAD, y + 26, 2);
    g.textAlign = 'right';
    g.fillText(D.mode === 'rate' ? '完成率 · 已发/应发 · 视频' : '发布率 · 发布天数 · 视频', W - PAD, y + 26);
    g.textAlign = 'left';

    // 门店行
    y += 44;
    var nameW = 150, barX = PAD + 28 + nameW, barW = 150;
    D.list.forEach(function (o, i) {
      var cy = y + i * ROW;
      if (i % 2 === 1) { g.fillStyle = C.paper; g.fillRect(PAD - 8, cy, W - PAD * 2 + 16, ROW); }
      var mid = cy + ROW / 2 + 4;
      var rank = i + 1;
      g.fillStyle = rank <= 3 && o.p ? C.done : C.t3; g.font = '15px ' + NUM; g.textAlign = 'right';
      g.fillText(String(rank), PAD + 18, mid);
      g.textAlign = 'left'; g.fillStyle = C.ink; g.font = '13px ' + SANS;
      g.fillText(pstFit(g, o.st.storeName, nameW - 8), PAD + 28, mid);
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
    pstSpaced(g, 'HYMN STUDIO', W - PAD, y + 6, 3, 'right');
    return cv;
  }
  /** 字距拉开的小字（canvas 的 letterSpacing 老浏览器没有，手动一个字一个字画） */
  function pstSpaced(g, text, x, y, sp, align) {
    var chars = text.split(''), w = 0;
    chars.forEach(function (c) { w += g.measureText(c).width + sp; });
    w -= sp;
    var cx = align === 'right' ? x - w : x, old = g.textAlign;
    g.textAlign = 'left';
    chars.forEach(function (c) { g.fillText(c, cx, y); cx += g.measureText(c).width + sp; });
    g.textAlign = old;
  }
  function pstFit(g, s, w) {
    if (g.measureText(s).width <= w) return s;
    while (s.length > 1 && g.measureText(s + '…').width > w) s = s.slice(0, -1);
    return s + '…';
  }

  var pstCanvas = null;
  function pstRender() {
    $$('#pstModes .segbtn').forEach(function (b) { b.classList.toggle('on', b.dataset.m === PST.mode); });
    var D = pstData();
    $('#pstInfo').textContent = D.r.from + ' ~ ' + D.r.to + ' · ' + D.scope +
      '（门店范围跟看板上的筛选走）' + (D.future ? ' · 这段时间还没有视频数据' : '');
    pstLoadLogo().then(function (logo) {
      pstCanvas = pstDraw(D, logo);
      var box = $('#pstPreview');
      box.innerHTML = '';
      pstCanvas.style.width = '100%';
      box.appendChild(pstCanvas);
    });
  }
  function pstFileName() {
    var r = pstRange();
    return '赫眉视频战报_' + r.from + (r.to !== r.from ? '_' + r.to : '') + '.png';
  }
  function openPoster() {
    if (!PST.date) PST.date = pstCutoff();
    $('#pstDate').value = PST.date;
    $('#posterModal').classList.add('open');
    $('#backdrop').classList.add('on');
    pstRender();
  }
  function closePoster() {
    $('#posterModal').classList.remove('open');
    $('#backdrop').classList.remove('on');
  }
  function bindPoster() {
    $('#btnPoster').onclick = openPoster;
    $('#pstClose').onclick = closePoster;
    $$('#pstModes .segbtn').forEach(function (b) {
      b.onclick = function () { PST.mode = b.dataset.m; pstRender(); };
    });
    $('#pstDate').onchange = function () { if (this.value) { PST.date = this.value; pstRender(); } };
    $('#pstDownload').onclick = function () {
      if (!pstCanvas) return;
      try {
        var a = document.createElement('a');
        a.download = pstFileName();
        a.href = pstCanvas.toDataURL('image/png');
        a.click();
      } catch (e) { HY.toast('下载失败：请用线上网址打开看板再试'); }
    };
    $('#pstCopy').onclick = function () {
      if (!pstCanvas) return;
      if (!navigator.clipboard || !window.ClipboardItem) { HY.toast('这个浏览器不支持复制图片，请用「下载图片」'); return; }
      pstCanvas.toBlob(function (blob) {
        navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
          .then(function () { HY.toast('已复制，去微信里粘贴就行'); })
          .catch(function () { HY.toast('复制失败，请用「下载图片」'); });
      }, 'image/png');
    };
  }

  /* ---------- 启动 ---------- */
  HY.loadData().then(function (d) {
    S.stores = d.stores; S.storeById = d.storeById; S.scripts = d.scripts;
    S.scripts.forEach(function (s) { S.scriptById[s.id] = s; });
    fillFilters();
    bind();
    bindPoster();
    refreshAll();
    showPanel(hashView());
    window.addEventListener('hashchange', function () { showPanel(hashView()); });
    HY.bootDone();
  }).catch(function (e) {
    $('#board').innerHTML = '<tbody><tr><td class="emptyrow">数据加载失败：' + esc(e.message) + '</td></tr></tbody>';
    HY.bootDone();
  });
})();
