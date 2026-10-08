import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";
import { ROLES } from "../../constants/rbac.js";

/**
 * The roles the "Assign Roles" modal offers on a job. `user_role_mapping` says
 * who holds a role across the whole tenant; this module records who owns it on
 * one specific job, so the list is deliberately narrower than the full RBAC
 * role set — it excludes platform/portal identities (Super Admin, Contact,
 * Agent) and sales-side roles that are settled before a job exists.
 *
 * Custom (non-system) roles the company created are always included on top of
 * this list, and `?all=true` returns every active role in the tenant.
 */
export const JOB_ASSIGNABLE_ROLE_NAMES = Object.freeze([
  ROLES.ACCOUNTS,
  ROLES.BUILDER,
  ROLES.COLOR_CONSULTANT,
  ROLES.COMPANY_ADMINISTRATOR,
  ROLES.CONSTRUCTION_MANAGER,
  ROLES.CONSTRUCTION_MANAGER_MH,
  ROLES.CONTRACT_ADMIN,
  // ROLES.MH_COMPANY_ADMIN,
  // ROLES.MY_HOME_COMPANY_ADMIN,
  // ROLES.MY_HOME_ADMIN,
  ROLES.PERMITS,
  ROLES.SITE_SUPERVISOR,
]);

/** Roles that never belong to a job team, even under `?all=true`. */
const NEVER_ASSIGNABLE_ROLE_NAMES = Object.freeze([ROLES.SUPER_ADMIN, ROLES.CONTACT]);

const USER_ATTRIBUTES = ["users_id", "name", "email", "initials", "photo", "designation"];

class JobRoleService {
  /**
   * Rows this caller may see. Mirrors JobDelayService._tenantScope so job,
   * role, user and assignment queries all agree on tenancy.
   */
  _tenantScope(user) {
    const builderId = user?.builder_id;
    const companyId = user?.company_id;

    if (builderId && companyId) {
      return { [Op.or]: [{ builder_id: builderId }, { company_id: companyId }] };
    }
    if (builderId) {
      return { [Op.or]: [{ builder_id: builderId }] };
    }
    if (companyId) {
      return { [Op.or]: [{ company_id: companyId }] };
    }
    return {};
  }

  /** Load the job, or fail with the 404 every job-scoped endpoint returns. */
  async _findJob(jobId, user) {
    const { Job } = db;
    return Job.findOne({ where: { job_id: jobId, ...this._tenantScope(user) } });
  }

  /**
   * Active roles offered for this job, ordered the way the modal lists them.
   * `all` widens the set from JOB_ASSIGNABLE_ROLE_NAMES to every active role.
   */
  async _getAssignableRoles(user, { all = false } = {}) {
    const { Role } = db;

    const where = {
      is_active: true,
      ...this._tenantScope(user),
      name: { [Op.notIn]: [...NEVER_ASSIGNABLE_ROLE_NAMES] },
    };

    if (!all) {
      // System roles are restricted to the job-team list; custom roles the
      // company created are always offered.
      where[Op.and] = [
        {
          [Op.or]: [
            { name: { [Op.in]: [...JOB_ASSIGNABLE_ROLE_NAMES] } },
            { is_system: false },
          ],
        },
      ];
    }

    return Role.findAll({
      where,
      attributes: ["role_id", "name", "description", "is_system"],
      order: [["name", "ASC"]],
    });
  }

