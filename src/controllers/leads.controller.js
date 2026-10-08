const getPool = require("../config/database");
const { generateCode } = require("../helper/codeGenerator");
const { successResponse, errorResponse } = require("../helper/response");
const { keysToCamelCase } = require("../utils/common");

const getUsersDetails = async (client, userIds) => {
  if (!userIds || userIds.length === 0) return {};
  
  const validUserIds = userIds.filter(Boolean);
  if (validUserIds.length === 0) return {};

  const usersQuery = `
    SELECT users_id, name 
    FROM users 
    WHERE users_id = ANY($1::uuid[])
  `;
  const usersResult = await client.query(usersQuery, [validUserIds]);
  
  return usersResult.rows.reduce((acc, row) => {
    acc[row.users_id] = row.name;
    return acc;
  }, {});
};

const formatUserObject = (userId, usersMap) => {
  if (!userId) return null;
  return {
    id: userId,
    name: usersMap[userId] || null
  };
};

exports.createLead = async (req, res) => {
  const { lead_source, notes, contact } = req.body;

  const userId = req.user.user_id;
  const builderId = req.user.builder_id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const leadSourceQuery = `SELECT lead_source_id, name FROM lead_source WHERE name = $1 AND (builder_id = $2 OR builder_id IS NULL) AND is_deleted = false;`;
    const leadSourceResult = await client.query(leadSourceQuery, [
      lead_source,
      builderId,
    ]);
    if (leadSourceResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Lead source not found.");
    }
    const lead_source_id = leadSourceResult.rows[0].lead_source_id;
    const slugId = generateCode(req.user.name, "lead");
    const leadQuery = `
      INSERT INTO leads (builder_id, slug_id, lead_source_id, notes, assignee_id, created_by_id, updated_by_id)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING lead_id, builder_id, status, lead_source_id, notes, assignee_id, created_by_id, updated_by_id, created_at, updated_at;
    `;

    const leadResult = await client.query(leadQuery, [
      builderId,
      slugId,
      lead_source_id,
      notes || null,
      userId,
      userId,
      userId,
    ]);

    const lead = leadResult.rows[0];

    const usersMap = await getUsersDetails(client, [userId]);

    let contactDetails = null;
    if (contact) {
      let country;
      let state;

      if (contact.country) {
        const countryQuery = `SELECT country_id FROM country WHERE name = $1;`;
        const countryResult = await client.query(countryQuery, [
          contact.country,
        ]);
        if (countryResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return errorResponse(res, 404, "Country not found.");
        }
        country = countryResult.rows[0].country_id;
      }

      if (contact.state) {
        const stateQuery = `SELECT state_id FROM state WHERE name = $1;`;
        const stateResult = await client.query(stateQuery, [contact.state]);
        if (stateResult.rows.length === 0) {
          await client.query("ROLLBACK");
          return errorResponse(res, 404, "State not found.");
        }
        state = stateResult.rows[0].state_id;
      }

      const contactQuery = `
        INSERT INTO leads_contact
          (name, email, phone, secondary_phone, address1, address2, city, zip, country_id, state_id, lead_id)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING leads_contact_id, name, email, phone, secondary_phone, address1, address2, city, zip, country_id, state_id, created_at, updated_at;
      `;

      const contactResult = await client.query(contactQuery, [
        contact.name,
        contact.email ? contact.email.toLowerCase() : null,
        contact.phone || null,
        contact.secondary_phone || null,
        contact.address1 || null,
        contact.address2 || null,
        contact.city || null,
        contact.zip || null,
        country || null,
        state || null,
        lead.lead_id,
      ]);

      contactDetails = contactResult.rows[0];
    }

    await client.query(
      `UPDATE leads SET lead_contact_id = $1 WHERE lead_id = $2 AND builder_id = $3;`,
      [contactDetails.leads_contact_id, lead.lead_id, builderId]
    );
    await client.query("COMMIT");

    return successResponse(
      res,
      keysToCamelCase({
        ...lead,
        lead_source: leadSourceResult.rows[0].name,
        created_by: formatUserObject(lead.created_by_id, usersMap),
        updated_by: formatUserObject(lead.updated_by_id, usersMap),
        assignee: formatUserObject(lead.assignee_id, usersMap),
        ...contactDetails,
      }),
      "Lead created successfully."
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Create lead error:", error);
    return errorResponse(res, 500, "Failed to create lead.");
  } finally {
    client.release();
  }
};

