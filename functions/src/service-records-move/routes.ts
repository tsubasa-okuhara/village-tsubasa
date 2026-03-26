import type { Express } from "express";

import { handleListUnwritten } from "./listUnwritten";
import { handleListSheets } from "./listSheets";
import { handleSaveRecord } from "./saveRecord";

export function registerServiceRecordsMoveRoutes(app: Express): void {
  app.get("/service-records-move/unwritten", handleListUnwritten);
  app.get("/service-records-move/sheets", handleListSheets);
  app.get("/api/service-records-move/sheets", handleListSheets);
  app.post("/service-records-move/save", handleSaveRecord);
}
