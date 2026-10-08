import { errorResponse, successResponse, handleControllerError } from "../../helper/response.js";
import { getFocusReport } from "./sales/focus-report.service.js";
import { getQuotationReport } from "./sales/quotation-report.service.js";
import { getFloorPlanReport, getFloorPlanReportFilters } from "./sales/floor-plan-report.service.js";
import { getPerformanceReport } from "./sales/performance-report.service.js";
import { getNoActionReport } from "./sales/no-action-report.service.js";
import { getWorkflowStatusReport } from "./workflow/workflow-status-report.service.js";
import { getWorkflowColumns, saveWorkflowColumns } from "./workflow/workflow-column.service.js";
import { getMaintenanceSummaryReport, getMaintenanceDetailedReport } from "./maintenance/maintenance-report.service.js";
import { getNoActionJobsReport, getJobStatusReport, getMilestoneStatusReport, getCustomerStatusReport } from "./job/job-list-reports.service.js";
import { getContractReport, getExtensionNoticeReport } from "./job/job-document-reports.service.js";
import { getInvoicePaymentReport, getCostSummaryReport } from "./job/job-financial-reports.service.js";
import { getLandTitleForecastReport } from "./job/land-title-forecast-report.service.js";
import { getSurveyReport } from "./job/survey-report.service.js";
import { getVariationReport } from "./job/variation-report.service.js";
import { getReportColumns, saveReportColumns } from "./report-column.service.js";
import { REPORT_KEYS } from "./report-columns.catalog.js";

export async function getFocusReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getFocusReport({
      builderId,
      companyId,
      user: req.user,
      filters: req.query,
    });

    return successResponse(res, result, "Focus report fetched successfully");
  } catch (error) {
    console.error("Error fetching focus report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getQuotationReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getQuotationReport({
      builderId,
      companyId,
      user: req.user,
      filters: req.query,
    });

    return successResponse(res, result, "Quotation report fetched successfully");
  } catch (error) {
    console.error("Error fetching quotation report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getFloorPlanReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getFloorPlanReport({
      builderId,
      companyId,
      user: req.user,
      filters: req.query,
    });

    return successResponse(res, result, "Floor plan report fetched successfully");
  } catch (error) {
    console.error("Error fetching floor plan report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getFloorPlanReportFiltersController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getFloorPlanReportFilters({ builderId, companyId });

    return successResponse(res, result, "Floor plan report filters fetched successfully");
  } catch (error) {
    console.error("Error fetching floor plan report filters:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getPerformanceReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getPerformanceReport({
      builderId,
      companyId,
      filters: req.query,
    });

    return successResponse(res, result, "Performance report fetched successfully");
  } catch (error) {
    console.error("Error fetching performance report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getNoActionReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getNoActionReport({
      builderId,
      companyId,
      user: req.user,
      filters: req.query,
    });

    return successResponse(res, result, "No action leads report fetched successfully");
  } catch (error) {
    console.error("Error fetching no action leads report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getWorkflowStatusReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getWorkflowStatusReport({ builderId, companyId, filters: req.query });

    return successResponse(res, result, "Workflow status report fetched successfully");
  } catch (error) {
    console.error("Error fetching workflow status report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getWorkflowColumnsController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId, users_id: userId } = req.user;

    const result = await getWorkflowColumns({ builderId, companyId, userId });

    return successResponse(res, result, "Workflow report columns fetched successfully");
  } catch (error) {
    console.error("Error fetching workflow report columns:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function saveWorkflowColumnsController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId, users_id: userId } = req.user;
    const { columns, applyToAll } = req.body;

    const result = await saveWorkflowColumns({ builderId, companyId, userId, columns, applyToAll, actorUserId: userId });

    return successResponse(
      res,
      result,
      applyToAll ? "Workflow report columns saved for all users" : "Workflow report columns saved successfully",
    );
  } catch (error) {
    console.error("Error saving workflow report columns:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getMaintenanceSummaryReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getMaintenanceSummaryReport({ builderId, companyId, user: req.user, filters: req.query });

    return successResponse(res, result, "Maintenance report fetched successfully");
  } catch (error) {
    console.error("Error fetching maintenance report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getMaintenanceDetailedReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;

    const result = await getMaintenanceDetailedReport({ builderId, companyId, user: req.user, filters: req.query });

    return successResponse(res, result, "Maintenance detailed report fetched successfully");
  } catch (error) {
    console.error("Error fetching maintenance detailed report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getNoActionJobsReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getNoActionJobsReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "No action jobs report fetched successfully");
  } catch (error) {
    console.error("Error fetching no action jobs report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getJobStatusReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getJobStatusReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Job status report fetched successfully");
  } catch (error) {
    console.error("Error fetching job status report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getMilestoneStatusReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getMilestoneStatusReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Milestone status report fetched successfully");
  } catch (error) {
    console.error("Error fetching milestone status report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getCustomerStatusReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getCustomerStatusReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Customer status report fetched successfully");
  } catch (error) {
    console.error("Error fetching customer status report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getContractReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getContractReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Contract report fetched successfully");
  } catch (error) {
    console.error("Error fetching contract report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getExtensionNoticeReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getExtensionNoticeReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Extension notice report fetched successfully");
  } catch (error) {
    console.error("Error fetching extension notice report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getInvoicePaymentReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getInvoicePaymentReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Invoices & payments report fetched successfully");
  } catch (error) {
    console.error("Error fetching invoices & payments report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getCostSummaryReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getCostSummaryReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Cost summary report fetched successfully");
  } catch (error) {
    console.error("Error fetching cost summary report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getLandTitleForecastReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getLandTitleForecastReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Land title forecast report fetched successfully");
  } catch (error) {
    console.error("Error fetching land title forecast report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getSurveyReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getSurveyReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Survey report fetched successfully");
  } catch (error) {
    console.error("Error fetching survey report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getVariationReportController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId } = req.user;
    const result = await getVariationReport({ builderId, companyId, user: req.user, filters: req.query });
    return successResponse(res, result, "Variation report fetched successfully");
  } catch (error) {
    console.error("Error fetching variation report:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getFocusReportColumnsController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId, users_id: userId } = req.user;

    const result = await getReportColumns({
      builderId,
      companyId,
      userId,
      reportKey: REPORT_KEYS.SALES_FOCUS,
    });

    return successResponse(res, result, "Report columns fetched successfully");
  } catch (error) {
    console.error("Error fetching report columns:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function saveFocusReportColumnsController(req, res) {
  try {
    const { builder_id: builderId, company_id: companyId, users_id: userId } = req.user;
    const { columns, applyToAll } = req.body;

    const result = await saveReportColumns({
      builderId,
      companyId,
      userId,
      reportKey: REPORT_KEYS.SALES_FOCUS,
      columns,
      applyToAll,
      actorUserId: userId,
    });

    return successResponse(
      res,
      result,
      applyToAll ? "Report columns saved for all users" : "Report columns saved successfully",
    );
  } catch (error) {
    console.error("Error saving report columns:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}