exports.getLeads = async (req, res) => {
  const { limit = 25, offset = 0 } = req.query;
  const builderId = req.user.builder_id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    const query = `
      SELECT 
        l.slug_id,
        l.lead_id,
        l.builder_id,
        l.status,
        ls.name AS lead_source,
        l.notes,
        l.assignee_id,
        assignee.name AS assignee_name,
        l.created_by_id,
        created_by.name AS created_by_name,
        l.updated_by_id,
        updated_by.name AS updated_by_name,
        l.created_at,
        l.updated_at,
        c.leads_contact_id,
        c.name,
        c.email,
        c.phone,
        c.secondary_phone,
        c.city,
        c.zip,
        c.country_id,
        c.state_id
      FROM leads l
      LEFT JOIN leads_contact c
        ON l.lead_contact_id = c.leads_contact_id
      LEFT JOIN lead_source ls
        ON l.lead_source_id = ls.lead_source_id
      LEFT JOIN users assignee
        ON l.assignee_id = assignee.users_id
      LEFT JOIN users created_by
        ON l.created_by_id = created_by.users_id
      LEFT JOIN users updated_by
        ON l.updated_by_id = updated_by.users_id
      WHERE l.builder_id = $1 AND l.is_deleted = false
      ORDER BY l.created_at DESC
      LIMIT $2 OFFSET $3;
    `;

    const result = await client.query(query, [builderId, limit, offset]);

    // Transform the results to include user objects
    const transformedRows = result.rows.map(row => {
      const { 
        assignee_id, assignee_name,
        created_by_id, created_by_name,
        updated_by_id, updated_by_name,
        ...rest 
      } = row;

      // Create a temporary map for this row
      const usersMap = {
        [assignee_id]: assignee_name,
        [created_by_id]: created_by_name,
        [updated_by_id]: updated_by_name
      };

      return {
        ...rest,
        assignee: formatUserObject(assignee_id, usersMap),
        created_by: formatUserObject(created_by_id, usersMap),
        updated_by: formatUserObject(updated_by_id, usersMap),
      };
    });

    return successResponse(
      res,
      keysToCamelCase(transformedRows),
      "Leads fetched successfully."
    );
  } catch (error) {
    console.error("Get leads error:", error);
    return errorResponse(res, 500, "Failed to fetch leads.");
  } finally {
    client.release();
  }
};

