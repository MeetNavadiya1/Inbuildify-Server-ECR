import { errorResponse } from "../helper/response.js";
import { ERROR_MESSAGES } from "../config/constants.js";
import db from "../config/database/models/postgre-models/index.js";

const roleMiddleware = (allowedRolesOrReq, res, next) => {
  // If used as simple middleware: router.use(roleMiddleware)
  // Express passes (req, res, next)
  if (allowedRolesOrReq && allowedRolesOrReq.headers && res && typeof next === 'function') {
    const req = allowedRolesOrReq;
    return (async () => {
      try {
        const role_id = req.user?.role_id;
        if (!role_id) return errorResponse(res, 403, ERROR_MESSAGES.FORBIDDEN);
        const role = await db.Role.findByPk(role_id);
        if (!role) return errorResponse(res, 403, ERROR_MESSAGES.FORBIDDEN);
        return next();
      } catch (err) {
        console.error("roleMiddleware error:", err);
        return errorResponse(res, 403, ERROR_MESSAGES.FORBIDDEN);
      }
    })();
  }

  // If used as higher-order function: router.use(roleMiddleware('Admin'))
  const rolesToCheck = Array.isArray(allowedRolesOrReq) ? allowedRolesOrReq : [allowedRolesOrReq];

  return async (req, res, next) => {
    try {
      const role_id = req.user?.role_id;

      if (!role_id) {
        return errorResponse(res, 403, ERROR_MESSAGES.FORBIDDEN);
      }

      const role = await db.Role.findByPk(role_id);

      if (!role || !rolesToCheck.includes(role.name)) {
        return errorResponse(res, 403, ERROR_MESSAGES.FORBIDDEN);
      }

      return next();
    } catch (err) {
      console.error("roleMiddleware error:", err);
      return errorResponse(res, 403, ERROR_MESSAGES.FORBIDDEN);
    }
  };
};

export default roleMiddleware;
