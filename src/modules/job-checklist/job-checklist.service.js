import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { applyTenantScope } from "../../helper/rbac.helper.js";
import { keysToCamelCase } from "../../utils/common.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";

/**
 * Job → "DA Checklist" drawer (the list icon in the job header).
 *
 * Two layers already existed and are reused rather than duplicated:
 *   `checklist` / `checklist_item`  — the builder's MASTER templates, managed in
 *                                     Settings → General → Checklist.
 *   `job_checklist_item`            — this module's per-job instance, holding a
 *                                     copy of the definition plus the answer.
 *
 * An item reaches a job either by applying a master checklist (which copies its
 * items once — the unique index on (job_id, checklist_item_id) keeps re-applying
 * idempotent) or by being typed straight into the drawer, in which case its
 * checklist_id / checklist_item_id stay null.
 */

const ITEM_TYPES = ["checkbox", "dropdown"];
const DROPDOWN_RESPONSES = ["Yes", "No", "N/A"];
const CHECKBOX_RESPONSE = "checked";

const notFound = (message) => {
  const error = new Error(message);
  error.status = 404;
  return error;
};

const badRequest = (message) => {
  const error = new Error(message);
  error.status = 400;
  return error;
};

/**
 * A checklist line counts as done once it carries an answer — "checked" for a
 * checkbox, one of Yes/No/N/A for a dropdown. Clearing the answer sends it back
 * to Pending, which is what the drawer's tabs count.
 */
function normalizeResponse(type, response) {
  if (response === undefined || response === null || response === "") return null;

  const value = String(response).trim();

  if (type === "checkbox") {
    // Accept the booleans the UI's checkbox naturally sends.
    if (["true", "checked", "1", "yes"].includes(value.toLowerCase())) return CHECKBOX_RESPONSE;
    if (["false", "0", "no", "unchecked"].includes(value.toLowerCase())) return null;
    throw badRequest("Invalid response for a checkbox item. Send true/false or \"checked\".");
  }

  const match = DROPDOWN_RESPONSES.find((r) => r.toLowerCase() === value.toLowerCase());
  if (!match) {
    throw badRequest(`Invalid response for a dropdown item. Allowed: ${DROPDOWN_RESPONSES.join(", ")}.`);
  }
  return match;
}

function shapeItem(row) {
  const plain = row.get ? row.get({ plain: true }) : row;
  return {
    ...keysToCamelCase(plain),
    // Derived for the All / Pending / Completed tabs, so the client never has to
    // re-implement the rule.
    status: plain.is_completed ? "completed" : "pending",
  };
}

class JobChecklistService {
  _tenantScope(user) {
    if (!user?.role_name) {
      if (user?.builder_id) return { builder_id: user.builder_id };
      if (user?.company_id) return { company_id: user.company_id };
      return { company_id: null };
    }
    return applyTenantScope({}, user);
  }

  async _findJob(jobId, user) {
    const { Job } = db.sequelize.models;
    const job = await Job.findOne({ where: { job_id: jobId, ...this._tenantScope(user) } });
    if (!job) throw notFound("Job not found or unauthorized");
    return job;
  }

  /** Load one item and prove it belongs to a job this user can see. */
  async _findItem(itemId, user) {
    const { JobChecklistItem, Job } = db.sequelize.models;
    const item = await JobChecklistItem.findOne({
      where: { job_checklist_item_id: itemId },
      include: [{ model: Job, as: "job", required: true, where: this._tenantScope(user) }],
    });
    if (!item) throw notFound("Checklist item not found or unauthorized");
    return item;
  }

