import {
  getSettingsService,
  upsertSettingsService,
  getOhsListService,
  createOhsListItemService,
  updateOhsListItemService,
  deleteOhsListItemService,
} from "./construction-ohs.service.js";
import { successResponse, errorResponse } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

/* -----------------------------
   GET Settings
------------------------------ */
export async function getOhsSettings(req, res) {
  try {
    const user = req.user;

    const data = await getSettingsService(user);

    return successResponse(res, keysToCamelCase(data), "OHS settings loaded");
  } catch (e) {
    return errorResponse(res, 400, e.message);
  }
}

/* -----------------------------
   UPSERT Settings
------------------------------ */
export async function upsertOhsSettings(req, res) {
  try {
    const user = req.user;

    const data = await upsertSettingsService(user, req.body);

    return successResponse(res, keysToCamelCase(data), "OHS settings updated");
  } catch (e) {
    return errorResponse(res, 400, e.message);
  }
}

/* -----------------------------
   LIST items
------------------------------ */
export async function getOhsList(req, res) {
  try {
    const user = req.user;
    const filters = req.query; // Get query parameters for filtering

    const list = await getOhsListService(user, filters);

    return successResponse(res, keysToCamelCase(list), "OHS list loaded");
  } catch (e) {
    return errorResponse(res, 400, e.message);
  }
}

/* -----------------------------
   CREATE list item
------------------------------ */
export async function createOhsListItem(req, res) {
  try {
    const user = req.user;

    const item = await createOhsListItemService(user, req.body);

    return successResponse(res, keysToCamelCase(item), "Item created");
  } catch (e) {
    return errorResponse(res, 400, e.message);
  }
}

/* -----------------------------
   UPDATE list item
------------------------------ */
export async function updateOhsListItem(req, res) {
  try {
    const user = req.user;
    const { id } = req.params;

    const item = await updateOhsListItemService(user, id, req.body);

    return successResponse(res, keysToCamelCase(item), "Item updated");
  } catch (e) {
    return errorResponse(res, 400, e.message);
  }
}

/* -----------------------------
   DELETE list item
------------------------------ */
export async function deleteOhsListItem(req, res) {
  try {
    const user = req.user;
    const { id } = req.params;

    await deleteOhsListItemService(user, id);

    return successResponse(res, null, "Item deleted");
  } catch (e) {
    return errorResponse(res, 400, e.message);
  }
}
