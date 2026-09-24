/* 把「视频数据/」里的抖音来客 xlsx 汇总成两份线上数据：
     data/rank.js    每店每天条数 —— 门店手机页「排行」用
     data/videos.js  视频明细（**不含成交金额**）—— 总部看板打开就有，不用再在页面上导入
                     （2026-09-24 用户：「那你一起同步了」，并选定「除成交金额外都传」）
   成交金额只在本机「视频数据导入」导入 xlsx 后才有，看板上本机数据会盖在线上数据上面。

   以下是原来只做排行时的说明：
   门店视频发布排行：把「视频数据/」里的抖音来客 xlsx 汇总成 data/rank.js，给门店手机页用。
   （2026-09-24 用户：门店页底部「今天」标签换成门店视频发布排行，本周 / 本月可切换）

   为什么要这一步：视频数据只存在总部电脑浏览器的 localStorage 里，店员手机上没有，
   手机页没数可排。所以发布时把各店「每天发了几条」算好，跟着网页一起推上去。

   **线上只放每店每天的条数**，不放视频标题、链接、播放、成交 —— 仓库是公开的，
   「视频数据/」文件夹本身在 .gitignore 里，不会被推上去。

   用法：把「生意经_视频列表_*.xlsx」丢进项目根目录的「视频数据/」，
         node tools/build_rank.js     （发布到线上.command 会自动跑）
   解析沿用 core.js 的 rowsToVideos（同一套列名 / 品牌号排除 / 发布时间解析），
   多个文件按视频ID去重，跟总部看板导入的口径一致。 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const root = path.join(__dirname, '..');
const dir = path.join(root, '视频数据');
const out = path.join(root, 'data', 'rank.js');
const outV = path.join(root, 'data', 'videos.js');

// core.js 顶层会碰 document / setTimeout（浏览器里的加载逻辑），给空壳就行
const ctx = { window: {}, console: console, document: { querySelector: () => null },
              setTimeout: () => 0 };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/core.js'), 'utf8'), ctx);
const HY = ctx.window.HY;

const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => /\.xlsx$/i.test(f) && !/^(~\$|\.)/.test(f)) : [];
if (!files.length) {
  console.log('   「视频数据」文件夹里没有 xlsx，排行沿用上次的数据');
  process.exit(0);
}

const videos = {};
let rangeTo = '';
files.forEach(f => {
  const wb = XLSX.read(fs.readFileSync(path.join(dir, f)), { type: 'buffer' });
  // raw:false 让大数按显示文本出来，19 位视频ID 才不会精度丢失（同 board.js）
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
  const r = HY.rowsToVideos(rows);
  r.videos.forEach(v => { videos[v.id] = v; if (v.rangeTo > rangeTo) rangeTo = v.rangeTo; });
  console.log('   ' + f + '：' + r.videos.length + ' 条');
});

const counts = {};
let n = 0;
Object.keys(videos).forEach(k => {
  const v = videos[k];
  if (!v.pubDate) return;
  const c = counts[v.store] = counts[v.store] || {};
  c[v.pubDate] = (c[v.pubDate] || 0) + 1;
  n++;
});
// 数据截至：取导出的统计范围终点（20260915 -> 2026-09-15）
const upto = /^\d{8}$/.test(rangeTo)
  ? rangeTo.slice(0, 4) + '-' + rangeTo.slice(4, 6) + '-' + rangeTo.slice(6) : '';

// 更新时间 = 这次生成的时间（门店排行页上显示「更新于」）
const now = new Date(), p2 = x => String(x).padStart(2, '0');
const updated = now.getFullYear() + '-' + p2(now.getMonth() + 1) + '-' + p2(now.getDate()) +
  ' ' + p2(now.getHours()) + ':' + p2(now.getMinutes());
fs.writeFileSync(out,
  '/* 由 tools/build_rank.js 生成，别手改。每店每天发布的视频条数 */\n' +
  'window.HY_RANK = ' + JSON.stringify({ updated: updated, upto: upto, counts: counts }) + ';\n');
// 明细：去掉成交金额（直接成交 / 总成交价值），其余字段抖音上本来就公开
const pub = Object.keys(videos).map(k => {
  const v = videos[k];
  return { id: v.id, store: v.store, title: v.title, url: v.url, pubDate: v.pubDate, pubTs: v.pubTs,
           play: v.play, validPlay: v.validPlay, rangeFrom: v.rangeFrom, rangeTo: v.rangeTo };
}).sort((a, b) => a.pubTs - b.pubTs || (a.id < b.id ? -1 : 1));   // 固定顺序：没变就不产生 git 改动
fs.writeFileSync(outV,
  '/* 由 tools/build_rank.js 生成，别手改。视频明细（不含成交金额） */\n' +
  'window.HY_VIDEOS_PUB = ' + JSON.stringify({ upto: upto, videos: pub }) + ';\n');
console.log('   看板视频明细：' + pub.length + ' 条（不含成交金额）');
console.log('   排行数据：' + Object.keys(counts).length + ' 店 ' + n + ' 条视频' + (upto ? '，数据截至 ' + upto : ''));