  /**
   * The job's checklist plus the tab counts. `status` filters the rows only —
   * the counts always describe the whole checklist, which is what the tabs show.
   */
  async getJobChecklist(jobId, query = {}, user) {
    const { JobChecklistItem } = db.sequelize.models;
    await this._findJob(jobId, user);

    const where = { job_id: jobId };
    const status = String(query.status || "all").toLowerCase();
    if (status === "pending") where.is_completed = false;
    else if (status === "completed") where.is_completed = true;

    const [rows, all, completed] = await Promise.all([
      JobChecklistItem.findAll({ where, order: [["sort", "ASC"], ["created_at", "ASC"]] }),
      JobChecklistItem.count({ where: { job_id: jobId } }),
      JobChecklistItem.count({ where: { job_id: jobId, is_completed: true } }),
    ]);

    return {
      items: rows.map(shapeItem),
      counts: { all, pending: all - completed, completed },
    };
  }

  /** Master checklists the drawer can offer to apply to this job. */
  async getAvailableTemplates(user) {
    const { Checklist, ChecklistItem } = db.sequelize.models;
    const builderId = user?.builder_id || null;

    const checklists = await Checklist.findAll({
      where: { builder_id: builderId, is_deleted: false, is_active: true },
      attributes: ["checklist_id", "name"],
      include: [{ model: ChecklistItem, as: "checklistItems", attributes: ["checklist_item_id"], required: false }],
      order: [["name", "ASC"]],
    });

    return checklists.map((c) => ({
      checklistId: c.checklist_id,
      name: c.name,
      itemCount: (c.checklistItems || []).length,
    }));
  }

  async _nextSort(jobId, transaction = null) {
    const { JobChecklistItem } = db.sequelize.models;
    const max = await JobChecklistItem.max("sort", { where: { job_id: jobId }, transaction });
    return (max ?? 0) + 1;
  }

