import { Model, DataTypes } from "sequelize";

/**
 * A request for extra days on a job workflow task.
 *
 * Lifecycle: PENDING on send -> APPROVED or REJECTED when the first recipient
 * responds from the emailed link. Approving grows the task's `no_of_days` by
 * `extension_days` and re-derives the job's schedule; rejecting only records
 * the outcome.
 */
export class JobTaskExtensionRequest extends Model {
  static associate(models) {
    JobTaskExtensionRequest.belongsTo(models.JobTask, { foreignKey: "task_id", as: "task", onDelete: "CASCADE" });
    JobTaskExtensionRequest.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobTaskExtensionRequest.belongsTo(models.Users, { foreignKey: "requested_by", as: "requestedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobTaskExtensionRequest.init(
    {
      job_task_extension_request_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      task_id: { type: DataTypes.UUID, allowNull: false },
      job_id: { type: DataTypes.UUID, allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },

      subject: { type: DataTypes.STRING(255), allowNull: true },
      // The HTML message the builder composed in the panel before sending.
      email_body: { type: DataTypes.TEXT, allowNull: true },
      reason: { type: DataTypes.TEXT, allowNull: false },
      // extension_days = what the builder asked for.
      // approved_days  = what the responder actually granted (null until decided,
      //                  and left null on a rejection).
      extension_days: { type: DataTypes.INTEGER, allowNull: false },
      approved_days: { type: DataTypes.INTEGER, allowNull: true },
      // Snapshots of the task duration and the cap derived from it at request
      // time — both can move afterwards, so the record keeps its own copy.
      requested_duration_days: { type: DataTypes.INTEGER, allowNull: true },
      max_extension_days: { type: DataTypes.INTEGER, allowNull: true },

      recipients: { type: DataTypes.JSONB, allowNull: true },
      attachments: { type: DataTypes.JSONB, allowNull: true },

      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "PENDING" },
      response_comments: { type: DataTypes.STRING(1000), allowNull: true },
      responded_by_email: { type: DataTypes.STRING(255), allowNull: true },
      responded_at: { type: DataTypes.DATE, allowNull: true },

      requested_by: { type: DataTypes.UUID, allowNull: true },
      sent_at: { type: DataTypes.DATE, allowNull: true },

      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "job_task_extension_request",
      modelName: "JobTaskExtensionRequest",
      underscored: true,
    },
  );
  return JobTaskExtensionRequest;
};
