import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { logJobActivity, logJobUpdatedFieldNames } from "../../utils/jobActivityLogger.js";
import { Op } from "sequelize";

class JobDelayService {
  _tenantScope(user) {
    const builderId = user?.builder_id;
    const companyId = user?.company_id;

    const tenantScope = {
      [Op.or]: [
        { builder_id: builderId },
        { company_id: companyId ? companyId : { [Op.is]: null } },
      ],
    };

    if (builderId && !companyId) {
      tenantScope[Op.or] = [{ builder_id: builderId }];
    } else if (!builderId && companyId) {
      tenantScope[Op.or] = [{ company_id: companyId }];
    } else if (builderId && companyId) {
      tenantScope[Op.or] = [{ builder_id: builderId }, { company_id: companyId }];
    }
    return tenantScope;
  }

  async createJobDelay(jobId, data, user) {
    const { Job, JobDelay, Users } = db;
    const tenantScope = this._tenantScope(user);

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

      const sendMail = data.send_mail || false;
      const status = sendMail
        ? ["EMAIL SENT", "DATE RECALCULATED"]
        : ["EMAIL NOT SENT", "DATE NOT RECALCULATED"];

      const jobDelay = await JobDelay.create({
        job_id: jobId,
        company_id: user.company_id || job.company_id || null,
        builder_id: user.builder_id || job.builder_id || null,
        reason: data.reason,
        no_of_days: data.no_of_days,
        from_date: data.from_date,
        to_date: data.to_date,
        send_mail: sendMail,
        status,
        created_by: user.users_id,
        updated_by: user.users_id,
      });

      const createdDelay = await JobDelay.findOne({
        where: { job_delay_id: jobDelay.job_delay_id },
        include: [
          {
            model: Users,
            as: "createdByUser",
            attributes: ["name", "initials"],
          },
        ],
      });

      await logJobActivity(null, {
        userId: user?.users_id || null,
        jobId,
        module: "Job Delay",
        moduleId: jobDelay.job_delay_id,
        recordName: job.reference_number,
        action: "CREATE",
        description: `Delay notice added: ${data.no_of_days} day(s) — ${data.reason}`,
      });

      return {
        success: true,
        data: keysToCamelCase(createdDelay.get({ plain: true })),
        message: "Job delay notice created successfully",
      };
    } catch (error) {
      console.error("JobDelayService.createJobDelay error:", error);
      throw error;
    }
  }

  async getJobDelays(jobId, queryParams, user) {
    const { Job, JobDelay, Users } = db;
    const tenantScope = this._tenantScope(user);

    const {
      page = 1,
      limit = 10,
    } = queryParams;

    const pageValue = parseInt(page) || 1;
    const limitValue = parseInt(limit) || 10;
    const offset = (pageValue - 1) * limitValue;

    try {
      // First ensure the Job exists and is accessible
      const job = await Job.findOne({
        where: {
          job_id: jobId,
          ...tenantScope,
        },
      });

      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
      }

      const { count, rows } = await JobDelay.findAndCountAll({
        where: {
          job_id: jobId,
          ...tenantScope,
        },
        include: [
          {
            model: Users,
            as: "createdByUser",
            attributes: ["name", "initials"],
          },
        ],
        limit: limitValue,
        offset,
        order: [["created_at", "DESC"]],
      });

      const totalPages = Math.ceil(count / limitValue);

      return {
        success: true,
        data: {
          jobDelays: rows.map(row => keysToCamelCase(row.get({ plain: true }))),
          pagination: {
            page: pageValue,
            limit: limitValue,
            total: count,
            totalPages,
          },
        },
        message: "Job delays fetched successfully",
      };
    } catch (error) {
      console.error("JobDelayService.getJobDelays error:", error);
      throw error;
    }
  }

  async getJobDelayById(jobDelayId, user) {
    const { JobDelay } = db;
    const tenantScope = this._tenantScope(user);

    try {
      const jobDelay = await JobDelay.findOne({
        where: {
          job_delay_id: jobDelayId,
          ...tenantScope,
        },
      });

      if (!jobDelay) {
        return { success: false, statusCode: 404, message: "Job delay notice not found or unauthorized" };
      }

      return {
        success: true,
        data: keysToCamelCase(jobDelay.get({ plain: true })),
        message: "Job delay notice fetched successfully",
      };
    } catch (error) {
      console.error("JobDelayService.getJobDelayById error:", error);
      throw error;
    }
  }

  async updateJobDelay(jobDelayId, data, user) {
    const { JobDelay } = db;
    const tenantScope = this._tenantScope(user);

    try {
      const jobDelay = await JobDelay.findOne({
        where: {
          job_delay_id: jobDelayId,
          ...tenantScope,
        },
      });

      if (!jobDelay) {
        return { success: false, statusCode: 404, message: "Job delay notice not found or unauthorized" };
      }

      // Check if send_mail is being updated
      let newSendMail = jobDelay.send_mail;
      if (data.send_mail !== undefined) {
        newSendMail = data.send_mail;
      }

      // Automatically compute status based on updated send_mail
      const status = newSendMail
        ? ["EMAIL SENT", "DATE RECALCULATED"]
        : ["EMAIL NOT SENT", "DATE NOT RECALCULATED"];

      const updateFields = {
        reason: data.reason !== undefined ? data.reason : jobDelay.reason,
        no_of_days: data.no_of_days !== undefined ? data.no_of_days : jobDelay.no_of_days,
        from_date: data.from_date !== undefined ? data.from_date : jobDelay.from_date,
        to_date: data.to_date !== undefined ? data.to_date : jobDelay.to_date,
        send_mail: newSendMail,
        status,
        updated_by: user.users_id,
      };

      const oldDelayData = keysToCamelCase(jobDelay.get({ plain: true }));

      await jobDelay.update(updateFields);

      await logJobUpdatedFieldNames(null, {
        userId: user?.users_id || null,
        jobId: jobDelay.job_id,
        module: "Job Delay",
        moduleId: jobDelay.job_delay_id,
        recordName: "Delay Notice",
        oldData: oldDelayData,
        newData: keysToCamelCase(jobDelay.get({ plain: true })),
      });

      return {
        success: true,
        data: keysToCamelCase(jobDelay.get({ plain: true })),
        message: "Job delay notice updated successfully",
      };
    } catch (error) {
      console.error("JobDelayService.updateJobDelay error:", error);
      throw error;
    }
  }

  async deleteJobDelay(jobDelayId, user) {
    const { JobDelay } = db;
    const tenantScope = this._tenantScope(user);

    try {
      const jobDelay = await JobDelay.findOne({
        where: {
          job_delay_id: jobDelayId,
          ...tenantScope,
        },
      });

      if (!jobDelay) {
        return { success: false, statusCode: 404, message: "Job delay notice not found or unauthorized" };
      }

      const delayJobId = jobDelay.job_id;
      const delayDays = jobDelay.no_of_days;

      await jobDelay.destroy();

      if (delayJobId) {
        await logJobActivity(null, {
          userId: user?.users_id || null,
          jobId: delayJobId,
          module: "Job Delay",
          moduleId: jobDelayId,
          recordName: "Delay Notice",
          action: "DELETE",
          description: `Delay notice removed (${delayDays} day(s))`,
        });
      }

      return {
        success: true,
        message: "Job delay notice deleted successfully",
      };
    } catch (error) {
      console.error("JobDelayService.deleteJobDelay error:", error);
      throw error;
    }
  }
}

export default new JobDelayService();