  /** Add one ad-hoc line — the drawer's "+ Checklist" row. */
  async addItem(jobId, payload, user) {
    const { JobChecklistItem } = db.sequelize.models;
    const job = await this._findJob(jobId, user);

    const description = String(payload.description || "").trim();
    if (!description) throw badRequest("Description is required.");

    const type = payload.type || "checkbox";
    if (!ITEM_TYPES.includes(type)) {
      throw badRequest(`Invalid type. Allowed: ${ITEM_TYPES.join(", ")}.`);
    }

    const duplicate = await JobChecklistItem.findOne({ where: { job_id: jobId, description } });
    if (duplicate) {
      const error = new Error("This checklist item already exists for the job.");
      error.status = 409;
      throw error;
    }

    const item = await JobChecklistItem.create({
      job_id: jobId,
      builder_id: job.builder_id,
      company_id: job.company_id,
      description,
      notes: !!payload.notes,
      is_required: !!payload.is_required,
      type,
      sort: payload.sort ?? (await this._nextSort(jobId)),
      created_by: user?.users_id || null,
      updated_by: user?.users_id || null,
    });

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId,
      module: "Job Checklist",
      moduleId: item.job_checklist_item_id,
      recordName: description,
      action: "CREATE",
      description: `Added checklist item "${description}"`,
    });

    return shapeItem(item);
  }

  /**
   * Copy a master checklist's items onto the job. Idempotent — items already
   * applied are skipped, so re-applying only picks up what was added to the
   * template since.
   */
  async applyTemplate(jobId, checklistId, user) {
    const { Checklist, ChecklistItem, JobChecklistItem } = db.sequelize.models;
    const job = await this._findJob(jobId, user);

    const checklist = await Checklist.findOne({
      where: {
        checklist_id: checklistId,
        builder_id: job.builder_id,
        is_deleted: false,
        is_active: true,
      },
      attributes: ["checklist_id", "name"],
    });
    if (!checklist) throw notFound("Checklist template not found, inactive, or not yours");

    const masterItems = await ChecklistItem.findAll({
      where: { checklist_id: checklistId },
      order: [["sort", "ASC"]],
    });
    if (!masterItems.length) throw badRequest("That checklist template has no items.");

    const existing = await JobChecklistItem.findAll({
      where: { job_id: jobId, checklist_item_id: { [Op.ne]: null } },
      attributes: ["checklist_item_id"],
    });
    const alreadyApplied = new Set(existing.map((r) => r.checklist_item_id));

    const pending = masterItems.filter((m) => !alreadyApplied.has(m.checklist_item_id));
    if (!pending.length) {
      return { added: 0, skipped: masterItems.length, items: [] };
    }

    let sort = await this._nextSort(jobId);
    const created = await JobChecklistItem.bulkCreate(
      pending.map((m) => ({
        job_id: jobId,
        builder_id: job.builder_id,
        company_id: job.company_id,
        checklist_id: checklistId,
        checklist_item_id: m.checklist_item_id,
        description: m.description,
        notes: m.notes,
        is_required: m.is_required,
        type: m.type,
        sort: sort++,
        created_by: user?.users_id || null,
        updated_by: user?.users_id || null,
      })),
      { returning: true },
    );

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId,
      module: "Job Checklist",
      moduleId: checklistId,
      recordName: checklist.name,
      action: "CREATE",
      description: `Applied checklist "${checklist.name}" — ${created.length} item(s) added`,
    });

    return {
      added: created.length,
      skipped: masterItems.length - created.length,
      items: created.map(shapeItem),
    };
  }

  /** Edit the line itself (description / notes / required / type / sort). */
  async updateItem(itemId, payload, user) {
    const item = await this._findItem(itemId, user);

    const update = { updated_by: user?.users_id || null };

    if (payload.description !== undefined) {
      const description = String(payload.description).trim();
      if (!description) throw badRequest("Description cannot be empty.");
      update.description = description;
    }
    if (payload.notes !== undefined) update.notes = !!payload.notes;
    if (payload.is_required !== undefined) update.is_required = !!payload.is_required;
    if (payload.sort !== undefined) update.sort = payload.sort;

    if (payload.type !== undefined) {
      if (!ITEM_TYPES.includes(payload.type)) {
        throw badRequest(`Invalid type. Allowed: ${ITEM_TYPES.join(", ")}.`);
      }
      // A checkbox answer is meaningless on a dropdown and vice versa, so
      // changing the type resets the answer instead of leaving a stale one.
      if (payload.type !== item.type) {
        update.type = payload.type;
        update.response = null;
        update.is_completed = false;
        update.completed_by = null;
        update.completed_at = null;
      }
    }

    await item.update(update);
    return shapeItem(item);
  }

  /**
   * Record the answer and/or the note. `response: null` clears the answer and
   * sends the line back to Pending.
   */
  async setResponse(itemId, payload, user) {
    const item = await this._findItem(itemId, user);

    const update = { updated_by: user?.users_id || null };

    if (payload.note !== undefined) {
      if (payload.note && !item.notes) {
        throw badRequest("This checklist item does not accept notes.");
      }
      update.note = payload.note || null;
    }

    if (payload.response !== undefined) {
      const response = normalizeResponse(item.type, payload.response);
      update.response = response;
      update.is_completed = response !== null;
      update.completed_by = response !== null ? user?.users_id || null : null;
      update.completed_at = response !== null ? new Date() : null;
    }

    await item.update(update);

    if (payload.response !== undefined) {
      await logJobActivity(null, {
        userId: user?.users_id || null,
        jobId: item.job_id,
        module: "Job Checklist",
        moduleId: item.job_checklist_item_id,
        recordName: item.description,
        action: "UPDATE",
        fieldName: "response",
        oldValue: item.previous("response") ?? null,
        newValue: update.response,
        description: update.response
          ? `Answered "${item.description}" with ${update.response}`
          : `Cleared the answer for "${item.description}"`,
      });
    }

    return shapeItem(item);
  }

  async deleteItem(itemId, user) {
    const item = await this._findItem(itemId, user);
    const { description, job_id: jobId } = item;

    await item.destroy();

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId,
      module: "Job Checklist",
      moduleId: itemId,
      recordName: description,
      action: "DELETE",
      description: `Removed checklist item "${description}"`,
    });

    return { deleted: true };
  }
}

export default new JobChecklistService();
