import { deleteFromS3 } from "../../utils/s3Upload.js";
import { buildDynamicUpdate } from "../../utils/buildDynamicUpdate.js";
import { upsertAddress } from "./address.service.js";
import db from "../../config/database/models/postgre-models/index.js";

export async function getAllBuildersService(companyId = null) {
  const builders = await db.Builder.findAll({
    // Scope to a single company when provided so tenants only see their own
    // builders (e.g. the job "Assign Builder" picker).
    where: companyId ? { company_id: companyId } : undefined,
    attributes: [
      "builder_id",
      "name",
      "firm_name",
      "slogan",
      "email",
      "phone_number",
      "abn_number",
      "acn_number",
      "hia_membership_no",
      "registration_number",
      "registered_building_practitioner",
      "practitioner_reg_no",
      "license_number",
      "licensed_builder_name",
      "logo",
      "created_at",
      "updated_at",
    ],
    include: [
      {
        model: db.Address,
        as: "address",
        attributes: [
          "address_id",
          "address_line1",
          "address_line2",
          "city",
          "state_id",
          "country_id",
          "zip_code",
        ],
        required: false,
      },
      {
        model: db.BuilderInsurer,
        as: "insurers",
        attributes: [
          "builder_insurer_id",
          "insurer_name",
          "insured_name",
          "phone_number",
          "address_line1",
          "address_line2",
          "state_id",
          "zip_code",
        ],
        required: false,
      },
    ],
    order: [["name", "ASC"]],
  });

  return builders.map((builder) => {
    const plain = builder.toJSON();

    // Match original shape: single insurer object (not array)
    plain.insurer = plain.insurers?.[0] || null;
    delete plain.insurers;

    return plain;
  });
}

export async function getBuilderProfile(builderId) {
  const builder = await db.Builder.findOne({
    where: { builder_id: builderId },
    include: [
      {
        model: db.Address,
        as: "address",
        attributes: [
          "address_id",
          "address_line1",
          "address_line2",
          "city",
          "state_id",
          "country_id",
          "zip_code",
        ],
        required: false,
      },
      {
        model: db.BuilderInsurer,
        as: "insurers",
        attributes: [
          "builder_insurer_id",
          "insurer_name",
          "insured_name",
          "phone_number",
          "address_line1",
          "address_line2",
          "state_id",
          "zip_code",
        ],
        required: false,
      },
    ],
  });

  if (!builder) {
    return null;
  }

  const plain = builder.toJSON();

  // Match original shape: single insurer object (not array)
  plain.insurer = plain.insurers?.[0] || null;
  delete plain.insurers;

  return plain;
}

//without transtion
// export async function upsertBuilderService(builderId, payload, logoUrl) {
//   // ── Resolve existing builder state ─────────────────────────────────────────
//   const existingBuilder = await db.Builder.findOne({
//     where: { builder_id: builderId },
//     attributes: ["builder_id", "address_id", "logo"],
//   });

//   const exists = !!existingBuilder;
//   const existingAddressId = existingBuilder?.address_id || null;
//   const oldLogo = existingBuilder?.logo || null;

//   // ── Address upsert ──────────────────────────────────────────────────────────
//   const addressId = payload.address
//     ? await upsertAddress(existingAddressId, payload.address)
//     : undefined;

//   if (!exists) {
//     // ── CREATE builder ────────────────────────────────────────────────────────
//     await db.Builder.create({
//       builder_id: builderId,
//       company_id: payload.company_id,
//       name: payload.name,
//       email: payload.email,
//       phone_number: payload.phone_number,
//       abn_number: payload.abn_number,
//       acn_number: payload.acn_number,
//       hia_membership_no: payload.hia_membership_no,
//       registration_number: payload.registration_number,
//       registered_building_practitioner: payload.registered_building_practitioner,
//       practitioner_reg_no: payload.practitioner_reg_no,
//       licensed_builder_name: payload.licensed_builder_name,
//       bank_name: payload.bank_name,
//       account_name: payload.account_name,
//       account_number: payload.account_number,
//       account_bsb: payload.account_bsb,
//       address_id: addressId || null,
//       logo: logoUrl || null,
//     });
//   } else {
//     // ── UPDATE builder (dynamic — only provided fields) ───────────────────────
//     const updatePayload = {};

//     for (const [payloadKey, columnName] of Object.entries(BUILDER_UPDATE_FIELDS)) {
//       if (payload[payloadKey] !== undefined) {
//         updatePayload[columnName] = payload[payloadKey];
//       }
//     }

//     if (addressId) updatePayload.address_id = addressId;
//     if (logoUrl) updatePayload.logo = logoUrl;

//     if (Object.keys(updatePayload).length > 0) {
//       await db.Builder.update(updatePayload, {
//         where: { builder_id: builderId },
//       });
//     }

//     // Delete old S3 logo if replaced
//     if (logoUrl && oldLogo && oldLogo !== logoUrl) {
//       await deleteFromS3(oldLogo);
//     }
//   }

//   // ── Insurer upsert ──────────────────────────────────────────────────────────
//   if (payload.insurer) {
//     const existingInsurer = await db.BuilderInsurer.findOne({
//       where: { builder_id: builderId },
//       attributes: ["builder_insurer_id"],
//     });

