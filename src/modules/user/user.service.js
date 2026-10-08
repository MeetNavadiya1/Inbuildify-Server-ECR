import db from "../../config/database/models/postgre-models/index.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { generateStrongPassword, validatePasswordPolicy } from "../../utils/password.util.js";
import { sendPasswordEmail, sendLoginIdEmail } from "../../helper/sendEmail.js";
import { encrypt } from "../../utils/crypto.util.js";
import { keysToCamelCase } from "../../utils/common.js";
import { Sequelize } from "sequelize";
import { getManageableRoles, ROLES } from "../../constants/rbac.js";
import { resolveRoleIdForCompany } from "../../helper/rbac.helper.js";
import { logActivity, compareAndLogUpdates } from "../../utils/activityLogger.js";
import { getCompanySampleDataSummary, enqueueSampleDataImport } from "../company-onboarding/company-onboarding.service.js";
import logger from "../../utils/logger.js";

const { Op } = Sequelize;

async function _checkHierarchicalAccess(currentUser, targetRoleId) {
  if (!targetRoleId || !currentUser) return;
  const { Role, Users } = db;

  const targetRole = await Role.findByPk(targetRoleId, {
    attributes: ["name", "is_system", "created_by"],
    include: [
      {
        model: Users,
        as: "createdByUser",
        attributes: ["role_id"],
        include: [{ model: Role, as: "role", attributes: ["name"] }]
      }
    ]
  });
  if (!targetRole) return;
  const targetRoleName = targetRole.name;

  let currentUserRoleName = currentUser.role_name;
  if (!currentUserRoleName && currentUser.role_id) {
    const role = await Role.findByPk(currentUser.role_id, { attributes: ["name"] });
    currentUserRoleName = role?.name;
  }
  if (!currentUserRoleName) return;

  const isSuperAdmin = currentUserRoleName === ROLES.SUPER_ADMIN;
  if (isSuperAdmin) return;

  const manageableRoles = getManageableRoles(currentUserRoleName);
  let isAllowed = false;

  if (targetRole.is_system) {
    isAllowed = manageableRoles.includes(targetRoleName);
  } else {
    // Custom Role Logic
    if (targetRole.created_by === currentUser.users_id || targetRole.created_by === currentUser.id) {
      isAllowed = true;
    } else {
      const COMPANY_ADMIN_ROLES = [
        ROLES.COMPANY_ADMINISTRATOR,
        ROLES.MH_COMPANY_ADMIN,
        ROLES.MY_HOME_COMPANY_ADMIN,
        ROLES.MY_HOME_ADMIN,
      ];
      if (COMPANY_ADMIN_ROLES.includes(currentUserRoleName)) {
        isAllowed = true;
      } else {
        const creatorRoleName = targetRole.createdByUser?.role?.name;
        if (creatorRoleName === currentUserRoleName || manageableRoles.includes(creatorRoleName)) {
          isAllowed = true;
        }
      }
    }
  }

  if (!isAllowed) {
    throw {
      status: 403,
      message: `You do not have permission to manage users with the '${targetRoleName}' role.`,
    };
  }
}


/* ----------------------------------------
      GET ALL USERS FOR CURRENT BUILDER
  ---------------------------------------- */
