'use strict';

/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists('building_contracts');
    if (tableExists) return;

    await queryInterface.createTable('building_contracts', {
      building_contract_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      job_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'job', key: 'job_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      builder_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'builder', key: 'builder_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'company', key: 'company_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      pdf_file_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: { model: 'drive_files', key: 'file_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // Customer Details
      home_telephone: { type: Sequelize.STRING(50), allowNull: true },
      business_telephone: { type: Sequelize.STRING(50), allowNull: true },
      // Building Period
      actual_building_period: { type: Sequelize.INTEGER, allowNull: true },
      delay_weather: { type: Sequelize.INTEGER, allowNull: true },
      delay_breaks: { type: Sequelize.INTEGER, allowNull: true },
      delay_nature: { type: Sequelize.INTEGER, allowNull: true },
      total_building_period: { type: Sequelize.INTEGER, allowNull: true },
      // Building Works & Fees
      garage_size: { type: Sequelize.STRING(20), allowNull: true },
      spec_pages_count: { type: Sequelize.INTEGER, allowNull: true },
      number_of_pages_of_plans: { type: Sequelize.INTEGER, allowNull: true },
      paying_planning_approval: { type: Sequelize.STRING(100), allowNull: true },
      planning_approval_days: { type: Sequelize.INTEGER, allowNull: true },
      paying_builder_permit: { type: Sequelize.STRING(100), allowNull: true },
      builder_permit_days: { type: Sequelize.INTEGER, allowNull: true },
      contract_ended_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      progress_payment_days: { type: Sequelize.INTEGER, allowNull: true },
      late_interest: { type: Sequelize.STRING(100), allowNull: true },
      late_completion: { type: Sequelize.STRING(100), allowNull: true },
      extra_work_percent: { type: Sequelize.DECIMAL(5, 2), allowNull: true },
      delay_damage: { type: Sequelize.STRING(100), allowNull: true },
      bedroom: { type: Sequelize.INTEGER, allowNull: true },
      // Lending Info
      lending_body: { type: Sequelize.STRING(200), allowNull: true },
      lending_address: { type: Sequelize.STRING(300), allowNull: true },
      lending_finance_amount: { type: Sequelize.STRING(50), allowNull: true },
      lending_approval_days: { type: Sequelize.INTEGER, allowNull: true },
      // Building Insurer
      insurer: { type: Sequelize.STRING(200), allowNull: true },
      insurer_address1: { type: Sequelize.STRING(300), allowNull: true },
      insurer_address2: { type: Sequelize.STRING(300), allowNull: true },
      insurer_state: { type: Sequelize.STRING(100), allowNull: true },
      postcode: { type: Sequelize.STRING(20), allowNull: true },
      phone: { type: Sequelize.STRING(50), allowNull: true },
      name_of_insured: { type: Sequelize.STRING(200), allowNull: true },
      // Company & Surveyor
      company_name: { type: Sequelize.STRING(200), allowNull: true },
      abn: { type: Sequelize.STRING(50), allowNull: true },
      surveyor_name: { type: Sequelize.STRING(200), allowNull: true },
      // Land Details
      site_address: { type: Sequelize.TEXT, allowNull: true },
      volume_number: { type: Sequelize.STRING(100), allowNull: true },
      folio_number: { type: Sequelize.STRING(100), allowNull: true },
      plan_of_subdivision_number: { type: Sequelize.STRING(200), allowNull: true },
      covenants_restrictions_easements: { type: Sequelize.TEXT, allowNull: true },
      // Contract Price
      price_excluding_gst: { type: Sequelize.STRING(50), allowNull: true },
      gst_on_the_price: { type: Sequelize.STRING(50), allowNull: true },
      contract_price_including_gst: { type: Sequelize.STRING(50), allowNull: true },
      months_price_fixed: { type: Sequelize.INTEGER, allowNull: true },
      // Deposit
      deposit_due: { type: Sequelize.STRING(50), allowNull: true },
      deposit_paid: { type: Sequelize.STRING(50), allowNull: true },
      // Progress Payment
      progress_method: { type: Sequelize.STRING(20), allowNull: true },
      progress_payment_stages: { type: Sequelize.JSONB, allowNull: true },
      // Signatory
      purchaser1_full_name: { type: Sequelize.STRING(200), allowNull: true },
      purchaser2_full_name: { type: Sequelize.STRING(200), allowNull: true },
      purchaser_witness_full_name: { type: Sequelize.STRING(200), allowNull: true },
      purchaser_witness_email: { type: Sequelize.STRING(200), allowNull: true },
      purchaser_witness_address: { type: Sequelize.TEXT, allowNull: true },
      builder_witness_same: { type: Sequelize.BOOLEAN, defaultValue: false },
      builder_witness_full_name: { type: Sequelize.STRING(200), allowNull: true },
      builder_witness_email: { type: Sequelize.STRING(200), allowNull: true },
      builder_witness_address: { type: Sequelize.TEXT, allowNull: true },
      guarantor_signature: { type: Sequelize.BOOLEAN, defaultValue: false },
      contract_signed_date: { type: Sequelize.DATEONLY, allowNull: true },
      contract_expiry_date: { type: Sequelize.DATEONLY, allowNull: true },
      special_conditions: { type: Sequelize.JSONB, allowNull: true },
      checklist_answers: { type: Sequelize.JSONB, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.literal('NOW()') },
    });

    await queryInterface.addIndex('building_contracts', ['job_id'], { unique: true, name: 'building_contracts_job_id_unique' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('building_contracts');
  },
};
