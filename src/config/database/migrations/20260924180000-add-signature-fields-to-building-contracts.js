"use strict";

/** @type {import('sequelize-cli').Migration} */
export async function up(queryInterface, Sequelize) {
  const tableInfo = await queryInterface.describeTable("building_contracts").catch(() => null);
  if (!tableInfo) return;

  if (!tableInfo.purchaser_witness_signature) {
    await queryInterface.addColumn("building_contracts", "purchaser_witness_signature", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }

  if (!tableInfo.builder_witness_signature) {
    await queryInterface.addColumn("building_contracts", "builder_witness_signature", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }

  if (!tableInfo.guarantor_full_name) {
    await queryInterface.addColumn("building_contracts", "guarantor_full_name", {
      type: Sequelize.STRING(200),
      allowNull: true,
    });
  }

  if (!tableInfo.guarantor_signature_image) {
    await queryInterface.addColumn("building_contracts", "guarantor_signature_image", {
      type: Sequelize.TEXT,
      allowNull: true,
    });
  }
}

export async function down(queryInterface) {
  const tableInfo = await queryInterface.describeTable("building_contracts").catch(() => null);
  if (!tableInfo) return;

  if (tableInfo.purchaser_witness_signature) {
    await queryInterface.removeColumn("building_contracts", "purchaser_witness_signature");
  }
  if (tableInfo.builder_witness_signature) {
    await queryInterface.removeColumn("building_contracts", "builder_witness_signature");
  }
  if (tableInfo.guarantor_full_name) {
    await queryInterface.removeColumn("building_contracts", "guarantor_full_name");
  }
  if (tableInfo.guarantor_signature_image) {
    await queryInterface.removeColumn("building_contracts", "guarantor_signature_image");
  }
}

export default { up, down };
