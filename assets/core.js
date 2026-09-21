/* 赫眉抖音脚本看板 — 公共数据层：加载 / 周次 / 视频库 / 匹配引擎 */
window.HY = (function () {
  'use strict';

  var BRAND_ID = '74892160771';          // 品牌号，不进看板
  var LS_KEY = 'hymn_videos_v1';
  var LS_STORE = 'hymn_store_edits_v1';  // 门店档案的人工修改（覆盖 data/stores.json）
  var WEEKS = 13;

  /* ---------- 日期工具（一律以周一为一周开始，全部按本地时区） ---------- */
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') +
           '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseYmd(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function monday(d) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    var wd = (x.getDay() + 6) % 7;           // 周一=0
    x.setDate(x.getDate() - wd);
    return x;
  }
  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function md(s) { var p = String(s).split('-'); return p[1] + '/' + p[2]; }

  /** 抖音导出的「2026/08/25 18:39」-> {date:'2026-08-25', ts:Number} */
  function parsePub(v) {
    if (v == null) return null;
    if (v instanceof Date) return { date: ymd(v), ts: v.getTime() };
    var s = String(v).trim();
    var m = s.match(/(\d{4})\D(\d{1,2})\D(\d{1,2})(?:\D+(\d{1,2})\D(\d{1,2}))?/);
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
    return { date: ymd(d), ts: d.getTime() };
  }

  /** 从今天所在周起，往后 n 周 */
  function buildWeeks(today, n) {
    var base = monday(today || new Date()), out = [];
    for (var i = 0; i < (n || WEEKS); i++) {
      var mon = addDays(base, i * 7);
      out.push({ i: i + 1, monday: ymd(mon), sunday: ymd(addDays(mon, 6)) });
    }
    return out;
  }

  var DOW = ['一', '二', '三', '四', '五', '六', '日'];

  function ymOf(dateStr) { return String(dateStr).slice(0, 7); }
  function monthLabel(ym) {
    var p = ym.split('-');
    return p[0] + ' 年 ' + (+p[1]) + ' 月';
  }
  /** 某个月摊开成天，按周分组（周一开头，首尾补空格子对齐） */
  function buildMonthGrid(ym) {
    var p = ym.split('-'), y = +p[0], mo = +p[1];
    var first = new Date(y, mo - 1, 1), last = new Date(y, mo, 0);
    var t = ymd(new Date()), days = [];
    for (var d = 1; d <= last.getDate(); d++) {
      var day = new Date(y, mo - 1, d);
      var wd = (day.getDay() + 6) % 7;
      days.push({ date: ymd(day), dow: DOW[wd], dd: d, weekend: wd >= 5,
                  today: ymd(day) === t, wstart: wd === 0 });
    }
    return { ym: ym, label: monthLabel(ym), days: days,
             from: ymd(first), to: ymd(last) };
  }
  /** 数据里出现过的月份，从小到大 */
  function monthsIn(scripts) {
    var o = {};
    scripts.forEach(function (s) { o[ymOf(s.date)] = 1; });
    return Object.keys(o).sort();
  }

  /** 同样的 13 周，但摊开到每一天（看板颗粒度 = 天） */
  function buildDayGrid(today, n) {
    var t = ymd(today || new Date());
    return buildWeeks(today, n).map(function (w) {
      var mon = parseYmd(w.monday);
      w.days = [];
      for (var d = 0; d < 7; d++) {
        var day = addDays(mon, d);
        w.days.push({
          date: ymd(day), dow: DOW[d], dd: day.getDate(),
          weekend: d >= 5, today: ymd(day) === t
        });
      }
      return w;
    });
  }

  /* ---------- 视频库（localStorage，累积不覆盖） ---------- */
  var Videos = {
    read: function () {
      try {
        var raw = localStorage.getItem(LS_KEY);
        if (!raw) return { videos: {}, meta: { imports: [] } };
        var o = JSON.parse(raw);
        o.videos = o.videos || {};
        o.meta = o.meta || { imports: [] };
        o.meta.imports = o.meta.imports || [];
        return o;
      } catch (e) {
        return { videos: {}, meta: { imports: [] } };
      }
    },
    write: function (o) { localStorage.setItem(LS_KEY, JSON.stringify(o)); },
    list: function () {
      var o = this.read(), out = [];
      for (var k in o.videos) out.push(o.videos[k]);
      return out;
    },
    meta: function () { return this.read().meta; },
    /** 按「视频ID」去重合并，已存在的用新记录覆盖字段（播放数会更新），不删旧的 */
    merge: function (rows, source) {
      var o = this.read(), added = 0, updated = 0;
      rows.forEach(function (r) {
        if (!r || !r.id) return;
        if (o.videos[r.id]) { updated++; o.videos[r.id] = Object.assign(o.videos[r.id], r); }
        else { added++; o.videos[r.id] = r; }
      });
      o.meta.imports.push({
        at: new Date().toISOString(), file: source || '', added: added,
        updated: updated, total: Object.keys(o.videos).length
      });
      if (o.meta.imports.length > 40) o.meta.imports = o.meta.imports.slice(-40);
      this.write(o);
      return { added: added, updated: updated, total: Object.keys(o.videos).length };
    },
    replaceAll: function (backup) {
      this.write({ videos: backup.videos || {}, meta: backup.meta || { imports: [] } });
    },
    clear: function () { localStorage.removeItem(LS_KEY); }
  };

  /* ---------- xlsx -> 视频记录 ---------- */
  var COL = {
    range: '数据日期范围', id: '视频ID', url: '跳转链接', store: '抖音号',
    account: '抖音号名称', title: '视频标题', pub: '视频发布时间',
    gmv: '视频总成交价值(元)', direct: '视频直接成交金额', play: '视频播放次数',
    validPlay: '视频有效播放次数'
  };

  /** rows = SheetJS sheet_to_json 的对象数组 */
  function rowsToVideos(rows) {
    var out = [], skippedBrand = 0, bad = 0;
    rows.forEach(function (r) {
      var id = r[COL.id] == null ? '' : String(r[COL.id]).trim();
      var store = r[COL.store] == null ? '' : String(r[COL.store]).trim();
      if (!id || !store) { bad++; return; }
      if (store === BRAND_ID) { skippedBrand++; return; }
      var p = parsePub(r[COL.pub]);
      var rg = String(r[COL.range] || '').split('~');
      out.push({
        id: id,
        store: store,
        account: String(r[COL.account] || ''),
        title: String(r[COL.title] == null ? '' : r[COL.title]),
        url: String(r[COL.url] || ''),
        pubDate: p ? p.date : '',
        pubTs: p ? p.ts : 0,
        play: +r[COL.play] || 0,
        validPlay: +r[COL.validPlay] || 0,
        gmv: +r[COL.gmv] || 0,
        direct: +r[COL.direct] || 0,
        rangeFrom: (rg[0] || '').trim(),
        rangeTo: (rg[1] || '').trim()
      });
    });
    return { videos: out, skippedBrand: skippedBrand, bad: bad };
  }

  /* ---------- 匹配引擎 ---------- */
  /**
   * 脚本专属标签已在 2026-09-17 取消（不指望店员记得打标签），同一天当天的「同周兜底」也一起砍了
   * （用户：「当周不要，标签其实你猜不准」）。所以只剩一条规则：
   * 1) 同抖音号 + 发布日 == 计划日 + 视频没被别的脚本占走 -> 算这条脚本发了
   * 2) 剩下的视频 = 自由发挥；脚本过了计划日还没配到 = 逾期
   * 一条视频只匹配一个脚本；一个脚本只取一条视频。
   */
  function match(scripts, videos) {
    var claimed = {};                       // videoId -> scriptId
    var result = {};                        // scriptId -> {video, type}
    var byStore = {};
    videos.forEach(function (v) { (byStore[v.store] = byStore[v.store] || []).push(v); });
    Object.keys(byStore).forEach(function (k) {
      byStore[k].sort(function (a, b) { return a.pubTs - b.pubTs; });
    });

    // 只找「同一天发的」。放宽到一周内的兜底已经删掉：那么猜出来的数字没法用。
    var ordered = scripts.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    });
    function fallback(by) {
      ordered.forEach(function (s) {
        if (result[s.id]) return;
        var from, to;
        if (by === 'day') {
          from = to = s.date;
        } else {
          from = ymd(monday(parseYmd(s.date)));
          to = ymd(addDays(parseYmd(from), 6));
        }
        var pool = byStore[s.store] || [];
        for (var i = 0; i < pool.length; i++) {
          var v = pool[i];
          if (claimed[v.id]) continue;
          if (v.pubDate >= from && v.pubDate <= to) {
            claimed[v.id] = s.id;
            result[s.id] = { video: v, type: 'day', by: by };
            break;
          }
        }
      });
    }
    fallback('day');

    // 剩下的 = 自由发挥
    var free = videos.filter(function (v) { return !claimed[v.id]; });
    return { byScript: result, free: free, claimed: claimed };
  }

  /** 单条脚本的状态：done（计划当天发了）/ late（过了计划日没发）/ todo（还没到日子） */
  function statusOf(script, matched, todayYmd) {
    if (matched) return 'done';
    return script.date < todayYmd ? 'late' : 'todo';
  }
  var STATUS_CN = { done: '已发布', late: '逾期未发', todo: '待拍' };

  /* ---------- 加载 ---------- */
  /* 门店档案的人工编辑：存 localStorage，加载时覆盖到 stores 上 */
  var StoreEdits = {
    read: function () {
      try { return JSON.parse(localStorage.getItem(LS_STORE)) || {}; } catch (e) { return {}; }
    },
    write: function (o) { localStorage.setItem(LS_STORE, JSON.stringify(o)); },
    set: function (douyinId, field, value) {
      var o = this.read();
      o[douyinId] = o[douyinId] || {};
      if (value === '' || value == null) delete o[douyinId][field];
      else o[douyinId][field] = value;
      if (!Object.keys(o[douyinId]).length) delete o[douyinId];
      this.write(o);
    },
    count: function () { return Object.keys(this.read()).length; },
    clear: function () { localStorage.removeItem(LS_STORE); }
  };

  /* 'phone' = 店铺手机号，**只存在本机 localStorage**，导出 stores.json 时会被换成
     phoneHash（见 board.js 的 exportStores），原文永远不进仓库、不上线。 */
  // staff='1' 表示店里只有一个人 —— 生成脚本时只派单人能拍的形式（见 tools/content_lib.py）。
  // 空 = 两个人以上，走全部形式。**漏加进 EDITABLE 就存不住**，区域经理那次踩过。
  var EDITABLE = ['manager', 'region', 'storeType', 'customer', 'mainService', 'scenes', 'onCamera', 'note', 'phone', 'staff'];

  /* 区域经理名单：跟门店分配分开存，这样「加了名字还没分配门店」也留得住 */
  var LS_MGR = 'hymn_managers_v1';
  var Managers = {
    list: function () {
      var a = [];
      try { a = JSON.parse(localStorage.getItem(LS_MGR)) || []; } catch (e) { a = []; }
      return a.filter(Boolean);
    },
    write: function (a) { localStorage.setItem(LS_MGR, JSON.stringify(a)); },
    add: function (name) {
      name = String(name || '').trim();
      if (!name) return false;
      var a = this.list();
      if (a.indexOf(name) !== -1) return false;
      a.push(name); a.sort();
      this.write(a);
      return true;
    },
    remove: function (name) {
      this.write(this.list().filter(function (x) { return x !== name; }));
    }
  };

  /* 只要门店表，不碰脚本索引（login.html 用）。
     【为什么单独做一个】loadData() 要求 HY_STORES 和 HY_SCRIPTS **都**在，
     缺一个就退回 fetch —— 而 file:// 下 fetch 一律失败，登录页会直接白掉。
     登录页也犯不上为了比对一个手机号去加载 2MB 的脚本索引（手机上尤其亏）。 */
  function loadStores() {
    var pre = window.HY_STORES
      ? Promise.resolve(window.HY_STORES)
      : fetch('data/stores.json').then(function (r) { return r.json(); });
    return pre.then(function (raw) {
      var stores = raw.map(function (x) { return JSON.parse(JSON.stringify(x)); });
      var edits = StoreEdits.read();
      stores.forEach(function (s) {
        var e = edits[s.douyinId];
        if (!e) return;
        EDITABLE.forEach(function (k) { if (e[k] !== undefined) s[k] = e[k]; });
      });
      var byId = {};
      stores.forEach(function (s) { byId[s.douyinId] = s; });
      return { stores: stores, storeById: byId };
    });
  }

  function loadData() {
    // data/stores.js、data/scripts.js 会把数据挂到 window 上，这样双击 file:// 打开也能读到；
    // 万一没载入（比如只放了 json），再退回 fetch。
    // data/stores.js + data/scripts-index.js 会把数据挂到 window 上（双击 file:// 也能读到）；
    // 脚本详情不在索引里，点开时再按门店分片按需加载，见 loadDetail()。
    var pre = (window.HY_STORES && window.HY_SCRIPTS)
      ? Promise.resolve([window.HY_STORES, window.HY_SCRIPTS])
      : Promise.all([
          fetch('data/stores.json').then(function (r) { return r.json(); }),
          fetch('data/scripts.json').then(function (r) { return r.json(); })
        ]);
    return pre.then(function (a) {
      var stores = a[0].map(function (x) { return JSON.parse(JSON.stringify(x)); });
      var scripts = a[1];
      var edits = StoreEdits.read();
      stores.forEach(function (s) {
        var e = edits[s.douyinId];
        if (!e) return;
        EDITABLE.forEach(function (k) { if (e[k] !== undefined) s[k] = e[k]; });
      });
      var byId = {};
      stores.forEach(function (s) { byId[s.douyinId] = s; });
      // 丢掉不在门店表里的脚本（比如品牌号），避免出现幽灵行
      scripts = scripts.filter(function (s) { return byId[s.store]; });
      return { stores: stores, storeById: byId, scripts: scripts };
    });
  }

  /* 按「门店编号 × 月份」加载脚本详情分片；file:// 下 fetch 不行，但注入 <script> 可以 */
  var _pending = {};
  function loadDetail(code, ym) {
    if (!code || !ym) return Promise.reject(new Error('缺少门店编号或月份'));
    var key = code + '-' + ym;
    if (window.HY_DETAIL_LOADED && window.HY_DETAIL_LOADED[key]) return Promise.resolve();
    if (_pending[key]) return _pending[key];
    _pending[key] = new Promise(function (resolve, reject) {
      var el = document.createElement('script');
      el.src = 'data/scripts/' + key + '.js';
      el.onload = function () { resolve(); };
      el.onerror = function () {
        delete _pending[key];
        reject(new Error('加载 data/scripts/' + key + '.js 失败'));
      };
      document.head.appendChild(el);
    });
    return _pending[key];
  }
  /** 一次加载多个月（门店页翻月用） */
  function loadDetails(code, yms) {
    return Promise.all(yms.map(function (ym) { return loadDetail(code, ym); }));
  }

  function detail(id) { return (window.HY_DETAIL || {})[id]; }

  function toast(msg) {
    var el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 1800);
  }

  /* 刷新过场：至少显示 BOOT_MIN，渲染完就淡出；3 秒保险，出错也不会把页面盖死。
     BOOT_MIN 卡在 420ms 是为了让 logo 揭字（.38s）跑完，再短就会被切一半。 */
  var BOOT_MIN = 420, bootAt = Date.now(), bootHidden = false;
  function bootDone() {
    if (bootHidden) return;
    bootHidden = true;
    var el = document.getElementById('boot');
    if (!el) { document.body.classList.add('booted'); return; }
    setTimeout(function () {
      el.classList.add('off');
      document.body.classList.add('booted');   // 触发标题区的进场动画
      setTimeout(function () { el.style.display = 'none'; }, 300);
    }, Math.max(0, BOOT_MIN - (Date.now() - bootAt)));
  }
  setTimeout(bootDone, 3000);

  function num(n) { return (n || 0).toLocaleString('zh-CN'); }

  /* ===================== 手机号 → 门店 =====================
     店员在 login.html 输手机号进自己店。性质是**认人，不是鉴权**：
     静态站没有后端，发不了验证码、校验不了密码，任何"验证"都在浏览器里，翻代码就能绕过。
     页面上的脚本本来也不算机密（拿到链接谁都能看），所以够用——但别当成安全措施。

     号码**存哈希不存原文**：上线的 stores.json 里只有 phoneHash，
     真实号码留在你本机的 localStorage 里，不进 git。

     为什么自己写 SHA-256 而不用 crypto.subtle：
     **`crypto.subtle` 只在安全上下文里存在**（https 和 localhost），
     file:// 和局域网 http://192.168.x.x 下**它是 undefined**——
     而这两个恰恰是本地调试和手机预览的主力场景。 */
  var PHONE_SALT = 'hymn-douyin-board-2026';

  function sha256(str) {
    function rotr(x, n) { return (x >>> n) | (x << (32 - n)); }
    var K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    // UTF-8 编码（手机号是纯数字，但盐里有字母，统一按 UTF-8 走）
    var u = unescape(encodeURIComponent(str)), bytes = [];
    for (var i = 0; i < u.length; i++) bytes.push(u.charCodeAt(i) & 0xff);
    var bitLen = bytes.length * 8;
    bytes.push(0x80);
    while (bytes.length % 64 !== 56) bytes.push(0);
    for (var b = 7; b >= 0; b--) bytes.push((b < 4 ? Math.floor(bitLen / Math.pow(2, 8 * b)) : 0) & 0xff);
    var w = new Array(64);
    for (var off = 0; off < bytes.length; off += 64) {
      for (i = 0; i < 16; i++) {
        w[i] = (bytes[off + i * 4] << 24) | (bytes[off + i * 4 + 1] << 16) |
               (bytes[off + i * 4 + 2] << 8) | bytes[off + i * 4 + 3];
      }
      for (i = 16; i < 64; i++) {
        var s0 = rotr(w[i-15],7) ^ rotr(w[i-15],18) ^ (w[i-15] >>> 3);
        var s1 = rotr(w[i-2],17) ^ rotr(w[i-2],19) ^ (w[i-2] >>> 10);
        w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0;
      }
      var a=H[0],bb=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rotr(e,6) ^ rotr(e,11) ^ rotr(e,25);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[i] + w[i]) | 0;
        var S0 = rotr(a,2) ^ rotr(a,13) ^ rotr(a,22);
        var mj = (a & bb) ^ (a & c) ^ (bb & c);
        var t2 = (S0 + mj) | 0;
        h=g; g=f; f=e; e=(d+t1)|0; d=c; c=bb; bb=a; a=(t1+t2)|0;
      }
      H[0]=(H[0]+a)|0; H[1]=(H[1]+bb)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
      H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }

  /* 手机号归一：去掉空格/横杠/+86，只留 11 位数字。
     店员填号码的写法五花八门（138 0000 0000 / 138-0000-0000），不归一就永远对不上。 */
  function normPhone(v) {
    var d = String(v == null ? '' : v).replace(/\D/g, '');
    if (d.length === 13 && d.slice(0, 2) === '86') d = d.slice(2);
    return d;
  }
  function phoneHash(v) {
    var d = normPhone(v);
    return d.length === 11 ? sha256(PHONE_SALT + d).slice(0, 16) : '';
  }

  /* 记住「我是哪家店」——店员第一次进来之后，以后打开就直接是自己店 */
  var LS_MINE = 'hymn_my_store';
  var MyStore = {
    get: function () { try { return localStorage.getItem(LS_MINE) || ''; } catch (e) { return ''; } },
    set: function (id) { try { localStorage.setItem(LS_MINE, id); } catch (e) {} },
    clear: function () { try { localStorage.removeItem(LS_MINE); } catch (e) {} }
  };

  return {
    BRAND_ID: BRAND_ID, LS_KEY: LS_KEY, WEEKS: WEEKS, COL: COL,
    ymd: ymd, parseYmd: parseYmd, monday: monday, addDays: addDays, md: md,
    parsePub: parsePub, buildWeeks: buildWeeks, buildDayGrid: buildDayGrid, DOW: DOW,
    ymOf: ymOf, monthLabel: monthLabel, buildMonthGrid: buildMonthGrid, monthsIn: monthsIn,
    Videos: Videos, rowsToVideos: rowsToVideos,
    StoreEdits: StoreEdits, EDITABLE: EDITABLE, Managers: Managers,
    sha256: sha256, normPhone: normPhone, phoneHash: phoneHash, MyStore: MyStore,
    match: match, statusOf: statusOf, STATUS_CN: STATUS_CN,
    loadData: loadData, loadStores: loadStores, loadDetail: loadDetail, loadDetails: loadDetails, detail: detail, toast: toast, num: num,
    bootDone: bootDone
  };
})();
