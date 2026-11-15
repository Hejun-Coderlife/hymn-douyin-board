/* 时间段选择（2026-11-15 用户：「这里的日期也按同样的来」）
   赫眉所有网站统一标准 = card.hemei.asia 战报那一排：今天｜昨天｜近7天｜近30天｜本月｜自定义。
   自定义 = 弹框里两组「年 月 日」数字框：点进去整格选中、打字替换、打满跳格、↑↓ 加减、回车或「确定」生效。
   校验：哪一格不对说哪格；日子超过月底改成月底；结束早于开始要提示（不偷偷对调）；结束超过今天截到今天；开始还没到要提示。
   区间比有数据的第一天还早 → 开始抬到有数据那天（整段都在数据之前就不抬）。
   看板（完成率统计、生成战报图）和 report.html（门店赫眉助手里的抖音战报）共用这一份，样式自带，不靠页面 css 变量。

   用法：var seg = HY.rangeSeg(el, { first: fn→'YYYY-MM-DD'|null, onPick: fn(p, from, to) });
         seg.show(p, from, to)   // p = today|yday|d7|d30|month|custom|''（'' = 哪档都不亮）
   HY.periodRange(p, from, to, first) → { from, to }  */
(function () {
  'use strict';
  var HY = window.HY;
  var CSS = [
    '.fseg{position:relative;display:inline-flex;align-items:center;gap:2px;padding:3px;background:#F2F0EB;height:38px;box-sizing:border-box;font-family:inherit}',
    '.fseg>a{display:flex;align-items:center;height:32px;padding:0 14px;font-size:13px;color:#9C958A;cursor:pointer;white-space:nowrap;user-select:none;text-decoration:none;border:0}',
    '.fseg>a:hover{color:#16140F}',
    '.fseg>a.on{background:#fff;color:#16140F;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '.fseg.open>a.on{background:transparent;box-shadow:none;font-weight:400;color:#9C958A}',
    '.fseg.open>a[data-p="custom"]{background:#fff;color:#16140F;font-weight:600;box-shadow:0 1px 3px rgba(0,0,0,.08)}',
    '.fseg .fpop{position:absolute;top:calc(100% + 6px);left:0;z-index:600;padding:12px 14px 14px;background:#fff;border:1px solid #16140F;box-shadow:0 10px 30px rgba(0,0,0,.08);text-align:left}',
    '.fseg.right .fpop{left:auto;right:0}',
    '.fseg .fch{font-size:12px;color:#9C958A;margin-bottom:8px;white-space:nowrap}',
    '.fseg .dedit{display:flex;align-items:center;gap:10px;white-space:nowrap}',
    '.fseg .dedit b{font-weight:400;color:#9C958A;font-size:13px}',
    '.fseg .dgrp{display:inline-flex;align-items:center;gap:3px;border:1px solid #E3DFD6;padding:4px 8px;height:38px;box-sizing:border-box;background:#fff}',
    '.fseg .dgrp:focus-within{border-color:#16140F}',
    '.fseg .dn{width:2.2em;height:auto;border:0;outline:0;padding:2px 0;margin:0;text-align:center;font-family:Didot,"Bodoni 72",Georgia,"Songti SC",serif;font-size:16px;color:#16140F;background:transparent;box-shadow:none;border-radius:0}',
    '.fseg .dn.y{width:3.4em}',
    '.fseg .dn:focus{background:#F2F0EB}',
    '.fseg .dgrp i{font-style:normal;font-size:12px;color:#9C958A}',
    '.fseg .dok{height:38px;padding:0 18px;border:1px solid #16140F;background:#16140F;color:#fff;font-size:13px;cursor:pointer;font-family:inherit}',
    '.fseg .derr{font-size:12px;color:#B9808B;min-height:16px;margin-top:6px;white-space:normal;max-width:420px}',
    '@media (max-width:700px){.fseg .dedit{flex-wrap:wrap}.fseg .fpop{max-width:92vw}.fseg>a{padding:0 10px}}'
  ].join('\n');
  var styled = false;
  var TABS = [['today', '今天'], ['yday', '昨天'], ['d7', '近7天'], ['d30', '近30天'], ['month', '本月'], ['custom', '自定义']];

  function today() { return HY.ymd(new Date()); }
  function add(d, n) { return HY.ymd(HY.addDays(HY.parseYmd(d), n)); }
  function md(d) { return d.slice(5, 7) + '/' + d.slice(8, 10); }

  function periodRange(p, from, to, first) {
    var t = today(), f = t, e = t;
    if (p === 'yday') f = e = add(t, -1);
    else if (p === 'd7') f = add(t, -6);
    else if (p === 'd30') f = add(t, -29);
    else if (p === 'month') f = t.slice(0, 8) + '01';
    else if (p === 'custom') { f = from || t.slice(0, 8) + '01'; e = to || t; if (e > t) e = t; if (f > e) { var x = f; f = e; e = x; } }
    if (first && f < first && first <= e) f = first;
    return { from: f, to: e };
  }

  function rangeSeg(host, opt) {
    if (!styled) { var s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
    host.classList.add('fseg');
    host.innerHTML = TABS.map(function (t) { return '<a data-p="' + t[0] + '">' + t[1] + '</a>'; }).join('');
    var cus = host.querySelector('a[data-p="custom"]');
    var cur = { p: '', from: '', to: '' }, pop = null;
    var q = function (sel) { return pop ? Array.prototype.slice.call(pop.querySelectorAll(sel)) : []; };
    function err(m) { pop.querySelector('.derr').textContent = m; }

    function show(p, from, to) {
      cur = { p: p, from: from, to: to };
      Array.prototype.forEach.call(host.querySelectorAll('a[data-p]'), function (a) { a.classList.toggle('on', a.dataset.p === p); });
      cus.textContent = p === 'custom' && from ? (from === to ? md(from) : md(from) + ' – ' + md(to)) : '自定义';
    }
    function open() {
      var t = today(), f = cur.p === 'custom' && cur.from ? cur.from : (cur.from || t.slice(0, 8) + '01'),
          e = cur.p === 'custom' && cur.to ? cur.to : (cur.to || t);
      var grp = function (k, d) {
        return '<span class="dgrp" data-k="' + k + '"><input class="dn y" maxlength="4" inputmode="numeric" value="' + d.slice(0, 4) +
          '"><i>年</i><input class="dn" maxlength="2" inputmode="numeric" value="' + (+d.slice(5, 7)) +
          '"><i>月</i><input class="dn" maxlength="2" inputmode="numeric" value="' + (+d.slice(8, 10)) + '"><i>日</i></span>';
      };
      host.classList.add('open');
      pop = document.createElement('div'); pop.className = 'fpop';
      pop.innerHTML = '<div class="fch">直接改数字，回车或点确定</div><div class="dedit">' + grp('a', f) + '<b>至</b>' + grp('b', e) +
        '<button type="button" class="dok">确定</button></div><div class="derr"></div>';
      host.appendChild(pop);
      var r = host.getBoundingClientRect();     // 靠右放不下就往左展开
      host.classList.toggle('right', r.left + 520 > window.innerWidth && r.right > 520);
      var x = pop.querySelector('.dn'); x.focus(); x.select();
    }
    function close() { if (pop) pop.remove(); pop = null; host.classList.remove('open'); }
    function read(k) {
      var box = q('.dgrp[data-k="' + k + '"] .dn'), nm = k === 'a' ? '开始' : '结束';
      var v = box.map(function (x) { return parseInt(x.value, 10); }), y = v[0], m = v[1], d = v[2];
      if (!(y >= 2000 && y <= 2100)) return { err: nm + '日期的年份要填 4 位，比如 ' + new Date().getFullYear(), el: box[0] };
      if (!(m >= 1 && m <= 12)) return { err: nm + '日期的月份要在 1 到 12 之间', el: box[1] };
      if (!(d >= 1 && d <= 31)) return { err: nm + '日期的日子要在 1 到 31 之间', el: box[2] };
      var last = new Date(y, m, 0).getDate();
      if (d > last) { d = last; box[2].value = d; }
      return HY.ymd(new Date(y, m - 1, d));
    }
    function apply() {
      var a = read('a'), b = read('b'), t = today(), bad = typeof a === 'object' ? a : typeof b === 'object' ? b : null;
      if (bad) { err(bad.err); bad.el.focus(); bad.el.select(); return; }
      if (a > b) { err('结束日期（' + (+b.slice(5, 7)) + '/' + (+b.slice(8, 10)) + '）比开始日期（' + (+a.slice(5, 7)) + '/' + (+a.slice(8, 10)) + '）早，改一下');
        var e = q('.dgrp[data-k="b"] .dn')[0]; e.focus(); e.select(); return; }
      if (a > t) { err('开始那天（' + (+a.slice(5, 7)) + '/' + (+a.slice(8, 10)) + '）还没到'); return; }
      if (b > t) b = t;
      close(); pick('custom', a, b);
    }
    function pick(p, f, t) {
      var r = periodRange(p, f, t, opt.first ? opt.first() : null);
      show(p, r.from, r.to);
      opt.onPick(p, r.from, r.to);
    }

    host.addEventListener('click', function (e) {
      var a = e.target.closest('a[data-p]');
      if (a && a.parentNode === host) {
        e.stopPropagation();
        if (a.dataset.p === 'custom') { if (pop) close(); else open(); return; }
        close(); pick(a.dataset.p); return;
      }
      if (!pop || !e.target.closest('.fpop')) return;
      e.stopPropagation();
      if (e.target.closest('.dok')) apply();
    });
    host.addEventListener('focusin', function (e) { if (e.target.classList.contains('dn')) setTimeout(function () { e.target.select(); }, 0); });
    host.addEventListener('input', function (e) {
      var x = e.target; if (!x.classList.contains('dn')) return;
      x.value = x.value.replace(/\D/g, ''); err('');
      if (x.value.length >= x.maxLength) { var all = q('.dn'), n = all[all.indexOf(x) + 1]; if (n) { n.focus(); n.select(); } }
    });
    host.addEventListener('keydown', function (e) {
      var x = e.target; if (!x.classList || !x.classList.contains('dn')) return;
      if (e.key === 'Enter') { e.preventDefault(); apply(); return; }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); x.value = Math.max(0, (parseInt(x.value, 10) || 0) + (e.key === 'ArrowUp' ? 1 : -1)); x.select(); }
    });
    document.addEventListener('click', function (e) { if (pop && !host.contains(e.target)) close(); });
    document.addEventListener('keydown', function (e) { if (pop && e.key === 'Escape') { e.stopPropagation(); close(); } }, true);

    return { show: show, close: close, pick: pick };
  }

  HY.rangeSeg = rangeSeg;
  HY.periodRange = periodRange;
})();
