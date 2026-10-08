import { createOrUpdateAddress } from "../../repositories/address.repository.js";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";

export async function getCompanyService({ builderId, companyId }) {

  const company = await getCompanyWithAddress(builderId, companyId);

  if (!company) {
    const error = new Error("Company not found");
    error.status = 404;
    throw error;
  }

  return company;
}

// ── Attach timezone array [id, name] to plain company object ─────────────────
async function attachTimezone(companyPlain, t) {
  if (!companyPlain) {
    return null;
  }

  if (companyPlain.timezone_id) {
    const tz = await db.Timezones.findOne({
      where: { timezone_id: companyPlain.timezone_id },
      attributes: ["timezone_id", "timezone_name"],
      transaction: t,
    });
    companyPlain.timezone = tz ? [tz.timezone_id, tz.timezone_name] : null;
  } else {
    companyPlain.timezone = null;
  }

  return keysToCamelCase(companyPlain);
}

// ── Fetch company with nested address ────────────────────────────────────────
async function getCompanyWithAddress(builderId, companyId, t) {
  const where = {};
  if (builderId) {
    where.builder_id = builderId;
  } else if (companyId) {
    where.company_id = companyId;
  } else {
    return null;
  }

  const company = await db.Company.findOne({
    where,
    include: [
      {
        association: "address",
        attributes: ["address_line1", "address_line2", "city", "state_id", "country_id", "zip_code"],
      },
    ],
    transaction: t,
  });

  if (!company) {
    return null;
  }

  const plain = company.toJSON();

  if (plain.address_id && plain.address) {
    plain.address = {
      address_line1: plain.address.address_line1,
      address_line2: plain.address.address_line2,
      city: plain.address.city,
      state_id: plain.address.state_id,
      country_id: plain.address.country_id,
      zip_code: plain.address.zip_code,
    };
  }

  return attachTimezone(plain, t);
}

// // ── Main upsert service ───────────────────────────────────────────────────────
// export async function upsertCompanyService(builderId, payload,) {
//   const t = await db.sequelize.transaction();
//   try {
//     const existingCompany = await getCompanyWithAddress(builderId, t);

//     // ── Address upsert ────────────────────────────────────────────────────────
//     let addressId = null;
//     if (payload.address) {
//       addressId = await createOrUpdateAddress(existingCompany?.addressId || null, payload.address, t);
//     } else if (existingCompany?.addressId) {
//       addressId = existingCompany.addressId;
//     }

//     let result;

//     if (!existingCompany) {
//       // ── INSERT ──────────────────────────────────────────────────────────────
//       const newCompany = await db.Company.create({
//         builder_id: builderId,
//         name: payload.name,
//         abn_number: payload.abn_number,
//         timezone_id: payload.timezone_id,
//         address_id: addressId,
//         bank_name: payload.bank_name,
//         account_name: payload.account_name,
//         account_number: payload.account_number,
//         account_bsb: payload.account_bsb,
//         email_signature_logo: payload.email_signature_logo,
//         company_logo: payload.company_logo,
//       }, { transaction: t });

//       // Link company → builder
//       await db.Builder.update(
//         { company_id: newCompany.company_id },
//         { where: { builder_id: builderId }, transaction: t },
//       );

//       result = await attachTimezone(newCompany.toJSON(), t);
//     } else {
//       // ── UPDATE ──────────────────────────────────────────────────────────────
//       const updatePayload = {};

//       if (payload.name !== undefined) updatePayload.name = payload.name;
//       if (payload.abn_number !== undefined) updatePayload.abn_number = payload.abn_number;
//       if (payload.timezone_id !== undefined) updatePayload.timezone_id = payload.timezone_id;
//       if (addressId !== null) updatePayload.address_id = addressId;
//       if (payload.bank_name !== undefined) updatePayload.bank_name = payload.bank_name;
//       if (payload.account_name !== undefined) updatePayload.account_name = payload.account_name;
//       if (payload.account_number !== undefined) updatePayload.account_number = payload.account_number;
//       if (payload.account_bsb !== undefined) updatePayload.account_bsb = payload.account_bsb;
//       if (payload.email_signature_logo !== undefined) updatePayload.email_signature_logo = payload.email_signature_logo;
//       if (payload.company_logo !== undefined) updatePayload.company_logo = payload.company_logo;

