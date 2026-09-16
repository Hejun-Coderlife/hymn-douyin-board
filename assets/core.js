/* 赫眉抖音脚本看板 — 公共数据层：加载 / 周次 / 视频库 / 匹配引擎 */
window.HY = (function () {
  'use strict';

  var BRAND_ID = '74892160771';          // 品牌号，不进看板
  var LS_KEY = 'hymn_videos_v1';
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
   * 1) 精确：标题含脚本 tag
   * 2) 兜底：同抖音号 + 发布日落在脚本计划日所在周 + 视频未被占用 -> 推测匹配
   * 3) 剩下的视频 = 自由发挥
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

    // 1) 精确
    scripts.forEach(function (s) {
      var body = String(s.tag || '').replace(/^#/, '').trim();
      if (!body) return;
      var pool = byStore[s.store] || [];
      for (var i = 0; i < pool.length; i++) {
        var v = pool[i];
        if (claimed[v.id]) continue;
        if (v.title && v.title.indexOf(body) !== -1) {
          claimed[v.id] = s.id;
          result[s.id] = { video: v, type: 'exact' };
          break;
        }
      }
    });

    // 2) 兜底（按计划日期先后处理，保证早的脚本先挑早的视频）
    scripts.slice().sort(function (a, b) {
      return a.date < b.date ? -1 : a.date > b.date ? 1 : 0;
    }).forEach(function (s) {
      if (result[s.id]) return;
      var mon = ymd(monday(parseYmd(s.date)));
      var sun = ymd(addDays(parseYmd(mon), 6));
      var pool = byStore[s.store] || [];
      for (var i = 0; i < pool.length; i++) {
        var v = pool[i];
        if (claimed[v.id]) continue;
        if (v.pubDate >= mon && v.pubDate <= sun) {
          claimed[v.id] = s.id;
          result[s.id] = { video: v, type: 'guess' };
          break;
        }
      }
    });

    // 3) 自由发挥
    var free = videos.filter(function (v) { return !claimed[v.id]; });
    return { byScript: result, free: free, claimed: claimed };
  }

  /** 单条脚本的状态：done / guess / late / todo */
  function statusOf(script, matched, todayYmd) {
    if (matched) return matched.type === 'exact' ? 'done' : 'guess';
    return script.date < todayYmd ? 'late' : 'todo';
  }
  var STATUS_CN = { done: '已发布', guess: '已发布·推测', late: '逾期未发', todo: '待拍' };

  /* ---------- 加载 ---------- */
  function loadData() {
    // data/stores.js、data/scripts.js 会把数据挂到 window 上，这样双击 file:// 打开也能读到；
    // 万一没载入（比如只放了 json），再退回 fetch。
    var pre = (window.HY_STORES && window.HY_SCRIPTS)
      ? Promise.resolve([window.HY_STORES, window.HY_SCRIPTS])
      : Promise.all([
          fetch('data/stores.json').then(function (r) { return r.json(); }),
          fetch('data/scripts.json').then(function (r) { return r.json(); })
        ]);
    return pre.then(function (a) {
      var stores = a[0], scripts = a[1];
      var byId = {};
      stores.forEach(function (s) { byId[s.douyinId] = s; });
      // 丢掉不在门店表里的脚本（比如品牌号），避免出现幽灵行
      scripts = scripts.filter(function (s) { return byId[s.store]; });
      return { stores: stores, storeById: byId, scripts: scripts };
    });
  }

  function toast(msg) {
    var el = document.querySelector('.toast');
    if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.appendChild(el); }
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 1800);
  }

  function num(n) { return (n || 0).toLocaleString('zh-CN'); }

  return {
    BRAND_ID: BRAND_ID, LS_KEY: LS_KEY, WEEKS: WEEKS, COL: COL,
    ymd: ymd, parseYmd: parseYmd, monday: monday, addDays: addDays, md: md,
    parsePub: parsePub, buildWeeks: buildWeeks,
    Videos: Videos, rowsToVideos: rowsToVideos,
    match: match, statusOf: statusOf, STATUS_CN: STATUS_CN,
    loadData: loadData, toast: toast, num: num
  };
})();