export async function getUsers(currentUser, query) {
  const { Users, Role, Address, State, Country } = db;
  const builderId = currentUser.builder_id;
  const { search = "", role = "", role_id = "", is_active, users_id = "" } = query;

  const where = {
    is_deleted: false,
    builder_id: builderId,
  };

  // Fetching one known user by id. `search` would also find them, but only via
  // iLike '%…%' across four columns — a leading wildcard no index can serve, so
  // it scans the table to return a row we already hold the key for.
  if (users_id) {
    where.users_id = users_id;
  }

  if (is_active !== undefined) {
    where.is_active = is_active === "true" || is_active === true;
  }

  if (role_id) {
    where.role_id = role_id;
  }

  if (search) {
    const searchFilter = `%${search}%`;
    where[Op.or] = [
      { name: { [Op.iLike]: searchFilter } },
      { email: { [Op.iLike]: searchFilter } },
      { login_id: { [Op.iLike]: searchFilter } },
      { phone: { [Op.iLike]: searchFilter } },
    ];
  }

  const roleInclude = {
    model: Role,
    as: "role",
    attributes: ["name"],
    required: false,
  };

  if (role) {
    roleInclude.where = { name: role };
    roleInclude.required = true;
  }

  const users = await Users.findAll({
    where,
    include: [
      roleInclude,
      {
        model: Users,
        as: "reportingToUser",
        attributes: ["name"],
        required: false,
      },
      {
        model: Address,
        as: "address",
        include: [
          { model: State, as: "state", attributes: ["name"], required: false },
          { model: Country, as: "country", attributes: ["name"], required: false },
        ],
        required: false,
      },
    ],
    order: [["created_at", "DESC"]],
  });

  return users.map((user) => {
    const plainUser = user.get({ plain: true });

    // Transform address to match original JSON structure
    const transformedAddress = {
      addressId: plainUser.address?.address_id || null,
      addressLine1: plainUser.address?.address_line1 || null,
      addressLine2: plainUser.address?.address_line2 || null,
      city: plainUser.address?.city || null,
      stateId: plainUser.address?.state_id || null,
      countryId: plainUser.address?.country_id || null,
      zipCode: plainUser.address?.zip_code || null,
      stateName: plainUser.address?.state?.name || null,
      countryName: plainUser.address?.country?.name || null,
    };

    const transformedUser = keysToCamelCase(plainUser);

    const result = {
      ...transformedUser,
      roleName: plainUser.role?.name || null,
      reportingToName: plainUser.reportingToUser?.name || null,
      address: transformedAddress,
    };

    delete result.role;
    delete result.reportingToUser;

    return result;
  });
}

const COMPANY_ADMIN_ROLES = [
  ROLES.COMPANY_ADMINISTRATOR,
  ROLES.MH_COMPANY_ADMIN,
  ROLES.MY_HOME_COMPANY_ADMIN,
  ROLES.MY_HOME_ADMIN,
];
const FIRM_ATTRIBUTES = ["firm_name", "slogan", "license_number", "abn_number"];

/**
 * Firm details (name, slogan, licence, ABN) for a profile. A user carries the
 * builder_id of whoever created them, so read the firm from that Builder first
 * (a contact under Yash shows Yash's firm). If that Builder has none filled in,
 * fall back to the company administrator's Builder.
 */
async function _getFirmDetails(builderId, companyId) {
  const { Users, Builder, Role } = db;

  const own = builderId
    ? await Builder.findByPk(builderId, { attributes: FIRM_ATTRIBUTES, raw: true })
    : null;
  if (own && FIRM_ATTRIBUTES.some(attr => own[attr])) return own;

  if (companyId) {
    const admin = await Users.findOne({
      where: { company_id: companyId, is_deleted: false, builder_id: { [Op.ne]: null } },
      attributes: ["builder_id"],
      include: [{ model: Role, as: "role", attributes: [], where: { name: COMPANY_ADMIN_ROLES } }],
      order: [["root_user", "DESC"], ["createdAt", "ASC"]],
    });
    if (admin) {
      const firm = await Builder.findByPk(admin.builder_id, { attributes: FIRM_ATTRIBUTES, raw: true });
      if (firm) return firm;
    }
  }

  return own;
}

/* ----------------------------------------
      GET OWN PROFILE
  ---------------------------------------- */
