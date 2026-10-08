/** @type {import('sequelize-cli').Migration} */
export default {
  async up(queryInterface, Sequelize) {
    const tableExists = await queryInterface.tableExists('drive_shares');
    if (tableExists) return;

    await queryInterface.createTable('drive_shares', {
      share_id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.literal('gen_random_uuid()'),
        primaryKey: true,
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'company', key: 'company_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      entity_type: {
        type: Sequelize.STRING,
        allowNull: false, // FOLDER or FILE
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: false,
      },
      shared_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'users_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      shared_with_user: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'users_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      permission_level: {
        type: Sequelize.STRING,
        allowNull: false, // VIEW, EDIT, ADMIN
      },
      created_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
      updated_at: {
        allowNull: false,
        type: Sequelize.DATE,
      },
    });

    // Add indexes for quick lookups and inheritance evaluations
    await queryInterface.addIndex('drive_shares', ['company_id']);
    await queryInterface.addIndex('drive_shares', ['shared_with_user']);
    await queryInterface.addIndex('drive_shares', ['entity_type', 'entity_id']);
    
    // Prevent duplicate shares for the same user on the same entity
    await queryInterface.addIndex('drive_shares', ['entity_type', 'entity_id', 'shared_with_user'], {
      unique: true,
      name: 'unique_share_per_user_entity'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('drive_shares');
  },
};
