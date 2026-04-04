import { Router } from "express";

import { handleServiceRecordsStructuredDetail } from "./detail";
import { handleServiceRecordsStructuredGet } from "./getRecord";
import { handleServiceRecordsStructuredList } from "./list";
import { handleServiceRecordsStructuredOptions } from "./options";
import { handleServiceRecordsStructuredSave } from "./save";

export const serviceRecordsStructuredRouter = Router();

serviceRecordsStructuredRouter.get("/options", handleServiceRecordsStructuredOptions);
serviceRecordsStructuredRouter.get("/list", handleServiceRecordsStructuredList);
serviceRecordsStructuredRouter.get("/by-source/:sourceNoteId", handleServiceRecordsStructuredGet);
serviceRecordsStructuredRouter.post("/save", handleServiceRecordsStructuredSave);
serviceRecordsStructuredRouter.get("/:id", handleServiceRecordsStructuredDetail);
