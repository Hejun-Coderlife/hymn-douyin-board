#!/usr/bin/env python3
"""给 HTML 里引用的 css/js 加版本号，推上线后浏览器立刻拿新文件。

为什么需要：GitHub Pages 对静态资源发的是 cache-control: max-age=600，
浏览器 10 分钟内不会回源。改完推上去，手机上刷新看到的还是旧版——
2026-09-20 一天之内被这个坑了三次（微信一次、Safari 两次），
每次都要先排除「是不是代码没生效」，很浪费时间。

做法：把 <script src="assets/x.js"> 改成 <script src="assets/x.js?v=20260920-1506">。
文件名没变（Pages 上还是同一个文件），但 URL 变了，浏览器当成新资源去取。

用法：python3 tools/stamp_assets.py        # 用当前时间做版本号
      发布到线上.command 里会自动调用，一般不用手跑。
"""
import io, os, re, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PAGES = ['index.html', 'store.html', 'login.html']
# 只给这两个目录下的 css/js 打戳；vendor/ 是第三方库，不会改，不用打
PAT = re.compile(r'((?:src|href)=")((?:assets|data)/[^"?]+\.(?:js|css))(\?v=[^"]*)?(")')

def main():
    ver = sys.argv[1] if len(sys.argv) > 1 else time.strftime('%Y%m%d-%H%M')
    total = 0
    for name in PAGES:
        p = os.path.join(ROOT, name)
        if not os.path.exists(p):
            continue
        s = io.open(p, encoding='utf-8').read()
        s2, n = PAT.subn(lambda m: m.group(1) + m.group(2) + '?v=' + ver + m.group(4), s)
        if s2 != s:
            io.open(p, 'w', encoding='utf-8').write(s2)
        total += n
        print('%-12s 打戳 %d 处' % (name, n))
    print('版本号 =', ver)

if __name__ == '__main__':
    main()
