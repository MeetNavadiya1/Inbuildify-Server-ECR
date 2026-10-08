import { Model, DataTypes } from "sequelize";

export class Actions extends Model {
  static associate(models) {
    // Actions.belongsTo(models.Leads, { foreignKey: "leads_id", as: "lead", onDelete: "CASCADE" });
    Actions.belongsTo(models.Location, { foreignKey: "location_id", as: "location", onDelete: "SET NULL" });
    Actions.belongsTo(models.Users, { foreignKey: "link_to_user", as: "linkToUser", onDelete: "SET NULL" });
    // Actions.hasMany(models.Sms, { foreignKey: "action_id", as: "sms" });
    // Actions.hasMany(models.Notes, { foreignKey: "action_id", as: "notes" });
  }
}

export default (sequelize) => {
  Actions.init(
    {
      action_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      leads_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      action_type: {
        type: DataTypes.STRING(50),
        allowNull: false,
        validate: {
          isIn: [["task", "note", "appointment", "sms"]],
        },
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      notes_tag_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      send_to_customer: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      create_follow_up_task: {
        type: DataTypes.BOOLEAN,
        allowNull: true,
      },
      attach_file: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      users_id: {
        type: DataTypes.ARRAY(DataTypes.UUID),
        defaultValue: [],
      },
      name: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      due_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      end_date: {
        type: DataTypes.DATEONLY,
        allowNull: true,
      },
      location_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      start_time: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      end_time: {
        type: DataTypes.TIME,
        allowNull: true,
      },
      priority: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      status: {
        type: DataTypes.STRING(255),
        allowNull: true,
      },
      link_to_user: {
        type: DataTypes.UUID,
        allowNull: true,
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
      tableName: "actions",
      modelName: "Actions",
      underscored: true,
      timestamps: true,
    },
  );
  return Actions;
};
