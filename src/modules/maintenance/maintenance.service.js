import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { buildScopedWhere } from "../../helper/rbac.helper.js";
import { MODULES, ROLES } from "../../constants/rbac.js";
import { keysToCamelCase } from "../../utils/common.js";
import { logActivity } from "../../utils/activityLogger.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";
import { DRIVE_FILE_MAPPING } from "../../constants/driveFile.js";
import { createImageDriveFile, s3UrlForKey } from "../../helper/imageDriveFile.helper.js";
import { findOrCreateDriveFolder } from "../../helper/driveFolder.helper.js";
import {
  isDuplicateMaintenanceReference,
  uniqueMaintenanceReference,
} from "../../helper/maintenanceReference.helper.js";
import { runAsSampleDataSideEffect } from "../../config/database/models/postgre-models/sampleDataFlag.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import sendEmail from "../../service/sendMail.service.js";

// Row-level scoping columns on the maintenance table (mirrors JOB_SCOPE_COLUMNS
// in job.service.js) — Site Supervisor sees only maintenance records where
// they're the assigned supervisor; Contact (customer) sees only their own job.
const MAINTENANCE_SCOPE_COLUMNS = {
  supervisorColumn: "supervisor_id",
  contactIdColumn: "customer_contact_id",
};

const BLOCKING_REQUEST_STATUSES = ["Pending", "On Hold"];

const JOB_DETAIL_INCLUDE = (models) => ({
  model: models.Job,
  as: "job",
  required: true,
  include: [
    {
      model: models.Opportunity,
      as: "opportunity",
      required: false,
      include: [
        {
          model: models.Leads,
          as: "lead",
          required: false,
          include: [{ model: models.PropertyDetail, as: "propertyDetail", required: false }],
        },
      ],
    },
  ],
});

class MaintenanceService {
  /**
   * Idempotent — called from JobService.updateJobStatus when a job's status is
   * set to JOB_STATUS_HANDOVER_COMPLETED. Never overwrites an existing record.
   */
  async ensureMaintenanceForJob(jobId, fields = {}, user = {}) {
    const { Maintenance } = db.sequelize.models;

    const [maintenance, created] = await Maintenance.findOrCreate({
      where: { job_id: jobId },
      defaults: {
        job_id: jobId,
        builder_id: fields.builderId ?? null,
        company_id: fields.companyId ?? null,
        supervisor_id: fields.supervisorId ?? null,
        customer_contact_id: fields.customerContactId ?? null,
        status: "readyformaintenance",
        pci_date: fields.pciDate ?? null,
        occupancy_permit_date: fields.occupancyPermitDate ?? null,
        handover_date: fields.handoverDate ?? null,
        created_by: user?.users_id ?? null,
      },
    });

    if (created) {
      await logActivity(null, {
        userId: user?.users_id,
        builderId: fields.builderId,
        companyId: fields.companyId,
        referenceId: maintenance.maintenance_id,
        referenceType: "Maintenance",
        module: "Maintenance",
        moduleId: maintenance.maintenance_id,
        action: "CREATE",
        description: "Maintenance record auto-created on handover completion",
      });
    }

    return { success: true, created, data: keysToCamelCase(maintenance.get({ plain: true })) };
  }

  async _requestCountsFor(maintenanceIds) {
    if (!maintenanceIds.length) return {};
    const { MaintenanceRequest } = db.sequelize.models;
    const rows = await MaintenanceRequest.findAll({
      where: { maintenance_id: { [Op.in]: maintenanceIds } },
      attributes: ["maintenance_id", "status"],
      raw: true,
    });
    const map = {};
    for (const row of rows) {
      if (!map[row.maintenance_id]) map[row.maintenance_id] = { total: 0, completed: 0 };
      map[row.maintenance_id].total += 1;
      if (row.status === "Completed") map[row.maintenance_id].completed += 1;
    }
    return map;
  }

  /**
   * Users eligible to be assigned as Site Supervisor — those whose role is in
   * the builder's configured maintenance `supervisor_roles`, falling back to the
   * built-in "Site Supervisor" role while that setting is still empty. Returns []
   * only when the builder has no such users at all.
   * Powers the "Assign Site Supervisor" dropdown.
   */
  async _eligibleSupervisors(user) {
    const { MaintenanceSettings, Users, Role } = db.sequelize.models;
    const builderId = user?.builder_id ?? null;
    const companyId = user?.company_id ?? null;

    const settings = await MaintenanceSettings.findOne({
      where: { builder_id: builderId, company_id: companyId },
      attributes: ["supervisor_roles"],
      raw: true,
    });

    const roleIds = settings?.supervisor_roles ?? [];
    const isConfigured = Array.isArray(roleIds) && roleIds.length > 0;

    // supervisor_roles ships empty (see seed-maintenance-settings.js), so before
    // anyone edits Maintenance settings there is nothing to match on. Returning []
    // there left the "Assign Site Supervisor" dropdown empty even when the builder
    // clearly had Site Supervisors — so fall back to the built-in role by name and
    // let an explicit configuration override it once one exists.
    const roleInclude = isConfigured
      ? { model: Role, as: "role", attributes: ["role_id", "name"], required: false }
      : {
        model: Role,
        as: "role",
        attributes: ["role_id", "name"],
        required: true,
        where: { name: ROLES.SITE_SUPERVISOR },
      };

    const supervisors = await Users.findAll({
      where: {
        ...(isConfigured ? { role_id: { [Op.in]: roleIds } } : {}),
        builder_id: builderId,
        is_deleted: false,
        is_active: true,
      },
      attributes: ["users_id", "name", "email", "role_id"],
      include: [roleInclude],
      order: [["name", "ASC"]],
    });

    return supervisors.map((u) => keysToCamelCase(u.get({ plain: true })));
  }

