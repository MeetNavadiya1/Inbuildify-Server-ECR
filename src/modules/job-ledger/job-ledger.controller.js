import { successResponse, handleControllerError } from "../../helper/response.js";
import {
  getJobLedgerService,
  createJobLedgerEntryService,
  updateJobLedgerEntryService,
  deleteJobLedgerEntryService,
} from "./job-ledger.service.js";

export async function getJobLedger(req, res) {
  try {
    const result = await getJobLedgerService(req.params.job_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("getJobLedger:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function createJobLedgerEntry(req, res) {
  try {
    const result = await createJobLedgerEntryService(req.body, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("createJobLedgerEntry:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateJobLedgerEntry(req, res) {
  try {
    const result = await updateJobLedgerEntryService(
      req.params.job_ledger_entry_id,
      req.body,
      req.user,
    );
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("updateJobLedgerEntry:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteJobLedgerEntry(req, res) {
  try {
    const result = await deleteJobLedgerEntryService(req.params.job_ledger_entry_id, req.user);
    return successResponse(res, result.data, result.message);
  } catch (err) {
    console.error("deleteJobLedgerEntry:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}
