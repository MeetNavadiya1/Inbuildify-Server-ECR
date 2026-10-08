import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  createHouseLandPackageService,
  getAllHouseLandPackagesService,
  updateHouseLandPackageService,
  deleteHouseLandPackageService,
  getHouseLandPackageByIdService,
} from "./house-land-package.service.js";

// Reusable subquery columns for related entity details
const RELATED_ENTITY_SUBQUERIES = `
  (SELECT name FROM dwelling_type WHERE dwelling_type_id = __alias__.dwelling_type_id LIMIT 1) AS dwelling_type_name,
  (SELECT name FROM range WHERE range_id = __alias__.range_id LIMIT 1) AS range_name,
  (SELECT name FROM template_email WHERE template_email_id = __alias__.template_id LIMIT 1) AS template_name,
  (SELECT name FROM facade WHERE facade_id = __alias__.facade_id LIMIT 1) AS facade_name,
  (SELECT image FROM facade WHERE facade_id = __alias__.facade_id LIMIT 1) AS facade_image,
  (SELECT name FROM floor_plan WHERE floor_plan_id = __alias__.floor_plan_id LIMIT 1) AS floor_plan_name,
  (SELECT simple_image FROM floor_plan WHERE floor_plan_id = __alias__.floor_plan_id LIMIT 1) AS floor_plan_simple_image,
  (SELECT name FROM users WHERE users_id = __alias__.contact_id LIMIT 1) AS contact_name,
  (SELECT email FROM users WHERE users_id = __alias__.contact_id LIMIT 1) AS contact_email,
  (SELECT phone FROM users WHERE users_id = __alias__.contact_id LIMIT 1) AS contact_phone
`;

const getEntitySubqueries = (alias) => RELATED_ENTITY_SUBQUERIES.replace(/__alias__/g, alias);

const formatHouseLandPackageData = (row) => {
  const priceSum = parseFloat(row.price_sum || 0);
  const commissionSum = parseFloat(row.commission_sum || 0);
  const data = keysToCamelCase(row);

  let landPrice = 0;
  if (row.lot_details && row.lot_details.price) {
    landPrice = parseFloat(row.lot_details.price);
  }

  const houseTotal = priceSum + commissionSum;

  return {
    // Identity
    houseLandPackageId: data.houseLandPackageId,
    companyId: data.companyId,
    builderId: data.builderId,
    title: data.title,

    // Related entities (nested)
    dwellingType: data.dwellingTypeId ? {
      id: data.dwellingTypeId,
      name: data.dwellingTypeName || null,
    } : null,

    range: data.rangeId ? {
      id: data.rangeId,
      name: data.rangeName || null,
    } : null,

    template: data.templateId ? {
      id: data.templateId,
      name: data.templateName || null,
    } : null,

    facade: data.facadeId ? {
      id: data.facadeId,
      name: data.facadeName || null,
      image: data.facadeImage || null,
    } : null,

    floorPlan: data.floorPlanId ? {
      id: data.floorPlanId,
      name: data.floorPlanName || null,
      simpleImage: data.floorPlanSimpleImage || null,
    } : null,

    contact: data.contactId ? {
      id: data.contactId,
      name: data.contactName || null,
      email: data.contactEmail || null,
      phone: data.contactPhone || null,
    } : null,

    contactShowPdf: data.contactShowPdf || null,

    // Lot & Package Group
    lotDetails: data.lotDetails || null,
    packageGroupId: data.packageGroupId || null,

    // Floor plan description
    floorPlanDescription: data.floorPlanDescription || null,

    // Pricing
    priceType: data.priceType || null,
    landPrice,
    houseTotal,
    commissionTotal: commissionSum,
    totalPrice: houseTotal + landPrice,

    // Description & Disclaimer
    packageDescription: data.packageDescription || null,
    houseFeatureId: data.houseFeatureId || null,
    disclaimerType: data.disclaimerType || null,
    disclaimerDescription: data.disclaimerDescription || null,

    // Attachments
    attachFiles: data.attachFiles || [],

    // Audit
    createdByName: data.createdByName || null,
    createdBy: data.createdBy || null,
    updatedBy: data.updatedBy || null,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
  };
};

export async function createHouseLandPackage(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const userId = req.user?.users_id;

    const data = await createHouseLandPackageService({
      userId,
      builderId,
      companyId,
      data: req.body,
    });

    const formattedData = formatHouseLandPackageData(data);

    return successResponse(
      res,
      formattedData,
      "House land package created successfully and default commissions mapped",
    );
  } catch (error) {
    console.error("Create house land package error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error",
    );
  }
}

export async function getAllHouseLandPackages(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    const { packages, total } = await getAllHouseLandPackagesService(req.query, {
      builderId,
      companyId,
    });

    const limitNum = parseInt(req.query.limit || 25, 10);
    const pageNum = parseInt(req.query.page || 1, 10);
    const totalPages = Math.ceil(total / limitNum);

    return successResponse(res, {
      houseLandPackages: packages,
      pagination: {
        totalRecords: total,
        currentPage: pageNum,
        limit: limitNum,
        totalPages,
      },
    });
  } catch (error) {
    console.error("Get all house land packages error:", error);
    return handleControllerError(res, error, "Internal server error");
  }
}

export async function getHouseLandPackageById(req, res) {
  try {
    const { house_land_package_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    const data = await getHouseLandPackageByIdService(house_land_package_id, {
      builderId,
      companyId,
    });

    const formattedData = formatHouseLandPackageData(data);

    return successResponse(
      res,
      formattedData,
      "House land package fetched successfully",
    );
  } catch (error) {
    console.error("Get house land package by ID error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error",
    );
  }
}

export async function updateHouseLandPackage(req, res) {
  try {
    const { house_land_package_id } = req.params;
    const userId = req.user?.users_id;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    const result = await updateHouseLandPackageService({
      houseLandPackageId: house_land_package_id,
      userId,
      builderId,
      companyId,
      data: req.body,
      files: req.files,
    });

    const formattedData = formatHouseLandPackageData(result);

    return successResponse(
      res,
      formattedData,
      "House land package updated successfully",
    );

  } catch (error) {
    console.error("Update house land package error:", error);
    return handleControllerError(res, error, error.message || "Internal server error");
  }
}

export async function deleteHouseLandPackage(req, res) {
  try {
    const { house_land_package_id } = req.params;
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId && !companyId) {
      return errorResponse(res, 401, "Unauthorized: User must belong to either a builder or company");
    }

    await deleteHouseLandPackageService(house_land_package_id, {
      builderId,
      companyId,
    });

    return successResponse(
      res,
      "House land package deleted successfully",
    );
  } catch (error) {
    console.error("Delete house land package error:", error);
    return handleControllerError(res, error,
      error.message || "Internal server error",
    );
  }
}
