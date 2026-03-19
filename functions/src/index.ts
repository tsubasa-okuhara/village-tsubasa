import express from "express";
import { onRequest } from "firebase-functions/v2/https";

import { SUPABASE_SERVICE_ROLE_KEY } from "./lib/supabase";
import { handleScheduleList } from "./scheduleList";
import { handleScheduleSync } from "./scheduleSync";
import { serviceRecordsMoveRouter } from "./service-records-move/routes";
import { handleTodaySchedule } from "./todaySchedule";

const app = express();

app.use(express.json());

app.get("/schedule-list", handleScheduleList);
app.get("/api/schedule-list", handleScheduleList);
app.get("/today-schedule", handleTodaySchedule);
app.get("/api/today-schedule", handleTodaySchedule);
app.all("/schedule-sync", handleScheduleSync);
app.all("/api/schedule-sync", handleScheduleSync);
app.use("/service-records-move", serviceRecordsMoveRouter);
app.use("/api/service-records-move", serviceRecordsMoveRouter);

export const api = onRequest(
  {
    region: "asia-northeast1",
    secrets: [SUPABASE_SERVICE_ROLE_KEY],
  },
  app,
);