export async function getProfile(userId) {
  const { Users, Address, Builder, Company, Role, Job } = db;
  const user = await Users.findOne({
    where: { users_id: userId, is_deleted: false },
    include: [
      {
        model: Role,
        as: "role",
        attributes: ["name"],
        required: false,
      },
      {
        model: Builder,
        as: "builder",
        attributes: ["name", "logo", "company_id", "phone_number"],
        required: false,
        include: [
          {
            model: Company,
            as: "company",
            attributes: ["company_id", "name", "is_onboarding_finished"],
            required: false,
          },
        ],
      },
      {
        model: Company,
        as: "company",
        attributes: ["company_id", "name", "is_onboarding_finished"],
        required: false,
      },
      {
        model: Address,
        as: "address",
        required: false,
      },
    ],
  });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }

  const plainUser = user.get({ plain: true });
  const result = keysToCamelCase(plainUser);

  // Whether the user has a local password yet. OAuth (e.g. Google) accounts
  // start with no password — the frontend uses this to show/hide the
  // "Set password / enable email login" option. Strip the raw password (and
  // other secrets) so they are never returned in the profile payload.
  result.hasPassword = !!plainUser.password;
  delete result.password;
  delete result.otp;
  delete result.resetPasswordToken;
  delete result.resetTokenExpiresAt;

  if (plainUser.builder) {
    result.builderName = plainUser.builder.name;
    result.builderLogo = plainUser.builder.logo;
    result.builderPhoneNumber = plainUser.builder.phone_number;
  }

  const company = plainUser.company || plainUser.builder?.company || null;
  result.isOnboardingFinished = company ? !!company.is_onboarding_finished : false;
  result.companyName = company ? company.name : null;
  result.companyId = company ? company.company_id : result.companyId ?? null;

  const firm = await _getFirmDetails(plainUser.builder_id, result.companyId);
  if (firm) {
    result.firmName = firm.firm_name;
    result.slogan = firm.slogan;
    result.licenseNumber = firm.license_number;
    result.abnNumber = firm.abn_number;
  }

  if (plainUser.role?.name === "Contact") {
    const job = await Job.findOne({
      where: { customer_contact_id: userId },
      attributes: ["tracking_token", "job_id"],
      order: [["created_at", "DESC"]],
    });
    if (job) {
      result.trackingToken = job.trackingToken || job.tracking_token || job.jobId || job.job_id;
    }
  }

  return result;
}

/* ----------------------------------------
      GET BASIC USER
  ---------------------------------------- */
export async function getBasicUser(userId) {
  const { Users } = db;
  const user = await Users.findOne({
    where: { users_id: userId, is_deleted: false },
    attributes: [
      "users_id",
      "builder_id",
      "email",
      "login_id",
      "root_user",
      "is_active",
      "is_locked",
      "photo",
      "signature",
      "address_id",
    ],
  });
  return user ? keysToCamelCase(user.get({ plain: true })) : null;
}

/* ----------------------------------------
        CREATE USER (ADMIN UI)
  ---------------------------------------- */
