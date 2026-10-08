import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";
import { QueryTypes } from "sequelize";
import { validateTodoDateSequence, TODO_CLOSED_STATUSES } from "./todo.validation.js";
import { sampleDataSqlScope } from "../../config/database/models/postgre-models/sampleDataFlag.js";

const NOT_CLOSED_SQL = `t.status NOT IN (${TODO_CLOSED_STATUSES.map((s) => `'${s}'`).join(", ")})`;
const WEEK_START_SQL = "(date_trunc('week', CURRENT_DATE + INTERVAL '1 day') - INTERVAL '1 day')";

const DATE_BUCKET_SQL = {
  today: "t.booking_date = CURRENT_DATE",
  tomorrow: "t.booking_date = CURRENT_DATE + INTERVAL '1 day'",
  this_week: `t.booking_date BETWEEN ${WEEK_START_SQL} AND ${WEEK_START_SQL} + INTERVAL '6 days'`,
  next_week: `t.booking_date BETWEEN ${WEEK_START_SQL} + INTERVAL '7 days' AND ${WEEK_START_SQL} + INTERVAL '13 days'`,
  overdue: "t.booking_date < CURRENT_DATE",
};

// Job Address is assembled from the property behind the job, so both the SELECT
// and the address filter have to use the same expression.
const JOB_ADDRESS_SQL = `COALESCE(
  NULLIF(TRIM(
    CONCAT_WS(', ',
      NULLIF(TRIM(COALESCE(pd.lot_number, '')), ''),
      NULLIF(TRIM(COALESCE(pd.street, '')), ''),
      NULLIF(TRIM(COALESCE(pd.address_line1, '')), ''),
      NULLIF(TRIM(COALESCE(pd.address_line2, '')), ''),
      NULLIF(TRIM(COALESCE(pd.city, '')), ''),
      NULLIF(TRIM(COALESCE(st.name, '')), ''),
      NULLIF(TRIM(COALESCE(pd.zip_code, '')), '')
    )
  ), ''),
  'N/A'
)`;

const ADDRESS_JOINS = `LEFT JOIN job j ON t.job_id = j.job_id
       LEFT JOIN opportunity o ON j.opportunity_id = o.opportunity_id
       LEFT JOIN leads l ON o.leads_id = l.leads_id
       LEFT JOIN property_detail pd ON l.property_detail_id = pd.property_detail_id
       LEFT JOIN state st ON pd.state_id = st.state_id`;

/**
 * booking_date / start_date are date columns. Joi has already turned the query
 * value into a Date, so binding it directly would hand Postgres a timestamp and
 * let the session timezone move the boundary by a day. Bind a plain date instead.
 */
