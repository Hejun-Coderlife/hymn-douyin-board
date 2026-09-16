# -*- coding: utf-8 -*-
"""把 data/*.json 包成 data/*.js（挂全局变量），让双击 file:// 打开也能读到数据。

JSON 是唯一数据源，改完 JSON 跑一次本脚本即可。
build_stores.py / gen_sample_scripts.py 结尾会自动调用。
"""
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
PAIRS = [("stores.json", "stores.js", "HY_STORES"),
         ("scripts.json", "scripts.js", "HY_SCRIPTS")]


def sync():
    for src, dst, var in PAIRS:
        p = DATA / src
        if not p.exists():
            continue
        obj = json.loads(p.read_text(encoding="utf-8"))
        body = json.dumps(obj, ensure_ascii=False, separators=(',', ':'))
        (DATA / dst).write_text(
            "/* 自动生成，请勿直接改。源文件 data/%s，改完跑 python3 tools/sync_data.py */\n"
            "window.%s=%s;\n" % (src, var, body), encoding="utf-8")
        print("同步 %s -> %s（%d 条）" % (src, dst, len(obj)))


if __name__ == "__main__":
    sync()
