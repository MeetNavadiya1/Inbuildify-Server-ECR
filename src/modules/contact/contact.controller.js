import contactService from "./contact.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";

export async function getContacts(req, res) {
  try {
    const data = await contactService.getContacts(req.user, req.query);
    return successResponse(res, data, "Contacts fetched successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function getContactById(req, res) {
  try {
    const contactId = req.params.contact_id;
    const data = await contactService.getContactById(req.user, contactId);
    return successResponse(res, data, "Contact fetched successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function createContact(req, res) {
  try {
    const { name, email, phone, address } = req.body;

    // Manual validation for required fields as requested
    const requiredFields = { name, email, phone };
    for (const [key, value] of Object.entries(requiredFields)) {
      if (!value) {
        return errorResponse(res, 400, `${key.charAt(0).toUpperCase() + key.slice(1)} is required.`);
      }
    }

    if (!address) {
      return errorResponse(res, 400, "Address details are required.");
    }

    const { address_line1, city, country_id, state_id, zip_code } = address;
    const requiredAddressFields = {
      address_line1,
      city,
      country_id,
      state_id,
      zip_code,
    };

    for (const [key, value] of Object.entries(requiredAddressFields)) {
      if (!value) {
        // Mapping internal names to user-friendly labels if needed
        let label = key.replace(/_/g, " ");
        label = label.charAt(0).toUpperCase() + label.slice(1);
        return errorResponse(res, 400, `${label} is required.`);
      }
    }

    const data = await contactService.createContact(req.user, req.body);
    return successResponse(res, data, "Contact created successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function updateContact(req, res) {
  try {
    const contactId = req.params.contact_id;
    const data = await contactService.updateContact(
      req.user,
      contactId,
      req.body,
    );
    return successResponse(res, data, "Contact updated successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function deleteContact(req, res) {
  try {
    const contactId = req.params.contact_id;
    const data = await contactService.deleteContact(req.user, contactId);
    return successResponse(res, data, "Contact deleted successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function convertContactToUser(req, res) {
  try {
    const contactId = req.params.contact_id;
    const data = await contactService.convertContactToUser(
      req.user,
      contactId,
      req.body,
    );
    return successResponse(
      res,
      data,
      "Contact converted to user and credentials generated.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}
