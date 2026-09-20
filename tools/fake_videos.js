/* 造一份假的「视频数据」用来验证看板（真数据要从抖音来客导出，本机可能根本没有）。
   用法：node tools/fake_videos.js > /tmp/fakevideos.json
   出来的就是「导出备份 JSON」那个格式，可以直接在页面上「导入备份」，
   也可以喂给 tools/dom_check.js 当 localStorage 种子。
   固定随机种子 -> 每次生成的数一样，方便对比。 */
const fs = require('fs'), vm = require('vm'), path = require('path');
const root = path.join(__dirname, '..');
const ctx = { window: {} }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data/stores.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data/scripts-index.js'), 'utf8'), ctx);
const stores = ctx.window.HY_STORES, scripts = ctx.window.HY_SCRIPTS;

const F = '2026-08-17', T = '2026-09-15', RF = '20260817', RT = '20260915';  // 对齐样例 xlsx 的统计范围
let seed = 1;
const rnd = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };

const videos = {};
let id = 1000000000000000000n;                       // 19 位，跟真视频 ID 一样长，按字符串存
function put(o) { videos[o.id] = o; }

// 1) 45% 的脚本「当天发了」-> 会被 match() 认成已发布
scripts.filter(s => s.date >= F && s.date <= T).forEach(s => {
  if (rnd() > 0.45) return;
  const vid = (id++).toString();
  const base = s.format === '前后对比' ? 1800 : s.format === '科普口播' ? 900 : 1200;
  const play = Math.round(base * (0.4 + rnd() * 1.8)) + (rnd() > 0.97 ? 20000 : 0);  // 偶尔一条爆款
  put({ id: vid, store: s.store, account: '', title: '', url: 'https://www.douyin.com/video/' + vid,
        pubDate: s.date, pubTs: new Date(s.date + 'T12:00:00').getTime(),
        play: play, validPlay: Math.round(play * 0.6),
        gmv: rnd() > 0.75 ? Math.round(rnd() * 900) : 0, direct: 0, rangeFrom: RF, rangeTo: RT });
});
// 2) 每店几条自由发挥 + 一条范围外的老视频（播放 0，用来验证口径过滤有没有生效）
stores.forEach(st => {
  for (let i = 0, n = 1 + Math.floor(rnd() * 4); i < n; i++) {
    const vid = (id++).toString(), d = new Date(2026, 7, 17 + Math.floor(rnd() * 30));
    const play = Math.round(700 * (0.3 + rnd() * 1.6));
    put({ id: vid, store: st.douyinId, account: '', title: '', url: 'u' + vid,
          pubDate: d.toISOString().slice(0, 10), pubTs: d.getTime(), play: play, validPlay: 0,
          gmv: rnd() > 0.85 ? Math.round(rnd() * 600) : 0, direct: 0, rangeFrom: RF, rangeTo: RT });
  }
  const vid = (id++).toString();
  put({ id: vid, store: st.douyinId, account: '', title: '', url: 'o' + vid, pubDate: '2026-06-10',
        pubTs: Date.parse('2026-06-10'), play: 0, validPlay: 0, gmv: 0, direct: 0,
        rangeFrom: RF, rangeTo: RT });
});

process.stdout.write(JSON.stringify({
  videos: videos,
  meta: { imports: [{ at: new Date().toISOString(), file: '假数据 fake_videos.js',
                      added: Object.keys(videos).length, updated: 0, total: Object.keys(videos).length }] }
}));
console.error('假视频 ' + Object.keys(videos).length + ' 条');
