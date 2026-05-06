import { Router } from "express";

import { requireAdmin } from "./adminAuth";
import { handleAdminApprove } from "./adminApprove";
import { handleAdminHistory } from "./adminHistory";
import { handleAdminPending } from "./adminPending";
import { handleAdminReject } from "./adminReject";
import { handleClaimSchedule } from "./claimSchedule";
import { handleListSelfMatchingCandidates } from "./listCandidates";
import { handleWithdrawClaim } from "./withdrawClaim";

export const selfMatchingRouter = Router();

selfMatchingRouter.get("/candidates", handleListSelfMatchingCandidates);
selfMatchingRouter.post("/claim", handleClaimSchedule);
selfMatchingRouter.post("/withdraw", handleWithdrawClaim);

selfMatchingRouter.get("/admin/pending", requireAdmin, handleAdminPending);
selfMatchingRouter.get("/admin/history", requireAdmin, handleAdminHistory);
selfMatchingRouter.post("/admin/approve", requireAdmin, handleAdminApprove);
selfMatchingRouter.post("/admin/reject", requireAdmin, handleAdminReject);