exports.getLeadById = async (req, res) => {
  const { lead_id } = req.params;
  const builderId = req.user.builder_id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    const leadQuery = `
      SELECT 
        l.slug_id,
        l.lead_id,
        l.lead_contact_id,
        l.builder_id,
        l.status,
        ls.name AS lead_source,
        l.notes,
        l.decision,
        l.assignee_id,
        assignee.name AS assignee_name,
        l.created_by_id,
        created_by.name AS created_by_name,
        l.updated_by_id,
        updated_by.name AS updated_by_name,
        l.created_at,
        l.updated_at
      FROM leads l
      LEFT JOIN lead_source ls
        ON l.lead_source_id = ls.lead_source_id
      LEFT JOIN users assignee
        ON l.assignee_id = assignee.users_id
      LEFT JOIN users created_by
        ON l.created_by_id = created_by.users_id
      LEFT JOIN users updated_by
        ON l.updated_by_id = updated_by.users_id
      WHERE l.lead_id = $1 AND l.builder_id = $2 AND l.is_deleted = false;
    `;
    const leadResult = await client.query(leadQuery, [lead_id, builderId]);

    if (leadResult.rowCount === 0) {
      return errorResponse(res, 404, "Lead not found.");
    }

    const leadRow = leadResult.rows[0];
    
    // Create users map from the query result
    const {
      assignee_id, assignee_name,
      created_by_id, created_by_name,
      updated_by_id, updated_by_name,
      ...leadData
    } = leadRow;

    const usersMap = {
      [assignee_id]: assignee_name,
      [created_by_id]: created_by_name,
      [updated_by_id]: updated_by_name
    };

    const lead = {
      ...leadData,
      assignee: formatUserObject(assignee_id, usersMap),
      created_by: formatUserObject(created_by_id, usersMap),
      updated_by: formatUserObject(updated_by_id, usersMap),
    };

    const contactsQuery = `
      SELECT 
        c.leads_contact_id,
        c.name,
        c.email,
        c.phone,
        c.secondary_phone,
        c.address1,
        c.address2,
        c.city,
        c.zip,
        c.country_id,
        co.name AS country_name,
        c.state_id,
        s.name AS state_name,
        c.created_at,
        c.updated_at
      FROM leads_contact c
      LEFT JOIN country co ON c.country_id = co.country_id
      LEFT JOIN state s ON c.state_id = s.state_id
      WHERE c.lead_id = $1
      ORDER BY c.created_at ASC;
    `;
    const contactsResult = await client.query(contactsQuery, [lead_id]);

    const propertyQuery = `
      SELECT property_id, builder_id, lead_id, country, address1, address2,
             city_suburb, state_region, zip_postal_code, estate_name, title_status,
             title_date, compaction_report, land_type, width_m, depth_m,
             total_size_m2, site_fall_mm, land_fill_mm, bush_fire, corner_block,
             created_at, updated_at
      FROM property
      WHERE lead_id = $1 AND builder_id = $2;
    `;
    const propertyResult = await client.query(propertyQuery, [
      lead_id,
      builderId,
    ]);

    const responsePayload = {
      lead,
      contacts: contactsResult.rows || [],
      property: propertyResult.rows[0] || {},
    };

    return successResponse(
      res,
      keysToCamelCase(responsePayload),
      "Lead & property fetched successfully."
    );
  } catch (error) {
    console.error("Get lead by ID error:", error);
    return errorResponse(res, 500, "Failed to fetch lead.");
  } finally {
    client.release();
  }
};

exports.updateLead = async (req, res) => {
  const { lead_id } = req.params;
  const builderId = req.user.builder_id;
  const userId = req.user.user_id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    const { lead_source, notes, assignee_id } = req.body;

    await client.query("BEGIN");

    const leadFields = [];
    const leadValues = [lead_id, builderId];
    let index = 3;

    if (lead_source !== undefined) {
      const leadSourceQuery = `SELECT lead_source_id, name FROM lead_source WHERE name = $1 AND (builder_id = $2 OR builder_id IS NULL) AND is_deleted = false;`;
      const leadSourceResult = await client.query(leadSourceQuery, [
        lead_source,
        builderId,
      ]);
      if (leadSourceResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return errorResponse(res, 404, "Lead source not found.");
      }
      leadFields.push(`lead_source_id = $${index++}`);
      leadValues.push(leadSourceResult.rows[0].lead_source_id);
    }
    if (notes !== undefined) {
      leadFields.push(`notes = $${index++}`);
      leadValues.push(notes);
    }
    if (assignee_id !== undefined) {
      const checkAssigneeQuery = `SELECT * FROM users WHERE users_id = $1 AND builder_id = $2 AND is_verified = true AND is_deleted = false;`;
      const checkAssigneeResult = await client.query(checkAssigneeQuery, [
        assignee_id,
        builderId,
      ]);
      if (checkAssigneeResult.rows.length === 0) {
        await client.query("ROLLBACK");
        return errorResponse(res, 404, "Assignee not found or not verified.");
      }
      leadFields.push(`assignee_id = $${index++}`);
      leadValues.push(assignee_id);
    }

    leadFields.push(`updated_by_id = $${index++}`);
    leadValues.push(userId);

    leadFields.push(`updated_at = NOW()`);

    if (leadFields.length === 2) { // Only updated_by_id and updated_at
      await client.query("ROLLBACK");
      return errorResponse(res, 400, "No valid fields provided for update.");
    }

    const leadQuery = `
      UPDATE leads
      SET ${leadFields.join(", ")}
      WHERE lead_id = $1 AND (builder_id = $2 OR builder_id IS NULL) AND is_deleted = false
      RETURNING slug_id, lead_id, builder_id, lead_contact_id, status, lead_source_id,
                notes, message, decision, assignee_id, created_by_id,
                updated_by_id, created_at, updated_at;
    `;

    const leadResult = await client.query(leadQuery, leadValues);

    if (leadResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Lead not found.");
    }

    const latestLeadSource = await client.query(
      `SELECT name FROM lead_source WHERE lead_source_id = $1 AND (builder_id = $2 OR builder_id IS NULL);`, //  AND is_deleted = false;
      [leadResult.rows[0].lead_source_id, builderId]
    );

    const userIds = [
      leadResult.rows[0].assignee_id,
      leadResult.rows[0].created_by_id,
      leadResult.rows[0].updated_by_id,
    ];
    const usersMap = await getUsersDetails(client, userIds);

    await client.query("COMMIT");

    const responseData = {
      ...leadResult.rows[0],
      lead_source: latestLeadSource.rows[0].name,
      assignee: formatUserObject(leadResult.rows[0].assignee_id, usersMap),
      created_by: formatUserObject(leadResult.rows[0].created_by_id, usersMap),
      updated_by: formatUserObject(leadResult.rows[0].updated_by_id, usersMap),
    };

    return successResponse(
      res,
      keysToCamelCase(responseData),
      "Lead updated successfully."
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update lead error:", error);
    return errorResponse(res, 500, "Failed to update lead.");
  } finally {
    client.release();
  }
};

