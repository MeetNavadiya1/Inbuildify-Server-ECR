import db from "../config/database/models/postgre-models/index.js";

const getMailTemplate = async (templateKey) => {
  try {
    const { EmailTemplates } = db;
    const options = { raw: true };

    if (templateKey) {
      options.where = { template_key: templateKey };
      options.limit = 1;
    }

    const result = await EmailTemplates.findAll(options);
    return result;
  } catch (error) {
    console.error("Get email templates error:", error);
    throw error;
  }
};

export default getMailTemplate;
