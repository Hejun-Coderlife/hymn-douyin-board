/* 门店页（手机，只读）—— store.html?store=<抖音号> */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  var pg = document.getElementById('pageBg');
  if (pg && window.HYBg && localStorage.getItem('hymn_bg3d') !== 'off') {
    window.HYBg(pg, localStorage.getItem('hymn_bg3d_style') || 'aurora',
                { light: true, scale: 0.30, fps: 15 }).start();
  } else if (pg) { pg.style.display = 'none'; }

  var id = new URLSearchParams(location.search).get('store');
  var today = HY.ymd(new Date());

  if (!id) {
    $('#spName').textContent = '缺少门店参数';
    $('#spSub').innerHTML = '链接应形如 <code>store.html?store=抖音号</code>';
    return;
  }

  HY.loadData().then(function (d) {
    var st = d.storeById[id];
    if (!st) {
      $('#spName').textContent = '没找到这家门店';
      $('#spSub').textContent = '抖音号 ' + id + ' 不在门店表里';
      return Promise.reject(new Error('门店不存在'));
    }
    // 脚本详情按门店分片，先把本店那份加载进来
    return HY.loadDetail(st.code).then(function () { return d; });
  }).then(function (d) {
    if (!d) return;
    var st = d.storeById[id];
    // 视频数据来自总部在本机导入的 localStorage；店员手机上通常是空的，
    // 那就只显示计划，不判断发没发，免得误伤。
    var videos = HY.Videos.list().filter(function (v) { return v.store === id; });
    var mine = d.scripts.filter(function (s) { return s.store === id; })
      .map(function (x) { return HY.detail(x.id) || x; });
    var m = HY.match(mine, videos);
    var weeks = HY.buildDayGrid(new Date(), HY.WEEKS);
    var hasVideo = videos.length > 0;

    $('#spName').textContent = st.storeName + (st.brandLine ? '（' + st.brandLine + '）' : '');
    $('#spSub').innerHTML = '抖音号 <span class="mono">' + st.douyinId + '</span> · 每天 1 条 · 往后 13 周' +
      (hasVideo ? '' : '<br>本机没有视频数据，只显示计划，不判断是否已发');

    var from = weeks[0].days[0].date, to = weeks[weeks.length - 1].days[6].date;
    var win = mine.filter(function (s) { return s.date >= from && s.date <= to; });
    var c = { done: 0, guess: 0, late: 0, todo: 0 };
    win.forEach(function (s) { c[HY.statusOf(s, m.byScript[s.id], today)]++; });

    $('#spKpis').innerHTML =
      kpi('本周期脚本', win.length, '') +
      (hasVideo ? kpi('已发布', c.done + c.guess, 'done') + kpi('逾期', c.late, 'late')
                : kpi('今天之后', win.filter(function (s) { return s.date >= today; }).length, ''));

    var byDate = {};
    mine.forEach(function (s) { byDate[s.date] = s; });

    var html = '';
    weeks.forEach(function (w, wi) {
      var isNow = w.days.some(function (x) { return x.today; });
      var days = w.days.filter(function (x) { return byDate[x.date]; });
      var open = isNow || wi === 1;     // 本周和下周默认展开
      html += '<div class="wkblock' + (isNow ? ' now' : '') + (open ? ' open' : '') + '">' +
        '<div class="wh"><span class="arrow">▶</span>' +
        (isNow ? '本周' : '第 ' + w.i + ' 周') +
        ' <span class="rg">' + HY.md(w.monday) + '–' + HY.md(w.sunday) + '</span>' +
        '<span class="cnt">' + days.length + ' 条</span></div><div class="wb">';
      if (!days.length) html += '<div class="card2" style="color:var(--t3)">本周暂无脚本</div>';
      days.forEach(function (dd) {
        var s = byDate[dd.date];
        var mm = m.byScript[s.id];
        var stt = hasVideo ? HY.statusOf(s, mm, today) : (s.date < today ? 'todo' : 'todo');
        html += card(s, dd, mm, stt, hasVideo);
      });
      html += '</div></div>';
    });
    $('#spWeeks').innerHTML = html;

    $$('.wkblock .wh').forEach(function (el) {
      el.onclick = function () { el.parentNode.classList.toggle('open'); };
    });
    $$('.card2 .more').forEach(function (el) {
      el.onclick = function () {
        var c2 = el.parentNode;
        c2.classList.toggle('open');
        el.textContent = c2.classList.contains('open') ? '收起 ▲' : '看完整分镜 ▼';
      };
    });
    $$('.card2 .tgline').forEach(function (el) {
      el.onclick = function () {
        var t = el.textContent.trim();
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(t).then(function () { HY.toast('已复制 ' + t); },
            function () { HY.toast('复制失败，长按选中'); });
        } else { HY.toast('长按选中复制'); }
      };
    });
  }).catch(function (e) {
    $('#spName').textContent = '数据加载失败';
    $('#spSub').textContent = e.message;
  });

  function kpi(lab, val, cls) {
    return '<div class="kpi ' + cls + '"><div class="lab">' + lab + '</div><div class="val">' + val + '</div></div>';
  }

  function list(arr, cls) {
    if (!arr || !arr.length) return '';
    return '<ul class="lines ' + (cls || '') + '">' + arr.map(function (x) {
      return '<li>' + esc(x) + '</li>';
    }).join('') + '</ul>';
  }

  function card(s, dd, m, stt, hasVideo) {
    var label = hasVideo ? HY.STATUS_CN[stt] : (s.date < today ? '计划日期已过' : '待拍');
    var h = '<div class="card2 ' + stt + '">' +
      '<div class="ct"><span class="dt">' + s.date + '（周' + dd.dow + '）</span>' +
      '<span class="pill ' + stt + '">' + label + '</span></div>' +
      '<h5>' + esc(s.topic) + '｜' + esc(s.format) + '</h5>' +
      '<div class="fmt">' + esc(s.pain || '') + '</div>' +
      '<div class="tgline">' + esc(s.tag) + '</div>' +
      '<div class="fmt" style="margin-top:6px">↑ 发布时把这个标签打进标题，总部才认得出</div>';
    if (m) {
      h += '<a class="vlink" href="' + esc(m.video.url) + '" target="_blank" rel="noopener">已发布：' +
        esc(m.video.title || '（无标题）') + ' ↗</a>';
    }
    h += '<span class="more">看完整分镜 ▼</span><div class="detail">';
    h += '<div class="sechead">开头 3 秒</div><div class="bigline">' + esc(s.hook) + '</div>';
    h += '<div class="sechead">分镜 ' + (s.shots || []).length + ' 幕 · ' + esc(s.duration || '') + '</div>';
    (s.shots || []).forEach(function (sh, i) {
      h += '<div class="shot"><div class="n">' + (i + 1) + '</div><div class="bd">' +
        '<div class="sc">' + esc(sh.scene) + '</div>' +
        (sh.line ? '<div class="ln">「' + esc(sh.line) + '」</div>' : '') +
        '</div><div class="sec">' + (sh.sec || 0) + 's</div></div>';
    });
    h += '<div class="sechead">结尾引导</div><div class="bigline">' + esc(s.cta) + '</div>';
    if (s.cover) h += '<div class="sechead">封面</div><div class="bigline">' + esc(s.cover) + '</div>';
    if (s.tips && s.tips.length) h += '<div class="sechead">拍摄要点</div>' + list(s.tips);
    if (s.avoid && s.avoid.length) h += '<div class="sechead">避坑</div>' + list(s.avoid, 'warn');
    h += '<div class="sechead">现场</div><div class="kvs">' +
      '<div class="k">BGM</div><div>' + esc(s.bgm || '—') + '</div>' +
      '<div class="k">道具</div><div>' + esc((s.props || []).join('、') || '—') + '</div></div>';
    if (s.hashtags && s.hashtags.length) {
      h += '<div class="sechead">话题标签</div><div class="hashrow">' +
        s.hashtags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>';
    }
    h += '</div></div>';
    return h;
  }
})();
