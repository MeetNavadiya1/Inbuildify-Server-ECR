import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";
import {
  packageCostSql,
  priceListCostSql,
  grandTotalSql,
  packageCostTextSql,
  priceListCostTextSql,
  grandTotalTextSql,
} from "../../utils/quotationTotals.sql.js";
import {
  termsTokenSql,
  termsTitleSql,
  termsIsSyncedSql,
} from "../../utils/quotationTerms.sql.js";
import {
  upsertQuotationDriveFile,
  getQuotationDriveFile,
  deleteQuotationDriveFile,
} from "../../helper/quotationDriveFile.helper.js";
import { DRIVE_FILE_MAPPING } from "../../constants/driveFile.js";
import { env } from "../../config/env.config.js";
import { sampleDataSqlScope } from "../../config/database/models/postgre-models/sampleDataFlag.js";

class QuotationRepository {
  constructor() { }

  async getQuotationByLeadId(leadsId) {
    const { Quotation } = db.sequelize.models;
    const result = await Quotation.findOne({ where: { leads_id: leadsId } });
    return result ? keysToCamelCase(result.get({ plain: true })) : null;
  }

  async getAllQuotationsByLeadId(leadsId) {
    return this.getQuotationsByFilter({ leads_id: leadsId });
  }

  async getQuotationById(quotationId) {
    const results = await this.getQuotationsByFilter({ quotation_id: quotationId });
    return results.length > 0 ? results[0] : null;
  }

  async getQuotationsByFilter(filters) {
    try {
      const filterKeys = Object.keys(filters);
      const replacements = { ...filters };
      const whereClause = filterKeys
        .map((key) => `q.${key} = :${key}`)
        .join(" AND ");

      const query = `
        SELECT 
          q.*,
          (SELECT opportunity_id FROM opportunity WHERE leads_id = q.leads_id LIMIT 1) as opportunity_id,
          COALESCE(
            json_agg(
              json_build_object(
                'quotation_version_id', qv.quotation_version_id,
                'quotation_version_no', qv.quotation_version_no,
                'is_approve', qv.is_approve,
                'send_to_engineer', qv.send_to_engineer,
                'sketch_number', qv.sketch_number,
                'created_at', qv.created_at,
                'updated_at', qv.updated_at,
                'location_id', qv.location_id,
                'location_name', l.name,
                'range_id', qv.range_id,
                'range_name', r.name,
                'dwelling_type_id', qv.dwelling_type_id,
                'dwelling_type_name', dt.name,
                'floor_plan_id', qv.floor_plan_id,
                'floor_plan_name', fp.name,
                'facade_id', qv.facade_id,
                'facade_name', f.name,
                'structure_engineer_report', (SELECT df.s3_key FROM drive_files df WHERE df.reference_id = qv.quotation_version_id AND df.reference_type = 'QuotationVersion' AND df.sub_reference_type = 'StructureEngineerReport' AND df.deleted_at IS NULL LIMIT 1),
                'structure_engineer_id', qv.structure_engineer_id,
                'structure_engineer_name', se.name,
                'structural_engineer', CASE WHEN qv.structure_engineer_id IS NOT NULL THEN
                  json_build_object(
                    'id', qv.structure_engineer_id,
                    'name', se.name,
                    'email', se.email,
                    'phone', se.phone,
                    'price', qv.structure_engineer_price,
                    'is_engineer_price_mismatch', CASE 
                      WHEN qv.structure_engineer_id IS NOT NULL AND se.price IS NOT NULL 
                           AND qv.structure_engineer_price::numeric != se.price::numeric THEN true 
                      ELSE false 
                    END
                  )
                ELSE NULL END,
                'quotation_version_items', (
                  SELECT COALESCE(json_agg(json_build_object(
                    'quotation_version_item_id', qvi.quotation_version_item_id,
                    'price_list_item_id', qvi.price_list_item_id,
                    'price_list_item_description', qvi.price_list_item_description,
                    'price_list_item_cost', qvi.price_list_item_cost,
                    'quantity', qvi.quantity,
                    'total_price', qvi.total_price,
                    'package_id', qvi.package_id,
                    'extra_item', COALESCE(qvi.extra_item, false),
                    'extra_type', qvi.extra_type,
                    'is_price_list_item_cost_mismatch', CASE 
                      WHEN qvi.price_list_item_id IS NOT NULL AND pli.cost IS NOT NULL 
                           AND qvi.price_list_item_cost::numeric != pli.cost::numeric THEN true 
                      ELSE false 
                    END,
                    'is_package_cost_mismatch', CASE 
                      WHEN qvi.package_id IS NOT NULL AND p.cost IS NOT NULL 
                           AND qvi.package_cost::numeric != p.cost::numeric THEN true 
                      ELSE false 
                    END,
                    'is_system_data', qvi.price_list_item_is_system_data,
                    'is_automatically_mapped', CASE 
                      WHEN fppim.price_list_item_id IS NOT NULL THEN true 
                      ELSE false 
                    END
                  )), '[]'::json)
                  FROM quotation_version_items qvi
                  LEFT JOIN price_list_item pli ON qvi.price_list_item_id = pli.price_list_item_id
                  LEFT JOIN package p ON qvi.package_id = p.package_id
                  LEFT JOIN floor_plan_pricelist_item_map fppim ON qv.floor_plan_id = fppim.floor_plan_id 
                                                               AND qvi.price_list_item_id = fppim.price_list_item_id
                  WHERE qvi.quotation_version_id = qv.quotation_version_id
                ),
                'package', (
                  SELECT json_build_object(
                    'package_id', qvi.package_id,
                    'name', qvi.package_name,
                    'cost', qvi.package_cost
                  )
                  FROM quotation_version_items qvi
                  WHERE qvi.quotation_version_id = qv.quotation_version_id 
                  AND qvi.package_id IS NOT NULL 
                  LIMIT 1
                ),
                'total_package_cost', ${packageCostSql("qv.quotation_version_id")},
                'total_pricelist_cost', ${priceListCostSql("qv.quotation_version_id")},
                'grand_total_cost', ${grandTotalSql("qv.quotation_version_id", "qv")},
                'facade_price', qv.facade_price
              ) ORDER BY qv.quotation_version_no DESC
            ) FILTER (WHERE qv.quotation_version_id IS NOT NULL),
            '[]'
          ) AS versions
        FROM quotation q
        LEFT JOIN quotation_version qv ON q.quotation_id = qv.quotation_id
        LEFT JOIN location l ON qv.location_id = l.location_id
        LEFT JOIN range r ON qv.range_id = r.range_id
        LEFT JOIN dwelling_type dt ON qv.dwelling_type_id = dt.dwelling_type_id
        LEFT JOIN structure_engineer se ON qv.structure_engineer_id = se.structure_engineer_id
        LEFT JOIN floor_plan fp ON qv.floor_plan_id = fp.floor_plan_id
        LEFT JOIN facade f ON qv.facade_id = f.facade_id
        WHERE ${whereClause}
        GROUP BY q.quotation_id
        ORDER BY q.created_at DESC
      `;
      const rows = await db.sequelize.query(query, {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT
      });
      const s3Prefix = `https://${env.AWS.S3_BUCKET_NAME}.s3.${env.AWS.AWS_REGION}.amazonaws.com/`;
      return rows.map(row => {
        const mapped = keysToCamelCase(row);
        if (mapped.versions) {
          mapped.versions = mapped.versions.map(v => {
            const keysV = keysToCamelCase(v);
            if (keysV.structureEngineerReport && !keysV.structureEngineerReport.startsWith("http")) {
              keysV.structureEngineerReport = `${s3Prefix}${keysV.structureEngineerReport}`;
            }
            return keysV;
          });
        }
        return mapped;
      });
    } catch (error) {
      console.error("Error in getQuotationsByFilter:", error);
      throw error;
    }
  }


  async getLatestQuotationVersionNo(quotationId) {
    const { QuotationVersion } = db.sequelize.models;
    const maxVersion = await QuotationVersion.max("quotation_version_no", {
      where: { quotation_id: quotationId },
    });
    return maxVersion || 0;
  }

