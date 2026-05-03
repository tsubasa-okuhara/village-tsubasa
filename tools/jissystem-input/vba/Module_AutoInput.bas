Attribute VB_Name = "Module_AutoInput"
'==============================================================================
' 障害福祉サービス簡易入力ソフト 半自動入力モジュール
'
' 構成:
'   ProcessOne   ... 現在カーソル行の 1 件だけ処理
'   ProcessAll   ... 状態が「未処理」または空の全行を順次処理
'
' 設定:
'   下記の Const を環境に合わせて編集
'==============================================================================
Option Explicit

' === 設定（環境に合わせて編集）===
Private Const HIMACRO_DIR As String = "C:\jissystem-input\himacro"
Private Const HIMACRO_EXE As String = "C:\Program Files\HiMacroEx\HiMacroEx.exe"

' Excel の列番号（1-indexed）
Private Const COL_USER As Long = 1     ' A
Private Const COL_DATE As Long = 2     ' B
Private Const COL_START As Long = 3    ' C
Private Const COL_END As Long = 4      ' D
Private Const COL_SERVICE As Long = 5  ' E
Private Const COL_MEMO As Long = 6     ' F
Private Const COL_BN As Long = 7       ' G 受給者番号
Private Const COL_STATUS As Long = 8   ' H
Private Const COL_RUN_TIME As Long = 9 ' I
Private Const COL_ERROR As Long = 10   ' J

' 各 HiMacroEx 実行後の待機時間（ミリ秒）。遅すぎると遅い、速すぎると失敗
Private Const WAIT_AFTER_USER As Long = 1500
Private Const WAIT_AFTER_FIELD As Long = 500
Private Const WAIT_AFTER_SAVE As Long = 2000

'==============================================================================
' 公開エントリ
'==============================================================================

' 現在カーソル行のみ処理
Public Sub ProcessOne()
  Dim r As Long
  r = ActiveCell.Row
  If r < 2 Then
    MsgBox "データ行（2 行目以降）にカーソルを置いてから実行してください", vbExclamation
    Exit Sub
  End If
  ProcessRow r
End Sub

' 状態が「未処理」または空の全行を処理。エラーで停止
Public Sub ProcessAll()
  Dim ws As Worksheet
  Set ws = ActiveSheet

  Dim lastRow As Long
  lastRow = ws.Cells(ws.Rows.Count, COL_USER).End(xlUp).Row
  If lastRow < 2 Then
    MsgBox "処理対象データがありません", vbExclamation
    Exit Sub
  End If

  Dim r As Long
  For r = 2 To lastRow
    Dim status As String
    status = CStr(ws.Cells(r, COL_STATUS).Value)
    If status = "" Or status = "未処理" Then
      ProcessRow r
      ' エラーが起きたら停止
      If ws.Cells(r, COL_STATUS).Value = "エラー" Then
        MsgBox "行 " & r & " でエラー停止: " & ws.Cells(r, COL_ERROR).Value, vbExclamation
        Exit Sub
      End If
    End If
  Next r

  MsgBox "全行処理完了", vbInformation
End Sub

