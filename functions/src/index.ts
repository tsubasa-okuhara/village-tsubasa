import cors from "cors";
import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { SUPABASE_SERVICE_ROLE_KEY } from "./lib/supabase";
import { OPENAI_API_KEY } from "./lib/openai";
import { handleScheduleList } from "./scheduleList";
import {
  handleGetNotifications,
  handleReadNotification,
} from "./notifications";
import { handleNextHelperSchedule } from "./nextHelperSchedule";
import { handleTodayHelperSummary } from "./todayHelperSummary";
import { handleTomorrowHelperSummary } from "./tomorrowHelperSummary";
import { handleTodaySchedule } from "./todaySchedule";
import { handleTomorrowSchedule } from "./tomorrowSchedule";
import { handleTodayScheduleAll } from "./todayScheduleAll";
import { handleTomorrowScheduleAll } from "./tomorrowScheduleAll";
import { handleScheduleSync } from "./scheduleSync";
import {
  handleNotifyTodaySchedule,
  handleNotifyTomorrowSchedule,
  runNotifyToday,
  runNotifyTomorrow,
} from "./scheduledNotifications";

import { serviceRecordsMoveRouter } from "./service-records-move/routes";
import { serviceRecordsStructuredRouter } from "./service-records-structured/routes";
import { selfMatchingRouter } from "./self-matching/routes";
// import { contractsRouter } from "./contracts/routes";
// ↑ CloudSign secret 未設定のため一時無効化（次回チャットで CloudSign 設定後に復活）

import { handleGenerateHomeSummary } from "./service-records-home/generateSummary";
import { handleListUnwrittenHome } from "./service-records-home/listUnwritten";
import { handleSaveHomeRecord } from "./service-records-home/saveRecord";

import {
  handleSubmitFeedback,
  handleGetFeedback,
  handleUpdateFeedbackStatus,
  handleGetResolvedFeedback,
} from "./feedback";

import {
  handleSubmitTrainingReport,
  handleSubmitTrainingNotice,
  handleGetTrainingReports,
  handleUpdateTrainingReportStatus,
} from "./trainingReport";

import {
  handleGetPushPublicKey,
  handleSendTestPush,
  handleSubscribePush,
  handleUnsubscribePush,
  WEB_PUSH_SUBJECT,
  WEB_PUSH_VAPID_PRIVATE_KEY,
  WEB_PUSH_VAPID_PUBLIC_KEY,
} from "./push";

import {
  handleGetPendingCalmChecks,
  handleAnswerCalmCheck,
  handleGenerateCalmChecks,
  handleGetCalmCheckHistory,
  handleGetCalmCheckTargets,
  handleAddCalmCheckTarget,
  handleRemoveCalmCheckTarget,
} from "./calmCheck";

import { handleScheduleEditorAuth } from "./scheduleEditor/auth";
import { handleScheduleEditorUpdate } from "./scheduleEditor/update";
import { handleScheduleEditorCreate } from "./scheduleEditor/create";
import { handleScheduleEditorDelete } from "./scheduleEditor/delete";
import { handleScheduleEditorRestore } from "./scheduleEditor/restore";
import { handleScheduleEditorListTrash } from "./scheduleEditor/listTrash";

const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);
app.use(express.json());

app.get("/healthz", (_req, res) => {
  res.status(200).send("ok");
});

app.get("/schedule-list", handleScheduleList);
app.get("/api/schedule-list", handleScheduleList);

app.use("/service-records-move", serviceRecordsMoveRouter);
app.use("/api/service-records-move", serviceRecordsMoveRouter);

app.use("/service-records-structured", serviceRecordsStructuredRouter);
app.use("/api/service-records-structured", serviceRecordsStructuredRouter);

app.use("/self-matching", selfMatchingRouter);
app.use("/api/self-matching", selfMatchingRouter);

// 電子契約（設計書: docs/CONTRACTS_DESIGN.md, 実装: functions/src/contracts/）
// CloudSign secret 未設定のため一時無効化
// app.use("/contracts", contractsRouter);
// app.use("/api/contracts", contractsRouter);

app.get("/push/public-key", handleGetPushPublicKey);
app.get("/api/push/public-key", handleGetPushPublicKey);
app.post("/push/subscribe", handleSubscribePush);
app.post("/api/push/subscribe", handleSubscribePush);
app.post("/push/unsubscribe", handleUnsubscribePush);
app.post("/api/push/unsubscribe", handleUnsubscribePush);
app.post("/push/test", handleSendTestPush);
app.post("/api/push/test", handleSendTestPush);

app.get("/notifications", handleGetNotifications);
app.get("/api/notifications", handleGetNotifications);
app.post("/notifications/read", handleReadNotification);
app.post("/api/notifications/read", handleReadNotification);

app.get("/today-helper-summary", handleTodayHelperSummary);
app.get("/api/today-helper-summary", handleTodayHelperSummary);

app.get("/tomorrow-helper-summary", handleTomorrowHelperSummary);
app.get("/api/tomorrow-helper-summary", handleTomorrowHelperSummary);

app.get("/next-helper-schedule", handleNextHelperSchedule);
app.get("/api/next-helper-schedule", handleNextHelperSchedule);

app.get("/today-schedule", handleTodaySchedule);
app.get("/api/today-schedule", handleTodaySchedule);

app.get("/tomorrow-schedule", handleTomorrowSchedule);
app.get("/api/tomorrow-schedule", handleTomorrowSchedule);

app.get("/today-schedule-all", handleTodayScheduleAll);
app.get("/api/today-schedule-all", handleTodayScheduleAll);

