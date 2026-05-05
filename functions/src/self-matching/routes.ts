import { Router } from "express";

import { handleClaimSchedule } from "./claimSchedule";
import { handleListSelfMatchingCandidates } from "./listCandidates";
import { handleWithdrawClaim } from "./withdrawClaim";

export const selfMatchingRouter = Router();

selfMatchingRouter.get("/candidates", handleListSelfMatchingCandidates);
selfMatchingRouter.post("/claim", handleClaimSchedule);
selfMatchingRouter.post("/withdraw", handleWithdrawClaim);
