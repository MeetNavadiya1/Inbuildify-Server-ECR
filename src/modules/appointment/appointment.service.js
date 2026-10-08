import db from "../../config/database/models/postgre-models/index.js";
import { Op, literal } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";
import { logActivity, compareAndLogUpdates } from "../../utils/activityLogger.js";
import { logJobActivity, compareAndLogJobUpdates } from "../../utils/jobActivityLogger.js";
import { checkLeadLockStatus } from "../../helper/leadLock.helper.js";
import appointmentEmailQueue from "../../workers/appointmentEmailWorker.js";

import emailQueue from "../../queues/emailQueue.js";



/**
 * APPOINTMENT SERVICE
 * Contains all business logic and Sequelize operations.
 */

function formatLocalYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDaysYmd(ymd, days) {
  const [y, mo, da] = ymd.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  d.setDate(d.getDate() + days);
  return formatLocalYmd(d);
}

function startOfWeekSundayYmd(ymd) {
  const [y, mo, da] = ymd.split("-").map(Number);
  const d = new Date(y, mo - 1, da);
  const day = d.getDay();
  d.setDate(d.getDate() - day);
  return formatLocalYmd(d);
}

function endOfWeekFromStartSundayYmd(startYmd) {
  return addDaysYmd(startYmd, 6);
}

function isValidDate(dateString) {
  const d = new Date(dateString);
  return !isNaN(d.getTime());
}

