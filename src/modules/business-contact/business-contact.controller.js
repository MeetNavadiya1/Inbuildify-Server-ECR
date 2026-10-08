import businessContactService from "./business-contact.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function createBusinessContact(req, res) {
  try {
    const data = await businessContactService.createBusinessContactService(req.user, req.body);
    return successResponse(res, data, "Business contact created successfully.");
  } catch (err) {
    console.error("Error creating business contact:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getAllBusinessContacts(req, res) {
  try {
    const data = await businessContactService.getAllBusinessContactsService(req.user, req.query);
    return successResponse(res, data, "Business contacts fetched successfully");
  } catch (err) {
    console.error("Error fetching business contacts:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getBusinessContactById(req, res) {
  try {
    const { business_contact_id } = req.params;
    const data = await businessContactService.getBusinessContactByIdService(business_contact_id, req.user);
    return successResponse(res, data, "Business contact retrieved successfully.");
  } catch (err) {
    console.error("Error fetching business contact:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function updateBusinessContact(req, res) {
  try {
    const { business_contact_id } = req.params;
    const data = await businessContactService.updateBusinessContactService(business_contact_id, req.user, req.body);
    return successResponse(res, data, "Business contact updated successfully.");
  } catch (err) {
    console.error("Error updating business contact:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteBusinessContact(req, res) {
  try {
    const { business_contact_id } = req.params;
    await businessContactService.deleteBusinessContactService(business_contact_id, req.user);
    return successResponse(res, {}, "Business contact deleted successfully.");
  } catch (err) {
    console.error("Error deleting business contact:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getBusinessContactsByLeadsId(req, res) {
  try {
    const { leads_id } = req.params;
    const data = await businessContactService.getBusinessContactsByLeadsId(req.user, leads_id);
    return successResponse(res, data, "Business contacts retrieved successfully");
  } catch (error) {
    console.error("Get business contacts by leads ID error:", error);
    return handleControllerError(res, error, error.message || "Internal Server Error");
  }
}

export default {
  createBusinessContact,
  getAllBusinessContacts,
  getBusinessContactById,
  updateBusinessContact,
  deleteBusinessContact,
  getBusinessContactsByLeadsId,
};
