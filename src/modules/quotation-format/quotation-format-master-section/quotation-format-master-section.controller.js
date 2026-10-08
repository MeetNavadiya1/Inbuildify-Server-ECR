import quotationFormatMasterSectionService from "./quotation-format-master-section.service.js";

// ============================================================
//        MASTER SECTION CONTROLLERS
// ============================================================

export async function createMasterSection(req, res) {
  try {
    const currentUser = req.user;
    const { quotation_format_id } = req.params;
    const payload = req.body;
    const result = await quotationFormatMasterSectionService.createMasterSection(currentUser, quotation_format_id, payload);
    res.status(201).json({
      success: true,
      message: "Master section created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error creating master section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to create master section",
    });
  }
}

export async function getMasterSections(req, res) {
  try {
    const currentUser = req.user;
    const { quotation_format_id } = req.params;
    const filters = { ...req.query };
    if (quotation_format_id) {
      filters.quotation_format_id = quotation_format_id;
    }
    const result = await quotationFormatMasterSectionService.getMasterSections(currentUser, filters);
    res.status(200).json({
      success: true,
      message: "Master sections retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error getting master sections:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to retrieve master sections",
    });
  }
}

export async function getMasterSectionById(req, res) {
  try {
    const currentUser = req.user;
    const { master_section_id } = req.params;
    const result = await quotationFormatMasterSectionService.getMasterSectionById(currentUser, master_section_id);
    res.status(200).json({
      success: true,
      message: "Master section retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error getting master section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to retrieve master section",
    });
  }
}

export async function updateMasterSection(req, res) {
  try {
    const currentUser = req.user;
    const { master_section_id } = req.params;
    const payload = req.body;
    const result = await quotationFormatMasterSectionService.updateMasterSection(currentUser, master_section_id, payload);
    res.status(200).json({
      success: true,
      message: "Master section updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error updating master section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to update master section",
    });
  }
}

export async function deleteMasterSection(req, res) {
  try {
    const currentUser = req.user;
    const { master_section_id } = req.params;
    await quotationFormatMasterSectionService.deleteMasterSection(currentUser, master_section_id);
    res.status(200).json({
      success: true,
      message: "Master section deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting master section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to delete master section",
    });
  }
}

export async function copyMasterSection(req, res) {
  try {
    const result = await quotationFormatMasterSectionService.copyMasterSection(currentUser, master_section_id);
    res.status(201).json({
      success: true,
      message: "Master section copied successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error copying master section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to copy master section",
    });
  }
}

export default {
  // Master Section
  createMasterSection,
  getMasterSectionById,
  updateMasterSection,
  deleteMasterSection,
  copyMasterSection,
};