function toDateOnly(value) {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export async function createTodo(req, res) {
  try {
    const builderId = req.user?.builder_id;
    const companyId = req.user?.company_id;
    const createdBy = req.user?.user_id;

    if (!builderId || !companyId) {
      return errorResponse(res, 400, "Invalid builder or company");
    }

    const {
      job_id,
      task_name,
      supplier_id,
      booking_date,
      start_date,
      finish_date,
      site_supervisor_id,
      subject,
      message,
      status = "Pending",
    } = req.body;

    if (!supplier_id) {
      return errorResponse(res, 400, "supplier_id is required");
    }

    const dateError = validateTodoDateSequence({ booking_date, start_date, finish_date });
    if (dateError) {
      return errorResponse(res, 400, dateError);
    }

    const supplier = await db.Supplier.findOne({
      where: { supplier_id, builder_id: builderId, company_id: companyId, status: true },
      attributes: ["supplier_id"],
    });

    if (!supplier) {
      return errorResponse(res, 400, "Invalid supplier_id");
    }

    // The listing derives Job Address from this job, so a job_id belonging to
    // another builder would leak that address into this tenant's list.
    if (job_id) {
      const job = await db.Job.findOne({
        where: { job_id, builder_id: builderId },
        attributes: ["job_id"],
      });
      if (!job) {
        return errorResponse(res, 400, "Invalid job_id");
      }
    }

    const todo = await db.Todo.create({
      job_id: job_id || null,
      task_name,
      supplier_id,
      booking_date: booking_date || null,
      start_date: start_date || null,
      finish_date: finish_date || null,
      site_supervisor_id: null,
      subject: subject || null,
      message: message || null,
      status,
      builder_id: builderId,
      company_id: companyId,
      created_by: createdBy,
      updated_by: createdBy,
    });

    return successResponse(res, keysToCamelCase(todo.toJSON()), "Todo created successfully");
  } catch (err) {
    console.error("Error creating todo:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function getAllTodos(req, res) {
  try {
    const builderId = req.user?.builder_id;

    if (!builderId) {
      return errorResponse(res, 400, "Builder ID missing from token");
    }

    const {
      page = 1,
      limit = 25,
      task_name,
      job_address,
      site_supervisor_id,
      supplier_id,
      booking_date_from,
      booking_date_to,
      start_date_from,
      start_date_to,
      status,
      date_filter,
    } = req.query;

    const pageValue = parseInt(page, 10);
    const limitValue = parseInt(limit, 10);
    const offset = (pageValue - 1) * limitValue;

    // Everything except the date bucket. The counters are built from these too, so
    // the tab counts describe the list the user is actually looking at: filter by
    // supplier and "Overdue 3" means 3 overdue to-dos for that supplier.
    const conditions = ["t.builder_id = :builderId"];
    const replacements = { builderId };

    if (task_name) {
      conditions.push("LOWER(t.task_name) LIKE LOWER(:taskName)");
      replacements.taskName = `%${task_name}%`;
    }
    if (job_address) {
      conditions.push(`LOWER(${JOB_ADDRESS_SQL}) LIKE LOWER(:jobAddress)`);
      replacements.jobAddress = `%${job_address}%`;
    }
    if (site_supervisor_id) {
      conditions.push("t.site_supervisor_id = :siteSupervisorId");
      replacements.siteSupervisorId = site_supervisor_id;
    }
    if (supplier_id) {
      const supplierIds = (Array.isArray(supplier_id) ? supplier_id : [supplier_id])
        .flatMap((value) => String(value).split(","))
        .map((id) => id.trim())
        .filter(Boolean);
      if (supplierIds.length > 0) {
        conditions.push("t.supplier_id IN (:supplierIds)");
        replacements.supplierIds = supplierIds;
      }
    }
    const bookingDateFrom = toDateOnly(booking_date_from);
    if (bookingDateFrom) {
      conditions.push("t.booking_date >= CAST(:bookingDateFrom AS date)");
      replacements.bookingDateFrom = bookingDateFrom;
    }
    const bookingDateTo = toDateOnly(booking_date_to);
    if (bookingDateTo) {
      conditions.push("t.booking_date <= CAST(:bookingDateTo AS date)");
      replacements.bookingDateTo = bookingDateTo;
    }
    const startDateFrom = toDateOnly(start_date_from);
    if (startDateFrom) {
      conditions.push("t.start_date >= CAST(:startDateFrom AS date)");
      replacements.startDateFrom = startDateFrom;
    }
    const startDateTo = toDateOnly(start_date_to);
    if (startDateTo) {
      conditions.push("t.start_date <= CAST(:startDateTo AS date)");
      replacements.startDateTo = startDateTo;
    }
    if (status) {
      conditions.push("t.status = :status");
      replacements.status = status;
    }

    // Seeded to-dos are cloned per person with the jobs they hang off, so the
    // list and its counters show the caller's own demo rows, not a set per
    // colleague. Raw SQL, so the model hook that does this elsewhere never runs.
    //
    // Applied before the counter clause is taken, so the tabs are narrowed the
    // same way the list is — otherwise they count a colleague's demo rows that
    // the list below will never show.
    const sampleScope = sampleDataSqlScope("t");
    if (sampleScope.sql) {
      conditions.push(sampleScope.sql);
      Object.assign(replacements, sampleScope.replacements);
    }

    // The counters answer "how many are in each bucket, under the current filters",
    // so they are built before the bucket itself is applied.
    const counterWhereClause = `WHERE ${conditions.join(" AND ")}`;

    const bucketCondition = Object.prototype.hasOwnProperty.call(DATE_BUCKET_SQL, date_filter)
      ? DATE_BUCKET_SQL[date_filter]
      : null;
    if (bucketCondition) {
      conditions.push(bucketCondition);
      // A cancelled or completed to-do is not due today and is never overdue.
      conditions.push(NOT_CLOSED_SQL);
    }

    const whereClause = `WHERE ${conditions.join(" AND ")}`;
    const { sequelize } = db;

    const counterRows = await sequelize.query(
      `SELECT
        COUNT(*) AS all_count,
        COUNT(*) FILTER (WHERE ${DATE_BUCKET_SQL.today} AND ${NOT_CLOSED_SQL}) AS today_count,
        COUNT(*) FILTER (WHERE ${DATE_BUCKET_SQL.tomorrow} AND ${NOT_CLOSED_SQL}) AS tomorrow_count,
        COUNT(*) FILTER (WHERE ${DATE_BUCKET_SQL.this_week} AND ${NOT_CLOSED_SQL}) AS this_week_count,
        COUNT(*) FILTER (WHERE ${DATE_BUCKET_SQL.next_week} AND ${NOT_CLOSED_SQL}) AS next_week_count,
        COUNT(*) FILTER (WHERE ${DATE_BUCKET_SQL.overdue} AND ${NOT_CLOSED_SQL}) AS overdue_count,
        COUNT(*) FILTER (WHERE t.status = 'Completed') AS completed_count
       FROM todo t
       ${ADDRESS_JOINS}
       ${counterWhereClause}`,
      { type: QueryTypes.SELECT, replacements },
    );

    const counters = {
      allCount: Number(counterRows[0]?.all_count) || 0,
      todayCount: Number(counterRows[0]?.today_count) || 0,
      tomorrowCount: Number(counterRows[0]?.tomorrow_count) || 0,
      thisWeekCount: Number(counterRows[0]?.this_week_count) || 0,
      nextWeekCount: Number(counterRows[0]?.next_week_count) || 0,
      overdueCount: Number(counterRows[0]?.overdue_count) || 0,
      completedCount: Number(counterRows[0]?.completed_count) || 0,
    };

    const countRows = await sequelize.query(
      `SELECT COUNT(*) AS total
       FROM todo t
       ${ADDRESS_JOINS}
       ${whereClause}`,
      { type: QueryTypes.SELECT, replacements },
    );
    const totalRecords = parseInt(countRows[0]?.total, 10) || 0;
    const totalPages = Math.ceil(totalRecords / limitValue);

    const dataRows = await sequelize.query(
      `SELECT
        t.todo_id,
        -- Raw SQL, so the model hook that normally stamps this never runs. The
        -- list keeps seeded rows visible, so without it the UI cannot tell a
        -- demo to-do from a real one. keysToCamelCase turns it into
        -- \`isSampleData\`, which is what the badge reads.
        t.is_sample_data,
        t.task_name,
        t.booking_date,
        t.start_date,
        t.finish_date,
        t.subject,
        t.message,
        t.status,
        t.supplier_id,
        t.site_supervisor_id,
        t.job_id,
        t.created_at,
        t.updated_at,
        ${JOB_ADDRESS_SQL} AS job_address,
        u.name AS site_supervisor,
        s.company_name AS supplier_name
       FROM todo t
       ${ADDRESS_JOINS}
       LEFT JOIN users u ON t.site_supervisor_id = u.users_id
       LEFT JOIN supplier s ON t.supplier_id = s.supplier_id
       ${whereClause}
       ORDER BY t.booking_date ASC NULLS LAST, t.created_at DESC, t.todo_id
       LIMIT :limitValue OFFSET :offset`,
      { type: QueryTypes.SELECT, replacements: { ...replacements, limitValue, offset } },
    );

    const todos = keysToCamelCase(dataRows);

    return successResponse(
      res,
      { todos, pagination: { currentPage: pageValue, totalPages, totalRecords, limit: limitValue }, counters },
      "Todos fetched successfully",
    );
  } catch (err) {
    console.error("Error fetching todos:", err);
    return handleControllerError(res, err, "Internal server error");
  }
}

export async function getTodoById(req, res) {
  try {
    const { todo_id } = req.params;
    const builderId = req.user?.builder_id;
    const { sequelize } = db;
    // Same rule as the list — a colleague's demo to-do is not this caller's to open.
    const detailScope = sampleDataSqlScope("t");

    const rows = await sequelize.query(
      `SELECT
        t.*,
        ${JOB_ADDRESS_SQL} AS job_address,
        u.name AS site_supervisor,
        s.company_name AS supplier_name
       FROM todo t
       ${ADDRESS_JOINS}
       LEFT JOIN users u ON t.site_supervisor_id = u.users_id
       LEFT JOIN supplier s ON t.supplier_id = s.supplier_id
       WHERE t.todo_id = :todoId AND t.builder_id = :builderId${detailScope.sql ? ` AND ${detailScope.sql}` : ""}`,
      { type: QueryTypes.SELECT, replacements: { todoId: todo_id, builderId, ...detailScope.replacements } },
    );

    if (rows.length === 0) {
      return errorResponse(res, 404, "Todo not found");
    }

    return successResponse(res, keysToCamelCase(rows[0]), "Todo fetched successfully");
  } catch (err) {
    console.error("Error fetching todo:", err);
    return handleControllerError(res, err, "Internal server error");
  }
}

export async function updateTodo(req, res) {
  try {
    const { todo_id } = req.params;
    const builderId = req.user?.builder_id;
    const updatedBy = req.user?.user_id;

    const todo = await db.Todo.findOne({ where: { todo_id, builder_id: builderId } });
    if (!todo) {
      return errorResponse(res, 404, "Todo not found");
    }

    const {
      job_id,
      task_name,
      supplier_id,
      booking_date,
      start_date,
      finish_date,
      site_supervisor_id,
      subject,
      message,
      status,
    } = req.body;

    // A PUT may carry only one of the three dates, so judge the ordering on the
    // row as it will look after the merge, not on the payload alone.
    const dateError = validateTodoDateSequence({
      booking_date: booking_date !== undefined ? booking_date : todo.booking_date,
      start_date: start_date !== undefined ? start_date : todo.start_date,
      finish_date: finish_date !== undefined ? finish_date : todo.finish_date,
    });
    if (dateError) {
      return errorResponse(res, 400, dateError);
    }

    const updateData = { updated_by: updatedBy };
    if (job_id !== undefined) {
      if (job_id) {
        const job = await db.Job.findOne({
          where: { job_id, builder_id: builderId },
          attributes: ["job_id"],
        });
        if (!job) {
          return errorResponse(res, 400, "Invalid job_id");
        }
      }
      updateData.job_id = job_id || null;
    }
    if (task_name !== undefined) {
      updateData.task_name = task_name;
    }
    if (supplier_id !== undefined) {
      if (!supplier_id) {
        return errorResponse(res, 400, "supplier_id cannot be empty");
      }
      const supplier = await db.Supplier.findOne({
        where: { supplier_id, builder_id: builderId, company_id: req.user?.company_id, status: true },
        attributes: ["supplier_id"],
      });
      if (!supplier) {
        return errorResponse(res, 400, "Invalid supplier_id");
      }
      updateData.supplier_id = supplier_id;
      // To-do assignment is supplier-only.
      updateData.site_supervisor_id = null;
    }
    if (booking_date !== undefined) {
      updateData.booking_date = booking_date || null;
    }
    if (start_date !== undefined) {
      updateData.start_date = start_date || null;
    }
    if (finish_date !== undefined) {
      updateData.finish_date = finish_date || null;
    }
    if (site_supervisor_id !== undefined && supplier_id === undefined) {
      updateData.site_supervisor_id = null;
    }
    if (subject !== undefined) {
      updateData.subject = subject || null;
    }
    if (message !== undefined) {
      updateData.message = message || null;
    }
    if (status !== undefined) {
      updateData.status = status;
    }

    await todo.update(updateData);

    return successResponse(res, keysToCamelCase(todo.toJSON()), "Todo updated successfully");
  } catch (err) {
    console.error("Error updating todo:", err);
    return handleControllerError(res, err, err.message || "Internal Server Error");
  }
}

export async function deleteTodo(req, res) {
  try {
    const { todo_id } = req.params;
    const builderId = req.user?.builder_id;

    const deleted = await db.Todo.destroy({ where: { todo_id, builder_id: builderId } });
    if (!deleted) {
      return errorResponse(res, 404, "Todo not found");
    }

    return successResponse(res, {}, "Todo deleted successfully");
  } catch (err) {
    console.error("Error deleting todo:", err);
    return handleControllerError(res, err, "Internal server error");
  }
}
