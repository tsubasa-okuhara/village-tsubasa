from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Table, TableStyle

# Register fonts - Latin + Japanese
pdfmetrics.registerFont(TTFont("Latin", "/usr/share/fonts/truetype/crosextra/Carlito-Regular.ttf"))
pdfmetrics.registerFont(TTFont("LatinBold", "/usr/share/fonts/truetype/crosextra/Carlito-Bold.ttf"))
pdfmetrics.registerFont(TTFont("JP", "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf"))

FONT_L = "Latin"
FONT_LB = "LatinBold"
FONT_JP = "JP"

OUTPUT = "/sessions/exciting-nifty-hamilton/mnt/public/village-tsubasa-status.pdf"
W, H = A4

# Colors
BG_CREAM = HexColor("#faf6f0")
BROWN = HexColor("#463830")
ACCENT = HexColor("#7a5d63")
GREEN_OK = HexColor("#4a8a5a")
ORANGE_WIP = HexColor("#c89040")
RED_TODO = HexColor("#ba4b59")
BLUE_INFO = HexColor("#3a6aa8")
WHITE = HexColor("#ffffff")
LINE_COLOR = HexColor("#dfcfc4")


def is_latin(ch):
    cp = ord(ch)
    return cp < 0x300


def draw_mixed(c, x, y, text, size, bold=False):
    """Draw mixed Japanese + Latin text by switching fonts."""
    latin_font = FONT_LB if bold else FONT_L
    segments = []
    current = ""
    current_latin = is_latin(text[0]) if text else True
    for ch in text:
        ch_latin = is_latin(ch)
        if ch_latin == current_latin:
            current += ch
        else:
            segments.append((current, current_latin))
            current = ch
            current_latin = ch_latin
    if current:
        segments.append((current, current_latin))

    for seg_text, seg_latin in segments:
        font = latin_font if seg_latin else FONT_JP
        c.setFont(font, size)
        c.drawString(x, y, seg_text)
        x += c.stringWidth(seg_text, font, size)
    return x


def draw_mixed_centered(c, cx, y, text, size, bold=False):
    """Draw mixed text centered at cx."""
    latin_font = FONT_LB if bold else FONT_L
    total_w = 0
    segments = []
    current = ""
    current_latin = is_latin(text[0]) if text else True
    for ch in text:
        ch_latin = is_latin(ch)
        if ch_latin == current_latin:
            current += ch
        else:
            segments.append((current, current_latin))
            current = ch
            current_latin = ch_latin
    if current:
        segments.append((current, current_latin))

    for seg_text, seg_latin in segments:
        font = latin_font if seg_latin else FONT_JP
        total_w += c.stringWidth(seg_text, font, size)

    x = cx - total_w / 2
    for seg_text, seg_latin in segments:
        font = latin_font if seg_latin else FONT_JP
        c.setFont(font, size)
        c.drawString(x, y, seg_text)
        x += c.stringWidth(seg_text, font, size)


def draw_header(c, y):
    c.setFillColor(ACCENT)
    c.roundRect(20 * mm, y - 18 * mm, W - 40 * mm, 22 * mm, 4 * mm, fill=1, stroke=0)
    c.setFillColor(WHITE)
    draw_mixed_centered(c, W / 2, y - 12 * mm, "ビレッジひろば — アプリ現状レポート", 18, bold=True)
    draw_mixed_centered(c, W / 2, y - 17 * mm, "Village Tsubasa  |  2026年4月6日時点", 9)
    return y - 28 * mm


def draw_section_title(c, y, title):
    c.setFillColor(ACCENT)
    c.roundRect(20 * mm, y - 7 * mm, 6 * mm, 7 * mm, 1.5 * mm, fill=1, stroke=0)
    c.setFillColor(BROWN)
    draw_mixed(c, 30 * mm, y - 5.5 * mm, title, 13, bold=True)
    c.setStrokeColor(LINE_COLOR)
    c.setLineWidth(0.5)
    c.line(20 * mm, y - 9 * mm, W - 20 * mm, y - 9 * mm)
    return y - 14 * mm


def make_table_data_with_font(data):
    """Wrap table data in Flowable-style for mixed fonts - simple approach using JP font for all."""
    return data


