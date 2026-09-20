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
  // 背景动效改成纯 CSS（body.fxon，见 style.css）；门店页跟总部页共用同一个开关状态
  if (localStorage.getItem('hymn_bg3d') === 'on') document.body.classList.add('fxon');

  /* 门店从哪来（2026-09-20 加「记住门店」）：
     ① URL 上带 ?store= 就用它，并**记下来**——店员第一次是从二维码/链接/login.html 进来的；
     ② 没带参数就用记住的那家——店员把页面加到手机桌面后，点图标直接是自己店；
     ③ 都没有就送去 login.html 输手机号认人。
     这样「一进去就看到自己的页面」对三种入口都成立。 */
  /* 登录页地址允许被覆盖：预览版要跳预览版的登录页，不然一退出就掉回旧样式。
     没设就是 login.html，真页面行为不变。 */
  var LOGIN = window.HY_LOGIN_PAGE || 'login.html';
  var qs = new URLSearchParams(location.search);
  var id = qs.get('store');
  if (id) {
    HY.MyStore.set(id);
  } else {
    id = HY.MyStore.get();
    if (!id) { location.replace(LOGIN); return; }
  }
  var today = HY.ymd(new Date());

  HY.loadData().then(function (d) {
    var st = d.storeById[id];
    if (!st) {
      /* 记住的门店可能失效（店关了、抖音号换了）。不能让店员卡死在这一屏，
         把记忆清掉并给一个重新认人的入口。 */
      HY.MyStore.clear();
      $('#spName').textContent = '没找到这家门店';
      $('#spSub').innerHTML = '抖音号 ' + esc(id) + ' 不在门店表里。' +
        '<a class="mob" href="' + LOGIN + '">用手机号重新进入 →</a>';
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

    var byDate = {}, byId = {};
    mine.forEach(function (s) { byDate[s.date] = s; byId[s.id] = s; });

    var html = '';
    weeks.forEach(function (w, wi) {
      var isNow = w.days.some(function (x) { return x.today; });
      var days = w.days.filter(function (x) { return byDate[x.date]; });
      /* 一次只展开一周（专注模式）之后，默认就只能开本周。
         原来是「本周 + 下周」都展开，跟一次只开一周自相矛盾。 */
      var open = isNow;
      html += '<div class="wkblock' + (isNow ? ' now' : '') + (open ? ' open' : '') + '">' +
        /* 2026-09-20 用户：「本周保留，第X周改成只显示日期」。
           「第 5 周」这种序号对店员没意义（他们不数周次，只看几号拍什么），
           所以非本周的那些直接拿日期当标题；本周还是「本周 + 日期」。 */
        '<div class="wh"><span class="arrow">▶</span>' +
        (isNow
          ? '本周 <span class="rg">' + HY.md(w.monday) + '–' + HY.md(w.sunday) + '</span>'
          : HY.md(w.monday) + '–' + HY.md(w.sunday)) +
        '<span class="cnt">' + days.length + ' 条</span></div><div class="wb">';
      if (!days.length) html += '<div class="emptyday">本周暂无脚本</div>';
      days.forEach(function (dd) {
        var s = byDate[dd.date];
        var mm = m.byScript[s.id];
        // 店员手机上一般没有视频数据，那就一律按「待拍」显示，不猜发没发
        var stt = hasVideo ? HY.statusOf(s, mm, today) : 'todo';
        html += card(s, dd, mm, stt, hasVideo);
      });
      html += '</div></div>';
    });
    /* 退出登录：店员换店/换人时用。放在列表最底下，不抢正文。
       必须带 ?switch=1 —— login.html 认出这个参数才会清掉记忆并停下来让人重输，
       否则它一看到本机记着门店就直接跳回来了（见 login.html）。 */
    html += '<div class="sp-out"><a class="mob" href="' + LOGIN + '?switch=1">不是这家店？退出 →</a></div>';
    $('#spWeeks').innerHTML = html;

    $$('.wkblock .wh').forEach(function (el) {
      el.onclick = function () {
        var blk = el.parentNode, wasOpen = blk.classList.contains('open');
        /* 一次只开一周（2026-09-20 用户：「日期也是一样，点开后只能看到这一周的内容」）。
           收起这一周 = 退回全部周次的列表。 */
        $$('.wkblock.open').forEach(function (x) { x.classList.remove('open'); });
        $$('.card2.open').forEach(function (x) { x.classList.remove('open'); });  // 换周时把展开的那天也收了
        if (!wasOpen) blk.classList.add('open');
        syncFocus();
        window.scrollTo({ top: 0, behavior: 'auto' });   // 高度骤变，回到顶上最不容易迷路
      };
    });
    /* 展开某天 = 进入「只看这一天」（2026-09-20 用户要求）。
       一次只允许开一条：点开新的，旧的自动收。
       body.focusday 交给 CSS 去藏别的卡片和别的周 ——
       **不在这里直接改样式**，因为总部抽屉复用同一套结构，
       样式挂在 body.hasfx 上，真页面不受影响。 */
    function syncFocus() {
      var open = $('.card2.open');
      document.body.classList.toggle('focusday', !!open);
      document.body.classList.toggle('focusweek', !!$('.wkblock.open'));
      /* 顺手标出「哪一周里有展开的卡片」。
         本来可以用 CSS 的 :has()，但它在旧手机上不支持又不会报错，
         会变成「其它周没藏掉」这种静默失效 —— 用类名最稳。 */
      $$('.wkblock').forEach(function (b) {
        b.classList.toggle('hasopen', !!open && b.contains(open));
      });
    }
    $$('.card2').forEach(function (el) {
      el.onclick = function () {
        var wasOpen = el.classList.contains('open');
        $$('.card2.open').forEach(function (x) { x.classList.remove('open'); });
        if (!wasOpen) el.classList.add('open');
        syncFocus();
        if (!wasOpen) {
          // 收起别的之后页面会跳，把这条滚回顶栏下面（51 顶栏 + 48 周头）
          var y = el.getBoundingClientRect().top + window.pageYOffset - 104;
          window.scrollTo({ top: Math.max(0, y), behavior: 'auto' });
        }
      };
    });
    syncFocus();   // 默认本周是展开的，进页面就该是专注态

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
    $$('.card2 .copyscript').forEach(function (el) {         // 整条脚本拷成文本
      el.onclick = function (e) {
        e.stopPropagation();
        var sc = byId[el.closest('.card2').dataset.id];
        if (!sc) return;
        copyText(scriptText(sc, st.storeName)).then(function (ok) {
          HY.toast(ok ? '整条脚本已复制' : '复制失败，长按选中');
        });
      };
    });
    $$('.card2 .copyall').forEach(function (el) {            // 一键复制这条的全部标签
      el.onclick = function (e) {
        e.stopPropagation();
        var row = el.parentNode.nextElementSibling;
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

  /* 素材里有些台词本身就带「」（比如「{objection}」），外面再套一层就变成「「…」」。
     开头已经是「的就原样用。*/
  function quote(t) {
    t = String(t == null ? '' : t);
    return t.charAt(0) === '\u300c' ? esc(t) : '\u300c' + esc(t) + '\u300d';
  }
  /* 占位数据里 cta 自带「结尾引导：」前缀，上面又有一个同名小标题，重复了。
     生成脚本已经改掉，这里再兜一层，老数据也不会重复。*/
  function ctaText(t) { return String(t == null ? '' : t).replace(/^\u7ed3\u5c3e\u5f15\u5bfc[:\uff1a]\s*/, ''); }

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
    // 今天那条多一个普蓝「今天」角标 —— 店员点开就是来找今天拍什么的。
    var isToday = s.date === today;
    var h = '<div class="card2 ' + stt + (isToday ? ' istoday' : '') + '" data-id="' + esc(s.id) + '">' +
      '<div class="ct">' + (isToday ? '<span class="now">今天</span>' : '') +
      '<span class="dt">' + s.date + '（周' + dd.dow + '）</span>' +
      '<span class="pill ' + stt + '">' + label + '</span>' +
      '<span class="tog"><em class="o">展开</em><em class="c">收起</em><i>▾</i></span></div>' +
      '<h5>' + esc(s.title || (s.topic + '｜' + s.format)) + '</h5>' +
      '<div class="detail">';
    if (m) {
      h += '<a class="vlink" href="' + esc(m.video.url) + '" target="_blank" rel="noopener">已发布：' +
        esc(m.video.title || '（无标题）') + ' ↗</a>';
    }
    // 【极简】2026-09-20 用户：「太复杂了，不适合给所有人看，要极简」。
    // 屏幕上只剩：开头 3 秒 + 分镜（画面/台词/秒数）+ 标签。
    // 砍掉的：拍给谁看（人群/烦恼）、封面、拍摄要点、避坑、现场（BGM/道具）。
    // 数据里这些字段都还在，想找回来就是把下面几行加回去，别去动数据。
    h += '<div class="sechead">开头 3 秒</div><div class="bigline">' + esc(s.hook) + '</div>';
    /* 「分镜」是标题，「6 幕 · 30-40 秒」是附注 —— 包成 .meta 压小压灰，
       不然一整行同样大小，标题反而不突出。 */
    h += '<div class="sechead">分镜<span class="meta">' + (s.shots || []).length + ' 幕 · ' +
         esc(s.duration || '') + '</span></div>';
    (s.shots || []).forEach(function (sh, i) {
      h += '<div class="shot"><div class="n">' + (i + 1) + '</div><div class="bd">' +
        '<div class="sc">' + esc(sh.scene) + '</div>' +
        (sh.line ? '<div class="ln">' + quote(sh.line) + '</div>' : '') +
        '</div><div class="sec">' + (sh.sec || 0) + 's</div></div>';
    });
    // 结尾那句也是要念出来的话，所以并进分镜最后一行，不单开一块
    if (s.cta) {
      h += '<div class="shot end"><div class="n">尾</div><div class="bd">' +
        '<div class="ln">' + quote(ctaText(s.cta)) + '</div></div><div class="sec"></div></div>';
    }
    if (s.hashtags && s.hashtags.length) {
      var tags = s.hashtags.filter(function (t) { return t !== s.tag; });
      h += '<div class="sechead row">话题标签<button class="btnmini copyall" type="button">复制全部标签</button></div>' +
        '<div class="hashrow">' +
        tags.map(function (t) { return '<span>' + esc(t) + '</span>'; }).join('') + '</div>';
    }
    // 店员手上只有一部手机：整条拷进备忘录，拍的时候照着念最省事
    h += '<div class="copyrow"><button class="btnmini copyscript" type="button">复制整条脚本</button></div>';
    h += '</div></div>';
    return h;
  }

  /** 拷进备忘录的纯文本版；内容跟屏幕上看到的一模一样，不多给也不少给 */
  function scriptText(s, storeName) {
    var L = [];
    L.push(s.date + '　' + storeName);
    L.push(s.title || (s.topic + '｜' + s.format));
    L.push('');
    L.push('开头 3 秒：' + (s.hook || ''));
    L.push('');
    (s.shots || []).forEach(function (sh, i) {
      L.push((i + 1) + '. 画面：' + sh.scene + '（' + (sh.sec || 0) + '秒）');
      if (sh.line) L.push('   台词：' + sh.line);
    });
    if (s.cta) L.push('尾. 台词：' + ctaText(s.cta));
    if (s.hashtags && s.hashtags.length) {
      L.push('');
      L.push('标签：' + s.hashtags.filter(function (t) { return t !== s.tag; }).join(' '));
    }
    return L.join('\n');
  }
})();
