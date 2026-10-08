import { successResponse, errorResponse } from "../../helper/response.js";
import * as addressService from "./address.service.js";

//not used anywhere
export async function createAddress(req, res) {
  try {
    const result = await addressService.createAddressService(req.body);

    return successResponse(
      res,
      result,
      "Address created successfully.",
    );
  } catch (err) {
    console.error("Error creating address:", err);
    return errorResponse(res, err.status || 400, err.message || "Internal Server Error");
  }
}