def draw_feature_table(c, y):
    data = [
        ["機能", "状態", "説明"],
        ["ホーム画面", "稼働中", "今日/明日の予定件数、連絡の確認、次の予定を一覧表示"],
        ["今日の予定", "稼働中", "自分用/全体一覧の2画面。予定詳細カード表示"],
        ["明日の予定", "稼働中", "自分用/全体一覧の2画面。予定詳細カード表示"],
        ["スケジュール確認", "稼働中", "月間カレンダー表示。担当者・日付で絞り込み可能"],
        ["連絡の確認（通知）", "稼働中", "通知一覧、未読/既読管理、タイプ別色分け対応"],
        ["プッシュ通知", "稼働中", "ウェブプッシュ対応。端末登録/解除/テスト送信あり"],
        ["自動通知スケジューラ", "稼働中", "毎朝7時（今日の予定）/毎晩20時（明日の予定）を自動送信"],
        ["移動支援記録", "稼働中", "未記入一覧取得→記録案生成→保存の一連フロー"],
        ["居宅サービス記録", "開発中", "API実装済み。画面は準備中"],
        ["カレンダー連携", "計画中", "グーグル/アップルカレンダーへ予定自動登録+リマインダー"],
    ]

    col_widths = [45 * mm, 20 * mm, W - 105 * mm]
    row_heights = [7 * mm] + [9 * mm] * (len(data) - 1)
    table = Table(data, colWidths=col_widths, rowHeights=row_heights)

    status_colors = {"稼働中": GREEN_OK, "開発中": ORANGE_WIP, "計画中": BLUE_INFO}

    style_commands = [
        ("FONT", (0, 0), (-1, -1), FONT_JP, 8),
        ("FONT", (0, 0), (-1, 0), FONT_JP, 9),
        ("TEXTCOLOR", (0, 0), (-1, -1), BROWN),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.4, LINE_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ("LEFTPADDING", (0, 0), (-1, -1), 3 * mm),
    ]

    for i, row in enumerate(data[1:], start=1):
        status = row[1]
        if status in status_colors:
            style_commands.append(("TEXTCOLOR", (1, i), (1, i), status_colors[status]))
        if i % 2 == 0:
            style_commands.append(("BACKGROUND", (0, i), (-1, i), HexColor("#faf6f0")))

    table.setStyle(TableStyle(style_commands))
    tw, th = table.wrap(0, 0)
    table.drawOn(c, 20 * mm, y - th)
    return y - th - 6 * mm


def draw_tech_stack(c, y):
    items = [
        ("ホスティング", "Firebase Hosting"),
        ("バックエンド", "Firebase Functions v2 (Node.js 20, Express)"),
        ("データベース", "Supabase (PostgreSQL)"),
        ("プッシュ通知", "Web Push API + VAPID"),
        ("スケジューラ", "Firebase Cloud Scheduler (onSchedule)"),
        ("フロント", "Vanilla JS（フレームワークなし）"),
        ("リポジトリ", "GitHub — tsubasa-okuhara/village-tsubasa"),
    ]

    for label, value in items:
        c.setFillColor(ACCENT)
        draw_mixed(c, 24 * mm, y, label, 8)
        c.setFillColor(BROWN)
        draw_mixed(c, 58 * mm, y, value, 9)
        y -= 5.5 * mm

    return y - 4 * mm


def draw_today_work(c, y):
    items = [
        ("Cloud Scheduler確認", "デプロイ済み。cron式をJST基準に修正（朝7時/夜20時）"),
        ("通知テストデータ掃除", "手動投入されたテストレコードを削除し、テーブルをクリーンに"),
        ("通知タイプ別色分け", "通知一覧ページで本日=赤、明日=オレンジ、お知らせ=青に対応"),
        ("概要欄の非表示", "予定カード4画面から不要な「概要」行を削除"),
        ("Push通知テスト", "自分宛てにテスト送信し、端末への配信を確認"),
        ("GitHub同期", "未コミットの変更をすべてpush完了"),
    ]

    for title, desc in items:
        c.setFillColor(GREEN_OK)
        c.circle(24 * mm, y + 1.2 * mm, 1.5 * mm, fill=1, stroke=0)
        c.setFillColor(BROWN)
        draw_mixed(c, 28 * mm, y, title, 9, bold=True)
        c.setFillColor(ACCENT)
        draw_mixed(c, 28 * mm, y - 5 * mm, desc, 8)
        y -= 12 * mm

    return y - 2 * mm


