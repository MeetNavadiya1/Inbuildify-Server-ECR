import { Model, DataTypes } from "sequelize";

/**
 * One row per checklist line on one job — see the migration
 * 20260730140000-create-job-checklist-item.js for why the definition and the
 * response live together.
 */
export class JobChecklistItem extends Model {
  static associate(models) {
    JobChecklistItem.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    JobChecklistItem.belongsTo(models.Checklist, { foreignKey: "checklist_id", as: "checklist", onDelete: "SET NULL" });
    JobChecklistItem.belongsTo(models.ChecklistItem, { foreignKey: "checklist_item_id", as: "masterItem", onDelete: "SET NULL" });
    JobChecklistItem.belongsTo(models.Users, { foreignKey: "completed_by", as: "completedByUser", onDelete: "SET NULL" });
    JobChecklistItem.belongsTo(models.Users, { foreignKey: "created_by", as: "createdByUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  JobChecklistItem.init(
    {
      job_checklist_item_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      job_id: { type: DataTypes.UUID, allowNull: false },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      // The master checklist / item this was seeded from. Null for items typed
      // straight into the job's drawer.
      checklist_id: { type: DataTypes.UUID, allowNull: true },
      checklist_item_id: { type: DataTypes.UUID, allowNull: true },
      // ── definition (mirrors checklist_item) ──
      description: { type: DataTypes.STRING(500), allowNull: false },
      // Whether this line accepts a free-text note (the "Notes" toggle).
      notes: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      is_required: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      type: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "checkbox" },
      sort: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
      // ── response ──
      // checkbox → "checked"; dropdown → "Yes" | "No" | "N/A"; null = unanswered.
      response: { type: DataTypes.STRING(20), allowNull: true },
      note: { type: DataTypes.TEXT, allowNull: true },
      is_completed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
      completed_by: { type: DataTypes.UUID, allowNull: true },
      completed_at: { type: DataTypes.DATE, allowNull: true },
      created_by: { type: DataTypes.UUID, allowNull: true },
      updated_by: { type: DataTypes.UUID, allowNull: true },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "job_checklist_item", modelName: "JobChecklistItem", underscored: true },
  );
  return JobChecklistItem;
};
