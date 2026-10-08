import db from "../../config/database/models/postgre-models/index.js";

export async function createJobWorkflowSettingService(data, user, t) {
  const { JobWorkflowSettings } = db;
  const { builder_id, company_id, user_id } = user;

  const existing = await JobWorkflowSettings.findOne({
    where: { builder_id, company_id },
    transaction: t,
  });

  if (existing) {
    throw new Error("Job workflow settings already exist");
  }

  return await JobWorkflowSettings.create(
    {
      company_id,
      builder_id,
      show_all_tasks_to_all_roles: data.show_all_tasks_to_all_roles ?? false,
      include_weekend_date: data.include_weekend_date ?? false,
      include_holiday_date: data.include_holiday_date ?? false,
      recalculate_estimated_end_dates_future_tasks:
        data.recalculate_estimated_end_dates_future_tasks ?? false,
      recalculate_estimated_dates_based_on_actual_changes:
        data.recalculate_estimated_dates_based_on_actual_changes ?? false,
      created_by: user_id,
      updated_by: user_id,
    },
    { transaction: t },
  );
}

export async function updateJobWorkflowSettingService(data, user, t) {
  const { JobWorkflowSettings } = db;
  const { builder_id, company_id, user_id } = user;

  const record = await JobWorkflowSettings.findOne({
    where: { builder_id, company_id },
    transaction: t,
  });

  if (!record) {
    throw new Error("Job workflow settings not found");
  }

  const updateFields = {};

  Object.keys(data).forEach((key) => {
    if (data[key] !== undefined) {
      updateFields[key] = data[key];
    }
  });

  if (Object.keys(updateFields).length === 0) {
    throw new Error("No valid fields provided for update");
  }

  updateFields.updated_by = user_id;

  await record.update(updateFields, { transaction: t });

  return record;
}

export async function getJobWorkflowSettingService(user, t) {
  const { JobWorkflowSettings } = db;
  const { company_id, builder_id, user_id } = user;

  const [record] = await JobWorkflowSettings.findOrCreate({
    where: { company_id, builder_id },
    defaults: {
      company_id,
      builder_id,
      created_by: user_id,
      updated_by: user_id,
    },
    transaction: t,
  });

  return record;
}
