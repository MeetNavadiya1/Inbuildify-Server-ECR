import { Model, DataTypes } from "sequelize";

export class Notes extends Model {
  static associate(models) {
    Notes.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    Notes.belongsTo(models.Task, { foreignKey: "task_id", as: "task", onDelete: "SET NULL" });
    Notes.belongsTo(models.Notes, { foreignKey: "parent_note_id", as: "parentNote", onDelete: "SET NULL" });
    Notes.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  Notes.init(
    {
      notes_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      leads_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "leads",
          key: "leads_id",
        },
      },
      // When set, this note belongs to a job's Action timeline (not the lead's).
      job_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "job",
          key: "job_id",
        },
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      note_tag_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
        field: "note_tag_id",
      },
      send_to_customer: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "send_to_customer",
      },
      create_follow_up_task: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
        field: "create_follow_up_task",
      },
      task_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "task",
          key: "task_id",
        },
      },
      attach_file: {
        type: DataTypes.STRING(500),
        allowNull: true,
        field: "attach_file",
      },
      link_type: {
        type: DataTypes.STRING(255),
        allowNull: true,
        field: "link_type",
      },
      note_type: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: "note_type",
      },
      parent_note_id: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: "notes",
          key: "notes_id",
        },
        field: "parent_note_id",
      },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: {
        type: DataTypes.DATE,
        field: "created_at",
      },
      updatedAt: {
        type: DataTypes.DATE,
        field: "updated_at",
      },
    },
    {
      sequelize,
      tableName: "notes",
      modelName: "Notes",
      underscored: true,
      timestamps: true,
    },
  );
  return Notes;
};
