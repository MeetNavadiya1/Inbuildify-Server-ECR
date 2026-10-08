import { Model, DataTypes } from "sequelize";

export class Users extends Model {
  static associate(models) {
    Users.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    Users.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    Users.belongsTo(models.Role, { foreignKey: "role_id", as: "role" });
    Users.belongsTo(models.Users, { foreignKey: "reporting_to", as: "reportingToUser" });
    Users.belongsTo(models.Address, { foreignKey: "address_id", as: "address" });
    Users.hasMany(models.UsersToken, { foreignKey: "user_id", as: "tokens" });
    Users.hasMany(models.UserPasswordHistory, { foreignKey: "user_id", as: "passwordHistory" });
    Users.hasMany(models.UserRoleMapping, { foreignKey: "user_id", as: "roleMappings" });
    Users.hasMany(models.UserSocialAccount, { foreignKey: "user_id", as: "socialAccounts" });
  }
}
export default (sequelize) => {
  Users.init({
    users_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
    // Either company_id (Company Administrator at company level) or
    // builder_id (everyone else, scoped under a specific Builder) must be set.
    builder_id: { type: DataTypes.UUID, allowNull: true },
    company_id: { type: DataTypes.UUID, allowNull: true },
    name: { type: DataTypes.STRING(100), allowNull: false },
    email: { type: DataTypes.STRING(100), allowNull: false },
    password: { type: DataTypes.STRING(255), allowNull: true },
    auth_provider: { type: DataTypes.ENUM("local", "google", "apple"), defaultValue: "local", allowNull: false },
    is_verified: { type: DataTypes.BOOLEAN, defaultValue: false },
    role_id: { type: DataTypes.UUID, allowNull: true },
    root_user: { type: DataTypes.BOOLEAN, defaultValue: false },
    otp: { type: DataTypes.STRING(10), allowNull: true },
    expires_at: { type: DataTypes.DATE, allowNull: true },
    reset_password_token: { type: DataTypes.STRING(255), allowNull: true },
    reset_token_expires_at: { type: DataTypes.DATE, allowNull: true },
    login_id: { type: DataTypes.STRING(100), allowNull: true },
    initials: { type: DataTypes.STRING(10), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    secondary_phone: { type: DataTypes.STRING(20), allowNull: true },
    reporting_to: { type: DataTypes.UUID, allowNull: true },
    designation: { type: DataTypes.STRING(100), allowNull: true },
    date_of_joining: { type: DataTypes.DATEONLY, allowNull: true },
    remark: { type: DataTypes.TEXT, allowNull: true },
    date_of_birth: { type: DataTypes.DATEONLY, allowNull: true },
    consultant_bio: { type: DataTypes.TEXT, allowNull: true },
    photo: { type: DataTypes.STRING(500), allowNull: true },
    signature: { type: DataTypes.STRING(500), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
    is_locked: { type: DataTypes.BOOLEAN, defaultValue: false },
    next_login_password_change: { type: DataTypes.BOOLEAN, defaultValue: false },
    password_auto_generated: { type: DataTypes.BOOLEAN, defaultValue: false },
    email_login_credentials: { type: DataTypes.BOOLEAN, defaultValue: false },
    address_id: { type: DataTypes.UUID, allowNull: true },
    use_company_address: { type: DataTypes.BOOLEAN, defaultValue: false },
    has_login: { type: DataTypes.BOOLEAN, defaultValue: true },
    failed_attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_deleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    otp_resend_count: { type: DataTypes.INTEGER, allowNull: true },
    last_otp_sent_at: { type: DataTypes.DATE, allowNull: true },
    // Flags rows the sample-data seeder created (Settings → Sample Data).
    is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
    // Whose sample data this row is. Scopes Settings → Sample Data to one
    // account: every user under a company shares its builder_id.
    sample_data_owner_id: { type: DataTypes.UUID, allowNull: true },
    createdAt: { type: DataTypes.DATE },
    updatedAt: { type: DataTypes.DATE },
  }, { sequelize, tableName: "users", modelName: "Users", underscored: true });
  return Users;
};
