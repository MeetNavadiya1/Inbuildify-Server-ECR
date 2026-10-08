import userService from "./user.service.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";

export async function getUsers(req, res) {
  try {
    const data = await userService.getUsers(req.user, req.query);
    return successResponse(res, data, "Users fetched successfully.");
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function getProfile(req, res) {
  try {
    const data = await userService.getProfile(req.user.user_id);
    return successResponse(
      res,
      keysToCamelCase(data),
      "Profile fetched successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function createUser(req, res) {
  try {
    
    const photo = req.files?.photo?.[0] || null;
    const signature = req.files?.signature?.[0] || null;

    const data = await userService.createUser(req.user, req.body, {
      photo,
      signature,
    });
    console.log("🚀 ================================================================================================================================================================~ createUser ~ data:", data)

    return successResponse(
      res,
      keysToCamelCase(data),
      "User created successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function updateUser(req, res) {
  try {
    const userId = req.params.user_id;

    const targetUser = await userService.getBasicUser(userId);
    if (!targetUser) {
      return errorResponse(res, 404, "User not found.");
    }

    if (targetUser.builderId !== req.user.builder_id) {
      return errorResponse(
        res,
        403,
        "You can only update users from your own builder.",
      );
    }

    const photo = req.files?.photo?.[0] || null;
    const signature = req.files?.signature?.[0] || null;

    const data = await userService.updateUser(req.user, userId, req.body, {
      photo,
      signature,
    });

    return successResponse(
      res,
      keysToCamelCase(data),
      "User updated successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function deleteUser(req, res) {
  try {
    const userId = req.params.user_id;

    const targetUser = await userService.getBasicUser(userId);
    if (!targetUser) {
      return errorResponse(res, 404, "User not found.");
    }

    if (targetUser.builderId !== req.user.builder_id) {
      return errorResponse(
        res,
        403,
        "You can only delete users from your own builder.",
      );
    }

    const data = await userService.deleteUser(req.user, userId);
    return successResponse(
      res,
      keysToCamelCase(data),
      "User deleted (soft delete) successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

/* =========================================
    PASSWORD & LOGIN ID MANAGEMENT
========================================= */

export async function resetPassword(req, res) {
  try {
    const userId = req.params.user_id;

    const targetUser = await userService.getBasicUser(userId);
    if (!targetUser) {
      return errorResponse(res, 404, "User not found.");
    }

    if (targetUser.builderId !== req.user.builder_id) {
      return errorResponse(
        res,
        403,
        "You can only reset password for users from your own builder.",
      );
    }

    const data = await userService.resetPassword(req.user, userId, req.body);
    return successResponse(
      res,
      keysToCamelCase(data),
      "Password reset successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function changeLoginId(req, res) {
  try {
    const userId = req.params.user_id;

    const targetUser = await userService.getBasicUser(userId);
    if (!targetUser) {
      return errorResponse(res, 404, "User not found.");
    }

    if (targetUser.builderId !== req.user.builder_id) {
      return errorResponse(
        res,
        403,
        "You can only change login ID for users from your own builder.",
      );
    }

    const data = await userService.changeLoginId(req.user, userId, req.body);
    return successResponse(
      res,
      keysToCamelCase(data),
      "Login ID changed successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

/* =========================================
       ACTIVE / INACTIVE MANAGEMENT
========================================= */

export async function toggleActive(req, res) {
  try {
    const userId = req.params.userId;

    const targetUser = await userService.getBasicUser(userId);
    if (!targetUser) {
      return errorResponse(res, 404, "User not found.");
    }

    if (targetUser.builderId !== req.user.builder_id) {
      return errorResponse(
        res,
        403,
        "You can only toggle active status for users from your own builder.",
      );
    }

    const data = await userService.toggleActive(req.user, userId);
    return successResponse(
      res,
      keysToCamelCase(data),
      "User active status updated.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

/* =========================================
           LOCK / UNLOCK USER
========================================= */

export async function toggleLock(req, res) {
  try {
    const userId = req.params.userId;

    const targetUser = await userService.getBasicUser(userId);
    if (!targetUser) {
      return errorResponse(res, 404, "User not found.");
    }

    if (targetUser.builderId !== req.user.builder_id) {
      return errorResponse(
        res,
        403,
        "You can only toggle lock status for users from your own builder.",
      );
    }

    const data = await userService.toggleLock(req.user, userId);
    return successResponse(
      res,
      keysToCamelCase(data),
      "User lock status updated.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

/* =========================================
            PHOTO MANAGEMENT
========================================= */

export async function updatePhoto(req, res) {
  try {
    const file = req.files?.photo?.[0] || null;
    if (!file) {
      return errorResponse(res, 400, "Photo file is required.");
    }

    const data = await userService.updatePhoto(
      req.user,
      req.params.user_id,
      file,
    );
    return successResponse(
      res,
      keysToCamelCase(data),
      "Photo updated successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function updateOwnProfile(req, res) {
  try {
    const data = await userService.updateOwnProfile(
      req.user.user_id,
      req.body,
      req.file || null,
    );
    return successResponse(
      res,
      keysToCamelCase(data),
      "Profile updated successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function deletePhoto(req, res) {
  try {
    const data = await userService.deletePhoto(req.user, req.params.user_id);
    return successResponse(
      res,
      keysToCamelCase(data),
      "Photo deleted successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

/* =========================================
          SIGNATURE MANAGEMENT
========================================= */

export async function updateSignature(req, res) {
  try {
    const file = req.files?.signature?.[0] || null;
    if (!file) {
      return errorResponse(res, 400, "Signature file is required.");
    }

    const data = await userService.updateSignature(
      req.user,
      req.params.user_id,
      file,
    );
    return successResponse(
      res,
      keysToCamelCase(data),
      "Signature updated successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export async function deleteSignature(req, res) {
  try {
    const data = await userService.deleteSignature(
      req.user,
      req.params.user_id,
    );
    return successResponse(
      res,
      keysToCamelCase(data),
      "Signature deleted successfully.",
    );
  } catch (err) {
    return handleControllerError(res, err, err.message);
  }
}

export default {
  getUsers,
  getProfile,
  createUser,
  updateUser,
  deleteUser,
  resetPassword,
  changeLoginId,
  toggleActive,
  toggleLock,
  updatePhoto,
  updateOwnProfile,
  deletePhoto,
  updateSignature,
  deleteSignature,
};
