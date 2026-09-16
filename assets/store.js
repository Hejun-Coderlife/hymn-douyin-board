/* 门店页（手机，只读）—— store.html?store=<抖音号> */
(function () {
  'use strict';
  var $ = function (s) { return document.querySelector(s); };
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
      return;
    }
    // 门店页只读：视频数据来自总部在**本机**导入的 localStorage；
    // 店员手机上通常是空的，那就只显示计划，不显示已发布状态。
    var videos = HY.Videos.list().filter(function (v) { return v.store === id; });
    var mine = d.scripts.filter(function (s) { return s.store === id; });
    var m = HY.match(mine, videos);
    var weeks = HY.buildWeeks(new Date(), HY.WEEKS);
    var hasVideo = videos.length > 0;

    $('#spName').textContent = st.storeName + (st.brandLine ? '（' + st.brandLine + '）' : '');
    $('#spSub').innerHTML = '抖音号 <span class="mono">' + st.douyinId + '</span> · ' +
      '未来 13 周拍摄计划 · 每周 2 条' +
      (hasVideo ? '' : '<br><span style="color:var(--faint)">（本机没有视频数据，只显示计划，不判断是否已发）</span>');

    var win = mine.filter(function (s) {
      return s.date >= weeks[0].monday && s.date <= weeks[weeks.length - 1].sunday;
    });
    var c = { done: 0, guess: 0, late: 0, todo: 0 };
    win.forEach(function (s) { c[HY.statusOf(s, m.byScript[s.id], today)]++; });
    $('#spKpis').innerHTML =
      kpi('本周期脚本', win.length, '') +
      (hasVideo ? kpi('已发布', c.done + c.guess, 'done') + kpi('逾期', c.late, 'late') : '') +
      kpi('待拍', c.todo, '');

    var html = '';
    weeks.forEach(function (w) {
      var list = mine.filter(function (s) { return s.date >= w.monday && s.date <= w.sunday; })
        .sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var isNow = w.monday === HY.ymd(HY.monday(new Date()));
      html += '<div class="wkblock' + (isNow ? ' now' : '') + '"><h4><span>' +
        (isNow ? '本周' : '第 ' + w.i + ' 周') + '</span><em>' + HY.md(w.monday) + ' – ' + HY.md(w.sunday) + '</em></h4>';
      if (!list.length) {
        html += '<div style="font-size:12.5px;color:var(--faint);padding:8px 0">本周暂无脚本</div>';
      }
      list.forEach(function (s) {
        var mm = m.byScript[s.id];
        // 没有视频数据时不判断发没发，一律按「待拍」显示，免得误伤店员
        var stt = hasVideo ? HY.statusOf(s, mm, today) : 'todo';
        html += card(s, mm, stt, hasVideo);
      });
      html += '</div>';
    });
    $('#spWeeks').innerHTML = html;

    Array.prototype.forEach.call(document.querySelectorAll('.card .more'), function (el) {
      el.onclick = function () {
        var c = el.closest('.card');
        c.classList.toggle('open');
        el.textContent = c.classList.contains('open') ? '收起 ▲' : '看分镜 ▼';
      };
    });
    Array.prototype.forEach.call(document.querySelectorAll('.card .tg'), function (el) {
      el.onclick = function () {
        navigator.clipboard.writeText(el.textContent.trim())
          .then(function () { HY.toast('已复制 ' + el.textContent.trim()); },
                function () { HY.toast('复制失败，长按选中'); });
      };
    });
  }).catch(function (e) {
    $('#spName').textContent = '数据加载失败';
    $('#spSub').textContent = e.message + '（本页需要通过 http 打开）';
  });

  function kpi(lab, val, cls) {
    return '<div class="kpi ' + cls + '"><div class="lab">' + lab + '</div><div class="val mono">' + val + '</div></div>';
  }

  function card(s, m, stt, hasVideo) {
    var h = '<div class="card ' + stt + '"><div class="ct">' +
      '<span class="dt">' + s.date + ' 前发布</span>' +
      '<span class="st ' + stt + '">' + (hasVideo ? HY.STATUS_CN[stt] : (s.date < today ? '计划日期已过' : '待拍')) + '</span></div>';
    h += '<h5>' + s.topic + '｜' + s.format + '</h5>';
    h += '<div class="tg" title="点击复制">' + s.tag + '</div>';
    h += '<div style="font-size:12.5px;color:var(--soft);margin-top:5px">发布时把这个标签打进标题里，总部才认得出。</div>';
    if (m) {
      h += '<a class="vlink" href="' + m.video.url + '" target="_blank" rel="noopener">已发布：' +
        (m.video.title || '（无标题）') + ' ↗</a>';
    }
    h += '<span class="more">看分镜 ▼</span>';
    h += '<div class="detail">';
    h += '<div style="font-size:13px"><b>开头 3 秒</b>：' + (s.hook || '—') + '</div>';
    (s.shots || []).forEach(function (sh, i) {
      h += '<div class="shot"><div class="n">' + (i + 1) + '</div><div><div class="sc">' + sh.scene +
        '</div><div class="ln">' + (sh.line || '') + '</div></div><div class="sec mono">' + (sh.sec || 0) + 's</div></div>';
    });
    h += '<div style="font-size:13px;margin-top:8px"><b>结尾</b>：' + (s.cta || '—') + '</div>';
    h += '<div style="font-size:12.5px;color:var(--soft);margin-top:6px">BGM：' + (s.bgm || '—') +
      '　道具：' + ((s.props || []).join('、') || '—') + '</div>';
    h += '</div></div>';
    return h;
  }
})();
