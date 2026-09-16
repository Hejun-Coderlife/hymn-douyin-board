# -*- coding: utf-8 -*-
"""把 data/*.json 包成页面能直接 <script> 载入的 js（双击 file:// 打开也能读到）。

分片策略（为了 43 店 × 每天 1 条的体量）：
  data/stores.js              门店档案，全量
  data/scripts-index.js       **轻索引**：每条只留 id/store/date/topic/format/tag
                              —— 日历大表、状态计算、完成率全靠它，必须一次加载
  data/scripts/<门店编号>-<年月>.js  **完整详情**（分镜/标题/封面/要点…），
                              按「门店 × 月份」切片，点开侧栏 / 门店页翻到那个月时
                              才按需注入 <script> 加载。切得细是因为数据到了一整年，
                              按门店整份会有 700KB+，手机端吃不消。

JSON 是唯一数据源；改完 JSON 跑一次本脚本。
build_stores.py / gen_sample_scripts.py 结尾会自动调用。
"""
import json
import pathlib
import shutil

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SHARD_DIR = DATA / "scripts"

HEAD = "/* 自动生成，请勿直接改。源文件 data/%s，改完跑 python3 tools/sync_data.py */\n"
INDEX_FIELDS = ["id", "store", "date", "topic", "format", "tag"]


def dump(obj):
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def sync_stores():
    p = DATA / "stores.json"
    if not p.exists():
        return []
    stores = json.loads(p.read_text(encoding="utf-8"))
    (DATA / "stores.js").write_text(
        HEAD % "stores.json" + "window.HY_STORES=%s;\n" % dump(stores), encoding="utf-8")
    print("同步 stores.json -> stores.js（%d 家）" % len(stores))
    return stores


def sync_scripts(stores):
    p = DATA / "scripts.json"
    if not p.exists():
        return
    scripts = json.loads(p.read_text(encoding="utf-8"))
    code_of = {s["douyinId"]: s.get("code", "S00") for s in stores}

    # 1) 轻索引
    index = [{k: s.get(k, "") for k in INDEX_FIELDS} for s in scripts]
    (DATA / "scripts-index.js").write_text(
        HEAD % "scripts.json" + "window.HY_SCRIPTS=%s;\n" % dump(index), encoding="utf-8")

    # 2) 按门店分片的完整详情
    if SHARD_DIR.exists():
        shutil.rmtree(SHARD_DIR)
    SHARD_DIR.mkdir(parents=True)

    by_shard = {}
    for s in scripts:
        key = "%s-%s" % (code_of.get(s["store"], "S00"), s["date"][:7])
        by_shard.setdefault(key, []).append(s)

    total_kb = 0
    for key, arr in sorted(by_shard.items()):
        obj = {s["id"]: s for s in arr}
        txt = (HEAD % "scripts.json" +
               "window.HY_DETAIL=window.HY_DETAIL||{};"
               "Object.assign(window.HY_DETAIL,%s);"
               "(window.HY_DETAIL_LOADED=window.HY_DETAIL_LOADED||{})['%s']=1;\n" % (dump(obj), key))
        f = SHARD_DIR / ("%s.js" % key)
        f.write_text(txt, encoding="utf-8")
        total_kb += len(txt.encode("utf-8")) / 1024

    idx_kb = (DATA / "scripts-index.js").stat().st_size / 1024
    sizes = sorted(f.stat().st_size for f in SHARD_DIR.iterdir())
    print("同步 scripts.json -> scripts-index.js（%d 条，%.1fMB）+ scripts/ 下 %d 个分片"
          "（合计 %.1fMB，单片中位 %.0fKB，按需加载）"
          % (len(scripts), idx_kb / 1024, len(by_shard), total_kb / 1024,
             sizes[len(sizes) // 2] / 1024))

    # 旧的单体文件不再使用，清掉免得误引
    old = DATA / "scripts.js"
    if old.exists():
        old.unlink()
        print("（已删除旧的单体 data/scripts.js）")


def sync():
    stores = sync_stores()
    sync_scripts(stores)


if __name__ == "__main__":
    sync()