exports.updateAssignee = async (req, res) => {
  const { lead_id } = req.params;
  const { assignee_id, notes } = req.body;
  const builderId = req.user.builder_id;
  const userId = req.user.user_id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    if (!assignee_id) {
      await client.query("ROLLBACK");
      return errorResponse(res, 400, "assignee_id is required.");
    }
    const assigneeQuery = `
      SELECT users_id, name 
      FROM users 
      WHERE users_id = $1 
        AND builder_id = $2 
        AND is_verified = true 
        AND is_deleted = false
    `;
    const assigneeResult = await client.query(assigneeQuery, [
      assignee_id,
      builderId,
    ]);
    if (assigneeResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Assignee not found or not verified.");
    }
    const assignee = assigneeResult.rows[0];

    const leadQuery = `
      UPDATE leads 
         SET assignee_id = $1,
             notes       = COALESCE($2, notes),
             updated_by_id = $3,
             updated_at  = NOW()
       WHERE lead_id = $4 
         AND builder_id = $5 
         AND is_deleted = false 
         AND (status != 'JOB' AND status != 'CANCELLED')
     RETURNING *
    `;
    const leadResult = await client.query(leadQuery, [
      assignee_id,
      notes || null,
      userId,
      lead_id,
      builderId,
    ]);
    if (leadResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Lead not found or already in Working.");
    }

    const lead = leadResult.rows[0];
    const userIds = [lead.created_by_id, lead.updated_by_id];
    const usersMap = await getUsersDetails(client, userIds);

    await client.query("COMMIT");

    const assigneeData = formatUserObject(assignee.users_id, { [assignee.users_id]: assignee.name });
    const createdByData = formatUserObject(lead.created_by_id, usersMap);
    const updatedByData = formatUserObject(lead.updated_by_id, usersMap);

    delete lead.created_by_id;
    delete lead.updated_by_id;
    delete lead.assignee_id;

    return successResponse(
      res,
      keysToCamelCase({
        ...lead,
        assignee: assigneeData,
        createdBy: createdByData,
        updatedBy: updatedByData,
      }),
      "Assignee updated successfully."
    );
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Update assignee error:", error);
    return errorResponse(res, 500, "Failed to update assignee.");
  } finally {
    client.release();
  }
};