//     if (!existingInsurer) {
//       // CREATE insurer
//       await db.BuilderInsurer.create({
//         builder_id: builderId,
//         insurer_name: payload.insurer.insurer_name,
//         insured_name: payload.insurer.insured_name,
//         phone_number: payload.insurer.phone_number,
//         address_line1: payload.insurer.address_line1,
//         address_line2: payload.insurer.address_line2,
//         state_id: payload.insurer.state_id,
//         zip_code: payload.insurer.zip_code,
//       });
//     } else {
//       // UPDATE insurer (dynamic — only provided fields)
//       const insurerUpdatePayload = {};

//       for (const [payloadKey, columnName] of Object.entries(INSURER_UPDATE_FIELDS)) {
//         if (payload.insurer[payloadKey] !== undefined) {
//           insurerUpdatePayload[columnName] = payload.insurer[payloadKey];
//         }
//       }

//       if (Object.keys(insurerUpdatePayload).length > 0) {
//         await db.BuilderInsurer.update(insurerUpdatePayload, {
//           where: { builder_id: builderId },
//         });
//       }
//     }
//   }

//   return await getBuilderProfile(builderId);
// }

export async function upsertBuilderService(builderId, payload, logoUrl) {
  // ── Resolve existing builder state (outside transaction — read only) ─────────
  const existingBuilder = await db.Builder.findOne({
    where: { builder_id: builderId },
    attributes: ["builder_id", "address_id", "logo"],
  });

  const exists = !!existingBuilder;
  const existingAddressId = existingBuilder?.address_id || null;
  const oldLogo = existingBuilder?.logo || null;

  const t = await db.sequelize.transaction();
  try {
    // ── Address upsert ────────────────────────────────────────────────────────
    const addressId = payload.address
      ? await upsertAddress(existingAddressId, payload.address, t)
      : undefined;

    if (!exists) {
      // ── CREATE builder ──────────────────────────────────────────────────────
      await db.Builder.create({
        builder_id: builderId,
        company_id: payload.company_id,
        name: payload.name,
        firm_name: payload.firm_name,
        slogan: payload.slogan,
        email: payload.email,
        phone_number: payload.phone_number,
        abn_number: payload.abn_number,
        acn_number: payload.acn_number,
        hia_membership_no: payload.hia_membership_no,
        registration_number: payload.registration_number,
        registered_building_practitioner: payload.registered_building_practitioner,
        practitioner_reg_no: payload.practitioner_reg_no,
        license_number: payload.license_number,
        licensed_builder_name: payload.licensed_builder_name,
        bank_name: payload.bank_name,
        account_name: payload.account_name,
        account_number: payload.account_number,
        account_bsb: payload.account_bsb,
        address_id: addressId || null,
        logo: logoUrl || null,
      }, { transaction: t });
    } else {
      // ── UPDATE builder (dynamic — only provided fields) ─────────────────────
      const updatePayload = {};

      const builderFields = [
        "company_id", "name", "firm_name", "slogan", "email", "phone_number",
        "abn_number", "acn_number", "hia_membership_no", "registration_number",
        "registered_building_practitioner", "practitioner_reg_no", "license_number",
        "licensed_builder_name", "bank_name", "account_name", "account_number", "account_bsb"
      ];

      for (const field of builderFields) {
        if (payload[field] !== undefined) {
          updatePayload[field] = payload[field];
        }
      }

      if (addressId) {
        updatePayload.address_id = addressId;
      }
      if (logoUrl) {
        updatePayload.logo = logoUrl;
      }

      if (Object.keys(updatePayload).length > 0) {
        await db.Builder.update(updatePayload, {
          where: { builder_id: builderId },
          transaction: t,
        });
      }
    }

    // ── Insurer upsert ────────────────────────────────────────────────────────
    if (payload.insurer) {
      const existingInsurer = await db.BuilderInsurer.findOne({
        where: { builder_id: builderId },
        attributes: ["builder_insurer_id"],
        transaction: t,
      });

      if (!existingInsurer) {
        await db.BuilderInsurer.create({
          builder_id: builderId,
          insurer_name: payload.insurer.insurer_name,
          insured_name: payload.insurer.insured_name,
          phone_number: payload.insurer.phone_number,
          address_line1: payload.insurer.address_line1,
          address_line2: payload.insurer.address_line2,
          state_id: payload.insurer.state_id,
          zip_code: payload.insurer.zip_code,
        }, { transaction: t });
      } else {
        const insurerUpdatePayload = {};

        const insurerFields = [
          "insurer_name", "insured_name", "phone_number", "address_line1",
          "address_line2", "state_id", "zip_code"
        ];

        for (const field of insurerFields) {
          if (payload.insurer[field] !== undefined) {
            insurerUpdatePayload[field] = payload.insurer[field];
          }
        }

        if (Object.keys(insurerUpdatePayload).length > 0) {
          await db.BuilderInsurer.update(insurerUpdatePayload, {
            where: { builder_id: builderId },
            transaction: t,
          });
        }
      }
    }

    await t.commit();

    // ── Delete old S3 logo after commit (outside transaction) ─────────────────
    if (logoUrl && oldLogo && oldLogo !== logoUrl) {
      await deleteFromS3(oldLogo);
    }

    return await getBuilderProfile(builderId);
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

export default { upsertBuilderService, getBuilderProfile, getAllBuildersService };
