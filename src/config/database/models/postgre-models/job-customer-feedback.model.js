import { Model, DataTypes } from "sequelize";

export class JobCustomerFeedback extends Model {
  static associate(models) {
    JobCustomerFeedback.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobCustomerFeedback.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    JobCustomerFeedback.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    JobCustomerFeedback.belongsTo(models.Users, { foreignKey: "requested_by", as: "requestedByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobCustomerFeedback.init(
    {
      job_customer_feedback_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      template: {
        type: DataTypes.ENUM("Quality Feedback", "Customer sales Feedback"),
        allowNull: false,
      },
      status: {
        type: DataTypes.ENUM("Requested", "Completed", "Pending"),
        defaultValue: "Requested",
        allowNull: false,
      },
      requested_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      submitted_by: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      comments: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: DataTypes.DATE,
      },
      updatedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      sequelize,
      tableName: "job_customer_feedback",
      modelName: "JobCustomerFeedback",
      underscored: true,
    },
  );
  return JobCustomerFeedback;
};
