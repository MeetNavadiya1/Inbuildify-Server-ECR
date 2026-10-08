'use strict';

export const up = async (queryInterface, Sequelize) => {
    const [results] = await queryInterface.sequelize.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public'
        AND table_name = 'lead_activity_log'
      );
    `);

    if (results[0].exists) {
      await queryInterface.sequelize.query(`
        INSERT INTO activity_logs (
          activity_log_id,
          reference_id,
          reference_type,
          user_id,
          module,
          module_id,
          record_name,
          action,
          field_name,
          old_value,
          new_value,
          description,
          metadata,
          created_at,
          updated_at
        )
        SELECT 
          lead_activity_log_id,
          leads_id,
          'LEAD',
          user_id,
          module,
          module_id,
          record_name,
          action,
          field_name,
          old_value,
          new_value,
          description,
          metadata,
          created_at,
          created_at
        FROM lead_activity_log
        WHERE leads_id IS NOT NULL;
      `);
    }
};

export const down = async (queryInterface, Sequelize) => {
  // Revert the migration by deleting records that came from lead_activity_log
  await queryInterface.sequelize.query(`
    DELETE FROM activity_logs WHERE reference_type = 'LEAD';
  `);
};
