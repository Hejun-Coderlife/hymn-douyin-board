# 赫眉 HYMN · 抖音拍摄脚本看板

43 家门店抖音拍摄脚本 + 发布情况自动核对。纯静态，无后端，可直接部署 GitHub Pages。

## 本地预览

```bash
cd ~/Desktop/hymn-douyin-board
python3 -m http.server 8765
# 总部看板 http://localhost:8765/
# 门店页   http://localhost:8765/store.html?store=70299081510
```

> 必须走 http，直接双击 `file://` 打开会因为浏览器安全策略读不到 data/*.json。

## 重建数据

```bash
python3 tools/build_stores.py [xlsx路径]        # 重建 data/stores.json（保留已填的区域等字段）
python3 tools/gen_sample_scripts.py 8 2026-09-16 # 重建示例脚本（门店数 基准日期）
```

详细需求与口径见 CLAUDE.md。
