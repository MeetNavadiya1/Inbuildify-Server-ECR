import { Model, DataTypes } from "sequelize";

export class Checklist extends Model {
  static associate(models) {
    // ✅ existing correct ones
    Checklist.belongsTo(models.Builder, {
      foreignKey: "builder_id",
      as: "builder",
    });

    Checklist.belongsTo(models.Users, {
      foreignKey: "created_by",
      as: "createdByUser", onDelete: "SET NULL"
    });

    Checklist.belongsTo(models.Users, {
      foreignKey: "updated_by",
      as: "updatedByUser", onDelete: "SET NULL"
    });

    Checklist.hasMany(models.ChecklistItem, {
      foreignKey: "checklist_id",
      as: "checklistItems",
    });

    // ✅ MISSING ones — add these
    Checklist.belongsTo(models.Screen, {
      foreignKey: "screen_id",
      as: "screen", onDelete: "CASCADE"
    });

    Checklist.belongsTo(models.Functionality, {
      foreignKey: "functionality_id",
      as: "functionality", onDelete: "CASCADE"
    });
  }
}

export default (sequelize) => {
  Checklist.init(
    {
      checklist_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      builder_id: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      name: {
        type: DataTypes.STRING(150),
        allowNull: false,
      },

      // ✅ add references here too
      screen_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "screen",
          key: "screen_id",
        },
      },
      functionality_id: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: "functionality",
          key: "functionality_id",
        },
      },

      is_active: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      is_deleted: {
        type: DataTypes.BOOLEAN,
        defaultValue: false,
      },
      created_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      updated_by: {
        type: DataTypes.UUID,
        allowNull: true,
      },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "checklist",
      modelName: "Checklist",
      underscored: true,
    },
  );

  return Checklist;
};