app.get("/tomorrow-schedule-all", handleTomorrowScheduleAll);
app.get("/api/tomorrow-schedule-all", handleTomorrowScheduleAll);

app.post("/schedule-sync", handleScheduleSync);
app.post("/api/schedule-sync", handleScheduleSync);

app.post("/notify-today", handleNotifyTodaySchedule);
app.post("/api/notify-today", handleNotifyTodaySchedule);
app.post("/notify-tomorrow", handleNotifyTomorrowSchedule);
app.post("/api/notify-tomorrow", handleNotifyTomorrowSchedule);

app.post("/service-records-home/summary", handleGenerateHomeSummary);
app.post("/api/service-records-home/summary", handleGenerateHomeSummary);
app.get("/service-records-home/unwritten", handleListUnwrittenHome);
app.get("/api/service-records-home/unwritten", handleListUnwrittenHome);
app.post("/service-records-home/save", handleSaveHomeRecord);
app.post("/api/service-records-home/save", handleSaveHomeRecord);

// 匿名フィードバック
app.post("/feedback", handleSubmitFeedback);
app.post("/api/feedback", handleSubmitFeedback);
app.get("/feedback", handleGetFeedback);
app.get("/api/feedback", handleGetFeedback);
app.post("/feedback/update-status", handleUpdateFeedbackStatus);
app.post("/api/feedback/update-status", handleUpdateFeedbackStatus);
app.get("/feedback/resolved", handleGetResolvedFeedback);
app.get("/api/feedback/resolved", handleGetResolvedFeedback);

// 研修報告
app.post("/training-reports", handleSubmitTrainingReport);
app.post("/api/training-reports", handleSubmitTrainingReport);
app.get("/training-reports", handleGetTrainingReports);
app.get("/api/training-reports", handleGetTrainingReports);
app.post("/training-reports/notice", handleSubmitTrainingNotice);
app.post("/api/training-reports/notice", handleSubmitTrainingNotice);
app.post("/training-reports/update-status", handleUpdateTrainingReportStatus);
app.post("/api/training-reports/update-status", handleUpdateTrainingReportStatus);

// 落ち着き確認
app.get("/calm-checks/pending", handleGetPendingCalmChecks);
app.get("/api/calm-checks/pending", handleGetPendingCalmChecks);
app.post("/calm-checks/answer", handleAnswerCalmCheck);
app.post("/api/calm-checks/answer", handleAnswerCalmCheck);
app.post("/calm-checks/generate", handleGenerateCalmChecks);
app.post("/api/calm-checks/generate", handleGenerateCalmChecks);
app.get("/calm-checks/history", handleGetCalmCheckHistory);
app.get("/api/calm-checks/history", handleGetCalmCheckHistory);
app.get("/calm-checks/targets", handleGetCalmCheckTargets);
app.get("/api/calm-checks/targets", handleGetCalmCheckTargets);
app.post("/calm-checks/targets", handleAddCalmCheckTarget);
app.post("/api/calm-checks/targets", handleAddCalmCheckTarget);
app.post("/calm-checks/targets/remove", handleRemoveCalmCheckTarget);
app.post("/api/calm-checks/targets/remove", handleRemoveCalmCheckTarget);

// スケジュール編集 HTML（/schedule-editor/）の認証
// admin_users.can_edit_schedule = true のメールアドレスだけ通す
app.get("/schedule-editor/auth", handleScheduleEditorAuth);
app.get("/api/schedule-editor/auth", handleScheduleEditorAuth);

// スケジュール編集（Phase C）: セル編集 + 楽観ロック保存
app.post("/schedule-editor/update", handleScheduleEditorUpdate);
app.post("/api/schedule-editor/update", handleScheduleEditorUpdate);

// スケジュール編集（Phase D1）: 論理削除 / 復元 / ゴミ箱一覧
app.post("/schedule-editor/delete", handleScheduleEditorDelete);
app.post("/api/schedule-editor/delete", handleScheduleEditorDelete);
app.post("/schedule-editor/restore", handleScheduleEditorRestore);
app.post("/api/schedule-editor/restore", handleScheduleEditorRestore);
app.get("/schedule-editor/trash", handleScheduleEditorListTrash);
app.get("/api/schedule-editor/trash", handleScheduleEditorListTrash);

// スケジュール編集（Phase D2）: 行追加
app.post("/schedule-editor/create", handleScheduleEditorCreate);
app.post("/api/schedule-editor/create", handleScheduleEditorCreate);

// 毎朝7時（JST）に今日の予定を通知
export const notifyTodaySchedule = onSchedule(
  {
    schedule: "0 7 * * *",  // JST 07:00
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    secrets: [
      SUPABASE_SERVICE_ROLE_KEY,
      WEB_PUSH_VAPID_PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY,
      WEB_PUSH_SUBJECT,
    ],
  },
  async () => {
    await runNotifyToday();
  },
);

// 毎晩20時（JST）に明日の予定を通知
export const notifyTomorrowSchedule = onSchedule(
  {
    schedule: "0 20 * * *",  // JST 20:00
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    secrets: [
      SUPABASE_SERVICE_ROLE_KEY,
      WEB_PUSH_VAPID_PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY,
      WEB_PUSH_SUBJECT,
    ],
  },
  async () => {
    await runNotifyTomorrow();
  },
);

export const api = onRequest(
  {
    region: "asia-northeast1",
    secrets: [
      SUPABASE_SERVICE_ROLE_KEY,
      OPENAI_API_KEY,
      WEB_PUSH_VAPID_PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY,
      WEB_PUSH_SUBJECT,
    ],
  },
  app,
);