  async getLatestQuotationVersionByLeadId(leadsId) {
    try {
      const { QuotationVersion, Quotation } = db.sequelize.models;
      const result = await QuotationVersion.findOne({
        include: [{
          model: Quotation,
          as: "quotation",
          where: { leads_id: leadsId },
          attributes: []
        }],
        order: [
          [{ model: Quotation, as: "quotation" }, "created_at", "DESC"],
          ["quotation_version_no", "DESC"]
        ]
      });
      return result ? keysToCamelCase(result.get({ plain: true })) : null;
    } catch (error) {
      console.error("Error in getLatestQuotationVersionByLeadId:", error);
      throw error;
    }
  }

  async createQuotation(quotationData) {
    try {
      const { Quotation } = db.sequelize.models;
      const { leads_id, reference_number, created_by } = quotationData;
      const result = await Quotation.create({
        leads_id, reference_number, created_by, updated_by: created_by
      });
      return keysToCamelCase(result.get({ plain: true }));
    } catch (error) {
      console.error("Error in createQuotation:", error);
      throw error;
    }
  }

  async createQuotationVersion(versionData) {
    try {
      const { QuotationVersion } = db.sequelize.models;
      const { quotation_id, quotation_version_no } = versionData;
      const result = await QuotationVersion.create({
        quotation_id, quotation_version_no
      });
      return keysToCamelCase(result.get({ plain: true }));
    } catch (error) {
      console.error("Error in createQuotationVersion:", error);
      throw error;
    }
  }

  async duplicateVersion(sourceVersionId, newVersionNo) {
    const t = await db.sequelize.transaction();
    try {
      const { QuotationVersion, QuotationVersionCustomSection, QuotationVersionItem } = db.sequelize.models;

      // 1. Get original version
      const sourceVersion = await QuotationVersion.findByPk(sourceVersionId, { transaction: t });
      if (!sourceVersion) throw new Error("Source quotation version not found");

      // 2. Insert new version
      const newVersion = await QuotationVersion.create({
        quotation_id: sourceVersion.quotation_id,
        quotation_version_no: newVersionNo,
        location_id: sourceVersion.location_id,
        range_id: sourceVersion.range_id,
        dwelling_type_id: sourceVersion.dwelling_type_id,
        floor_plan_id: sourceVersion.floor_plan_id,
        facade_id: sourceVersion.facade_id,
        is_approve: false,
        package_id: sourceVersion.package_id,
        structure_engineer_id: sourceVersion.structure_engineer_id || null,
        structure_engineer_price: sourceVersion.structure_engineer_price || 0,
        facade_price: sourceVersion.facade_price || 0,
        sketch_number: sourceVersion.sketch_number || null,
      }, { transaction: t });

      // 3. Copy Custom Sections
      const customSections = await QuotationVersionCustomSection.findAll({
        where: { quotation_version_id: sourceVersionId },
        transaction: t
      });
      if (customSections.length > 0) {
        await QuotationVersionCustomSection.bulkCreate(customSections.map(cs => ({
          quotation_version_id: newVersion.quotation_version_id,
          file_url: cs.file_url,
          sort_order: cs.sort_order
        })), { transaction: t });
      }

      // 4. Copy Snapshot Items
      //
      // Copy every snapshot column except the row's own identity/timestamps.
      // The previous hand-written field list carried only ten columns, so a
      // duplicated version silently lost price_list_id / price_list_name (the
      // quotation PDF groups its inclusions table by price list, so every line
      // collapsed under "Other"), price_list_item_uom (the UOM column went to
      // "-"), and extra_item / extra_type (discounts and complimentary lines
      // stopped being recognisable as such). Enumerating what to DROP instead of
      // what to keep means a new snapshot column is carried over by default.
      const items = await QuotationVersionItem.findAll({
        where: { quotation_version_id: sourceVersionId },
        transaction: t
      });
      if (items.length > 0) {
        const NOT_COPIED = new Set([
          "quotation_version_item_id",
          "quotation_version_id",
          "created_at",
          "updated_at",
        ]);
        await QuotationVersionItem.bulkCreate(items.map(item => {
          const row = { quotation_version_id: newVersion.quotation_version_id };
          for (const [key, value] of Object.entries(item.get({ plain: true }))) {
            if (!NOT_COPIED.has(key)) row[key] = value;
          }
          return row;
        }), { transaction: t });
      }

      await t.commit();
      return keysToCamelCase(newVersion.get({ plain: true }));
    } catch (error) {
      await t.rollback();
      throw error;
    }
  }