exports.convertLead = async (req, res) => {
  const { lead_id } = req.params;
  const builderId = req.user.builder_id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const checkLeadExists = await client.query(`SELECT * FROM leads WHERE lead_id = $1 AND builder_id = $2 AND is_deleted = false AND (status != 'JOB' AND status != 'CANCELLED');`, [lead_id, builderId]);
    if (checkLeadExists.rows.length === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Lead not found or already in Working.");
    }
    if (checkLeadExists.rows[0].status === "NEW") {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Lead status is New so can't be converted.");
    };

    const softDeleteQuery = `
      UPDATE quotation
         SET is_deleted = true
       WHERE lead_id = $1
         AND builder_id = $2
    `;
    await client.query(softDeleteQuery, [lead_id, builderId]);

    // const deleteActionsQuery = `SELECT action_id FROM actions WHERE lead_id = $1 AND builder_id = $2;`;
    // const deleteActionsResult = await client.query(deleteActionsQuery, [lead_id, builderId]);
    // const actionIds = deleteActionsResult.rows.map(row => row.action_id);

    // if (actionIds.length > 0) {
    //   await client.query(
    //     `UPDATE notes 
    //         SET is_deleted = true 
    //       WHERE action_id = ANY($1)`,
    //     [actionIds]
    //   );

    //   await client.query(
    //     `UPDATE appointment 
    //         SET is_deleted = true 
    //       WHERE action_id = ANY($1)`,
    //     [actionIds]
    //   );

    //   await client.query(
    //     `UPDATE task 
    //         SET is_deleted = true 
    //       WHERE action_id = ANY($1)`,
    //     [actionIds]
    //   );

    //   await client.query(
    //     `UPDATE sms 
    //         SET is_deleted = true 
    //       WHERE action_id = ANY($1)`,
    //     [actionIds]
    //   );
    // }

    const updateStatusQuery = `
      UPDATE leads
         SET status = $1, updated_at = NOW()
       WHERE lead_id = $2
         AND builder_id = $3
    `;
    await client.query(updateStatusQuery, ["NEW", lead_id, builderId]);
    
    await client.query("COMMIT");
    return successResponse(res, {}, "Lead converted successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Convert lead error:", error);
    return errorResponse(res, 500, "Failed to convert lead.");
  } finally {
    client.release();
  }
};

exports.deleteLead = async (req, res) => {
  const { lead_id } = req.params;
  const builderId = req.user.builder_id;
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const checkLeadExists = await client.query(`SELECT * FROM leads WHERE lead_id = $1 AND builder_id = $2 AND is_deleted = false;`, [lead_id, builderId]);
    if (checkLeadExists.rowCount === 0) {
      await client.query("ROLLBACK");
      return errorResponse(res, 404, "Lead not found.");
    }
    const softDeleteQuotationQuery = `
      UPDATE quotation
         SET is_deleted = true
       WHERE lead_id = $1
         AND builder_id = $2
    `;
    await client.query(softDeleteQuotationQuery, [lead_id, builderId]);

    const deleteActionsQuery = `SELECT action_id FROM actions WHERE lead_id = $1 AND builder_id = $2;`;
    const deleteActionsResult = await client.query(deleteActionsQuery, [lead_id, builderId]);
    const actionIds = deleteActionsResult.rows.map(row => row.action_id);

    if (actionIds.length > 0) {
      await client.query(
        `UPDATE notes 
            SET is_deleted = true 
          WHERE action_id = ANY($1)`,
        [actionIds]
      );

      await client.query(
        `UPDATE appointment 
            SET is_deleted = true 
          WHERE action_id = ANY($1)`,
        [actionIds]
      );

      await client.query(
        `UPDATE task 
            SET is_deleted = true 
          WHERE action_id = ANY($1)`,
        [actionIds]
      );

      await client.query(
        `UPDATE sms 
            SET is_deleted = true 
          WHERE action_id = ANY($1)`,
        [actionIds]
      );
    }

    const updateStatusQuery = `
      UPDATE leads
         SET is_deleted = true
       WHERE lead_id = $1
         AND builder_id = $2
    `;
    await client.query(updateStatusQuery, [lead_id, builderId]);
    
    await client.query("COMMIT");
    return successResponse(res, {}, "Lead deleted successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("Delete lead error:", error);
    return errorResponse(res, 500, "Failed to delete lead.");
  } finally {
    client.release();
  }
};