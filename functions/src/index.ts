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

import { handleGenerateHomeSummary } from "./service-records-home/generateSummary";
import { handleListUnwrittenHome } from "./service-records-home/listUnwritten";
import { handleSaveHomeRecord } from "./service-records-home/saveRecord";

import {
  handleGetPushPublicKey,
  handleSendTestPush,
  handleSubscribePush,
  handleUnsubscribePush,
  WEB_PUSH_SUBJECT,
  WEB_PUSH_VAPID_PRIVATE_KEY,
  WEB_PUSH_VAPID_PUBLIC_KEY,
} from "./push";

const app = express();

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
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
