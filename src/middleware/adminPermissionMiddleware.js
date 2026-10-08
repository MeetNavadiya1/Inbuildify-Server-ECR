import { errorResponse } from "../helper/response.js";

export const ADMIN_PERMISSIONS = {
  LEAD_READ: "lead.read",
  CLIENT_READ: "client.read",
  CONTRACTOR_READ: "contractor.read",
  SUPPLIER_READ: "supplier.read",
  FACADE_READ: "facade.read",
  FEATURED_FACADE_READ: "featuredFacade.read",
  FEATURED_FACADE_REVIEW: "featuredFacade.review",
  DWELLING_READ: "dwelling.read",
  BUILDER_READ: "builder.read",
  LANDING_LEAD_READ: "landingLead.read",
  LANDING_LEAD_RELEASE: "landingLead.release",
  SIGNUP_REQUEST_READ: "signupRequest.read",
  SIGNUP_REQUEST_RELEASE: "signupRequest.release",
  DEMO_REQUEST_READ: "demoRequest.read",
  DEMO_REQUEST_UPDATE: "demoRequest.update",
  BLOG_READ: "blog.read",
  BLOG_WRITE: "blog.write",
};

// const ALL_ADMIN_PERMISSIONS = … filter(p => p !== LANDING_LEAD_RELEASE);
/**
 * What the "Read Only" role gets — everything except the ones that mutate.
 * Releasing a landing enquiry creates a lead inside a builder's tenant;
 * releasing a sign-up request provisions a whole new tenant and emails out its
 * password; working a demo request moves the row through its own lifecycle.
 * None is a read, so all are excluded by name rather than by a single-value
 * comparison that would silently admit the next one added.
 */
const NON_READ_ADMIN_PERMISSIONS = [
  ADMIN_PERMISSIONS.LANDING_LEAD_RELEASE,
  ADMIN_PERMISSIONS.SIGNUP_REQUEST_RELEASE,
  ADMIN_PERMISSIONS.DEMO_REQUEST_UPDATE,
  // Writing a blog post publishes to the public website — the furthest-reaching
  // mutation on this router, and the one Read Only must certainly not hold.
  ADMIN_PERMISSIONS.BLOG_WRITE,
  // Approving a featured facade publishes a builder's work to the landing page
  // for the same reason: it is a write to the public site, not to the console.
  ADMIN_PERMISSIONS.FEATURED_FACADE_REVIEW,
];

export const ALL_ADMIN_PERMISSIONS = Object.values(ADMIN_PERMISSIONS).filter(
  (permission) => !NON_READ_ADMIN_PERMISSIONS.includes(permission),
);

const holds = (granted, required) => {
  if (!Array.isArray(granted)) return false;
  if (granted.includes("*")) return true;
  if (granted.includes(required)) return true;
  const [group] = required.split(".");
  return granted.includes(`${group}.*`);
};

export const requireAdminPermission = (...required) => (req, res, next) => {
  if (!req.admin) {
    return errorResponse(res, 401, "Unauthorized: Admin session missing.");
  }

  const granted = req.admin.permissions;
  const ok = required.every((permission) => holds(granted, permission));

  if (!ok) {
    return errorResponse(res, 403, `Forbidden: missing permission ${required.join(", ")}.`);
  }

  return next();
};

export default requireAdminPermission;