  /**
   * Users who may be picked for each of `roleIds`, keyed by role_id.
   *
   * A user is eligible for a role when it is their primary role (users.role_id)
   * or they hold it as a secondary role (user_role_mapping) — the modal's
   * dropdown must be filtered per role, not show every user in the tenant.
   */
  async _getEligibleUsersByRole(roleIds, user) {
    const { Users, UserRoleMapping } = db;
    const byRole = new Map(roleIds.map((id) => [id, []]));
    if (roleIds.length === 0) {
      return byRole;
    }

    const userScope = { is_deleted: false, is_active: true, ...this._tenantScope(user) };

    const [primaryUsers, mappings] = await Promise.all([
      Users.findAll({
        where: { ...userScope, role_id: { [Op.in]: roleIds } },
        attributes: [...USER_ATTRIBUTES, "role_id"],
        order: [["name", "ASC"]],
      }),
      UserRoleMapping.findAll({
        where: { role_id: { [Op.in]: roleIds } },
        attributes: ["role_id"],
        include: [
          {
            model: Users,
            as: "user",
            where: userScope,
            attributes: USER_ATTRIBUTES,
            required: true,
          },
        ],
      }),
    ]);

    // Track (role, user) pairs already added so a user holding a role both
    // primarily and via a mapping appears once.
    const seen = new Set();
    const push = (roleId, row) => {
      const key = `${roleId}:${row.users_id}`;
      if (!byRole.has(roleId) || seen.has(key)) {
        return;
      }
      seen.add(key);
      byRole.get(roleId).push({
        usersId: row.users_id,
        name: row.name,
        email: row.email,
        initials: row.initials,
        photo: row.photo,
        designation: row.designation,
      });
    };

    for (const row of primaryUsers) {
      push(row.role_id, row.get({ plain: true }));
    }
    for (const mapping of mappings) {
      if (mapping.user) {
        push(mapping.role_id, mapping.user.get({ plain: true }));
      }
    }

    for (const list of byRole.values()) {
      list.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    return byRole;
  }

  /** Current assignments for a job, keyed by role_id. */
  async _getAssignmentsByRole(jobId) {
    const { JobRoleAssignment, Users } = db;
    const rows = await JobRoleAssignment.findAll({
      where: { job_id: jobId },
      include: [
        { model: Users, as: "user", attributes: USER_ATTRIBUTES, required: false },
        { model: Users, as: "assignedByUser", attributes: ["users_id", "name", "initials"], required: false },
      ],
    });
    return new Map(rows.map((row) => [row.role_id, row]));
  }

  _formatAssignment(row) {
    if (!row) {
      return null;
    }
    const plain = row.get ? row.get({ plain: true }) : row;
    return {
      jobRoleAssignmentId: plain.job_role_assignment_id,
      userId: plain.user_id,
      user: plain.user ? keysToCamelCase(plain.user) : null,
      assignedBy: plain.assignedByUser ? keysToCamelCase(plain.assignedByUser) : null,
      assignedAt: plain.assigned_at || null,
    };
  }

  /**
   * GET /job-role/:job_id — everything the Assign Roles modal needs in one
   * call: each role, the user currently assigned to it on this job, and the
   * users eligible to be picked for it.
   */
  async getJobRoles(jobId, query, user) {
    const job = await this._findJob(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const all = query?.all === true || query?.all === "true";
    const withoutUsers = query?.without_users === true || query?.without_users === "true";

    const roles = await this._getAssignableRoles(user, { all });
    const roleIds = roles.map((r) => r.role_id);

    const [assignmentsByRole, eligibleByRole] = await Promise.all([
      this._getAssignmentsByRole(jobId),
      withoutUsers ? Promise.resolve(new Map()) : this._getEligibleUsersByRole(roleIds, user),
    ]);

    const data = roles.map((role) => {
      const assignment = this._formatAssignment(assignmentsByRole.get(role.role_id));
      return {
        roleId: role.role_id,
        name: role.name,
        description: role.description,
        isSystem: role.is_system,
        assignedUserId: assignment?.userId || null,
        assignment,
        ...(withoutUsers ? {} : { users: eligibleByRole.get(role.role_id) || [] }),
      };
    });

    return {
      success: true,
      data: { jobId, referenceNumber: job.reference_number, roles: data },
      message: "Job roles fetched successfully",
    };
  }

  /**
   * Validate that `userId` may hold `roleId` in this tenant. Returns the user
   * row, or an error result the caller can return as-is.
   */
  async _assertUserEligible(userId, roleId, roleName, user) {
    const { Users, UserRoleMapping } = db;

    const candidate = await Users.findOne({
      where: { users_id: userId, is_deleted: false, ...this._tenantScope(user) },
      attributes: [...USER_ATTRIBUTES, "role_id", "is_active"],
    });
    if (!candidate) {
      return { error: { success: false, statusCode: 404, message: "User not found or unauthorized" } };
    }
    if (!candidate.is_active) {
      return { error: { success: false, statusCode: 400, message: `${candidate.name} is inactive and cannot be assigned` } };
    }

    if (candidate.role_id !== roleId) {
      const mapping = await UserRoleMapping.findOne({ where: { user_id: userId, role_id: roleId } });
      if (!mapping) {
        return {
          error: {
            success: false,
            statusCode: 400,
            message: `${candidate.name} does not hold the "${roleName}" role`,
          },
        };
      }
    }

    return { user: candidate };
  }

  /**
   * PUT /job-role/:job_id — bulk save from the modal's save button.
   *
   * Idempotent: only the roles present in `assignments` are touched, an entry
   * with user_id = null clears that role, and re-sending an unchanged payload
   * writes nothing and logs nothing.
   */
  async saveJobRoles(jobId, assignments, user) {
    const { Role, JobRoleAssignment } = db;

    const job = await this._findJob(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    // Last entry wins if the client sends the same role twice.
    const requested = new Map();
    for (const entry of assignments) {
      requested.set(entry.role_id, entry.user_id || null);
    }
    const roleIds = [...requested.keys()];

    if (roleIds.length === 0) {
      return this.getJobRoles(jobId, {}, user);
    }

    const roles = await Role.findAll({
      where: { role_id: { [Op.in]: roleIds }, is_active: true, ...this._tenantScope(user) },
      attributes: ["role_id", "name"],
    });
    const roleById = new Map(roles.map((r) => [r.role_id, r]));

    const unknown = roleIds.filter((id) => !roleById.has(id));
    if (unknown.length > 0) {
      return {
        success: false,
        statusCode: 400,
        message: `Role not found or inactive in this company: ${unknown.join(", ")}`,
      };
    }

    // Validate every requested user up-front so a bad entry rejects the whole
    // save instead of leaving the job half-assigned.
    const validatedUsers = new Map();
    for (const [roleId, userId] of requested) {
      if (!userId) {
        continue;
      }
      const { error, user: candidate } = await this._assertUserEligible(
        userId,
        roleId,
        roleById.get(roleId).name,
        user,
      );
      if (error) {
        return error;
      }
      validatedUsers.set(`${roleId}:${userId}`, candidate);
    }

    const existing = await JobRoleAssignment.findAll({ where: { job_id: jobId, role_id: { [Op.in]: roleIds } } });
    const existingByRole = new Map(existing.map((row) => [row.role_id, row]));

    const now = new Date();
    const changes = [];
    const transaction = await db.sequelize.transaction();

    try {
      for (const [roleId, userId] of requested) {
        const current = existingByRole.get(roleId);
        const roleName = roleById.get(roleId).name;

        if (!userId) {
          if (current) {
            await current.destroy({ transaction });
            changes.push({ roleName, action: "DELETE", oldUserId: current.user_id, newUserId: null });
          }
          continue;
        }

        if (current && current.user_id === userId) {
          continue; // unchanged
        }

        if (current) {
          const oldUserId = current.user_id;
          await current.update(
            { user_id: userId, assigned_by: user?.users_id || null, assigned_at: now, updated_by: user?.users_id || null },
            { transaction },
          );
          changes.push({ roleName, action: "UPDATE", oldUserId, newUserId: userId });
        } else {
          await JobRoleAssignment.create(
            {
              job_id: jobId,
              role_id: roleId,
              user_id: userId,
              company_id: job.company_id || user?.company_id || null,
              builder_id: job.builder_id || user?.builder_id || null,
              assigned_by: user?.users_id || null,
              assigned_at: now,
              created_by: user?.users_id || null,
              updated_by: user?.users_id || null,
            },
            { transaction },
          );
          changes.push({ roleName, action: "CREATE", oldUserId: null, newUserId: userId });
        }
      }

      await transaction.commit();
    } catch (error) {
      await transaction.rollback();
      console.error("JobRoleService.saveJobRoles error:", error);
      throw error;
    }

    // Resolve every user id touched by this save to a name for the log lines.
    // The new users are already loaded by the eligibility pass; the outgoing
    // ones are fetched here (they may since have been deactivated).
    const nameById = new Map([...validatedUsers.values()].map((u) => [u.users_id, u.name]));
    const unknownIds = changes
      .map((c) => c.oldUserId)
      .filter((id) => id && !nameById.has(id));
    if (unknownIds.length > 0) {
      const previous = await db.Users.findAll({
        where: { users_id: { [Op.in]: unknownIds } },
        attributes: ["users_id", "name"],
      });
      for (const row of previous) {
        nameById.set(row.users_id, row.name);
      }
    }

    for (const change of changes) {
      const oldName = change.oldUserId ? nameById.get(change.oldUserId) || change.oldUserId : null;
      const newName = change.newUserId ? nameById.get(change.newUserId) || change.newUserId : null;
      await logJobActivity(null, {
        userId: user?.users_id || null,
        jobId,
        module: "Job Role",
        moduleId: jobId,
        recordName: job.reference_number,
        action: change.action,
        fieldName: change.roleName,
        oldValue: oldName,
        newValue: newName,
        description:
          change.action === "DELETE"
            ? `Cleared the ${change.roleName} role${oldName ? ` (was ${oldName})` : ""}`
            : `Assigned ${newName || "a user"} as ${change.roleName}`,
      });
    }

    const refreshed = await this.getJobRoles(jobId, {}, user);
    return { ...refreshed, message: `Job roles saved successfully (${changes.length} change(s))` };
  }

  /** POST /job-role/:job_id/:role_id — assign or reassign a single role. */
  async assignJobRole(jobId, roleId, userId, user) {
    return this.saveJobRoles(jobId, [{ role_id: roleId, user_id: userId }], user);
  }

  /** DELETE /job-role/:job_id/:role_id — clear a single role. */
  async unassignJobRole(jobId, roleId, user) {
    const { JobRoleAssignment } = db;

    const job = await this._findJob(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const existing = await JobRoleAssignment.findOne({ where: { job_id: jobId, role_id: roleId } });
    if (!existing) {
      return { success: false, statusCode: 404, message: "No user is assigned to this role on this job" };
    }

    return this.saveJobRoles(jobId, [{ role_id: roleId, user_id: null }], user);
  }

  /**
   * GET /job-role/:job_id/assigned — the flat "who is on this job" list, for
   * headers and cards that only need the filled roles.
   */
  async getAssignedUsers(jobId, user) {
    const { JobRoleAssignment, Role, Users } = db;

    const job = await this._findJob(jobId, user);
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const rows = await JobRoleAssignment.findAll({
      where: { job_id: jobId },
      include: [
        { model: Role, as: "role", attributes: ["role_id", "name"], required: true },
        { model: Users, as: "user", attributes: USER_ATTRIBUTES, required: true },
      ],
      order: [[{ model: Role, as: "role" }, "name", "ASC"]],
    });

    const data = rows.map((row) => ({
      jobRoleAssignmentId: row.job_role_assignment_id,
      roleId: row.role_id,
      roleName: row.role?.name || null,
      assignedAt: row.assigned_at,
      user: keysToCamelCase(row.user.get({ plain: true })),
    }));

    return { success: true, data, message: "Assigned job roles fetched successfully" };
  }
}

export default new JobRoleService();
