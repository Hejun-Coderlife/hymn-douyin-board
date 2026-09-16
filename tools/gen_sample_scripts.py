# -*- coding: utf-8 -*-
"""生成 data/scripts.json 的示例占位数据。

第一版用：覆盖前 N 家门店 × （往前 2 周 + 往后 13 周），每店每周 2 条。
真脚本由 AI 生成后直接替换本文件的产物，页面逻辑不依赖这里。
用法: python3 tools/gen_sample_scripts.py [门店数] [基准日期YYYY-MM-DD]
"""
import datetime as dt
import json
import pathlib
import random
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
STORES = ROOT / "data" / "stores.json"
OUT = ROOT / "data" / "scripts.json"

WEEKS_BACK, WEEKS_FWD = 2, 13   # 往前 2 周用来演示「归档」和「已发布」
PER_WEEK = 2

TOPICS = [
    ("敏感肌", "换季泛红、刺痛的顾客最关心"),
    ("补水保湿", "干皮起皮、上妆卡粉"),
    ("抗初老", "法令纹、苹果肌下垂"),
    ("毛孔粗大", "鼻翼两颊草莓鼻"),
    ("黄气暗沉", "熬夜脸、气色差"),
    ("痘肌调理", "闭口、痘印"),
    ("眼周护理", "黑眼圈、细纹"),
    ("颈纹", "低头族"),
    ("日常防晒", "晒黑晒斑"),
    ("屏障修护", "过度清洁、烂脸自救"),
    ("妆容教学", "通勤淡妆、约会妆"),
    ("到店体验", "进店到离店全流程"),
]
FORMATS = ["前后对比", "手法特写", "顾客证言", "科普口播", "一日vlog",
           "产品开箱", "情景剧", "提问互动"]
HOOKS = [
    "「这张脸，三次就换了个人」",
    "「别再花冤枉钱了，先看完这条」",
    "「我们店最贵的不是产品，是这双手」",
    "「你以为的补水，其实在毁脸」",
    "「顾客问了 100 遍的问题，今天讲清楚」",
    "「30 秒，看她的脸发生了什么」",
]
SCENES = [
    "门店门头推近，店员开门微笑",
    "顾客素颜坐下，正面特写",
    "护理床全景，手法慢镜",
    "产品排列特写，手指划过",
    "皮肤检测仪屏幕特写",
    "护理后顾客照镜子，笑",
    "前后对比分屏",
    "收银台扫码，顾客挥手离店",
]
LINES = [
    "先看她的状态——泛红、干、一摸就烫。",
    "这一步是最关键的，很多人在家做反了。",
    "我们不推项目，先把屏障养回来。",
    "同样的灯光、同样的角度，没有滤镜。",
    "三次之后，她自己都愣住了。",
    "在家做不到的，是这个温度和手法。",
    "姐妹们，别再乱叠护肤品了。",
    "想试的，评论区扣个 1。",
]
BGMS = ["轻柔钢琴 - 治愈系", "国风轻音乐", "轻快流行卡点", "舒缓弦乐", "抖音热榜BGM（跟最新）"]
PROPS = [["皮肤检测仪", "补光灯"], ["护理床", "毛巾", "热喷"], ["主推产品套装", "托盘"],
         ["手持补光", "三脚架"], ["门店易拉宝", "会员卡"]]
CTAS = [
    "结尾引导：点左下角，到店先做一次免费皮肤检测",
    "结尾引导：评论区扣「1」，我私信你适配方案",
    "结尾引导：主页领新客体验券，到店核销",
    "结尾引导：想看第二期的点个关注，下条讲手法",
]


def monday(d):
    return d - dt.timedelta(days=d.weekday())


def main():
    limit = int(sys.argv[1]) if len(sys.argv) > 1 else 8
    today = dt.date.fromisoformat(sys.argv[2]) if len(sys.argv) > 2 else dt.date.today()
    base = monday(today)

    stores = json.loads(STORES.read_text(encoding="utf-8"))[:limit]
    rng = random.Random(20260916)
    out, tag_n = [], 300

    for s in stores:
        start = dt.date.fromisoformat(s["startDate"]) if s.get("startDate") else None
        for w in range(-WEEKS_BACK, WEEKS_FWD):
            wk_mon = base + dt.timedelta(weeks=w)
            for n in range(1, PER_WEEK + 1):
                # 一周两条：周二、周五
                date = wk_mon + dt.timedelta(days=1 if n == 1 else 4)
                if start and date < start:
                    continue  # 账号还没开张
                topic, pain = rng.choice(TOPICS)
                fmt = rng.choice(FORMATS)
                tag_n += 1
                shots = [
                    {"scene": rng.choice(SCENES), "line": rng.choice(LINES), "sec": rng.choice([3, 4, 5])}
                    for _ in range(rng.choice([3, 4]))
                ]
                out.append({
                    "id": f"{s['code']}-{wk_mon.isoformat()}-{n}",
                    "tag": f"#赫眉{tag_n:04d}",
                    "store": s["douyinId"],
                    "date": date.isoformat(),
                    "topic": topic,
                    "format": fmt,
                    "title": f"{s['storeName']}·{topic}｜{fmt}",
                    "hook": rng.choice(HOOKS),
                    "shots": shots,
                    "bgm": rng.choice(BGMS),
                    "props": rng.choice(PROPS),
                    "cta": rng.choice(CTAS),
                    "pain": pain,
                })

    out.sort(key=lambda x: (x["date"], x["store"]))
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"写出 {OUT} — {len(out)} 条示例脚本 / {len(stores)} 家门店 / "
          f"{base + dt.timedelta(weeks=-WEEKS_BACK)} ~ {base + dt.timedelta(weeks=WEEKS_FWD-1, days=6)}")


if __name__ == "__main__":
    main()
