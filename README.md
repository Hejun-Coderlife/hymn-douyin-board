# 赫眉 HYMN · 抖音拍摄脚本看板

43 家门店抖音拍摄脚本 + 发布情况自动核对。纯静态，无后端，可直接部署 GitHub Pages。

## 打开方式

**直接双击 `index.html` 就能用**（数据是用 `<script>` 载入的，不依赖服务器）。
门店页把抖音号接在后面：`store.html?store=70299081510`。

也可以起本地服务（手机连同一 WiFi 时方便）：

```bash
cd ~/Desktop/hymn-douyin-board
python3 -m http.server 8765
```

> ⚠️ 导入的视频数据存在浏览器 localStorage 里，**双击打开和 localhost 打开是两个互不相通的存储**。
> 平时用哪种就一直用哪种；要换，先「导出备份 JSON」再到另一边「导入备份」。

## 重建数据

```bash
python3 tools/build_stores.py [xlsx路径]        # 重建 data/stores.json（保留已填的区域等字段）
python3 tools/gen_sample_scripts.py 8 2026-09-16 # 重建示例脚本（门店数 基准日期）
python3 tools/sync_data.py                       # 手改过 data/*.json 后，同步成页面读的 data/*.js
```

详细需求与口径见 CLAUDE.md。
