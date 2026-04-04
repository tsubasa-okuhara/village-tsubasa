"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.api = void 0;
const cors_1 = __importDefault(require("cors"));
const express_1 = __importDefault(require("express"));
const https_1 = require("firebase-functions/v2/https");
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
const routes_1 = require("./service-records-move/routes");
const routes_2 = require("./service-records-structured/routes");
const generateSummary_1 = require("./service-records-home/generateSummary");
const listUnwritten_1 = require("./service-records-home/listUnwritten");
const saveRecord_1 = require("./service-records-home/saveRecord");
const push_1 = require("./push");
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
app.post("/service-records-home/summary", generateSummary_1.handleGenerateHomeSummary);
app.post("/api/service-records-home/summary", generateSummary_1.handleGenerateHomeSummary);
app.get("/service-records-home/unwritten", listUnwritten_1.handleListUnwrittenHome);
app.get("/api/service-records-home/unwritten", listUnwritten_1.handleListUnwrittenHome);
app.post("/service-records-home/save", saveRecord_1.handleSaveHomeRecord);
app.post("/api/service-records-home/save", saveRecord_1.handleSaveHomeRecord);
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