//       const [, [updatedCompany]] = await db.Company.update(updatePayload, {
//         where: { builder_id: builderId },
//         returning: true,
//         transaction: t,
//       });

//       result = await attachTimezone(updatedCompany.toJSON(), t);
//     }

//     await t.commit();
//     return result;
//   } catch (err) {
//     await t.rollback();
//     throw err;
//   }
// }

export async function upsertCompanyService({ builderId, companyId }, payload, transaction = null) {
  const isExternalTransaction = !!transaction;
  const t = transaction || await db.sequelize.transaction();
  try {
    const existingCompany = await getCompanyWithAddress(builderId, companyId, t);

    // ── Address upsert ────────────────────────────────────────────────────────
    let addressId = null;
    if (payload.address) {
      addressId = await createOrUpdateAddress(existingCompany?.addressId || null, payload.address, t);
    } else if (existingCompany?.addressId) {
      addressId = existingCompany.addressId;
    }

    let result;

    if (!existingCompany) {
      // ── INSERT ──────────────────────────────────────────────────────────────
      const newCompany = await db.Company.create({
        builder_id: builderId || null,
        name: payload.name,
        abn_number: payload.abn_number,
        timezone_id: payload.timezone_id,
        address_id: addressId,
        bank_name: payload.bank_name,
        account_name: payload.account_name,
        account_number: payload.account_number,
        account_bsb: payload.account_bsb,
        email_signature_logo: payload.email_signature_logo,
        company_logo: payload.company_logo,
        website: payload.website,
      }, { transaction: t });

      if (builderId) {
        // Link company → builder
        await db.Builder.update(
          { company_id: newCompany.company_id },
          { where: { builder_id: builderId }, transaction: t },
        );
      }

      result = await getCompanyWithAddress(builderId, companyId, t);
    } else {
      // ── UPDATE ──────────────────────────────────────────────────────────────
      const updatePayload = {};

      if (payload.name !== undefined) {
        updatePayload.name = payload.name;
      }
      if (payload.abn_number !== undefined) {
        updatePayload.abn_number = payload.abn_number;
      }
      if (payload.timezone_id !== undefined) {
        updatePayload.timezone_id = payload.timezone_id;
      }
      if (addressId !== null) {
        updatePayload.address_id = addressId;
      }
      if (payload.bank_name !== undefined) {
        updatePayload.bank_name = payload.bank_name;
      }
      if (payload.account_name !== undefined) {
        updatePayload.account_name = payload.account_name;
      }
      if (payload.account_number !== undefined) {
        updatePayload.account_number = payload.account_number;
      }
      if (payload.account_bsb !== undefined) {
        updatePayload.account_bsb = payload.account_bsb;
      }
      if (payload.email_signature_logo !== undefined) {
        updatePayload.email_signature_logo = payload.email_signature_logo;
      }
      if (payload.company_logo !== undefined) {
        updatePayload.company_logo = payload.company_logo;
      }
      if (payload.website !== undefined) {
        updatePayload.website = payload.website;
      }

      const updateWhere = {};
      if (builderId) {
        updateWhere.builder_id = builderId;
      } else if (companyId) {
        updateWhere.company_id = companyId;
      }

      const [, [updatedCompany]] = await db.Company.update(updatePayload, {
        where: updateWhere,
        returning: true,
        transaction: t,
      });

      result = await getCompanyWithAddress(builderId, companyId, t);
    }

    if (!isExternalTransaction) {
      await t.commit();
    }
    return result;
  } catch (err) {
    if (!isExternalTransaction) {
      await t.rollback();
    }
    throw err;
  }
}
