import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { applyRowScope, applyTenantScope } from "../../helper/rbac.helper.js";
import { MODULES } from "../../constants/rbac.js";
import { DRIVE_FILE_MAPPING } from "../../constants/driveFile.js";
import { createImageDriveFile, s3UrlForKey } from "../../helper/imageDriveFile.helper.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { keysToCamelCase } from "../../utils/common.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";

const IMAGE_REFERENCE_TYPE = DRIVE_FILE_MAPPING.REFERENCE_NAMES.JOB_DAILY_UPDATE_IMAGE;

/** Photos one update may hold in total, across its create and later edits. */
export const MAX_IMAGES_PER_UPDATE = 20;

/** Widest window the Contact dashboard may ask for in one call (a month view plus slack). */
const MAX_RANGE_DAYS = 62;

// Same row scope the job module uses: a Site Supervisor reaches only the jobs
// they supervise; builder-tier roles reach every job in their tenant.
const JOB_SCOPE_COLUMNS = {
  supervisorColumn: "supervisor_id",
  contactIdColumn: "customer_contact_id",
};

const MODULE_NAME = "Daily Update";

/** "" or null clears the temperature; pg returns DECIMAL as a string, so read it back as a number. */
const toTemperature = (value) => (value === "" || value === null || value === undefined ? null : Number(value));

const dayDiff = (from, to) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

class JobDailyUpdateService {
  // ── Scoping ────────────────────────────────────────────────────────────────

  /**
   * Which jobs a builder-side user may post to or read from. Mirrors
   * JobService._buildTenantScope + applyRowScope, so this module can never
   * reach a job GET /job/:job_id would refuse.
   */
  _staffJobScope(user) {
    let tenant;
    if (!user?.role_name) {
      if (user?.builder_id) tenant = { builder_id: user.builder_id };
      else if (user?.company_id) tenant = { company_id: user.company_id };
      else tenant = { company_id: null };
    } else {
      tenant = applyTenantScope({}, user);
    }
    return applyRowScope(tenant, user, MODULES.JOB, JOB_SCOPE_COLUMNS);
  }

  /**
   * The homebuyer's own jobs: job.customer_contact_id = self, inside their own
   * tenant. Same predicate as JobService._buildContactJobScope — a caller who is
   * nobody's contact simply matches nothing.
   */
  _contactJobScope(user) {
    const userId = user?.users_id || user?.id;
    if (!userId) return null;

    const tenantOr = [];
    if (user?.builder_id) tenantOr.push({ builder_id: user.builder_id });
    if (user?.company_id) tenantOr.push({ company_id: user.company_id });

    const where = { customer_contact_id: userId };
    if (tenantOr.length) where[Op.or] = tenantOr;
    return where;
  }

  async _findStaffJob(jobId, user) {
    return db.Job.findOne({
      where: { job_id: jobId, ...this._staffJobScope(user) },
      attributes: ["job_id", "reference_number", "builder_id", "company_id"],
    });
  }

  /** The update plus its job, provided the caller may reach that job. */
  async _findStaffUpdate(updateId, user) {
    const update = await db.JobDailyUpdate.findOne({ where: { job_daily_update_id: updateId } });
    if (!update) return { update: null, job: null };
    const job = await this._findStaffJob(update.job_id, user);
    return job ? { update, job } : { update: null, job: null };
  }

  // ── Photos ─────────────────────────────────────────────────────────────────

  /** Undo multer-s3's uploads when the request is refused after they landed. */
  async _discardUploads(files = []) {
    await Promise.all(files.map((file) => (file?.key ? deleteFromS3(file.key) : null)));
  }

  async _imagesByUpdate(updateIds) {
    const map = new Map();
    if (!updateIds.length) return map;

    const files = await db.DriveFile.findAll({
      where: {
        reference_id: { [Op.in]: updateIds },
        reference_type: IMAGE_REFERENCE_TYPE,
      },
      attributes: ["file_id", "reference_id", "s3_key", "original_name", "mime_type"],
      order: [["created_at", "ASC"]],
    });

    for (const file of files) {
      const list = map.get(file.reference_id) || [];
      list.push({
        fileId: file.file_id,
        url: s3UrlForKey(file.s3_key),
        originalName: file.original_name,
        mimeType: file.mime_type,
      });
      map.set(file.reference_id, list);
    }
    return map;
  }

