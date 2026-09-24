/* 门店视频发布排行：把「视频数据/」里的抖音来客 xlsx 汇总成 data/rank.js，给门店手机页用。
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

// core.js 顶层会碰 document / setTimeout（浏览器里的加载逻辑），给空壳就行
const ctx = { window: {}, console: console, document: { querySelector: () => null },
              setTimeout: () => 0 };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'assets/core.js'), 'utf8'), ctx);
const HY = ctx.window.HY;

const files = fs.existsSync(dir)
  ? fs.readdirSync(dir).filter(f => /\.xlsx$/i.test(f) && !f.startsWith('~$')) : [];
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

fs.writeFileSync(out,
  '/* 由 tools/build_rank.js 生成，别手改。每店每天发布的视频条数 */\n' +
  'window.HY_RANK = ' + JSON.stringify({ upto: upto, counts: counts }) + ';\n');
console.log('   排行数据：' + Object.keys(counts).length + ' 店 ' + n + ' 条视频' + (upto ? '，数据截至 ' + upto : ''));
