#!/usr/bin/env python3
"""把「店名 + 店铺手机号」写进门店档案。

存两份，分工明确：
  data/stores.json        只写 phoneHash（sha256(盐+号码) 前 16 位）—— 会进仓库、会上线
  data/phones.local.json  原文号码 —— **不进仓库**（见 .gitignore），本机留底用

盐和截断长度必须跟 assets/core.js 里的 PHONE_SALT / phoneHash 完全一致，改一边另一边就对不上了。

用法：python3 tools/set_phones.py 号码清单.txt
清单每行：<店名或抖音号名称><空白或制表符><手机号>
"""
import hashlib, io, json, os, re, sys

SALT = 'hymn-douyin-board-2026'          # 跟 assets/core.js 的 PHONE_SALT 一致
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def norm_phone(v):
    d = re.sub(r'\D', '', str(v))
    if len(d) == 13 and d.startswith('86'):
        d = d[2:]
    return d

def phone_hash(v):
    d = norm_phone(v)
    return hashlib.sha256((SALT + d).encode('utf-8')).hexdigest()[:16] if len(d) == 11 else ''

def key(name):
    """店名归一：全角括号→半角、去空格、去「赫眉」和品牌线前缀，只留括号里的店名。
    清单里是「赫眉·珀莱雅（古林店）」，档案里是「赫眉·珀莱雅(古林店)」，不归一对不上。"""
    s = str(name).translate(str.maketrans('（）', '()'))
    s = re.sub(r'\s+', '', s)
    m = re.search(r'\(([^)]*)\)', s)
    return m.group(1) if m else s

def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    lines = io.open(sys.argv[1], encoding='utf-8').read().splitlines()

    pairs = []
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        parts = re.split(r'[\s\t]+', ln)
        if len(parts) < 2:
            print('跳过（分不出号码）:', ln); continue
        pairs.append((' '.join(parts[:-1]), parts[-1]))

    sp = os.path.join(ROOT, 'data', 'stores.json')
    stores = json.load(io.open(sp, encoding='utf-8'))
    by_key = {}
    for st in stores:
        by_key.setdefault(key(st.get('accountName') or st.get('storeName')), []).append(st)

    hit, miss, dup, bad = 0, [], [], []
    raw = {}
    for name, ph in pairs:
        k = key(name)
        if len(norm_phone(ph)) != 11:
            bad.append((name, ph)); continue
        cand = by_key.get(k)
        if not cand:
            miss.append((name, ph)); continue
        if len(cand) > 1:
            dup.append(name); continue
        st = cand[0]
        st['phoneHash'] = phone_hash(ph)
        st.pop('phone', None)                      # 原文绝不留在 stores.json 里
        raw[st['douyinId']] = {'storeName': st.get('storeName'), 'phone': norm_phone(ph)}
        hit += 1

    json.dump(stores, io.open(sp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
    lp = os.path.join(ROOT, 'data', 'phones.local.json')
    json.dump(raw, io.open(lp, 'w', encoding='utf-8'), ensure_ascii=False, indent=2, sort_keys=True)

    print('清单 %d 条，写入 %d 家' % (len(pairs), hit))
    if bad:  print('号码位数不对 %d 条: %s' % (len(bad), bad))
    if dup:  print('店名重复对不上 %d 条: %s' % (len(dup), dup))
    if miss: print('档案里找不到 %d 条: %s' % (len(miss), miss))
    nophone = [s.get('storeName') for s in stores if not s.get('phoneHash')]
    if nophone: print('还没有号码的门店 %d 家: %s' % (len(nophone), nophone))
    print('原文已写到 data/phones.local.json（不进仓库）')

if __name__ == '__main__':
    main()