  async getVersionsByQuotationId(quotationId, versionId = null) {
    try {
      const replacements = { quotationId };
      let query = `
        SELECT qv.quotation_version_id, qv.quotation_id, q.reference_number, qv.quotation_version_no,
          qv.is_approve, qv.sketch_number, qv.created_at, qv.updated_at,
          qv.location_id, qv.facade_price,
          l.name as location_name,
          qv.range_id, r.name as range_name,
          qv.dwelling_type_id, dt.name as dwelling_type_name,
          qv.structure_engineer_id, se.name as structure_engineer_name,
          CASE WHEN qv.structure_engineer_id IS NOT NULL THEN
            json_build_object(
              'id', qv.structure_engineer_id,
              'name', se.name,
              'email', se.email,
              'phone', se.phone,
              'price', qv.structure_engineer_price,
              'is_engineer_price_mismatch', CASE 
                WHEN qv.structure_engineer_id IS NOT NULL AND se.price IS NOT NULL 
                     AND qv.structure_engineer_price::numeric != se.price::numeric THEN true 
                ELSE false 
              END
            )
          ELSE NULL END as structural_engineer,
          (SELECT json_build_object('name', fp.name, 'floor_plan_id', fp.floor_plan_id, 'min_land_width', fp.min_land_width, 'min_land_depth', fp.min_land_depth, 'dwelling_area', fp.dwelling_area, 'dwelling_type_id', fp.dwelling_type_id, 'beds', fp.beds, 'baths', fp.baths, 'carpark', fp.carpark, 'living', fp.living, 'range_id', fp.range_id, 'location_id', fp.location_id, 'garage_area', fp.garage_area, 'porch_area', fp.porch_area, 'alfresco_area', fp.alfresco_area, 'total_area', fp.total_area, 'detailed_image', fp.detailed_image, 'simple_image', fp.simple_image, 'description', fp.description) FROM floor_plan fp WHERE fp.floor_plan_id = qv.floor_plan_id) as floor_plan,
          (SELECT json_build_object('name', f.name, 'facade_id', f.facade_id, 'location_id', f.location_id, 'dwelling_type_id', f.dwelling_type_id, 'range_id', f.range_id, 'cost_type', f.cost_type, 'cost', f.cost, 'builder_cost', f.builder_cost, 'image', f.image) FROM facade f WHERE f.facade_id = qv.facade_id) as facade,
          (SELECT json_build_object('package_id', qvi.package_id, 'name', qvi.package_name, 'cost', qvi.package_cost) FROM quotation_version_items qvi WHERE qvi.quotation_version_id = qv.quotation_version_id AND qvi.package_id IS NOT NULL LIMIT 1) as package,
          ${packageCostSql("qv.quotation_version_id")} as total_package_cost,
          ${priceListCostSql("qv.quotation_version_id")} as total_pricelist_cost,
          ${grandTotalSql("qv.quotation_version_id", "qv")} as grand_total_cost,
          (SELECT COALESCE(json_agg(json_build_object('quotation_version_item_id', qvi.quotation_version_item_id, 'price_list_item_id', qvi.price_list_item_id, 'price_list_item_description', qvi.price_list_item_description, 'price_list_name', qvi.price_list_name, 'price_list_item_uom', qvi.price_list_item_uom, 'price_list_item_cost', qvi.price_list_item_cost, 'quantity', qvi.quantity, 'total_price', qvi.total_price, 'package_id', qvi.package_id, 'package_name', qvi.package_name, 'package_cost', qvi.package_cost, 'is_price_list_item_cost_mismatch', CASE WHEN qvi.price_list_item_id IS NOT NULL AND pli.cost IS NOT NULL AND qvi.price_list_item_cost::numeric != pli.cost::numeric THEN true ELSE false END, 'is_package_cost_mismatch', CASE WHEN qvi.package_id IS NOT NULL AND p.cost IS NOT NULL AND qvi.package_cost::numeric != p.cost::numeric THEN true ELSE false END, 'is_system_data', qvi.price_list_item_is_system_data, 'is_automatically_mapped', CASE WHEN fppim_items.price_list_item_id IS NOT NULL THEN true ELSE false END, 'is_package_mapped', CASE WHEN ppim_items.price_list_item_id IS NOT NULL THEN true ELSE false END)), '[]'::json) FROM quotation_version_items qvi LEFT JOIN price_list_item pli ON qvi.price_list_item_id = pli.price_list_item_id LEFT JOIN package p ON qvi.package_id = p.package_id LEFT JOIN floor_plan_pricelist_item_map fppim_items ON qv.floor_plan_id = fppim_items.floor_plan_id AND qvi.price_list_item_id = fppim_items.price_list_item_id LEFT JOIN package_pricelist_item_map ppim_items ON qvi.price_list_item_id = ppim_items.price_list_item_id AND ppim_items.package_id = (SELECT qvi_pkg.package_id FROM quotation_version_items qvi_pkg WHERE qvi_pkg.quotation_version_id = qv.quotation_version_id AND qvi_pkg.package_id IS NOT NULL LIMIT 1) WHERE qvi.quotation_version_id = qv.quotation_version_id) as quotation_version_items,
          leads.leads_id as lead_id,
          leads.property_detail_id as lead_property_detail_id,
          (SELECT json_build_object('property_detail_id', pd.property_detail_id, 'lot_id', pd.lot_id, 'lot_number', pd.lot_number, 'street', pd.street, 'address_line1', pd.address_line1, 'address_line2', pd.address_line2, 'city', pd.city, 'state_id', pd.state_id, 'state_name', s.name, 'country_id', pd.country_id, 'zip_code', pd.zip_code, 'estate_id', pd.estate_id, 'estate_stage_id', pd.estate_stage_id, 'estate_name', pd.estate_name, 'title_status', pd.title_status, 'title_date', pd.title_date, 'clearing_date', pd.clearing_date, 'compaction_report', pd.compaction_report, 'compaction_report_url', (SELECT df.s3_key FROM drive_files df WHERE df.reference_id = pd.property_detail_id AND df.reference_type = 'PropertyDetail' AND df.sub_reference_type = 'CompactionReport' AND df.deleted_at IS NULL LIMIT 1), 'compaction_report_content', pd.compaction_report_content, 'land_type', pd.land_type, 'width_m', pd.width_m, 'depth_m', pd.depth_m, 'total_size_m2', pd.total_size_m2, 'site_fall_mm', pd.site_fall_mm, 'land_fill_mm', pd.land_fill_mm, 'price', pd.price, 'bush_fire', pd.bush_fire, 'corner_block', pd.corner_block, 'is_hl_package_lot', pd.is_hl_package_lot, 'compaction_report_provider', pd.compaction_report_provider) FROM property_detail pd LEFT JOIN state s ON pd.state_id = s.state_id WHERE pd.property_detail_id = leads.property_detail_id) as property,
          (SELECT COALESCE(json_agg(json_build_object('id', lcm.id, 'users_id', u.users_id, 'name', u.name, 'address', jsonb_build_object('address_line1', a.address_line1, 'address_line2', a.address_line2, 'city', a.city, 'zip_code', a.zip_code, 'country_id', a.country_id, 'state_id', a.state_id), 'phone', u.phone, 'email', u.email)), '[]'::json) FROM leads_contact_map lcm JOIN users u ON lcm.contact_id = u.users_id LEFT JOIN address a ON u.address_id = a.address_id WHERE lcm.leads_id = leads.leads_id) as lead_contacts,
          -- Same Terms & Conditions link the PDF prints, so the customer-facing
          -- quotation view (/quotation/view?token=…) can show the identical
          -- link instead of the customer having to open the PDF to find it.
          ${termsTokenSql("qv", "leads")} as terms_public_token,
          ${termsTitleSql("qv", "leads")} as terms_title,
          ${termsIsSyncedSql("qv")} as terms_is_synced,
          qv.created_at, qv.updated_at
        FROM quotation_version qv
        LEFT JOIN location l ON qv.location_id = l.location_id
        LEFT JOIN range r ON qv.range_id = r.range_id
        LEFT JOIN dwelling_type dt ON qv.dwelling_type_id = dt.dwelling_type_id
        LEFT JOIN structure_engineer se ON qv.structure_engineer_id = se.structure_engineer_id
        LEFT JOIN floor_plan fp ON qv.floor_plan_id = fp.floor_plan_id
        LEFT JOIN facade f ON qv.facade_id = f.facade_id
        JOIN quotation q ON qv.quotation_id = q.quotation_id
        LEFT JOIN leads ON q.leads_id = leads.leads_id
        WHERE qv.quotation_id = :quotationId
      `;

      if (versionId) {
        query += " AND qv.quotation_version_id = :versionId";
        replacements.versionId = versionId;
      }
      query += " ORDER BY qv.quotation_version_no DESC";

      const rows = await db.sequelize.query(query, {
        replacements,
        type: db.Sequelize.QueryTypes.SELECT,
      });
      return rows.map(row => keysToCamelCase(row));
    } catch (error) {
      console.error("Error in getVersionsByQuotationId:", error);
      throw error;
    }
  }

  async updateQuotationVersion(versionId, updateData, transaction = null) {
    try {
      const { QuotationVersion } = db.sequelize.models;
      // upload_report is intentionally not in this list — that file is now
      // stored as a DriveFile (sub_reference_type=StructureEngineerUpload)
      // and the controller upserts it before this service is called.
      const allowedFields = [
        "location_id", "range_id", "dwelling_type_id",
        "floor_plan_id", "facade_id", "is_approve", "sketch_number",
        "structure_engineer_id", "structure_engineer_price", "facade_price",
      ];

      const dataToUpdate = {};
      for (const field of allowedFields) {
        if (updateData[field] !== undefined) {
          dataToUpdate[field] = updateData[field];
        }
      }

      if (Object.keys(dataToUpdate).length === 0) return null;

      await QuotationVersion.update(dataToUpdate, {
        where: { quotation_version_id: versionId },
        transaction,
        individualHooks: true,
      });

      return this.getQuotationVersionDetailsById(versionId, transaction);
    } catch (error) {
      console.error("Error in updateQuotationVersion:", error);
      throw error;
    }
  }