  async _attachImages(update, job, files, user) {
    for (const file of files) {
      await createImageDriveFile({
        file,
        companyId: job.company_id,
        builderId: job.builder_id,
        uploadedBy: user?.users_id ?? null,
        referenceId: update.job_daily_update_id,
        referenceType: IMAGE_REFERENCE_TYPE,
        subReferenceType: null,
        subReferenceId: null,
        namePrefix: "job_daily_update",
      });
    }
  }

  // ── Payload ────────────────────────────────────────────────────────────────

  async _payloads(rows) {
    const images = await this._imagesByUpdate(rows.map((r) => r.job_daily_update_id));
    return rows.map((row) => {
      const plain = row.get({ plain: true });
      return {
        ...keysToCamelCase({
          job_daily_update_id: plain.job_daily_update_id,
          job_id: plain.job_id,
          update_date: plain.update_date,
          title: plain.title,
          status: plain.status,
          work_completed: plain.work_completed,
          notes: plain.notes,
          temperature: toTemperature(plain.temperature),
          created_at: plain.createdAt ?? plain.created_at,
          updated_at: plain.updatedAt ?? plain.updated_at,
        }),
        createdBy: plain.createdByUser
          ? { name: plain.createdByUser.name, initials: plain.createdByUser.initials }
          : null,
        images: images.get(plain.job_daily_update_id) || [],
      };
    });
  }

  async _reload(updateId) {
    const row = await db.JobDailyUpdate.findOne({
      where: { job_daily_update_id: updateId },
      include: [{ model: db.Users, as: "createdByUser", attributes: ["name", "initials"] }],
    });
    const [payload] = await this._payloads([row]);
    return payload;
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  _dateWhere(from, to) {
    if (from && to) {
      return { update_date: { [Op.between]: [from, to] } };
    }
    if (from) {
      return { update_date: { [Op.gte]: from } };
    }
    if (to) {
      return { update_date: { [Op.lte]: to } };
    }
    return {};
  }

  /** Updates, distinct site days and photos for one job within [from, to]. */
  async _countsFor(jobId, from, to) {
    const rows = await db.JobDailyUpdate.findAll({
      where: { job_id: jobId, ...this._dateWhere(from, to) },
      attributes: ["job_daily_update_id", "update_date"],
      raw: true,
    });
    const photos = rows.length
      ? await db.DriveFile.count({
        where: {
          reference_id: { [Op.in]: rows.map((r) => r.job_daily_update_id) },
          reference_type: IMAGE_REFERENCE_TYPE,
        },
      })
      : 0;
    return {
      totalUpdates: rows.length,
      activeDays: new Set(rows.map((r) => r.update_date)).size,
      photos,
    };
  }

  /**
   * The stat cards over the list: counts for the selected dates, the same
   * counts for the same days a whole number of weeks earlier (so "this week so
   * far" compares with the same weekdays last week; null when the range is
   * open-ended).
   */
  async _summary(job, from, to) {
    let previous = null;
    let previousFrom = null;
    let previousTo = null;
    let weeksBack = 0;
    if (from && to) {
      weeksBack = Math.ceil((dayDiff(from, to) + 1) / 7);
      const shift = (day) => {
        const d = new Date(`${day}T00:00:00Z`);
        d.setUTCDate(d.getUTCDate() - weeksBack * 7);
        return d.toISOString().slice(0, 10);
      };
      previousFrom = shift(from);
      previousTo = shift(to);
    }

    const [current, prev] = await Promise.all([
      this._countsFor(job.job_id, from, to),
      previousFrom ? this._countsFor(job.job_id, previousFrom, previousTo) : null,
    ]);
    if (prev) {
      previous = { from: previousFrom, to: previousTo, weeksBack, ...prev };
    }

    return { ...current, previous };
  }

  /** A site day more than a day ahead of the server clock is a typo, not an update. */
  _isTooFarAhead(day) {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    return day > tomorrow.toISOString().slice(0, 10);
  }

  // ── Builder side ───────────────────────────────────────────────────────────

  async createDailyUpdate(jobId, data, files, user) {
    const job = await this._findStaffJob(jobId, user);
    if (!job) {
      await this._discardUploads(files);
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    if (this._isTooFarAhead(data.update_date)) {
      await this._discardUploads(files);
      return { success: false, statusCode: 400, message: "Update date cannot be in the future" };
    }

    if (files.length > MAX_IMAGES_PER_UPDATE) {
      await this._discardUploads(files);
      return { success: false, statusCode: 400, message: `A daily update can hold at most ${MAX_IMAGES_PER_UPDATE} photos` };
    }

    const update = await db.JobDailyUpdate.create({
      job_id: job.job_id,
      company_id: job.company_id || user?.company_id || null,
      builder_id: job.builder_id || user?.builder_id || null,
      update_date: data.update_date,
      title: data.title || null,
      status: data.status || "in_progress",
      work_completed: data.work_completed,
      notes: data.notes || null,
      temperature: toTemperature(data.temperature),
      created_by: user?.users_id || null,
      updated_by: user?.users_id || null,
    });

    await this._attachImages(update, job, files, user);

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId: job.job_id,
      module: MODULE_NAME,
      moduleId: update.job_daily_update_id,
      recordName: job.reference_number,
      action: "CREATE",
      description: `Daily update added for ${data.update_date}${files.length ? ` with ${files.length} photo(s)` : ""}`,
    });

    return {
      success: true,
      data: await this._reload(update.job_daily_update_id),
      message: "Daily update submitted successfully",
    };
  }

