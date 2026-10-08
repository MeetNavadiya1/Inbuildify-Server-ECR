import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";

class ContractorService {
  /**
   * Helper to resolve service ID by name
   */
  async resolveService(serviceName, builderId, transaction = null) {
    const { Service } = db;
    let service = await Service.findOne({
      where: {
        service: serviceName,
        [Op.or]: [{ builder_id: builderId }, { builder_id: { [Op.is]: null } }]
      },
      transaction
    });

    if (!service) {
      service = await Service.create(
        {
          service: serviceName,
          builder_id: builderId
        },
        { transaction }
      );
    }
    return service;
  }

  async createContractor(builderId, contractorData) {
    const { Contractor, Builder } = db;
    const { name, email, phone, address, service: serviceName } = contractorData;
    const lowerCaseEmail = email.toLowerCase();

    const transaction = await db.sequelize.transaction();

    try {
      // 1. Verify builder
      const builder = await Builder.findByPk(builderId, { transaction });
      if (!builder) {
        throw { status: 404, message: "Builder not found with the provided ID." };
      }

      // 2. Check duplicate email
      const existing = await Contractor.findOne({
        where: {
          email: db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("email")), lowerCaseEmail),
          builder_id: builderId,
          is_deleted: false
        },
        transaction
      });
      if (existing) {
        throw { status: 409, message: "Contractor with this email already exists for this builder." };
      }

      // 3. Resolve service
      const service = await this.resolveService(serviceName, builderId, transaction);

      // 4. Create contractor
      const contractor = await Contractor.create(
        {
          name,
          email: lowerCaseEmail,
          builder_id: builderId,
          phone,
          address,
          service_id: service.service_id
        },
        { transaction }
      );

      await transaction.commit();

      const result = contractor.get({ plain: true });
      result.service = serviceName;
      return result;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async getContractors(builderId) {
    const { Contractor, Service } = db;
    const contractors = await Contractor.findAll({
      where: { builder_id: builderId, is_deleted: false },
      include: [
        {
          model: Service,
          as: "service",
          attributes: ["service"]
        }
      ],
      order: [["created_at", "DESC"]]
    });

    return contractors.map(c => {
      const plain = c.get({ plain: true });
      plain.service = plain.service?.service || null;
      return plain;
    });
  }

  async getContractorById(id, builderId) {
    const { Contractor, Service } = db;
    const contractor = await Contractor.findOne({
      where: { contractor_id: id, builder_id: builderId, is_deleted: false },
      include: [
        {
          model: Service,
          as: "service",
          attributes: ["service"]
        }
      ]
    });

    if (!contractor) {
      throw { status: 404, message: "Contractor not found." };
    }

    const plain = contractor.get({ plain: true });
    plain.service = plain.service?.service || null;
    return plain;
  }

  async updateContractor(id, builderId, updates) {
    const { Contractor, Service } = db;
    const transaction = await db.sequelize.transaction();

    try {
      const contractor = await Contractor.findOne({
        where: { contractor_id: id, builder_id: builderId, is_deleted: false },
        transaction
      });

      if (!contractor) {
        throw { status: 404, message: "Contractor not found." };
      }

      // Handle service update
      if (updates.service) {
        const service = await Service.findOne({
          where: {
            service: updates.service,
            [Op.or]: [{ builder_id: builderId }, { builder_id: { [Op.is]: null } }]
          },
          transaction
        });

        if (!service) {
          throw { status: 400, message: `Service '${updates.service}' not found.` };
        }

        updates.service_id = service.service_id;
        delete updates.service;
      }

      await contractor.update(
        {
          ...updates,
          updatedAt: new Date()
        },
        { transaction }
      );

      await transaction.commit();

      // Refresh to get service name
      return await this.getContractorById(id, builderId);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }

  async deleteContractor(id, builderId) {
    const { Contractor } = db;
    const transaction = await db.sequelize.transaction();

    try {
      const contractor = await Contractor.findOne({
        where: { contractor_id: id, builder_id: builderId, is_deleted: false },
        transaction
      });

      if (!contractor) {
        throw { status: 404, message: "Contractor not found." };
      }

      await contractor.update({ is_deleted: true }, { transaction });
      await transaction.commit();
      return true;
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

export default new ContractorService();
