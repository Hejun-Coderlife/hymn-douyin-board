/* 总部看板 */
(function () {
  'use strict';

  var S = {
    stores: [], storeById: {}, scripts: [], videos: [],
    weeks: [], today: HY.ymd(new Date()), m: null,
    freeByStoreWeek: {}, freeByStore: {}
  };

  var $ = function (s) { return document.querySelector(s); };

  /* ---------- 计算 ---------- */
  function recompute() {
    S.weeks = HY.buildWeeks(new Date(), HY.WEEKS);
    S.videos = HY.Videos.list();
    S.m = HY.match(S.scripts, S.videos);

    // 自由发挥视频按 门店 / 周 归类
    S.freeByStoreWeek = {};
    S.freeByStore = {};
    S.m.free.forEach(function (v) {
      if (!v.pubDate) return;
      (S.freeByStore[v.store] = S.freeByStore[v.store] || []).push(v);
      var mon = HY.ymd(HY.monday(HY.parseYmd(v.pubDate)));
      var k = v.store + '|' + mon;
      (S.freeByStoreWeek[k] = S.freeByStoreWeek[k] || []).push(v);
    });
  }

  /** 某店某周的脚本（按日期） */
  function scriptsOf(storeId, weekMon) {
    var sun = HY.ymd(HY.addDays(HY.parseYmd(weekMon), 6));
    return S.scripts.filter(function (s) {
      return s.store === storeId && s.date >= weekMon && s.date <= sun;
    }).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function statusOfScript(s) {
    return HY.statusOf(s, S.m.byScript[s.id], S.today);
  }

  /** 只统计落在 13 周窗口内的脚本 */
  function windowScripts() {
    var from = S.weeks[0].monday, to = S.weeks[S.weeks.length - 1].sunday;
    return S.scripts.filter(function (s) { return s.date >= from && s.date <= to; });
  }

  /* ---------- 概览 ---------- */
  function renderKpis(rows) {
    var visible = {};
    rows.forEach(function (st) { visible[st.douyinId] = 1; });
    var ws = windowScripts().filter(function (s) { return visible[s.store]; });
    var c = { done: 0, guess: 0, late: 0, todo: 0 };
    ws.forEach(function (s) { c[statusOfScript(s)]++; });
    var due = c.done + c.guess + c.late;            // 已到计划日期的
    var rate = due ? Math.round((c.done + c.guess) / due * 100) : 0;
    var freeCount = 0;
    rows.forEach(function (st) { freeCount += (S.freeByStore[st.douyinId] || []).length; });

    $('#kpis').innerHTML = [
      kpi('完成率（已到期）', rate + '<small>%</small>', ''),
      kpi('已发布', c.done + c.guess, 'done'),
      kpi('逾期未发', c.late, 'late'),
      kpi('待拍', c.todo, ''),
      kpi('自由发挥视频', HY.num(freeCount), ''),
      kpi('在看板门店', rows.length + '<small>/' + S.stores.length + '</small>', '')
    ].join('');

    // 逾期排行
    var late = {};
    ws.forEach(function (s) {
      if (statusOfScript(s) === 'late') late[s.store] = (late[s.store] || 0) + 1;
    });
    var arr = Object.keys(late).map(function (k) { return { id: k, n: late[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 12);
    $('#ranks').innerHTML = arr.length ? arr.map(function (x) {
      var st = S.storeById[x.id] || {};
      return '<div class="row" data-store="' + x.id + '"><span>' + (st.storeName || x.id) +
             '</span><b>' + x.n + '</b></div>';
    }).join('') : '<div class="empty">没有逾期，或还没导入视频数据</div>';
    Array.prototype.forEach.call($('#ranks').querySelectorAll('.row'), function (el) {
      el.onclick = function () {
        $('#fSearch').value = (S.storeById[el.dataset.store] || {}).storeName || '';
        render();
      };
    });
  }
  function kpi(lab, val, cls) {
    return '<div class="kpi ' + cls + '"><div class="lab">' + lab + '</div><div class="val mono">' + val + '</div></div>';
  }

  /* ---------- 大表 ---------- */
  function filtered() {
    var q = $('#fSearch').value.trim();
    var reg = $('#fRegion').value, typ = $('#fType').value, line = $('#fLine').value;
    var onlyLate = $('#fLate').checked;
    return S.stores.filter(function (st) {
      if (reg && st.region !== reg) return false;
      if (typ && st.storeType !== typ) return false;
      if (line && (st.brandLine || '') !== line) return false;
      if (q && (st.storeName + st.accountName + st.douyinId).indexOf(q) === -1) return false;
      if (onlyLate) {
        var has = windowScripts().some(function (s) {
          return s.store === st.douyinId && statusOfScript(s) === 'late';
        });
        if (!has) return false;
      }
      return true;
    });
  }

  function render() {
    var rows = filtered();
    renderKpis(rows);

    var showArchive = $('#fArchive').checked;
    var weeks = S.weeks.slice();
    if (showArchive) {
      // 往前补：有脚本的历史周
      var firstMon = S.weeks[0].monday, mons = {};
      S.scripts.forEach(function (s) {
        var m = HY.ymd(HY.monday(HY.parseYmd(s.date)));
        if (m < firstMon) mons[m] = 1;
      });
      var past = Object.keys(mons).sort().map(function (m, i) {
        return { i: i - Object.keys(mons).length + 1, monday: m, sunday: HY.ymd(HY.addDays(HY.parseYmd(m), 6)), archived: true };
      });
      weeks = past.concat(weeks);
    }

    var thisMon = HY.ymd(HY.monday(new Date()));
    var head = '<thead><tr><th class="stcol">门店 <span style="color:var(--soft);font-weight:400">(' + rows.length + ')</span></th>';
    weeks.forEach(function (w) {
      head += '<th class="' + (w.monday === thisMon ? 'now' : '') + (w.archived ? ' arch' : '') + '">' +
        '<span class="wk">' + (w.archived ? '归档' : 'W' + w.i) + '</span>' +
        '<span class="dt">' + HY.md(w.monday) + '–' + HY.md(w.sunday) + '</span></th>';
    });
    head += '</tr></thead>';

    var body = '<tbody>';
    if (!rows.length) {
      body += '<tr><td class="empty-note" colspan="' + (weeks.length + 1) + '">没有符合筛选条件的门店</td></tr>';
    }
    rows.forEach(function (st) {
      body += '<tr><td class="stcol"><div class="nm">' + st.storeName + '</div>' +
        '<div class="meta">' + (st.brandLine ? '<span class="bl">' + st.brandLine + '</span>' : '') +
        '<span class="mono">' + st.douyinId + '</span>' +
        '<a class="mob" href="store.html?store=' + st.douyinId + '" target="_blank">门店页 ↗</a></div></td>';
      weeks.forEach(function (w) {
        var list = scriptsOf(st.douyinId, w.monday);
        var cls = 'cell' + (w.monday === thisMon ? ' nowcol' : '');
        body += '<td class="' + cls + '">';
        if (!list.length) {
          var startsLater = st.startDate && w.sunday < st.startDate;
          body += '<div class="chip void">' + (startsLater ? '未开号' : '—') + '</div>';
        } else {
          list.forEach(function (s) {
            var stt = statusOfScript(s);
            body += '<button class="chip ' + stt + '" data-id="' + s.id + '">' +
              '<span class="tp"><span class="d mono">' + HY.md(s.date) + '</span>' + s.topic + '</span></button>';
          });
        }
        var free = S.freeByStoreWeek[st.douyinId + '|' + w.monday];
        if (free && free.length) {
          body += '<span class="free" data-free="' + st.douyinId + '|' + w.monday + '">+ ' + free.length + ' 自由发挥</span>';
        }
        body += '</td>';
      });
      body += '</tr>';
    });
    body += '</tbody>';

    $('#board').innerHTML = head + body;
    Array.prototype.forEach.call($('#board').querySelectorAll('.chip[data-id]'), function (el) {
      el.onclick = function () { openScript(el.dataset.id); };
    });
    Array.prototype.forEach.call($('#board').querySelectorAll('.free[data-free]'), function (el) {
      el.onclick = function () { openFree(el.dataset.free); };
    });
  }

  /* ---------- 侧栏 ---------- */
  function openDrawer() { $('#drawer').classList.add('open'); $('#backdrop').classList.add('on'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#backdrop').classList.remove('on'); }

  function openScript(id) {
    var s = S.scripts.filter(function (x) { return x.id === id; })[0];
    if (!s) return;
    var st = S.storeById[s.store] || {};
    var m = S.m.byScript[s.id];
    var stt = HY.statusOf(s, m, S.today);

    $('#dTitle').textContent = st.storeName + '｜' + s.topic;
    $('#dSub').innerHTML = '计划 ' + s.date + ' · ' + s.format + ' · <span class="mono">' + s.id + '</span>';

    var h = '<div><span class="tagline" id="copyTag" title="点击复制">' + s.tag + '</span>' +
            '<span style="font-size:12px;color:var(--soft);margin-left:8px">发布时必须带上这个话题标签</span></div>';

    h += '<div class="statusbox"><div class="s ' + stt + '">' + HY.STATUS_CN[stt] + '</div>';
    if (m) {
      var v = m.video;
      h += '<a class="vlink" href="' + v.url + '" target="_blank" rel="noopener">' +
           (v.title || '（无标题）') + ' ↗</a>' +
           '<div class="vmeta mono">发布 ' + v.pubDate + ' · 播放 ' + HY.num(v.play) +
           ' · 成交 ¥' + HY.num(v.gmv) + '</div>';
      if (m.type === 'guess') {
        h += '<div class="vmeta">※ 推测匹配：标题里没有该标签，只是发布时间落在计划周内</div>';
      }
    } else if (stt === 'late') {
      h += '<div class="vmeta">计划日期已过，没有匹配到视频。若已拍请检查标题是否带标签，或重新导入最新数据。</div>';
    } else {
      h += '<div class="vmeta">还没到计划日期。</div>';
    }
    h += '</div>';

    h += '<div class="sechead">基本信息</div>';
    h += field('痛点', s.pain || '—') + field('内容方向', s.topic) + field('拍摄形式', s.format) +
         field('参考标题', s.title || '—') + field('BGM', s.bgm || '—') +
         field('道具', (s.props || []).join('、') || '—');

    h += '<div class="sechead">开头 3 秒</div><div style="font-size:14px">' + (s.hook || '—') + '</div>';

    h += '<div class="sechead">分镜</div>';
    (s.shots || []).forEach(function (sh, i) {
      h += '<div class="shot"><div class="n">' + (i + 1) + '</div><div><div class="sc">' + sh.scene +
           '</div><div class="ln">' + (sh.line || '') + '</div></div>' +
           '<div class="sec mono">' + (sh.sec || 0) + 's</div></div>';
    });

    h += '<div class="sechead">结尾引导</div><div style="font-size:14px">' + (s.cta || '—') + '</div>';
    h += '<div style="margin-top:20px"><a class="btn sm" href="store.html?store=' + s.store +
         '" target="_blank">打开该门店手机页 ↗</a></div>';

    $('#dBody').innerHTML = h;
    var ct = document.getElementById('copyTag');
    if (ct) ct.onclick = function () {
      navigator.clipboard.writeText(s.tag).then(function () { HY.toast('已复制 ' + s.tag); },
        function () { HY.toast('复制失败，手动选中吧'); });
    };
    openDrawer();
  }
  function field(k, v) {
    return '<div class="fieldrow"><div class="k">' + k + '</div><div>' + v + '</div></div>';
  }

  function openFree(key) {
    var list = (S.freeByStoreWeek[key] || []).slice().sort(function (a, b) { return b.pubTs - a.pubTs; });
    var p = key.split('|'), st = S.storeById[p[0]] || {};
    $('#dTitle').textContent = st.storeName + '｜自由发挥';
    $('#dSub').textContent = p[1] + ' 那一周，未匹配到任何脚本的视频 ' + list.length + ' 条';
    $('#dBody').innerHTML = '<div class="sechead">视频列表</div>' + list.map(function (v) {
      return '<div class="shot"><div style="flex:1"><a class="vlink" style="margin-top:0" href="' + v.url +
        '" target="_blank" rel="noopener">' + (v.title || '（无标题）') + ' ↗</a>' +
        '<div class="vmeta mono">' + v.pubDate + ' · 播放 ' + HY.num(v.play) + ' · 成交 ¥' + HY.num(v.gmv) +
        '</div></div></div>';
    }).join('');
    openDrawer();
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
        // raw:false 让日期/大数按显示文本出来，避免 19 位视频ID 精度丢失
        var rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
        var r = HY.rowsToVideos(rows);
        if (!r.videos.length) { log('没解析出有效行，请确认是「生意经_视频列表」的导出文件', 'err'); return; }
        var res = HY.Videos.merge(r.videos, f.name);
        log('新增 ' + res.added + ' 条，更新 ' + res.updated + ' 条，累计 ' + res.total +
            ' 条（忽略品牌号 ' + r.skippedBrand + ' 条）', 'ok');
        recompute(); render(); renderHint();
      } catch (err) {
        log('解析失败：' + err.message, 'err');
      }
    };
    fr.readAsArrayBuffer(f);
  }

  function renderHint() {
    var meta = HY.Videos.meta(), n = HY.Videos.list().length;
    if (!n) { $('#datahint').innerHTML = '未导入视频数据'; return; }
    var last = meta.imports[meta.imports.length - 1];
    var ranges = {};
    HY.Videos.list().forEach(function (v) { if (v.rangeFrom) ranges[v.rangeFrom + '~' + v.rangeTo] = 1; });
    $('#datahint').innerHTML = '已累计 <b>' + HY.num(n) + '</b> 条视频<br>' +
      '最近导入 ' + (last ? new Date(last.at).toLocaleString('zh-CN') : '—') +
      ' · 统计范围 ' + Object.keys(ranges).sort().join('、');
  }

  /* ---------- 效果统计 ---------- */
  function renderEffect() {
    var vids = S.videos;
    if (!vids.length) { $('#effectBody').innerHTML = '<div class="empty-note">还没有视频数据，先导入。</div>'; return; }
    // 统计范围取所有导入批次里最宽的
    var from = null, to = null;
    vids.forEach(function (v) {
      if (v.rangeFrom && (!from || v.rangeFrom < from)) from = v.rangeFrom;
      if (v.rangeTo && (!to || v.rangeTo > to)) to = v.rangeTo;
    });
    var f = from ? from.slice(0, 4) + '-' + from.slice(4, 6) + '-' + from.slice(6, 8) : '0000-00-00';
    var t = to ? to.slice(0, 4) + '-' + to.slice(4, 6) + '-' + to.slice(6, 8) : '9999-99-99';

    var claimed = S.m.claimed;
    var inRange = vids.filter(function (v) { return v.pubDate >= f && v.pubDate <= t; });
    var byScript = inRange.filter(function (v) { return claimed[v.id]; });
    var freeV = inRange.filter(function (v) { return !claimed[v.id]; });

    function agg(list) {
      var play = 0, gmv = 0;
      list.forEach(function (v) { play += v.play; gmv += v.gmv; });
      return {
        n: list.length,
        avgPlay: list.length ? Math.round(play / list.length) : 0,
        gmv: gmv,
        avgGmv: list.length ? (gmv / list.length) : 0
      };
    }
    var a = agg(byScript), b = agg(freeV);

    $('#effectBody').innerHTML =
      '<div class="fieldrow"><div class="k">统计范围</div><div class="mono">' + f + ' ~ ' + t +
      '（' + HY.num(vids.length) + ' 条里有 ' + HY.num(inRange.length) + ' 条发布于范围内，纳入对比）</div></div>' +
      '<table class="mini"><thead><tr><th>口径</th><th>视频数</th><th>平均播放</th><th>总成交价值</th><th>篇均成交</th></tr></thead><tbody>' +
      row('按脚本拍', a) + row('自由发挥', b) + '</tbody></table>' +
      '<p class="note" style="margin-top:12px">第一版只做到这里：口径已经按「只比范围内视频」处理，' +
      '后续可以再拆到门店 / 内容方向 / 拍摄形式维度。</p>';

    function row(name, x) {
      return '<tr><td>' + name + '</td><td class="mono">' + HY.num(x.n) + '</td><td class="mono">' +
        HY.num(x.avgPlay) + '</td><td class="mono">¥' + HY.num(Math.round(x.gmv)) + '</td><td class="mono">¥' +
        x.avgGmv.toFixed(1) + '</td></tr>';
    }
  }

  /* ---------- 筛选项 ---------- */
  function fillFilters() {
    function fill(sel, vals) {
      vals.filter(Boolean).sort().forEach(function (v) {
        var o = document.createElement('option');
        o.value = o.textContent = v;
        sel.appendChild(o);
      });
    }
    var uniq = function (k) {
      var s = {};
      S.stores.forEach(function (x) { if (x[k]) s[x[k]] = 1; });
      return Object.keys(s);
    };
    fill($('#fRegion'), uniq('region'));
    fill($('#fType'), uniq('storeType'));
    fill($('#fLine'), uniq('brandLine'));
    if (!uniq('region').length) $('#fRegion').disabled = true;
    if (!uniq('storeType').length) $('#fType').disabled = true;
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $('#dClose').onclick = closeDrawer;
    $('#backdrop').onclick = closeDrawer;
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeDrawer();
        $('#mImport').classList.remove('open');
        $('#mEffect').classList.remove('open');
      }
    });

    ['#fRegion', '#fType', '#fLine', '#fLate', '#fArchive'].forEach(function (s) {
      $(s).onchange = render;
    });
    $('#fSearch').oninput = render;

    $('#btnImport').onclick = function () { $('#mImport').classList.add('open'); };
    $('#mImportClose').onclick = function () { $('#mImport').classList.remove('open'); };
    $('#btnEffect').onclick = function () { renderEffect(); $('#mEffect').classList.add('open'); };
    $('#mEffectClose').onclick = function () { $('#mEffect').classList.remove('open'); };

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
          recompute(); render(); renderHint();
        } catch (err) { log('备份导入失败：' + err.message, 'err'); }
      };
      fr.readAsText(f);
    };
    $('#btnClear').onclick = function () {
      if (!window.confirm('确定清空浏览器里已累计的全部视频数据？建议先导出备份。')) return;
      HY.Videos.clear(); recompute(); render(); renderHint();
      log('已清空视频数据', 'err');
    };
  }

  /* ---------- 启动 ---------- */
  HY.loadData().then(function (d) {
    S.stores = d.stores; S.storeById = d.storeById; S.scripts = d.scripts;
    fillFilters();
    bind();
    recompute();
    render();
    renderHint();
  }).catch(function (e) {
    document.querySelector('#board').innerHTML =
      '<tbody><tr><td class="empty-note">数据加载失败：' + e.message +
      '<br>本页需要通过 http 打开（终端里 <code>python3 -m http.server 8765</code>），直接双击 file:// 不行。</td></tr></tbody>';
  });
})();