  async getAllMaintenance(queryParams, user) {
    const { Maintenance, Job, Opportunity, Leads, PropertyDetail, Users } = db.sequelize.models;
    const {
      page = 1,
      limit = 25,
      status,
      customer_name,
      job_address,
      reference_id,
      supervisor_id,
      sort_by = "created_at",
      sort_order = "desc",
    } = queryParams;

    const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit)));

    const scoped = buildScopedWhere({}, user, MODULES.MAINTENANCE, MAINTENANCE_SCOPE_COLUMNS);
    const where = { [Op.and]: [scoped] };

    if (status) where[Op.and].push({ status });
    if (supervisor_id) where[Op.and].push({ supervisor_id });
    if (reference_id) where[Op.and].push({ "$job.reference_number$": { [Op.iLike]: `%${reference_id}%` } });
    if (customer_name) where[Op.and].push({ "$job.opportunity.lead.name$": { [Op.iLike]: `%${customer_name}%` } });
    if (job_address) {
      where[Op.and].push({
        [Op.or]: [
          { "$job.opportunity.lead.propertyDetail.lot_number$": { [Op.iLike]: `%${job_address}%` } },
          { "$job.opportunity.lead.propertyDetail.street$": { [Op.iLike]: `%${job_address}%` } },
          { "$job.opportunity.lead.propertyDetail.address_line1$": { [Op.iLike]: `%${job_address}%` } },
          { "$job.opportunity.lead.propertyDetail.city$": { [Op.iLike]: `%${job_address}%` } },
        ],
      });
    }

    const orderMap = {
      created_at: [["created_at", sort_order]],
      status: [["status", sort_order]],
    };
    const order = orderMap[sort_by] || orderMap.created_at;

    const { rows, count } = await Maintenance.findAndCountAll({
      where,
      include: [
        JOB_DETAIL_INCLUDE(db.sequelize.models),
        { model: Users, as: "supervisor", required: false, attributes: ["users_id", "name"] },
      ],
      order,
      limit: pageSize,
      offset,
      distinct: true,
      subQuery: false,
    });

    const requestCounts = await this._requestCountsFor(rows.map((r) => r.maintenance_id));

    // Eligible Site Supervisors (users in the configured supervisor_roles) are
    // the same for every row, so resolve once and attach to each item.
    const supervisors = await this._eligibleSupervisors(user);

    const data = rows.map((r) => {
      const plain = r.get({ plain: true });
      const counts = requestCounts[r.maintenance_id] || { total: 0, completed: 0 };
      const item = keysToCamelCase({ ...plain, requestTotal: counts.total, requestCompleted: counts.completed });
      return { ...item, supervisors };
    });

    return {
      success: true,
      data: { items: data, total: count, page: parseInt(page), limit: pageSize },
      message: "Maintenance list fetched",
    };
  }

  async getStats(user) {
    const { Maintenance } = db.sequelize.models;
    const where = buildScopedWhere({}, user, MODULES.MAINTENANCE, MAINTENANCE_SCOPE_COLUMNS);
    const rows = await Maintenance.findAll({ where, attributes: ["status"], raw: true });

    const counts = { readyformaintenance: 0, undermaintenance: 0, completed: 0 };
    for (const row of rows) {
      if (counts[row.status] !== undefined) counts[row.status] += 1;
    }

    return { success: true, data: counts, message: "Stats fetched" };
  }

  async getMaintenanceById(maintenanceId, user) {
    const { Maintenance, Users, MaintenanceRequest, MaintenanceRequestTask } = db.sequelize.models;
    const where = buildScopedWhere({ maintenance_id: maintenanceId }, user, MODULES.MAINTENANCE, MAINTENANCE_SCOPE_COLUMNS);

    const maintenance = await Maintenance.findOne({
      where,
      include: [
        JOB_DETAIL_INCLUDE(db.sequelize.models),
        { model: Users, as: "supervisor", required: false, attributes: ["users_id", "name"] },
        {
          model: MaintenanceRequest,
          as: "requests",
          required: false,
          separate: true,
          order: [["created_at", "ASC"]],
          include: [
            {
              model: MaintenanceRequestTask,
              as: "tasks",
              required: false,
            },
          ],
        },
      ],
    });

    if (!maintenance) {
      return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };
    }

    const plain = maintenance.get({ plain: true });
    await this._attachTaskAttachments(plain);

    return { success: true, data: keysToCamelCase(plain), message: "Maintenance fetched" };
  }

  /**
   * Mutates the plain maintenance object, adding an `attachments` array to every
   * task. Batches a single DriveFile query across all task IDs.
   */
  async _attachTaskAttachments(plainMaintenance) {
    const { DriveFile } = db.sequelize.models;

    const tasks = [];
    for (const req of plainMaintenance.requests || []) {
      for (const task of req.tasks || []) tasks.push(task);
    }
    if (!tasks.length) return;

    const files = await DriveFile.findAll({
      where: {
        reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE_TASK_ATTACHMENT,
        reference_id: { [Op.in]: tasks.map((t) => t.maintenance_request_task_id) },
      },
      order: [["created_at", "DESC"]],
    });

    const byTask = {};
    for (const f of files) {
      const fp = f.get({ plain: true });
      if (!byTask[fp.reference_id]) byTask[fp.reference_id] = [];
      byTask[fp.reference_id].push({ ...fp, url: s3UrlForKey(fp.s3_key) });
    }

    for (const task of tasks) {
      task.attachments = byTask[task.maintenance_request_task_id] || [];
    }
  }

  async _findScoped(maintenanceId, user, options = {}) {
    const { Maintenance } = db.sequelize.models;
    const where = buildScopedWhere({ maintenance_id: maintenanceId }, user, MODULES.MAINTENANCE, MAINTENANCE_SCOPE_COLUMNS);
    return Maintenance.findOne({ where, ...options });
  }

  /**
   * The core business rules for `completed`: it is rejected while the record has
   * no Site Supervisor assigned, and while any child request is still Pending or
   * On Hold — the latter matches the screenshot's exact toast text.
   */
  async updateStatus(maintenanceId, newStatus, comments, user) {
    const { MaintenanceRequest } = db.sequelize.models;
    const maintenance = await this._findScoped(maintenanceId, user);
    if (!maintenance) {
      return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };
    }

    if (newStatus === "completed") {
      if (!maintenance.supervisor_id) {
        return {
          success: false,
          statusCode: 400,
          message: "Please assign a Site Supervisor before completing this maintenance",
        };
      }

      const blockingCount = await MaintenanceRequest.count({
        where: { maintenance_id: maintenanceId, status: { [Op.in]: BLOCKING_REQUEST_STATUSES } },
      });
      if (blockingCount > 0) {
        return { success: false, statusCode: 400, message: "Please complete the Pending/Onhold Requests" };
      }
    }

    const oldStatus = maintenance.status;
    // Moving a record through its own workflow is using it, not editing it, so a
    // seeded one goes through the same states as any other — see
    // runAsSampleDataSideEffect.
    await runAsSampleDataSideEffect(() =>
      maintenance.update({
        status: newStatus,
        updated_by: user?.users_id ?? null,
        ...(newStatus === "completed" ? { completed_at: new Date() } : {}),
      }),
    );

    await logActivity(null, {
      userId: user?.users_id,
      builderId: maintenance.builder_id,
      companyId: maintenance.company_id,
      referenceId: maintenanceId,
      referenceType: "Maintenance",
      module: "Maintenance",
      moduleId: maintenanceId,
      action: "UPDATE",
      fieldName: "status",
      oldValue: oldStatus,
      newValue: newStatus,
      description: comments || `Updated status from ${oldStatus} to ${newStatus}`,
    });

    return { success: true, data: keysToCamelCase(maintenance.get({ plain: true })), message: "Maintenance status updated" };
  }

  async assignSupervisor(maintenanceId, supervisorId, user) {
    const maintenance = await this._findScoped(maintenanceId, user);
    if (!maintenance) {
      return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };
    }

    const oldSupervisorId = maintenance.supervisor_id;
    // Assignment is workflow too — see the status change above.
    await runAsSampleDataSideEffect(() =>
      maintenance.update({ supervisor_id: supervisorId, updated_by: user?.users_id ?? null }),
    );

    await logActivity(null, {
      userId: user?.users_id,
      builderId: maintenance.builder_id,
      companyId: maintenance.company_id,
      referenceId: maintenanceId,
      referenceType: "Maintenance",
      module: "Maintenance",
      moduleId: maintenanceId,
      action: "UPDATE",
      fieldName: "supervisor_id",
      oldValue: oldSupervisorId,
      newValue: supervisorId,
      description: "Supervisor reassigned",
    });

    return { success: true, data: keysToCamelCase(maintenance.get({ plain: true })), message: "Supervisor assigned" };
  }

  async revertToConstruction(maintenanceId, user) {
    const { Job, Users } = db.sequelize.models;
    const maintenance = await this._findScoped(maintenanceId, user);
    if (!maintenance) {
      return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };
    }

    const jobId = maintenance.job_id;

    await logActivity(null, {
      userId: user?.users_id,
      builderId: maintenance.builder_id,
      companyId: maintenance.company_id,
      referenceId: maintenanceId,
      referenceType: "Maintenance",
      module: "Maintenance",
      moduleId: maintenanceId,
      action: "DELETE",
      description: "Maintenance record reverted to construction",
    });

    await maintenance.destroy();

    const job = await Job.findByPk(jobId, {
      include: [
        { model: Users, as: "completionApprover", attributes: ["name", "email"], required: false },
      ],
    });
    if (job) {
      // Snapshot the first approval before clearing it, so the History entry
      // below can preserve who approved and what state it was in.
      const prevApprovalStatus = job.completion_approval_status;
      const prevApproverName = job.completionApprover?.name || job.completionApprover?.email || null;

      // Reverting wipes the maintenance record, so the completion approval that
      // gated the original handover no longer applies. Clear the live columns —
      // otherwise the Confirmation modal keeps showing the stale "Accepted"
      // state, which re-enables Complete Job and lets the job be re-completed
      // without a fresh approval. Nulling these resets the approval flow to
      // "Select Approver" (a new email must be sent and accepted from the
      // start), and re-completing then mints a brand-new maintenance id.
      await job.update({
        status: "In Progress",
        completion_approver_user_id: null,
        completion_approval_status: null,
        completion_approval_comments: null,
        completion_approval_sent_at: null,
        completion_approval_at: null,
      });

      // The reset clears the live columns, but the first approval must stay in
      // the job History timeline (same append-only log the request/accept
      // events were written to). This entry records that the earlier approval
      // existed and was reset on revert, without altering the original ones.
      if (prevApprovalStatus) {
        await logJobActivity(null, {
          userId: user?.users_id,
          jobId,
          module: "Job",
          moduleId: jobId,
          recordName: job.reference_number,
          action: "UPDATE",
          fieldName: "completionApprovalStatus",
          oldValue: prevApprovalStatus,
          newValue: null,
          description: prevApproverName
            ? `Completion approval reset (was ${prevApprovalStatus} by ${prevApproverName}) — job reverted to construction; a fresh approval must be requested`
            : `Completion approval reset (was ${prevApprovalStatus}) — job reverted to construction; a fresh approval must be requested`,
        });
      }
    }

    return { success: true, data: null, message: "Reverted to construction" };
  }

  async createRequest(maintenanceId, payload, user) {
    const MAX_REFERENCE_ATTEMPTS = 5;

    let result;
    for (let attempt = 1; ; attempt += 1) {
      try {
        result = await this._createRequestOnce(maintenanceId, payload, user);
        break;
      } catch (error) {
        if (attempt >= MAX_REFERENCE_ATTEMPTS || !isDuplicateMaintenanceReference(error)) {
          throw error;
        }
      }
    }

    if (!result.success) return result;

    await logActivity(null, {
      userId: user?.users_id,
      referenceId: maintenanceId,
      referenceType: "Maintenance",
      module: "Maintenance",
      moduleId: maintenanceId,
      action: "CREATE",
      description: `Request ${result.referenceNumber} created`,
    });

    return this.getMaintenanceById(maintenanceId, user);
  }

  async _createRequestOnce(maintenanceId, payload, user) {
    const { Maintenance, MaintenanceRequest, MaintenanceRequestTask } = db.sequelize.models;

    const result = await db.sequelize.transaction(async (t) => {
      const maintenance = await Maintenance.findOne({
        where: buildScopedWhere({ maintenance_id: maintenanceId }, user, MODULES.MAINTENANCE, MAINTENANCE_SCOPE_COLUMNS),
        include: [{ model: db.sequelize.models.Job, as: "job", attributes: ["reference_number"] }],
        lock: { level: t.LOCK.UPDATE, of: Maintenance },
        transaction: t,
      });
      if (!maintenance) {
        return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };
      }

      const nextSeq = maintenance.request_sequence + 1;
      // Bookkeeping, not an edit — the sequence numbers the request being added
      // and the status follows from having one. A seeded maintenance record
      // would otherwise refuse the whole create (see runAsSampleDataSideEffect),
      // which stops anyone trying the module out on the demo data.
      await runAsSampleDataSideEffect(() =>
        maintenance.update(
          {
            request_sequence: nextSeq,
            ...(maintenance.status === "readyformaintenance" ? { status: "undermaintenance" } : {}),
          },
          { transaction: t },
        ),
      );

      // const referenceNumber = `${maintenance.job.reference_number}-MR${nextSeq}`;
      const referenceNumber = await uniqueMaintenanceReference(
        `${maintenance.job.reference_number}-MR${nextSeq}`,
        t,
      );

      const request = await MaintenanceRequest.create(
        {
          maintenance_id: maintenanceId,
          reference_number: referenceNumber,
          supplier: payload.supplier || null,
          start_date: payload.start_date || null,
          finish_date: payload.finish_date || null,
          amount: payload.amount || 0,
          notes: payload.notes || null,
          attach_file: payload.attach_file || null,
          builder_id: maintenance.builder_id,
          company_id: maintenance.company_id,
          status: "Pending",
          created_by: user?.users_id ?? null,
        },
        { transaction: t },
      );

      const descriptions = payload.descriptions || [];
      if (descriptions.length) {
        await MaintenanceRequestTask.bulkCreate(
          descriptions.map((title, idx) => ({
            maintenance_request_id: request.maintenance_request_id,
            title,
            sort_order: idx,
            created_by: user?.users_id ?? null,
          })),
          { transaction: t },
        );
      }

      return { success: true, referenceNumber };
    });

    return result;
  }

  async _findRequestScoped(requestId, user) {
    const { MaintenanceRequest, Maintenance } = db.sequelize.models;
    const request = await MaintenanceRequest.findByPk(requestId, {
      include: [{ model: Maintenance, as: "maintenance" }],
    });
    if (!request) return null;

    const scoped = await this._findScoped(request.maintenance_id, user, { attributes: ["maintenance_id"] });
    if (!scoped) return null;
    return request;
  }

  async updateRequest(requestId, payload, user) {
    const request = await this._findRequestScoped(requestId, user);
    if (!request) return { success: false, statusCode: 404, message: "Request not found or unauthorized" };

    const oldStatus = request.status;
    const oldFile = request.attach_file;
    const updates = { ...payload, updated_by: user?.users_id ?? null };
    if (payload.status === "Completed" && !payload.complete_date) {
      updates.complete_date = new Date();
    }

    // Clean up old S3 file if it is updated or deleted
    if (payload.attach_file !== undefined && payload.attach_file !== oldFile) {
      if (oldFile) {
        try {
          await deleteFromS3(oldFile);
        } catch (s3Error) {
          console.error("Error deleting old request attachment from S3:", s3Error);
        }
      }
    }

    await request.update(updates);

    if (payload.status && payload.status !== oldStatus) {
      await logActivity(null, {
        userId: user?.users_id,
        referenceId: request.maintenance_id,
        referenceType: "Maintenance",
        subReferenceId: requestId,
        subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.MAINTENANCE_REQUEST,
        module: "Maintenance",
        moduleId: request.maintenance_id,
        action: "UPDATE",
        fieldName: "status",
        oldValue: oldStatus,
        newValue: payload.status,
        description: `Request ${request.reference_number} status changed from ${oldStatus} to ${payload.status}`,
      });
    }

    return { success: true, data: keysToCamelCase(request.get({ plain: true })), message: "Request updated" };
  }

  async deleteRequest(requestId, user) {
    const request = await this._findRequestScoped(requestId, user);
    if (!request) return { success: false, statusCode: 404, message: "Request not found or unauthorized" };

    if (request.attach_file) {
      try {
        await deleteFromS3(request.attach_file);
      } catch (s3Error) {
        console.error("Error deleting request attachment from S3 upon deletion:", s3Error);
      }
    }

    await logActivity(null, {
      userId: user?.users_id,
      referenceId: request.maintenance_id,
      referenceType: "Maintenance",
      module: "Maintenance",
      moduleId: request.maintenance_id,
      action: "DELETE",
      description: `Request ${request.reference_number} deleted`,
    });

    await request.destroy();
    return { success: true, data: null, message: "Request deleted" };
  }

  async addRequestTask(requestId, payload, user) {
    const { MaintenanceRequestTask } = db.sequelize.models;
    const request = await this._findRequestScoped(requestId, user);
    if (!request) return { success: false, statusCode: 404, message: "Request not found or unauthorized" };

    const task = await MaintenanceRequestTask.create({
      maintenance_request_id: requestId,
      title: payload.title,
      notes: payload.notes || null,
      created_by: user?.users_id ?? null,
    });

    return { success: true, data: keysToCamelCase(task.get({ plain: true })), message: "Task added" };
  }

  async _findTaskScoped(taskId, user) {
    const { MaintenanceRequestTask } = db.sequelize.models;
    const task = await MaintenanceRequestTask.findByPk(taskId);
    if (!task) return null;

    const request = await this._findRequestScoped(task.maintenance_request_id, user);
    if (!request) return null;
    return task;
  }

  async updateRequestTask(taskId, payload, user) {
    const task = await this._findTaskScoped(taskId, user);
    if (!task) return { success: false, statusCode: 404, message: "Task not found or unauthorized" };

    await task.update({ ...payload, updated_by: user?.users_id ?? null });
    return { success: true, data: keysToCamelCase(task.get({ plain: true })), message: "Task updated" };
  }

  async deleteRequestTask(taskId, user) {
    const task = await this._findTaskScoped(taskId, user);
    if (!task) return { success: false, statusCode: 404, message: "Task not found or unauthorized" };

    await task.destroy();
    return { success: true, data: null, message: "Task deleted" };
  }

  async notify(maintenanceId, payload, user) {
    const maintenance = await this._findScoped(maintenanceId, user);
    if (!maintenance) return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };

    // Send email notification
    const recipients = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;
    await sendEmail(recipients, payload.subject, null, payload.message || "");

    await logActivity(null, {
      userId: user?.users_id,
      builderId: maintenance.builder_id,
      companyId: maintenance.company_id,
      referenceId: maintenanceId,
      referenceType: "Maintenance",
      module: "Maintenance",
      moduleId: maintenanceId,
      action: "NOTIFY",
      description: `Notify (${payload.notify_stage}) sent for ${(payload.request_ids || []).length} item(s), filter: ${payload.task_status_filter}`,
      metadata: payload,
    });

    return { success: true, data: null, message: "Notification recorded and email sent" };
  }

  async bookingReminder(maintenanceId, filter, user) {
    const { MaintenanceRequest } = db.sequelize.models;
    const maintenance = await this._findScoped(maintenanceId, user);
    if (!maintenance) return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };

    if (filter === "Pending") {
      const pendingCount = await MaintenanceRequest.count({
        where: { maintenance_id: maintenanceId, status: "Pending" },
      });
      if (pendingCount === 0) {
        return { success: false, statusCode: 400, message: "There are no pending request for this job." };
      }
    }

    await logActivity(null, {
      userId: user?.users_id,
      builderId: maintenance.builder_id,
      companyId: maintenance.company_id,
      referenceId: maintenanceId,
      referenceType: "Maintenance",
      module: "Maintenance",
      moduleId: maintenanceId,
      action: "BOOKING_REMINDER",
      description: `Booking reminder sent, filter: ${filter}`,
    });

    return { success: true, data: null, message: "Booking reminder sent" };
  }

  /** Best-effort human-readable file name from a raw S3 URL/key. */
  _basenameFromUrl(url) {
    if (!url) return "attachment";
    const path = String(url).split("?")[0];
    const base = path.substring(path.lastIndexOf("/") + 1);
    try {
      return decodeURIComponent(base) || "attachment";
    } catch {
      return base || "attachment";
    }
  }

  /**
   * Aggregated document view for the Documents tab. Merges the three places a
   * maintenance record can hold files into one uniformly-shaped, newest-first
   * list:
   *   1. Documents uploaded directly on the record        → source "Document"
   *   2. Attachments uploaded against a request           → source "Request"
   *   3. Attachments uploaded against an individual task  → source "Task"
   * Each item carries a resolved `url`, a `source`/`sourceLabel`, and a
   * `canDelete` flag. Only maintenance-level documents are deletable from here;
   * request/task attachments are managed from the Requests tab (canDelete false).
   */
  async getDocuments(maintenanceId, user) {
    const { DriveFile, MaintenanceRequest, MaintenanceRequestTask } = db.sequelize.models;
    const maintenance = await this._findScoped(maintenanceId, user, { attributes: ["maintenance_id"] });
    if (!maintenance) return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };

    // 1) Documents uploaded directly on the maintenance record.
    const docFiles = await DriveFile.findAll({
      where: {
        reference_id: maintenanceId,
        reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE,
      },
      order: [["created_at", "DESC"]],
    });
    const documents = docFiles.map((f) => {
      const p = f.get({ plain: true });
      return {
        fileId: p.file_id,
        originalName: p.original_name,
        fileName: p.file_name,
        s3Key: p.s3_key,
        url: s3UrlForKey(p.s3_key),
        size: p.size,
        mimeType: p.mime_type,
        fileExtension: p.file_extension,
        createdAt: p.created_at,
        source: "Document",
        sourceLabel: "Uploaded",
        referenceNumber: null,
        canDelete: true,
      };
    });

    // Requests (with their tasks) — powers request-level attachments and the
    // task_id → { referenceNumber, title } map used to label task attachments.
    const requests = await MaintenanceRequest.findAll({
      where: { maintenance_id: maintenanceId },
      attributes: ["maintenance_request_id", "reference_number", "attach_file", "created_at"],
      include: [
        {
          model: MaintenanceRequestTask,
          as: "tasks",
          required: false,
          attributes: ["maintenance_request_task_id", "title"],
        },
      ],
      order: [["created_at", "ASC"]],
    });

    // 2) Request-level attachments (attach_file is already a full S3 URL string).
    const requestAttachments = [];
    const taskMeta = {};
    const taskIds = [];
    for (const r of requests) {
      const rp = r.get({ plain: true });
      if (rp.attach_file) {
        const name = this._basenameFromUrl(rp.attach_file);
        requestAttachments.push({
          fileId: null,
          originalName: name,
          fileName: name,
          s3Key: null,
          url: rp.attach_file,
          size: null,
          mimeType: null,
          fileExtension: name.includes(".") ? name.split(".").pop() : null,
          createdAt: rp.created_at,
          source: "Request",
          sourceLabel: rp.reference_number,
          referenceNumber: rp.reference_number,
          requestId: rp.maintenance_request_id,
          canDelete: false,
        });
      }
      for (const t of rp.tasks || []) {
        taskMeta[t.maintenance_request_task_id] = { referenceNumber: rp.reference_number, title: t.title };
        taskIds.push(t.maintenance_request_task_id);
      }
    }

    // 3) Task-level attachments (DriveFiles keyed by task id).
    let taskAttachments = [];
    if (taskIds.length) {
      const taskFiles = await DriveFile.findAll({
        where: {
          reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE_TASK_ATTACHMENT,
          reference_id: { [Op.in]: taskIds },
        },
        order: [["created_at", "DESC"]],
      });
      taskAttachments = taskFiles.map((f) => {
        const p = f.get({ plain: true });
        const meta = taskMeta[p.reference_id] || {};
        return {
          fileId: p.file_id,
          originalName: p.original_name,
          fileName: p.file_name,
          s3Key: p.s3_key,
          url: s3UrlForKey(p.s3_key),
          size: p.size,
          mimeType: p.mime_type,
          fileExtension: p.file_extension,
          createdAt: p.created_at,
          source: "Task",
          sourceLabel: meta.title ? `${meta.referenceNumber} · ${meta.title}` : meta.referenceNumber || "Task",
          referenceNumber: meta.referenceNumber || null,
          taskId: p.reference_id,
          canDelete: false,
        };
      });
    }

    const all = [...documents, ...requestAttachments, ...taskAttachments].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );

    return { success: true, data: all, message: "Documents fetched" };
  }

  /**
   * The drive's "Maintenance Documents" bucket, created on first use.
   *
   * Everything uploaded against a maintenance record lands here — the Documents
   * tab and the Site Images tab both — so S Drive has one place showing what a
   * maintenance job accumulated. Before this, `createImageDriveFile` left
   * `folder_id` null: the rows existed and listed on their own tabs, but the
   * drive tree had nowhere to show them.
   *
   * `builderId` is deliberately not passed. `isSystemFolder` treats the named
   * root buckets as company-level, so the company shares one folder instead of
   * each builder getting their own copy at the drive root.
   *
   * @returns {Promise<string|null>} the Drive PK, or null if it could not be
   *   resolved — an upload is still worth keeping unfiled rather than failing.
   */
  async _maintenanceFolderId(companyId, user) {
    const folder = await findOrCreateDriveFolder({
      name: DRIVE_FILE_MAPPING.FOLDERS.MAINTENANCE_DOCUMENTS,
      companyId,
      createdBy: user?.users_id ?? null,
    });
    // `drive_id` is the Drive PK; `folder_id` is only the FK's name over on
    // DriveFile. Matches how the other drive helpers read it.
    return folder?.drive_id ?? null;
  }

  async uploadDocument(maintenanceId, file, user, subReferenceType = null, subReferenceId = null) {
    const maintenance = await this._findScoped(maintenanceId, user, { attributes: ["maintenance_id", "builder_id", "company_id"] });
    if (!maintenance) return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };

    const driveFile = await createImageDriveFile({
      file,
      companyId: maintenance.company_id,
      builderId: maintenance.builder_id,
      uploadedBy: user?.users_id ?? null,
      folderId: await this._maintenanceFolderId(maintenance.company_id, user),
      referenceId: maintenanceId,
      referenceType: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE,
      subReferenceType,
      subReferenceId,
      namePrefix: "maintenance",
    });

    return { success: true, data: keysToCamelCase(driveFile.get({ plain: true })), message: "Document uploaded" };
  }

  async deleteDocument(fileId, user) {
    const { DriveFile } = db.sequelize.models;
    const file = await DriveFile.findOne({
      where: { file_id: fileId, reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE },
    });
    if (!file) return { success: false, statusCode: 404, message: "Document not found" };

    const maintenance = await this._findScoped(file.reference_id, user, { attributes: ["maintenance_id"] });
    if (!maintenance) return { success: false, statusCode: 404, message: "Document not found or unauthorized" };

    await deleteFromS3(file.s3_key);
    await file.destroy();

    return { success: true, data: null, message: "Document deleted" };
  }

  // ── Site Images ────────────────────────────────────────────────────────────
  // Stored as DriveFiles under reference_type = MaintenanceSiteImage (distinct
  // from Documents' 'Maintenance' type) with sub_reference_type NULL, so many
  // images can co-exist per maintenance without hitting the polymorphic unique
  // index (which only applies when sub_reference_type IS NOT NULL).

  _siteImagePayload(file) {
    const plain = file.get({ plain: true });
    return keysToCamelCase({ ...plain, url: s3UrlForKey(plain.s3_key) });
  }

  async getSiteImages(maintenanceId, user) {
    const { DriveFile } = db.sequelize.models;
    const maintenance = await this._findScoped(maintenanceId, user, { attributes: ["maintenance_id"] });
    if (!maintenance) return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };

    const files = await DriveFile.findAll({
      where: {
        reference_id: maintenanceId,
        reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE_SITE_IMAGE,
      },
      order: [["created_at", "DESC"]],
    });

    return { success: true, data: files.map((f) => this._siteImagePayload(f)), message: "Site images fetched" };
  }

  async uploadSiteImage(maintenanceId, file, user) {
    const maintenance = await this._findScoped(maintenanceId, user, { attributes: ["maintenance_id", "builder_id", "company_id"] });
    if (!maintenance) return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };

    const driveFile = await createImageDriveFile({
      file,
      companyId: maintenance.company_id,
      builderId: maintenance.builder_id,
      uploadedBy: user?.users_id ?? null,
      folderId: await this._maintenanceFolderId(maintenance.company_id, user),
      referenceId: maintenanceId,
      referenceType: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE_SITE_IMAGE,
      subReferenceType: null,
      subReferenceId: null,
      namePrefix: "maintenance_site_image",
    });

    return { success: true, data: this._siteImagePayload(driveFile), message: "Site image uploaded" };
  }

  async deleteSiteImage(fileId, user) {
    const { DriveFile } = db.sequelize.models;
    const file = await DriveFile.findOne({
      where: { file_id: fileId, reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE_SITE_IMAGE },
    });
    if (!file) return { success: false, statusCode: 404, message: "Site image not found" };

    const maintenance = await this._findScoped(file.reference_id, user, { attributes: ["maintenance_id"] });
    if (!maintenance) return { success: false, statusCode: 404, message: "Site image not found or unauthorized" };

    await deleteFromS3(file.s3_key);
    await file.destroy();

    return { success: true, data: null, message: "Site image deleted" };
  }

  // ── Task Attachments ─────────────────────────────────────────────────────────
  // Files attached to a maintenance request task. Stored as DriveFiles keyed by
  // reference_id = task_id, reference_type = MaintenanceTaskAttachment,
  // sub_reference_type NULL — so a task can hold many attachments.

  _attachmentPayload(file) {
    const plain = file.get({ plain: true });
    return keysToCamelCase({ ...plain, url: s3UrlForKey(plain.s3_key) });
  }

  async getTaskAttachments(taskId, user) {
    const { DriveFile } = db.sequelize.models;
    const task = await this._findTaskScoped(taskId, user);
    if (!task) return { success: false, statusCode: 404, message: "Task not found or unauthorized" };

    const files = await DriveFile.findAll({
      where: {
        reference_id: taskId,
        reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE_TASK_ATTACHMENT,
      },
      order: [["created_at", "DESC"]],
    });

    return { success: true, data: files.map((f) => this._attachmentPayload(f)), message: "Task attachments fetched" };
  }

  async uploadTaskAttachment(taskId, file, user) {
    const { MaintenanceRequest } = db.sequelize.models;
    const task = await this._findTaskScoped(taskId, user);
    if (!task) return { success: false, statusCode: 404, message: "Task not found or unauthorized" };

    const request = await MaintenanceRequest.findByPk(task.maintenance_request_id, {
      attributes: ["builder_id", "company_id"],
    });

    const driveFile = await createImageDriveFile({
      file,
      companyId: request?.company_id ?? null,
      builderId: request?.builder_id ?? null,
      uploadedBy: user?.users_id ?? null,
      referenceId: taskId,
      referenceType: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE_TASK_ATTACHMENT,
      subReferenceType: null,
      subReferenceId: null,
      namePrefix: "maintenance_task_attachment",
    });

    return { success: true, data: this._attachmentPayload(driveFile), message: "Attachment uploaded" };
  }

  async deleteTaskAttachment(fileId, user) {
    const { DriveFile } = db.sequelize.models;
    const file = await DriveFile.findOne({
      where: { file_id: fileId, reference_type: DRIVE_FILE_MAPPING.REFERENCE_NAMES.MAINTENANCE_TASK_ATTACHMENT },
    });
    if (!file) return { success: false, statusCode: 404, message: "Attachment not found" };

    const task = await this._findTaskScoped(file.reference_id, user);
    if (!task) return { success: false, statusCode: 404, message: "Attachment not found or unauthorized" };

    await deleteFromS3(file.s3_key);
    await file.destroy();

    return { success: true, data: null, message: "Attachment deleted" };
  }

  async getActivityLog(maintenanceId, user, { page = 1, limit = 20 } = {}) {
    const { ActivityLog } = db.sequelize.models;
    const maintenance = await this._findScoped(maintenanceId, user, { attributes: ["maintenance_id"] });
    if (!maintenance) return { success: false, statusCode: 404, message: "Maintenance record not found or unauthorized" };

    const offset = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
    const { rows, count } = await ActivityLog.findAndCountAll({
      where: { module: "Maintenance", module_id: maintenanceId },
      order: [["created_at", "DESC"]],
      limit: Math.min(100, Math.max(1, parseInt(limit))),
      offset,
    });

    return {
      success: true,
      data: { items: keysToCamelCase(rows.map((r) => r.get({ plain: true }))), total: count },
      message: "Activity log fetched",
    };
  }
}

export default new MaintenanceService();
