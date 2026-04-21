#!/bin/bash
# ============================================================
# ビレッジ社内 リポジトリ健康診断スクリプト
#
# 使い方:
#   bash ~/village-tsubasa/scripts/repo-health-check.sh
#   bash ~/village-tsubasa/scripts/repo-health-check.sh --quiet   # 🟢 健全なものは出さない
#
# 何をするか:
#   ~/Desktop / ~/Documents / ~/dev / ~/Projects 配下の git リポを
#   深さ 4 まで探索し、各リポの状態を以下で判定:
#     🟢 健全: GitHub と同期、未コミットなし
#     🟡 注意: 未push or 未コミットあり（意図的か確認）
#     🔴 危険: GitHub remote 未設定（どこにも push されてない）
#
# 実行推奨タイミング: 毎週金曜 or 週初め
# 詳細ポリシー: docs/RULES.md の「ルール9」を参照
#
# 2026-04-21 初版（奥原翼 + Claude Opus）
# ============================================================

set -u

QUIET=false
if [[ "${1:-}" == "--quiet" ]]; then
  QUIET=true
fi

SEARCH_DIRS=(
  "$HOME/Desktop"
  "$HOME/Documents"
  "$HOME/dev"
  "$HOME/Projects"
)

echo "============================================"
echo "📊 リポ健康診断  $(date '+%Y-%m-%d %H:%M')"
echo "============================================"

total=0
red=0
yellow=0
green=0

for search_dir in "${SEARCH_DIRS[@]}"; do
  [[ -d "$search_dir" ]] || continue

  # .git ディレクトリを深さ 4 まで探索
  while IFS= read -r gitdir; do
    repo=$(dirname "$gitdir")

    # 退避フォルダや node_modules 下は除外
    case "$repo" in
      *_archive*|*node_modules*|*.Trash*) continue ;;
    esac

    total=$((total + 1))

    branch=$(git -C "$repo" branch --show-current 2>/dev/null || echo "-")
    remote=$(git -C "$repo" remote get-url origin 2>/dev/null || echo "")
    dirty=$(git -C "$repo" status --porcelain 2>/dev/null | wc -l | tr -d ' ')

    ahead="0"
    if [[ -n "$remote" ]]; then
      ahead=$(git -C "$repo" rev-list --count "@{u}..HEAD" 2>/dev/null || echo "?")
    fi

    icon="🟢"
    status_text="健全"
    notes=()

    if [[ -z "$remote" ]]; then
      icon="🔴"
      status_text="危険"
      notes+=("GitHub remote 未設定（push 先なし）")
    fi

    if [[ "$ahead" != "0" && "$ahead" != "?" ]]; then
      if [[ "$icon" == "🟢" ]]; then
        icon="🟡"
        status_text="注意"
      fi
      notes+=("未push ${ahead}件")
    fi

    if [[ "$dirty" != "0" ]]; then
      if [[ "$icon" == "🟢" ]]; then
        icon="🟡"
        status_text="注意"
      fi
      notes+=("未コミット ${dirty}件")
    fi

    # カウント
    case "$icon" in
      "🔴") red=$((red + 1)) ;;
      "🟡") yellow=$((yellow + 1)) ;;
      "🟢") green=$((green + 1)) ;;
    esac

    # --quiet 時は 🟢 をスキップ
    if [[ "$QUIET" == "true" && "$icon" == "🟢" ]]; then
      continue
    fi

    echo ""
    echo "$icon $status_text  $repo"
    echo "   branch: $branch / GitHub: ${remote:-(なし)}"
    if (( ${#notes[@]} > 0 )); then
      printf "   ⚠️  %s\n" "${notes[@]}"
    fi

  done < <(find "$search_dir" -maxdepth 4 -type d -name ".git" 2>/dev/null)
done

echo ""
echo "============================================"
echo "📈 検出 ${total} 件  🟢 健全:${green}  🟡 注意:${yellow}  🔴 危険:${red}"
echo "============================================"
echo ""

if (( red > 0 )); then
  echo "🔴 のリポは最優先で対応。GitHub にリポを作成 → remote 追加 → push してください。"
fi
if (( yellow > 0 )); then
  echo "🟡 のリポは、未コミット・未pushが意図的な作業中かどうか確認を。"
fi
if (( red == 0 && yellow == 0 )); then
  echo "✨ 全部健全です！"
fi