export async function createAppointment(currentUser, body) {
  const { Appointment, Leads, Users, Builder, NotificationTemplate, sequelize } = db;
  const transaction = await sequelize.transaction();
  try {
    const builderId = currentUser?.builder_id;
    const companyId = currentUser?.company_id;
    const userId = currentUser?.user_id;

    const {
      title,
      date,
      start_time,
      end_time,
      location_text,
      lead_id,
      job_id,
      link_type,
      select_users,
      notes,
      send_appointment_customer,
    } = body;

    const final_lead_id = lead_id;

    if (start_time >= end_time) {
      throw { status: 400, message: "start_time must be earlier than end_time." };
    }

    let lead = null;
    if (final_lead_id) {

      lead = await Leads.findOne({
        where: {
          leads_id: final_lead_id,
          [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        },
        transaction,
      });
      if (!lead) {
        throw {
          status: 400,
          message: "Invalid lead_id. Lead not found for this builder/company.",
        };
      }

      // Allow appointments on jobs (won opportunity); block only when lost.
      await checkLeadLockStatus(lead_id, null, { blockOutcomes: ["lost"] });
      // Appointments are allowed on won/lost leads (jobs still need ongoing appointments)
    }

    if (select_users && select_users.length > 0) {
      const users = await Users.findAll({
        where: {
          users_id: { [Op.in]: select_users },
          is_deleted: false,
        },
      });

      if (users.length !== select_users.length) {
        throw {
          status: 400,
          message: "One or more user IDs in select_users are invalid or do not belong to this builder/company.",
        };
      }
    }

    if (date && !isValidDate(date)) {
      throw { status: 400, message: `Invalid date: ${date}` };
    }

    const appointment = await Appointment.create({
      company_id: companyId,
      builder_id: builderId,
      title,
      date,
      start_time,
      end_time,
      location_text: location_text?.trim() || null,
      link_to: null,
      lead_id: final_lead_id || null,
      job_id: job_id || null,
      link_type: link_type || null,
      select_users: select_users || [],
      notes: notes && notes.trim() !== "" ? [{ text: notes.trim(), createdAt: new Date().toISOString(), createdBy: userId }] : [],
      send_appointment_customer: send_appointment_customer || false,
      created_by: userId,
      updated_by: userId,
    }, { transaction });

    let selectUsersData = [];
    if (select_users && select_users.length > 0) {
      const users = await Users.findAll({
        where: { users_id: { [Op.in]: select_users }, is_deleted: false },
        attributes: ["users_id", "name"],
      });
      selectUsersData = users.map((u) => ({
        id: u.users_id,
        name: u.name,
      }));
    }

    await transaction.commit();

    // Log Activity
    if (lead_id) {
      await logActivity(null, {
        userId,
        builderId,
        companyId,
        referenceId: lead_id,
        referenceType: "LEAD",
        module: "Appointment",
        moduleId: appointment.appointment_id,
        recordName: title,
        action: "CREATE",
        description: `Appointment created: ${title}`,
      });
    }

    if (job_id) {
      await logJobActivity(null, {
        userId,
        jobId: job_id,
        module: "Appointment",
        moduleId: appointment.appointment_id,
        recordName: title,
        action: "CREATE",
        description: `Appointment created: ${title}`,
      });
    }

    if (send_appointment_customer && lead_id && lead && lead.email) {
      let isExpired = false;
      if (appointment.date && appointment.start_time) {
        const dateStr = typeof appointment.date === "string" ? appointment.date : new Date(appointment.date).toISOString().slice(0, 10);
        const timeStr = typeof appointment.start_time === "string" ? appointment.start_time : String(appointment.start_time);
        const apptDateTime = new Date(`${dateStr}T${timeStr}`);
        if (!isNaN(apptDateTime.getTime())) {
          isExpired = apptDateTime < new Date();
        }
      }

      if (!isExpired) {
        emailQueue.add(
          "appointmentEmail",
          {
            appointmentId: appointment.appointment_id,
            leadId: lead_id,
            builderId,
            companyId,
            userId,
          },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: true,
          }
        ).catch(err => console.error("Error adding appointment email job:", err));
      } else {
        console.log(`[createAppointment] Skipping appointment email queueing because appointment ${appointment.appointment_id} is in the past/expired.`);
      }
    }

    const result = keysToCamelCase(appointment.get({ plain: true }));
    const creator = await Users.findByPk(appointment.created_by, {
      attributes: ["name"],
    });

    const linkedLead = await getLinkedLeadInfo(lead_id);

    return {
      ...result,
      linkTo: result.leadId || result.linkTo,
      selectUsers: selectUsersData,
      createdbyname: creator?.name || null,
      linkedLead,
    };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

async function getLinkedLeadInfo(leadId) {
  const { Leads } = db;
  if (!leadId) return null;
  try {
    const row = await Leads.findByPk(leadId, {
      attributes: [
        "leads_id",
        "reference_number",
        "name",
        [
          literal(`(SELECT status FROM opportunity WHERE leads_id = "Leads"."leads_id" ORDER BY "created_at" DESC LIMIT 1)`),
          "opportunity_status",
        ],
        [
          literal(`(SELECT out_come FROM opportunity WHERE leads_id = "Leads"."leads_id" ORDER BY "created_at" DESC LIMIT 1)`),
          "opportunity_out_come",
        ],
        [
          literal(`(SELECT j.job_id FROM opportunity o JOIN job j ON j.opportunity_id = o.opportunity_id WHERE o.leads_id = "Leads"."leads_id" ORDER BY j."created_at" DESC LIMIT 1)`),
          "job_id",
        ],
      ],
    });
    if (!row) return null;
    const plain = row.get({ plain: true });
    const hasWon = plain.opportunity_out_come && ["won", "Won", "WON"].includes(plain.opportunity_out_come);
    return {
      leadsId: plain.leads_id,
      referenceNumber: plain.reference_number,
      clientName: plain.name,
      leadType: hasWon ? (plain.opportunity_status || "Job") : "Sales",
      jobId: plain.job_id || null,
      // Seeded demo record — badged in the UI, and left out of the pickers on a
      // "create new" form (Settings → Sample Data clears it).
      isSampleData: plain.is_sample_data === true,
    };
  } catch {
    return null;
  }
}

export async function getAllAppointments(currentUser, query) {
  const { Appointment, Users } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  if (!builderId && !companyId) {
    throw {
      status: 401,
      message: "Unauthorized: Missing builder or company ID.",
    };
  }

  let { page = 1, limit = 25 } = query;
  page = parseInt(page);
  limit = parseInt(limit);
  const offset = (page - 1) * limit;

  const {
    title,
    date,
    date_from,
    date_to,
    location_text,
    lead_id,
    job_id,
    link_type,
    assignee_id,
    include_cancelled,
    is_deleted,
  } = query;

  const orConditions = [];
  if (builderId) orConditions.push({ builder_id: builderId });
  if (companyId) orConditions.push({ company_id: companyId });

  const where = {
    [Op.or]: orConditions.length ? orConditions : [{ appointment_id: null }],
  };

  if (title) {
    where.title = { [Op.iLike]: `%${title}%` };
  }

  if (date_from && date_to) {
    where.date = {
      [Op.between]: [date_from.slice(0, 10), date_to.slice(0, 10)],
    };
  } else if (date_from) {
    where.date = { [Op.gte]: date_from.slice(0, 10) };
  } else if (date_to) {
    where.date = { [Op.lte]: date_to.slice(0, 10) };
  } else if (date) {
    where.date = date;
  }

  if (location_text) {
    where.location_text = { [Op.iLike]: `%${location_text}%` };
  }

  if (lead_id) {
    where.lead_id = lead_id;
  }
  if (job_id) {
    where.job_id = job_id;
  } else if (lead_id) {
    where.job_id = null; // Lead timeline → exclude job appointments.
    where.lead_id = lead_id;
  }
  if (link_type) {
    where.link_type = link_type;
  }
  if (assignee_id) {
    where.select_users = { [Op.contains]: [assignee_id] };
  }

  if (
    include_cancelled === "true" ||
    include_cancelled === true ||
    is_deleted === "true" ||
    is_deleted === true
  ) {
    // Show all: skip adding is_deleted filter to where clause
  } else {
    // Default: Show only non-deleted
    where.is_deleted = false;
  }

  const { count, rows } = await Appointment.findAndCountAll({
    where,
    limit,
    offset,
    order: [
      ["date", "DESC"],
      ["start_time", "DESC"],
    ],
  });

  const processedResults = await Promise.all(
    rows.map(async (row) => {
      const appointment = row.get({ plain: true });
      let selectUsersData = [];
      if (appointment.select_users && appointment.select_users.length > 0) {
        const users = await Users.findAll({
          where: {
            users_id: { [Op.in]: appointment.select_users },
            is_deleted: false,
          },
          attributes: ["users_id", "name"],
        });
        selectUsersData = users.map((u) => ({
          id: u.users_id,
          name: u.name,
        }));
      }

      const creator = await Users.findByPk(appointment.created_by, {
        attributes: ["name"],
      });

      const linkedLead = await getLinkedLeadInfo(appointment.lead_id);

      return {
        ...appointment,
        select_users: selectUsersData,
        createdbyname: creator?.name || null,
        linked_lead: linkedLead,
      };
    }),
  );

  return {
    appointment: keysToCamelCase(processedResults),
    totalRecords: count,
    currentPage: page,
    limit,
    totalPages: Math.ceil(count / limit),
  };
}

export async function getAppointmentTabCounts(currentUser, query) {
  const { Appointment } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  if (!builderId && !companyId) {
    throw {
      status: 401,
      message: "Unauthorized: Missing builder or company ID.",
    };
  }

  const { anchor_date, title, assignee_id, include_cancelled } = query;

  const todayYmd =
    anchor_date && /^\d{4}-\d{2}-\d{2}$/.test(anchor_date)
      ? anchor_date
      : formatLocalYmd(new Date());

  const tomorrowYmd = addDaysYmd(todayYmd, 1);
  const thisWeekStart = startOfWeekSundayYmd(todayYmd);
  const thisWeekEnd = endOfWeekFromStartSundayYmd(thisWeekStart);
  const nextWeekStart = addDaysYmd(thisWeekStart, 7);
  const nextWeekEnd = addDaysYmd(thisWeekEnd, 7);

  const baseWhere = {};
  if (builderId) {
    baseWhere.builder_id = builderId;
  } else {
    baseWhere.company_id = companyId;
  }

  if (title) {
    baseWhere.title = { [Op.iLike]: `%${title}%` };
  }
  if (assignee_id) {
    baseWhere.select_users = { [Op.contains]: [assignee_id] };
  }

  if (!(include_cancelled === "true" || include_cancelled === true)) {
    baseWhere.is_deleted = false;
  }

  const countBetween = async (dateFrom, dateTo) => {
    const where = { ...baseWhere };
    if (dateFrom && dateTo) {
      where.date = { [Op.between]: [dateFrom, dateTo] };
    } else if (dateFrom) {
      where.date = { [Op.gte]: dateFrom };
    }
    return await Appointment.count({ where });
  };

  const [all, today, tomorrow, thisWeek, nextWeek, pending] =
    await Promise.all([
      countBetween(null, null),
      countBetween(todayYmd, todayYmd),
      countBetween(tomorrowYmd, tomorrowYmd),
      countBetween(thisWeekStart, thisWeekEnd),
      countBetween(nextWeekStart, nextWeekEnd),
      countBetween(todayYmd, null),
    ]);

  return {
    all,
    today,
    tomorrow,
    thisWeek,
    nextWeek,
    pending,
  };
}

export async function deleteAppointment(currentUser, appointmentId) {
  const { Appointment, Leads, Users } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;
  const userId = currentUser?.user_id;

  const where = {
    appointment_id: appointmentId,
    [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
  };

  const appointment = await Appointment.findOne({
    where,
    include: [{ model: Leads, as: "lead", attributes: ["leads_id"] }]
  });

  if (!appointment) {
    throw { status: 404, message: "Appointment not found or access denied." };
  }

  if (appointment.is_deleted) {
    throw { status: 400, message: "Appointment is already deleted." };
  }

  if (appointment.lead_id) {
    // Allow editing job appointments (won); block only when lost.
    await checkLeadLockStatus(appointment.lead_id, null, { blockOutcomes: ["lost"] });
  }
  // Appointments on won/lost leads (jobs) are still editable/deletable

  await appointment.update({
    is_deleted: true,
    updated_by: userId,
  });

  // Log Activity
  if (appointment.lead_id) {
    await logActivity(null, {
      userId,
      builderId,
      companyId,
      referenceId: appointment.lead_id,
      referenceType: "LEAD",
      module: "Appointment",
      moduleId: appointmentId,
      recordName: appointment.title,
      action: "DELETE",
      description: `Appointment deleted: ${appointment.title}`,
    });
  }

  if (appointment.job_id) {
    await logJobActivity(null, {
      userId,
      jobId: appointment.job_id,
      module: "Appointment",
      moduleId: appointmentId,
      recordName: appointment.title,
      action: "DELETE",
      description: `Appointment deleted: ${appointment.title}`,
    });
  }

  // ── Fetch enriched data to return ──────────────────────────────────────
  const enriched = await Appointment.findByPk(appointmentId, {
    include: [{ model: Users, as: "createdByUser", attributes: ["name"] }],
  });

  const plain = enriched.get({ plain: true });

  let selectUsersData = [];
  if (plain.select_users && plain.select_users.length > 0) {
    const users = await Users.findAll({
      where: {
        users_id: { [Op.in]: plain.select_users },
        is_deleted: false,
      },
      attributes: ["users_id", "name"],
    });
    selectUsersData = users.map((u) => ({
      id: u.users_id,
      name: u.name,
    }));
  }

  const result = {
    ...keysToCamelCase(plain),
    selectUsers: selectUsersData,
    createdbyname: plain.createdByUser?.name || null,
  };

  // Remove unwanted snake_case keys that might have stayed
  delete result.select_users;

  return result;
}

export async function updateAppointment(currentUser, appointmentId, body) {
  const { Appointment, Users, Leads, Builder, NotificationTemplate, sequelize } = db;
  const transaction = await sequelize.transaction();
  try {
    const builderId = currentUser?.builder_id;
    const companyId = currentUser?.company_id;
    const userId = currentUser?.user_id;

    if (!builderId && !companyId) {
      throw {
        status: 403,
        message: "Unauthorized. Builder or company login required.",
      };
    }

    const where = {
      appointment_id: appointmentId,
      [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      is_deleted: false,
    };

    const existing = await Appointment.findOne({
      where,
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!existing) {
      throw { status: 404, message: "Appointment not found or access denied." };
    }

    if (existing.lead_id) {
      // Allow job appointments (won); block only when lost.
      await checkLeadLockStatus(existing.lead_id, null, { blockOutcomes: ["lost"] });
    }
    // Appointments on won/lost leads (jobs) are still editable

    let lead = null;
    if (existing.lead_id) {
      lead = await Leads.findOne({
        where: {
          leads_id: existing.lead_id,
          [Op.or]: [{ company_id: companyId }, { builder_id: builderId }],
        },
        transaction,
      });
    }

    const {
      title,
      date,
      start_time,
      end_time,
      location_text,
      lead_id,
      select_users,
      notes,
      send_appointment_customer,
      status,
    } = body;

    const final_lead_id = lead_id !== undefined ? lead_id : existing.lead_id;

    const newStartTime =
      start_time !== undefined ? start_time : existing.start_time;
    const newEndTime = end_time !== undefined ? end_time : existing.end_time;

    if (newStartTime >= newEndTime) {
      throw {
        status: 400,
        message: "start_time must be earlier than end_time.",
      };
    }

    if (select_users !== undefined) {
      if (!Array.isArray(select_users)) {
        throw { status: 400, message: "`select_users` must be an array." };
      }
      if (select_users.length > 0) {
        const userCount = await Users.count({
          where: { users_id: { [Op.in]: select_users }, is_deleted: false },
          transaction,
        });
        if (userCount !== select_users.length) {
          throw { status: 400, message: "One or more user IDs are invalid." };
        }
      }
    }

    if (date && !isValidDate(date)) {
      throw { status: 400, message: `Invalid date: ${date}` };
    }

    const updateData = {};
    if (title !== undefined) {
      updateData.title = title;
    }
    if (date !== undefined) {
      updateData.date = date;
    }
    if (start_time !== undefined) {
      updateData.start_time = start_time;
    }
    if (end_time !== undefined) {
      updateData.end_time = end_time;
    }
    if (location_text !== undefined) {
      updateData.location_text = location_text?.trim() || null;
    }
    if (lead_id !== undefined) {
      updateData.link_to = null;
      updateData.lead_id = lead_id || null;
    }
    if (select_users !== undefined) {
      updateData.select_users = select_users;
    }
    if (notes !== undefined && notes !== null) {
      // Replace the note instead of appending. Appending a new entry on every
      // update grew the notes array unbounded — the accumulated text blew past
      // the length limit and re-serialised prior entries into the body. The
      // edit UI is a single "Notes" textarea, so an update should replace it.
      const trimmed = String(notes).trim();
      updateData.notes =
        trimmed !== ""
          ? [{ text: trimmed, createdAt: new Date().toISOString(), createdBy: userId }]
          : [];
    }
    if (send_appointment_customer !== undefined) {
      updateData.send_appointment_customer = send_appointment_customer;
    }
    if (status !== undefined) {
      updateData.status = status;
    }

    if (Object.keys(updateData).length === 0) {
      throw { status: 400, message: "No fields provided for update." };
    }

    updateData.updated_by = userId;

    await Appointment.update(updateData, { where, transaction });

    const updated = await Appointment.findByPk(appointmentId, {
      transaction,
    });
    const updatedPlain = updated.get({ plain: true });

    let selectUsersData = [];
    if (updatedPlain.select_users && updatedPlain.select_users.length > 0) {
      const users = await Users.findAll({
        where: {
          users_id: { [Op.in]: updatedPlain.select_users },
          is_deleted: false,
        },
        attributes: ["users_id", "name"],
        transaction,
      });
      selectUsersData = users.map((u) => ({
        id: u.users_id,
        name: u.name,
      }));
    }

    const creator = await Users.findByPk(updatedPlain.created_by, {
      attributes: ["name"],
      transaction,
    });

    await transaction.commit();

    // Log Activity
    if (existing.lead_id) {
      await compareAndLogUpdates(null, {
        userId,
        builderId,
        companyId,
        referenceId: existing.lead_id,
        referenceType: "LEAD",
        module: "Appointment",
        moduleId: appointmentId,
        recordName: updatedPlain.title,
        oldData: keysToCamelCase(existing.get({ plain: true })),
        newData: keysToCamelCase(updatedPlain),
      });
    }

    if (existing.job_id) {
      await compareAndLogJobUpdates(null, {
        userId,
        jobId: existing.job_id,
        module: "Appointment",
        moduleId: appointmentId,
        recordName: updatedPlain.title,
        oldData: keysToCamelCase(existing.get({ plain: true })),
        newData: keysToCamelCase(updatedPlain),
      });
    }

    if (send_appointment_customer && existing.lead_id && lead && lead.email) {
      let isExpired = false;
      if (updatedPlain.date && updatedPlain.start_time) {
        const dateStr = typeof updatedPlain.date === "string" ? updatedPlain.date : new Date(updatedPlain.date).toISOString().slice(0, 10);
        const timeStr = typeof updatedPlain.start_time === "string" ? updatedPlain.start_time : String(updatedPlain.start_time);
        const apptDateTime = new Date(`${dateStr}T${timeStr}`);
        if (!isNaN(apptDateTime.getTime())) {
          isExpired = apptDateTime < new Date();
        }
      }

      if (!isExpired) {
        emailQueue.add(
          "appointmentEmail",
          {
            appointmentId: updatedPlain.appointment_id,
            leadId: existing.lead_id,
            builderId,
            companyId,
            userId,
          },
          {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: true,
          }
        ).catch(err => console.error("Error adding appointment email job:", err));
      } else {
        console.log(`[updateAppointment] Skipping appointment email queueing because appointment ${appointmentId} is in the past/expired.`);
      }
    }

    const result = keysToCamelCase(updatedPlain);
    return {
      appointmentId: result.appointmentId,
      companyId: result.companyId,
      builderId: result.builderId,
      title: result.title,
      date: result.date,
      startTime: result.startTime,
      endTime: result.endTime,
      locationText: result.locationText ?? null,
      linkTo: result.leadId || result.linkTo,
      selectUsers: selectUsersData,
      notes: result.notes,
      sendAppointmentCustomer: result.sendAppointmentCustomer,
      status: result.status,
      isDeleted: result.isDeleted,
      createdBy: result.createdBy,
      createdbyname: creator?.name || null,
      updatedBy: result.updatedBy,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };
  } catch (error) {
    if (transaction) {
      await transaction.rollback();
    }
    throw error;
  }
}

/**
 * Search leads/jobs for the "Link To" appointment field.
 * Returns reference number, client name, and derived type (Sales / Job / etc.)
 */
export async function searchLeadsForLinkTo(currentUser, query) {
  const { Leads } = db;
  const builderId = currentUser?.builder_id;
  const companyId = currentUser?.company_id;

  const { q = "" } = query;
  const searchTerm = q.trim();

  const orScope = [];
  if (builderId) orScope.push({ builder_id: builderId });
  if (companyId) orScope.push({ company_id: companyId });

  const scopeCondition = orScope.length ? orScope : [{ leads_id: null }];

  // Build where clause — if no search term, return top-20 most recent for this builder/company
  const whereClause = searchTerm.length > 0
    ? {
        [Op.and]: [
          { [Op.or]: scopeCondition },
          {
            [Op.or]: [
              { reference_number: { [Op.iLike]: `%${searchTerm}%` } },
              { name: { [Op.iLike]: `%${searchTerm}%` } },
              { email: { [Op.iLike]: `%${searchTerm}%` } },
            ],
          },
        ],
      }
    : { [Op.or]: scopeCondition };

  const rows = await Leads.findAll({
    where: whereClause,
    attributes: [
      "leads_id",
      "reference_number",
      "name",
      // Derive opportunity status via subquery
      [
        literal(`(SELECT status FROM opportunity WHERE leads_id = "Leads"."leads_id" ORDER BY "created_at" DESC LIMIT 1)`),
        "opportunity_status",
      ],
      [
        literal(`(SELECT out_come FROM opportunity WHERE leads_id = "Leads"."leads_id" ORDER BY "created_at" DESC LIMIT 1)`),
        "opportunity_out_come",
      ],
      // Get job_id for won leads
      [
        literal(`(SELECT j.job_id FROM opportunity o JOIN job j ON j.opportunity_id = o.opportunity_id WHERE o.leads_id = "Leads"."leads_id" ORDER BY j."created_at" DESC LIMIT 1)`),
        "job_id",
      ],
    ],
    limit: 20,
    order: [["createdAt", "DESC"]],
  });

  const leads = rows.map((row) => {
    const plain = row.get({ plain: true });
    const hasWon =
      plain.opportunity_out_come &&
      ["won", "Won", "WON"].includes(plain.opportunity_out_come);

    let leadType = "Sales";
    if (hasWon) {
      leadType = plain.opportunity_status || "Job";
    }

    return {
      leadsId: plain.leads_id || plain.leadsId,
      referenceNumber: plain.reference_number || plain.referenceNumber,
      clientName: plain.name,
      leadType,
      jobId: plain.job_id || plain.jobId || null,
    };
  });

  return { leads };
}

export async function searchUserBuilderTables(query) {
  const { Users, ConstructionType, SalesProcess } = db;
  const { search } = query;

  if (!search || search.trim().length < 2) {
    throw {
      status: 400,
      message: "Search term must be at least 2 characters long.",
    };
  }

  const searchTerm = search.trim();
  const users = await Users.findAll({
    where: {
      [Op.or]: [
        { name: { [Op.iLike]: `%${searchTerm}%` } },
        { email: { [Op.iLike]: `%${searchTerm}%` } },
      ],
      is_deleted: false,
    },
    limit: 1,
  });

  if (users.length === 0) {
    throw {
      status: 404,
      message: "No user found with the provided name or email.",
    };
  }

  const foundUser = users[0];
  const userBuilderId = foundUser.builder_id;

  const existingTables = [];
  const [constCount, userCount, salesCount] = await Promise.all([
    ConstructionType.count({ where: { builder_id: userBuilderId } }),
    Users.count({
      where: { builder_id: userBuilderId, is_deleted: false },
    }),
    SalesProcess.count({ where: { builder_id: userBuilderId } }),
  ]);

  if (constCount > 0) {
    existingTables.push("construction_type");
  }
  if (userCount > 0) {
    existingTables.push("users");
  }
  if (salesCount > 0) {
    existingTables.push("sales_process");
  }

  if (existingTables.length === 0) {
    throw {
      status: 404,
      message: `No records found for user "${foundUser.name}" in construction, users, or sales tables.`,
    };
  }

  return {
    userName: foundUser.name,
    builderId: userBuilderId,
    existingTables,
    searchTerm: search,
  };
}

export default {
  createAppointment,
  getAllAppointments,
  getAppointmentTabCounts,
  deleteAppointment,
  updateAppointment,
  searchUserBuilderTables,
};
