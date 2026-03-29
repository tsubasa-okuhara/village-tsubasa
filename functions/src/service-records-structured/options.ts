import type { Request, Response } from "express";

import { STRUCTURED_OPTIONS } from "./catalog";

type StructuredOptionsSuccessResponse = {
  ok: true;
  options: typeof STRUCTURED_OPTIONS;
};

export function handleServiceRecordsStructuredOptions(
  _req: Request,
  res: Response<StructuredOptionsSuccessResponse>,
): void {
  res.status(200).json({
    ok: true,
    options: STRUCTURED_OPTIONS,
  });
}
