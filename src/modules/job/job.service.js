import db from "../../config/database/models/postgre-models/index.js";
import { applyRowScope, applyTenantScope } from "../../helper/rbac.helper.js";
import { ACTIONS, MODULES, ROLES } from "../../constants/rbac.js";
import { resolvePermission } from "../../helper/permissionResolver.helper.js";
import { logActivity } from "../../utils/activityLogger.js";

// Phase 4 — row-level scoping columns on the job table.
//  - Site Supervisor (SITE_ASSIGNED) sees only jobs where supervisor_id = self.
//  - Contact / homebuyer (JOB_ONLY) sees only their own job (customer_contact_id).
// Permits / Color Consultant / Draft Person are JOB_ASSIGNED but have no
// per-job assignment table yet, so applyRowScope is a no-op for them and they
// fall back to builder-wide read (still gated to READ-only by the matrix).
const JOB_SCOPE_COLUMNS = {
  supervisorColumn: "supervisor_id",
  contactIdColumn: "customer_contact_id",
};
import notificationQueue from "../../workers/commencementLetterWorker.js";
import { wrapJobCompletionApprovalResponseHTML } from "../../templates/job-completion-approval.template.js";
import { keysToCamelCase, formatCamelCaseToReadable } from "../../utils/common.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";
import { Op, QueryTypes } from "sequelize";
import { resolveImageUrls } from "../../helper/imageDriveFile.helper.js";
import { getQuotationVersionGrandTotal } from "../../helper/quotationTotal.helper.js";
import { DRIVE_FILE_MAPPING, documentTypeOf } from "../../constants/driveFile.js";
import { env } from "../../config/env.config.js";
import { getColorItemsByIdsService, generateColorPdfService, generateColorEmailService, getJobColorDocumentItemsService, generateJobColorDocumentPdfService } from "../color-item/color-item.service.js";
import { wrapColourSelectionSubmittedHTML } from "../../templates/colour-selection-submitted.template.js";
import { resolveCatalogueBuilderId } from "../color/color.service.js";
import { initializeJobWorkflow } from "../job-process/job-process-stage.service.js";
import {
  JOB_STATUS_HANDOVER_COMPLETED,
  JOB_STATUS_IN_PROGRESS,
  JOB_STATUS_COMPLETED,
  JOB_STATUS_ON_HOLD,
  JOB_STATUS_CANCELLED,
  JOB_STATUS_ARCHIVED,
} from "../../constants/job.js";
import { getJobStageProgress } from "./job-automation.service.js";
import {
  runAsSampleDataViewer,
  runAcrossAllSampleDataOwners,
  sampleDataReadOnlyError,
} from "../../config/database/models/postgre-models/sampleDataFlag.js";
import { getJobLedgerService } from "../job-ledger/job-ledger.service.js";
import maintenanceService from "../maintenance/maintenance.service.js";
import { uploadFile } from "../../service/s3.service.js";
import * as documentsService from "../documents/documents.service.js";
import { virtualFolderId } from "../../helper/virtualFolderId.helper.js";
import {
  upsertJobColorDriveFile,
  deleteJobColorDriveFile,
  getJobColorDriveFilePresignedUrl,
  upsertJobColorDocumentDriveFile,
  getJobColorDocumentPresignedUrl,
} from "../../helper/jobColorDriveFile.helper.js";
import { isPdfEditable, getPdfTypeTag } from "../../utils/pdfEdit.js";
import { isDocumentEditingAllowed } from "../../utils/documentEdit.js";

