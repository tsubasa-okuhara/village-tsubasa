import { Router } from "express";

import { handleServiceRecordsStructuredGet } from "./getRecord";
import { handleServiceRecordsStructuredOptions } from "./options";
import { handleServiceRecordsStructuredSave } from "./save";

export const serviceRecordsStructuredRouter = Router();

serviceRecordsStructuredRouter.get("/options", handleServiceRecordsStructuredOptions);
serviceRecordsStructuredRouter.post("/save", handleServiceRecordsStructuredSave);
serviceRecordsStructuredRouter.get("/:sourceNoteId", handleServiceRecordsStructuredGet);
