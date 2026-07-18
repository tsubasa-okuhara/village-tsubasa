import { Router } from "express";

import { handleServiceRecordsMoveGenerateSummary } from "./generateSummary";
import { handleServiceRecordsMoveListUnwritten } from "./listUnwritten";
import { handleSamplesMove } from "./samples";
import { handleServiceRecordsMoveSave } from "./saveRecord";

export const serviceRecordsMoveRouter = Router();

serviceRecordsMoveRouter.get("/unwritten", handleServiceRecordsMoveListUnwritten);
serviceRecordsMoveRouter.get("/samples", handleSamplesMove);
serviceRecordsMoveRouter.post("/summary", handleServiceRecordsMoveGenerateSummary);
serviceRecordsMoveRouter.post("/save", handleServiceRecordsMoveSave);
