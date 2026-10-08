import { Model, DataTypes } from "sequelize";

export class SurveyResponse extends Model {
  static associate(models) {
    SurveyResponse.belongsTo(models.SurveyTemplate, { foreignKey: "survey_template_id", as: "surveyTemplate", onDelete: "CASCADE" });
    SurveyResponse.belongsTo(models.Leads, { foreignKey: "lead_id", as: "lead", onDelete: "CASCADE" });
    SurveyResponse.belongsTo(models.Job, { foreignKey: "job_id", as: "job", onDelete: "CASCADE" });
    SurveyResponse.belongsTo(models.Company, { foreignKey: "company_id", as: "company", onDelete: "CASCADE" });
    SurveyResponse.belongsTo(models.Builder, { foreignKey: "builder_id", as: "builder", onDelete: "CASCADE" });
    SurveyResponse.belongsTo(models.Users, { foreignKey: "sent_by", as: "sentByUser", onDelete: "SET NULL" });
    SurveyResponse.hasMany(models.SurveyResponseAnswer, { foreignKey: "survey_response_id", as: "answers", onDelete: "CASCADE" });
  }
}

export default (sequelize) => {
  SurveyResponse.init(
    {
      survey_response_id: { type: DataTypes.UUID, defaultValue: sequelize.literal("gen_random_uuid()"), primaryKey: true },
      survey_template_id: { type: DataTypes.UUID, allowNull: false },
      lead_id: { type: DataTypes.UUID, allowNull: false },
      job_id: { type: DataTypes.UUID, allowNull: true },
      company_id: { type: DataTypes.UUID, allowNull: true },
      builder_id: { type: DataTypes.UUID, allowNull: true },
      recipient_name: { type: DataTypes.STRING(255), allowNull: true },
      recipient_email: { type: DataTypes.STRING(255), allowNull: false },
      access_token: { type: DataTypes.STRING(255), allowNull: false, unique: true },
      status: { type: DataTypes.ENUM("Sent", "Opened", "Completed"), allowNull: false, defaultValue: "Sent" },
      sent_by: { type: DataTypes.UUID, allowNull: true },
      submitted_at: { type: DataTypes.DATE, allowNull: true },
      // Flags rows the sample-data seeder created (Settings → Sample Data).
      is_sample_data: { type: DataTypes.BOOLEAN, defaultValue: false, allowNull: false },
      createdAt: { type: DataTypes.DATE },
      updatedAt: { type: DataTypes.DATE },
    },
    { sequelize, tableName: "survey_response", modelName: "SurveyResponse", underscored: true },
  );
  return SurveyResponse;
};
