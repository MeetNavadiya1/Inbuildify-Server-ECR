'use strict';

/**
 * Extend construction_stage to support the dynamic Stages system:
 *  - workflow_type  → PRE_CONSTRUCTION | CONSTRUCTION
 *  - icon           → optional icon name/key
 *  - status         → active | inactive (catalog stage on/off)
 *  - is_system      → true for seeded default stages
 *
 * construction_type_id is also relaxed to nullable so a stage can belong to a
 * workflow without being tied to a specific construction type.
 */
export default {
  up: async (queryInterface, Sequelize) => {
    const table = await queryInterface.describeTable('construction_stage');

    if (!table.workflow_type) {
      await queryInterface.addColumn('construction_stage', 'workflow_type', {
        type: Sequelize.STRING(30),
        allowNull: false,
        defaultValue: 'CONSTRUCTION',
      });
    }

    if (!table.icon) {
      await queryInterface.addColumn('construction_stage', 'icon', {
        type: Sequelize.STRING(100),
        allowNull: true,
      });
    }

    if (!table.status) {
      await queryInterface.addColumn('construction_stage', 'status', {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: 'active',
      });
    }

    if (!table.is_system) {
      await queryInterface.addColumn('construction_stage', 'is_system', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }

    // Relax construction_type_id to nullable (workflow-level stages).
    await queryInterface.changeColumn('construction_stage', 'construction_type_id', {
      type: Sequelize.UUID,
      allowNull: true,
    });

    await queryInterface.addIndex('construction_stage', ['workflow_type'], {
      name: 'construction_stage_workflow_type_idx',
    }).catch(() => {});
  },

  down: async (queryInterface) => {
    await queryInterface.removeIndex('construction_stage', 'construction_stage_workflow_type_idx').catch(() => {});
    const table = await queryInterface.describeTable('construction_stage');
    if (table.workflow_type) await queryInterface.removeColumn('construction_stage', 'workflow_type');
    if (table.icon) await queryInterface.removeColumn('construction_stage', 'icon');
    if (table.status) await queryInterface.removeColumn('construction_stage', 'status');
    if (table.is_system) await queryInterface.removeColumn('construction_stage', 'is_system');
  },
};
