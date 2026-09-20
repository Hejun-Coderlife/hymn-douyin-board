#!/usr/bin/env python3
"""本地预览服务器（手机调试用）。

跟 `python3 -m http.server` 的唯一区别：每个响应都带 Cache-Control: no-store。
原因：微信内置浏览器缓存极硬，改完 CSS/HTML 在手机上刷新还是旧的，
排查时会误以为是代码没生效（2026-09-20 真被这个坑了半天）。

用法：python3 tools/serve.py [端口，默认 8765]
手机跟 Mac 连同一个 Wi-Fi，打开 http://<Mac的局域网IP>:8765/store.html?store=<抖音号>
"""
import sys, socket
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

class NoCache(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        self.send_header('Pragma', 'no-cache')
        self.send_header('Expires', '0')
        super().end_headers()
    def log_message(self, fmt, *a):      # 安静点，只在出错时说话
        if not str(a[1]).startswith('2'):
            sys.stderr.write("%s %s\n" % (a[0], a[1]))

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(('8.8.8.8', 80))
ip = s.getsockname()[0]; s.close()
print('本机:     http://127.0.0.1:%d/' % port)
print('手机打开: http://%s:%d/store.html?store=93417760155' % (ip, port))
print('（Ctrl+C 停）')
ThreadingHTTPServer(('0.0.0.0', port), NoCache).serve_forever()