  async getJobDailyUpdates(jobId, query, user) {
    const job = await this._findStaffJob(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const page = parseInt(query.page, 10) || 1;
    const limit = parseInt(query.limit, 10) || 20;

    const where = { job_id: jobId, ...this._dateWhere(query.from, query.to) };

    const [{ count, rows }, summary] = await Promise.all([
      db.JobDailyUpdate.findAndCountAll({
        where,
        include: [{ model: db.Users, as: "createdByUser", attributes: ["name", "initials"] }],
        order: [["update_date", "DESC"], ["created_at", "DESC"]],
        limit,
        offset: (page - 1) * limit,
      }),
      this._summary(job, query.from, query.to),
    ]);

    return {
      success: true,
      data: {
        dailyUpdates: await this._payloads(rows),
        pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
        summary,
      },
      message: "Daily updates fetched successfully",
    };
  }

  async updateDailyUpdate(updateId, data, files, user) {
    const { update, job } = await this._findStaffUpdate(updateId, user);
    if (!update) {
      await this._discardUploads(files);
      return { success: false, statusCode: 404, message: "Daily update not found or unauthorized" };
    }

    if (data.update_date && this._isTooFarAhead(data.update_date)) {
      await this._discardUploads(files);
      return { success: false, statusCode: 400, message: "Update date cannot be in the future" };
    }

    const removeIds = data.remove_image_ids || [];
    const current = await db.DriveFile.count({
      where: { reference_id: updateId, reference_type: IMAGE_REFERENCE_TYPE },
    });
    const toRemove = removeIds.length
      ? await db.DriveFile.findAll({
        where: {
          file_id: { [Op.in]: removeIds },
          reference_id: updateId,
          reference_type: IMAGE_REFERENCE_TYPE,
        },
      })
      : [];

    if (current - toRemove.length + files.length > MAX_IMAGES_PER_UPDATE) {
      await this._discardUploads(files);
      return { success: false, statusCode: 400, message: `A daily update can hold at most ${MAX_IMAGES_PER_UPDATE} photos` };
    }

    await update.update({
      update_date: data.update_date ?? update.update_date,
      title: data.title !== undefined ? data.title || null : update.title,
      status: data.status ?? update.status,
      work_completed: data.work_completed ?? update.work_completed,
      notes: data.notes !== undefined ? data.notes || null : update.notes,
      temperature: data.temperature !== undefined ? toTemperature(data.temperature) : update.temperature,
      updated_by: user?.users_id || null,
    });

    for (const file of toRemove) {
      await deleteFromS3(file.s3_key);
      await file.destroy();
    }
    await this._attachImages(update, job, files, user);

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId: job.job_id,
      module: MODULE_NAME,
      moduleId: update.job_daily_update_id,
      recordName: job.reference_number,
      action: "UPDATE",
      description: `Daily update for ${update.update_date} edited`,
    });

