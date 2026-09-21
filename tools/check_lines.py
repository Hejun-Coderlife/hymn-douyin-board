# -*- coding: utf-8 -*-
"""台词体检：把「整句当名词用」和 AI 腔的句子揪出来。

**为什么需要这个**：SAY 里的 {cause}/{home}/{symptom} 都是**完整的句子**
（「不是粉底不好，是皮太干抓不住」），但台词模板里很容易顺手把它当**名词**用
（「买它主要是冲着{cause}去的」），拼出来就是病句。
肉眼看模板看不出来，必须把 12 个方向 × 所有变体真拼一遍才现形。

用法: python3 tools/check_lines.py        # 只报告，不改文件
"""
import itertools
import pathlib
import re
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
import content_lib as L

# 变量**前面**不许出现这些词：它们后面要接名词，接整句就成了病句
BAD_BEFORE = ["是", "因为", "在", "冲着", "把", "别再", "败在", "针对的是", "就是"]
# 变量**后面**不许紧跟这些：同理
BAD_AFTER = ["的人", "这件事", "去的", "上。", "呢？", "了，", "了。"]
# 用户点名要干掉的 AI 腔
AI_TELLS = r"问题出在这儿|真实情况是|先说结论|记住一句话|核心解决的是|今天想说说|今天重点讲|第 ?\d{2,} ?遍|\d{2,} ?% ?的人|就像.{0,8}一样"
# 台词里**不许出现第二个人**。分单人/两人版的是**画面**（FORMATS 的 solo），
# 台词两边共用 —— 梅林店只有一个店员，台词里冒出「同事帮我做」就穿帮了。
NEED_TWO = r"同事|搭档|两人|两个店员|帮我拍|帮忙拍"

VARS = ["cause", "symptom", "promise", "home", "objection"]


def scan():
    bad = []
    for fname, f in L.FORMATS.items():
        for i, (_scene, lines, _sec) in enumerate(f["shots"]):
            for tpl in lines:
                for v in VARS:
                    ph = "{%s}" % v
                    at = tpl.find(ph)
                    if at < 0:
                        continue
                    before = tpl[:at]
                    after = tpl[at + len(ph):]
                    for w in BAD_BEFORE:
                        if before.endswith(w):
                            bad.append(("%s 第%d幕" % (fname, i + 1), tpl,
                                        "「%s」后面直接跟了整句 %s" % (w, ph)))
                    for w in BAD_AFTER:
                        if after.startswith(w):
                            bad.append(("%s 第%d幕" % (fname, i + 1), tpl,
                                        "整句 %s 后面直接跟了「%s」" % (ph, w)))
                if re.search(AI_TELLS, tpl):
                    bad.append(("%s 第%d幕" % (fname, i + 1), tpl, "AI 腔"))
                if "+" in tpl:
                    bad.append(("%s 第%d幕" % (fname, i + 1), tpl, "台词里有 + 号"))
                if re.search(NEED_TWO, tpl):
                    bad.append(("%s 第%d幕" % (fname, i + 1), tpl,
                                "台词里提到第二个人（独苗店念不了，要分只能分画面）"))
    return bad


def check_solo():
    """独苗店（stores.json 里 staff=="1"）能用的形式，画面里不许还要第二个人。"""
    need = re.compile(r"同事|两人|两个店员|店员 ?[AB]|并排坐|递给 A|互相|轮流当")
    bad = []
    for name, f in L.FORMATS.items():
        if f.get("people", 2) != 1 and not f.get("solo"):
            continue                      # 这种形式本来就不派给独苗店
        swap = f.get("solo", {})
        for i, (scene, _l, _s) in enumerate(f["shots"]):
            sc = swap.get(i, scene)
            if need.search(sc):
                bad.append((name, i + 1, sc))
    return bad


def sample_all():
    """把每个模板 × 每个方向真拼一遍，找念不通的长句。"""
    out = []
    for fname, f in L.FORMATS.items():
        for i, (_s, lines, _c) in enumerate(f["shots"]):
            for tpl in lines:
                for topic in L.TOPICS:
                    ctx = dict(L.TOPICS[topic])
                    ctx.update(topic=topic)
                    for k, opts in L.SAY[topic].items():
                        ctx[k] = opts[0]
                    t = tpl
                    for k, v in ctx.items():
                        t = t.replace("{" + k + "}", str(v))
                    out.append((fname, i + 1, topic, t))
    return out


def main():
    bad = scan()
    if bad:
        print("❌ 模板有问题 %d 处：" % len(bad))
        for where, tpl, why in bad:
            print("  [%s] %s\n      → %s" % (where, tpl, why))
    else:
        print("✅ 模板检查通过：没有把整句当名词用，也没有 AI 腔和 + 号")

    solo = check_solo()
    if solo:
        print("\n❌ 独苗店会拿到需要第二个人的画面 %d 处：" % len(solo))
        for n, i, sc in solo:
            print("  [%s 第%d幕] %s" % (n, i, sc))
    else:
        print("✅ 独苗店可用的形式，画面全部一个人能拍")

    rows = sample_all()
    longs = [r for r in rows if r[3].count("，") >= 4]
    print("\n真拼一遍共 %d 句；四个逗号以上（念着断不开）的 %d 句" % (len(rows), len(longs)))
    for r in longs[:12]:
        print("  [%s 第%d幕|%s] %s" % r)
    return 1 if (bad or solo) else 0


if __name__ == "__main__":
    sys.exit(main())
