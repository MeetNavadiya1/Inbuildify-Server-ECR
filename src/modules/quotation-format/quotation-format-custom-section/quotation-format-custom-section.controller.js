import customSectionService from "./quotation-format-custom-section.service.js";

// ============================================================
//        CUSTOM SECTION CONTROLLERS
// ============================================================

export async function createQuotationFormatCustomSection(req, res) {
  try {
    const currentUser = req.user;
    const { quotation_format_id } = req.params;

    const payload = req.body;
    const result = await customSectionService.createCustomSection(currentUser, quotation_format_id, payload);
    res.status(201).json({
      success: true,
      message: "Custom section created successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error creating custom section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to create custom section",
    });
  }
}

export async function getQuotationFormatCustomSections(req, res) {
  try {
    const currentUser = req.user;
    const { quotation_format_id } = req.params;
    const filters = { ...req.query };
    if (quotation_format_id) {
      filters.quotation_format_id = quotation_format_id;
    }
    const result = await customSectionService.getCustomSections(currentUser, filters);
    res.status(200).json({
      success: true,
      message: "Custom sections retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error getting custom sections:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to retrieve custom sections",
    });
  }
}

export async function getQuotationFormatCustomSectionById(req, res) {
  try {
    const currentUser = req.user;
    const { custom_section_id } = req.params;
    const result = await customSectionService.getCustomSectionById(currentUser, custom_section_id);
    res.status(200).json({
      success: true,
      message: "Custom section retrieved successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error getting custom section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to retrieve custom section",
    });
  }
}

export async function updateQuotationFormatCustomSection(req, res) {
  try {
    const currentUser = req.user;
    const { custom_section_id } = req.params;
    const payload = req.body;
    const result = await customSectionService.updateCustomSection(currentUser, custom_section_id, payload);
    res.status(200).json({
      success: true,
      message: "Custom section updated successfully",
      data: result,
    });
  } catch (error) {
    console.error("Error updating custom section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to update custom section",
    });
  }
}

export async function deleteQuotationFormatCustomSection(req, res) {
  try {
    const currentUser = req.user;
    const { custom_section_id } = req.params;
    await customSectionService.deleteCustomSection(currentUser, custom_section_id);
    res.status(200).json({
      success: true,
      message: "Custom section deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting custom section:", error);
    const statusCode = error.status || 500;
    res.status(statusCode).json({
      success: false,
      message: error.message || "Failed to delete custom section",
    });
  }
}

export default {
  createQuotationFormatCustomSection,
  getQuotationFormatCustomSections,
  getQuotationFormatCustomSectionById,
  updateQuotationFormatCustomSection,
  deleteQuotationFormatCustomSection,
};