# -*- coding: utf-8 -*-
"""生成 data/scripts.json 的示例占位数据。

颗粒度：**每店每天 1 条**。窗口 = 往前 2 周（演示归档/已发布）+ 往后一整年（52 周）。
内容素材在 tools/content_lib.py，真脚本由 AI 生成后直接替换产物。

用法: python3 tools/gen_sample_scripts.py [门店数] [基准日期YYYY-MM-DD]
"""
import datetime as dt
import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import content_lib as L
import sync_data

ROOT = pathlib.Path(__file__).resolve().parent.parent
STORES = ROOT / "data" / "stores.json"
OUT = ROOT / "data" / "scripts.json"

WEEKS_BACK, WEEKS_FWD = 2, 52   # 往前 2 周（演示归档）+ 往后一整年

TOPIC_KEYS = list(L.TOPICS.keys())
FORMAT_KEYS = list(L.FORMATS.keys())


def monday(d):
    return d - dt.timedelta(days=d.weekday())


def fill(text, ctx):
    out = text
    for k, v in ctx.items():
        out = out.replace("{" + k + "}", str(v))
    return out


def build_one(store, date, seq, tag_no):
    """按 序号 轮换 内容方向 / 拍摄形式，保证同一家店不会连着几天同一个套路"""
    topic = TOPIC_KEYS[seq % len(TOPIC_KEYS)]
    fmt = FORMAT_KEYS[(seq // 2 + seq // len(TOPIC_KEYS)) % len(FORMAT_KEYS)]
    t, f = L.TOPICS[topic], L.FORMATS[fmt]

    ctx = dict(t)
    ctx.update(topic=topic, format=fmt, store=store["storeName"])
    shots = [{"scene": fill(s, ctx), "line": fill(l, ctx), "sec": sec} for s, l, sec in f["shots"]]

    titles = [
        "%s｜%s，%s" % (topic, t["symptom"].split("，")[0], t["promise"].split("，")[0]),
        "%s：%s" % (store["storeName"], t["home"]),
        "%s 这样拍｜%s" % (fmt, topic),
    ]
    tag = "#赫眉%04d" % tag_no
    return {
        "id": "%s-%s" % (store["code"], date.isoformat()),
        "tag": tag,
        "store": store["douyinId"],
        "date": date.isoformat(),
        "topic": topic,
        "format": fmt,
        "title": titles[0],
        "titles": titles,
        "audience": t["audience"],
        "pain": t["symptom"],
        "cause": t["cause"],
        "promise": t["promise"],
        "service": t["service"],
        "hook": fill(f["shots"][0][1], ctx),
        "shots": shots,
        "duration": f["duration"],
        "cover": fill(f["cover"], ctx),
        "bgm": L.BGMS[seq % len(L.BGMS)],
        "props": [t["product"], "补光灯", "手机三脚架"],
        "cta": "结尾引导：%s" % ("评论区扣「1」，我私信你适配方案" if seq % 3 == 0
                                else "点左下角，到店先做一次免费皮肤检测" if seq % 3 == 1
                                else "主页领新客体验券，到店核销"),
        "tips": f["tips"],
        "avoid": f["avoid"],
        "hashtags": [tag] + ["#" + k for k in t["keywords"]] + L.COMMON_TAGS,
    }


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 12
    today = dt.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else dt.date.today()
    base = monday(today)
    start = base - dt.timedelta(weeks=WEEKS_BACK)
    end = base + dt.timedelta(weeks=WEEKS_FWD) - dt.timedelta(days=1)

    stores = json.loads(STORES.read_text(encoding="utf-8"))[:limit]
    out, tag_no = [], 300

    for si, s in enumerate(stores):
        open_day = dt.date.fromisoformat(s["startDate"]) if s.get("startDate") else None
        d, seq = start, si * 5          # 每家店错开起始套路，避免全网同一天同一个选题
        while d <= end:
            if open_day and d < open_day:
                d += dt.timedelta(days=1)
                continue
            tag_no += 1
            out.append(build_one(s, d, seq, tag_no))
            seq += 1
            d += dt.timedelta(days=1)

    out.sort(key=lambda x: (x["date"], x["store"]))
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=1), encoding="utf-8")
    print("写出 %s — %d 条脚本 / %d 家门店 / %s ~ %s（每店每天 1 条）"
          % (OUT, len(out), len(stores), start, end))


if __name__ == "__main__":
    main()
    sync_data.sync()
