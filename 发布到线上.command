#!/bin/bash
# 双击我 = 重建数据分片 + 推到 GitHub + 触发线上更新
# （换了 data/scripts.json、改了 data/stores.json、或往「视频数据/」放了新导出的 xlsx 之后跑这个）
cd "$(dirname "$0")" || exit 1
echo "════════════════════════════════════════════"
echo "  赫眉抖音脚本看板 · 发布到线上"
echo "════════════════════════════════════════════"
echo

if [ ! -f data/scripts.json ]; then
  echo "⚠️  没找到 data/scripts.json —— 先把 AI 生成的脚本放到那里再来。"
  echo; read -n 1 -s -r -p "按任意键关闭"; exit 1
fi

echo "① 重建索引和分片…"
python3 tools/sync_data.py || { echo "❌ 生成失败，先看上面的报错"; read -n 1 -s -r -p "按任意键关闭"; exit 1; }

# 门店手机页「排行」的数据：从「视频数据/」里的 xlsx 汇总各店每天发了几条 -> data/rank.js
node tools/build_rank.js || { echo "❌ 生成排行数据失败，先看上面的报错"; read -n 1 -s -r -p "按任意键关闭"; exit 1; }

# 给 css/js 打版本戳。GitHub Pages 对静态资源发 max-age=600，不打戳的话
# 推完 10 分钟内手机上刷新看到的还是旧版（2026-09-20 被坑了三次）。
python3 tools/stamp_assets.py || { echo "❌ 打版本戳失败"; read -n 1 -s -r -p "按任意键关闭"; exit 1; }
echo

echo "② 看看有什么变化…"
CHANGED=$(git status --porcelain | wc -l | tr -d ' ')
if [ "$CHANGED" = "0" ]; then
  echo "   没有任何改动，线上已经是最新的了。"
  echo; read -n 1 -s -r -p "按任意键关闭"; exit 0
fi
git status --short | head -20
[ "$CHANGED" -gt 20 ] && echo "   …共 $CHANGED 个文件"
echo

echo "③ 提交并推送…"
git add -A
git commit -q -m "更新脚本数据（$(date '+%Y-%m-%d %H:%M')）" || true
if ! git push -q origin main; then
  echo "❌ 推送失败。多半是网络/代理的问题，等一下再双击一次就行。"
  echo; read -n 1 -s -r -p "按任意键关闭"; exit 1
fi
echo "   已推送。"
echo

echo "④ 等 GitHub 重新构建（一般 1–2 分钟）…"
for i in $(seq 1 24); do
  ST=$(gh api repos/Hejun-Coderlife/hymn-douyin-board/pages --jq '.status' 2>/dev/null)
  if [ "$ST" = "built" ]; then echo "   ✅ 线上已更新"; break; fi
  printf "   构建中… (%d)\r" "$i"; sleep 10
done
echo
echo "════════════════════════════════════════════"
echo "  看板：https://hejun-coderlife.github.io/hymn-douyin-board/"
echo "  门店页：上面地址 + /store.html?store=抖音号"
echo "════════════════════════════════════════════"
echo
read -n 1 -s -r -p "按任意键关闭"
