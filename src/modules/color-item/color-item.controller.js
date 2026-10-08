import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import ColorItemService from "./color-item.service.js";
import { keysToSnakeCase } from "../../utils/common.js";

const {
  createColorItemService,
  getColorItemsWithoutCategoryService,
  getAllColorItemsService,
  getColorItemByIdService,
  updateColorItemService,
  deleteColorItemService,
  deleteImageFieldService,
  colorItemMoveService,
  copyColorItemService,
  generateColorPdfService,
  generateColorEmailService,
} = ColorItemService;

/**
 * Fetches color items that have no category assigned.
 */
export async function getColorItemsWithoutCategory(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { color_group_id } = req.query;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const colorItems = await getColorItemsWithoutCategoryService({
      builderId,
      companyId,
      colorGroupId: color_group_id,
    });

    return successResponse(
      res,
      colorItems,
      "Color items without category fetched successfully",
    );
  } catch (error) {
    console.error("Get color items without category error:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}

export async function createColorItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;

    if (!builderId || !companyId) {
      return errorResponse(res, 401, "Unauthorized.");
    }

    const {
      item_name,
      item_code,
      supplier_id,
      color_category_id,
      upgrade_option,
      cost_type: rawCostType,
      cost,
      features,
      description,
      specification_name,
      units: rawUnits,
      sort_order,
      color_type_id,
      range_id,
      status: rawStatus,
      default_image_index,
      custom_fields,
      color_id,
      color_group_id,
    } = req.body;

    // Normalize multipart/form-data fields
    const cost_type = !rawCostType || rawCostType.trim() === "" ? "standard" : rawCostType.trim();
    const units = !rawUnits || rawUnits.trim() === "" ? "non_mandatory" : rawUnits.trim();
    const status =
      rawStatus === undefined || rawStatus === "" || rawStatus === null
        ? true
        : rawStatus === "true" || rawStatus === true;

    // --- color_id / color_category_id / color_group_id validation ---
    const hasColorId = !!color_id;
    const hasColorCategoryId = !!color_category_id;
    const hasColorGroupId = !!color_group_id;

    if (hasColorGroupId) {
      if (hasColorId !== hasColorCategoryId) {
        return errorResponse(
          res,
          400,
          "When color_group_id is provided, color_id and color_category_id must both be sent together or both omitted.",
        );
      }
    } else {
      if (!hasColorCategoryId) {
        return errorResponse(
          res,
          400,
          "color_category_id is required when color_group_id is not provided.",
        );
      }
      if (hasColorId) {
        return errorResponse(
          res,
          400,
          "color_id must not be provided when color_group_id is not used. Only color_category_id is accepted in this case.",
        );
      }
    }

    let parsedCustomFields = [];
    if (typeof custom_fields === "string") {
      try {
        const parsed = JSON.parse(custom_fields);
        parsedCustomFields = Array.isArray(parsed) ? parsed : [parsed];
      } catch (e) {
        return errorResponse(
          res,
          400,
          "Invalid custom fields format. Please ensure you are using valid JSON with double quotes for keys.",
        );
      }
    } else if (Array.isArray(custom_fields)) {
      parsedCustomFields = custom_fields;
    } else if (typeof custom_fields === "object" && custom_fields !== null) {
      parsedCustomFields = [custom_fields];
    }
    parsedCustomFields = keysToSnakeCase(parsedCustomFields);

    if (!color_category_id && parsedCustomFields.length > 0) {
      return errorResponse(
        res,
        400,
        "Color category ID is required when providing custom fields.",
      );
    }

    let finalColorTypeIds = null;
    let finalRangeIds = null;

    if (!color_category_id && (color_type_id || range_id)) {
      return errorResponse(
        res,
        400,
        "Color category ID is required when providing color type IDs or range IDs.",
      );
    }

    if (color_category_id && (color_type_id || range_id)) {
      const parseIds = (idField) => {
        let ids = idField;
        if (Array.isArray(idField)) {
          if (idField.length === 1 && typeof idField[0] === "string") {
            try {
              const parsed = JSON.parse(idField[0]);
              if (Array.isArray(parsed)) ids = parsed;
            } catch (e) { }
          }
        } else if (typeof idField === "string") {
          try {
            ids = JSON.parse(idField);
          } catch (e) {
            return { error: true };
          }
        }
        if (typeof ids === "string" || !Array.isArray(ids) || ids.length === 0) {
          return { error: true };
        }
        return ids;
      };

      if (color_type_id) {
        const resIds = parseIds(color_type_id);
        if (resIds.error) return errorResponse(res, 400, "Invalid color type ID format.");
        finalColorTypeIds = resIds;
      }
      if (range_id) {
        const resIds = parseIds(range_id);
        if (resIds.error) return errorResponse(res, 400, "Invalid range ID format.");
        finalRangeIds = resIds;
      }
    }

    const colorImages = req.files?.colorImage || [];
    const specificationFiles = req.files?.specification || [];

    if (!item_name?.trim()) return errorResponse(res, 400, "Item name is required.");
    if (!item_code?.trim()) return errorResponse(res, 400, "Item code is required.");

    if (cost_type === "standard") {
      if (upgrade_option || cost) {
        return errorResponse(res, 400, "Upgrade option or cost cannot be set when cost type is standard.");
      }
    } else if (cost_type === "upgrade") {
      if (!upgrade_option) return errorResponse(res, 400, "Upgrade option is required when cost type is upgrade.");
      if (!["fixed", "start_from", "tba"].includes(upgrade_option)) {
        return errorResponse(res, 400, "Upgrade option must be one of: fixed, start_from, tba.");
      }
      if (upgrade_option === "tba" && cost) return errorResponse(res, 400, "Cost cannot be set when upgrade option is tba.");
      if (upgrade_option !== "tba" && !cost) return errorResponse(res, 400, "Cost is required when upgrade option is not tba.");
    }

    const hasDefaultIndex = default_image_index !== undefined && default_image_index !== "";
    const defaultIndex = hasDefaultIndex ? Number(default_image_index) : null;
    if (hasDefaultIndex && (isNaN(defaultIndex) || defaultIndex < 0 || defaultIndex >= colorImages.length)) {
      return errorResponse(res, 400, "Invalid default image index.");
    }

    const colorImageJson = colorImages.map((file, index) => ({
      url: file.location,
      is_default: hasDefaultIndex && index === defaultIndex,
    }));

    const specificationJson = specificationFiles.map((file) => ({
      url: file.location,
      type: file.mimetype.startsWith("image/") ? "image" : "pdf",
      originalName: file.originalname,
    }));

    const result = await createColorItemService(
      {
        item_name,
        item_code,
        supplier_id,
        color_category_id,
        upgrade_option,
        cost_type,
        cost,
        features,
        description,
        specification_name,
        units,
        sort_order,
        finalColorTypeIds,
        finalRangeIds,
        status,
        colorImageJson,
        specificationJson,
        parsedCustomFields,
        color_id: color_id || undefined,
        color_group_id: color_group_id || undefined,
      },
      req.user
    );

    return successResponse(res, result, "Color item created successfully.");
  } catch (error) {
    console.error("Create Color Item Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export async function getAllColorItems(req, res) {
  try {
    const builderId = req.user.builder_id;
    const companyId = req.user.company_id;
    let {
      page = 1,
      limit = 25,
      status,
      search,
      cost_type,
      upgrade_option,
      units,
      color_category_id,
      color_group_id,
      job_id,
    } = req.query;

    page = parseInt(page, 10);
    limit = parseInt(limit, 10);

    if (status !== undefined && !["true", "false"].includes(status)) {
      return errorResponse(res, 400, "status must be true or false");
    }
    if (cost_type !== undefined && !["standard", "upgrade"].includes(cost_type)) {
      return errorResponse(res, 400, "cost_type must be standard or upgrade");
    }
    if (upgrade_option !== undefined && !["fixed", "start_from", "tba"].includes(upgrade_option)) {
      return errorResponse(res, 400, "upgrade_option must be fixed, start_from, or tba");
    }
    if (units !== undefined && !["mandatory", "non_mandatory", "not_required"].includes(units)) {
      return errorResponse(res, 400, "units must be mandatory, non_mandatory, or not_required");
    }

    const { rows, total } = await getAllColorItemsService({
      builderId,
      companyId,
      page,
      limit,
      status,
      search,
      costType: cost_type,
      upgradeOption: upgrade_option,
      units,
      colorCategoryId: color_category_id,
      colorGroupId: color_group_id,
      jobId: job_id,
    });

    const pagination = {
      totalRecords: total,
      currentPage: page,
      limit,
      totalPages: Math.ceil(total / limit),
    };

    return successResponse(
      res,
      {
        colorItems: rows,
        pagination,
      },
      "Color items fetched successfully.",
    );
  } catch (error) {
    console.error("Error fetching color items:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Updates an existing color item.
 */
export async function updateColorItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { color_item_id } = req.params;

    if (!builderId || !companyId || !color_item_id) {
      return errorResponse(res, 401, "Unauthorized or missing ID.");
    }

    const {
      item_name,
      item_code,
      supplier_id,
      color_id,
      upgrade_option,
      cost_type,
      cost,
      features,
      description,
      color_type_id,
      range_id,
      specification_name,
      units,
      sort_order,
      status,
      default_image_index,
    } = req.body;

    const parseArray = (field) => {
      if (field === undefined) return undefined;
      if (!field) return [];
      if (Array.isArray(field)) {
        if (field.length === 1 && typeof field[0] === "string") {
          try { return JSON.parse(field[0]); } catch (e) { return field; }
        }
        return field;
      }
      try { return JSON.parse(field); } catch (e) { return [field]; }
    };

    const finalColorTypeIds = parseArray(color_type_id);
    const finalRangeIds = parseArray(range_id);

    const colorImages = req.files?.colorImage || [];
    const specificationFiles = req.files?.specification || [];

    const colorImageJson = colorImages.length > 0 ? colorImages.map((file) => ({ url: file.location, is_default: false })) : undefined;
    const specificationJson = specificationFiles.length > 0 ? specificationFiles.map((file) => ({ url: file.location, type: file.mimetype.startsWith("image/") ? "image" : "pdf", originalName: file.originalname })) : undefined;

    const updatedColorItem = await updateColorItemService({
      builderId,
      companyId,
      colorItemId: color_item_id,
      userId: req.user?.users_id,
      data: {
        item_name,
        item_code,
        supplier_id,
        color_id,
        upgrade_option,
        cost_type,
        cost,
        features,
        description,
        color_type_id: finalColorTypeIds,
        range_id: finalRangeIds,
        specification_name,
        units,
        sort_order,
        status,
        colorImages: colorImageJson,
        specificationImages: specificationJson,
        default_image_index,
      },
    });

    return successResponse(res, updatedColorItem, "Color item updated successfully.");
  } catch (error) {
    console.error("Update Color Item Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Deletes a color item.
 */
export async function deleteColorItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { color_item_id } = req.params;

    await deleteColorItemService({
      builderId,
      companyId,
      colorItemId: color_item_id,
      userId: req.user?.users_id,
    });

    return successResponse(res, null, "Color item deleted successfully.");
  } catch (error) {
    console.error("Delete Color Item Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Deletes a specific image from a color item.
 */
export async function deleteImageField(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { color_item_id } = req.params;
    const { field_name, index } = req.body;

    const result = await deleteImageFieldService({
      builderId,
      companyId,
      colorItemId: color_item_id,
      fieldName: field_name,
      index,
    });

    return successResponse(res, result, "Image deleted successfully.");
  } catch (error) {
    console.error("Delete Image Field Error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Fetches a single color item by ID.
 */
export async function getColorItemById(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { color_item_id } = req.params;

    const colorItem = await getColorItemByIdService({
      colorItemId: color_item_id,
      companyId,
      builderId,
    });

    if (!colorItem) {
      return successResponse(res, [], "Color item fetched successfully.");
    }

    return successResponse(res, colorItem, "Color item fetched successfully.");
  } catch (error) {
    console.error("Error fetching color item:", error);
    return handleControllerError(res, error, error?.message || "Internal Server Error");
  }
}

/**
 * Moves a color item to a different category.
 */
export async function colorItemMove(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { color_item_id } = req.params;

    const result = await colorItemMoveService({
      builderId,
      companyId,
      colorItemId: color_item_id,
      userId: req.user?.users_id,
      data: req.body,
    });

    return successResponse(res, result, "Color item moved successfully.");
  } catch (error) {
    console.error("Color item move error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * Creates a copy of a color item.
 */
export async function copyColorItem(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const { color_item_id } = req.params;

    const result = await copyColorItemService({
      builderId,
      companyId,
      colorItemId: color_item_id,
      userId: req.user?.users_id,
      data: req.body,
    });

    return successResponse(res, result, "Color item copied successfully.");
  } catch (error) {
    console.error("Color item copy error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

/**
 * POST /color-item/pdf
 * Body: { itemIds: string[], jobInfo?: { jobAddress, customerName, referenceNumber, totalAmount } }
 * Returns: PDF as application/pdf stream
 */
export async function generateColorPdf(req, res) {
  try {
    const itemIds = req.body.item_ids || [];
    const jobInfoRaw = req.body.job_info || {};
    const jobInfo = {
      // Carries the per-item quantities into the PDF: without it every row is
      // costed as a single unit and the total comes out as the sum of the unit
      // prices instead of the sum of the costs.
      jobId: jobInfoRaw.job_id ?? null,
      jobAddress: jobInfoRaw.job_address ?? '',
      customerName: jobInfoRaw.customer_name ?? '',
      referenceNumber: jobInfoRaw.reference_number ?? '',
      totalAmount: jobInfoRaw.total_amount ?? '',
    };

    // Image/Price toggles — default ON, hidden only when explicitly false
    const showImage = req.body.show_image !== false && req.body.show_image !== 'false';
    const showPrice = req.body.show_price !== false && req.body.show_price !== 'false';

    if (!itemIds.length) {
      return errorResponse(res, 400, "No item IDs provided.");
    }

    const pdfBuffer = await generateColorPdfService({
      itemIds,
      jobInfo,
      builderId: req.user?.builder_id,
      companyId: req.user?.company_id,
      showImage,
      showPrice,
    });

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="colour-selection.pdf"`,
      "Content-Length": pdfBuffer.length,
    });
    return res.end(pdfBuffer);
  } catch (error) {
    console.error("Color PDF generation error:", error);
    return handleControllerError(res, error, error.message || "Failed to generate colour PDF");
  }
}

export async function generateColorEmail(req, res) {
  try {
    const itemIds = req.body.item_ids || [];
    const jobInfoRaw = req.body.job_info || {};
    const emailData = req.body.email_data || {};
    const showImage = req.body.show_image !== false && req.body.show_image !== 'false';
    const showPrice = req.body.show_price !== false && req.body.show_price !== 'false';

    if (!itemIds.length) {
      return errorResponse(res, 400, "No item IDs provided.");
    }

    const result = await generateColorEmailService({
      itemIds,
      jobInfoRaw,
      emailData,
      showImage,
      showPrice,
      user: req.user,
    });

    if (result.success) {
      return successResponse(res, null, result.message || "Email queued successfully.");
    }
    return errorResponse(res, result.statusCode || 400, result.message || "Failed to queue email");
  } catch (error) {
    console.error("Color email queue error:", error);
    return handleControllerError(res, error, error.message || "Failed to queue email");
  }
}

