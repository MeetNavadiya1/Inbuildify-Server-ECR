import quotationFormatMasterSectionItemService from "./quotation-format-master-section-item.service.js";
// ============================================================
//        MASTER SECTION ITEM CONTROLLERS
// ============================================================

export async function createMasterSectionItem(req, res) {
  try {
    const currentUser = req.user;
    const payload = req.body;
    const { master_section_header_id } = req.params;
    const result = await quotationFormatMasterSectionItemService.createMasterSectionItem(currentUser, master_section_header_id, payload);
    res.status(201).json({
      success: true,
      message: "Master section item created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error creating master section item:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to create master section item",
    });
  }
}

export async function getMasterSectionItems(req, res) {
  try {
    const currentUser = req.user;
    const { master_section_header_id } = req.params;
    const filters = { ...req.query };
    if (master_section_header_id) {
      filters.master_section_header_id = master_section_header_id;
    }
    const result = await quotationFormatMasterSectionItemService.getMasterSectionItems(currentUser, filters);
    res.status(200).json({
      success: true,
      message: "Master section items retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error getting master section items:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to retrieve master section items",
    });
  }
}

export async function getMasterSectionItemById(req, res) {
  try {
    const currentUser = req.user;
    const { item_id } = req.params;
    const result = await quotationFormatMasterSectionItemService.getMasterSectionItemById(currentUser, item_id);
    res.status(200).json({
      success: true,
      message: "Master section item retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error getting master section item:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to retrieve master section item",
    });
  }
}

export async function updateMasterSectionItem(req, res) {
  try {
    const currentUser = req.user;
    const { item_id } = req.params;
    const payload = req.body;
    const result = await quotationFormatMasterSectionItemService.updateMasterSectionItem(currentUser, item_id, payload);
    res.status(200).json({
      success: true,
      message: "Master section item updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error updating master section item:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to update master section item",
    });
  }
}

export async function deleteMasterSectionItem(req, res) {
  try {
    const currentUser = req.user;
    const { item_id } = req.params;
    await quotationFormatMasterSectionItemService.deleteMasterSectionItem(currentUser, item_id);
    res.status(200).json({
      success: true,
      message: "Master section item deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting master section item:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to delete master section item",
    });
  }
}

export async function copyMasterSectionItem(req, res) {
  try {
    const currentUser = req.user;
    const { item_id } = req.params;
    const result = await quotationFormatMasterSectionItemService.copyMasterSectionItem(currentUser, item_id);
    res.status(201).json({
      success: true,
      message: "Master section item copied successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error copying master section item:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to copy master section item",
    });
  }
}


export default {
  

  // Master Section Item
  createMasterSectionItem,
  getMasterSectionItems,
  getMasterSectionItemById,
  updateMasterSectionItem,
  deleteMasterSectionItem,
  copyMasterSectionItem,
};
