import { DataTypes } from "sequelize";

export default (sequelize) => {
  const DriveActivityLog = sequelize.define(
    "DriveActivityLog",
    {
      log_id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      company_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      user_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      action: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      entity_type: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      entity_id: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      entity_name: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      details: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // The before and after, as text — the same log carries file names,
      // booleans, folders and sizes, and the reader wants to see them rather
      // than compute on them. Null where an action has no "before" (an upload).
      old_value: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      new_value: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      // The role the actor held when they did it. A join to their current role
      // would rewrite history on every promotion, and "who was allowed to do
      // this, then?" is what an audit gets asked.
      actor_role: {
        type: DataTypes.STRING,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
      },
      updated_at: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "drive_activity_logs",
      modelName: "DriveActivityLog",
      underscored: true,
      timestamps: true,
    }
  );

  /**
   * Who did it.
   *
   * `required: false` wherever this is included, and no foreign key constraint:
   * an audit entry has to outlive the account that made it. Deleting a user must
   * not delete the record of what they did, and must not fail because of it.
   */
  DriveActivityLog.associate = (models) => {
    DriveActivityLog.belongsTo(models.Users, {
      foreignKey: "user_id",
      as: "actor",
      constraints: false,
    });
  };

  return DriveActivityLog;
};