export async function createUser(currentUser, body, files) {
  const { Users, Address, Company, Role } = db;
  const {
    name,
    email,
    login_id,
    role_id: requestedRoleId,
    company_id,
    phone,
    secondary_phone,
    initials,
    reporting_to,
    date_of_joining,
    date_of_birth,
    designation,
    remark,
    consultant_bio,
    use_company_address,
    password_auto_generated,
    manual_password,
    next_login_password_change,
    email_login_credentials,
    address,
  } = body;

  const t = await db.sequelize.transaction();

  // The tenant this user is being created into. Everything below is scoped to
  // it, including which copy of the chosen role the user is attached to.
  const targetCompanyId = company_id || currentUser.company_id || null;

  try {
    /* --------------------------
          VALIDATIONS
      --------------------------- */
    // Pin the user to this company's copy of the selected role. The dropdown is
    // company-scoped, but a stale or pre-filled id can still point at the global
    // template row — and a contact sitting on that row is a different "Contact"
    // from the one the lead → contact mapping creates, so nothing the admin
    // ticks in Role Management reaches them.
    const role_id = await resolveRoleIdForCompany(requestedRoleId, targetCompanyId, {
      transaction: t,
    });

    if (role_id) {
      await _checkHierarchicalAccess(currentUser, role_id);
    }

    if (login_id && !/^[A-Za-z0-9._@-]+$/.test(login_id)) {
      throw {
        status: 400,
        message:
          "Invalid login ID. Only alphanumeric, dot, underscore, hyphen, and @ allowed.",
      };
    }

    const emailConflict = await Users.findOne({
      where: {
        [Op.or]: [
          { email: { [Op.iLike]: email.toLowerCase() } },
          { login_id: { [Op.iLike]: email } }
        ]
      },
      transaction: t,
    });

    if (emailConflict) {
      if (emailConflict.is_deleted) {
        throw {
          status: 400,
          message:
            "This email is already in use by a deleted account. Please contact admin to restore the account or use a different email.",
        };
      } else {
        throw { status: 400, message: "This email is already registered or used as a login ID by another user." };
      }
    }

    if (login_id) {
      const loginConflict = await Users.findOne({
        where: {
          [Op.or]: [
            { email: { [Op.iLike]: login_id.toLowerCase() } },
            { login_id: { [Op.iLike]: login_id } }
          ]
        },
        transaction: t,
      });
      if (loginConflict) {
        if (loginConflict.is_deleted) {
          throw {
            status: 400,
            message:
              "This Login ID is already in use by a deleted account. Please contact admin to restore the account or use a different login ID.",
          };
        } else {
          throw { status: 400, message: "This Login ID is already registered or used as an email by another user." };
        }
      }
    }

    let finalPassword;
    const isAutoGenerated =
      (password_auto_generated === true || password_auto_generated === "true") && !manual_password;

    if (!isAutoGenerated && manual_password) {
      if (!validatePasswordPolicy(manual_password)) {
        throw {
          status: 400,
          message:
            "Password must be minimum 8 characters with uppercase, lowercase, and number.",
        };
      }
      finalPassword = manual_password;
    } else {
      finalPassword = generateStrongPassword();
    }

    const encryptedPassword = finalPassword ? encrypt(finalPassword) : null;

    /* --------------------------
         ADDRESS CREATE OR USE COMPANY ADDRESS
      --------------------------- */

    let addressId = null;

    if (use_company_address === "true" || use_company_address === true) {
      const company = await Company.findOne({
        where: { builder_id: currentUser.builder_id },
        include: [{ model: Address, as: "address" }],
        transaction: t,
      });

      const companyAddress = company?.address;

      if (companyAddress) {
        if (
          !companyAddress.address_line1 ||
          companyAddress.address_line1.trim() === ""
        ) {
          throw new Error(
            "Company address line 1 is required. Please update company address before creating user with company address.",
          );
        }

        const newAddress = await Address.create({
          address_line1: companyAddress.address_line1,
          address_line2: companyAddress.address_line2,
          city: companyAddress.city,
          zip_code: companyAddress.zip_code,
          country_id: companyAddress.country_id,
          state_id: companyAddress.state_id,
        }, { transaction: t });
        addressId = newAddress.address_id;
      }
    } else if (address) {
      const newAddress = await Address.create({
        address_line1: address.address_line1,
        address_line2: address.address_line2,
        city: address.city,
        zip_code: address.zip_code,
        country_id: address.country_id,
        state_id: address.state_id,
      }, { transaction: t });
      addressId = newAddress.address_id;
    }

    /* --------------------------
            CREATE USER RECORD
      --------------------------- */

    const user = await Users.create({
      name,
      email: email.toLowerCase(),
      login_id: login_id || null,
      password: encryptedPassword,
      role_id,
      phone,
      secondary_phone,
      initials,
      reporting_to,
      date_of_joining,
      date_of_birth,
      designation,
      remark,
      consultant_bio,
      address_id: addressId,
      use_company_address: use_company_address === "true" || use_company_address === true,
      root_user: false,
      has_login: true,
      next_login_password_change: next_login_password_change === "true" || next_login_password_change === true,
      builder_id: currentUser.builder_id,
      company_id: targetCompanyId,
      is_verified: true,
      password_auto_generated: isAutoGenerated,
    }, { transaction: t });
    console.log("🚀 ~ =============================================================================================================================================================================createUser ~ user:", user)

    const userId = user.users_id;

    /* --------------------------
          PHOTO + SIGNATURE
    --------------------------- */

    if (files.photo && files.photo.location) {
      await user.update({ photo: files.photo.location }, { transaction: t });
    }

    if (files.signature && files.signature.location) {
      await user.update({ signature: files.signature.location }, { transaction: t });
    }

    let roleNameForLog = "Unknown Role";
    if (role_id) {
      const assignedRole = await Role.findByPk(role_id, { transaction: t });
      if (assignedRole) roleNameForLog = assignedRole.name;
    }

    const currentUserId = currentUser.users_id || currentUser.id;
    await logActivity(t, {
      userId: currentUserId,
      companyId: company_id || currentUser.company_id,
      builderId: currentUser.builder_id,
      referenceId: userId,
      referenceType: "USER",
      module: "User",
      moduleId: userId,
      recordName: name,
      action: "CREATE",
      description: `Created new user: ${name} with role: ${roleNameForLog}`,
    });

    await t.commit();

    /* --------------------------
        SAMPLE DATA (BACKGROUND)
      --------------------------- */

    // Auto-clone sample data if creator has sample data.
    //
    // This runs on the queue, not here. Cloning the demo dataset is hundreds of
    // inserts plus an S3 copy per image — seconds to minutes. It used to run
    // inline and inside the transaction above, so creating a user blocked for
    // the whole clone and held a write transaction open for its duration. The
    // queue and worker that onboarding and request-approval already use do the
    // same work off the request thread.
    try {
      const creatorSummary = await getCompanySampleDataSummary(
        currentUser.company_id || company_id,
        currentUser.builder_id,
        currentUserId,
      );
      if (creatorSummary && creatorSummary.ownTotal > 0) {
        await enqueueSampleDataImport({
          companyId: company_id || currentUser.company_id,
          builderId: currentUser.builder_id,
          userId,
        });
      }
    } catch (error) {
      // The user is created and usable; only their copy of the demo data is
      // missing. That is worth a log, not a failed creation response — and the
      // transaction is already committed, so throwing here would reach the
      // catch below and attempt to roll back a committed transaction.
      logger.error(`Could not queue sample data import for user ${userId}: ${error.message || error}`, { stack: error.stack, userId, companyId: company_id || currentUser.company_id, builderId: currentUser.builder_id });
    }

    /* --------------------------
           EMAIL LOGIN CREDENTIALS
      --------------------------- */

    const shouldSendEmail =
      (isAutoGenerated && finalPassword) || email_login_credentials === "true" || email_login_credentials === true;

    if (shouldSendEmail) {
      try {
        await sendPasswordEmail(email, login_id || email, finalPassword);
      } catch (error) {
        console.error("Error sending password email:", error);
      }
    }

    // Return the new user using the existing getUsers logic to maintain structure
    const [newUser] = await getUsers(currentUser, { users_id: userId });

    return newUser;
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/* ----------------------------------------
            UPDATE USER
  ---------------------------------------- */
export async function updateUser(currentUser, userId, body, files) {
  const { Users, Address, Company, Sequelize } = db;
  const t = await db.sequelize.transaction();

  try {
    /* --------------------------
          ROOT USER PROTECTION
      --------------------------- */
    const user = await Users.findOne({
      where: { users_id: userId, is_deleted: false },
      transaction: t,
    });

    if (!user) {
      throw { status: 404, message: "User not found." };
    }

    if (user.root_user) {
      throw { status: 403, message: "Root user cannot be modified." };
    }

    if (user.role_id) {
      await _checkHierarchicalAccess(currentUser, user.role_id);
    }
    if (body.role_id) {
      // Same normalisation as createUser: an edit that leaves the role untouched
      // must not carry a global template id back into the row, or this user
      // silently drops off the company's permission grid.
      body.role_id = await resolveRoleIdForCompany(
        body.role_id,
        user.company_id || currentUser.company_id,
        { transaction: t },
      );
    }
    if (body.role_id && body.role_id !== user.role_id) {
      await _checkHierarchicalAccess(currentUser, body.role_id);
    }

    const targetUser = keysToCamelCase(user.get({ plain: true }));

    /* --------------------------
          LOGIN ID VALIDATION
      --------------------------- */
    if (body.login_id) {
      if (!/^[A-Za-z0-9._@-]+$/.test(body.login_id)) {
        throw {
          status: 400,
          message:
            "Invalid login ID. Only alphanumeric, dot, underscore, hyphen, and @ allowed.",
        };
      }

      const exists = await Users.findOne({
        where: {
          [Op.or]: [
            { email: { [Op.iLike]: body.login_id.toLowerCase() } },
            { login_id: { [Op.iLike]: body.login_id } }
          ],
          users_id: { [Op.ne]: userId }
        },
        transaction: t,
      });
      if (exists) {
        throw { status: 400, message: "This Login ID is already registered or used as an email by another user." };
      }
    }

    /* --------------------------
           EMAIL CHANGE VALIDATION
      --------------------------- */
    if (body.email) {
      const emailExists = await Users.findOne({
        where: {
          [Op.or]: [
            { email: { [Op.iLike]: body.email.toLowerCase() } },
            { login_id: { [Op.iLike]: body.email } }
          ],
          users_id: { [Op.ne]: userId }
        },
        transaction: t,
      });
      if (emailExists) {
        throw { status: 400, message: "This email is already registered or used as a login ID by another user." };
      }
    }

    /* --------------------------
              ADDRESS HANDLING
      --------------------------- */
    let addressId = targetUser.addressId;

    if (body.use_company_address === "true" || body.use_company_address === true) {
      const company = await Company.findOne({
        where: { builder_id: targetUser.builderId },
        include: [{ model: Address, as: "address" }],
        transaction: t,
      });
      const companyAddress = company?.address;

      if (companyAddress && addressId) {
        await Address.update({
          address_line1: companyAddress.address_line1,
          address_line2: companyAddress.address_line2,
          city: companyAddress.city,
          zip_code: companyAddress.zip_code,
          country_id: companyAddress.country_id,
          state_id: companyAddress.state_id,
        }, { where: { address_id: addressId }, transaction: t });
      } else {
        addressId = companyAddress?.address_id || null;
      }
    } else if (body.address && addressId) {
      const company = await Company.findOne({
        where: { builder_id: targetUser.builderId },
        transaction: t,
      });

      if (company && company.address_id === addressId) {
        // Create new address if current is shared company address
        const newAddress = await Address.create({
          address_line1: body.address.address_line1,
          address_line2: body.address.address_line2,
          city: body.address.city,
          zip_code: body.address.zip_code,
          country_id: body.address.country_id,
          state_id: body.address.state_id,
        }, { transaction: t });
        addressId = newAddress.address_id;
      } else {
        // Update existing private address
        const updatePayload = {};
        const fields = ["address_line1", "address_line2", "city", "zip_code", "country_id", "state_id"];
        fields.forEach(f => {
          if (body.address[f] !== undefined) {
            updatePayload[f] = body.address[f];
          }
        });

        if (Object.keys(updatePayload).length > 0) {
          await Address.update(updatePayload, {
            where: { address_id: addressId },
            transaction: t,
          });
        }
      }
    } else if (body.address && !addressId) {
      throw {
        status: 400,
        message:
          "User has no existing address. Cannot update non-existent address.",
      };
    }

    /* --------------------------
              PASSWORD HANDLING
      --------------------------- */

    if (body.password_auto_generated !== undefined) {
      if (
        body.password_auto_generated === true ||
        body.password_auto_generated === "true"
      ) {
        if (body.manual_password) {
          throw {
            status: 400,
            message:
              "Manual password cannot be provided when password is auto-generated.",
          };
        }
      }

      let newPassword;
      if (
        body.password_auto_generated === false ||
        body.password_auto_generated === "false"
      ) {
        if (!body.manual_password) {
          throw {
            status: 400,
            message:
              "Manual password is required when password_auto_generated is false.",
          };
        }
        if (!validatePasswordPolicy(body.manual_password)) {
          throw {
            status: 400,
            message:
              "Password must be minimum 8 characters with uppercase, lowercase, and number.",
          };
        }
        newPassword = body.manual_password;
      } else {
        newPassword = generateStrongPassword();
      }

      const encryptedPassword = encrypt(newPassword);

      await user.update({
        password: encryptedPassword,
        next_login_password_change: body.next_login_password_change === "true" || body.next_login_password_change === true,
      }, { transaction: t });

      if (
        body.password_auto_generated === true ||
        body.password_auto_generated === "true" ||
        body.email_login_credentials === "true" ||
        body.email_login_credentials === true
      ) {
        await sendPasswordEmail(
          targetUser.email,
          targetUser.loginId || targetUser.email,
          newPassword,
        );
      }
    } else if (body.next_login_password_change !== undefined) {
      await user.update({
        next_login_password_change: body.next_login_password_change === "true" || body.next_login_password_change === true,
      }, { transaction: t });
    }

    /* --------------------------
              UPDATE USER
      --------------------------- */

    const updateData = {
      ...body,
      email: body.email?.toLowerCase(),
      address_id: addressId,
      use_company_address: body.use_company_address === "true" || body.use_company_address === true,
    };

    // Remove fields handled separately
    delete updateData.address;
    delete updateData.password_auto_generated;
    delete updateData.manual_password;
    delete updateData.next_login_password_change;
    delete updateData.email_login_credentials;

    // Use Sequelize update on instance
    await user.update(updateData, { transaction: t });

    /* --------------------------
           BUILDER MANAGEMENT
      --------------------------- */
    if (body.builder_id) {
      if (user.builder_id && user.builder_id !== body.builder_id) {
        throw {
          status: 400,
          message:
            "User already has a builder assigned. Each user can only have one builder.",
        };
      }
      if (!user.builder_id) {
        await user.update({ builder_id: body.builder_id }, { transaction: t });
      }
    }

    /* --------------------------
          PHOTO & SIGNATURE
      --------------------------- */

    if (files.photo) {
      if (targetUser.photo) {
        await deleteFromS3(targetUser.photo);
      }
      await user.update({ photo: files.photo.location }, { transaction: t });
    }

    if (files.signature) {
      if (targetUser.signature) {
        await deleteFromS3(targetUser.signature);
      }
      await user.update({ signature: files.signature.location }, { transaction: t });
    }

    const currentUserId = currentUser.users_id || currentUser.id;
    const newData = user.get({ plain: true });

    await compareAndLogUpdates(t, {
      userId: currentUserId,
      companyId: newData.company_id || currentUser.company_id,
      builderId: newData.builder_id || currentUser.builder_id,
      referenceId: userId,
      referenceType: "USER",
      module: "User",
      moduleId: userId,
      recordName: newData.name,
      oldData: targetUser,
      newData: keysToCamelCase(newData),
      ignoreFields: ["password", "photo", "signature", "updatedAt", "updated_at", "rootUser"],
    });

    await t.commit();

    return await getProfile(userId);
  } catch (error) {
    await t.rollback();
    throw error;
  }
}

/* ----------------------------------------
            SOFT DELETE USER
  ---------------------------------------- */
export async function deleteUser(currentUser, userId) {
  const { Users } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (user.root_user) {
    throw { status: 403, message: "Cannot delete root user." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  await user.update({ is_deleted: true });

  const currentUserId = currentUser.users_id || currentUser.id;
  await logActivity(null, {
    userId: currentUserId,
    companyId: user.company_id || currentUser.company_id,
    builderId: user.builder_id || currentUser.builder_id,
    referenceId: userId,
    referenceType: "USER",
    module: "User",
    moduleId: userId,
    recordName: user.name,
    action: "DELETE",
    description: `Deleted user: ${user.name}`,
  });

  return { userId };
}

/* ----------------------------------------
            RESET PASSWORD
  ---------------------------------------- */
export async function resetPassword(currentUser, userId, body) {
  const { Users } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (user.root_user) {
    throw { status: 403, message: "Cannot reset root user password." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  const {
    password_auto_generated,
    manual_password,
    next_login_password_change,
    email_password,
    email_login_credentials,
  } = body;

  if (password_auto_generated === true || password_auto_generated === "true") {
    if (manual_password) {
      throw {
        status: 400,
        message: "Manual password cannot be provided when password is auto-generated.",
      };
    }
  }

  let newPassword;
  if (password_auto_generated === false || password_auto_generated === "false") {
    if (!manual_password) {
      throw { status: 400, message: "Manual password missing." };
    }
    if (!validatePasswordPolicy(manual_password)) {
      throw {
        status: 400,
        message: "Password must be minimum 8 characters with uppercase, lowercase, and number.",
      };
    }
    newPassword = manual_password;
  } else {
    newPassword = generateStrongPassword();
  }

  const encrypted = encrypt(newPassword);

  let nextLoginPasswordChange = false;
  if (password_auto_generated === false || password_auto_generated === "false") {
    nextLoginPasswordChange = next_login_password_change === "true" || next_login_password_change === true;
  }

  await user.update({
    password: encrypted,
    is_verified: true,
    next_login_password_change: nextLoginPasswordChange,
  });

  if (
    password_auto_generated === true ||
    password_auto_generated === "true" ||
    email_login_credentials === "true" ||
    email_password === true ||
    email_login_credentials === true
  ) {
    await sendPasswordEmail(user.email, user.login_id || user.email, newPassword);
  }

  return { userId };
}

/* ----------------------------------------
            CHANGE LOGIN ID
  ---------------------------------------- */
export async function changeLoginId(currentUser, userId, body) {
  const { Users } = db;
  const { new_login_id, email_login_id } = body;

  if (!/^[A-Za-z0-9._@-]+$/.test(new_login_id)) {
    throw {
      status: 400,
      message: "Invalid login ID. Only A–Z, a–z, 0–9, dot, hyphen, underscore, @ allowed.",
    };
  }

  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });
  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (user.root_user) {
    throw { status: 403, message: "Cannot change root login ID." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  const exists = await Users.findOne({
    where: {
      [Op.or]: [
        { email: { [Op.iLike]: new_login_id.toLowerCase() } },
        { login_id: { [Op.iLike]: new_login_id } }
      ],
      users_id: { [Op.ne]: userId }
    }
  });
  if (exists) {
    throw { status: 400, message: "This Login ID is already registered or used as an email by another user." };
  }

  await user.update({ login_id: new_login_id });

  if (email_login_id === "true" || email_login_id === true) {
    await sendLoginIdEmail(user.email, new_login_id);
  }

  return { usersId: userId, loginId: new_login_id };
}
/* ----------------------------------------
            ACTIVE / INACTIVE
  ---------------------------------------- */
export async function toggleActive(currentUser, userId) {
  const { Users, UsersToken } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (user.root_user) {
    throw { status: 403, message: "Cannot change root user status." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  const newValue = !user.is_active;
  await user.update({ is_active: newValue });

  if (newValue === false) {
    await UsersToken.destroy({ where: { user_id: userId } });
  }

  return { usersId: userId, is_active: newValue };
}
/* ----------------------------------------
            LOCK / UNLOCK USER
  ---------------------------------------- */
export async function toggleLock(currentUser, userId) {
  const { Users, UsersToken } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (user.root_user) {
    throw { status: 403, message: "Cannot change root user lock status." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  const newValue = !user.is_locked;
  await user.update({ is_locked: newValue });

  if (newValue === true) {
    await UsersToken.destroy({ where: { user_id: userId } });
  }

  return { usersId: userId, is_locked: newValue };
}

/* ----------------------------------------
            PHOTO UPDATE
  ---------------------------------------- */
export async function updatePhoto(currentUser, userId, file) {
  const { Users } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (user.root_user) {
    throw { status: 403, message: "Cannot modify root user." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  if (user.photo) {
    await deleteFromS3(user.photo);
  }

  await user.update({ photo: file.location });

  return { userId, photo: file.location };
}

// Self-service: the signed-in user edits their own personal details. Only name,
// phone and picture — never role, email, builder or firm fields. No hierarchy
// check: roles like Contact manage no one, yet still own their profile.
export async function updateOwnProfile(userId, body, file) {
  const { Users } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }

  const updates = { name: body.name, phone: body.phone || null };

  if (file) {
    if (user.photo) {
      await deleteFromS3(user.photo);
    }
    updates.photo = file.location;
  }

  await user.update(updates);

  return { userId, name: user.name, phone: user.phone, photo: user.photo };
}

export async function updateSignature(currentUser, userId, file) {
  const { Users } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (user.root_user) {
    throw { status: 403, message: "Cannot modify root user." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  if (user.signature) {
    await deleteFromS3(user.signature);
  }

  await user.update({ signature: file.location });

  return { userId, signature: file.location };
}

/* ----------------------------------------
            DELETE PHOTO
  ---------------------------------------- */
export async function deletePhoto(currentUser, userId) {
  const { Users } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (!user.photo) {
    throw { status: 400, message: "No photo exists." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  await deleteFromS3(user.photo);
  await user.update({ photo: null });

  return { userId };
}

export async function deleteSignature(currentUser, userId) {
  const { Users } = db;
  const user = await Users.findOne({ where: { users_id: userId, is_deleted: false } });

  if (!user) {
    throw { status: 404, message: "User not found." };
  }
  if (!user.signature) {
    throw { status: 400, message: "No signature exists." };
  }

  if (user.role_id) {
    await _checkHierarchicalAccess(currentUser, user.role_id);
  }

  await deleteFromS3(user.signature);
  await user.update({ signature: null });

  return { userId };
}

export default {
  getUsers,
  getProfile,
  getBasicUser,
  createUser,
  updateUser,
  resetPassword,
  changeLoginId,
  toggleActive,
  toggleLock,
  updatePhoto,
  updateOwnProfile,
  updateSignature,
  deletePhoto,
  deleteSignature,
  deleteUser,
};
