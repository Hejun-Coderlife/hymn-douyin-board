/* 定时标记云端同步（2026-10-14）—— Cloudflare Worker + D1，挂在 sched.hemei.asia
   店员在 store.html 点「已排定时」、总部在看板上标，都写到这里；两边打开时都从这里拉。
   键跟前端 HY.Marks 一样：抖音号|日期。表里只存「标了的」，取消 = 删行。

   GET  /marks                → { marks: { "抖音号|日期": 1, ... } }
   GET  /marks?store=抖音号    → 只要这家店的
   POST /marks  { k, on, by }  → 标 / 取消一条（by = 'store' | 'hq'，只记一下谁标的）
   POST /marks/bulk { keys }   → 批量补标（总部本机老标记第一次上云用），只加不删

   不设密码：网页是公开的，放密钥等于没放。能做的坏事只有乱标定时，
   而定时标记本来就「不算完成」，影响有限。键格式严格校验，防止乱写别的东西。 */

const KEY = /^\d{5,15}\|\d{4}-\d{2}-\d{2}$/;
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400'
};

function json(o, status) {
  return new Response(JSON.stringify(o), {
    status: status || 200,
    headers: Object.assign({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }, CORS)
  });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    const db = env.hymn_sched;

    if (url.pathname === '/marks' && req.method === 'GET') {
      const store = url.searchParams.get('store');
      const r = store
        ? await db.prepare('SELECT k FROM marks WHERE k LIKE ?').bind(store.replace(/\D/g, '') + '|%').all()
        : await db.prepare('SELECT k FROM marks').all();
      const marks = {};
      r.results.forEach((x) => { marks[x.k] = 1; });
      return json({ marks });
    }

    if (url.pathname === '/marks' && req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
      if (!b || !KEY.test(b.k || '')) return json({ error: 'bad key' }, 400);
      if (b.on) {
        await db.prepare('INSERT OR REPLACE INTO marks (k, by, at) VALUES (?, ?, ?)')
          .bind(b.k, b.by === 'store' ? 'store' : 'hq', Date.now()).run();
      } else {
        await db.prepare('DELETE FROM marks WHERE k = ?').bind(b.k).run();
      }
      return json({ ok: true, k: b.k, on: !!b.on });
    }

    if (url.pathname === '/marks/bulk' && req.method === 'POST') {
      let b;
      try { b = await req.json(); } catch (e) { return json({ error: 'bad json' }, 400); }
      const keys = ((b && b.keys) || []).filter((k) => KEY.test(k)).slice(0, 5000);
      const now = Date.now();
      const st = db.prepare('INSERT OR IGNORE INTO marks (k, by, at) VALUES (?, ?, ?)');
      for (let i = 0; i < keys.length; i += 50) {
        await db.batch(keys.slice(i, i + 50).map((k) => st.bind(k, 'hq', now)));
      }
      return json({ ok: true, n: keys.length });
    }

    return json({ error: 'not found' }, 404);
  }
};
