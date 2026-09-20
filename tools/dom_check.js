/* 在 Node 里把页面真跑一遍，打印某块的文字 —— 用来验证改动，不用开浏览器。
   （无头 Chrome 在这个项目上不靠谱：--dump-dom 出不来东西、截图也不准，别再试了。）

   准备：npm install --prefix /tmp/jsdomtest jsdom
   起服务：python3 -m http.server 8765      # file:// 下 jsdom 不给 localStorage，必须走 http
   跑：
     node tools/dom_check.js '#view=effect' '#p-effect'
     node tools/dom_check.js '#view=effect' '#effDimBody' --seed=/tmp/fakevideos.json \
          --click='#effDims .segbtn[data-dim="topic"]'
   参数：
     第 1 个  打开的 hash（空字符串就是首页）
     第 2 个  要打印的选择器，默认 body
     --page=store.html?store=93417760155   换一个页面
     --seed=<json>   塞进 localStorage 的视频数据（tools/fake_videos.js 出来的那份）
     --click=<sel>   打印前先点一下（可以给多个，按顺序点）
     --wait=4000     等多久再打印
*/
const fs = require('fs');
const { JSDOM, VirtualConsole } = require('/tmp/jsdomtest/node_modules/jsdom');

const args = process.argv.slice(2);
const flag = (k, d) => {
  const hit = args.find(a => a.startsWith('--' + k + '='));
  return hit ? hit.slice(k.length + 3) : d;
};
const plain = args.filter(a => !a.startsWith('--'));
const hash = plain[0] || '', sel = plain[1] || 'body';
const page = flag('page', 'index.html'), wait = +flag('wait', 4000);
const clicks = args.filter(a => a.startsWith('--click=')).map(a => a.slice(8));
const seedFile = flag('seed', '');

const vc = new VirtualConsole(), errs = [];
vc.on('jsdomError', e => errs.push('JSDOM: ' + (e.stack || e.message)));
vc.on('error', (...a) => errs.push('console.error: ' + a.join(' ')));

JSDOM.fromURL('http://localhost:8765/' + page + hash, {
  runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
  beforeParse(w) {
    if (seedFile) w.localStorage.setItem('hymn_videos_v1', fs.readFileSync(seedFile, 'utf8'));
  }
}).then(dom => {
  const w = dom.window, d = w.document;
  return new Promise(r => w.setTimeout(r, wait)).then(() => {
    clicks.forEach(c => {
      const el = d.querySelector(c);
      if (!el) { console.log('!! 点不到：' + c); return; }
      el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    });
    const el = d.querySelector(sel);
    console.log('=== 报错 ===\n' + (errs.length ? errs.join('\n').slice(0, 3000) : '(无)'));
    console.log('=== ' + sel + ' ===');
    console.log(el ? el.textContent.replace(/[ \t]+/g, ' ').replace(/\n{2,}/g, '\n').trim() : '找不到这个元素');
    process.exit(0);
  });
}).catch(e => { console.log('挂了：', e.stack); process.exit(1); });