  async getQuotationVersionDetailsById(versionId, transaction = null) {
    try {
      const query = `
        SELECT qv.quotation_version_id, qv.quotation_id, q.reference_number, q.is_sample_data,
          qv.quotation_version_no,
          qv.location_id, qv.range_id, qv.dwelling_type_id, qv.is_approve, qv.send_to_engineer,
          qv.facade_price::numeric(12,2)::text as facade_price, qv.sketch_number,
          qv.created_at, qv.updated_at,
          qv.structure_engineer_id, se.name as structure_engineer_name,
          CASE WHEN qv.structure_engineer_id IS NOT NULL THEN
            json_build_object(
              'id', qv.structure_engineer_id,
              'name', se.name,
              'email', se.email,
              'phone', se.phone,
              'price', qv.structure_engineer_price,
              'is_engineer_price_mismatch', CASE 
                WHEN qv.structure_engineer_id IS NOT NULL AND se.price IS NOT NULL 
                     AND qv.structure_engineer_price::numeric != se.price::numeric THEN true 
                ELSE false 
              END
            )
          ELSE NULL END as structural_engineer,
          l.name as location_name,
          r.name as range_name,
          dt.name as dwelling_type_name,
          (SELECT json_build_object('name', fp.name, 'floor_plan_id', fp.floor_plan_id, 'min_land_width', fp.min_land_width, 'min_land_depth', fp.min_land_depth, 'dwelling_area', fp.dwelling_area, 'dwelling_type_id', fp.dwelling_type_id, 'beds', fp.beds, 'baths', fp.baths, 'carpark', fp.carpark, 'living', fp.living, 'range_id', fp.range_id, 'location_id', fp.location_id, 'garage_area', fp.garage_area, 'porch_area', fp.porch_area, 'alfresco_area', fp.alfresco_area, 'total_area', fp.total_area, 'detailed_image', fp.detailed_image, 'simple_image', fp.simple_image, 'description', fp.description) FROM floor_plan fp WHERE fp.floor_plan_id = qv.floor_plan_id) as floor_plan,
          (SELECT json_build_object('name', f.name, 'facade_id', f.facade_id, 'location_id', f.location_id, 'dwelling_type_id', f.dwelling_type_id, 'range_id', f.range_id, 'cost_type', f.cost_type, 'cost', f.cost, 'builder_cost', f.builder_cost, 'image', f.image) FROM facade f WHERE f.facade_id = qv.facade_id) as facade,
          (SELECT json_build_object('package_id', qvi.package_id, 'name', qvi.package_name, 'cost', qvi.package_cost) FROM quotation_version_items qvi WHERE qvi.quotation_version_id = qv.quotation_version_id AND qvi.package_id IS NOT NULL LIMIT 1) as package,
          ${packageCostTextSql("qv.quotation_version_id")} as total_package_cost,
          ${priceListCostTextSql("qv.quotation_version_id")} as total_pricelist_cost,
          ${grandTotalTextSql("qv.quotation_version_id", "qv")} as grand_total_cost,
          (SELECT COALESCE(json_agg(json_build_object('quotation_version_item_id', qvi.quotation_version_item_id, 'price_list_item_id', qvi.price_list_item_id, 'price_list_item_description', qvi.price_list_item_description, 'price_list_name', qvi.price_list_name, 'price_list_item_uom', qvi.price_list_item_uom, 'price_list_item_cost', qvi.price_list_item_cost, 'quantity', qvi.quantity, 'total_price', qvi.total_price, 'package_id', qvi.package_id, 'package_name', qvi.package_name, 'package_cost', qvi.package_cost, 'is_price_list_item_cost_mismatch', CASE WHEN qvi.price_list_item_id IS NOT NULL AND pli.cost IS NOT NULL AND qvi.price_list_item_cost::numeric != pli.cost::numeric THEN true ELSE false END, 'is_package_cost_mismatch', CASE WHEN qvi.package_id IS NOT NULL AND p.cost IS NOT NULL AND qvi.package_cost::numeric != p.cost::numeric THEN true ELSE false END, 'is_system_data', qvi.price_list_item_is_system_data, 'is_automatically_mapped', CASE WHEN fppim_items.price_list_item_id IS NOT NULL THEN true ELSE false END, 'is_package_mapped', CASE WHEN ppim_items.price_list_item_id IS NOT NULL THEN true ELSE false END)), '[]'::json) FROM quotation_version_items qvi LEFT JOIN price_list_item pli ON qvi.price_list_item_id = pli.price_list_item_id LEFT JOIN package p ON qvi.package_id = p.package_id LEFT JOIN floor_plan_pricelist_item_map fppim_items ON qv.floor_plan_id = fppim_items.floor_plan_id AND qvi.price_list_item_id = fppim_items.price_list_item_id LEFT JOIN package_pricelist_item_map ppim_items ON qvi.price_list_item_id = ppim_items.price_list_item_id AND ppim_items.package_id = (SELECT qvi_pkg.package_id FROM quotation_version_items qvi_pkg WHERE qvi_pkg.quotation_version_id = qv.quotation_version_id AND qvi_pkg.package_id IS NOT NULL LIMIT 1) WHERE qvi.quotation_version_id = qv.quotation_version_id) as quotation_version_items,
          leads.leads_id as lead_id,
          leads.property_detail_id as lead_property_detail_id,
          (SELECT json_build_object('property_detail_id', pd.property_detail_id, 'lot_id', pd.lot_id, 'lot_number', pd.lot_number, 'street', pd.street, 'address_line1', pd.address_line1, 'address_line2', pd.address_line2, 'city', pd.city, 'state_id', pd.state_id, 'state_name', s.name, 'country_id', pd.country_id, 'zip_code', pd.zip_code, 'estate_id', pd.estate_id, 'estate_stage_id', pd.estate_stage_id, 'estate_name', pd.estate_name, 'title_status', pd.title_status, 'title_date', pd.title_date, 'clearing_date', pd.clearing_date, 'compaction_report', pd.compaction_report, 'compaction_report_url', (SELECT df.s3_key FROM drive_files df WHERE df.reference_id = pd.property_detail_id AND df.reference_type = 'PropertyDetail' AND df.sub_reference_type = 'CompactionReport' AND df.deleted_at IS NULL LIMIT 1), 'compaction_report_content', pd.compaction_report_content, 'land_type', pd.land_type, 'width_m', pd.width_m, 'depth_m', pd.depth_m, 'total_size_m2', pd.total_size_m2, 'site_fall_mm', pd.site_fall_mm, 'land_fill_mm', pd.land_fill_mm, 'price', pd.price, 'bush_fire', pd.bush_fire, 'corner_block', pd.corner_block, 'is_hl_package_lot', pd.is_hl_package_lot, 'compaction_report_provider', pd.compaction_report_provider) FROM property_detail pd LEFT JOIN state s ON pd.state_id = s.state_id WHERE pd.property_detail_id = leads.property_detail_id) as property,
          (SELECT COALESCE(json_agg(json_build_object('id', lcm.id, 'users_id', u.users_id, 'name', u.name, 'address', jsonb_build_object('address_line1', a.address_line1, 'address_line2', a.address_line2, 'city', a.city, 'zip_code', a.zip_code, 'country_id', a.country_id, 'state_id', a.state_id), 'phone', u.phone, 'email', u.email)), '[]'::json) FROM leads_contact_map lcm JOIN users u ON lcm.contact_id = u.users_id LEFT JOIN address a ON u.address_id = a.address_id WHERE lcm.leads_id = leads.leads_id) as lead_contacts,
          -- Terms & Conditions link printed on the PDF. The per-quotation token
          -- wins when Sync has attached terms (it resolves to the frozen
          -- snapshot the customer was sent); otherwise the builder's live
          -- document token keeps the link alive on quotations that were never
          -- synced. Feeding it from THIS query is what puts the link on every
          -- PDF path at once — the preview endpoint, both queue processors and
          -- both workers all build their HTML from this row.
          ${termsTokenSql("qv", "leads")} as terms_public_token,
          ${termsTitleSql("qv", "leads")} as terms_title,
          ${termsIsSyncedSql("qv")} as terms_is_synced,
          qv.created_at, qv.updated_at
        FROM quotation_version qv
        JOIN quotation q ON qv.quotation_id = q.quotation_id
        LEFT JOIN leads ON q.leads_id = leads.leads_id
        LEFT JOIN location l ON qv.location_id = l.location_id
        LEFT JOIN range r ON qv.range_id = r.range_id
        LEFT JOIN dwelling_type dt ON qv.dwelling_type_id = dt.dwelling_type_id
        LEFT JOIN structure_engineer se ON qv.structure_engineer_id = se.structure_engineer_id
        LEFT JOIN floor_plan fp ON qv.floor_plan_id = fp.floor_plan_id
        LEFT JOIN facade f ON qv.facade_id = f.facade_id
        WHERE qv.quotation_version_id = :versionId
      `;
      const rows = await db.sequelize.query(query, {
        replacements: { versionId },
        type: db.Sequelize.QueryTypes.SELECT,
        transaction
      });
      if (rows.length > 0) {
        return keysToCamelCase(rows[0]);
      }
      return null;
    } catch (error) {
      console.error("Error in getQuotationVersionDetailsById:", error);
      throw error;
    }
  }