    return {
      success: true,
      data: await this._reload(update.job_daily_update_id),
      message: "Daily update saved successfully",
    };
  }

  async deleteDailyUpdate(updateId, user) {
    const { update, job } = await this._findStaffUpdate(updateId, user);
    if (!update) {
      return { success: false, statusCode: 404, message: "Daily update not found or unauthorized" };
    }

    const images = await db.DriveFile.findAll({
      where: { reference_id: updateId, reference_type: IMAGE_REFERENCE_TYPE },
    });
    for (const file of images) {
      await deleteFromS3(file.s3_key);
      await file.destroy();
    }

    const day = update.update_date;
    await update.destroy();

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId: job.job_id,
      module: MODULE_NAME,
      moduleId: updateId,
      recordName: job.reference_number,
      action: "DELETE",
      description: `Daily update for ${day} removed`,
    });

    return { success: true, message: "Daily update deleted successfully" };
  }

  // ── Contact (homebuyer) side ───────────────────────────────────────────────

  /**
   * Daily updates for one of the caller's own jobs, within [from, to].
   *
   * The job list comes back too so the dashboard can offer a picker when a
   * homebuyer has more than one build. A job id that is not theirs is answered
   * exactly like "no such job", so ids cannot be probed.
   */
  async getMyDailyUpdates(query, user) {
    const scope = this._contactJobScope(user);
    if (!scope) {
      return { success: false, statusCode: 404, message: "No build is linked to your account yet" };
    }

    if (query.from > query.to) {
      return { success: false, statusCode: 400, message: "From date must be on or before to date" };
    }
    if (dayDiff(query.from, query.to) > MAX_RANGE_DAYS) {
      return { success: false, statusCode: 400, message: `Date range cannot exceed ${MAX_RANGE_DAYS} days` };
    }

    const jobs = await db.Job.findAll({
      where: scope,
      attributes: ["job_id", "reference_number", "status"],
      order: [["created_at", "DESC"]],
    });
    if (!jobs.length) {
      return { success: false, statusCode: 404, message: "No build is linked to your account yet" };
    }

    const selected = query.job_id ? jobs.find((j) => j.job_id === query.job_id) : jobs[0];
    if (!selected) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const rows = await db.JobDailyUpdate.findAll({
      where: {
        job_id: selected.job_id,
        update_date: { [Op.between]: [query.from, query.to] },
      },
      include: [{ model: db.Users, as: "createdByUser", attributes: ["name", "initials"] }],
      order: [["update_date", "DESC"], ["created_at", "DESC"]],
    });

    // The most recent update ever posted, so an empty week can still say when
    // the builder last reported rather than just "nothing here".
    const latest = await db.JobDailyUpdate.findOne({
      where: { job_id: selected.job_id },
      attributes: ["update_date"],
      order: [["update_date", "DESC"]],
    });

    return {
      success: true,
      data: {
        jobs: jobs.map((j) => ({
          jobId: j.job_id,
          referenceNumber: j.reference_number,
          status: j.status,
        })),
        jobId: selected.job_id,
        from: query.from,
        to: query.to,
        lastUpdateDate: latest?.update_date ?? null,
        dailyUpdates: await this._payloads(rows),
      },
      message: "Daily updates fetched successfully",
    };
  }
}

export default new JobDailyUpdateService();
