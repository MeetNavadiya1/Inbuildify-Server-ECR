import { Model, DataTypes } from "sequelize";

export class JobColorSelection extends Model {
  static associate(models) {
    JobColorSelection.belongsTo(models.Job, {
      foreignKey: "job_id",
      as: "job",
      onDelete: "CASCADE",
    });
  }
}

export default (sequelize) => {
  JobColorSelection.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      job_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      color_item_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      // Per-selection detail captured on the job's colour screen — the unit the
      // customer picked for this item, a free-text note, and whether the item
      // should be highlighted in the generated colour PDF.
      unit: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      pdf_highlight: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "job_color_selection",
      modelName: "JobColorSelection",
      underscored: true,
    }
  );
  return JobColorSelection;
};
