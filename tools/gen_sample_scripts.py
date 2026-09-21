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
    """按 序号 轮换 内容方向 / 拍摄形式，保证同一家店不会连着几天同一个套路。

    台词里的每个变量和每一幕的说法，都按「门店编号 | 日期 | 槽位」从
    content_lib.SAY / FORMATS 的候选里**确定性**地挑一条（见 L.pick）。
    这是 2026-09-21 加的，起因：原来每幕台词写死一句，
    95492 条台词去重只剩 420 句，**43 家店同一天念的是同一句话**。
    """
    topic = TOPIC_KEYS[seq % len(TOPIC_KEYS)]
    fmt = FORMAT_KEYS[(seq // 2 + seq // len(TOPIC_KEYS)) % len(FORMAT_KEYS)]
    t, f = L.TOPICS[topic], L.FORMATS[fmt]

    salt = "%s|%s" % (store["code"], date.isoformat())

    # 每家店一个固定的起点偏移：同一天 43 家店不会齐刷刷挑到同一条
    off = L.offset(store["code"])

    # 书面字段先铺一层（{product}/{service}/{audience} 这些没有口语版，照用），
    # 再用口语版**盖掉** cause/symptom/promise/home/objection —— 台词只念口语版。
    #
    # 口语版按 **round**（= 这个方向轮到第几回）轮换，不是按 seq：
    # topic 每 12 天转回来一次，按 seq 轮换的话 12 % 3 == 0，
    # 每次轮到同一个方向都会挑到同一条，等于白做。
    ctx = dict(t)
    ctx.update(topic=topic, format=fmt, store=store["storeName"])
    rnd = seq // len(TOPIC_KEYS)
    for ki, (k, opts) in enumerate(sorted(L.SAY[topic].items())):
        ctx[k] = L.rot(opts, rnd + off + ki * 2)

    # 每一幕的说法按 **seq** 轮换，步长跟候选数（4）互质 ——
    # 这样**相邻两天一定不同**，不会出现连着两天念同一句开场白。
    shots = []
    for i, (scene, lines, sec) in enumerate(f["shots"]):
        line = L.rot(lines, seq * 3 + i * 5 + off)
        shots.append({"scene": fill(scene, ctx), "line": fill(line, ctx), "sec": sec})

    # 标题也得散开，不然 43 家店同一天标题一模一样。
    # 口语句子本身带逗号，整句塞进标题会散成一片读不动；
    # 但只截第一个分句又常常截得没意思（「少用一点」）。
    # 折中：从头往后凑分句，凑够 8 个字就停，最多 16 个字。
    def head(x):
        parts, out = x.split("，"), ""
        for seg in parts:
            out = seg if not out else out + "，" + seg
            if len(out) >= 8:
                break
        return out[:16]

    title_forms = [
        "%s｜%s" % (topic, head(ctx["symptom"])),
        "%s｜%s" % (topic, head(ctx["promise"])),
        "%s｜别再%s" % (topic, head(ctx["home"])),
        "%s｜%s" % (topic, head(ctx["cause"])),
        "%s｜%s？" % (topic, ctx["objection"]),
    ]
    first = L.pick(title_forms, salt + "|title")
    titles = [first] + [x for x in title_forms if x != first][:2]
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
        "hook": shots[0]["line"],
        "shots": shots,
        "duration": f["duration"],
        "cover": fill(f["cover"], ctx),
        "bgm": L.BGMS[seq % len(L.BGMS)],
        # 店员只有一部手机，道具只列店里现成的东西（2026-09-17 用户要求）
        "props": ["一部手机（靠纸巾盒/毛巾卷固定）", t["product"], "镜子 + 干净毛巾"],
        # 别再写「结尾引导：」前缀——页面上本来就有这个小标题，会重复一遍
        "cta": ("评论区扣「1」，我私信你适配方案" if seq % 3 == 0
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
