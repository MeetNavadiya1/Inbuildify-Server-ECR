import db from "../../config/database/models/postgre-models/index.js";
import { Op } from "sequelize";
import { keysToCamelCase } from "../../utils/common.js";

/**
 * Service to handle Invoice and Deposit related business logic.
 */
export const createInvoiceService = async (invoiceData, builderId, companyId) => {
  const { Invoice, Leads, Quotation, Opportunity } = db;

  try {
    // 1. Verify organization ownership and fetch lead reference
    const lead = await Leads.findOne({
      where: {
        leads_id: invoiceData.leads_id,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
    });

    if (!lead) {
      throw { status: 404, message: "Lead not found or does not belong to your organization" };
    }

    return await db.sequelize.transaction(async (transaction) => {
      // 2. Lock lead for update and verify existence again (parities FOR UPDATE)
      const lockedLead = await Leads.findByPk(invoiceData.leads_id, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

      if (!lockedLead) {
        throw { status: 404, message: "Lead not found" };
      }

      // 3. Enforce that Invoices can only be created if a Quotation exists
      const quotation = await Quotation.findOne({
        where: { leads_id: invoiceData.leads_id },
        transaction,
      });

      if (!quotation) {
        throw { status: 400, message: "Cannot create an invoice for a lead that does not have a quotation" };
      }

      // 4. Calculate invoice reference number
      const invoiceCount = await Invoice.count({
        where: { leads_id: invoiceData.leads_id },
        transaction,
      });

      const nextInvoiceNumber = invoiceCount + 1;
      const leadRef = lockedLead.reference_number || "LD-UNKNOWN";
      const invoiceReferenceNumber = `${leadRef}-I${nextInvoiceNumber}`;

      // 5. Determine status
      const status = invoiceData.generate_invoice ? "sent" : "paid";

      // 6. Create the Invoice
      const newInvoice = await Invoice.create({
        leads_id: invoiceData.leads_id,
        reference_number: invoiceReferenceNumber,
        generate_invoice: invoiceData.generate_invoice,
        invoice_date: invoiceData.invoice_date || null,
        due_date: invoiceData.due_date || null,
        invoice_amount: invoiceData.invoice_amount || null,
        deposite_date: invoiceData.deposite_date || null,
        deposite_amount: invoiceData.deposite_amount || null,
        payment_method: invoiceData.payment_method || null,
        transaction_no: invoiceData.transaction_no || null,
        description: invoiceData.description || null,
        status: status,
      }, { transaction });

      // 7. Update Opportunity status to Negotiation
      await Opportunity.update(
        { status: "Negotiation", updatedAt: new Date() },
        {
          where: {
            leads_id: invoiceData.leads_id,
            status: { [Op.ne]: "closed" },
          },
          transaction,
        }
      );

      return {
        success: true,
        data: keysToCamelCase(newInvoice.get({ plain: true })),
        message: invoiceData.generate_invoice
          ? "Invoice generated successfully"
          : "Deposit captured successfully",
      };
    });
  } catch (error) {
    console.error("Invoice creation error in service:", error);
    throw error;
  }
};

/**
 * Fetches all invoices for a specific lead.
 */
export const getInvoicesByLeadService = async (leadId, builderId, companyId) => {
  const { Invoice, Leads } = db;
  try {
    const lead = await Leads.findOne({
      where: {
        leads_id: leadId,
        [Op.or]: [{ builder_id: builderId }, { company_id: companyId }],
      },
    });

    if (!lead) {
      throw { status: 404, message: "Lead not found or does not belong to your organization" };
    }

    const invoices = await Invoice.findAll({
      where: { leads_id: leadId },
      include: [
        {
          model: Leads,
          as: "lead",
          attributes: ["name"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const formattedInvoices = invoices.map((inv) => {
      const plain = inv.get({ plain: true });
      return {
        ...keysToCamelCase(plain),
        leadName: plain.lead?.name || null,
      };
    });

    return {
      success: true,
      data: formattedInvoices,
      message: "Records fetched successfully",
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Fetches an invoice by its ID.
 */
export const getInvoiceByIdService = async (invoiceId, builderId, companyId) => {
  const { Invoice, Leads } = db;
  try {
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [{ model: Leads, as: "lead" }],
    });

    if (!invoice) {
      throw { status: 404, message: "Invoice/Deposit record not found" };
    }

    const hasAccess = invoice.lead && (invoice.lead.builder_id === builderId || invoice.lead.company_id === companyId);
    if (!hasAccess) {
      throw { status: 403, message: "Access denied: Record does not belong to your organization" };
    }

    const plain = invoice.get({ plain: true });
    return {
      success: true,
      data: {
        ...keysToCamelCase(plain),
        leadName: plain.lead?.name || null,
      },
      message: "Record fetched successfully",
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Updates an invoice record.
 */
export const updateInvoiceService = async (invoiceId, updateData, builderId, companyId) => {
  const { Invoice, Leads } = db;
  try {
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [{ model: Leads, as: "lead" }],
    });

    if (!invoice) {
      throw { status: 404, message: "Invoice/Deposit record not found" };
    }

    const hasAccess = invoice.lead && (invoice.lead.builder_id === builderId || invoice.lead.company_id === companyId);
    if (!hasAccess) {
      throw { status: 403, message: "Access denied: Record does not belong to your organization" };
    }

    const { leads_id, generate_invoice, reference_number, ...allowedUpdates } = updateData;

    await invoice.update({
      ...allowedUpdates,
      updated_at: new Date(),
    });

    return {
      success: true,
      data: keysToCamelCase(invoice.get({ plain: true })),
      message: "Record updated successfully",
    };
  } catch (error) {
    throw error;
  }
};

/**
 * Deletes an invoice record.
 */
export const deleteInvoiceService = async (invoiceId, builderId, companyId) => {
  const { Invoice, Leads } = db;
  try {
    const invoice = await Invoice.findByPk(invoiceId, {
      include: [{ model: Leads, as: "lead" }],
    });

    if (!invoice) {
      throw { status: 404, message: "Record not found" };
    }

    const hasAccess = invoice.lead && (invoice.lead.builder_id === builderId || invoice.lead.company_id === companyId);
    if (!hasAccess) {
      throw { status: 403, message: "Access denied: Record does not belong to your organization" };
    }

    await invoice.destroy();

    return {
      success: true,
      data: null,
      message: "Record deleted successfully",
    };
  } catch (error) {
    throw error;
  }
};

export default {
  createInvoiceService,
  getInvoicesByLeadService,
  getInvoiceByIdService,
  updateInvoiceService,
  deleteInvoiceService,
};
