"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = exports.notifyTomorrowSchedule = exports.notifyTodaySchedule = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const supabase_1 = require("./lib/supabase");
const openai_1 = require("./lib/openai");
const scheduleList_1 = require("./scheduleList");
const notifications_1 = require("./notifications");
const nextHelperSchedule_1 = require("./nextHelperSchedule");
const todayHelperSummary_1 = require("./todayHelperSummary");
const tomorrowHelperSummary_1 = require("./tomorrowHelperSummary");
const todaySchedule_1 = require("./todaySchedule");
const tomorrowSchedule_1 = require("./tomorrowSchedule");
const todayScheduleAll_1 = require("./todayScheduleAll");
const tomorrowScheduleAll_1 = require("./tomorrowScheduleAll");
const scheduleSync_1 = require("./scheduleSync");
const scheduledNotifications_1 = require("./scheduledNotifications");
const routes_1 = require("./service-records-move/routes");
const routes_2 = require("./service-records-structured/routes");
// import { contractsRouter } from "./contracts/routes";
// ↑ CloudSign secret 未設定のため一時無効化（次回チャットで CloudSign 設定後に復活）
const generateSummary_1 = require("./service-records-home/generateSummary");
const listUnwritten_1 = require("./service-records-home/listUnwritten");
const saveRecord_1 = require("./service-records-home/saveRecord");
const feedback_1 = require("./feedback");
const trainingReport_1 = require("./trainingReport");
const push_1 = require("./push");
const calmCheck_1 = require("./calmCheck");
const auth_1 = require("./scheduleEditor/auth");
const update_1 = require("./scheduleEditor/update");
const delete_1 = require("./scheduleEditor/delete");
const restore_1 = require("./scheduleEditor/restore");
const listTrash_1 = require("./scheduleEditor/listTrash");
const app = (0, express_1.default)();
app.use((0, cors_1.default)({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
}));
app.use(express_1.default.json());
app.get("/healthz", (_req, res) => {
    res.status(200).send("ok");
});
app.get("/schedule-list", scheduleList_1.handleScheduleList);
app.get("/api/schedule-list", scheduleList_1.handleScheduleList);
app.use("/service-records-move", routes_1.serviceRecordsMoveRouter);
app.use("/api/service-records-move", routes_1.serviceRecordsMoveRouter);
app.use("/service-records-structured", routes_2.serviceRecordsStructuredRouter);
app.use("/api/service-records-structured", routes_2.serviceRecordsStructuredRouter);
// 電子契約（設計書: docs/CONTRACTS_DESIGN.md, 実装: functions/src/contracts/）
// CloudSign secret 未設定のため一時無効化
// app.use("/contracts", contractsRouter);
// app.use("/api/contracts", contractsRouter);
app.get("/push/public-key", push_1.handleGetPushPublicKey);
app.get("/api/push/public-key", push_1.handleGetPushPublicKey);
app.post("/push/subscribe", push_1.handleSubscribePush);
app.post("/api/push/subscribe", push_1.handleSubscribePush);
app.post("/push/unsubscribe", push_1.handleUnsubscribePush);
app.post("/api/push/unsubscribe", push_1.handleUnsubscribePush);
app.post("/push/test", push_1.handleSendTestPush);
app.post("/api/push/test", push_1.handleSendTestPush);
app.get("/notifications", notifications_1.handleGetNotifications);
app.get("/api/notifications", notifications_1.handleGetNotifications);
app.post("/notifications/read", notifications_1.handleReadNotification);
app.post("/api/notifications/read", notifications_1.handleReadNotification);
app.get("/today-helper-summary", todayHelperSummary_1.handleTodayHelperSummary);
app.get("/api/today-helper-summary", todayHelperSummary_1.handleTodayHelperSummary);
app.get("/tomorrow-helper-summary", tomorrowHelperSummary_1.handleTomorrowHelperSummary);
app.get("/api/tomorrow-helper-summary", tomorrowHelperSummary_1.handleTomorrowHelperSummary);
app.get("/next-helper-schedule", nextHelperSchedule_1.handleNextHelperSchedule);
app.get("/api/next-helper-schedule", nextHelperSchedule_1.handleNextHelperSchedule);
app.get("/today-schedule", todaySchedule_1.handleTodaySchedule);
app.get("/api/today-schedule", todaySchedule_1.handleTodaySchedule);
app.get("/tomorrow-schedule", tomorrowSchedule_1.handleTomorrowSchedule);
app.get("/api/tomorrow-schedule", tomorrowSchedule_1.handleTomorrowSchedule);
app.get("/today-schedule-all", todayScheduleAll_1.handleTodayScheduleAll);
app.get("/api/today-schedule-all", todayScheduleAll_1.handleTodayScheduleAll);
app.get("/tomorrow-schedule-all", tomorrowScheduleAll_1.handleTomorrowScheduleAll);
app.get("/api/tomorrow-schedule-all", tomorrowScheduleAll_1.handleTomorrowScheduleAll);
app.post("/schedule-sync", scheduleSync_1.handleScheduleSync);
app.post("/api/schedule-sync", scheduleSync_1.handleScheduleSync);
app.post("/notify-today", scheduledNotifications_1.handleNotifyTodaySchedule);
app.post("/api/notify-today", scheduledNotifications_1.handleNotifyTodaySchedule);
app.post("/notify-tomorrow", scheduledNotifications_1.handleNotifyTomorrowSchedule);
app.post("/api/notify-tomorrow", scheduledNotifications_1.handleNotifyTomorrowSchedule);
app.post("/service-records-home/summary", generateSummary_1.handleGenerateHomeSummary);
app.post("/api/service-records-home/summary", generateSummary_1.handleGenerateHomeSummary);
app.get("/service-records-home/unwritten", listUnwritten_1.handleListUnwrittenHome);
app.get("/api/service-records-home/unwritten", listUnwritten_1.handleListUnwrittenHome);
app.post("/service-records-home/save", saveRecord_1.handleSaveHomeRecord);
app.post("/api/service-records-home/save", saveRecord_1.handleSaveHomeRecord);
// 匿名フィードバック
app.post("/feedback", feedback_1.handleSubmitFeedback);
app.post("/api/feedback", feedback_1.handleSubmitFeedback);
app.get("/feedback", feedback_1.handleGetFeedback);
app.get("/api/feedback", feedback_1.handleGetFeedback);
app.post("/feedback/update-status", feedback_1.handleUpdateFeedbackStatus);
app.post("/api/feedback/update-status", feedback_1.handleUpdateFeedbackStatus);
app.get("/feedback/resolved", feedback_1.handleGetResolvedFeedback);
app.get("/api/feedback/resolved", feedback_1.handleGetResolvedFeedback);
// 研修報告
app.post("/training-reports", trainingReport_1.handleSubmitTrainingReport);
app.post("/api/training-reports", trainingReport_1.handleSubmitTrainingReport);
app.get("/training-reports", trainingReport_1.handleGetTrainingReports);
app.get("/api/training-reports", trainingReport_1.handleGetTrainingReports);
app.post("/training-reports/notice", trainingReport_1.handleSubmitTrainingNotice);
app.post("/api/training-reports/notice", trainingReport_1.handleSubmitTrainingNotice);
app.post("/training-reports/update-status", trainingReport_1.handleUpdateTrainingReportStatus);
app.post("/api/training-reports/update-status", trainingReport_1.handleUpdateTrainingReportStatus);
// 落ち着き確認
app.get("/calm-checks/pending", calmCheck_1.handleGetPendingCalmChecks);
app.get("/api/calm-checks/pending", calmCheck_1.handleGetPendingCalmChecks);
app.post("/calm-checks/answer", calmCheck_1.handleAnswerCalmCheck);
app.post("/api/calm-checks/answer", calmCheck_1.handleAnswerCalmCheck);
app.post("/calm-checks/generate", calmCheck_1.handleGenerateCalmChecks);
app.post("/api/calm-checks/generate", calmCheck_1.handleGenerateCalmChecks);
app.get("/calm-checks/history", calmCheck_1.handleGetCalmCheckHistory);
app.get("/api/calm-checks/history", calmCheck_1.handleGetCalmCheckHistory);
app.get("/calm-checks/targets", calmCheck_1.handleGetCalmCheckTargets);
app.get("/api/calm-checks/targets", calmCheck_1.handleGetCalmCheckTargets);
app.post("/calm-checks/targets", calmCheck_1.handleAddCalmCheckTarget);
app.post("/api/calm-checks/targets", calmCheck_1.handleAddCalmCheckTarget);
app.post("/calm-checks/targets/remove", calmCheck_1.handleRemoveCalmCheckTarget);
app.post("/api/calm-checks/targets/remove", calmCheck_1.handleRemoveCalmCheckTarget);
// スケジュール編集 HTML（/schedule-editor/）の認証
// admin_users.can_edit_schedule = true のメールアドレスだけ通す
app.get("/schedule-editor/auth", auth_1.handleScheduleEditorAuth);
app.get("/api/schedule-editor/auth", auth_1.handleScheduleEditorAuth);
// スケジュール編集（Phase C）: セル編集 + 楽観ロック保存
app.post("/schedule-editor/update", update_1.handleScheduleEditorUpdate);
app.post("/api/schedule-editor/update", update_1.handleScheduleEditorUpdate);
// スケジュール編集（Phase D）: 論理削除 / 復元 / ゴミ箱一覧
app.post("/schedule-editor/delete", delete_1.handleScheduleEditorDelete);
app.post("/api/schedule-editor/delete", delete_1.handleScheduleEditorDelete);
app.post("/schedule-editor/restore", restore_1.handleScheduleEditorRestore);
app.post("/api/schedule-editor/restore", restore_1.handleScheduleEditorRestore);
app.get("/schedule-editor/trash", listTrash_1.handleScheduleEditorListTrash);
app.get("/api/schedule-editor/trash", listTrash_1.handleScheduleEditorListTrash);
// 毎朝7時（JST）に今日の予定を通知
exports.notifyTodaySchedule = (0, scheduler_1.onSchedule)({
    schedule: "0 7 * * *", // JST 07:00
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    secrets: [
        supabase_1.SUPABASE_SERVICE_ROLE_KEY,
        push_1.WEB_PUSH_VAPID_PUBLIC_KEY,
        push_1.WEB_PUSH_VAPID_PRIVATE_KEY,
        push_1.WEB_PUSH_SUBJECT,
    ],
}, async () => {
    await (0, scheduledNotifications_1.runNotifyToday)();
});
// 毎晩20時（JST）に明日の予定を通知
exports.notifyTomorrowSchedule = (0, scheduler_1.onSchedule)({
    schedule: "0 20 * * *", // JST 20:00
    timeZone: "Asia/Tokyo",
    region: "asia-northeast1",
    secrets: [
        supabase_1.SUPABASE_SERVICE_ROLE_KEY,
        push_1.WEB_PUSH_VAPID_PUBLIC_KEY,
        push_1.WEB_PUSH_VAPID_PRIVATE_KEY,
        push_1.WEB_PUSH_SUBJECT,
    ],
}, async () => {
    await (0, scheduledNotifications_1.runNotifyTomorrow)();
});
exports.api = (0, https_1.onRequest)({
    region: "asia-northeast1",
    secrets: [
        supabase_1.SUPABASE_SERVICE_ROLE_KEY,
        openai_1.OPENAI_API_KEY,
        push_1.WEB_PUSH_VAPID_PUBLIC_KEY,
        push_1.WEB_PUSH_VAPID_PRIVATE_KEY,
        push_1.WEB_PUSH_SUBJECT,
    ],
}, app);
