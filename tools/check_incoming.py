# -*- coding: utf-8 -*-
"""体检外部（GPT）生成的脚本 JSON，进库之前先跑这个。

用法: python3 tools/check_incoming.py ~/Downloads/脚本.json

查的东西都是踩过的坑，别删：
  · 空槽    —— 「两样东西并排摆好」这种写了等于没写，店员不知道摆什么
  · 器材    —— 店里只有一部手机，没有补光灯/三脚架/检测仪
  · 顾客    —— 顾客只能出现在台词里，不能出现在画面里（约不到人）
  · 人手    —— people=1 的条目，画面里不许有同事
  · AI 腔   —— 「先说结论：」这类起手式，以及台词里的 + 号
  · 违禁词  —— 绝对化和医疗用语会被平台限流
  · 重复    —— 43 家店要铺一整年，撞车就穿帮
"""
import collections
import io
import json
import re
import sys

TOPICS = ["敏感肌", "补水保湿", "抗初老", "毛孔粗大", "黄气暗沉", "痘肌调理",
          "眼周护理", "颈纹", "日常防晒", "屏障修护", "妆容教学", "到店体验"]

VAGUE = r"两样东西|这些东西|那些东西|对应的|合适的|相关的|适当的|某个|一些道具|若干"
GEAR = r"补光灯|三脚架|稳定器|云台|检测仪|水分笔|紫外线|白板|绿幕|单反|相机|剪辑软件|PR|达芬奇|降饱和|延时"
CUSTOMER = r"顾客|客人|客户|会员"
TWO = r"同事|搭档|两人|两个店员|店员\s?[AB]|并排坐|互相|轮流|帮我拍|帮忙拍"
AI_TELL = r"问题出在这儿|真实情况是|先说结论|记住一句话|核心解决的是|今天想说说|今天重点讲|众所周知|不难发现|综上|首先.*其次|就像.{0,8}一样"
FAKE_NUM = r"第\s?\d{2,}\s?遍|\d{2,}\s?%\s?的人|百分之\d+"
BANNED = r"最好|第一|根治|治愈|疗效|药效|医美级|永久|彻底解决|保证"


def main(path):
    d = json.loads(io.open(path, encoding="utf-8").read())
    bad = collections.defaultdict(list)

    def flag(kind, i, detail):
        bad[kind].append("#%02d %s" % (i + 1, detail))

    for i, x in enumerate(d):
        t = x.get("topic", "")
        if t not in TOPICS:
            flag("topic 不在 12 个方向里", i, t)
        if x.get("people") not in (1, 2):
            flag("people 不是 1 或 2", i, repr(x.get("people")))

        g = x.get("gist", "")
        if not g:
            flag("gist 空着", i, "")
        elif len(g) > 25:
            flag("gist 超过 25 字", i, "%d 字：%s" % (len(g), g))

        shots = x.get("shots") or []
        if not 5 <= len(shots) <= 6:
            flag("幕数不是 5~6", i, "%d 幕" % len(shots))
        total = sum(s.get("sec") or 0 for s in shots)
        if not 20 <= total <= 45:
            flag("总时长不在 20~45 秒", i, "%d 秒" % total)

        for j, s in enumerate(shots, 1):
            sc, ln = s.get("scene", "") or "", s.get("line", "") or ""
            if not sc:
                flag("画面空着", i, "第%d幕" % j)
            if not ln:
                flag("台词空着", i, "第%d幕" % j)
            for pat, kind in [(VAGUE, "画面写了空槽（店员不知道要什么）"),
                              (GEAR, "画面要专业器材（店里只有一部手机）"),
                              (CUSTOMER, "画面里要顾客（顾客只能出现在台词里）")]:
                m = re.search(pat, sc)
                if m:
                    flag(kind, i, "第%d幕「%s」→ %s" % (j, m.group(0), sc[:34]))
            if x.get("people") == 1:
                m = re.search(TWO, sc)
                if m:
                    flag("标了一个人能拍，画面里却要第二个人", i,
                         "第%d幕「%s」→ %s" % (j, m.group(0), sc[:34]))
            for pat, kind in [(AI_TELL, "台词有 AI 腔"), (FAKE_NUM, "台词编数字"),
                              (BANNED, "台词有违禁词（平台会限流）")]:
                m = re.search(pat, ln)
                if m:
                    flag(kind, i, "「%s」→ %s" % (m.group(0), ln[:34]))
            if "+" in ln:
                flag("台词里有 + 号（念不出来）", i, ln[:40])
            if len(ln) > 45:
                flag("台词太长（一口气念不完）", i, "%d 字：%s" % (len(ln), ln[:34]))

        if len(x.get("hashtags") or []) < 3:
            flag("标签少于 3 个", i, str(x.get("hashtags")))

    print("共 %d 条" % len(d))
    n1 = sum(1 for x in d if x.get("people") == 1)
    print("一个人能拍的 %d 条（%.0f%%，要求不低于 33%%）" % (n1, n1 * 100.0 / max(len(d), 1)))
    print("内容方向 %d 种：%s" % (len(set(x.get("topic") for x in d)),
                             dict(collections.Counter(x.get("topic") for x in d))))
    print("拍摄形式 %d 种：%s" % (len(set(x.get("format") for x in d)),
                             dict(collections.Counter(x.get("format") for x in d))))

    for name, key in [("标题", "title"), ("gist", "gist")]:
        c = collections.Counter(x.get(key) for x in d)
        dup = {k: v for k, v in c.items() if v > 1}
        if dup:
            print("\n❌ %s 重复：%s" % (name, dup))
    lines = [s.get("line") for x in d for s in (x.get("shots") or [])]
    c = collections.Counter(lines)
    dup = {k: v for k, v in c.items() if v > 1}
    if dup:
        print("\n❌ 台词重复 %d 句：" % len(dup))
        for k, v in list(dup.items())[:8]:
            print("   %d 次  %s" % (v, k[:40]))

    if not bad:
        print("\n✅ 没查出问题")
        return 0
    print("\n发现 %d 类问题：" % len(bad))
    for kind in sorted(bad, key=lambda k: -len(bad[k])):
        rows = bad[kind]
        print("\n【%s】%d 处" % (kind, len(rows)))
        for r in rows[:6]:
            print("   " + r)
        if len(rows) > 6:
            print("   …还有 %d 处" % (len(rows) - 6))
    return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1]))
