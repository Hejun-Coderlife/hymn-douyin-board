/* 总部看板 —— 脚本日历（按天）/ 门店列表 / 视频导入 / 效果统计 */
(function () {
  'use strict';

  var S = {
    stores: [], storeById: {}, scripts: [], scriptById: {}, videos: [],
    weeks: [], today: HY.ymd(new Date()), m: null,
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
    S.weeks = HY.buildDayGrid(new Date(), HY.WEEKS);
    S.videos = HY.Videos.list();
    S.m = HY.match(S.scripts, S.videos);

    S.byStoreDate = {};
    S.scripts.forEach(function (s) { S.byStoreDate[s.store + '|' + s.date] = s; });

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

  function windowScripts() {
    var from = S.weeks[0].days[0].date, to = S.weeks[S.weeks.length - 1].days[6].date;
    return S.scripts.filter(function (s) { return s.date >= from && s.date <= to; });
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
    var c = { done: 0, guess: 0, late: 0, todo: 0 };
    ws.forEach(function (s) { c[statusOfScript(s)]++; });
    var due = c.done + c.guess + c.late;
    var rate = due ? Math.round((c.done + c.guess) / due * 100) : 0;
    var freeCount = 0;
    rows.forEach(function (st) { freeCount += (S.freeByStore[st.douyinId] || []).length; });

    $('#kpis').innerHTML = [
      kpi('完成率', rate + '<small>%</small>', '', '已到计划日期的 ' + due + ' 条里'),
      kpi('已发布', c.done + c.guess, 'done', '其中标签精确 ' + c.done + ' 条'),
      kpi('逾期未发', c.late, 'late', '过了计划日仍没匹配到'),
      kpi('待拍', c.todo, '', '计划日期还没到'),
      kpi('自由发挥视频', HY.num(freeCount), '', '没对上任何脚本'),
      kpi('门店', rows.length + '<small>/' + S.stores.length + '</small>', '', '当前筛选结果')
    ].join('');

    var late = {};
    ws.forEach(function (s) { if (statusOfScript(s) === 'late') late[s.store] = (late[s.store] || 0) + 1; });
    var arr = Object.keys(late).map(function (k) { return { id: k, n: late[k] }; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 15);
    $('#ranks').innerHTML = arr.length ? arr.map(function (x) {
      var st = S.storeById[x.id] || {};
      return '<div class="it" data-store="' + x.id + '">' + esc(st.storeName || x.id) + ' <b>' + x.n + '</b></div>';
    }).join('') : '<div class="empty">暂无逾期。（没导入视频数据时，这里不代表真实情况）</div>';
    $$('#ranks .it').forEach(function (el) {
      el.onclick = function () {
        $('#fSearch').value = (S.storeById[el.dataset.store] || {}).storeName || '';
        render();
      };
    });
  }

  /* ---------- 日历大表 ---------- */
  function filtered() {
    var q = $('#fSearch').value.trim();
    var reg = $('#fRegion').value, typ = $('#fType').value, line = $('#fLine').value;
    var onlyLate = $('#fLate').checked;
    var ws = onlyLate ? windowScripts() : null;
    return S.stores.filter(function (st) {
      if (reg && st.region !== reg) return false;
      if (typ && st.storeType !== typ) return false;
      if (line && (st.brandLine || '') !== line) return false;
      if (q && (st.storeName + st.accountName + st.douyinId).indexOf(q) === -1) return false;
      if (onlyLate && !ws.some(function (s) {
        return s.store === st.douyinId && statusOfScript(s) === 'late';
      })) return false;
      return true;
    });
  }

  function weeksToShow() {
    var weeks = S.weeks.slice();
    if (!$('#fArchive').checked) return weeks;
    var first = weeks[0].days[0].date, mons = {};
    S.scripts.forEach(function (s) {
      var m = HY.ymd(HY.monday(HY.parseYmd(s.date)));
      if (m < first) mons[m] = 1;
    });
    var past = Object.keys(mons).sort().map(function (m) {
      var mon = HY.parseYmd(m), days = [];
      for (var d = 0; d < 7; d++) {
        var day = HY.addDays(mon, d);
        days.push({ date: HY.ymd(day), dow: HY.DOW[d], dd: day.getDate(), weekend: d >= 5, today: false });
      }
      return { i: 0, monday: m, sunday: HY.ymd(HY.addDays(mon, 6)), days: days, archived: true };
    });
    return past.concat(weeks);
  }

  function render() {
    var rows = filtered();
    renderKpis(rows);
    var weeks = weeksToShow();

    var h = '<thead><tr class="r1"><th class="stcol" rowspan="2">门店 <span class="muted">(' +
            rows.length + ')</span></th>';
    weeks.forEach(function (w) {
      var isNow = w.days.some(function (d) { return d.today; });
      h += '<th class="wk' + (isNow ? ' now' : '') + '" colspan="7">' +
           (w.archived ? '归档 ' : '第 ' + w.i + ' 周 · ') + HY.md(w.monday) + '–' + HY.md(w.sunday) + '</th>';
    });
    h += '</tr><tr class="r2">';
    weeks.forEach(function (w) {
      w.days.forEach(function (d, i) {
        h += '<th class="day' + (d.weekend ? ' wknd' : '') + (d.today ? ' today' : '') +
             (i === 0 ? ' wstart' : '') + '">' + d.dow + '<span class="d">' + d.dd + '</span></th>';
      });
    });
    h += '</tr></thead><tbody>';

    if (!rows.length) {
      h += '<tr><td class="emptyrow" colspan="99">没有符合筛选条件的门店</td></tr>';
    }
    rows.forEach(function (st) {
      h += '<tr><td class="stcol"><div class="nm">' + esc(st.storeName) + '</div><div class="meta">' +
        (st.brandLine ? '<span class="bl">' + esc(st.brandLine) + '</span>' : '') +
        '<span class="mono">' + st.douyinId + '</span>' +
        '<a class="mob" href="store.html?store=' + st.douyinId + '" target="_blank">门店页</a></div></td>';
      weeks.forEach(function (w) {
        w.days.forEach(function (d, i) {
          var cls = 'cell' + (d.weekend ? ' wknd' : '') + (i === 0 ? ' wstart' : '');
          var sc = S.byStoreDate[st.douyinId + '|' + d.date];
          var free = S.freeByStoreDate[st.douyinId + '|' + d.date];
          h += '<td class="' + cls + '">';
          if (sc) {
            var stt = statusOfScript(sc);
            h += '<span class="dot ' + stt + (free ? ' free' : '') + '" data-id="' + esc(sc.id) +
                 '" title="' + esc(d.date + ' ' + sc.topic + '·' + sc.format + ' — ' + HY.STATUS_CN[stt] +
                 (free ? '（当天另有 ' + free.length + ' 条自由发挥）' : '')) + '"></span>';
          } else if (free) {
            h += '<span class="dot none free" data-free="' + st.douyinId + '|' + d.date +
                 '" title="' + free.length + ' 条自由发挥视频"></span>';
          } else {
            h += '<span class="dot none"></span>';
          }
          h += '</td>';
        });
      });
      h += '</tr>';
    });
    h += '</tbody>';

    $('#board').innerHTML = h;
    $$('#board .dot[data-id]').forEach(function (el) {
      el.onclick = function () { openScript(el.dataset.id); };
    });
    $$('#board .dot[data-free]').forEach(function (el) {
      el.onclick = function () { openFree(el.dataset.free); };
    });
  }

  /* ---------- 侧栏：脚本详情 ---------- */
  function openDrawer() { $('#drawer').classList.add('open'); $('#backdrop').classList.add('on'); }
  function closeDrawer() { $('#drawer').classList.remove('open'); $('#backdrop').classList.remove('on'); }
  function kv(k, v) { return v ? '<div class="k">' + k + '</div><div>' + esc(v) + '</div>' : ''; }
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
    HY.loadDetail(st.code).then(function () {
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

    h += '<div class="tagbox"><span class="tg" id="copyTag">' + esc(s.tag) + '</span>' +
         '<span class="ds">发布时必须把这个标签打进标题，总部靠它认脚本。点击复制</span></div>';

    h += '<div class="statusbox">';
    if (m) {
      var v = m.video;
      h += '<a class="vlink" href="' + esc(v.url) + '" target="_blank" rel="noopener">' +
           esc(v.title || '（无标题）') + ' ↗</a>' +
           '<div class="vmeta mono">发布 ' + v.pubDate + ' · 播放 ' + HY.num(v.play) +
           ' · 成交 ¥' + HY.num(v.gmv) + '</div>';
      if (m.type === 'guess') {
        h += '<div class="vmeta">※ 推测匹配：标题里没有该标签，' +
             (m.by === 'day' ? '只是当天发了这条视频。' : '只是同一周内发了这条视频。') + '</div>';
      }
    } else if (stt === 'late') {
      h += '<div class="vmeta">计划日期已过，没匹配到视频。已拍的话检查标题是否带标签，或重新导入最新数据。</div>';
    } else {
      h += '<div class="vmeta">还没到计划日期。</div>';
    }
    h += '</div>';

    h += '<div class="sechead">选题</div><div class="kvs">' +
      kv('人群', s.audience) + kv('痛点', s.pain) + kv('成因', s.cause) +
      kv('承诺', s.promise) + kv('对应项目', s.service) + '</div>';

    h += '<div class="sechead">开头 3 秒（黄金前三秒）</div><div class="bigline">' + esc(s.hook) + '</div>';

    var shots = s.shots || [];
    h += '<div class="sechead">分镜 ' + shots.length + ' 幕' + (s.duration ? ' · ' + esc(s.duration) : '') + '</div>';
    shots.forEach(function (sh, i) {
      h += '<div class="shot"><div class="n">' + (i + 1) + '</div><div class="bd">' +
        '<div class="sc">' + esc(sh.scene) + '</div>' +
        (sh.line ? '<div class="ln">「' + esc(sh.line) + '」</div>' : '') +
        '</div><div class="sec">' + (sh.sec || 0) + 's</div></div>';
    });

    h += '<div class="sechead">结尾引导</div><div class="bigline">' + esc(s.cta) + '</div>';

    if (s.titles && s.titles.length) {
      h += '<div class="sechead">标题备选</div>' + list(s.titles);
    }
    if (s.cover) h += '<div class="sechead">封面</div><div class="bigline">' + esc(s.cover) + '</div>';
    if (s.tips && s.tips.length) h += '<div class="sechead">拍摄要点</div>' + list(s.tips);
    if (s.avoid && s.avoid.length) h += '<div class="sechead">避坑</div>' + list(s.avoid, 'warn');

    h += '<div class="sechead">现场</div><div class="kvs">' +
      kv('BGM', s.bgm) + kv('道具', (s.props || []).join('、')) + '</div>';

    if (s.hashtags && s.hashtags.length) {
      h += '<div class="sechead">话题标签</div><div class="hashrow">' +
        s.hashtags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') +
        '</div><div class="rowbtns"><button class="btn sm" id="copyAll">复制全部标签</button></div>';
    }

    h += '<div class="rowbtns"><a class="btn sm" href="store.html?store=' + s.store +
         '" target="_blank">打开该门店手机页</a></div>';

    $('#dBody').innerHTML = h;
    $('#dBody').scrollTop = 0;

    var ct = document.getElementById('copyTag');
    if (ct) ct.onclick = function () { copy(s.tag, '已复制 ' + s.tag); };
    var ca = document.getElementById('copyAll');
    if (ca) ca.onclick = function () { copy((s.hashtags || []).join(' '), '标签已全部复制'); };
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
    $('#dTitle').textContent = st.storeName + '｜自由发挥';
    $('#dSub').textContent = p[1] + ' 当天没对上任何脚本的视频 ' + arr.length + ' 条';
    $('#dBody').innerHTML = arr.map(function (v) {
      return '<div class="statusbox" style="margin-top:10px"><a class="vlink" style="margin-top:0" href="' +
        esc(v.url) + '" target="_blank" rel="noopener">' + esc(v.title || '（无标题）') + ' ↗</a>' +
        '<div class="vmeta mono">' + v.pubDate + ' · 播放 ' + HY.num(v.play) +
        ' · 成交 ¥' + HY.num(v.gmv) + '</div></div>';
    }).join('');
    openDrawer();
  }

  /* ---------- 门店档案（可直接编辑） ---------- */
  var REGION_HINTS = ['海曙', '江北', '鄞州', '镇海', '北仑', '奉化', '慈溪', '余姚',
                      '象山', '宁海', '绍兴', '台州', '温州'];
  var TYPE_OPTS = ['', '商场店', '社区店', '街边店', '写字楼店'];

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

    var h = '<thead><tr><th>门店</th><th>抖音号</th><th style="width:110px">区域</th>' +
      '<th style="width:110px">门店类型</th><th style="width:150px">客群</th>' +
      '<th style="width:170px">主推项目</th><th style="width:170px">可拍场景</th>' +
      '<th style="width:150px">出镜条件</th><th>脚本</th><th>视频</th><th></th></tr></thead><tbody>';
    S.stores.forEach(function (st) {
      h += '<tr data-id="' + st.douyinId + '">' +
        '<td><div class="nm2">' + esc(st.storeName) + '</div>' +
        (st.brandLine ? '<div class="bl">' + esc(st.brandLine) + '</div>' : '') + '</td>' +
        '<td class="mono muted">' + st.douyinId + '</td>' +
        cellInput(st, 'region', '区域', 'regionList') +
        cellSelect(st, 'storeType', TYPE_OPTS) +
        cellInput(st, 'customer', '如 30-45 岁社区妈妈') +
        cellInput(st, 'mainService', '如 皮肤管理 / 妆造') +
        cellInput(st, 'scenes', '如 护理床、前台、门头（逗号分隔）') +
        cellInput(st, 'onCamera', '如 店长可出镜') +
        '<td class="mono">' + (cntS[st.douyinId] || 0) + '</td>' +
        '<td class="mono">' + (cntV[st.douyinId] || 0) + '</td>' +
        '<td><a class="btn sm" href="store.html?store=' + st.douyinId + '" target="_blank">门店页</a></td></tr>';
    });
    $('#storelist').innerHTML = h + '</tbody>';

    $$('#storelist input[data-f], #storelist select[data-f]').forEach(function (el) {
      el.onchange = function () {
        var id = el.closest('tr').dataset.id, f = el.dataset.f, v = el.value.trim();
        HY.StoreEdits.set(id, f, f === 'scenes' ? splitList(v) : v);
        var st = S.storeById[id];
        if (st) st[f] = f === 'scenes' ? splitList(v) : v;
        el.classList.toggle('edited', !!v);
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
  function cellSelect(st, f, opts) {
    var v = val(st, f);
    return '<td><select data-f="' + f + '" class="cellin' + (v ? ' edited' : '') + '">' +
      opts.map(function (o) {
        return '<option value="' + esc(o) + '"' + (o === v ? ' selected' : '') + '>' + (o || '—') + '</option>';
      }).join('') + '</select></td>';
  }

  /** 门店字段改了以后，筛选下拉要跟着出新选项 */
  function refreshFiltersAfterEdit() {
    ['#fRegion', '#fType'].forEach(function (sel) {
      var el = $(sel), keep = el.value, f = sel === '#fRegion' ? 'region' : 'storeType';
      var o = {};
      S.stores.forEach(function (x) { if (x[f]) o[x[f]] = 1; });
      el.disabled = false;
      el.innerHTML = '<option value="">' + (f === 'region' ? '全部区域' : '全部门店类型') + '</option>' +
        Object.keys(o).sort().map(function (v) {
          return '<option value="' + esc(v) + '"' + (v === keep ? ' selected' : '') + '>' + esc(v) + '</option>';
        }).join('');
    });
    render();
  }

  function exportStores() {
    var out = S.stores.map(function (st) {
      var o = {};
      Object.keys(st).forEach(function (k) { o[k] = st[k]; });
      return o;
    });
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
    $('#datahint').innerHTML = '已累计 <b>' + HY.num(n) + '</b> 条视频 · 统计范围 ' +
      Object.keys(ranges).sort().join('、') + '<br>最近导入 ' +
      (last ? new Date(last.at).toLocaleString('zh-CN') : '—');
  }

  /* ---------- 效果统计 ---------- */
  function renderEffect() {
    if (!S.videos.length) {
      $('#effectBody').innerHTML = '<div class="emptyrow">还没有视频数据，先去「视频数据导入」。</div>';
      return;
    }
    var from = null, to = null;
    S.videos.forEach(function (v) {
      if (v.rangeFrom && (!from || v.rangeFrom < from)) from = v.rangeFrom;
      if (v.rangeTo && (!to || v.rangeTo > to)) to = v.rangeTo;
    });
    function dash(x) { return x ? x.slice(0, 4) + '-' + x.slice(4, 6) + '-' + x.slice(6, 8) : null; }
    var f = dash(from) || '0000-00-00', t = dash(to) || '9999-99-99';

    var claimed = S.m.claimed;
    var inRange = S.videos.filter(function (v) { return v.pubDate >= f && v.pubDate <= t; });
    var a = agg(inRange.filter(function (v) { return claimed[v.id]; }));
    var b = agg(inRange.filter(function (v) { return !claimed[v.id]; }));

    function agg(arr) {
      var play = 0, gmv = 0;
      arr.forEach(function (v) { play += v.play; gmv += v.gmv; });
      return { n: arr.length, avgPlay: arr.length ? Math.round(play / arr.length) : 0,
               gmv: gmv, avgGmv: arr.length ? gmv / arr.length : 0 };
    }
    function row(name, x) {
      return '<tr><td>' + name + '</td><td class="mono">' + HY.num(x.n) + '</td><td class="mono">' +
        HY.num(x.avgPlay) + '</td><td class="mono">¥' + HY.num(Math.round(x.gmv)) +
        '</td><td class="mono">¥' + x.avgGmv.toFixed(1) + '</td></tr>';
    }

    $('#effectBody').innerHTML =
      '<div class="kvs" style="margin-bottom:10px"><div class="k">统计范围</div><div class="mono">' + f + ' ~ ' + t +
      '</div><div class="k">纳入对比</div><div>' + HY.num(S.videos.length) + ' 条里有 ' +
      HY.num(inRange.length) + ' 条发布于范围内</div></div>' +
      '<table class="mini"><thead><tr><th>口径</th><th>视频数</th><th>平均播放</th><th>总成交价值</th>' +
      '<th>篇均成交</th></tr></thead><tbody>' + row('按脚本拍', a) + row('自由发挥', b) + '</tbody></table>' +
      '<p class="note" style="margin-top:12px">第一版只做到这里；后续可以再拆到门店 / 内容方向 / 拍摄形式维度。</p>';
  }

  /* ---------- 筛选项 ---------- */
  function fillFilters() {
    function uniq(k) {
      var o = {};
      S.stores.forEach(function (x) { if (x[k]) o[x[k]] = 1; });
      return Object.keys(o).sort();
    }
    function fill(sel, vals) {
      vals.forEach(function (v) {
        var o = document.createElement('option');
        o.value = o.textContent = v;
        sel.appendChild(o);
      });
      if (!vals.length) sel.disabled = true;
    }
    fill($('#fRegion'), uniq('region'));
    fill($('#fType'), uniq('storeType'));
    fill($('#fLine'), uniq('brandLine'));
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
    $('#ttl').textContent = TITLES[name] || '';
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

  /* ---------- 顶部 3D 横幅 ---------- */
  var bg = null;
  function initHero() {
    var cv = $('#heroCanvas'), btn = $('#fxToggle');
    if (!cv || !window.HYBg) return;
    bg = window.HYBg(cv);
    var off = localStorage.getItem('hymn_bg3d') === 'off';
    apply(off);
    btn.onclick = function () {
      off = !off;
      localStorage.setItem('hymn_bg3d', off ? 'off' : 'on');
      apply(off);
    };
    function apply(isOff) {
      cv.dataset.on = isOff ? '0' : '1';
      btn.classList.toggle('off', isOff);
      btn.textContent = isOff ? '动效已关' : '动效';
      if (isOff) { bg.stop(); $('#hero').classList.add('nogl'); }
      else { $('#hero').classList.remove('nogl'); bg.start(); }
    }
  }

  function renderHeroSub() {
    var d = new Date();
    var wd = '日一二三四五六'[d.getDay()];
    $('#heroSub').textContent = S.stores.length + ' 家门店 · 每店每天 1 条 · 往后滚动 13 周　|　今天 ' +
      S.today + ' 周' + wd + ' · 在库脚本 ' + HY.num(S.scripts.length) + ' 条';
  }

  /* ---------- 事件 ---------- */
  function bind() {
    $$('.nav a').forEach(function (a) {
      a.onclick = function () { showPanel(a.dataset.panel); };
    });
    $('#btnImport').onclick = function () { showPanel('import'); };

    $('#dClose').onclick = closeDrawer;
    $('#backdrop').onclick = closeDrawer;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeDrawer(); });

    ['#fRegion', '#fType', '#fLine', '#fLate', '#fArchive'].forEach(function (s) { $(s).onchange = render; });
    $('#fSearch').oninput = render;

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

  /* ---------- 启动 ---------- */
  HY.loadData().then(function (d) {
    S.stores = d.stores; S.storeById = d.storeById; S.scripts = d.scripts;
    S.scripts.forEach(function (s) { S.scriptById[s.id] = s; });
    fillFilters();
    bind();
    initHero();
    refreshAll();
    showPanel(hashView());
    window.addEventListener('hashchange', function () { showPanel(hashView()); });
  }).catch(function (e) {
    $('#board').innerHTML = '<tbody><tr><td class="emptyrow">数据加载失败：' + esc(e.message) + '</td></tr></tbody>';
  });
})();