class JobService {
  async getAllJobs(queryParams, user) {
    const { Opportunity, Leads, Job, PropertyDetail, State, Users } = db.sequelize.models;

    const {
      page = 1,
      limit = 25,
      search,
      status,
      reference_id,
      customer_name,
      job_address,
      estate_name,
      consultant,
      created_at_from,
      created_at_to,
      title_date_from,
      title_date_to,
      assignee_id,
      sort_by = "created_at",
      sort_order = "desc",
    } = queryParams;

    const toArray = (value) => {
      if (!value) {
        return undefined;
      }
      if (Array.isArray(value)) {
        return value;
      }
      return String(value).split(",").map((s) => s.trim()).filter(Boolean);
    };

    const statusList = toArray(status);
    const assigneeList = toArray(assignee_id);
    const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));

    // ── Tenant Scope ────────────────────────────────────────────────────────
    const tenantScope = this._buildTenantScope(user);

    const where = { [Op.and]: [tenantScope] };

    // ── Row-level scope (Phase 4) ───────────────────────────────────────────
    // No-op for builder/admin tiers; constrains Site Supervisor / Contact.
    const jobRowScope = applyRowScope({}, user, MODULES.JOB, JOB_SCOPE_COLUMNS);
    if (Object.keys(jobRowScope).length) {
      where[Op.and].push(jobRowScope);
    }

    // ── Filters ─────────────────────────────────────────────────────────────
    if (statusList?.length) {
      where[Op.and].push({ status: { [Op.in]: statusList } });
    }

    if (reference_id) {
      where[Op.and].push({ reference_number: { [Op.iLike]: `%${reference_id}%` } });
    }

    if (customer_name) {
      where[Op.and].push({ "$opportunity.lead.name$": { [Op.iLike]: `%${customer_name}%` } });
    }

    if (job_address) {
      where[Op.and].push({
        [Op.or]: [
          { "$opportunity.lead.propertyDetail.lot_number$": { [Op.iLike]: `%${job_address}%` } },
          { "$opportunity.lead.propertyDetail.street$": { [Op.iLike]: `%${job_address}%` } },
          { "$opportunity.lead.propertyDetail.address_line1$": { [Op.iLike]: `%${job_address}%` } },
          { "$opportunity.lead.propertyDetail.city$": { [Op.iLike]: `%${job_address}%` } },
        ],
      });
    }

    if (estate_name) {
      where[Op.and].push({ "$opportunity.lead.propertyDetail.estate_name$": { [Op.iLike]: `%${estate_name}%` } });
    }

    if (consultant) {
      where[Op.and].push({ "$opportunity.lead.assignee.name$": { [Op.iLike]: `%${consultant}%` } });
    }

    if (assigneeList?.length) {
      where[Op.and].push({ "$opportunity.lead.assignee_id$": { [Op.in]: assigneeList } });
    }

    if (created_at_from) {
      where[Op.and].push({ createdAt: { [Op.gte]: created_at_from } });
    }

    if (created_at_to) {
      where[Op.and].push({ createdAt: { [Op.lte]: created_at_to } });
    }

    if (title_date_from) {
      where[Op.and].push({ "$opportunity.lead.propertyDetail.title_date$": { [Op.gte]: title_date_from } });
    }

    if (title_date_to) {
      where[Op.and].push({ "$opportunity.lead.propertyDetail.title_date$": { [Op.lte]: title_date_to } });
    }

    // ── Global Search ───────────────────────────────────────────────────────
    if (search) {
      where[Op.and].push({
        [Op.or]: [
          { reference_number: { [Op.iLike]: `%${search}%` } },
          { "$opportunity.lead.name$": { [Op.iLike]: `%${search}%` } },
          { "$opportunity.lead.email$": { [Op.iLike]: `%${search}%` } },
          { "$opportunity.lead.phone$": { [Op.iLike]: `%${search}%` } },
          { "$opportunity.lead.propertyDetail.estate_name$": { [Op.iLike]: `%${search}%` } },
          { "$opportunity.lead.assignee.name$": { [Op.iLike]: `%${search}%` } },
        ],
      });
    }

    // ── Sorting ─────────────────────────────────────────────────────────────
    const orderMap = {
      created_at: [["created_at", sort_order]],
      updated_at: [["updated_at", sort_order]],
      reference_id: [["reference_number", sort_order]],
      customer_name: [[{ model: Opportunity, as: "opportunity" }, { model: Leads, as: "lead" }, "name", sort_order]],
      status: [["status", sort_order]],
      title_date: [[{ model: Opportunity, as: "opportunity" }, { model: Leads, as: "lead" }, { model: PropertyDetail, as: "propertyDetail" }, "title_date", sort_order]],
      estate_name: [[{ model: Opportunity, as: "opportunity" }, { model: Leads, as: "lead" }, { model: PropertyDetail, as: "propertyDetail" }, "estate_name", sort_order]],
    };

    const order = orderMap[sort_by] || orderMap.created_at;

    // ── Main Query ──────────────────────────────────────────────────────────
    const { rows, count } = await Job.findAndCountAll({
      where,
      include: [
        {
          model: Opportunity,
          as: "opportunity",
          required: true,
          include: [
            {
              model: Leads,
              as: "lead",
              required: true,
              include: [
                {
                  model: PropertyDetail,
                  as: "propertyDetail",
                  include: [{ model: State, as: "state" }],
                },
                {
                  model: Users,
                  as: "assignee",
                },
              ],
            },
          ],
        },
      ],
      order,
      limit: pageSize,
      offset,
      distinct: true, // Crucial for count accuracy with joins
    });

    // ── Aggregations (Independent of filters except tenant scope) ────────────
    const [statusCounts, totalJobs] = await Promise.all([
      Job.findAll({
        attributes: [
          "status",
          [db.sequelize.fn("COUNT", db.sequelize.col("job_id")), "count"],
        ],
        where: tenantScope,
        group: ["status"],
        raw: true,
      }),
      Job.count({ where: tenantScope }),
    ]);

    /*
     * Seeded with the whole lifecycle (see constants/job.js) so a status with no
     * jobs still reports 0 and keeps its tab, then EVERY status actually present
     * is added on top.
     *
     * The seed used to be a whitelist that silently dropped anything else, which
     * hid "Handover Completed" jobs from the tabs and the chart entirely: the
     * table listed them, the counters did not, and "All" disagreed with Total
     * Jobs. Unknown statuses are counted rather than discarded.
     */
    const statusSummary = {
      [JOB_STATUS_IN_PROGRESS]: 0,
      [JOB_STATUS_HANDOVER_COMPLETED]: 0,
      [JOB_STATUS_COMPLETED]: 0,
      [JOB_STATUS_ON_HOLD]: 0,
      [JOB_STATUS_CANCELLED]: 0,
      [JOB_STATUS_ARCHIVED]: 0,
    };
    statusCounts.forEach(row => {
      if (!row.status) {
        return;
      }
      statusSummary[row.status] = (statusSummary[row.status] ?? 0) + parseInt(row.count, 10);
    });

    // ── Data Formatting ─────────────────────────────────────────────────────
    const formattedJobs = rows.map(job => {
      const plainJob = job.get({ plain: true });
      const lead = plainJob.opportunity?.lead;
      const pd = lead?.propertyDetail;
      const st = pd?.state;
      const u = lead?.assignee;

      const addressParts = [
        pd?.lot_number,
        pd?.street,
        pd?.address_line1,
        pd?.address_line2,
        pd?.city,
        st?.name,
        pd?.zip_code,
      ].map(s => s?.trim()).filter(s => !!s);

      const jobAddress = addressParts.length > 0 ? addressParts.join(", ") : "N/A";

      return {
        jobId: plainJob.job_id,
        referenceNumber: plainJob.reference_number,
        status: plainJob.status,
        // Seeded demo job — badged in the UI, cleared from Settings → Sample Data.
        isSampleData: plainJob.is_sample_data === true,
        jobNote: plainJob.job_note,
        builderId: plainJob.builder_id,
        companyId: plainJob.company_id,
        createdAt: plainJob.createdAt || plainJob.created_at,
        updatedAt: plainJob.updatedAt || plainJob.updated_at,
        leadsId: lead?.leads_id,
        customerName: lead?.name,
        customerEmail: lead?.email,
        customerPhone: lead?.phone,
        estateName: pd?.estate_name,
        titleDate: pd?.title_date,
        jobAddress,
        consultantId: u?.users_id,
        consultantName: u?.name,
        consultantInitials: u?.initials,
        consultantEmail: u?.email,
      };
    });

    return {
      success: true,
      data: {
        jobs: formattedJobs,
        pagination: {
          page: parseInt(page),
          limit: pageSize,
          total: count,
          totalPages: Math.ceil(count / pageSize),
        },
        statusSummary,
        totalJobs,
      },
      message: "Jobs fetched successfully",
    };
  } async getJobById(jobId, user) {
    const {
      Job, Opportunity, Leads, PropertyDetail, State, Users, Builder, LeadSource,
      QuotationVersionItem, Invoice, Facade, FloorPlan, HouseLandPackage, QuotationVersion,
      JobColorSelection, JobVariation, Maintenance, BusinessContact, Company, Address,
    } = db.sequelize.models;
    // Tenant context passed through to the colour-cost lookup below.
    const builderId = user?.builder_id;
    const companyId = user?.company_id;

    const tenantScope = this._buildTenantScope(user);

    // Phase 4 — row scope: Site Supervisor / Contact can only fetch their own job.
    const jobRowScope = applyRowScope({}, user, MODULES.JOB, JOB_SCOPE_COLUMNS);

    try {
      // 1. Fetch main job detail with associations
      const job = await Job.findOne({
        where: { job_id: jobId, ...tenantScope, ...jobRowScope },
        include: [
          {
            model: Opportunity,
            as: "opportunity",
            include: [
              {
                model: Leads,
                as: "lead",
                include: [
                  {
                    model: PropertyDetail,
                    as: "propertyDetail",
                    include: [{ model: State, as: "state" }],
                  },
                  { model: Users, as: "assignee" },
                  { model: LeadSource, as: "leadSource" },
                  {
                    model: HouseLandPackage,
                    as: "houseLandPackage",
                    include: [
                      { model: Facade, as: "facade" },
                      { model: FloorPlan, as: "floorPlan" },
                    ],
                  },
                ],
              },
            ],
          },
          { model: Builder, as: "builder" },
          {
            model: Company,
            as: "company",
            attributes: ["company_id", "name", "abn_number"],
            include: [
              {
                model: Address,
                as: "address",
                include: [{ model: State, as: "state", attributes: ["name"] }],
              },
            ],
          },
          {
            model: QuotationVersion,
            as: "quotationVersion",
            include: [
              { model: Facade, as: "facade" },
              { model: FloorPlan, as: "floorPlan" },
            ],
          },
        ],
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
      }

      const plainJob = job.get({ plain: true });
      const opportunity = plainJob.opportunity;
      const lead = opportunity?.lead;
      const propertyDetail = lead?.propertyDetail;
      const state = propertyDetail?.state;
      const consultant = lead?.assignee;
      const builder = plainJob.builder;
      const leadSource = lead?.leadSource;

      const quotationVersion = plainJob.quotationVersion;
      const houseLandPackage = lead?.houseLandPackage;

      const facade = quotationVersion?.facade || houseLandPackage?.facade;
      const floorPlan = quotationVersion?.floorPlan || houseLandPackage?.floorPlan;

      // Manually resolve image URLs since Sequelize nested include hooks do not automatically run
      if (facade) {
        await resolveImageUrls(facade, ["image"], db.sequelize);
      }
      if (floorPlan) {
        await resolveImageUrls(floorPlan, ["detailed_image", "simple_image"], db.sequelize);
      }

      // 2. Fetch Aggregations & Invoices in parallel
      const [quotationTotalResult, totalPaidResult, invoices, colorSelections, variations, maintenance, businessContacts] = await Promise.all([
        // Quotation Total — the quoted grand total, not a bare item sum (which
        // omits the structure engineer and facade charges held on the version).
        getQuotationVersionGrandTotal(plainJob.quotation_version_id),
        // Total Paid
        Invoice.sum("deposite_amount", {
          where: { leads_id: lead?.leads_id },
        }),
        // Invoice List
        Invoice.findAll({
          where: { leads_id: lead?.leads_id },
          attributes: [
            ["invoice_id", "invoiceId"],
            ["reference_number", "referenceNumber"],
            ["invoice_amount", "invoiceAmount"],
            ["deposite_amount", "depositAmount"],
            "status",
          ],
          order: [["created_at", "ASC"]],
          raw: true,
        }),
        // Selected Colors
        JobColorSelection.findAll({
          where: { job_id: jobId },
          attributes: ["color_item_id"],
          raw: true,
        }),
        // Job Variations
        JobVariation.findAll({
          where: { job_id: jobId, ...tenantScope },
          attributes: ["amount", "status"],
          raw: true,
        }),
        // Post Construction — the maintenance record created once the
        // Confirmation step is completed. Null until then; the frontend uses it
        // to link straight to the maintenance dashboard.
        Maintenance.findOne({
          where: { job_id: jobId },
          attributes: ["maintenance_id", "status", "handover_date"],
          raw: true,
        }),
        // Company / Conveyancer / Mortgage Broker / Financer captured on the lead,
        // shown in the job header popover.
        lead?.leads_id
          ? BusinessContact.findAll({
            where: { leads_id: lead.leads_id },
            include: [{ model: State, as: "state", attributes: ["name"] }],
            order: [["created_at", "ASC"]],
          })
          : [],
      ]);

      let colorsCost = 0;
      const selectedItemIds = (colorSelections || []).map(s => s.color_item_id);
      if (selectedItemIds.length > 0) {
        try {
          const selectedItems = await getColorItemsByIdsService({
            ids: selectedItemIds,
            companyId,
            builderId,
          });
          colorsCost = selectedItems.reduce((sum, item) => sum + Number(item.cost || 0), 0);
        } catch (err) {
          console.error("Error calculating colors cost for job:", err);
        }
      }

      const approvedVariations = (variations || []).filter(v => v.status === "approved");
      const variationsCount = approvedVariations.length;
      const variationsCost = approvedVariations.reduce((sum, v) => sum + Number(v.amount || 0), 0);

      // 3. Format Address
      const addressParts = [
        propertyDetail?.lot_number,
        propertyDetail?.street,
        propertyDetail?.address_line1,
        propertyDetail?.address_line2,
        propertyDetail?.city,
        state?.name,
        propertyDetail?.zip_code,
      ].map(s => s?.trim()).filter(s => !!s);

      const jobAddress = addressParts.length > 0 ? addressParts.join(", ") : "N/A";

      // 4. Final Response Object
      const data = {
        jobId: plainJob.job_id,
        referenceNumber: plainJob.reference_number,
        status: plainJob.status,
        // Seeded demo job — badged in the UI, cleared from Settings → Sample Data.
        isSampleData: plainJob.is_sample_data === true,
        jobNote: plainJob.job_note,
        builderId: plainJob.builder_id,
        companyId: plainJob.company_id,
        quotationVersionId: plainJob.quotation_version_id,
        createdAt: plainJob.createdAt || plainJob.created_at,
        updatedAt: plainJob.updatedAt || plainJob.updated_at,
        leadsId: lead?.leads_id,
        customerName: lead?.name,
        customerEmail: lead?.email,
        customerPhone: lead?.phone,
        estateName: propertyDetail?.estate_name,
        titleDate: propertyDetail?.title_date,
        titleStatus: propertyDetail?.title_status,
        jobAddress,
        builderName: builder?.name,
        leadSourceName: leadSource?.name,
        consultantId: consultant?.users_id,
        consultantName: consultant?.name,
        consultantInitials: consultant?.initials,
        consultantEmail: consultant?.email,
        quotationTotal: (quotationTotalResult || 0).toString(),
        totalPaid: (totalPaidResult || 0).toString(),
        colorsCost: colorsCost.toString(),
        variationsCost: variationsCost.toString(),
        variationsCount,
        invoices: invoices || [],
        // The building company on the job — Settings → Company Details for the
        // name/address, the builder profile for its contact phone and email.
        companyDetails: plainJob.company
          ? {
            name: plainJob.company.name,
            abnNumber: plainJob.company.abn_number || builder?.abn_number || null,
            address1: plainJob.company.address?.address_line1 || null,
            address2: plainJob.company.address?.address_line2 || null,
            city: plainJob.company.address?.city || null,
            zipCode: plainJob.company.address?.zip_code || null,
            stateName: plainJob.company.address?.state?.name || null,
            phone: builder?.phone_number || null,
            email: builder?.email || null,
          }
          : null,
        businessContacts: (businessContacts || []).map(bc => ({
          businessContactId: bc.business_contact_id,
          contactType: bc.contact_type,
          name: bc.name,
          email: bc.email,
          phone: bc.phone,
          address1: bc.address1,
          address2: bc.address2,
          city: bc.city,
          zipCode: bc.zip_code,
          stateName: bc.state?.name || null,
          abnNumber: bc.abn_number,
          acnNumber: bc.acn_number,
        })),
        facadeName: facade?.name || null,
        facadeImage: facade?.image || null,
        floorPlanName: floorPlan?.name || null,
        floorPlanDetailedImage: floorPlan?.detailed_image || null,
        floorPlanSimpleImage: floorPlan?.simple_image || null,
        preconstructionClosedAt: plainJob.preconstruction_closed_at || null,
        colorApprovedAt: plainJob.color_approved_at || null,
        completionApprovalStatus: plainJob.completion_approval_status || null,
        // Post Construction → Confirmation completed. maintenanceId is the id of
        // the maintenance dashboard page the frontend should open for this job.
        maintenanceId: maintenance?.maintenance_id || null,
        maintenanceStatus: maintenance?.status || null,
        handoverDate: maintenance?.handover_date || null,
      };

      return {
        success: true,
        data,
        message: "Job detail fetched successfully",
      };
    } catch (error) {
      console.error("JobService.getJobById error:", error);
      throw error;
    }
  }

  // ── Contact self-service — "track my build" ───────────────────────────────
  //
  // A Contact-role user is never a job's supervisor, creator or assignee, so
  // none of the row scopes the CRM list uses can reach their job. Their link is
  // job.customer_contact_id, stamped at conversion from the lead's first mapped
  // contact (see convertOpportunityToJob). The two methods below constrain every
  // row to that column, which is why — like /leads/my/tracking — they need no
  // JOB module permission: the Contact role has none, yet must be able to follow
  // its own build. A non-contact caller simply matches nothing.
  //
  // They are NOT a second front door onto getJobById: that payload carries the
  // builder's view of the job. These return a curated, read-only subset.

  /** Ownership + tenant predicate shared by both self-service reads. */
  _buildContactJobScope(user) {
    const userId = user?.users_id || user?.id;
    if (!userId) {
      return null;
    }

    // Tenant guard on top of the ownership filter — a contact only ever sees a
    // job inside their own builder/company, never one that shares their id in
    // another tenant.
    const tenantOr = [];
    if (user?.builder_id) {
      tenantOr.push({ builder_id: user.builder_id });
    }
    if (user?.company_id) {
      tenantOr.push({ company_id: user.company_id });
    }

    const where = { customer_contact_id: userId };
    if (tenantOr.length) {
      where[Op.or] = tenantOr;
    }
    return where;
  }

  /**
   * The job's WHOLE stage timeline — Sales → Preconstruction → Colour →
   * Construction → Postconstruction → Maintenance — with each stage's per-job
   * sub-stage counts left-joined on.
   *
   * Not getJobStageProgress(): that one exists to answer "has the job reached
   * its final workflow stage" for the automation, so it starts FROM
   * job_sub_stage and filters to func.is_workflow. A stage the job has no synced
   * sub-stages for simply vanishes, which is why the customer tracker showed
   * Preconstruction alone and called it 100%. Starting from job_process_stage
   * and LEFT JOINing keeps every stage in the tenant's process, whether or not
   * it has sub-stages of its own.
   */
  async _fetchJobStageTimeline(job) {
    return db.sequelize.query(
      `SELECT jps.stage_id,
              jps.name       AS stage_name,
              jps.sort_order AS stage_order,
              func.name      AS functionality_name,
              func.is_workflow,
              COUNT(jss.sub_stage_id) FILTER (WHERE jss.is_synced)::int AS total,
              COUNT(jss.sub_stage_id) FILTER (
                WHERE jss.is_synced AND (jss.is_completed OR jss.is_skipped)
              )::int AS closed
         FROM job_process_stage jps
         JOIN job_process_stage_functionality func
           ON func.functionality_id = jps.functionality_id
         LEFT JOIN job_sub_stage jss
           ON jss.stage_id = jps.stage_id AND jss.job_id = :jobId
        WHERE (CAST(:builderId AS uuid) IS NULL OR jps.builder_id = CAST(:builderId AS uuid))
          AND (CAST(:companyId AS uuid) IS NULL OR jps.company_id = CAST(:companyId AS uuid))
        GROUP BY jps.stage_id, jps.name, jps.sort_order, func.name, func.is_workflow
        ORDER BY jps.sort_order ASC`,
      {
        replacements: {
          jobId: job.job_id,
          builderId: job.builder_id || null,
          companyId: job.company_id || null,
        },
        type: QueryTypes.SELECT,
      },
    );
  }

  /**
   * The timeline reduced to what a homebuyer needs: which stages are done,
   * which one is in play, and how far along the build is.
   *
   * The completion rules mirror the builder's own stage header — a stage's
   * truth is spread across the job row, the opportunity and the sub-stage
   * table, and reading sub-stages alone gets it wrong for the four stages that
   * have none. Sales is closed because the job exists at all; Preconstruction
   * and Colour are stamped on the job; Construction/Postconstruction are the
   * workflow stages that really do count sub-stages; Maintenance follows the
   * maintenance record.
   */
  async _summariseStageProgress(job, maintenance = null) {
    const rows = await this._fetchJobStageTimeline(job);
    const norm = (value) => (value || "").trim().toLowerCase();

    // Where the job says it is. Falls back to the first stage so an unknown or
    // blank status never marks the whole timeline complete.
    const activeIndex = Math.max(
      0,
      rows.findIndex((r) => norm(r.stage_name) === norm(job.status)),
    );
    const handoverComplete =
      !!maintenance?.maintenance_id || norm(job.status) === "handover completed";

    const stages = rows.map((row, index) => {
      const name = norm(row.stage_name);
      const functionality = norm(row.functionality_name);
      const isWorkflow = row.is_workflow === true || functionality === "workflow";
      const allSubStagesDone = row.total > 0 && row.closed === row.total;

      let isComplete = index < activeIndex;

      if (name === "sales" || functionality === "sales") {
        // A job only exists because its lead was won, so Sales is always closed.
        isComplete = true;
      } else if (name === "preconstruction") {
        isComplete = isComplete || !!job.preconstruction_closed_at;
      } else if (name === "colour" || name === "color") {
        isComplete = isComplete || !!job.color_approved_at;
      } else if (name === "maintenance") {
        isComplete = norm(maintenance?.status) === "completed";
      } else if (isWorkflow) {
        // Construction / Postconstruction — done when their own sub-stages are,
        // independent of how far the job as a whole has been marked.
        isComplete = allSubStagesDone;
      }

      // A handed-over job has finished post-construction by definition, even if
      // not every sub-stage was ticked off individually.
      if (
        handoverComplete &&
        (name === "postconstruction" || functionality === "post-construction workflow")
      ) {
        isComplete = true;
      }

      return {
        stageId: row.stage_id,
        stageName: row.stage_name,
        stageOrder: row.stage_order,
        isComplete,
        totalSteps: row.total,
        completedSteps: row.closed,
      };
    });

    // The first unfinished stage is the one under way. Null once they are all
    // closed, which is what marks the build complete.
    const current = stages.find((s) => !s.isComplete) || null;

    // Whole stages carry the bar, with partial credit for the one in play
    // measured by its own steps — counting sub-stages alone would ignore the
    // four stages that have none, and counting stages alone leaves the number
    // frozen for weeks mid-construction.
    const completedCount = stages.filter((s) => s.isComplete).length;
    const currentPartial =
      current && current.totalSteps > 0 ? current.completedSteps / current.totalSteps : 0;
    const percentComplete = stages.length
      ? Math.round(((completedCount + currentPartial) / stages.length) * 100)
      : 0;

    // "Closed" rather than "Completed" for the two stages the builder's own
    // header words that way, so a customer reading both sees the same language.
    const labelFor = (stage) => {
      if (stage.isComplete) {
        const name = norm(stage.stageName);
        return name === "sales" || name === "preconstruction" ? "Closed" : "Completed";
      }
      if (current && stage.stageId === current.stageId) {
        return "In progress";
      }
      return "Pending";
    };

    return {
      stages: stages.map((s) => ({
        ...s,
        isCurrent: current ? s.stageId === current.stageId : false,
        statusLabel: labelFor(s),
      })),
      currentStageName: current?.stageName || null,
      percentComplete,
    };
  }

  /** GET /job/my/tracking — every job the caller is the homebuyer on. */
  async getMyContactJobs(user) {
    const { Job, Opportunity, Leads, PropertyDetail, State } = db.sequelize.models;

    const where = this._buildContactJobScope(user);
    if (!where) {
      return { success: false, statusCode: 401, message: "Unauthorized" };
    }

    try {
      const jobs = await Job.findAll({
        where,
        include: [
          {
            model: Opportunity,
            as: "opportunity",
            include: [
              {
                model: Leads,
                as: "lead",
                include: [
                  {
                    model: PropertyDetail,
                    as: "propertyDetail",
                    include: [{ model: State, as: "state" }],
                  },
                ],
              },
            ],
          },
        ],
        order: [["created_at", "DESC"]],
      });

      // Maintenance decides whether the Maintenance / Postconstruction stages
      // count as done, so the progress bar needs it. Fetched once for the whole
      // page rather than per row.
      const { Maintenance } = db.sequelize.models;
      const maintenanceRows = jobs.length
        ? await Maintenance.findAll({
          where: { job_id: { [Op.in]: jobs.map((j) => j.job_id) } },
          attributes: ["maintenance_id", "job_id", "status", "handover_date"],
          raw: true,
        })
        : [];
      const maintenanceByJob = new Map(maintenanceRows.map((m) => [m.job_id, m]));

      const rows = await Promise.all(
        jobs.map(async (row) => {
          const p = row.get({ plain: true });
          const lead = p.opportunity?.lead;
          const propertyDetail = lead?.propertyDetail;
          const progress = await this._summariseStageProgress(
            p,
            maintenanceByJob.get(p.job_id) || null,
          );

          return {
            jobId: p.trackingToken || p.tracking_token || p.jobId || p.job_id,
            referenceNumber: p.reference_number,
            status: p.status,
            leadsId: lead?.leads_id || null,
            jobAddress: this._buildJobAddress(propertyDetail, propertyDetail?.state) || "N/A",
            estateName: propertyDetail?.estate_name || null,
            createdAt: p.createdAt || p.created_at,
            currentStageName: progress.currentStageName,
            percentComplete: progress.percentComplete,
          };
        }),
      );

      return { success: true, data: { jobs: rows }, message: "Jobs fetched successfully" };
    } catch (error) {
      console.error("JobService.getMyContactJobs error:", error);
      throw error;
    }
  }

  /**
   * GET /job/my/tracking/:job_id — the homebuyer's build tracker.
   *
   * Ownership is proven by customer_contact_id, and that is the 404 boundary: a
   * job id the caller does not own returns "not found" and leaks nothing.
   */
  async getMyContactJobById(user, jobId) {
    const {
      Job, Opportunity, Leads, PropertyDetail, State, Users, Builder,
      QuotationVersion, Facade, FloorPlan, HouseLandPackage, Maintenance,
    } = db.sequelize.models;

    const scope = this._buildContactJobScope(user);
    if (!scope) {
      return { success: false, statusCode: 401, message: "Unauthorized" };
    }

    try {
      const job = await Job.findOne({
        where: {
          ...scope,
          [Op.or]: [{ tracking_token: jobId }, { job_id: jobId }],
        },
        include: [
          {
            model: Opportunity,
            as: "opportunity",
            include: [
              {
                model: Leads,
                as: "lead",
                include: [
                  {
                    model: PropertyDetail,
                    as: "propertyDetail",
                    include: [{ model: State, as: "state" }],
                  },
                  { model: Users, as: "assignee" },
                  {
                    model: HouseLandPackage,
                    as: "houseLandPackage",
                    include: [
                      { model: Facade, as: "facade" },
                      { model: FloorPlan, as: "floorPlan" },
                    ],
                  },
                ],
              },
            ],
          },
          { model: Builder, as: "builder" },
          {
            model: QuotationVersion,
            as: "quotationVersion",
            include: [
              { model: Facade, as: "facade" },
              { model: FloorPlan, as: "floorPlan" },
            ],
          },
        ],
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found" };
      }

      const p = job.get({ plain: true });
      const lead = p.opportunity?.lead;
      const propertyDetail = lead?.propertyDetail;
      const consultant = lead?.assignee;
      const houseLandPackage = lead?.houseLandPackage;
      const facade = p.quotationVersion?.facade || houseLandPackage?.facade;
      const floorPlan = p.quotationVersion?.floorPlan || houseLandPackage?.floorPlan;

      // Nested include hooks don't run, so the image columns are still raw keys.
      if (facade) {
        await resolveImageUrls(facade, ["image"], db.sequelize);
      }
      if (floorPlan) {
        await resolveImageUrls(floorPlan, ["detailed_image", "simple_image"], db.sequelize);
      }

      // Maintenance first: whether the Maintenance / Postconstruction stages
      // count as done depends on it, so the stage summary needs it in hand.
      const maintenance = await Maintenance.findOne({
        where: { job_id: p.job_id },
        attributes: ["maintenance_id", "status", "handover_date"],
        raw: true,
      });

      const [progress, money] = await Promise.all([
        this._summariseStageProgress(p, maintenance),
        // The ledger is the one place the money on a job is added up, and it
        // already redacts the builder's expense book for anyone without INVOICE
        // READ — which a Contact has not got. Reusing it keeps the customer's
        // balance identical to the builder's view of it instead of re-deriving
        // the arithmetic here. Degraded to null rather than fatal: a build
        // tracker that can't price itself is still worth rendering.
        getJobLedgerService(p.job_id, user)
          .then((result) => result?.data?.summary || null)
          .catch((err) => {
            console.error("JobService.getMyContactJobById ledger error:", err);
            return null;
          }),
      ]);

      return {
        success: true,
        data: {
          jobId: p.trackingToken || p.tracking_token || p.jobId || p.job_id,
          referenceNumber: p.reference_number,
          status: p.status,
          leadsId: lead?.leads_id || null,
          createdAt: p.createdAt || p.created_at,
          updatedAt: p.updatedAt || p.updated_at,

          customerName: lead?.name || null,
          jobAddress: this._buildJobAddress(propertyDetail, propertyDetail?.state) || "N/A",
          estateName: propertyDetail?.estate_name || null,
          titleStatus: propertyDetail?.title_status || null,
          titleDate: propertyDetail?.title_date || null,

          builderName: p.builder?.name || null,
          consultantName: consultant?.name || null,
          consultantEmail: consultant?.email || null,

          facadeName: facade?.name || null,
          facadeImage: facade?.image || null,
          floorPlanName: floorPlan?.name || null,
          floorPlanSimpleImage: floorPlan?.simple_image || null,
          floorPlanDetailedImage: floorPlan?.detailed_image || null,

          preconstructionClosedAt: p.preconstruction_closed_at || null,
          colorApprovedAt: p.color_approved_at || null,
          handoverDate: maintenance?.handover_date || null,
          maintenanceStatus: maintenance?.status || null,

          ...progress,

          // Customer book only — see the ledger call above.
          payments: money
            ? {
              quotationTotal: money.quotationTotal,
              colorsCost: money.colorsCost,
              variationsCost: money.variationsCost,
              variationsCount: money.variationsCount,
              totalCharged: money.totalCharged,
              totalPaid: money.totalCredited,
              balance: money.balance,
              isInCredit: money.isCustomerInCredit,
            }
            : null,
        },
        message: "Job detail fetched successfully",
      };
    } catch (error) {
      console.error("JobService.getMyContactJobById error:", error);
      throw error;
    }
  }

  /**
   * Whose copy of the colour catalogue this job's colours should be cloned from.
   *
   * Seeded rows are cloned per person and read back by owner (see
   * OWNER_SCOPED_MODELS — `Color` is on it), so a demo catalogue belongs to the
   * staff member who imported it. The builder sees their own copy and the job's
   * colour screen clones from it; the homebuyer, reading as themselves, saw no
   * template at all, cloned nothing, and was told their builder had published
   * no colours.
   *
   * A job's colours are the set the builder published for that build, so what
   * gets cloned must not depend on who happens to open the screen first. When
   * the tenant's catalogue was imported by exactly one person, the read runs as
   * them: that person's seeded colours come across, and the non-seeded ones do
   * too — they are visible to everyone whatever the viewer.
   *
   * Returns null — "read as the caller" — when nothing is seeded (nothing to
   * widen) or when several people imported. Two importers means two copies of
   * the same catalogue, and cloning both would stack every colour into the job
   * twice.
   */
  async _resolveColourCatalogueOwner(companyId, builderId) {
    if (!companyId || !builderId) {
      return null;
    }

    const { Color } = db.sequelize.models;

    const owners = await runAcrossAllSampleDataOwners(() => Color.findAll({
      where: { company_id: companyId, builder_id: builderId, is_sample_data: true },
      attributes: ["sample_data_owner_id"],
      group: ["sample_data_owner_id"],
      raw: true,
    }));

    const distinct = owners.map((o) => o.sample_data_owner_id).filter(Boolean);
    return distinct.length === 1 ? distinct[0] : null;
  }

  /**
   * GET /job/my/tracking/:job_id/colours — the homebuyer's colour catalogue.
   *
   * The Colour stage is the customer's own step, so this is the one part of the
   * tracker they can act on. It returns the job's own cloned colour items —
   * never the tenant template — grouped into the categories the consultant set
   * up, each item flagged with whether it is currently chosen.
   *
   * Honours the builder's colour settings: a tenant that hides images or prices
   * on the internal colour screen hides them here too, rather than the customer
   * portal quietly becoming the one place costs leak.
   */
  async getMyContactJobColours(user) {
    const { JobColorCategory, JobColorSettings } = db.sequelize.models;

    const scope = this._buildContactJobScope(user);
    if (!scope) {
      return { success: false, statusCode: 401, message: "Unauthorized" };
    }

    try {
      const { Job } = db.sequelize.models;
      const job = await Job.findOne({
        where: scope,
        attributes: ["job_id", "builder_id", "company_id", "color_approved_at", "tracking_token"],
      });
      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found" };
      }

      const resolvedJobId = job.job_id;

      // The tenant the catalogue is cloned from. The job's own columns are
      // preferred, but a job converted from a lead that predates company
      // stamping carries none — and ensureJobColorsCloned() bails out silently
      // without both, so the customer's first visit cloned nothing and the page
      // read as "your builder has not published any colours". The contact is in
      // this job's tenant (_buildContactJobScope proves it), so their own
      // builder/company is the right fallback, and it is what the builder-side
      // colour screen passes anyway.
      const companyId = job.company_id || user?.company_id || null;
      // Which builder's catalogue this job clones from — its own when it has
      // one, otherwise the company's. Resolved before the ownership probe below,
      // which would otherwise ask about the wrong builder.
      const builderId = await resolveCatalogueBuilderId(
        companyId,
        job.builder_id || user?.builder_id || null,
      );

      // Seeded catalogues belong to the person who imported them, so the
      // contact's own viewer scope hides the builder's demo colours from the
      // clone. Read them as that person instead; see the helper.
      const catalogueOwnerId = await this._resolveColourCatalogueOwner(companyId, builderId);
      // Clones the tenant template into the job's colour tables on first
      // access and flags each item with isSelected — the same call the
      // internal colour document page runs.
      const readItems = () => getJobColorDocumentItemsService({
        jobId: resolvedJobId,
        companyId,
        builderId,
      });

      // Awaited before the categories are read, not alongside them: the same
      // call creates those categories on a first visit, and a concurrent read
      // came back empty and tipped every item into the trailing "Other" group.
      const items = catalogueOwnerId
        ? await runAsSampleDataViewer(catalogueOwnerId, readItems)
        : await readItems();

      const tenantOr = [];
      if (builderId) {
        tenantOr.push({ builder_id: builderId });
      }
      if (companyId) {
        tenantOr.push({ company_id: companyId });
      }

      const [categories, settings, canEdit] = await Promise.all([
        JobColorCategory.findAll({
          where: { job_id: resolvedJobId, status: true },
          attributes: ["color_category_id", "category_name", "selection_type", "sort_order"],
          include: [
            {
              model: db.sequelize.models.JobColor,
              as: "color",
              attributes: ["color_name"],
              required: false,
            },
          ],
          order: [["sort_order", "ASC"]],
        }),
        tenantOr.length
          ? JobColorSettings.findOne({
            where: { [Op.or]: tenantOr },
            attributes: ["hide_color_item_images", "hide_color_item_price"],
            raw: true,
          })
          : null,
        // The same gate the save carries, answered here so the page can render
        // read-only rather than offering a button that comes back 403.
        resolvePermission(user, MODULES.COLOR_SELECTION, ACTIONS.UPDATE),
      ]);

      const hideImages = settings?.hide_color_item_images === true;
      const hidePrices = settings?.hide_color_item_price === true;

      const itemsByCategory = new Map();
      for (const item of items) {
        const key = item.colorCategoryId || item.categoryName || "uncategorised";
        if (!itemsByCategory.has(key)) {
          itemsByCategory.set(key, []);
        }
        itemsByCategory.get(key).push({
          colorItemId: item.colorItemId,
          itemName: item.itemName,
          itemCode: item.itemCode,
          description: item.description || null,
          supplierName: item.supplierName || null,
          upgradeOption: item.upgradeOption || null,
          isSelected: item.isSelected === true,
          units: item.units,
          quantity: item.quantity,
          image: hideImages ? null : item.image || null,
          cost: hidePrices ? null : item.cost,
          costType: hidePrices ? null : item.costType,
          colorName: item.colorName || null,
        });
      }

      // Categories drive the order; anything whose category was removed or
      // deactivated still needs somewhere to live, so it lands in a trailing
      // "Other" group rather than disappearing from the customer's view.
      const grouped = categories.map((category) => ({
        categoryId: category.color_category_id,
        categoryName: category.category_name,
        colorName: category.color?.color_name || null,
        // "single" = pick one; anything else lets the customer pick several.
        selectionType: category.selection_type || "multiple",
        items: itemsByCategory.get(category.color_category_id) || [],
      }));

      const placed = new Set(categories.map((c) => c.color_category_id));
      const orphans = [...itemsByCategory.entries()]
        .filter(([key]) => !placed.has(key))
        .flatMap(([, value]) => value);
      if (orphans.length) {
        grouped.push({
          categoryId: null,
          categoryName: "Other",
          selectionType: "multiple",
          items: orphans,
        });
      }

      return {
        success: true,
        data: {
          jobId: job.trackingToken || job.tracking_token || job.jobId || job.job_id,
          // Approval is the consultant's to give, and it freezes the selections.
          isLocked: !!(job.colorApprovedAt || job.color_approved_at),
          // Whether this role may change the picks at all — READ-only Colour
          // Selection means look, don't touch.
          canEdit: canEdit === true,
          colorApprovedAt: job.colorApprovedAt || job.color_approved_at || null,
          showPrices: !hidePrices,
          showImages: !hideImages,
          categories: grouped.filter((c) => c.items.length > 0),
        },
        message: "Colours fetched successfully",
      };
    } catch (error) {
      console.error("JobService.getMyContactJobColours error:", error);
      throw error;
    }
  }

  /**
   * PUT /job/my/tracking/:job_id/colours — save the homebuyer's picks.
   *
   * Saving is not approving: the customer may change their selections as often
   * as they like, and the consultant's approval (PATCH .../color/approve, which
   * this role cannot reach) is what stamps color_approved_at and closes the
   * stage. Once that is stamped the selections are frozen — a customer editing
   * colours out from under an approved schedule is exactly what approval is
   * meant to prevent.
   */
  async saveMyContactJobColours(user, body) {
    const scope = this._buildContactJobScope(user);
    if (!scope) {
      return { success: false, statusCode: 401, message: "Unauthorized" };
    }

    try {
      const { Job } = db.sequelize.models;
      const job = await Job.findOne({
        where: scope,
        attributes: ["job_id", "color_approved_at", "tracking_token"],
      });
      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found" };
      }

      if (job.color_approved_at) {
        return {
          success: false,
          statusCode: 409,
          message: "Your colour selections have been approved and can no longer be changed. Contact your consultant to make a change.",
        };
      }

      // Delegated so the customer's save goes through exactly the same
      // normalisation, stale-template-id healing and per-item meta merge as the
      // consultant's — two write paths into one table would drift.
      const result = await this.saveColorSelections(job.job_id, body, user);
      if (result.success && result.data) {
        result.data.jobId = job.trackingToken || job.tracking_token || job.jobId || job.job_id;

        // The button the customer pressed says "Send to builder", so the save
        // has to actually reach them. Fire-and-forget: the selections are
        // already committed, and a mail/queue problem must not turn a
        // successful save into an error the customer sees.
        this.notifyBuilderOfColourSubmission(job.job_id, user);
      }
      return result;
    } catch (error) {
      console.error("JobService.saveMyContactJobColours error:", error);
      throw error;
    }
  }

  /**
   * Find the login account behind the job's builder, so the colour submission
   * reaches the person the job header names rather than whatever address the
   * builder row happens to carry.
   *
   * The `builder` row's own `email` is the address the tenant was signed up
   * with — usually a company administrator — so a user account is always
   * preferred over it.
   *
   * @param {{builder_id: string|null, company_id: string|null, builder: object|null}} job
   * @returns {Promise<{users_id: string, name: string, email: string}|null>}
   */
  async _resolveBuilderUserAccount({ builder_id: builderId, company_id: companyId, builder }) {
    const { Users, Role } = db.sequelize.models;

    const builderRole = {
      model: Role,
      as: "role",
      attributes: [],
      required: true,
      where: db.sequelize.where(
        db.sequelize.fn("lower", db.sequelize.fn("btrim", db.sequelize.col("role.name"))),
        "builder",
      ),
    };
    const active = { is_active: true, is_deleted: false };
    // More than one Builder-role user means the earliest is the account the
    // builder was set up with — the same rule job-process tasks use.
    const query = {
      attributes: ["users_id", "name", "email"],
      include: [builderRole],
      order: [["createdAt", "ASC"]],
    };

    // By name first: assignJobBuilder find-or-creates a builder row *named
    // after* the chosen user, and that name is exactly what the job header
    // shows, so a Builder-role account with the same name in the same tenant is
    // the person the customer means. The row's builder_id is no help here — it
    // is often a fresh one the chosen user is not attached to.
    const builderName = typeof builder?.name === "string" ? builder.name.trim() : "";
    if (builderName) {
      const tenantOr = [];
      if (companyId) {
        tenantOr.push({ company_id: companyId });
      }
      if (builderId) {
        tenantOr.push({ builder_id: builderId });
      }

      const named = await Users.findOne({
        ...query,
        where: {
          ...active,
          name: { [Op.iLike]: builderName },
          ...(tenantOr.length ? { [Op.or]: tenantOr } : {}),
        },
      });
      if (named) {
        return named.get({ plain: true });
      }
    }

    // Builder rows that predate assignJobBuilder are named after the business
    // rather than a person, so fall back to the account that builder owns.
    if (builderId) {
      const own = await Users.findOne({ ...query, where: { ...active, builder_id: builderId } });
      if (own) {
        return own.get({ plain: true });
      }
    }

    return null;
  }

  /**
   * Who hears about a customer's colour selection.
   *
   * The button the customer pressed says "Send to builder", so the job's own
   * builder — the name shown on the job header — is who it goes to.
   *
   * The people working the job (Site Supervisor, then the lead's consultant)
   * are only a fallback for when that builder resolves to no address at all, so
   * a job with no builder assigned still reaches somebody instead of silently
   * dropping the customer's submission.
   *
   * @returns {Promise<{to: string[], recipientName: string, referenceNumber: string}|null>}
   */
  async _resolveColourSubmissionRecipients(jobId) {
    const { Job, Opportunity, Leads, Users, Builder } = db.sequelize.models;

    const record = await Job.findByPk(jobId, {
      attributes: ["job_id", "reference_number", "company_id", "builder_id"],
      include: [
        { model: Users, as: "supervisor", attributes: ["users_id", "name", "email"], required: false },
        { model: Builder, as: "builder", attributes: ["builder_id", "name", "email"], required: false },
        {
          model: Opportunity,
          as: "opportunity",
          attributes: ["opportunity_id"],
          required: false,
          include: [
            {
              model: Leads,
              as: "lead",
              attributes: ["leads_id"],
              required: false,
              include: [
                { model: Users, as: "assignee", attributes: ["users_id", "name", "email"], required: false },
              ],
            },
          ],
        },
      ],
    });
    if (!record) {
      return null;
    }

    const plain = record.get({ plain: true });
    const consultant = plain.opportunity?.lead?.assignee || null;
    const supervisor = plain.supervisor || null;
    const builder = plain.builder || null;
    const builderUser = await this._resolveBuilderUserAccount(plain);

    const seen = new Set();
    const to = [];
    const addRecipient = (email) => {
      const clean = typeof email === "string" ? email.trim() : "";
      if (!clean) {
        return false;
      }
      const key = clean.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      to.push(clean);
      return true;
    };

    // The builder the job is assigned to, and nobody else — anyone else on the
    // email is a person the customer did not press "Send to builder" for.
    let recipientName = "";
    if (addRecipient(builderUser?.email)) {
      recipientName = builderUser?.name || builder?.name || "";
    } else if (addRecipient(builder?.email)) {
      recipientName = builder?.name || "";
    }

    // No builder on the job at all: fall back to the people working it rather
    // than dropping the submission.
    if (to.length === 0) {
      if (addRecipient(supervisor?.email)) {
        recipientName = supervisor?.name || "";
      }
      if (addRecipient(consultant?.email) && !recipientName) {
        recipientName = consultant?.name || "";
      }
    }

    return { to, recipientName, referenceNumber: plain.reference_number || "" };
  }

  /**
   * Tell the builder that the homebuyer has sent their colours, and attach the
   * colour-selection PDF.
   *
   * Delivery reuses the builder-side "email colour selection" pipeline
   * (generateColorEmailService → colorEmail worker), so the PDF is rendered from
   * the same item ids, uploaded to S3 and attached exactly as it is when a
   * consultant mails the schedule out themselves — and the send is logged to the
   * notifications table by that worker.
   *
   * Never rejects: the caller has already committed the selections.
   */
  async notifyBuilderOfColourSubmission(jobId, user) {
    try {
      const { JobColorSelection, JobColorItem, JobColorCategory, JobColorSettings } = db.sequelize.models;

      const rows = await JobColorSelection.findAll({
        where: { job_id: jobId },
        attributes: ["color_item_id", "unit"],
        raw: true,
      });
      // Clearing every pick is a save, not a submission — there is nothing to
      // send the builder, and the attached PDF would be empty.
      if (rows.length === 0) {
        return;
      }

      const recipients = await this._resolveColourSubmissionRecipients(jobId);
      if (!recipients?.to?.length) {
        console.warn(`[ColourSubmission] No builder-side recipient for job ${jobId} — email skipped`);
        return;
      }

      const ctx = await this._fetchJobForColorReport(jobId);
      if (!ctx) {
        return;
      }

      const itemIds = rows.map((r) => r.color_item_id);
      const unitByItemId = {};
      rows.forEach((r) => {
        unitByItemId[r.color_item_id] = r.unit;
      });

      // The builder's colour settings decide whether prices exist on this
      // tenant's colour screen at all — an email that prints them anyway would
      // be the one place costs leak.
      const tenantOr = [];
      if (ctx.builderId) {
        tenantOr.push({ builder_id: ctx.builderId });
      }
      if (ctx.companyId) {
        tenantOr.push({ company_id: ctx.companyId });
      }
      const settings = tenantOr.length
        ? await JobColorSettings.findOne({
          where: { [Op.or]: tenantOr },
          attributes: ["hide_color_item_images", "hide_color_item_price"],
          raw: true,
        })
        : null;
      const showPrices = settings?.hide_color_item_price !== true;
      const showImages = settings?.hide_color_item_images !== true;

      const items = await JobColorItem.findAll({
        where: { job_id: jobId, color_item_id: { [Op.in]: itemIds } },
        attributes: ["color_item_id", "item_name", "item_code", "cost", "cost_type", "upgrade_option"],
        include: [
          {
            model: JobColorCategory,
            as: "colorCategory",
            attributes: ["color_category_id", "category_name", "sort_order"],
            required: false,
          },
          { model: db.sequelize.models.Supplier, as: "supplier", attributes: ["company_name"], required: false },
        ],
      });

      const money = (value) =>
        `$${Number(value || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

      // Only upgrades add to what the customer pays — the same rule the colour
      // report and the customer's own page total by.
      let upgradeTotal = 0;
      const byCategory = new Map();

      items.forEach((row) => {
        const item = row.get({ plain: true });
        const quantity = parseFloat(unitByItemId[item.color_item_id] ?? "") || 1;
        const isUpgrade = item.cost_type === "upgrade";
        const lineCost = isUpgrade ? Number(item.cost || 0) * quantity : 0;
        if (isUpgrade) {
          upgradeTotal += lineCost;
        }

        const key = item.colorCategory?.color_category_id || "uncategorised";
        if (!byCategory.has(key)) {
          byCategory.set(key, {
            categoryName: item.colorCategory?.category_name || "Other",
            sortOrder: item.colorCategory?.sort_order ?? Number.MAX_SAFE_INTEGER,
            items: [],
          });
        }
        byCategory.get(key).items.push({
          itemName: item.item_name,
          itemCode: item.item_code,
          supplierName: item.supplier?.company_name || null,
          upgradeOption: item.upgrade_option || null,
          quantity: quantity > 1 ? quantity : null,
          isUpgrade,
          costLabel: isUpgrade ? money(lineCost) : "Standard",
        });
      });

      const categories = [...byCategory.values()].sort((a, b) => a.sortOrder - b.sortOrder);
      const totalLabel = money(upgradeTotal);

      const colourUrl = env.EMAIL?.FRONTEND_BASE_URL
        ? `${env.EMAIL.FRONTEND_BASE_URL}/job/colour/${jobId}`
        : "#";

      const referenceNumber = ctx.jobInfo.referenceNumber || recipients.referenceNumber || "";
      const customerName = ctx.jobInfo.customerName || "";
      const subject = `Colour Selection Received${referenceNumber ? ` – ${referenceNumber}` : ""}${
        customerName ? ` (${customerName})` : ""
      }`;

      const html = wrapColourSelectionSubmittedHTML({
        recipientName: recipients.recipientName,
        customerName,
        referenceNumber,
        jobAddress: ctx.jobInfo.jobAddress,
        submittedAt: new Date().toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }),
        categories,
        itemCount: itemIds.length,
        upgradeTotal: upgradeTotal > 0 ? totalLabel : null,
        showPrices,
        colourUrl,
      });

      const queued = await generateColorEmailService({
        itemIds,
        jobInfoRaw: {
          job_id: jobId,
          job_address: ctx.jobInfo.jobAddress,
          customer_name: customerName,
          reference_number: referenceNumber,
          total_amount: showPrices ? totalLabel : "",
        },
        emailData: { to: recipients.to, cc: [], subject, message: html },
        user,
        showImage: showImages,
        showPrice: showPrices,
      });

      if (!queued?.success) {
        console.error(
          `[ColourSubmission] Failed to queue builder email for job ${jobId}: ${queued?.message || "unknown error"}`,
        );
        return;
      }

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId,
        module: "Job",
        moduleId: jobId,
        recordName: referenceNumber,
        action: "EMAIL_SENT",
        description: `${customerName || "The customer"} sent ${itemIds.length} colour selection${
          itemIds.length === 1 ? "" : "s"
        } to the builder (${recipients.to.join(", ")})`,
        metadata: { to: recipients.to, itemCount: itemIds.length },
      });
    } catch (error) {
      // The selections are already saved — a failed notification is logged, not
      // surfaced to the customer as a failed send.
      console.error(`[ColourSubmission] notify failed for job ${jobId}:`, error?.message || error);
    }
  }

  async convertOpportunityToJob(opportunityId, updateData, user) {
    const {
      out_come,
      quotation_version_id,
      job_note,
      send_email,
      lead_lost_reason_id,
      lead_lost_comment,
    } = updateData;

    const { Opportunity, Leads, Job, QuotationVersion, Notes } = db.sequelize.models;
    const t = await db.sequelize.transaction();

    try {
      // 1. Fetch opportunity + lead details
      const opportunity = await Opportunity.findOne({
        where: { opportunity_id: opportunityId },
        include: [
          {
            model: Leads,
            as: "lead",
            required: true, // Forces INNER JOIN to prevent FOR UPDATE postgres errors
          },
        ],
        transaction: t,
      });

      if (!opportunity) {
        await t.rollback();
        return { success: false, statusCode: 404, message: "Opportunity not found" };
      }

      // ── Lost Outcome ────────────────────────────────────────────────────────
      if (out_come === "lost") {
        await opportunity.update(
          {
            status: "Close",
            out_come: "lost",
            updatedAt: new Date(),
          },
          { transaction: t },
        );

        if (opportunity.lead) {
          await opportunity.lead.update(
            {
              lead_lost_reason_id,
              lead_lost_comment: lead_lost_comment || null,
              updatedAt: new Date(),
            },
            { transaction: t },
          );
        }

        await t.commit();
        return {
          success: true,
          statusCode: 200,
          message: "Opportunity marked as lost and closed.",
          data: {},
        };
      }

      // ── Won Outcome ─────────────────────────────────────────────────────────
      if (out_come === "won") {
        // Check if job already exists
        const jobCheck = await Job.findOne({
          where: { opportunity_id: opportunityId },
          transaction: t,
        });

        if (jobCheck) {
          await t.rollback();
          return { success: false, statusCode: 400, message: "A job already exists for this opportunity." };
        }

        if (!quotation_version_id) {
          await t.rollback();
          return { success: false, statusCode: 400, message: "Quotation version ID is required when status is WON" };
        }

        // Check if quotation version is approved
        const qvCheck = await QuotationVersion.findOne({
          where: {
            quotation_version_id,
            is_approve: true,
          },
          transaction: t,
        });

        if (!qvCheck) {
          await t.rollback();
          return { success: false, statusCode: 404, message: "Quotation version not found or not approved" };
        }

        // Close opportunity
        await opportunity.update(
          {
            status: "Close",
            out_come: "won",
            updatedAt: new Date(),
          },
          { transaction: t },
        );

        // Resolve the homebuyer Contact for RBAC Phase-4 row scoping (JOB_ONLY).
        // The lead's first-mapped contact becomes the job's customer_contact_id
        // so a Contact-role user can later see only their own job.
        let customerContactId = null;
        const { LeadsContactMap } = db.sequelize.models;
        if (opportunity.lead?.leads_id && LeadsContactMap) {
          const primaryContact = await LeadsContactMap.findOne({
            where: { leads_id: opportunity.lead.leads_id },
            order: [["created_at", "ASC"]],
            transaction: t,
          });
          customerContactId = primaryContact?.contact_id || null;
        }

        // Create new Job
        const newJob = await Job.create(
          {
            reference_number: opportunity.lead?.reference_number,
            opportunity_id: opportunityId,
            quotation_version_id,
            job_note: job_note || null,
            send_email: send_email || false,
            status: "In Progress",
            builder_id: opportunity.lead?.builder_id,
            company_id: opportunity.lead?.company_id,
            customer_contact_id: customerContactId,
          },
          { transaction: t },
        );

        // Eagerly clone the workflow templates (preconstruction etc.) into this
        // job's instance tables so its sub-stages/tasks exist immediately at
        // creation — instead of waiting for the status page to lazily trigger
        // the clone. Atomic with job creation (shares the transaction).
        await initializeJobWorkflow(
          newJob.job_id,
          newJob.builder_id,
          newJob.company_id,
          t,
        );

        // Seed the job's Action timeline with a "new lead" initial note, scoped
        // to the job (job_id) and timestamped at conversion (now) — NOT the
        // lead's original create time. Everything else on the job starts empty.
        if (opportunity.lead?.leads_id) {
          await Notes.create(
            {
              leads_id: opportunity.lead.leads_id,
              job_id: newJob.job_id,
              description: "new lead",
              note_tag_id: [],
              send_to_customer: false,
              create_follow_up_task: false,
              note_type: "send",
            },
            { transaction: t },
          );
        }

        if (opportunity.lead?.leads_id) {
          await logActivity(t, {
            userId: user?.users_id,
            builderId: opportunity.lead.builder_id,
            companyId: opportunity.lead.company_id,
            referenceId: opportunity.lead.leads_id,
            referenceType: "LEAD",
            module: "Opportunity",
            moduleId: opportunity.opportunity_id,
            recordName: opportunity.lead.reference_number || "Opportunity",
            action: "UPDATE",
            fieldName: "out_come",
            oldValue: "open",
            newValue: "won",
            description: "Opportunity won and converted to Job",
          });
        }

        await t.commit();

        // Log job creation (outside transaction — non-fatal if it fails)
        await logJobActivity(null, {
          userId: user?.users_id || user?.user_id || null,
          jobId: newJob.job_id,
          module: "Job",
          moduleId: newJob.job_id,
          recordName: newJob.reference_number,
          action: "CREATE",
          description: "Job created",
        });

        return {
          success: true,
          statusCode: 200,
          message: "Opportunity converted to job successfully.",
          data: keysToCamelCase(newJob.get({ plain: true })),
        };
      }

      await t.rollback();
      return { success: false, statusCode: 400, message: "Invalid out_come value. Must be 'won' or 'lost'." };

    } catch (error) {
      if (t) {
        await t.rollback();
      }
      console.error("JobService.convertOpportunityToJob error:", error);
      throw error;
    }
  }

  async updateJobStatus(jobId, status, user, extra = {}) {
    const { Job } = db.sequelize.models;
    // Tenant context recorded on the activity log entries below.
    const builderId = user?.builder_id;
    const companyId = user?.company_id;

    const tenantScope = this._buildTenantScope(user);

    try {
      const job = await Job.findOne({
        where: {
          job_id: jobId,
          ...tenantScope,
        },
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
      }

      const oldStatus = job.status;

      // Maintenance is created below whenever a job moves to "Handover
      // Completed". That transition must be earned by the emailed completion
      // approval actually being ACCEPTED — otherwise the maintenance record
      // would be created "directly" from a status change, bypassing the
      // approver. The frontend already hides Complete Job until acceptance;
      // this enforces the same rule server-side so a direct API call (or a
      // reverted job whose approval was reset) can't skip it.
      if (
        status === JOB_STATUS_HANDOVER_COMPLETED &&
        oldStatus !== JOB_STATUS_HANDOVER_COMPLETED &&
        job.completion_approval_status !== "ACCEPTED"
      ) {
        return {
          success: false,
          statusCode: 409,
          message:
            "The completion approval must be accepted before this job can be marked Handover Completed",
        };
      }

      // A job cannot be handed over with workflow still outstanding. Reuse the
      // automation module's definition of a finished stage — every synced
      // sub-stage completed or explicitly skipped — so this gate and
      // auto_move_to_maintenance can never disagree about what "done" means.
      // Sub-stage completion is itself derived from its tasks, so this
      // transitively requires every task in the job's workflow to be closed.
      if (
        status === JOB_STATUS_HANDOVER_COMPLETED &&
        oldStatus !== JOB_STATUS_HANDOVER_COMPLETED
      ) {
        const stages = await getJobStageProgress(jobId);
        const openStages = stages.filter((s) => !s.isComplete);

        // A job with no active workflow stages has nothing to finish — don't
        // block it, or jobs that never had a workflow synced become
        // un-completable.
        if (stages.length && openStages.length) {
          const names = openStages.map((s) => s.stageName).filter(Boolean).join(", ");
          return {
            success: false,
            statusCode: 409,
            message: names
              ? `All workflow stages must be completed before this job can be marked Handover Completed. Still outstanding: ${names}`
              : "All workflow stages must be completed before this job can be marked Handover Completed",
            data: {
              incompleteStages: openStages.map((s) => ({
                stageId: s.stageId,
                stageName: s.stageName,
                total: s.total,
                closed: s.closed,
              })),
            },
          };
        }
      }

      // Stamp the lifecycle dates the Job Settings automations key off. Set on
      // the way in, cleared on the way out, so a job that is un-completed does
      // not keep an auto-archive countdown running against a stale date.
      const statusDates = {};
      if (status === JOB_STATUS_COMPLETED) {
        statusDates.completed_at = job.completed_at || new Date();
      } else if (oldStatus === JOB_STATUS_COMPLETED) {
        statusDates.completed_at = null;
      }
      if (status === JOB_STATUS_ARCHIVED) {
        statusDates.archived_at = job.archived_at || new Date();
      } else if (oldStatus === JOB_STATUS_ARCHIVED) {
        statusDates.archived_at = null;
      }

      await job.update({ status, ...statusDates });

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        module: "Job",
        moduleId: jobId,
        recordName: job.reference_number,
        action: "UPDATE",
        fieldName: "status",
        oldValue: oldStatus,
        newValue: status,
        description: `Updated status from ${oldStatus} to ${status}`,
      });
      if (job.opportunity?.lead?.leads_id) {
        await logActivity(null, {
          builderId,
          companyId,
          referenceId: job.opportunity.lead.leads_id,
          referenceType: "LEAD",
          module: "Job",
          moduleId: job.job_id,
          recordName: job.reference_number || "Job",
          action: "UPDATE",
          fieldName: "status",
          oldValue: oldStatus,
          newValue: status,
          description: `Updated Job status from ${oldStatus} to ${status}`,
        });
      }

      let maintenanceId = null;
      if (status === JOB_STATUS_HANDOVER_COMPLETED) {
        const maintenanceResult = await maintenanceService.ensureMaintenanceForJob(
          jobId,
          {
            builderId: job.builder_id,
            companyId: job.company_id,
            supervisorId: job.supervisor_id,
            customerContactId: job.customer_contact_id,
            pciDate: extra.pciDate,
            occupancyPermitDate: extra.occupancyPermitDate,
            handoverDate: extra.handoverDate,
          },
          user,
        );
        maintenanceId = maintenanceResult?.data?.maintenanceId || null;
      }
      return {
        success: true,
        statusCode: 200,
        data: { ...keysToCamelCase(job.get({ plain: true })), maintenanceId },
        message: "Job status updated",
      };
    } catch (error) {
      console.error("JobService.updateJobStatus error:", error);
      throw error;
    }
  }

  async updatePreconstClose(jobId, closedAt, user) {
    const { Job } = db.sequelize.models;
    const tenantScope = this._buildTenantScope(user);

    try {
      const job = await Job.findOne({ where: { job_id: jobId, ...tenantScope } });
      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
      }

      await job.update({ preconstruction_closed_at: closedAt || null });

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId,
        module: "Job",
        moduleId: jobId,
        recordName: job.reference_number,
        action: "UPDATE",
        fieldName: "preconstruction_closed_at",
        oldValue: job.preconstruction_closed_at,
        newValue: closedAt || null,
        description: closedAt
          ? `Preconstruction closed on ${closedAt}`
          : "Preconstruction reopened",
      });

      return {
        success: true,
        data: keysToCamelCase(job.get({ plain: true })),
        message: closedAt ? "Preconstruction marked as closed" : "Preconstruction reopened",
      };
    } catch (error) {
      console.error("JobService.updatePreconstClose error:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Assign / reassign the builder that owns the job. The picker lists users
  //  whose role is "Builder". job.builder_id has a FK to the builder table, so we
  //  find-or-create a builder record representing the selected user and store
  //  that builder_id — the record is named after the user, so the header shows
  //  the user's name.
  // ──────────────────────────────────────────────────────────────────────────
  async assignJobBuilder(jobId, selectedUserId, user) {
    const { Job, Builder, Users } = db.sequelize.models;
    const tenantScope = this._buildTenantScope(user);

    return await db.sequelize.transaction(async (t) => {
      try {
        const job = await Job.findOne({ where: { job_id: jobId, ...tenantScope }, transaction: t });

        if (!job) {
          return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
        }

        const selectedUser = await Users.findOne({
          where: { users_id: selectedUserId, is_deleted: false },
          attributes: ["users_id", "name", "email", "phone"],
          transaction: t,
        });

        if (!selectedUser) {
          return { success: false, statusCode: 404, message: "Selected builder not found" };
        }

        // Find (or create) the builder-table record that represents this user,
        // scoped to the job's company. job.builder_id must reference this table.
        let builderRecord = await Builder.findOne({
          where: { name: selectedUser.name, company_id: job.company_id || null },
          transaction: t,
        });

        if (!builderRecord) {
          builderRecord = await Builder.create({
            name: selectedUser.name,
            email: selectedUser.email || null,
            phone_number: selectedUser.phone || null,
            company_id: job.company_id || null,
          }, { transaction: t });
        }

        if (job.builder_id === builderRecord.builder_id) {
          return { success: false, statusCode: 400, message: "Job is already assigned to this builder" };
        }

        const oldBuilderId = job.builder_id;

        await job.update({ builder_id: builderRecord.builder_id }, { transaction: t });

        await logJobActivity(null, {
          userId: user?.users_id || user?.user_id || null,
          jobId,
          module: "Job",
          moduleId: jobId,
          recordName: job.reference_number,
          action: "UPDATE",
          fieldName: "builder_id",
          oldValue: oldBuilderId,
          newValue: selectedUser.name,
          description: `Assigned builder to ${selectedUser.name}`,
        });

        return {
          success: true,
          data: {
            jobId: job.job_id,
            builderId: builderRecord.builder_id,
            builderName: selectedUser.name,
          },
          message: "Builder assigned successfully",
        };
      } catch (error) {
        console.error("JobService.assignJobBuilder error:", error);
        throw error;
      }
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Colour Selection — persist selected item IDs per job
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Normalise a saved job_color_selection row into the camelCase shape the
   * client reads/writes: { colorItemId, unit, note, pdfHighlight }.
   */
  _toColorSelectionMeta(row) {
    return {
      colorItemId: row.color_item_id,
      unit: row.unit ?? null,
      note: row.note ?? null,
      pdfHighlight: !!row.pdf_highlight,
    };
  }

  /**
   * The job lookup every colour endpoint gates on.
   *
   * The colour routes deliberately carry no requirePermission — the colour
   * screen is open to every role that can open a job — so the tenant filter was
   * the only thing between a caller and someone else's job. That is fine for
   * staff, who are tenant-wide by design, but not for a Contact: a homebuyer
   * could read, overwrite and approve the colour selections of every other
   * customer in the same builder just by changing the id in the URL. Latent
   * while contacts had no UI; live the moment the customer portal points here.
   *
   * Pinned by hand rather than via applyRowScope: that helper resolves a Sales
   * Executive to `assigned_to`, which is not a column on job, so calling it on
   * a route with no permission gate would turn a would-be denial into a SQL
   * error.
   *
   * @param {string[]|null} attributes null to load the full row (callers that update it).
   */
  async _findJobForColorAccess(jobId, user, attributes = ["job_id"]) {
    const { Job } = db.sequelize.models;

    // A Contact is resolved by the very predicate their own tracker uses, so the
    // two never drift: ownership through customer_contact_id, with the tenant as
    // an OR over builder/company. _buildTenantScope ANDs builder_id instead,
    // which drops a job whose builder is not the one its people sit under — a
    // company that added a second builder after sign-up has exactly that — so
    // the customer could read their colours through the tracker and then got a
    // 404 the moment they pressed Send. Ownership is what contains them here;
    // the tenant clause only stops a job in another tenant sharing their id.
    const where = user?.role_name === ROLES.CONTACT
      // No resolvable id matches nothing, rather than falling back to
      // tenant-wide access.
      ? (this._buildContactJobScope(user) || { customer_contact_id: null })
      : { ...this._buildTenantScope(user) };

    if (jobId) {
      // AND-ed rather than assigned to [Op.or]: the contact predicate already
      // carries an Op.or for the tenant, and overwriting it would drop it.
      const existing = where[Op.and];
      const carried = Array.isArray(existing) ? existing : [existing].filter(Boolean);
      where[Op.and] = [
        ...carried,
        { [Op.or]: [{ tracking_token: jobId }, { job_id: jobId }] },
      ];
    }

    let selectAttributes = attributes;
    if (selectAttributes && Array.isArray(selectAttributes)) {
      selectAttributes = [...new Set([...selectAttributes, "job_id", "tracking_token"])];
    }

    return Job.findOne(selectAttributes ? { where, attributes: selectAttributes } : { where });
  }

  async getColorSelections(jobId, user) {
    const { JobColorSelection, JobColorItem, ColorItem } = db.sequelize.models;
    const job = await this._findJobForColorAccess(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const rows = await JobColorSelection.findAll({
      where: { job_id: jobId },
      attributes: ["color_item_id", "unit", "note", "pdf_highlight"],
      raw: true,
    });
    let itemIds = rows.map(r => r.color_item_id);
    // Per-item detail keyed by the id it is currently stored against. The keys
    // are re-pointed below whenever a stale template id gets healed to the
    // job's cloned item, so the unit/note/highlight follow the selection.
    let metaById = {};
    rows.forEach(r => {
      metaById[r.color_item_id] = this._toColorSelectionMeta(r);
    });

    if (itemIds.length > 0) {
      // Find any template items in the selections
      const templateItems = await ColorItem.findAll({
        where: {
          color_item_id: { [Op.in]: itemIds },
          [Op.or]: [{ company_id: user?.company_id }, { builder_id: user?.builder_id }],
        },
        attributes: ["color_item_id", "item_code"],
        raw: true,
      });

      if (templateItems.length > 0) {
        const templateIds = templateItems.map(t => t.color_item_id);
        const itemCodes = templateItems.map(t => t.item_code).filter(Boolean);

        // Find the corresponding JobColorItems for these template item_codes
        const correspondingJobItems = await JobColorItem.findAll({
          where: {
            job_id: jobId,
            item_code: { [Op.in]: itemCodes },
          },
          attributes: ["color_item_id", "item_code"],
          raw: true,
        });

        const codeToJobIdMap = {};
        correspondingJobItems.forEach(j => {
          codeToJobIdMap[j.item_code] = j.color_item_id;
        });

        // Map template IDs to job item IDs, carrying each selection's
        // unit/note/highlight over to the healed id.
        const healedMetaById = {};
        let updatedItemIds = itemIds.map(id => {
          let healedId = id;
          if (templateIds.includes(id)) {
            const template = templateItems.find(t => t.color_item_id === id);
            const jobIdForCode = template ? codeToJobIdMap[template.item_code] : null;
            healedId = jobIdForCode || id; // fallback to original if not found
          }
          const meta = metaById[id];
          if (meta) {
            healedMetaById[healedId] = { ...meta, colorItemId: healedId };
          }
          return healedId;
        });

        // Deduplicate
        updatedItemIds = [...new Set(updatedItemIds)];

        // If selections changed/healed, update the DB
        if (JSON.stringify([...itemIds].sort()) !== JSON.stringify([...updatedItemIds].sort())) {
          await JobColorSelection.destroy({ where: { job_id: jobId } });
          await JobColorSelection.bulkCreate(
            updatedItemIds.map(id => ({
              job_id: jobId,
              color_item_id: id,
              unit: healedMetaById[id]?.unit ?? null,
              note: healedMetaById[id]?.note ?? null,
              pdf_highlight: healedMetaById[id]?.pdfHighlight ?? false,
            })),
          );
          itemIds = updatedItemIds;
          metaById = healedMetaById;
        }
      }
    }

    // Resolve full item details (pricing, name, etc.) so the client can restore
    // the running total and selected-item list on revisit without re-browsing
    // each colour master/category.
    const items = await getColorItemsByIdsService({
      ids: itemIds,
      companyId: user?.company_id,
      builderId: user?.builder_id,
    });

    // Selection detail in save order, plus the same fields folded onto each
    // resolved item so the client can render a row without a second lookup.
    const selections = itemIds.map(id => metaById[id] || {
      colorItemId: id, unit: null, note: null, pdfHighlight: false,
    });
    const itemsWithMeta = (items || []).map(item => {
      const meta = metaById[item.colorItemId];
      return {
        ...item,
        unit: meta?.unit ?? null,
        note: meta?.note ?? null,
        pdfHighlight: meta?.pdfHighlight ?? false,
      };
    });

    return { success: true, data: { itemIds, items: itemsWithMeta, selections } };
  }

  /**
   * Accepted request bodies (keys arrive snake_cased by camelToSnakeMiddleware):
   *   { selections: [{ colorId, unit, note, pdfHighlight }, ...] }   ← preferred
   *   { itemIds: ["…"] }                                             ← legacy
   * Both may be sent together; entries are keyed by colour item id, with the
   * `selections` entry winning. Returns the normalised list, deduplicated.
   */
  _normalizeColorSelectionInput(body) {
    const raw = Array.isArray(body) ? { item_ids: body } : (body || {});

    const ordered = [];
    const byId = new Map();
    const put = (id, meta) => {
      if (!id || typeof id !== "string") {
        return;
      }
      if (!byId.has(id)) {
        ordered.push(id);
      }
      byId.set(id, { ...(byId.get(id) || {}), ...meta });
    };

    (Array.isArray(raw.item_ids) ? raw.item_ids : []).forEach(id => put(id, {}));

    (Array.isArray(raw.selections) ? raw.selections : []).forEach(entry => {
      if (typeof entry === "string") {
        return put(entry, {});
      }
      if (!entry || typeof entry !== "object") {
        return;
      }
      // camelToSnakeMiddleware snake-cases the body before it reaches here, but
      // accept the camelCase spellings too so a direct/internal call behaves.
      const id = entry.color_id || entry.colorId
        || entry.color_item_id || entry.colorItemId
        || entry.item_id || entry.itemId || entry.id;
      const highlight = entry.pdf_highlight !== undefined ? entry.pdf_highlight : entry.pdfHighlight;
      const meta = {};
      // Only carry fields the caller actually sent — anything omitted keeps the
      // value already stored for that item (see the merge in saveColorSelections).
      if (entry.unit !== undefined) {
        meta.unit = entry.unit === null || entry.unit === "" ? null : String(entry.unit);
      }
      if (entry.note !== undefined) {
        meta.note = entry.note === null || entry.note === "" ? null : String(entry.note);
      }
      if (highlight !== undefined) {
        meta.pdfHighlight = highlight === true || highlight === "true";
      }
      put(id, meta);
    });

    return ordered.map(id => ({ colorItemId: id, ...byId.get(id) }));
  }

  async saveColorSelections(jobId, body, user) {
    const { JobColorSelection, JobColorItem, ColorItem } = db.sequelize.models;
    const job = await this._findJobForColorAccess(jobId, user, ["job_id", "is_sample_data"]);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    // A seeded demo job's colour schedule is there to be looked at, not filled
    // in. Checked against the JOB rather than the selection rows: saving picks
    // is `destroy` + `bulkCreate` on job_color_selection, and the model-level
    // guard only sees the rows that already exist — a demo job the importer
    // brought across with no picks took new ones happily, stored them unflagged,
    // and the colour screen then showed real selections on demo content that the
    // next purge would sweep out from under them. A job that DID have seeded
    // picks refused instead, but named `job color selection record`, which reads
    // as a bug to someone who only pressed Add. Same refusal either way now, and
    // it names the job.
    if (job.is_sample_data === true) {
      throw sampleDataReadOnlyError("job", "added to");
    }

    const incoming = this._normalizeColorSelectionInput(body);
    // Meta is merged per id: a field the caller omitted keeps whatever is stored
    // today, so the colour screen's id-only auto-save can't wipe a saved note.
    const existingRows = await JobColorSelection.findAll({
      where: { job_id: jobId },
      attributes: ["color_item_id", "unit", "note", "pdf_highlight"],
      raw: true,
    });
    const existingMetaById = {};
    existingRows.forEach(r => {
      existingMetaById[r.color_item_id] = this._toColorSelectionMeta(r);
    });

    let cleanedIds = incoming.map(s => s.colorItemId);
    const metaById = {};
    incoming.forEach(s => {
      metaById[s.colorItemId] = s;
    });

    if (cleanedIds.length > 0) {
      // Find any template items
      const templateItems = await ColorItem.findAll({
        where: {
          color_item_id: { [Op.in]: cleanedIds },
          [Op.or]: [{ company_id: user?.company_id }, { builder_id: user?.builder_id }],
        },
        attributes: ["color_item_id", "item_code"],
        raw: true,
      });

      if (templateItems.length > 0) {
        const templateIds = templateItems.map(t => t.color_item_id);
        const itemCodes = templateItems.map(t => t.item_code).filter(Boolean);

        const correspondingJobItems = await JobColorItem.findAll({
          where: {
            job_id: jobId,
            item_code: { [Op.in]: itemCodes },
          },
          attributes: ["color_item_id", "item_code"],
          raw: true,
        });

        const codeToJobIdMap = {};
        correspondingJobItems.forEach(j => {
          codeToJobIdMap[j.item_code] = j.color_item_id;
        });

        cleanedIds = cleanedIds.map(id => {
          let healedId = id;
          if (templateIds.includes(id)) {
            const template = templateItems.find(t => t.color_item_id === id);
            const jobIdForCode = template ? codeToJobIdMap[template.item_code] : null;
            healedId = jobIdForCode || id;
          }
          // Move this entry's meta (and any meta already stored against the
          // template id) onto the job-scoped id it resolved to.
          if (healedId !== id) {
            if (metaById[id]) {
              metaById[healedId] = { ...metaById[healedId], ...metaById[id], colorItemId: healedId };
            }
            if (existingMetaById[id] && !existingMetaById[healedId]) {
              existingMetaById[healedId] = { ...existingMetaById[id], colorItemId: healedId };
            }
          }
          return healedId;
        });

        cleanedIds = [...new Set(cleanedIds)];
      }
    }

    // Final per-item values: caller-supplied field → previously stored value → default.
    const resolveMeta = (id) => {
      const sent = metaById[id] || {};
      const stored = existingMetaById[id] || {};
      return {
        colorItemId: id,
        unit: sent.unit !== undefined ? sent.unit : (stored.unit ?? null),
        note: sent.note !== undefined ? sent.note : (stored.note ?? null),
        pdfHighlight: sent.pdfHighlight !== undefined ? sent.pdfHighlight : (stored.pdfHighlight ?? false),
      };
    };
    const selections = cleanedIds.map(resolveMeta);

    // Validate units value if mandatory
    if (selections.length > 0) {
      const [jobColorItems, colorItems] = await Promise.all([
        JobColorItem.findAll({
          where: { color_item_id: { [Op.in]: cleanedIds }, job_id: jobId },
          attributes: ["color_item_id", "units", "item_name"],
          raw: true,
        }),
        ColorItem.findAll({
          where: { color_item_id: { [Op.in]: cleanedIds } },
          attributes: ["color_item_id", "units", "item_name"],
          raw: true,
        }),
      ]);

      const itemDetailsMap = {};
      jobColorItems.forEach(item => {
        itemDetailsMap[item.color_item_id] = item;
      });
      colorItems.forEach(item => {
        if (!itemDetailsMap[item.color_item_id]) {
          itemDetailsMap[item.color_item_id] = item;
        }
      });

      for (const sel of selections) {
        const details = itemDetailsMap[sel.colorItemId];
        if (details && details.units === "mandatory") {
          const u = sel.unit;
          if (u === undefined || u === null || String(u).trim() === "") {
            return {
              success: false,
              statusCode: 400,
              message: `Unit is mandatory for item: ${details.item_name || "selected item"}`,
            };
          }
          const numericUnit = Number(u);
          if (isNaN(numericUnit) || numericUnit <= 0) {
            return {
              success: false,
              statusCode: 400,
              message: `Unit must be a positive number for item: ${details.item_name || "selected item"}`,
            };
          }
          if (numericUnit > 9999) {
            return {
              success: false,
              statusCode: 400,
              message: `Unit cannot exceed 9999 for item: ${details.item_name || "selected item"}`,
            };
          }
        }
      }
    }

    await JobColorSelection.destroy({ where: { job_id: jobId } });
    if (selections.length > 0) {
      await JobColorSelection.bulkCreate(
        selections.map(s => ({
          job_id: jobId,
          color_item_id: s.colorItemId,
          unit: s.unit,
          note: s.note,
          pdf_highlight: s.pdfHighlight,
        })),
      );
    }

    // Keep the stored colour-selection report (drive_files) in sync with the new
    // selections. Fire-and-forget so the frequent auto-save stays fast.
    this.refreshColorReport(jobId, user);

    return {
      success: true,
      data: { itemIds: cleanedIds, selections },
      message: "Colour selections saved",
    };
  }

  async approveColorSelection(jobId, approved, user) {
    // Approving is the consultant's call, not the customer's. The colour routes
    // carry no requirePermission, so without this a Contact could PATCH their
    // own job's approval directly and freeze the schedule themselves — the one
    // thing the submit-for-approval flow exists to prevent. Their write path is
    // PUT /job/my/tracking/:job_id/colours, which saves but never approves.
    if (user?.role_name === ROLES.CONTACT) {
      return {
        success: false,
        statusCode: 403,
        message: "Colour selections are confirmed by your consultant.",
      };
    }

    const job = await this._findJobForColorAccess(jobId, user, null);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const today = new Date().toISOString().slice(0, 10);
    const newValue = approved ? today : null;
    await job.update({ color_approved_at: newValue });

    await logJobActivity(null, {
      userId: user?.users_id || user?.user_id || null,
      jobId,
      module: "Job",
      moduleId: jobId,
      recordName: job.reference_number,
      action: "UPDATE",
      fieldName: "color_approved_at",
      oldValue: job.color_approved_at,
      newValue,
      description: approved ? `Colour selection approved on ${today}` : "Colour selection approval revoked",
    });

    return {
      success: true,
      data: { colorApprovedAt: newValue },
      message: approved ? "Colour selection approved" : "Colour approval revoked",
    };
  }

  async resetJobColors(jobId, user) {
    const {
      JobColorSelection,
    } = db.sequelize.models;

    // Destructive — it clears the selections and rebuilds the job's colour
    // tables from the tenant template. A consultant's tool, not a customer's,
    // and this route has no permission gate of its own.
    if (user?.role_name === ROLES.CONTACT) {
      return {
        success: false,
        statusCode: 403,
        message: "Contact your consultant to reset your colour selections.",
      };
    }

    const job = await this._findJobForColorAccess(jobId, user, null);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const transaction = await db.sequelize.transaction();
    try {
      // 1. Delete selections (unselect all items)
      await JobColorSelection.destroy({ where: { job_id: jobId }, transaction });

      // 2. Revert job approval date
      await job.update({ color_approved_at: null }, { transaction });

      await transaction.commit();

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId,
        module: "Job",
        moduleId: jobId,
        recordName: job.reference_number,
        action: "DELETE",
        fieldName: "job_colors_selections",
        oldValue: "selected",
        newValue: "cleared",
        description: "All job color selections cleared (unselected)",
      });

      // Selections are gone — drop the stored colour report too (fire-and-forget).
      this.refreshColorReport(jobId, user);

      return {
        success: true,
        data: { colorApprovedAt: null },
        message: "Job color selections cleared successfully",
      };
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Colour Selection Report — stored PDF in drive_files, kept in sync with the
  //  job's colour selections (mirrors the QuotationVersion report pattern).
  // ──────────────────────────────────────────────────────────────────────────

  // Load a job with just the relations needed to build the PDF header (customer
  // name / address / reference) plus tenant ids for the DriveFile row.
  async _fetchJobForColorReport(jobId) {
    const { Job, Opportunity, Leads, PropertyDetail, State } = db.sequelize.models;
    const job = await Job.findByPk(jobId, {
      attributes: ["job_id", "reference_number", "company_id", "builder_id"],
      include: [
        {
          model: Opportunity,
          as: "opportunity",
          attributes: ["opportunity_id"],
          required: false,
          include: [
            {
              model: Leads,
              as: "lead",
              attributes: ["leads_id", "name", "email", "phone"],
              required: false,
              include: [
                {
                  model: PropertyDetail,
                  as: "propertyDetail",
                  required: false,
                  include: [{ model: State, as: "state", required: false }],
                },
              ],
            },
          ],
        },
      ],
    });
    if (!job) {
      return null;
    }

    const plain = job.get({ plain: true });
    const lead = plain.opportunity?.lead;
    const pd = lead?.propertyDetail;
    const st = pd?.state;
    const addressParts = [
      pd?.lot_number, pd?.street, pd?.address_line1, pd?.address_line2, pd?.city, st?.name, pd?.zip_code,
    ].map(s => s?.trim?.()).filter(Boolean);

    return {
      jobId: plain.job_id,
      companyId: plain.company_id,
      builderId: plain.builder_id,
      leadId: lead?.leads_id ?? null,
      jobInfo: {
        jobAddress: addressParts.length > 0 ? addressParts.join(", ") : "",
        customerName: lead?.name ?? "",
        customerEmail: lead?.email ?? "",
        customerPhone: lead?.phone ?? "",
        referenceNumber: plain.reference_number ?? "",
      },
    };
  }

  /**
   * Regenerate the job's colour-selection PDF from its current selections, store
   * it in S3 + drive_files, and point job.color_report at the file. When there
   * are no selections the stored report is removed. Safe to call repeatedly —
   * upsertJobColorDriveFile overwrites the existing active row.
   *
   * Returns { fileId, url } (url is a presigned download link), or { fileId:
   * null } when nothing is stored.
   */
  async generateAndStoreColorReport(jobId, user) {
    const { JobColorSelection } = db.sequelize.models;

    const ctx = await this._fetchJobForColorReport(jobId);
    if (!ctx) {
      return { success: false, statusCode: 404, message: "Job not found" };
    }

    const rows = await JobColorSelection.findAll({
      where: { job_id: jobId },
      attributes: ["color_item_id", "unit"],
      raw: true,
    });
    const itemIds = rows.map(r => r.color_item_id);
    const unitByItemId = {};
    rows.forEach(r => {
      unitByItemId[r.color_item_id] = r.unit;
    });

    // No selections — drop any previously stored report so the pointer is honest.
    if (itemIds.length === 0) {
      await deleteJobColorDriveFile(jobId);
      return { success: true, data: { fileId: null, url: null } };
    }

    // Total the upgrade costs the same way the colour screen does.
    const items = await getColorItemsByIdsService({
      ids: itemIds,
      companyId: ctx.companyId,
      builderId: ctx.builderId,
    });
    const computedTotal = (items || []).reduce((sum, it) => {
      const itemId = it.colorItemId || it.color_item_id;
      const cost = it.cost ?? it.color_item?.cost;
      const costType = it.costType ?? it.cost_type;
      if (costType === "upgrade" && cost != null) {
        const u = unitByItemId[itemId];
        const qty = u ? parseFloat(u) : 1;
        const itemCost = Number(cost);
        return sum + (isNaN(qty) ? itemCost : itemCost * qty);
      }
      return sum;
    }, 0);
    const totalAmount = `$${computedTotal.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    const pdfBuffer = await generateColorPdfService({
      itemIds,
      jobInfo: { ...ctx.jobInfo, totalAmount, jobId },
      builderId: ctx.builderId,
      companyId: ctx.companyId,
      showImage: true,
      showPrice: true,
    });

    // Stable key per job: overwrite the same S3 object on every regeneration so
    // there is exactly one stored file that updates in place (the drive_files
    // row is likewise upserted, not duplicated). No orphaned objects accumulate.
    const s3Key = `colour-selection-reports/job_${jobId}.pdf`;
    const uploadResult = await uploadFile(s3Key, pdfBuffer, "application/pdf");
    if (!uploadResult?.success) {
      return { success: false, statusCode: 500, message: "Failed to upload colour report PDF" };
    }

    const driveFile = await upsertJobColorDriveFile({
      jobId,
      s3Key,
      size: pdfBuffer.length,
      originalName: `Colour_Selection_${ctx.jobInfo.referenceNumber || jobId}.pdf`,
      companyId: ctx.companyId,
      builderId: ctx.builderId,
      leadId: ctx.leadId,
      uploadedBy: user?.users_id || user?.user_id || null,
    });

    const url = await getJobColorDriveFilePresignedUrl(jobId, { expiresIn: 3600 });
    return { success: true, data: { fileId: driveFile?.file_id ?? null, url } };
  }

  // Fire-and-forget regeneration used after a selection change. Never rejects —
  // the colour auto-save must not fail because a background PDF refresh did.
  refreshColorReport(jobId, user) {
    this.generateAndStoreColorReport(jobId, user).catch((err) => {
      console.error(`[ColorReport] refresh failed for job ${jobId}:`, err?.message || err);
    });
  }

  /**
   * Return a presigned URL for the job's stored colour-selection report. If no
   * report exists yet (e.g. selections predate this feature), generate it on the
   * fly so the preview always resolves.
   */
  async getColorReport(jobId, user) {
    const job = await this._findJobForColorAccess(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }
    const resolvedJobId = job.job_id;

    let url = await getJobColorDriveFilePresignedUrl(resolvedJobId, { expiresIn: 3600 });
    if (!url) {
      const generated = await this.generateAndStoreColorReport(resolvedJobId, user);
      if (!generated.success) {
        return generated;
      }
      url = generated.data?.url ?? null;
    }
    return { success: true, data: { url }, message: "Colour report fetched" };
  }

  /**
   * All colour items for a job (job-scoped job_color_item rows), document-ready
   * for the "Generate Colors Document" page. Verifies the job belongs to the
   * caller before returning.
   */
  async getColorDocumentItems(jobId, user) {
    const job = await this._findJobForColorAccess(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }
    const resolvedJobId = job.job_id;

    // Job header/customer detail + all colour items, in one call — the document
    // page renders straight from this without needing the job loaded elsewhere.
    const ctx = await this._fetchJobForColorReport(resolvedJobId);
    const items = await getJobColorDocumentItemsService({
      jobId: resolvedJobId,
      companyId: user?.company_id,
      builderId: user?.builder_id,
    });

    return {
      success: true,
      data: {
        jobDetail: {
          referenceNumber: ctx?.jobInfo?.referenceNumber || "",
          customerName: ctx?.jobInfo?.customerName || "",
          customerPhone: ctx?.jobInfo?.customerPhone || "",
          customerEmail: ctx?.jobInfo?.customerEmail || "",
          jobAddress: ctx?.jobInfo?.jobAddress || "",
        },
        items,
      },
      message: "Job colour items fetched",
    };
  }

  /**
   * Generate the "Colour Schedule" document PDF (server-side) from all of the
   * job's colour items, store it in S3 + drive_files, and point job.color_document
   * at the file. Idempotent: re-generating overwrites the same S3 object and the
   * same active drive_files row (stable key + upsert), so it "updates" rather
   * than piling up files. Returns { fileId, url } (presigned).
   */
  async generateAndStoreColorDocument(jobId, user, itemIds) {
    const job = await this._findJobForColorAccess(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }
    const resolvedJobId = job.job_id;

    const ctx = await this._fetchJobForColorReport(resolvedJobId);

    const pdfBuffer = await generateJobColorDocumentPdfService({
      jobId: resolvedJobId,
      jobInfo: ctx?.jobInfo || {},
      companyId: user?.company_id,
      builderId: user?.builder_id,
      itemIds,
    });

    // Stable key per job — overwrite in place so there's one document per job.
    const s3Key = `colour-schedule-documents/job_${resolvedJobId}.pdf`;
    const uploadResult = await uploadFile(s3Key, pdfBuffer, "application/pdf");
    if (!uploadResult?.success) {
      return { success: false, statusCode: 500, message: "Failed to upload colour schedule document" };
    }

    const driveFile = await upsertJobColorDocumentDriveFile({
      jobId: resolvedJobId,
      s3Key,
      size: pdfBuffer.length,
      originalName: `Colour_Schedule_${ctx?.jobInfo?.referenceNumber || resolvedJobId}.pdf`,
      companyId: ctx?.companyId ?? user?.company_id,
      builderId: ctx?.builderId ?? user?.builder_id,
      leadId: ctx?.leadId,
      uploadedBy: user?.users_id || user?.user_id || null,
    });

    const url = await getJobColorDocumentPresignedUrl(resolvedJobId, { expiresIn: 3600 });
    return { success: true, data: { fileId: driveFile?.file_id ?? null, url }, message: "Colour schedule document generated" };
  }

  /**
   * Return a presigned URL for the job's stored Colour Schedule document,
   * generating it on the fly if it doesn't exist yet (GET convenience).
   */
  async getColorDocument(jobId, user) {
    const job = await this._findJobForColorAccess(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }
    const resolvedJobId = job.job_id;

    let url = await getJobColorDocumentPresignedUrl(resolvedJobId, { expiresIn: 3600 });
    if (!url) {
      const generated = await this.generateAndStoreColorDocument(resolvedJobId, user, []);
      if (!generated.success) {
        return generated;
      }
      url = generated.data?.url ?? null;
    }
    return { success: true, data: { url }, message: "Colour schedule document fetched" };
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Activity Log — paginated audit trail for a single job
  // ──────────────────────────────────────────────────────────────────────────
  /**
   * Job Documents tree — a read-only aggregation that mirrors the Lead Documents
   * endpoint (leads.service.getLeadDocuments) but scoped to a job. It collects the
   * active drive_files attached to the job (its auto-saved colour PDFs, tagged
   * reference_type 'Job'), plus the documents of the job's approved quotation
   * version and its property, and folds them into the same virtual "Documents"
   * folder tree the FileExplorer renders for leads:
   *
   *   Documents
   *   ├─ Colour Selection Reports   (ColorSelectionReport)
   *   ├─ Colour Schedule Documents  (ColorScheduleDocument)
   *   ├─ Compaction Report          (CompactionReport)
   *   └─ Quotation
   *      └─ <QT reference no.>
   *         ├─ Quotation Report      (QuotationReport, SignedQuotationReport)
   *         ├─ Engineering Requirement (EngineeringRequirement, StructureEngineer*)
   *         ├─ Floor Plan            (FloorPlanSimpleImage, FloorPlanDetailedImage)
   *         └─ Facade                (FacadeImage)
   */
  /**
   * Steps 1–3 of getJobDocuments: the job (scoped to the caller), its
   * quotation/variation/invoice lookups, and every active DriveFile attached to
   * it.
   *
   * Shared with the document name sync (drive-name-sync.service) so "Sync Names"
   * renames exactly the set of files the Documents tab shows. Mirrors
   * leadsService.collectLeadDriveFiles.
   *
   * @returns {Promise<null|object>} null when the job does not exist or is out
   *          of the caller's scope.
   */
  async collectJobDriveFiles(jobId, user) {
    // Same role-based rule as every other job read — OR-ing builder_id with
    // company_id let a Builder enumerate (and "Sync Names" over) the files of
    // any job in the company, not just their own.
    const tenantScope = this._buildTenantScope(user);

    // 1. Job (scoped to caller) with its lead's property + its quotation version.
    const job = await db.Job.findOne({
      where: {
        job_id: jobId,
        ...tenantScope,
      },
      attributes: ["job_id", "reference_number", "quotation_version_id"],
      include: [
        {
          model: db.Opportunity,
          as: "opportunity",
          attributes: ["opportunity_id"],
          include: [{ model: db.Leads, as: "lead", attributes: ["leads_id", "property_detail_id"] }],
        },
        {
          model: db.QuotationVersion,
          as: "quotationVersion",
          attributes: ["quotation_version_id"],
          include: [{ model: db.Quotation, as: "quotation", attributes: ["quotation_id", "reference_number"] }],
        },
      ],
    });

    if (!job) {
      return null;
    }

    // 2. Collect every reference id + a version -> quotation lookup so version
    //    scoped files group under their parent quotation folder. A job has a
    //    single approved quotation version.
    const propertyDetailId = job.opportunity?.lead?.property_detail_id || null;
    const version = job.quotationVersion || null;
    const versionToQuotation = new Map();
    const quotations = [];
    if (version?.quotation) {
      versionToQuotation.set(version.quotation_version_id, version.quotation.quotation_id);
      quotations.push({
        quotation_id: version.quotation.quotation_id,
        reference_number: version.quotation.reference_number,
      });
    }

    // The job's variations — their signed documents and invoice PDFs are drive
    // files keyed by variation_id (reference_type JobVariationSignedDocument /
    // JobVariationInvoiceDocument), surfaced below under a "Variations" folder.
    const variations = await db.JobVariation.findAll({
      where: { job_id: jobId },
      attributes: ["variation_id", "reference_id"],
      order: [["created_at", "ASC"]],
    });
    const variationIds = variations.map((v) => v.variation_id);

    // The job's stage-payment invoices — their invoice + receipt PDFs are drive
    // files keyed by job_invoice_id (reference_type JobInvoiceDocument /
    // JobInvoiceReceiptDocument), surfaced below under "Invoices & Payments".
    const jobInvoices = await db.JobInvoice.findAll({
      where: { job_id: jobId },
      attributes: ["job_invoice_id", "reference_number"],
      order: [["created_at", "ASC"]],
    });
    const jobInvoiceIds = jobInvoices.map((i) => i.job_invoice_id);

    const referenceIds = [jobId];
    if (propertyDetailId) {
      referenceIds.push(propertyDetailId);
    }
    if (version) {
      referenceIds.push(version.quotation_version_id);
    }
    if (variationIds.length) {
      referenceIds.push(...variationIds);
    }
    if (jobInvoiceIds.length) {
      referenceIds.push(...jobInvoiceIds);
    }

    // 3. Active drive files (paranoid model excludes deleted rows) matching any
    //    collected reference id. The job's colour PDFs carry reference_id = jobId.
    const driveFiles = await db.DriveFile.findAll({
      where: { reference_id: { [Op.in]: referenceIds } },
      include: [{ model: db.Users, as: "uploadedByUser", attributes: ["name"] }],
      order: [["created_at", "ASC"]],
    });

    return { job, quotations, versionToQuotation, variations, variationIds, jobInvoices, jobInvoiceIds, driveFiles };
  }

  async getJobDocuments(jobId, user) {
    try {
      const SUB = DRIVE_FILE_MAPPING.SUB_REFERENCES;

      const collected = await this.collectJobDriveFiles(jobId, user);
      if (!collected) {
        return { success: false, statusCode: 404, message: "Job not found" };
      }

      const {
        job, quotations, versionToQuotation, variations, variationIds,
        jobInvoices, jobInvoiceIds, driveFiles,
      } = collected;

      const companyId = user?.company_id;
      const settings = await db.GeneralSettings.findOne({
        where: { company_id: companyId },
      });
      const editablePdfTypes = settings?.editable_pdf_types || [];
      const blockedTypes = settings?.non_editable_document_types || [];

      // 4. Serialize each file, resolving s3_key into a fully-qualified public S3
      //    URL (the frontend opens file.s3Key directly). Mirrors getLeadDocuments.
      const s3BaseUrl = `https://${env.AWS.S3_BUCKET_NAME}.s3.amazonaws.com`;
      const toPublicUrl = (key) => {
        if (!key) {
          return key;
        }
        if (/^https?:\/\//i.test(key)) {
          return key;
        }
        return `${s3BaseUrl}/${key.replace(/^\/+/, "")}`;
      };
      // A job is only created from an APPROVED quotation version, so every file
      // keyed to that version — and the folders holding them — carry the same
      // approved marker the Lead Documents tree shows. Without this the identical
      // quotation reads "Approved" under a lead but not under its job.
      const files = driveFiles.map((f) => {
        const plain = f.get({ plain: true });
        const url = toPublicUrl(plain.s3_key);
        const isApproved = Boolean(
          versionToQuotation.has(plain.reference_id) ||
          plain.sub_reference_type === SUB.SIGNED_QUOTATION_REPORT,
        );
        return {
          ...keysToCamelCase(plain),
          s3Key: url,
          url,
          isApproved,
          uploadedByName: plain.uploadedByUser?.name || null,
          uploaded_by_name: plain.uploadedByUser?.name || null,
          is_approve: isApproved,
          isEditable: isPdfEditable(plain, editablePdfTypes, blockedTypes),
          is_editable: isPdfEditable(plain, editablePdfTypes, blockedTypes),
          // Whether this document may be edited at all — the Admin → Document
          // Management switch. Distinct from `is_editable` above, which only says whether a
          // generated PDF offers the edit-the-record form.
          editing_allowed: isDocumentEditingAllowed(plain, blockedTypes),
          editingAllowed: isDocumentEditingAllowed(plain, blockedTypes),
          pdfType: getPdfTypeTag(plain),
          pdf_type: getPdfTypeTag(plain),
          // Whether Move applies to this document. Only one a person uploaded
          // travels between folders — a generated report is filed here by its
          // type, not by its folder, so moving it would mean nothing. Same test
          // moveFileService applies; the tab reads it to shape the row menu.
          canMove: documentTypeOf(plain.reference_type, plain.sub_reference_type) === "upload",
        };
      });

      // User-created folders for this job (real Drive rows scoped via
      // reference_id/reference_type). Files uploaded into them carry the
      // folder_id, so they attach to their folder below instead of a bucket.
      const jobFolders = await db.Drive.findAll({
        where: { reference_id: jobId, reference_type: "Job" },
        attributes: ["drive_id", "name", "parent_id", "created_at", "created_by"],
        // The creator's name is shown as the folder's Owner (system buckets
        // stay "System", which subfolders otherwise inherit from the root).
        include: [{ model: db.Users, as: "createdByUser", attributes: ["users_id", "name"] }],
        order: [["created_at", "ASC"]],
      });
      const jobFolderIdSet = new Set(jobFolders.map((f) => f.drive_id));
      const filesByFolder = new Map(); // drive_id -> [file, ...]

      // 5. Bucket files by sub_reference_type (and parent quotation for
      //    version-scoped files).
      const COMPACTION = new Set([SUB.COMPACTION_REPORT]);
      const COLOR_SELECTION = new Set([SUB.COLOR_SELECTION_REPORT]);
      const COLOR_SCHEDULE = new Set([SUB.COLOR_SCHEDULE_DOCUMENT]);
      const QUOTATION_REPORT = new Set([SUB.QUOTATION_REPORT, SUB.SIGNED_QUOTATION_REPORT]);
      const ENGINEERING = new Set([SUB.ENGINEERING_REQUIREMENT, SUB.STRUCTURE_ENGINEER_REPORT, SUB.STRUCTURE_ENGINEER_UPLOAD]);
      const FLOOR_PLAN = new Set([SUB.FLOOR_PLAN_SIMPLE, SUB.FLOOR_PLAN_DETAILED]);
      const FACADE = new Set([SUB.FACADE_IMAGE]);

      const compactionFiles = [];
      const colorSelectionFiles = [];
      const colorScheduleFiles = [];
      const rootFiles = []; // unknown / unmapped types
      const quotationBuckets = new Map();
      const bucketFor = (qid) => {
        if (!quotationBuckets.has(qid)) {
          quotationBuckets.set(qid, { quotationReport: [], engineering: [], floorPlan: [], facade: [] });
        }
        return quotationBuckets.get(qid);
      };
      // Variation-scoped files (invoice / signed doc) group under their variation.
      // Variation and invoice files sit flat in their folder (their own file
      // names — e.g. INV-LD20260001-V6.pdf — already identify them), so the PDFs
      // show on the first click instead of being nested a level deeper.
      const variationIdSet = new Set(variationIds);
      const jobInvoiceIdSet = new Set(jobInvoiceIds);
      const variationFiles = []; // variation invoices + signed documents
      const invoiceFiles = []; // tax invoices + payment receipts

      for (const file of files) {
        const sub = file.subReferenceType;

        // A file living inside one of the job's user folders attaches to that
        // folder — never to a generated bucket or the root.
        if (file.folderId && jobFolderIdSet.has(file.folderId)) {
          if (!filesByFolder.has(file.folderId)) {
            filesByFolder.set(file.folderId, []);
          }
          filesByFolder.get(file.folderId).push(file);
          continue;
        }

        if (COLOR_SELECTION.has(sub)) {
          colorSelectionFiles.push(file); continue;
        }
        if (COLOR_SCHEDULE.has(sub)) {
          colorScheduleFiles.push(file); continue;
        }
        if (COMPACTION.has(sub)) {
          compactionFiles.push(file); continue;
        }

        // Variation invoice / signed document — keyed by variation_id.
        if (variationIdSet.has(file.referenceId)) {
          variationFiles.push(file);
          continue;
        }

        // Job invoice / payment receipt — keyed by job_invoice_id.
        if (jobInvoiceIdSet.has(file.referenceId)) {
          invoiceFiles.push(file);
          continue;
        }

        const quotationId = versionToQuotation.get(file.referenceId);
        if (quotationId) {
          const bucket = bucketFor(quotationId);
          if (QUOTATION_REPORT.has(sub)) {
            bucket.quotationReport.push(file);
          } else if (ENGINEERING.has(sub)) {
            bucket.engineering.push(file);
          } else if (FLOOR_PLAN.has(sub)) {
            bucket.floorPlan.push(file);
          } else if (FACADE.has(sub)) {
            bucket.facade.push(file);
          } else {
            rootFiles.push(file);
          }
          continue;
        }

        rootFiles.push(file);
      }

      // 6. Build folders. count = own files + sum of subfolder counts.
      // Computed "bucket" folders (everything except real user folders) get a
      // STABLE UUID derived from the job + bucket key, and isSystem:true so the
      // frontend treats them as read-only groupings (never a valid parent).
      const vid = (key) => virtualFolderId(jobId, key);
      const makeFolder = (folderId, folderName, folderFiles = [], subFolders = [], isApproved = false) => ({
        folderId,
        folderName,
        count: folderFiles.length + subFolders.reduce((sum, sf) => sum + sf.count, 0),
        files: folderFiles,
        subFolders,
        isApproved,
        is_approve: isApproved,
        isSystem: true,
      });

      // The job's quotation is the approved one by construction (see above), so
      // its folder and every category under it get the approved marker.
      const quotationSubFolders = [];
      for (const q of quotations) {
        const bucket = quotationBuckets.get(q.quotation_id);
        if (!bucket) {
          continue;
        }
        const categories = [];
        if (bucket.quotationReport.length) {
          categories.push(makeFolder(vid(`quotation_report_${q.quotation_id}`), "Quotation Report", bucket.quotationReport, [], true));
        }
        if (bucket.engineering.length) {
          categories.push(makeFolder(vid(`engineering_${q.quotation_id}`), "Engineering Requirement", bucket.engineering, [], true));
        }
        if (bucket.floorPlan.length) {
          categories.push(makeFolder(vid(`floor_plan_${q.quotation_id}`), "Floor Plan", bucket.floorPlan, [], true));
        }
        if (bucket.facade.length) {
          categories.push(makeFolder(vid(`facade_${q.quotation_id}`), "Facade", bucket.facade, [], true));
        }
        if (!categories.length) {
          continue;
        }
        quotationSubFolders.push(makeFolder(vid(`qt_${q.quotation_id}`), q.reference_number || "Quotation", [], categories, true));
      }

      // User-created folders, nested by parent_id, each carrying its own files.
      // These are real drive rows: their folderId is the genuine drive_id UUID
      // and isSystem:false marks them as writable targets.
      const buildUserFolderTree = (parentId) =>
        jobFolders
          .filter((f) => (f.parent_id || null) === parentId)
          .map((f) => ({
            ...makeFolder(
              f.drive_id,
              f.name,
              filesByFolder.get(f.drive_id) || [],
              buildUserFolderTree(f.drive_id),
            ),
            // Overrides the "System" owner inherited from the root folder.
            ownerName: f.createdByUser?.name || "—",
            isSystem: false,
          }));
      const userFolders = buildUserFolderTree(null);

      const rootSubFolders = [
        makeFolder(vid("color_selection_root"), "Colour Selection Reports", colorSelectionFiles),
        makeFolder(vid("color_schedule_root"), "Colour Schedule Documents", colorScheduleFiles),
        makeFolder(vid("compaction_root"), "Compaction Report", compactionFiles),
        makeFolder(vid("quotation_root"), "Quotation", [], quotationSubFolders),
        makeFolder(vid("variations_root"), "Variations", variationFiles),
        makeFolder(vid("invoices_root"), "Invoices & Payments", invoiceFiles),
        // User-created folders appear after the system buckets.
        ...userFolders,
      ];

      const root = {
        folderId: vid("root_documents"),
        folderName: "Documents",
        ownerName: "System",
        isSystem: true,
        count: rootFiles.length + rootSubFolders.reduce((sum, sf) => sum + sf.count, 0),
        files: rootFiles,
        subFolders: rootSubFolders,
      };

      return { success: true, data: [root], message: "Job documents fetched successfully" };
    } catch (error) {
      return { success: false, message: error.message };
    }
  }

  /**
   * Create a user folder inside a job's Documents tree. Folders are real Drive
   * rows scoped to the job (reference_id = job_id, reference_type = "Job") so
   * empty folders persist and never leak into the global Drive.
   *
   * The folder/upload logic is now shared across Job, Lead and SDrive — this
   * thin wrapper preserves the existing /job/:id/documents/folders contract by
   * delegating to the generic documents service (entityType "job").
   */
  async createJobFolder(jobId, { name, parentId } = {}, user) {
    return documentsService.createFolder(
      { entityType: "job", entityId: jobId, name, parentId },
      user,
    );
  }

  /**
   * Upload a file into a job's Documents tree (reference_type = "JobDocument").
   * Backward-compatible wrapper around the shared documents service.
   */
  async uploadJobDocument(jobId, file, { folderId } = {}, user) {
    return documentsService.uploadFile(
      { entityType: "job", entityId: jobId, folderId },
      file,
      user,
    );
  }

  async getJobActivityLog(jobId, user, filters = {}) {
    try {
      const tenantScope = this._buildTenantScope(user);
      const { Job, Opportunity, Leads } = db.sequelize.models;

      // Load the job together with its originating lead so we can merge the
      // lead's CRM activity (activity_logs) into the job timeline.
      const job = await Job.findOne({
        where: { job_id: jobId, ...tenantScope },
        include: [{
          model: Opportunity,
          as: "opportunity",
          attributes: ["opportunity_id"],
          include: [{ model: Leads, as: "lead", attributes: ["leads_id"] }],
        }],
      });
      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or access denied" };
      }

      const leadId = job.opportunity?.lead?.leads_id;
      const { page = 1, limit = 20, module, action, search, all, mode } = filters;
      const effectiveMode = mode || "all";
      // `all=true` returns the full trail with no pagination.
      const fetchAll = all === true || all === "true";
      const offset = (page - 1) * limit;

      const replacements = { jobId };
      if (!fetchAll) {
        replacements.limit = parseInt(limit);
        replacements.offset = parseInt(offset);
      }
      const whereClause = "al.job_id = :jobId";

      // Common projection from each source table. UUIDs cast to text so the
      // UNION types line up and the client just sees strings. The job-log PK is
      // aliased to job_activity_log_id to keep the existing response key.
      const jobSelect = `
        SELECT 'JOB' AS source,
               al.job_activity_log_id::text AS job_activity_log_id,
               al.module, al.module_id::text AS module_id, al.record_name,
               al.action, al.field_name, al.old_value, al.new_value,
               al.description, al.metadata, al.user_id::text AS user_id,
               u.name AS user_name, al.created_at
        FROM job_activity_log al
        LEFT JOIN users u ON al.user_id = u.users_id
        WHERE al.job_id = :jobId`;

      const leadSelect = `
        SELECT 'LEAD' AS source,
               ll.activity_log_id::text AS job_activity_log_id,
               ll.module, ll.module_id::text AS module_id, ll.record_name,
               ll.action, ll.field_name, ll.old_value, ll.new_value,
               ll.description, ll.metadata, ll.user_id::text AS user_id,
               u2.name AS user_name, ll.created_at
        FROM activity_logs ll
        LEFT JOIN users u2 ON ll.user_id = u2.users_id
        WHERE ll.reference_id = :leadId AND ll.reference_type = 'LEAD' AND ll.deleted_at IS NULL`;

      const unionSql = leadId ? `(${jobSelect} UNION ALL ${leadSelect})` : `(${jobSelect})`;
      if (leadId) {
        replacements.leadId = leadId;
      }

      // Compact mode: keep only key milestones. Single source of truth for the
      // whitelist so the filter stays consistent.
      const COMPACT_MILESTONES = `(
        (merged.module = 'Lead' AND merged.action = 'CREATE')
        OR (merged.module = 'Opportunity' AND merged.field_name = 'out_come')
        OR (merged.module = 'Job' AND merged.action = 'CREATE')
        OR (merged.module = 'Job' AND merged.field_name = 'status')
        OR (merged.module = 'Job' AND merged.field_name = 'builder_id')
        OR (merged.module = 'Appointment' AND merged.action = 'CREATE')
        OR (merged.module = 'Quotation' AND merged.action = 'CREATE')
        OR (merged.module = 'Job' AND merged.action = 'EMAIL_SENT')
      )`;

      const outerConditions = [];
      if (effectiveMode === "compact") {
        outerConditions.push(COMPACT_MILESTONES);
      }
      if (module) {
        outerConditions.push("merged.module = :module");
        replacements.module = module;
      }
      if (action) {
        outerConditions.push("merged.action = :action");
        replacements.action = action;
      }
      if (search) {
        outerConditions.push("(merged.user_name ILIKE :search OR merged.description ILIKE :search OR merged.module ILIKE :search OR merged.record_name ILIKE :search OR merged.field_name ILIKE :search OR merged.old_value ILIKE :search OR merged.new_value ILIKE :search)");
        replacements.search = `%${search}%`;
      }
      const outerWhere = outerConditions.length ? `WHERE ${outerConditions.join(" AND ")}` : "";

      const paginationSql = fetchAll ? "" : "LIMIT :limit OFFSET :offset";

      const paginationClause = fetchAll ? "" : " LIMIT :limit OFFSET :offset";
      const [logs, countResult] = await Promise.all([
        db.sequelize.query(
          `SELECT * FROM ${unionSql} merged ${outerWhere} ORDER BY merged.created_at DESC${paginationClause}`,
          { replacements, type: QueryTypes.SELECT },
        ),
        db.sequelize.query(
          `SELECT COUNT(*)::int AS total FROM ${unionSql} merged ${outerWhere}`,
          { replacements, type: QueryTypes.SELECT },
        ),
      ]);

      const total = countResult[0].total;

      const formatValue = (val) => {
        if (val === null || val === undefined || val === "null" || val === "undefined" || val === "") {
          return "None";
        }
        if (typeof val === "string" && (val.trim().startsWith("{") || val.trim().startsWith("["))) {
          try {
            const parsed = JSON.parse(val);
            if (parsed && typeof parsed === "object") {
              return parsed.name || parsed.label || parsed.title || "Data";
            }
          } catch (e) { /* ignore */ }
        }
        return val;
      };

      const activityLogs = keysToCamelCase(logs);
      activityLogs.forEach((log) => {
        // Unified timeline contract shared with the lead activity-log endpoint:
        // every item exposes `id` + `source` so one frontend component renders both.
        // `source` is already 'JOB'/'LEAD' from the UNION.
        log.id = log.jobActivityLogId;
        if (log.userName) {
          log.userName = formatCamelCaseToReadable(log.userName);
        }
        if (log.recordName) {
          log.recordName = formatCamelCaseToReadable(log.recordName);
        }
        if (log.module) {
          log.module = formatCamelCaseToReadable(log.module);
        }

        if (log.action === "UPDATE" && log.fieldName) {
          const readableField = formatCamelCaseToReadable(log.fieldName);
          const oldVal = formatValue(log.oldValue);
          const newVal = formatValue(log.newValue);

          const isUrlOrFileField =
            log.fieldName.toLowerCase().endsWith("url") ||
            log.fieldName.toLowerCase().endsWith("file") ||
            (newVal && typeof newVal === "string" && (newVal.startsWith("http://") || newVal.startsWith("https://")));

          const suffix = (log.module && log.recordName)
            ? (log.module.toLowerCase() === log.recordName.toLowerCase() ? ` for ${log.module}` : ` for ${log.module} - ${log.recordName}`)
            : (log.module ? ` for ${log.module}` : "");

          log.description = isUrlOrFileField
            ? `Updated ${readableField}${suffix}`
            : `Updated ${readableField} from ${oldVal} to ${newVal}${suffix}`;
        } else if (log.action === "CREATE") {
          log.description = `Created ${log.module || "Job"} ${log.recordName || ""}`.trim();
        } else if (log.action === "DELETE") {
          log.description = `Deleted ${log.module || "Job"} ${log.recordName || ""}`.trim();
        }
      });

      return {
        success: true,
        data: {
          activityLogs,
          pagination: fetchAll
            ? { page: 1, limit: total, total, totalPages: 1 }
            : { page: parseInt(page), limit: parseInt(limit), total, totalPages: Math.ceil(total / limit) },
        },
        message: "Job activity log fetched successfully",
      };
    } catch (error) {
      console.error("JobService.getJobActivityLog error:", error);
      throw error;
    }
  }

  /**
   * Tenant scope — the single source of truth for "which jobs can this user
   * see at all". Row-level narrowing (Site Supervisor, Contact) is layered on
   * top by applyRowScope.
   *
   * Delegates to the RBAC helper, which applies §6:
   *   Super Admin   → no filter
   *   Company tier  → company_id = self
   *   everyone else → builder_id = self   (Builder and the row-scoped roles)
   *
   * This previously OR-ed the two ids together. A Builder carries BOTH a
   * builder_id and a company_id, so `builder_id = X OR company_id = Y` matched
   * every job in the company — a Builder saw other builders' jobs instead of
   * only their own.
   */
  _buildTenantScope(user) {
    // Every job route mounts scopeBuilder, which sets role_name. If it is ever
    // missing we must not fall through to an unfiltered query, so scope down to
    // whichever id we do have and otherwise match nothing.
    if (!user?.role_name) {
      if (user?.builder_id) {
        return { builder_id: user.builder_id };
      }
      if (user?.company_id) {
        return { company_id: user.company_id };
      }
      return { company_id: null };
    }

    return applyTenantScope({}, user);
  }

  _buildJobAddress(propertyDetail, state) {
    return [
      propertyDetail?.lot_number,
      propertyDetail?.street,
      propertyDetail?.address_line1,
      propertyDetail?.address_line2,
      propertyDetail?.city,
      state?.name,
      propertyDetail?.zip_code,
    ]
      .map((s) => s?.trim?.() || s)
      .filter(Boolean)
      .join(", ") || null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Commencement Letter — slide-over preview data (recipient options + default
  //  subject) for the authenticated builder/company user.
  // ──────────────────────────────────────────────────────────────────────────
  async getCommencementLetterPreview(jobId, user) {
    const { Job, Opportunity, Leads, PropertyDetail, State, Users, Builder } = db.sequelize.models;

    try {
      const job = await Job.findOne({
        where: { job_id: jobId, ...this._buildTenantScope(user) },
        include: [
          {
            model: Opportunity,
            as: "opportunity",
            include: [
              {
                model: Leads,
                as: "lead",
                include: [
                  { model: PropertyDetail, as: "propertyDetail", include: [{ model: State, as: "state" }] },
                  { model: Users, as: "assignee" },
                ],
              },
            ],
          },
          { model: Builder, as: "builder" },
        ],
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
      }

      const plainJob = job.get({ plain: true });
      const lead = plainJob.opportunity?.lead || {};
      const propertyDetail = lead.propertyDetail || {};
      const state = propertyDetail.state || {};
      const consultant = lead.assignee || {};
      const builder = plainJob.builder || {};

      // Build the recipient list for the "To"/"Cc" dropdowns. De-duplicate by
      // email. The frontend picks the one with role "Customer" as the default To.
      const seen = new Set();
      const recipients = [];
      const addRecipient = (name, email, role) => {
        const value = email?.trim?.();
        if (!value || seen.has(value.toLowerCase())) {
          return;
        }
        seen.add(value.toLowerCase());
        recipients.push({ name: name || value, email: value, role });
      };

      addRecipient(lead.name, lead.email, "Customer");
      addRecipient(consultant.name, consultant.email, "Consultant");
      addRecipient(builder.name, builder.email, "Builder");

      const referenceNumber = plainJob.reference_number;
      const jobAddress = this._buildJobAddress(propertyDetail, state);

      // Default message body (editable in the rich-text editor). Mirrors the
      // fallback used by the commencement letter worker.
      const defaultMessage =
        `<p>Dear ${lead.name || "Customer"},</p>`
        + "<p>We are pleased to confirm the commencement of your building works"
        + `${jobAddress ? ` at ${jobAddress}` : ""}. Please find the Commencement Letter `
        + "attached to this email for your records.</p>"
        + "<p>If you have any questions, please reach out to your consultant.</p>"
        + `<p>Kind regards,<br/>${builder.name || "inBuildify"}</p>`;

      return {
        success: true,
        data: {
          recipients,
          defaultSubject: `Commencement Letter${referenceNumber ? ` – ${referenceNumber}` : ""}`,
          defaultMessage,
          jobPdf: {
            willAttach: true,
            note: "Generated automatically and attached on send",
          },
          job: {
            jobId: plainJob.job_id,
            referenceNumber: referenceNumber || null,
            customerName: lead.name || null,
            jobAddress,
            commencementLetterSent: plainJob.commencement_letter_sent || false,
          },
        },
        message: "Commencement letter preview fetched successfully",
      };
    } catch (error) {
      console.error("JobService.getCommencementLetterPreview error:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Commencement Letter — enqueue the email. The worker generates the PDF,
  //  uploads it to S3, sends the email, and marks the job.
  // ──────────────────────────────────────────────────────────────────────────
  async sendCommencementLetter(jobId, user, emailInput = {}) {
    const { Job } = db.sequelize.models;

    try {
      const job = await Job.findOne({
        where: { job_id: jobId, ...this._buildTenantScope(user) },
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
      }

      const { to, cc = [], subject, message, emailCopy } = emailInput;

      const toList = (Array.isArray(to) ? to : [to])
        .filter((e) => typeof e === "string" && e.trim())
        .map((e) => e.trim());

      if (toList.length === 0) {
        return { success: false, statusCode: 400, message: "At least one recipient is required" };
      }

      const ccList = (Array.isArray(cc) ? cc : [])
        .filter((e) => typeof e === "string" && e.trim())
        .map((e) => e.trim());

      // "Email me a copy" — CC the logged-in user.
      if (emailCopy && user?.email && !ccList.includes(user.email)) {
        ccList.push(user.email);
      }

      await notificationQueue.add(
        "commencementLetter",
        {
          jobId,
          userId: user?.users_id || user?.user_id || null,
          emailData: { to: toList, cc: ccList, subject, message },
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 10000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId,
        module: "Job",
        moduleId: jobId,
        recordName: job.reference_number,
        action: "UPDATE",
        description: `Commencement letter sent to ${toList.join(", ")}`,
      });

      return {
        success: true,
        data: { jobId, to: toList, cc: ccList },
        message: "Commencement letter has been queued for delivery",
      };
    } catch (error) {
      console.error("JobService.sendCommencementLetter error:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Commencement Letter — PUBLIC details for the customer acknowledgment page
  //  (reached via the emailed link, secured by the external token). No JWT, so
  //  no tenant scope — the encrypted token gates access.
  // ──────────────────────────────────────────────────────────────────────────
  async getCommencementLetterPublicDetails(jobId) {
    const { Job, Opportunity, Leads, PropertyDetail, State, Builder } = db.sequelize.models;

    try {
      const job = await Job.findOne({
        where: { job_id: jobId },
        include: [
          {
            model: Opportunity,
            as: "opportunity",
            include: [
              {
                model: Leads,
                as: "lead",
                include: [{ model: PropertyDetail, as: "propertyDetail", include: [{ model: State, as: "state" }] }],
              },
            ],
          },
          { model: Builder, as: "builder" },
        ],
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found" };
      }

      const plainJob = job.get({ plain: true });
      const lead = plainJob.opportunity?.lead || {};
      const propertyDetail = lead.propertyDetail || {};
      const state = propertyDetail.state || {};
      const builder = plainJob.builder || {};

      return {
        success: true,
        data: {
          jobId: plainJob.job_id,
          referenceNumber: plainJob.reference_number,
          customerName: lead.name || null,
          customerEmail: lead.email || null,
          builderName: builder.name || null,
          jobAddress: this._buildJobAddress(propertyDetail, state),
          estateName: propertyDetail.estate_name || null,
          commencementLetterSent: plainJob.commencement_letter_sent || false,
          ackStatus: plainJob.commencement_ack_status || null,
          ackComments: plainJob.commencement_ack_comments || null,
          ackAt: plainJob.commencement_ack_at || null,
        },
        message: "Commencement letter details fetched successfully",
      };
    } catch (error) {
      console.error("JobService.getCommencementLetterPublicDetails error:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Commencement Letter — record the customer's accept/decline (PUBLIC).
  // ──────────────────────────────────────────────────────────────────────────
  async acknowledgeCommencementLetter(jobId, ackInput = {}) {
    const { Job } = db.sequelize.models;

    try {
      const job = await Job.findOne({ where: { job_id: jobId } });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found" };
      }

      if (!job.commencement_letter_sent) {
        return { success: false, statusCode: 400, message: "No commencement letter has been sent for this job" };
      }

      if (["ACCEPTED", "DECLINED"].includes(job.commencement_ack_status)) {
        return { success: false, statusCode: 409, message: "This commencement letter has already been acknowledged" };
      }

      const { decision, comments } = ackInput;

      await job.update({
        commencement_ack_status: decision,
        commencement_ack_comments: comments || null,
        commencement_ack_at: new Date(),
      });

      await logJobActivity(null, {
        userId: null,
        jobId,
        module: "Job",
        moduleId: jobId,
        recordName: job.reference_number,
        action: "UPDATE",
        fieldName: "commencementAckStatus",
        oldValue: null,
        newValue: decision,
        description: `Customer ${decision === "ACCEPTED" ? "accepted" : "declined"} commencement letter`,
      });

      return {
        success: true,
        data: {
          jobId,
          ackStatus: decision,
          ackComments: comments || null,
          ackAt: job.commencement_ack_at,
        },
        message: `Commencement letter ${decision === "ACCEPTED" ? "accepted" : "declined"} successfully`,
      };
    } catch (error) {
      console.error("JobService.acknowledgeCommencementLetter error:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  Complete Job approval — the roles allowed to approve a job completion.
  // ──────────────────────────────────────────────────────────────────────────
  static get COMPLETION_APPROVER_ROLES() {
    return [ROLES.COMPANY_ADMINISTRATOR, ROLES.SITE_SUPERVISOR];
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  The two approver roles do not live under the same tenant anchor, so a
  //  single builder_id filter cannot find both:
  //
  //   - Site Supervisor is builder-scoped and belongs to this job's builder.
  //   - Company Administrator is company-scoped (ROLE_SCOPES marks them
  //     SCOPES.COMPANY). Their row may carry company_id, but createUser only
  //     sets company_id when the client sends it while always stamping
  //     builder_id, so in practice most sit under a *sibling* builder of the
  //     same company. Matching on this job's builder_id alone therefore finds
  //     none of them, which is what emptied the approver list.
  //
  //  So resolve the company (via the job, the user, or the job's builder) and
  //  let administrators match on either anchor, while supervisors stay pinned
  //  to this job's builder.
  //
  //  Returns the Op.or branches, or null when there is no tenant anchor at
  //  all — callers must treat that as "no approvers" rather than querying
  //  every user in the system.
  // ──────────────────────────────────────────────────────────────────────────
  async _buildApproverScope(job, user) {
    const { Builder } = db.sequelize.models;

    const builderId = job?.builder_id || user?.builder_id || null;
    let companyId = job?.company_id || user?.company_id || null;

    // Older jobs predate job.company_id being populated; fall back to the
    // company that owns the job's builder.
    if (!companyId && builderId) {
      const owning = await Builder.findByPk(builderId, { attributes: ["company_id"], raw: true });
      companyId = owning?.company_id || null;
    }

    const anchors = [];

    // Anyone eligible attached directly to this job's builder — this is the
    // only branch Site Supervisors are allowed to match on.
    if (builderId) {
      anchors.push({ builder_id: builderId });
    }

    if (companyId) {
      // Administrators recorded at the company level.
      anchors.push({ company_id: companyId, "$role.name$": ROLES.COMPANY_ADMINISTRATOR });

      // Administrators recorded against a sibling builder of the same company.
      // Pinned to the role so this never widens the Site Supervisor set to
      // supervisors from other builders, who have no claim on this job.
      const siblings = await Builder.findAll({
        where: { company_id: companyId },
        attributes: ["builder_id"],
        raw: true,
      });
      const siblingIds = siblings.map((b) => b.builder_id).filter((id) => id && id !== builderId);
      if (siblingIds.length) {
        anchors.push({
          builder_id: { [Op.in]: siblingIds },
          "$role.name$": ROLES.COMPANY_ADMINISTRATOR,
        });
      }
    }

    return anchors.length ? anchors : null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  GET /job/:job_id/completion-approval
  //  Current approval state + the Company Administrator / Site Supervisor list
  //  the Confirmation drawer picks from.
  // ──────────────────────────────────────────────────────────────────────────
  async getCompletionApproval(jobId, user) {
    const { Job, Users, Role, Maintenance } = db.sequelize.models;

    try {
      const job = await Job.findOne({
        where: { job_id: jobId, ...this._buildTenantScope(user) },
        include: [
          {
            model: Users,
            as: "completionApprover",
            required: false,
            include: [{ model: Role, as: "role", attributes: ["name"], required: false }],
          },
        ],
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
      }

      const plainJob = job.get({ plain: true });

      const approverScope = await this._buildApproverScope(plainJob, user);

      const approvers = approverScope === null ? [] : await Users.findAll({
        where: {
          is_deleted: false,
          is_active: true,
          // Seeded demo staff are never offered. Nominating one is not a
          // harmless bit of list noise the way a greyed-out picker row is: the
          // nominee is emailed the approval PDF, and a sample user's address is
          // a mailinator stub nobody reads, so the job would sit PENDING on an
          // acceptance that can never arrive.
          //
          // `Op.not` rather than `false` — the column is nullable on rows
          // written before the flag existed, and `= false` would drop them.
          // Naming the column here also takes the query out of `scopeToViewer`
          // (see sampleDataFlag.js), which is correct: this is strictly narrower
          // than the per-viewer rule it would otherwise have applied.
          is_sample_data: { [Op.not]: true },
          [Op.or]: approverScope,
        },
        include: [
          {
            model: Role,
            as: "role",
            attributes: ["name"],
            required: true,
            where: { name: { [Op.in]: JobService.COMPLETION_APPROVER_ROLES } },
          },
        ],
        attributes: ["users_id", "name", "email", "phone"],
        order: [["name", "ASC"]],
      });

      const approver = plainJob.completionApprover || null;

      // Once the Confirmation step has been completed the job owns a maintenance
      // record — hand its id back so the drawer can deep-link to the maintenance
      // dashboard instead of only surfacing it in the completion response.
      const maintenance = await Maintenance.findOne({
        where: { job_id: jobId },
        attributes: ["maintenance_id", "status"],
        raw: true,
      });

      return {
        success: true,
        data: {
          jobId: plainJob.job_id,
          referenceNumber: plainJob.reference_number || null,
          maintenanceId: maintenance?.maintenance_id || null,
          maintenanceStatus: maintenance?.status || null,
          jobStatus: plainJob.status || null,
          status: plainJob.completion_approval_status || null,
          comments: plainJob.completion_approval_comments || null,
          sentAt: plainJob.completion_approval_sent_at || null,
          respondedAt: plainJob.completion_approval_at || null,
          approver: approver
            ? {
              usersId: approver.users_id,
              name: approver.name,
              email: approver.email,
              roleName: approver.role?.name || null,
            }
            : null,
          approvers: approvers.map((u) => {
            const plain = u.get({ plain: true });
            return {
              usersId: plain.users_id,
              name: plain.name,
              email: plain.email,
              phone: plain.phone || null,
              roleName: plain.role?.name || null,
            };
          }),
        },
        message: "Job completion approval fetched successfully",
      };
    } catch (error) {
      console.error("JobService.getCompletionApproval error:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  POST /job/:job_id/completion-approval/send
  //  Nominate an approver and queue the approval email (PDF generated by the
  //  worker, exactly like the commencement letter).
  // ──────────────────────────────────────────────────────────────────────────
  async sendCompletionApproval(jobId, user, input = {}) {
    const { Job, Users, Role } = db.sequelize.models;

    try {
      const job = await Job.findOne({
        where: { job_id: jobId, ...this._buildTenantScope(user) },
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
      }

      const { approverUserId, pciDate, occupancyPermitDate, handoverDate } = input;

      if (!handoverDate) {
        return { success: false, statusCode: 400, message: "Handover date is required to request approval" };
      }

      // Resolve the approver server-side — the client only sends the user id, so
      // a spoofed email can never be mailed, and the role gate stays authoritative.
      const approverScope = await this._buildApproverScope(job, user);

      const approver = approverScope === null ? null : await Users.findOne({
        where: {
          users_id: approverUserId,
          is_deleted: false,
          // Same exclusion as the list above, repeated rather than trusted from
          // it: this is the statement that decides who gets emailed, and the id
          // arrives from the client. A stale drawer or a hand-made request must
          // not be able to name a seeded user the picker no longer offers.
          is_sample_data: { [Op.not]: true },
          [Op.or]: approverScope,
        },
        include: [{ model: Role, as: "role", attributes: ["name"], required: false }],
      });

      if (!approver) {
        return { success: false, statusCode: 404, message: "Approver not found or unauthorized" };
      }

      if (!JobService.COMPLETION_APPROVER_ROLES.includes(approver.role?.name)) {
        return {
          success: false,
          statusCode: 400,
          message: "Approver must be a Company Administrator or Site Supervisor",
        };
      }

      if (!approver.email) {
        return { success: false, statusCode: 400, message: "Selected approver has no email address" };
      }

      await job.update({
        completion_approver_user_id: approver.users_id,
        completion_approval_status: "PENDING",
        completion_approval_comments: null,
        completion_approval_sent_at: new Date(),
        completion_approval_at: null,
      });

      await notificationQueue.add(
        "jobCompletionApproval",
        {
          jobId,
          userId: user?.users_id || user?.user_id || null,
          requestedByName: user?.name || null,
          dates: { pciDate: pciDate || null, occupancyPermitDate: occupancyPermitDate || null, handoverDate },
        },
        {
          attempts: 3,
          backoff: { type: "exponential", delay: 10000 },
          removeOnComplete: true,
          removeOnFail: 50,
        },
      );

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId,
        module: "Job",
        moduleId: jobId,
        recordName: job.reference_number,
        action: "UPDATE",
        fieldName: "completionApprovalStatus",
        oldValue: null,
        newValue: "PENDING",
        description: `Job completion approval requested from ${approver.name || approver.email}`,
      });

      return {
        success: true,
        data: {
          jobId,
          status: "PENDING",
          sentAt: job.completion_approval_sent_at,
          approver: {
            usersId: approver.users_id,
            name: approver.name,
            email: approver.email,
            roleName: approver.role?.name || null,
          },
        },
        message: "Approval request has been queued for delivery",
      };
    } catch (error) {
      console.error("JobService.sendCompletionApproval error:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  GET /job/:job_id/completion-approval/public-details   (PUBLIC, token-secured)
  //  Powers the approver's accept/decline page reached from the emailed link.
  // ──────────────────────────────────────────────────────────────────────────
  async getCompletionApprovalPublicDetails(jobId) {
    const { Job, Opportunity, Leads, PropertyDetail, State, Builder, Users, Role } = db.sequelize.models;

    try {
      const job = await Job.findOne({
        where: { job_id: jobId },
        include: [
          {
            model: Opportunity,
            as: "opportunity",
            include: [
              {
                model: Leads,
                as: "lead",
                include: [{ model: PropertyDetail, as: "propertyDetail", include: [{ model: State, as: "state" }] }],
              },
            ],
          },
          { model: Builder, as: "builder" },
          {
            model: Users,
            as: "completionApprover",
            required: false,
            include: [{ model: Role, as: "role", attributes: ["name"], required: false }],
          },
        ],
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found" };
      }

      const plainJob = job.get({ plain: true });
      const lead = plainJob.opportunity?.lead || {};
      const propertyDetail = lead.propertyDetail || {};
      const state = propertyDetail.state || {};
      const builder = plainJob.builder || {};
      const approver = plainJob.completionApprover || {};

      return {
        success: true,
        data: {
          jobId: plainJob.job_id,
          referenceNumber: plainJob.reference_number,
          customerName: lead.name || null,
          customerEmail: lead.email || null,
          builderName: builder.name || null,
          jobAddress: this._buildJobAddress(propertyDetail, state),
          estateName: propertyDetail.estate_name || null,
          approverName: approver.name || null,
          approverEmail: approver.email || null,
          approverRole: approver.role?.name || null,
          status: plainJob.completion_approval_status || null,
          comments: plainJob.completion_approval_comments || null,
          sentAt: plainJob.completion_approval_sent_at || null,
          respondedAt: plainJob.completion_approval_at || null,
        },
        message: "Job completion approval details fetched successfully",
      };
    } catch (error) {
      console.error("JobService.getCompletionApprovalPublicDetails error:", error);
      throw error;
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  //  POST /job/:job_id/completion-approval/respond        (PUBLIC, token-secured)
  //  Records the approver's accept/decline + optional comments.
  // ──────────────────────────────────────────────────────────────────────────
  async respondCompletionApproval(jobId, input = {}) {
    const { Job, Users, Opportunity, Leads, PropertyDetail, State } = db.sequelize.models;

    try {
      const job = await Job.findOne({
        where: { job_id: jobId },
        include: [
          { model: Users, as: "completionApprover", required: false },
          {
            model: Opportunity,
            as: "opportunity",
            required: false,
            include: [
              {
                model: Leads,
                as: "lead",
                include: [{ model: PropertyDetail, as: "propertyDetail", include: [{ model: State, as: "state" }] }],
              },
            ],
          },
        ],
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found" };
      }

      if (!job.completion_approval_status) {
        return { success: false, statusCode: 400, message: "No approval has been requested for this job" };
      }

      if (["ACCEPTED", "DECLINED"].includes(job.completion_approval_status)) {
        return { success: false, statusCode: 409, message: "This approval request has already been answered" };
      }

      const { decision, comments, emailCopy } = input;

      await job.update({
        completion_approval_status: decision,
        completion_approval_comments: comments || null,
        completion_approval_at: new Date(),
      });

      // "Email me a copy of this response" — goes back to the approver.
      const approverEmail = job.completionApprover?.email;
      if (emailCopy && approverEmail) {
        const lead = job.opportunity?.lead || {};
        const html = wrapJobCompletionApprovalResponseHTML({
          approverName: job.completionApprover?.name,
          decision,
          comments,
          referenceNumber: job.reference_number,
          jobAddress: this._buildJobAddress(lead.propertyDetail, lead.propertyDetail?.state),
        });

        await notificationQueue.add(
          {
            to: [approverEmail],
            subject: `Job Completion Approval ${decision === "ACCEPTED" ? "Accepted" : "Declined"}`
              + `${job.reference_number ? ` – ${job.reference_number}` : ""}`,
            text: `You have ${decision === "ACCEPTED" ? "accepted" : "declined"} the job completion request`
              + `${job.reference_number ? ` for ${job.reference_number}` : ""}.`,
            html,
            attachments: [],
            cc: null,
            attachmentKeys: [],
          },
          { attempts: 3, backoff: { type: "exponential", delay: 10000 }, removeOnComplete: true, removeOnFail: 50 },
        );
      }

      await logJobActivity(null, {
        userId: null,
        jobId,
        module: "Job",
        moduleId: jobId,
        recordName: job.reference_number,
        action: "UPDATE",
        fieldName: "completionApprovalStatus",
        oldValue: "PENDING",
        newValue: decision,
        description: `Approver ${decision === "ACCEPTED" ? "accepted" : "declined"} the job completion request`,
      });

      return {
        success: true,
        data: {
          jobId,
          status: decision,
          comments: comments || null,
          respondedAt: job.completion_approval_at,
        },
        message: `Job completion request ${decision === "ACCEPTED" ? "accepted" : "declined"} successfully`,
      };
    } catch (error) {
      console.error("JobService.respondCompletionApproval error:", error);
      throw error;
    }
  }
}

export default new JobService();
