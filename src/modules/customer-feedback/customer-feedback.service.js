import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Op } from "sequelize";
import { logJobActivity, compareAndLogJobUpdates } from "../../utils/jobActivityLogger.js";

class CustomerFeedbackService {
  async createCustomerFeedback(jobId, template, user) {
    const { Job, JobCustomerFeedback } = db.sequelize.models;
    const tenantScope = this._buildTenantScope(user);

    try {
      const job = await Job.findOne({ where: { job_id: jobId, ...tenantScope } });
      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or access denied" };
      }

      const feedback = await JobCustomerFeedback.create({
        job_id: jobId,
        company_id: job.company_id || null,
        builder_id: job.builder_id || null,
        template,
        status: "Requested",
        requested_by: user?.users_id || user?.user_id || null,
        submitted_by: null,
        comments: null,
      });

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId,
        module: "Customer Feedback",
        moduleId: feedback.job_customer_feedback_id,
        recordName: template,
        action: "CREATE",
        description: `Requested customer feedback template: ${template}`,
      });

      return {
        success: true,
        data: keysToCamelCase(feedback.get({ plain: true })),
      };
    } catch (error) {
      console.error("CustomerFeedbackService.createCustomerFeedback error:", error);
      throw error;
    }
  }

  async getCustomerFeedbackList(jobId, user) {
    const { Job, JobCustomerFeedback, Users, Opportunity, Leads } = db.sequelize.models;
    const tenantScope = this._buildTenantScope(user);

    try {
      const job = await Job.findOne({
        where: { job_id: jobId, ...tenantScope },
        include: [
          {
            model: Opportunity,
            as: "opportunity",
            include: [
              {
                model: Leads,
                as: "lead",
                attributes: ["name"],
              },
            ],
          },
        ],
      });
      if (!job) {
        return { success: false, statusCode: 404, message: "Job not found or access denied" };
      }

      const leadName = job.opportunity?.lead?.name || "Unknown";

      const list = await JobCustomerFeedback.findAll({
        where: { job_id: jobId },
        order: [["created_at", "DESC"]],
      });

      const formatted = list.map(item => {
        const plain = item.get({ plain: true });
        // Derive initials
        const requestedByInitials = leadName ? leadName.split(" ").map(n => n[0]).join("").toUpperCase() : "U";
        const date = new Date(plain.createdAt);
        const requestedByDate = date.toLocaleDateString("en-GB").replace(/\//g, "-");
        const updateDate = new Date(plain.updatedAt);
        const submittedByDate = plain.submitted_by ? updateDate.toLocaleDateString("en-GB").replace(/\//g, "-") : "";

        return {
          key: plain.job_customer_feedback_id,
          template: plain.template,
          status: plain.status,
          requestedByInitials,
          requestedByDate,
          submittedBy: plain.submitted_by || "",
          submittedByDate,
          comments: plain.comments || "",
          requestedByUserName: leadName,
        };
      });

      return {
        success: true,
        data: formatted,
      };
    } catch (error) {
      console.error("CustomerFeedbackService.getCustomerFeedbackList error:", error);
      throw error;
    }
  }

  async updateCustomerFeedback(feedbackId, updateData, user) {
    const { JobCustomerFeedback } = db.sequelize.models;

    try {
      const feedback = await JobCustomerFeedback.findByPk(feedbackId);
      if (!feedback) {
        return { success: false, statusCode: 404, message: "Feedback not found" };
      }

      const oldDataForLog = keysToCamelCase(feedback.get({ plain: true }));

      const { comments, submitted_by, status } = updateData;
      const updates = {};
      if (comments !== undefined) updates.comments = comments;
      if (submitted_by !== undefined) updates.submitted_by = submitted_by;
      if (status !== undefined) updates.status = status;

      await feedback.update(updates);

      const updatedDataForLog = keysToCamelCase(feedback.get({ plain: true }));

      await compareAndLogJobUpdates(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId: feedback.job_id,
        module: "Customer Feedback",
        moduleId: feedbackId,
        recordName: feedback.template,
        oldData: oldDataForLog,
        newData: updatedDataForLog,
      });

      return {
        success: true,
        data: keysToCamelCase(feedback.get({ plain: true })),
      };
    } catch (error) {
      console.error("CustomerFeedbackService.updateCustomerFeedback error:", error);
      throw error;
    }
  }

  async deleteCustomerFeedback(feedbackId, user) {
    const { JobCustomerFeedback } = db.sequelize.models;

    try {
      const feedback = await JobCustomerFeedback.findByPk(feedbackId);
      if (!feedback) {
        return { success: false, statusCode: 404, message: "Feedback not found" };
      }

      await feedback.destroy();

      await logJobActivity(null, {
        userId: user?.users_id || user?.user_id || null,
        jobId: feedback.job_id,
        module: "Customer Feedback",
        moduleId: feedbackId,
        recordName: feedback.template,
        action: "DELETE",
        description: `Deleted customer feedback template: ${feedback.template}`,
      });

      return {
        success: true,
        data: { jobCustomerFeedbackId: feedbackId },
      };
    } catch (error) {
      console.error("CustomerFeedbackService.deleteCustomerFeedback error:", error);
      throw error;
    }
  }

  _buildTenantScope(user) {
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
}

export default new CustomerFeedbackService();
