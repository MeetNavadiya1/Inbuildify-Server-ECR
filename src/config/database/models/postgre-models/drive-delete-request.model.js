import { Model, DataTypes } from "sequelize";

/**
 * A request to delete a shared drive item, awaiting its owner's approval.
 *
 * Lifecycle: PENDING when a user the item was shared with (EDIT or ADMIN) asks
 * for it to be deleted -> APPROVED or REJECTED when the owner answers from the
 * emailed link. Approving moves the item to Trash, exactly as the owner's own
 * Delete would; rejecting only records the outcome.
 *
 * The owner alone decides, so there is no recipient list — see
 * drive-delete-request.service.js for the rule that picks them.
 */
export class DriveDeleteRequest extends Model {
  static associate(models) {
    DriveDeleteRequest.belongsTo(models.Users, { foreignKey: "requested_by", as: "requestedByUser", onDelete: "SET NULL" });
    DriveDeleteRequest.belongsTo(models.Users, { foreignKey: "owner_id", as: "ownerUser", onDelete: "SET NULL" });
  }
}

export default (sequelize) => {
  DriveDeleteRequest.init(
    {
      drive_delete_request_id: {
        type: DataTypes.UUID,
        defaultValue: sequelize.literal("gen_random_uuid()"),
        primaryKey: true,
      },
      company_id: { type: DataTypes.UUID, allowNull: false },

      // "FOLDER" | "FILE" — the two tables a drive item can live in.
      entity_type: { type: DataTypes.STRING(10), allowNull: false },
      entity_id: { type: DataTypes.UUID, allowNull: false },
      // Snapshot: the item may be renamed, or gone, by the time this is read.
      entity_name: { type: DataTypes.STRING(255), allowNull: true },

      reason: { type: DataTypes.TEXT, allowNull: true },

      requested_by: { type: DataTypes.UUID, allowNull: true },
      owner_id: { type: DataTypes.UUID, allowNull: true },
      owner_email: { type: DataTypes.STRING(255), allowNull: true },

      // The emailed link's secret — see the migration for why it exists.
      access_token: {
        type: DataTypes.UUID,
        allowNull: false,
        defaultValue: sequelize.literal("gen_random_uuid()"),
      },

      status: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "PENDING" },
      response_comments: { type: DataTypes.STRING(1000), allowNull: true },
      responded_by_email: { type: DataTypes.STRING(255), allowNull: true },
      responded_at: { type: DataTypes.DATE, allowNull: true },

      sent_at: { type: DataTypes.DATE, allowNull: true },

      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    {
      sequelize,
      tableName: "drive_delete_request",
      modelName: "DriveDeleteRequest",
      underscored: true,
    },
  );
  return DriveDeleteRequest;
};
