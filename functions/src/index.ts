import cors from "cors";
import express from "express";
import { onRequest } from "firebase-functions/v2/https";
import { SUPABASE_SERVICE_ROLE_KEY } from "./lib/supabase";
import { handleScheduleList } from "./scheduleList";
import {
  handleGetNotifications,
  handleReadNotification,
} from "./notifications";
import { handleNextHelperSchedule } from "./nextHelperSchedule";
import { handleTodayHelperSummary } from "./todayHelperSummary";
import { handleTomorrowHelperSummary } from "./tomorrowHelperSummary";

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

app.post("/service-records-home/summary", handleGenerateHomeSummary);
app.post("/api/service-records-home/summary", handleGenerateHomeSummary);
app.get("/service-records-home/unwritten", handleListUnwrittenHome);
app.get("/api/service-records-home/unwritten", handleListUnwrittenHome);
app.post("/service-records-home/save", handleSaveHomeRecord);
app.post("/api/service-records-home/save", handleSaveHomeRecord);

export const api = onRequest(
  {
    region: "asia-northeast1",
    secrets: [
      SUPABASE_SERVICE_ROLE_KEY,
      WEB_PUSH_VAPID_PUBLIC_KEY,
      WEB_PUSH_VAPID_PRIVATE_KEY,
      WEB_PUSH_SUBJECT,
    ],
  },
  app,
);

// import cors from "cors";
// import express from "express";
// import { onRequest } from "firebase-functions/v2/https";

// import { SUPABASE_SERVICE_ROLE_KEY } from "./lib/supabase";
// import { handleGetNotifications, handleReadNotification } from "./notifications";
// import {
//   handleGetPushPublicKey,
//   handleSendTestPush,
//   handleSubscribePush,
//   handleUnsubscribePush,
//   WEB_PUSH_SUBJECT,
//   WEB_PUSH_VAPID_PRIVATE_KEY,
//   WEB_PUSH_VAPID_PUBLIC_KEY,
// } from "./push";
// import { moveCheckRouter } from "./routes/moveCheck";
// import { handleScheduleList } from "./scheduleList";
// import { handleScheduleSync } from "./scheduleSync";
// import { handleGenerateHomeSummary } from "./service-records-home/generateSummary";
// import { serviceRecordsMoveRouter } from "./service-records-move/routes";
// import { serviceRecordsStructuredRouter } from "./service-records-structured/routes";
// import { handleTodayHelperSummary } from "./todayHelperSummary";
// import { handleTodaySchedule } from "./todaySchedule";
// import { handleTodayScheduleAll } from "./todayScheduleAll";
// import { handleTomorrowHelperSummary } from "./tomorrowHelperSummary";
// import { handleTomorrowSchedule } from "./tomorrowSchedule";
// import { handleTomorrowScheduleAll } from "./tomorrowScheduleAll";

// const app = express();
// const allowedOrigins = [
//   "https://village-tsubasa.web.app",
//   "http://127.0.0.1:5000",
//   "http://127.0.0.1:5002",
// ];

// app.use(cors({
//   origin: allowedOrigins,
//   methods: ["GET", "POST", "OPTIONS"],
//   allowedHeaders: ["Content-Type"],
// }));
// app.use(express.json());

// app.get("/healthz", (_req, res) => {
//   res.status(200).send("ok");
// });

// app.get("/schedule-list", handleScheduleList);
// app.get("/api/schedule-list", handleScheduleList);
// app.get("/today-helper-summary", handleTodayHelperSummary);
// app.get("/api/today-helper-summary", handleTodayHelperSummary);
// app.get("/today-schedule", handleTodaySchedule);
// app.get("/api/today-schedule", handleTodaySchedule);
// app.get("/today-schedule-all", handleTodayScheduleAll);
// app.get("/api/today-schedule-all", handleTodayScheduleAll);
// app.get("/tomorrow-helper-summary", handleTomorrowHelperSummary);
// app.get("/api/tomorrow-helper-summary", handleTomorrowHelperSummary);
// app.get("/tomorrow-schedule", handleTomorrowSchedule);
// app.get("/api/tomorrow-schedule", handleTomorrowSchedule);
// app.get("/tomorrow-schedule-all", handleTomorrowScheduleAll);
// app.get("/api/tomorrow-schedule-all", handleTomorrowScheduleAll);
// app.get("/notifications", handleGetNotifications);
// app.get("/api/notifications", handleGetNotifications);
// app.post("/notifications/read", handleReadNotification);
// app.post("/api/notifications/read", handleReadNotification);
// app.get("/push/public-key", handleGetPushPublicKey);
// app.get("/api/push/public-key", handleGetPushPublicKey);
// app.post("/push/subscribe", handleSubscribePush);
// app.post("/api/push/subscribe", handleSubscribePush);
// app.post("/push/unsubscribe", handleUnsubscribePush);
// app.post("/api/push/unsubscribe", handleUnsubscribePush);
// app.post("/push/test", handleSendTestPush);
// app.post("/api/push/test", handleSendTestPush);
// app.all("/schedule-sync", handleScheduleSync);
// app.all("/api/schedule-sync", handleScheduleSync);
// app.post("/service-records-home/summary", handleGenerateHomeSummary);
// app.post("/api/service-records-home/summary", handleGenerateHomeSummary);
// app.use("/api/move-check", moveCheckRouter);
// app.use("/service-records-move", serviceRecordsMoveRouter);
// app.use("/api/service-records-move", serviceRecordsMoveRouter);
// app.use("/service-records-structured", serviceRecordsStructuredRouter);
// app.use("/api/service-records-structured", serviceRecordsStructuredRouter);

// export const api = onRequest(
//   {
//     region: "asia-northeast1",
//     secrets: [
//       SUPABASE_SERVICE_ROLE_KEY,
//       WEB_PUSH_VAPID_PUBLIC_KEY,
//       WEB_PUSH_VAPID_PRIVATE_KEY,
//       WEB_PUSH_SUBJECT,
//     ],
//   },
//   app,
// );