  async getVersionComparisonData(versionId) {
    try {
      // 1. Version header with grand total
      const versionQuery = `
        SELECT qv.quotation_version_id, qv.quotation_version_no, qv.facade_id, qv.floor_plan_id,
          qv.facade_price, f.name as facade_name, fp.name as floor_plan_name,
          ${packageCostSql("qv.quotation_version_id")} as total_package_cost,
          ${priceListCostSql("qv.quotation_version_id")} as total_pricelist_cost,
          ${grandTotalSql("qv.quotation_version_id", "qv")} as grand_total_cost
        FROM quotation_version qv
        LEFT JOIN facade f ON qv.facade_id = f.facade_id
        LEFT JOIN floor_plan fp ON qv.floor_plan_id = fp.floor_plan_id
        WHERE qv.quotation_version_id = :versionId
      `;
      const versionRows = await db.sequelize.query(versionQuery, {
        replacements: { versionId },
        type: db.Sequelize.QueryTypes.SELECT
      });
      if (versionRows.length === 0) return null;

      const version = keysToCamelCase(versionRows[0]);

      // 2. Unified items
      const itemsQuery = `
        SELECT qvi.*, CASE WHEN qvi.package_id IS NOT NULL THEN 'package' ELSE 'item' END as item_type
        FROM quotation_version_items qvi
        WHERE qvi.quotation_version_id = :versionId
        ORDER BY CASE WHEN qvi.package_id IS NOT NULL THEN 0 ELSE 1 END, qvi.price_list_item_sort_order ASC, qvi.package_name ASC, qvi.price_list_item_description ASC
      `;
      const itemsRows = await db.sequelize.query(itemsQuery, {
        replacements: { versionId },
        type: db.Sequelize.QueryTypes.SELECT
      });
      const items = itemsRows.map(r => keysToCamelCase(r));

      // 3. Backward compatibility
      const packageItem = items.find(item => item.itemType === 'package');
      const pricelistItems = items.filter(item => item.itemType === 'item').map(item => ({
        id: item.quotationVersionItemId,
        priceListItemId: item.priceListItemId,
        itemDescription: item.priceListItemDescription,
        priceListId: item.priceListId,
        priceListName: item.priceListName,
        itemCost: item.priceListItemCost,
        quantity: item.quantity,
        totalPrice: item.totalPrice,
        note: item.note
      }));

      return {
        version,
        package: packageItem ? { packageId: packageItem.packageId, packageName: packageItem.packageName, packageCost: packageItem.packageCost } : null,
        pricelistItems,
        items
      };
    } catch (error) {
      console.error("Error in getVersionComparisonData:", error);
      throw error;
    }
  }

  async deleteQuotation(quotationId) {
    try {
      const { Quotation } = db.sequelize.models;
      const quotation = await Quotation.findByPk(quotationId);
      if (quotation) {
        await quotation.destroy();
        return keysToCamelCase(quotation.get({ plain: true }));
      }
      return null;
    } catch (error) {
      console.error("Error in deleteQuotation:", error);
      throw error;
    }
  }

  async removePackageFromVersion(versionId, packageId, builderId, companyId, transaction = null) {
    const t = transaction || await db.sequelize.transaction();
    try {
      const { QuotationVersion, QuotationVersionItem } = db.sequelize.models;

      const where = { quotation_version_id: versionId };
      if (packageId) where.package_id = packageId;

      await QuotationVersion.update({ package_id: null }, { where, transaction: t });

      await QuotationVersionItem.destroy({
        where: {
          quotation_version_id: versionId,
          package_id: { [db.Sequelize.Op.ne]: null }
        },
        transaction: t
      });

      if (!transaction) await t.commit();
      return { quotation_version_id: versionId };
    } catch (error) {
      if (!transaction) await t.rollback();
      console.error("Error in removePackageFromVersion:", error);
      throw error;
    }
  }

  async addPackageSnapshot(versionId, pkg, transaction = null) {
    try {
      const { QuotationVersionItem } = db.sequelize.models;
      const snapshot = await QuotationVersionItem.create({
        quotation_version_id: versionId,
        package_id: pkg.package_id,
        package_name: pkg.name,
        package_cost: pkg.cost || 0,
        total_price: pkg.cost || 0
      }, { transaction });
      return keysToCamelCase(snapshot.get({ plain: true }));
    } catch (error) {
      console.error("Error in addPackageSnapshot:", error);
      throw error;
    }
  }

  /**
   * Persist a generated quotation report. Upserts the DriveFile record under
   * sub_reference_type=QuotationReport. The legacy `pdf_url` column is no
   * longer written — readers must use the scoped `quotationReports`
   * association (or query DriveFile directly).
   *
   * @param {string} versionId
   * @param {string} s3Key — S3 object key (not the full URL)
   * @param {object} [opts] — { size, originalName, fileName, uploadedBy, transaction, builderId, companyId }
   */
  async updatePdfUrl(versionId, s3Key, opts = {}) {
    const driveFile = await upsertQuotationDriveFile({
      versionId,
      subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT,
      s3Key,
      ...opts,
    });
    return keysToCamelCase(driveFile.get({ plain: true }));
  }

  async clearPdfUrl(versionId, transaction = null) {
    await deleteQuotationDriveFile(
      versionId,
      DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT,
      { transaction },
    );
  }

  async getPdfUrl(versionId) {
    const driveFile = await getQuotationDriveFile(versionId, DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT);
    return driveFile?.s3_key || null;
  }

  async getAllQuotations(builderId, companyId, options = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search = "",
        status = "",
        statuses = [],
        leadIds = [],
        contactIds = [],
        startDate = "",
        endDate = "",
        sortBy = "",
        sortOrder = "",
      } = options;

      const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
      const replacements = { builderId, limit: parseInt(limit, 10), offset };

      let searchCondition = "";
      if (search && search.trim()) {
        searchCondition = `AND (
          q.reference_number ILIKE :search
          OR l.name ILIKE :search
          OR EXISTS (
            SELECT 1 FROM leads_contact_map lcm_s JOIN users u_s ON lcm_s.contact_id = u_s.users_id
            WHERE lcm_s.leads_id = l.leads_id AND (u_s.name ILIKE :search OR u_s.phone ILIKE :search OR u_s.email ILIKE :search)
          )
          OR EXISTS (
            SELECT 1 FROM property_detail pd_s WHERE pd_s.property_detail_id = l.property_detail_id
            AND (COALESCE(pd_s.address_line1, '') ILIKE :search OR COALESCE(pd_s.address_line2, '') ILIKE :search OR COALESCE(pd_s.city, '') ILIKE :search)
          )
          OR COALESCE(assignee_user.name, '') ILIKE :search
          OR COALESCE(created_by_user.name, '') ILIKE :search
        )`;
        replacements.search = `%${search.trim()}%`;
      }

      const expiredCondition = `(qv.quotation_version_id IS NOT NULL AND qv.is_approve = FALSE AND NOW() > ((CASE WHEN COALESCE(qs.extend_validity_from_updated_date, 0) = 1 THEN COALESCE(qv.updated_at, qv.created_at, q.updated_at, q.created_at) ELSE COALESCE(qv.created_at, q.created_at) END) + (COALESCE(qs.quotation_validity_days, 30) || ' days')::interval))`;
      const approvedCondition = `(qv.quotation_version_id IS NOT NULL AND qv.is_approve = TRUE)`;
      const cancelledCondition = "(COALESCE(LOWER(l.status), '') = 'cancelled')";
      const activeDraftCondition = `(qv.quotation_version_id IS NOT NULL AND qv.is_approve = FALSE AND NOT ${expiredCondition} AND NOT ${cancelledCondition})`;

      let statusCondition = "";
      const normalizedStatuses = (Array.isArray(statuses) && statuses.length > 0 ? statuses : status ? [status] : []).map(s => String(s).trim()).filter(Boolean);
      if (normalizedStatuses.length > 0) {
        const conditions = [];
        if (normalizedStatuses.includes("approved")) conditions.push(approvedCondition);
        if (normalizedStatuses.includes("expired")) conditions.push(expiredCondition);
        if (normalizedStatuses.includes("cancelled")) conditions.push(cancelledCondition);
        if (normalizedStatuses.some(s => ["draft", "pendingApproval", "modified"].includes(s))) conditions.push(activeDraftCondition);
        if (conditions.length > 0) statusCondition = `AND (${conditions.join(" OR ")})`;
      }

      let leadCondition = "";
      if (Array.isArray(leadIds) && leadIds.length > 0) {
        leadCondition = ` AND l.leads_id IN (:leadIds)`;
        replacements.leadIds = leadIds;
      }

      let contactCondition = "";
      if (Array.isArray(contactIds) && contactIds.length > 0) {
        contactCondition = ` AND EXISTS (SELECT 1 FROM leads_contact_map lcm_filter WHERE lcm_filter.leads_id = l.leads_id AND lcm_filter.contact_id IN (:contactIds))`;
        replacements.contactIds = contactIds;
      }

      let dateCondition = "";
      if (startDate) {
        dateCondition += ` AND q.created_at >= :startDate`;
        replacements.startDate = startDate;
      }
      if (endDate) {
        dateCondition += ` AND q.created_at <= :endDate`;
        replacements.endDate = endDate;
      }

