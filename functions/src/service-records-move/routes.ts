import { Router } from "express";

import { handleServiceRecordsMoveGenerateSummary } from "./generateSummary";
import { handleServiceRecordsMoveListUnwritten } from "./listUnwritten";
import { handleServiceRecordsMoveSave } from "./saveRecord";

export const serviceRecordsMoveRouter = Router();

serviceRecordsMoveRouter.get("/unwritten", handleServiceRecordsMoveListUnwritten);
serviceRecordsMoveRouter.post("/summary", handleServiceRecordsMoveGenerateSummary);
serviceRecordsMoveRouter.post("/save", handleServiceRecordsMoveSave);
