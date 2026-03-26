import express from "express";
import { onRequest } from "firebase-functions/v2/https";

import { handleScheduleList } from "./scheduleList";
import { handleScheduleSync } from "./scheduleSync";
import { registerServiceRecordsMoveRoutes } from "./service-records-move/routes";

const app = express();

app.use(express.json());

app.get("/schedule-list", handleScheduleList);
app.get("/api/schedule-list", handleScheduleList);
app.all("/schedule-sync", handleScheduleSync);
app.all("/api/schedule-sync", handleScheduleSync);
registerServiceRecordsMoveRoutes(app);

export const api = onRequest({ region: "asia-northeast1" }, app);
