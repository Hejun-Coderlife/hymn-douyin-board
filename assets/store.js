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
  if (pg && window.HYBg && localStorage.getItem('hymn_bg3d') === 'on') {
    window.HYBg(pg, localStorage.getItem('hymn_bg3d_style') || 'pearl',
                { light: true, scale: 0.30, fps: 15 }).start();
  } else if (pg) { pg.style.display = 'none'; }

  var id = new URLSearchParams(location.search).get('store');
  var today = HY.ymd(new Date());

  if (!id) {
    $('#spName').textContent = '缺少门店参数';
    $('#spSub').innerHTML = '链接应形如 <code>store.html?store=抖音号</code>';
    HY.bootDone();
    return;
  }

  HY.loadData().then(function (d) {
    var st = d.storeById[id];
    if (!st) {
      $('#spName').textContent = '没找到这家门店';
      $('#spSub').textContent = '抖音号 ' + id + ' 不在门店表里';
      return Promise.reject(new Error('门店不存在'));
    }
    // 脚本详情按「门店 × 月份」分片，把展示窗口覆盖到的月份都加载进来
    // （之前这里只传了 code、没传月份，loadDetail 直接 reject，门店页一开就是「数据加载失败」）
    var yms = [], seen = {};
    HY.buildDayGrid(new Date(), HY.WEEKS).forEach(function (w) {
      w.days.forEach(function (day) {
        var ym = HY.ymOf(day.date);
        if (!seen[ym]) { seen[ym] = 1; yms.push(ym); }
      });
    });
    return Promise.all(yms.map(function (ym) {
      return HY.loadDetail(st.code, ym).catch(function () {});  // 某个月没分片就跳过，别让整页挂掉
    })).then(function () { return d; });
  }).then(function (d) {
    if (!d) { HY.bootDone(); return; }
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
      if (!days.length) html += '<div class="emptyday">本周暂无脚本</div>';
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
    $$('.card2').forEach(function (el) {
      el.onclick = function () { el.classList.toggle('open'); };
    });
    $$('.card2 .vlink').forEach(function (el) {
      el.onclick = function (e) { e.stopPropagation(); };   // 点视频链接别把卡片收起来
    });
    $$('.card2 .hashrow span').forEach(function (el) {      // 单个标签：点一下复制自己
      el.onclick = function (e) {
        e.stopPropagation();
        var t = el.textContent.trim();
        copyText(t).then(function (ok) { HY.toast(ok ? '已复制 ' + t : '复制失败，长按选中'); });
      };
    });
    $$('.card2 .copyall').forEach(function (el) {            // 一键复制这条的全部标签
      el.onclick = function (e) {
        e.stopPropagation();
        var row = el.parentNode.nextSibling;
        var all = Array.prototype.map.call(row.querySelectorAll('span'), function (x) {
          return x.textContent.trim();
        }).join(' ');
        copyText(all).then(function (ok) {
          HY.toast(ok ? '已复制 ' + row.querySelectorAll('span').length + ' 个标签' : '复制失败，长按选中');
        });
      };
    });
    HY.bootDone();
  }).catch(function (e) {
    $('#spName').textContent = '数据加载失败';
    $('#spSub').textContent = e.message;
    HY.bootDone();
  });

  // file:// 打开时 navigator.clipboard 多半不可用，退回老办法
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { return true; }, fallback);
    }
    return Promise.resolve(fallback());
    function fallback() {
      var ta = document.createElement('textarea');
      ta.value = t;
      ta.style.cssText = 'position:fixed;left:-9999px;top:0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      return ok;
    }
  }

  function list(arr, cls) {
    if (!arr || !arr.length) return '';
    return '<ul class="lines ' + (cls || '') + '">' + arr.map(function (x) {
      return '<li>' + esc(x) + '</li>';
    }).join('') + '</ul>';
  }

  function card(s, dd, m, stt, hasVideo) {
    var label = hasVideo ? HY.STATUS_CN[stt] : (s.date < today ? '计划日期已过' : '待拍');
    // 列表行只留四样：日期、周几、标题、完成情况（用户 2026-09-17 要求）；
    // 标签、痛点、分镜全部收进 detail，点整张卡片展开。
    var h = '<div class="card2 ' + stt + '">' +
      '<div class="ct"><span class="dt">' + s.date + '（周' + dd.dow + '）</span>' +
      '<span class="pill ' + stt + '">' + label + '</span>' +
      '<span class="tog"><em class="o">展开</em><em class="c">收起</em><i>▾</i></span></div>' +
      '<h5>' + esc(s.title || (s.topic + '｜' + s.format)) + '</h5>' +
      '<div class="detail">';
    if (m) {
      h += '<a class="vlink" href="' + esc(m.video.url) + '" target="_blank" rel="noopener">已发布：' +
        esc(m.video.title || '（无标题）') + ' ↗</a>';
    }
    if (s.audience || s.pain) {
      h += '<div class="sechead">拍给谁看</div><div class="kvs">' +
        '<div class="k">人群</div><div>' + esc(s.audience || '—') + '</div>' +
        '<div class="k">她的烦恼</div><div>' + esc(s.pain || '—') + '</div></div>';
    }
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
      // 专属标签 2026-09-17 取消，s.tag 不再显示，只留普通话题标签
      var tags = s.hashtags.filter(function (t) { return t !== s.tag; });
      h += '<div class="sechead row">话题标签<button class="btnmini copyall" type="button">复制全部标签</button></div>' +
        '<div class="hashrow">' +
        tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>';
    }
    h += '</div></div>';
    return h;
  }
})();
