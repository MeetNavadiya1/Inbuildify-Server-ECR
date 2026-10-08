import { Model, DataTypes } from "sequelize";

export class FeaturFacade extends Model {
  static associate(models) {
    FeaturFacade.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    FeaturFacade.belongsTo(models.Builder, {
      foreignKey: "builder_id",
      as: "builder",
      onDelete: "CASCADE",
    });
    FeaturFacade.belongsTo(models.Facade, {
      foreignKey: "facade_id",
      as: "facade",
      onDelete: "SET NULL",
    });
    FeaturFacade.hasMany(models.FeaturedFacadeLead, { foreignKey: "featur_facade_id", as: "leads" });
    FeaturFacade.belongsTo(models.PlatformUser, {
      foreignKey: "reviewed_by",
      as: "reviewer",
      onDelete: "SET NULL",
    });
  }
}

/**
 * Where a promotion stands with the platform team.
 *
 * A builder featuring a facade is asking to appear on inBuildify's own landing
 * site, not their own, so the row waits here until an admin says yes. Only
 * `approved` reaches the public feed — `is_active` and the date window still
 * apply on top of it, and are the builder's to control.
 */
export const FEATUR_FACADE_APPROVAL = {
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
};

export const FEATUR_FACADE_APPROVAL_STATUSES = Object.values(FEATUR_FACADE_APPROVAL);

export default (sequelize) => {
  FeaturFacade.init(
    {
      featur_facade_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      start_date: { type: DataTypes.DATE, allowNull: true },
      end_date: { type: DataTypes.DATE, allowNull: true },
      is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
      is_delete: { type: DataTypes.BOOLEAN, defaultValue: false },
      facade_id: { type: DataTypes.UUID, allowNull: true },
      approval_status: {
        type: DataTypes.STRING(20),
        allowNull: false,
        defaultValue: FEATUR_FACADE_APPROVAL.PENDING,
      },
      reviewed_at: { type: DataTypes.DATE, allowNull: true },
      reviewed_by: { type: DataTypes.UUID, allowNull: true },
      review_note: { type: DataTypes.TEXT, allowNull: true },
      // Where this sits in the landing page's carousel, lowest first. One
      // sequence across every builder — the strip is a single row on our own
      // front page — and the admin console is the only thing that reorders it.
      display_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    },
    {
      sequelize,
      tableName: "featur_facade",
      modelName: "FeaturFacade",
      underscored: true,
    }
  );
  return FeaturFacade;
};