      const normalizedSortOrder = String(sortOrder || "").toLowerCase() === "asc" ? "ASC" : "DESC";
      const sortFieldMap = { createdAt: "created_at", quotationTotal: "quotation_total", referenceNumber: "q.reference_number", customerName: "customer_name", status: "status" };
      const orderByClause = sortFieldMap[sortBy] ? `${sortFieldMap[sortBy]} ${normalizedSortOrder}, q.created_at DESC` : "q.created_at DESC";

      const companyCondition = companyId ? ` OR l.company_id = :companyId` : "";
      if (companyId) replacements.companyId = companyId;

      // A quotation is sample data because its lead is, so the lead alias is
      // what this filters. Without it a company where two people imported the
      // demo dataset listed every demo quotation twice.
      const leadSampleScope = sampleDataSqlScope("l");
      const sampleCondition = leadSampleScope.sql ? ` AND ${leadSampleScope.sql}` : "";
      Object.assign(replacements, leadSampleScope.replacements);

      const countQuery = `
        SELECT COUNT(DISTINCT qv.quotation_version_id) as total
        FROM quotation q
        LEFT JOIN quotation_version qv ON qv.quotation_id = q.quotation_id
        JOIN leads l ON q.leads_id = l.leads_id
        LEFT JOIN quotation_settings qs ON qs.builder_id = l.builder_id AND qs.company_id = l.company_id
        LEFT JOIN users assignee_user ON l.assignee_id = assignee_user.users_id
        LEFT JOIN users created_by_user ON q.created_by = created_by_user.users_id
        WHERE (l.builder_id = :builderId${companyCondition})${sampleCondition}
        ${searchCondition} ${statusCondition} ${leadCondition} ${contactCondition} ${dateCondition}
      `;
      const countResult = await db.sequelize.query(countQuery, { replacements, type: db.Sequelize.QueryTypes.SELECT });
      const total = parseInt(countResult[0].total, 10);

      const dataQuery = `
        SELECT q.quotation_id, q.reference_number, q.leads_id, COALESCE(qv.created_at, q.created_at) AS created_at, q.updated_at,
          l.name AS customer_name,
          COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(pd.lot_number, ''), ''), NULLIF(TRIM(pd.street, ''), ''), NULLIF(TRIM(pd.address_line1, ''), ''), NULLIF(TRIM(pd.address_line2, ''), ''), NULLIF(TRIM(pd.city, ''), ''), NULLIF(TRIM(st.name, ''), ''), NULLIF(TRIM(pd.zip_code, ''), ''))), ''), 'N/A') AS property_details,
          COALESCE((SELECT u.name FROM leads_contact_map lcm JOIN users u ON lcm.contact_id = u.users_id WHERE lcm.leads_id = l.leads_id ORDER BY lcm.created_at ASC LIMIT 1), l.name, 'N/A') AS contact_name,
          COALESCE(assignee_user.name, '') AS assignee_name, COALESCE(assignee_user.initials, '') AS assignee_initials,
          COALESCE(created_by_user.name, '') AS approver_name, COALESCE(created_by_user.initials, '') AS approver_initials,
          CASE WHEN ${cancelledCondition} THEN 'cancelled' WHEN ${approvedCondition} THEN 'approved' WHEN ${expiredCondition} THEN 'expired' ELSE 'draft' END AS status,
          qv.quotation_version_id AS latest_version_id, qv.quotation_version_no AS latest_version_no,
          ${grandTotalSql("qv.quotation_version_id", "qv")} AS quotation_total,
          (SELECT COUNT(*) FROM quotation_version qv_cnt WHERE qv_cnt.quotation_id = q.quotation_id) AS version_count,
          -- Terms & Conditions link for the row's "T&C" action. The synced
          -- snapshot's token wins so the link opens the exact wording that
          -- quotation carries; the builder's live token is the fallback.
          -- terms_is_synced drives the "not synced yet" hint in the list.
          ${termsTokenSql("qv", "l")} AS terms_public_token,
          ${termsIsSyncedSql("qv")} AS terms_is_synced
        FROM quotation q
        LEFT JOIN quotation_version qv ON qv.quotation_id = q.quotation_id
        JOIN leads l ON q.leads_id = l.leads_id
        LEFT JOIN quotation_settings qs ON qs.builder_id = l.builder_id AND qs.company_id = l.company_id
        LEFT JOIN users assignee_user ON l.assignee_id = assignee_user.users_id
        LEFT JOIN users created_by_user ON q.created_by = created_by_user.users_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state st ON pd.state_id = st.state_id
        WHERE (l.builder_id = :builderId${companyCondition})${sampleCondition}
        ${searchCondition} ${statusCondition} ${leadCondition} ${contactCondition} ${dateCondition}
        ORDER BY ${orderByClause} LIMIT :limit OFFSET :offset
      `;
      const rows = await db.sequelize.query(dataQuery, { replacements, type: db.Sequelize.QueryTypes.SELECT });