'==============================================================================
' 1 行処理（メイン）
'==============================================================================
Private Sub ProcessRow(ByVal row As Long)
  Dim ws As Worksheet
  Set ws = ActiveSheet

  ws.Cells(row, COL_STATUS).Value = "処理中"
  ws.Cells(row, COL_RUN_TIME).Value = Now
  ws.Cells(row, COL_ERROR).Value = ""

  On Error GoTo ErrHandler

  ' 値の取得 + 整形
  Dim user As String, bn As String
  user = CStr(ws.Cells(row, COL_USER).Value)
  bn = Format(ws.Cells(row, COL_BN).Value, "0000000000")
  If bn = "0000000000" Or bn = "" Then
    Err.Raise 9999, , "受給者番号(列G)が空です"
  End If

  Dim ymd As String
  ymd = Format(ws.Cells(row, COL_DATE).Value, "yyyymmdd")

  Dim startHHMM As String, endHHMM As String
  startHHMM = Format(ws.Cells(row, COL_START).Value, "hhmm")
  endHHMM = Format(ws.Cells(row, COL_END).Value, "hhmm")

  Dim service As String
  service = CStr(ws.Cells(row, COL_SERVICE).Value)

  ' Phase 1 では「家事援助」のみ対応
  If InStr(service, "家事") = 0 Then
    Err.Raise 9999, , "Phase 1 は家事援助のみ対応。サービス種別: " & service
  End If

  ' === 入力シーケンス ===

  ' 1. 受給者番号で利用者検索 → 選択
  PutClipboard bn
  RunHiMacro "01_select_user.hmx"
  WaitMs WAIT_AFTER_USER

  ' 2. 日付
  PutClipboard ymd
  RunHiMacro "02_input_date.hmx"
  WaitMs WAIT_AFTER_FIELD

  ' 3. サービス種別（家事援助）
  RunHiMacro "03_select_kaji.hmx"
  WaitMs WAIT_AFTER_FIELD

  ' 4. 開始時間
  PutClipboard startHHMM
  RunHiMacro "04_input_start.hmx"
  WaitMs WAIT_AFTER_FIELD

  ' 5. 終了時間
  PutClipboard endHHMM
  RunHiMacro "05_input_end.hmx"
  WaitMs WAIT_AFTER_FIELD

  ' 6. 保存
  RunHiMacro "06_save.hmx"
  WaitMs WAIT_AFTER_SAVE

  ' 完了
  ws.Cells(row, COL_STATUS).Value = "完了"
  Exit Sub

ErrHandler:
  ws.Cells(row, COL_STATUS).Value = "エラー"
  ws.Cells(row, COL_ERROR).Value = Err.Description
End Sub

'==============================================================================
' ユーティリティ
'==============================================================================

' クリップボードに文字列をセット（MSForms 経由）
' VBA エディタで [ツール] → [参照設定] → "Microsoft Forms 2.0 Object Library" を有効化
Private Sub PutClipboard(ByVal text As String)
  Dim obj As Object
  Set obj = CreateObject("New:{1C3B4210-F441-11CE-B9EA-00AA006B1A69}")  ' MSForms.DataObject
  obj.SetText text
  obj.PutInClipboard
End Sub

' HiMacroEx スクリプトを実行（同期待機）
Private Sub RunHiMacro(ByVal scriptName As String)
  Dim scriptPath As String
  scriptPath = HIMACRO_DIR & "\" & scriptName

  Dim wsh As Object
  Set wsh = CreateObject("WScript.Shell")
  Dim cmd As String
  cmd = """" & HIMACRO_EXE & """ """ & scriptPath & """"
  ' 同期実行（HiMacroEx の終了を待つ）。第3引数 True = 待機
  wsh.Run cmd, 1, True
End Sub

' 指定ミリ秒待機
Private Sub WaitMs(ByVal ms As Long)
  Dim startTime As Single
  startTime = Timer
  Do While Timer - startTime < ms / 1000
    DoEvents
  Loop
End Sub

'==============================================================================
' デバッグ用: 状態リセット
'==============================================================================

' 全行の状態列をクリア（再実行のため）
Public Sub ResetStatus()
  If MsgBox("全行の状態をクリアしますか？", vbYesNo + vbQuestion) <> vbYes Then Exit Sub
  Dim ws As Worksheet
  Set ws = ActiveSheet
  Dim lastRow As Long
  lastRow = ws.Cells(ws.Rows.Count, COL_USER).End(xlUp).Row
  If lastRow < 2 Then Exit Sub
  ws.Range(ws.Cells(2, COL_STATUS), ws.Cells(lastRow, COL_ERROR)).ClearContents
End Sub

' クリップボードに値が正しく入るかテスト
Public Sub TestClipboard()
  PutClipboard "0700001234"
  MsgBox "クリップボードに '0700001234' をセットしました。Notepad などに Ctrl+V して確認してください"
End Sub

' HiMacroEx の起動テスト（任意のスクリプトを実行）
Public Sub TestRunHiMacro()
  Dim scriptName As String
  scriptName = InputBox("実行する .hmx ファイル名（例: 01_select_user.hmx）", "HiMacroEx テスト")
  If scriptName = "" Then Exit Sub
  RunHiMacro scriptName
  MsgBox "実行完了"
End Sub