def draw_next_tasks(c, y):
    items = [
        ("自動通知の本番稼働確認", "今夜20時の自動実行結果をSupabaseで確認", RED_TODO),
        ("moveの保存フロー修正", "saveRecord.tsのinsertカラムを実テーブルに合わせる", ORANGE_WIP),
        ("homeの実装", "service-records-homeの画面とAPIをmoveと同じ構成で作成", ORANGE_WIP),
        ("カレンダー連携（任意機能）", "Google Calendar APIで予定自動登録+1時間前リマインダー", BLUE_INFO),
        ("通知の動的並び替え", "新着通知タイプに応じてホーム画面カードを自動並び替え", BLUE_INFO),
    ]

    for title, desc, color in items:
        c.setFillColor(color)
        c.circle(24 * mm, y + 1.2 * mm, 1.5 * mm, fill=1, stroke=0)
        c.setFillColor(BROWN)
        draw_mixed(c, 28 * mm, y, title, 9, bold=True)
        c.setFillColor(ACCENT)
        draw_mixed(c, 28 * mm, y - 5 * mm, desc, 8)
        y -= 12 * mm

    y -= 2 * mm
    legend_items = [(RED_TODO, "優先"), (ORANGE_WIP, "次の開発"), (BLUE_INFO, "将来の計画")]
    x = 28 * mm
    for color, label in legend_items:
        c.setFillColor(color)
        c.circle(x, y + 1 * mm, 1.2 * mm, fill=1, stroke=0)
        c.setFillColor(BROWN)
        draw_mixed(c, x + 3 * mm, y, label, 7)
        x += 25 * mm

    return y - 6 * mm


def draw_api_summary(c, y):
    data = [
        ["エンドポイント", "メソッド", "用途"],
        ["/api/schedule-list", "GET", "月間予定一覧"],
        ["/api/today-schedule", "GET", "今日の予定（個人）"],
        ["/api/tomorrow-schedule", "GET", "明日の予定（個人）"],
        ["/api/today-schedule-all", "GET", "今日の予定（全体）"],
        ["/api/tomorrow-schedule-all", "GET", "明日の予定（全体）"],
        ["/api/next-helper-schedule", "GET", "次の予定"],
        ["/api/notifications", "GET", "通知一覧取得"],
        ["/api/notifications/read", "POST", "通知の既読化"],
        ["/api/notify-today", "POST", "今日の予定を通知送信"],
        ["/api/notify-tomorrow", "POST", "明日の予定を通知送信"],
        ["/api/push/subscribe", "POST", "プッシュ通知の端末登録"],
        ["/api/service-records-move/*", "各種", "移動支援記録（一覧/生成/保存）"],
        ["/api/service-records-home/*", "各種", "居宅サービス記録（開発中）"],
    ]

    col_widths = [55 * mm, 18 * mm, W - 113 * mm]
    row_heights = [7 * mm] * len(data)
    table = Table(data, colWidths=col_widths, rowHeights=row_heights)

    style_commands = [
        ("FONT", (0, 0), (-1, -1), FONT_L, 7),
        ("FONT", (2, 0), (2, -1), FONT_JP, 7),
        ("FONT", (0, 0), (-1, 0), FONT_JP, 8),
        ("TEXTCOLOR", (0, 0), (-1, -1), BROWN),
        ("TEXTCOLOR", (0, 0), (-1, 0), WHITE),
        ("BACKGROUND", (0, 0), (-1, 0), ACCENT),
        ("ALIGN", (1, 0), (1, -1), "CENTER"),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("GRID", (0, 0), (-1, -1), 0.3, LINE_COLOR),
        ("TOPPADDING", (0, 0), (-1, -1), 1.5),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 1.5),
        ("LEFTPADDING", (0, 0), (-1, -1), 2.5 * mm),
    ]
    for i in range(2, len(data), 2):
        style_commands.append(("BACKGROUND", (0, i), (-1, i), HexColor("#faf6f0")))

    table.setStyle(TableStyle(style_commands))
    tw, th = table.wrap(0, 0)
    table.drawOn(c, 20 * mm, y - th)
    return y - th - 6 * mm


def main():
    c = canvas.Canvas(OUTPUT, pagesize=A4)

    # Page 1
    c.setFillColor(BG_CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    y = H - 15 * mm
    y = draw_header(c, y)
    y = draw_section_title(c, y, "機能一覧と稼働状況")
    y = draw_feature_table(c, y)
    y = draw_section_title(c, y, "技術構成")
    y = draw_tech_stack(c, y)
    y = draw_section_title(c, y, "本日の作業内容（4/5〜4/6）")
    y = draw_today_work(c, y)
    c.showPage()

    # Page 2
    c.setFillColor(BG_CREAM)
    c.rect(0, 0, W, H, fill=1, stroke=0)
    y = H - 20 * mm
    y = draw_section_title(c, y, "次のステップ")
    y = draw_next_tasks(c, y)
    y = draw_section_title(c, y, "API一覧（主要エンドポイント）")
    y = draw_api_summary(c, y)

    # Footer
    c.setFillColor(ACCENT)
    draw_mixed_centered(c, W / 2, 15 * mm, "ビレッジ翼  |  village-tsubasa.web.app  |  Confidential", 7)

    c.showPage()
    c.save()
    print(f"PDF created: {OUTPUT}")


if __name__ == "__main__":
    main()