      return {
        data: rows.map(row => keysToCamelCase(row)),
        pagination: { total, page: parseInt(page, 10), limit: parseInt(limit, 10), totalPages: Math.ceil(total / parseInt(limit, 10)) }
      };
    } catch (error) {
      console.error("Error in getAllQuotations:", error);
      throw error;
    }
  }

  /**
   * Colour usage is two hops removed from a quotation and cannot be joined by id.
   *
   * A quotation never references a colour. Colours are chosen at the job stage,
   * and `job.quotation_version_id` points back at the version the job came from.
   * On top of that, a job *clones* the entire colour tree into its own tables
   * (job_color / job_color_category / job_color_item) with no FK back to the
   * master rows, so `job_color_selection.color_item_id` normally holds a
   * `job_color_item` id — not a master `color_item` id.
   *
   * The clone copies `item_code` and `item_name`, and `job_color.template_color_id`
   * keeps a real FK to the master colour. Matching on all three is what pins a
   * job's selection back to the master item: item_code alone is not unique
   * (two different master items can share a code under different colours).
   *
   * Selections made before the job's colours were cloned still hold the master
   * id directly, so that case is accepted too — the same reconciliation
   * jobService.getColorSelections() performs when it heals stored ids.
   *
   * @param {string} masterItemPredicate condition on the master `color_item ci`
   */
  static colorUsageCondition(masterItemPredicate) {
    return `EXISTS (
      SELECT 1
      FROM job j
      JOIN job_color_selection jcs ON jcs.job_id = j.job_id
      LEFT JOIN job_color_item jci ON jci.color_item_id = jcs.color_item_id
      LEFT JOIN job_color jc ON jc.color_id = jci.color_id
      JOIN color_item ci ON (
        ci.color_item_id = jcs.color_item_id
        OR (
          ci.item_code = jci.item_code
          AND ci.item_name = jci.item_name
          AND (jc.template_color_id IS NULL OR jc.template_color_id = ci.color_id)
        )
      )
      WHERE j.quotation_version_id = qv.quotation_version_id
        AND (${masterItemPredicate})
    )`;
  }

  /**
   * SQL fragment that decides whether a quotation_version (alias `qv`) uses the
   * master-data entity identified by :entityId. Each entry is correlated to `qv`
   * so it can be dropped straight into the WHERE clause as an EXISTS-style guard.
   */
  static USAGE_CONDITIONS = {
    "price-list": `EXISTS (
      SELECT 1 FROM quotation_version_items qvi
      WHERE qvi.quotation_version_id = qv.quotation_version_id AND qvi.price_list_id = :entityId
    )`,
    "price-list-item": `EXISTS (
      SELECT 1 FROM quotation_version_items qvi
      WHERE qvi.quotation_version_id = qv.quotation_version_id AND qvi.price_list_item_id = :entityId
    ) OR EXISTS (
      SELECT 1 FROM quotation_version_pricelist_item_map qvpm
      WHERE qvpm.quotation_version_id = qv.quotation_version_id AND qvpm.price_list_item_id = :entityId
    )`,
    "floor-plan": `qv.floor_plan_id = :entityId`,
    facade: `qv.facade_id = :entityId`,
    package: `qv.package_id = :entityId OR EXISTS (
      SELECT 1 FROM quotation_version_items qvi
      WHERE qvi.quotation_version_id = qv.quotation_version_id AND qvi.package_id = :entityId
    ) OR EXISTS (
      SELECT 1 FROM quotation_version_package_map qvpkg
      WHERE qvpkg.quotation_version_id = qv.quotation_version_id AND qvpkg.package_id = :entityId
    )`,
    // One colour tree, four levels of granularity — see colorUsageCondition().
    // "color" is the top-level colour, which has categories, which have items.
    color: QuotationRepository.colorUsageCondition(
      `ci.color_id = :entityId OR EXISTS (
        SELECT 1 FROM color_category cc
        WHERE cc.color_category_id = ci.color_category_id AND cc.color_id = :entityId
      )`,
    ),
    "color-category": QuotationRepository.colorUsageCondition(`ci.color_category_id = :entityId`),
    "color-item": QuotationRepository.colorUsageCondition(`ci.color_item_id = :entityId`),
    "color-group": QuotationRepository.colorUsageCondition(
      `EXISTS (
        SELECT 1 FROM color_group_item_map cgim
        WHERE cgim.color_item_id = ci.color_item_id AND cgim.color_group_id = :entityId
      )`,
    ),
  };

  static USAGE_ENTITY_TYPES = Object.keys(QuotationRepository.USAGE_CONDITIONS);

  /**
   * Quotation versions that reference a given master-data entity, shaped for the
   * "Quotation History" drawer on the settings master pages.
   *
   * Status derivation mirrors getAllQuotations() so the same quotation never
   * shows one status on the quotation list and another one here. "modified" is
   * the drawer's label for an unapproved, still-valid version (`draft` in the
   * quotation list) — a version that has been revised but not signed off.
   */
  async getQuotationUsageHistory(builderId, companyId, entityType, entityId, options = {}) {
    try {
      const usageCondition = QuotationRepository.USAGE_CONDITIONS[entityType];
      if (!usageCondition) {
        throw { status: 400, message: `Unsupported entity type: ${entityType}` };
      }

      const {
        page = 1,
        limit = 10,
        referenceNo = "",
        customerName = "",
        propertyAddress = "",
        quotationStatus = "",
        leadStatus = "",
      } = options;

      const parsedPage = Math.max(parseInt(page, 10) || 1, 1);
      const parsedLimit = Math.min(Math.max(parseInt(limit, 10) || 10, 1), 100);
      const replacements = {
        builderId,
        entityId,
        limit: parsedLimit,
        offset: (parsedPage - 1) * parsedLimit,
      };

      const companyCondition = companyId ? ` OR l.company_id = :companyId` : "";
      if (companyId) replacements.companyId = companyId;

      // Same definitions as getAllQuotations — keep the two in sync.
      const expiredCondition = `(qv.is_approve = FALSE AND NOW() > ((CASE WHEN COALESCE(qs.extend_validity_from_updated_date, 0) = 1 THEN COALESCE(qv.updated_at, qv.created_at, q.updated_at, q.created_at) ELSE COALESCE(qv.created_at, q.created_at) END) + (COALESCE(qs.quotation_validity_days, 30) || ' days')::interval))`;
      const approvedCondition = `(qv.is_approve = TRUE)`;
      const cancelledCondition = `(COALESCE(LOWER(l.status), '') = 'cancelled')`;
      const modifiedCondition = `(qv.is_approve = FALSE AND NOT ${expiredCondition} AND NOT ${cancelledCondition})`;
      const statusExpression = `CASE WHEN ${cancelledCondition} THEN 'Cancelled' WHEN ${approvedCondition} THEN 'Approved' WHEN ${expiredCondition} THEN 'Expired' ELSE 'Modified' END`;

      const closedWonCondition = `EXISTS (SELECT 1 FROM opportunity op WHERE op.leads_id = l.leads_id AND LOWER(COALESCE(op.out_come, '')) = 'won')`;
      const leadStatusExpression = `CASE WHEN ${closedWonCondition} THEN 'Closed Won' ELSE 'Open' END`;

      const propertyExpression = `COALESCE(NULLIF(TRIM(CONCAT_WS(', ', NULLIF(TRIM(pd.lot_number, ''), ''), NULLIF(TRIM(pd.street, ''), ''), NULLIF(TRIM(pd.address_line1, ''), ''), NULLIF(TRIM(pd.address_line2, ''), ''), NULLIF(TRIM(pd.city, ''), ''), NULLIF(TRIM(st.name, ''), ''), NULLIF(TRIM(pd.zip_code, ''), ''))), ''), 'N/A')`;
      const customerExpression = `COALESCE(NULLIF(TRIM(l.name), ''), 'N/A')`;

      const filterConditions = [];
      if (String(referenceNo || "").trim()) {
        filterConditions.push(`q.reference_number ILIKE :referenceNo`);
        replacements.referenceNo = `%${String(referenceNo).trim()}%`;
      }
      if (String(customerName || "").trim()) {
        filterConditions.push(`${customerExpression} ILIKE :customerName`);
        replacements.customerName = `%${String(customerName).trim()}%`;
      }
      if (String(propertyAddress || "").trim()) {
        filterConditions.push(`${propertyExpression} ILIKE :propertyAddress`);
        replacements.propertyAddress = `%${String(propertyAddress).trim()}%`;
      }

      const normalizedStatus = String(quotationStatus || "").trim().toLowerCase();
      const statusConditionMap = {
        approved: approvedCondition,
        cancelled: cancelledCondition,
        expired: `${expiredCondition} AND NOT ${cancelledCondition}`,
        modified: modifiedCondition,
      };
      if (normalizedStatus && normalizedStatus !== "all") {
        if (!statusConditionMap[normalizedStatus]) {
          throw { status: 400, message: `Unsupported quotation status filter: ${quotationStatus}` };
        }
        filterConditions.push(`(${statusConditionMap[normalizedStatus]})`);
      }

      const normalizedLeadStatus = String(leadStatus || "").trim().toLowerCase();
      if (normalizedLeadStatus && normalizedLeadStatus !== "all") {
        if (normalizedLeadStatus === "closed won") {
          filterConditions.push(closedWonCondition);
        } else if (normalizedLeadStatus === "open") {
          filterConditions.push(`NOT ${closedWonCondition}`);
        } else {
          throw { status: 400, message: `Unsupported lead status filter: ${leadStatus}` };
        }
      }

      const filterCondition = filterConditions.length ? `AND ${filterConditions.join(" AND ")}` : "";

      const fromClause = `
        FROM quotation_version qv
        JOIN quotation q ON q.quotation_id = qv.quotation_id
        JOIN leads l ON q.leads_id = l.leads_id
        LEFT JOIN quotation_settings qs ON qs.builder_id = l.builder_id AND qs.company_id = l.company_id
        LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
        LEFT JOIN state st ON pd.state_id = st.state_id
        WHERE (l.builder_id = :builderId${companyCondition})
          AND (${usageCondition})
          ${filterCondition}
      `;

      const countResult = await db.sequelize.query(
        `SELECT COUNT(DISTINCT qv.quotation_version_id) AS total ${fromClause}`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT },
      );
      const total = parseInt(countResult[0]?.total, 10) || 0;

      const rows = total === 0 ? [] : await db.sequelize.query(
        `SELECT
          qv.quotation_version_id,
          qv.quotation_version_no,
          q.quotation_id,
          q.leads_id,
          q.reference_number AS reference_no,
          ${customerExpression} AS customer_name,
          ${propertyExpression} AS property_address,
          ${statusExpression} AS quotation_status,
          ${leadStatusExpression} AS lead_status,
          COALESCE(qv.created_at, q.created_at) AS created_at
        ${fromClause}
        ORDER BY COALESCE(qv.created_at, q.created_at) DESC, qv.quotation_version_no DESC
        LIMIT :limit OFFSET :offset`,
        { replacements, type: db.Sequelize.QueryTypes.SELECT },
      );

      return {
        data: rows.map(row => keysToCamelCase(row)),
        pagination: {
          total,
          page: parsedPage,
          limit: parsedLimit,
          totalPages: Math.ceil(total / parsedLimit),
        },
      };
    } catch (error) {
      if (!error.status) console.error("Error in getQuotationUsageHistory:", error);
      throw error;
    }
  }

  async getQuotationFilterOptions(builderId, companyId) {
    try {
      const replacements = { builderId };
      const companyCondition = companyId ? "OR l.company_id = :companyId" : "";
      if (companyId) replacements.companyId = companyId;

      const query = `
        SELECT DISTINCT opts.option_type, opts.option_id, opts.option_label, opts.leads_id, opts.customer_name, opts.contact_name
        FROM leads l
        LEFT JOIN leads_contact_map lcm ON l.leads_id = lcm.leads_id
        LEFT JOIN users u ON lcm.contact_id = u.users_id
        CROSS JOIN LATERAL (
          VALUES
            ('lead', l.leads_id::text, COALESCE(NULLIF(TRIM(l.name), ''), 'Unknown'), l.leads_id, COALESCE(NULLIF(TRIM(l.name), ''), 'Unknown'), NULL::text),
            ('contact', COALESCE(u.users_id::text, ''), CASE WHEN u.users_id IS NULL THEN NULL ELSE CONCAT(COALESCE(NULLIF(TRIM(u.name), ''), 'Unknown Contact'), ' (', COALESCE(NULLIF(TRIM(l.name), ''), 'Unknown'), ')') END, l.leads_id, COALESCE(NULLIF(TRIM(l.name), ''), 'Unknown'), COALESCE(NULLIF(TRIM(u.name), ''), 'Unknown Contact'))
        ) AS opts(option_type, option_id, option_label, leads_id, customer_name, contact_name)
        WHERE (l.builder_id = :builderId ${companyCondition}) AND opts.option_label IS NOT NULL AND opts.option_id <> ''
        ORDER BY option_label ASC
      `;
      const rows = await db.sequelize.query(query, { replacements, type: db.Sequelize.QueryTypes.SELECT });
      return rows.map(row => keysToCamelCase(row));
    } catch (error) {
      console.error("Error in getQuotationFilterOptions:", error);
      throw error;
    }
  }

  async getQuotationCountsByStatus(builderId, companyId) {
    try {
      const replacements = { builderId };
      const companyCondition = companyId ? ` OR l.company_id = :companyId` : "";
      if (companyId) replacements.companyId = companyId;

      const query = `
        WITH quotation_versions AS (
          SELECT qv.quotation_version_id, l.builder_id, l.company_id, LOWER(COALESCE(l.status, '')) AS lead_status, qv.is_approve,
            qv.created_at AS version_created_at, qv.updated_at AS version_updated_at, q.created_at AS quotation_created_at,
            COALESCE(qs.quotation_validity_days, 30) AS quotation_validity_days, COALESCE(qs.extend_validity_from_updated_date, 0) AS extend_validity_from_updated_date
          FROM quotation q
          LEFT JOIN quotation_version qv ON qv.quotation_id = q.quotation_id
          JOIN leads l ON q.leads_id = l.leads_id
          LEFT JOIN quotation_settings qs ON qs.builder_id = l.builder_id AND qs.company_id = l.company_id
          WHERE (l.builder_id = :builderId${companyCondition})
        )
        SELECT COUNT(DISTINCT quotation_version_id) AS total,
          COUNT(DISTINCT CASE WHEN is_approve = TRUE THEN quotation_version_id END) AS approved,
          COUNT(DISTINCT CASE WHEN lead_status = 'cancelled' THEN quotation_version_id END) AS cancelled,
          COUNT(DISTINCT CASE WHEN is_approve = FALSE AND NOW() > ((CASE WHEN extend_validity_from_updated_date = 1 THEN COALESCE(version_updated_at, version_created_at, quotation_created_at) ELSE COALESCE(version_created_at, quotation_created_at) END) + (quotation_validity_days || ' days')::interval) THEN quotation_version_id END) AS expired,
          COUNT(DISTINCT CASE WHEN is_approve = FALSE AND lead_status <> 'cancelled' AND NOW() <= ((CASE WHEN extend_validity_from_updated_date = 1 THEN COALESCE(version_updated_at, version_created_at, quotation_created_at) ELSE COALESCE(version_created_at, quotation_created_at) END) + (quotation_validity_days || ' days')::interval) THEN quotation_version_id END) AS draft
        FROM quotation_versions
      `;
      const rows = await db.sequelize.query(query, { replacements, type: db.Sequelize.QueryTypes.SELECT });
      return rows.length > 0 ? keysToCamelCase(rows[0]) : { total: 0, approved: 0, draft: 0, expired: 0 };
    } catch (error) {
      console.error("Error in getQuotationCountsByStatus:", error);
      throw error;
    }
  }

  /**
   * Returns all facade IDs mapped to the given floor plan.
   * Returns an empty array if the floor plan has no facade mappings.
   */
  async getFloorPlanFacadeMappings(floorPlanId, transaction = null) {
    try {
      const query = `SELECT facade_id FROM floor_plan_facade_map WHERE floor_plan_id = :floorPlanId`;
      return await db.sequelize.query(query, {
        replacements: { floorPlanId },
        type: db.Sequelize.QueryTypes.SELECT,
        transaction
      });
    } catch (error) {
      console.error("Error in getFloorPlanFacadeMappings:", error);
      throw error;
    }
  }

  /**
   * Removes quotation_version_items rows that were auto-mapped from a given floor plan's
   * price list item mapping. Package items and manually-added items are preserved.
   */
  async removeFloorPlanPricelistItems(versionId, floorPlanId, transaction = null) {
    try {
      const query = `
        DELETE FROM quotation_version_items
        WHERE quotation_version_id = :versionId AND package_id IS NULL
          AND price_list_item_id IN (SELECT price_list_item_id FROM floor_plan_pricelist_item_map WHERE floor_plan_id = :floorPlanId)
      `;
      await db.sequelize.query(query, {
        replacements: { versionId, floorPlanId },
        transaction
      });
    } catch (error) {
      console.error("Error in removeFloorPlanPricelistItems:", error);
      throw error;
    }
  }

  /**
   * Auto-inserts price list items mapped to the given floor plan into quotation_version_items.
   * Uses a single INSERT...SELECT at the DB level, skipping items already present (by price_list_item_id).
   * Quantity comes from floor_plan_pricelist_item_map; total_price = cost * quantity.
   */
  async autoMapFloorPlanPricelistItems(versionId, floorPlanId, transaction = null) {
    try {
      const query = `
        INSERT INTO quotation_version_items (
          quotation_version_id, price_list_id, price_list_name, price_list_item_id,
          price_list_item_description, price_list_item_short_description,
          price_list_item_cost_type, price_list_item_cost_type_text,
          price_list_item_cost_option, price_list_item_cost,
          price_list_item_builder_cost, price_list_item_sort_order,
          price_list_item_uom, price_list_item_status,
          price_list_item_include_by_default, price_list_item_allow_remove_from_quotation,
          price_list_item_show_in_hl_package, price_list_item_package_only,
          price_list_item_range_id, price_list_item_dwelling_type_id,
          price_list_item_created_at, price_list_item_updated_at,
          quantity, total_price, created_at, updated_at
        )
        SELECT :versionId, pli.price_list_id, pl.name, fpim.price_list_item_id,
          pli.item_description, pli.short_description, pli.cost_type, pli.cost_type_text,
          pli.cost_option, pli.cost, pli.builder_cost, pli.sort_order, pli.uom, pli.status,
          pli.include_by_default, pli.allow_remove_from_quotation, pli.show_in_hl_package,
          pli.show_only_in_package, pli.range_id, pli.dwelling_type_id, pli.created_at, pli.updated_at,
          COALESCE(fpim.quantity, 1), COALESCE(pli.cost, 0) * COALESCE(fpim.quantity, 1),
          CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
        FROM floor_plan_pricelist_item_map fpim
        JOIN price_list_item pli ON fpim.price_list_item_id = pli.price_list_item_id
        JOIN price_list pl ON pli.price_list_id = pl.price_list_id
        WHERE fpim.floor_plan_id = :floorPlanId AND pli.status = 'active'
          AND fpim.price_list_item_id NOT IN (
            SELECT price_list_item_id FROM quotation_version_items
            WHERE quotation_version_id = :versionId AND price_list_item_id IS NOT NULL
          )
      `;
      await db.sequelize.query(query, {
        replacements: { versionId, floorPlanId },
        transaction
      });
    } catch (error) {
      console.error("Error in autoMapFloorPlanPricelistItems:", error);
      throw error;
    }
  }
}

export default new QuotationRepository();

