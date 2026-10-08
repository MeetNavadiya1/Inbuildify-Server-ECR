import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import { logJobActivity } from "../../utils/jobActivityLogger.js";
import { sendEmailNow } from "../../service/sendMail.service.js";
import { buildFileName, ensureUniqueDriveFileName } from "../../service/fileNaming.service.js";
import {
  buildVariationEmail,
  buildInvoiceEmail,
  defaultVariationMessageHtml,
  defaultCustomerVariationMessageHtml,
  defaultInvoiceMessageHtml,
  variationApprovedSubject,
  variationInvoiceNumber,
  variationInvoiceSubject,
} from "../../templates/jobVariationEmail.template.js";
import { generateVariationDocumentHTML } from "../../utils/jobVariationPdfTemplate.js";
import { generateInvoiceDocumentHTML } from "../../utils/jobInvoicePdfTemplate.js";
import { generatePDF } from "../quotation/pdf.service.js";
import { uploadFile, generatePresignedDownloadUrl } from "../../service/s3.service.js";
import { deleteFromS3 } from "../../utils/s3Upload.js";
import { Op } from "sequelize";

class JobVariationService {
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

  _includeUsers() {
    const { Users, JobVariationItem, DriveFile } = db;
    return [
      { model: Users, as: "createdByUser", attributes: ["name", "initials"] },
      { model: Users, as: "approvedByUser", attributes: ["name", "initials"] },
      { model: JobVariationItem, as: "variationItems" },
      {
        model: DriveFile,
        as: "signedDocumentFile",
        attributes: ["file_id", "original_name", "s3_key"],
        required: false,
      },
      {
        model: DriveFile,
        as: "invoiceDocumentFile",
        attributes: ["file_id", "original_name", "s3_key"],
        required: false,
      },
    ];
  }

  /**
   * Normalise an item's money fields before persisting. On a variation row
   * `cost` is a label (Material / Labor …); the dollar amount belongs in
   * `price`. Guard against payloads that put the amount in `cost` with `price`
   * left at 0: recover it into price/total, default a zero quantity to 1 so the
   * value isn't lost, and clear the mislabelled (numeric) cost. Genuine label
   * costs and real prices are left untouched.
   */
  /**
   * A row the user struck out in the editor. It stays in the editor list for
   * side-by-side comparison, but must never be persisted or reach a PDF/total —
   * the removed status is a UI concept with no column to persist it. Checks
   * every casing the client might send.
   */
  _isRemovedItem(item) {
    return Boolean(item?.is_removed || item?.isRemoved || item?.removed);
  }

  /** Only the live (non-removed) rows. */
  _liveItems(items) {
    return (Array.isArray(items) ? items : []).filter((it) => !this._isRemovedItem(it));
  }

  _normalizeItemAmounts(item) {
    const toNum = (v) => {
      if (v === null || v === undefined || v === "") {
        return null;
      }
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const costNum = toNum(item.cost);
    const priceNum = toNum(item.price);
    let quantity = toNum(item.quantity) ?? 0;
    let price = priceNum ?? 0;
    // Keep a label in `cost`; a numeric value there is misplaced, so drop it.
    const cost = costNum !== null ? null : item.cost || null;
    if ((priceNum === null || priceNum === 0) && costNum !== null) {
      price = costNum;
      if (quantity === 0) {
        quantity = 1;
      }
    }
    const total = toNum(item.total) || price * quantity;
    return { cost, price: price || null, quantity: quantity || null, total: total || null };
  }

  _formatVariationResponse(result) {
    if (result.variationItems) {
      result.items = result.variationItems.map((vi) => ({
        key: vi.jobVariationItemId,
        jobVariationItemId: vi.jobVariationItemId,
        variationId: vi.variationId,
        additional: vi.additional || "",
        siteCost: vi.siteCost || "",
        cost: vi.cost || "",
        drawingChanges: !!vi.drawingChanges,
        isPriceMaster: !!vi.isPriceMaster,
        isRemoved: !!vi.isRemoved || !!vi.is_removed,
        quantity: parseFloat(vi.quantity) || 0,
        price: parseFloat(vi.price) || 0,
        total: parseFloat(vi.total) || 0,
        itemType: vi.itemType || null,
        description: vi.description || null,
        uom: vi.uom || null,
        notes: vi.notes || null,
        note: vi.note || null,
      }));
      delete result.variationItems;
    }
    // Expose a lightweight signed-document descriptor; the download URL is
    // fetched on demand via getSignedDocument (presigned, short-lived).
    if (result.signedDocumentFile) {
      result.signedDocument = {
        fileId: result.signedDocumentFile.fileId,
        name: result.signedDocumentFile.originalName,
      };
    } else {
      result.signedDocument = null;
    }
    delete result.signedDocumentFile;
    // Same for the generated invoice PDF (tracker step 6).
    if (result.invoiceDocumentFile) {
      result.invoiceDocument = {
        fileId: result.invoiceDocumentFile.fileId,
        name: result.invoiceDocumentFile.originalName,
      };
    } else {
      result.invoiceDocument = null;
    }
    delete result.invoiceDocumentFile;
    return result;
  }

  async createJobVariation(jobId, data, user) {
    const { Job, JobVariation, JobVariationItem } = db;
    const tenantScope = this._tenantScope(user);

    const job = await Job.findOne({ where: { job_id: jobId, ...tenantScope } });
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    // Next version number for this job -> reference id "<jobRef>-V<n>".
    const last = await JobVariation.findOne({
      where: { job_id: jobId },
      order: [["version", "DESC"]],
      attributes: ["version"],
    });
    const version = (last?.version || 0) + 1;
    const referenceId = `${job.reference_number}-V${version}`;

    const status = data.status || "draft";
    const isApproved = status === "approved";

    // Save all items from the frontend, including those marked as removed,
    // so their strikethrough status is persistently stored and rendered.
    const allItems = Array.isArray(data.items) ? data.items : [];

    const variation = await JobVariation.create({
      job_id: jobId,
      jobId,
      company_id: user.company_id || job.company_id || null,
      companyId: user.company_id || job.company_id || null,
      builder_id: user.builder_id || job.builder_id || null,
      builderId: user.builder_id || job.builder_id || null,
      reference_id: referenceId,
      referenceId,
      version,
      title: data.title ?? null,
      amount: data.amount ?? 0,
      requested_by: data.requested_by ?? data.requestedBy ?? null,
      requestedBy: data.requested_by ?? data.requestedBy ?? null,
      delayed_by: data.delayed_by ?? data.delayedBy ?? null,
      delayedBy: data.delayed_by ?? data.delayedBy ?? null,
      delayed_days: data.delayed_days ?? data.delayedDays ?? null,
      delayedDays: data.delayed_days ?? data.delayedDays ?? null,
      drawing_changes_required: data.drawing_changes_required ?? data.drawingChangesRequired ?? false,
      drawingChangesRequired: data.drawing_changes_required ?? data.drawingChangesRequired ?? false,
      status,
      // Tracker starts on "Approve" (stage 2) — "Create" is already done.
      stage: data.stage ?? 2,
      invoice_id: data.invoice_id || data.invoiceId || null,
      invoiceId: data.invoice_id || data.invoiceId || null,
      variation_date: data.variation_date || data.variationDate || null,
      variationDate: data.variation_date || data.variationDate || null,
      show_price_master_in_pdf: data.show_price_master_in_pdf ?? data.showPriceMasterInPdf ?? false,
      showPriceMasterInPdf: data.show_price_master_in_pdf ?? data.showPriceMasterInPdf ?? false,
      items: allItems,
      approved_by: isApproved ? user.users_id : null,
      approvedBy: isApproved ? user.users_id : null,
      approved_at: isApproved ? new Date() : null,
      approvedAt: isApproved ? new Date() : null,
      created_by: user.users_id,
      createdBy: user.users_id,
      updated_by: user.users_id,
      updatedBy: user.users_id,
    });

    if (allItems.length > 0) {
      const itemsData = allItems.map((item) => ({
        variation_id: variation.variation_id,
        variationId: variation.variation_id,
        price_list_id: item.price_list_id || item.priceListId || null,
        priceListId: item.price_list_id || item.priceListId || null,
        price_list_item_id: item.price_list_item_id || item.priceListItemId || null,
        priceListItemId: item.price_list_item_id || item.priceListItemId || null,
        additional: item.additional || item.item_name || item.name || null,
        site_cost: item.site_cost || item.siteCost || null,
        siteCost: item.site_cost || item.siteCost || null,
        ...this._normalizeItemAmounts(item),
        drawing_changes: item.drawing_changes || item.drawingChanges || false,
        drawingChanges: item.drawing_changes || item.drawingChanges || false,
        is_price_master: item.is_price_master || item.isPriceMaster || false,
        isPriceMaster: item.is_price_master || item.isPriceMaster || false,
        is_removed: item.is_removed || item.isRemoved || item.removed || false,
        item_type: item.item_type || item.itemType || null,
        itemType: item.item_type || item.itemType || null,
        description: item.description || null,
        uom: item.uom || null,
        note: item.note || item.notes || null,
        notes: item.note || item.notes || null,
        range_id: item.range_id || item.rangeId || [],
        rangeId: item.range_id || item.rangeId || [],
        dwelling_type_id: item.dwelling_type_id || item.dwellingTypeId || [],
        dwellingTypeId: item.dwelling_type_id || item.dwellingTypeId || [],
      }));
      await JobVariationItem.bulkCreate(itemsData);
    }

    const created = await JobVariation.findOne({
      where: { variation_id: variation.variation_id },
      include: this._includeUsers(),
    });

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId,
      module: "Job Variation",
      moduleId: variation.variation_id,
      recordName: job.reference_number,
      action: "CREATE",
      description: `Variation ${referenceId} created`,
    });

    const result = keysToCamelCase(created.get({ plain: true }));
    this._formatVariationResponse(result);

    return {
      success: true,
      data: result,
      message: "Variation created successfully",
    };
  }

  async getJobVariations(jobId, queryParams, user) {
    const { Job, JobVariation } = db;
    const tenantScope = this._tenantScope(user);

    const pageValue = parseInt(queryParams?.page) || 1;
    const limitValue = parseInt(queryParams?.limit) || 10;
    const offset = (pageValue - 1) * limitValue;

    const job = await Job.findOne({ where: { job_id: jobId, ...tenantScope } });
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const { count, rows } = await JobVariation.findAndCountAll({
      where: { job_id: jobId, ...tenantScope },
      include: this._includeUsers(),
      limit: limitValue,
      offset,
      order: [["version", "ASC"]],
    });

    const jobVariations = rows.map((row) => {
      const item = keysToCamelCase(row.get({ plain: true }));
      this._formatVariationResponse(item);
      return item;
    });

    return {
      success: true,
      data: {
        jobVariations,
        pagination: {
          page: pageValue,
          limit: limitValue,
          total: count,
          totalPages: Math.ceil(count / limitValue),
        },
      },
      message: "Job variations fetched successfully",
    };
  }

  async getJobVariationById(variationId, user) {
    const { JobVariation } = db;
    const tenantScope = this._tenantScope(user);

    const variation = await JobVariation.findOne({
      where: { variation_id: variationId, ...tenantScope },
      include: this._includeUsers(),
    });
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    const result = keysToCamelCase(variation.get({ plain: true }));
    this._formatVariationResponse(result);

    return {
      success: true,
      data: result,
      message: "Variation fetched successfully",
    };
  }

  async updateJobVariation(variationId, data, user) {
    const { JobVariation, JobVariationItem } = db;
    const tenantScope = this._tenantScope(user);

    const variation = await JobVariation.findOne({
      where: { variation_id: variationId, ...tenantScope },
    });
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    const updates = { updated_by: user.users_id, updatedBy: user.users_id };
    const toCamel = (str) => str.replace(/_([a-z0-9])/g, (_, char) => char.toUpperCase());
    const assign = (key) => {
      const val = data[key] !== undefined ? data[key] : data[toCamel(key)];
      if (val !== undefined) {
        updates[key] = val;
        updates[toCamel(key)] = val;
      }
    };
    ["title", "amount", "requested_by", "delayed_by", "delayed_days",
      "drawing_changes_required", "invoice_id", "items", "variation_date", "show_price_master_in_pdf",
      "stage", "price_included"].forEach(assign);

    // When status flips to "approved", stamp the approver; clearing it resets both.
    if (data.status !== undefined && data.status !== variation.status) {
      updates.status = data.status;
      if (data.status === "approved") {
        updates.approved_by = user.users_id;
        updates.approvedBy = user.users_id;
        updates.approved_at = new Date();
        updates.approvedAt = new Date();
      } else {
        updates.approved_by = null;
        updates.approvedBy = null;
        updates.approved_at = null;
        updates.approvedAt = null;
      }
    }

    // Reaching stage 3+ (past "Approve") means the variation is approved — keep
    // the status/approver in sync so the list doesn't stay "Draft".
    if (
      updates.status === undefined &&
      (Number(updates.stage) >= 3 || Number(data.stage) >= 3) &&
      variation.status !== "approved"
    ) {
      updates.status = "approved";
      updates.approved_by = user.users_id;
      updates.approvedBy = user.users_id;
      updates.approved_at = new Date();
      updates.approvedAt = new Date();
    }

    await variation.update(updates);

    if (data.items !== undefined && Array.isArray(data.items)) {
      // Save all items, including those marked as removed, to keep status consistent.
      const allItems = data.items;
      await JobVariationItem.destroy({ where: { variation_id: variationId } });
      if (allItems.length > 0) {
        const itemsData = allItems.map((item) => ({
          variation_id: variationId,
          variationId,
          price_list_id: item.price_list_id || item.priceListId || null,
          priceListId: item.price_list_id || item.priceListId || null,
          price_list_item_id: item.price_list_item_id || item.priceListItemId || null,
          priceListItemId: item.price_list_item_id || item.priceListItemId || null,
          additional: item.additional || item.item_name || item.name || null,
          site_cost: item.site_cost || item.siteCost || null,
          siteCost: item.site_cost || item.siteCost || null,
          ...this._normalizeItemAmounts(item),
          drawing_changes: item.drawing_changes || item.drawingChanges || false,
          drawingChanges: item.drawing_changes || item.drawingChanges || false,
          is_price_master: item.is_price_master || item.isPriceMaster || false,
          isPriceMaster: item.is_price_master || item.isPriceMaster || false,
          is_removed: item.is_removed || item.isRemoved || item.removed || false,
          item_type: item.item_type || item.itemType || null,
          itemType: item.item_type || item.itemType || null,
          description: item.description || null,
          uom: item.uom || null,
          note: item.note || item.notes || null,
          notes: item.note || item.notes || null,
          range_id: item.range_id || item.rangeId || [],
          rangeId: item.range_id || item.rangeId || [],
          dwelling_type_id: item.dwelling_type_id || item.dwellingTypeId || [],
          dwellingTypeId: item.dwelling_type_id || item.dwellingTypeId || [],
        }));
        await JobVariationItem.bulkCreate(itemsData);
      }
    }

    const updated = await JobVariation.findOne({
      where: { variation_id: variationId },
      include: this._includeUsers(),
    });

    const result = keysToCamelCase(updated.get({ plain: true }));
    this._formatVariationResponse(result);

    return {
      success: true,
      data: result,
      message: "Variation updated successfully",
    };
  }

  async deleteJobVariation(variationId, user) {
    const { JobVariation } = db;
    const tenantScope = this._tenantScope(user);

    const variation = await JobVariation.findOne({
      where: { variation_id: variationId, ...tenantScope },
    });
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    const jobId = variation.job_id;
    const referenceId = variation.reference_id;
    await variation.destroy();

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId,
      module: "Job Variation",
      moduleId: variationId,
      recordName: referenceId,
      action: "DELETE",
      description: `Variation ${referenceId} deleted`,
    });

    return { success: true, message: "Variation deleted successfully" };
  }

  /* ============== SIGNED VARIATION DOCUMENT (tracker step 4) ============== */

  /**
   * Store a manually-uploaded signed variation document. The file is already in
   * S3 (multer-s3), so we record a DriveFile row, point job_variation.signed_document
   * at it (replacing any previous one), and advance the tracker past "Upload
   * Signed Variation" (stage 4 → 5). Returns the new signed-document descriptor.
   */
  async uploadSignedDocument(variationId, file, user) {
    const { JobVariation, DriveFile } = db;
    const tenantScope = this._tenantScope(user);

    if (!file) {
      return { success: false, statusCode: 400, message: "No file uploaded" };
    }

    const variation = await JobVariation.findOne({
      where: { variation_id: variationId, ...tenantScope },
    });
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    // Remove any previously-uploaded signed document (file + drive row) first.
    if (variation.signed_document) {
      const prev = await DriveFile.findByPk(variation.signed_document);
      if (prev) {
        await deleteFromS3(prev.s3_key);
        await prev.destroy();
      }
    }

    const ext = file.originalname.includes(".")
      ? file.originalname.substring(file.originalname.lastIndexOf(".")).replace(".", "")
      : null;

    const driveFile = await DriveFile.create({
      company_id: user?.company_id || null,
      builder_id: user?.builder_id || null,
      uploaded_by: user?.users_id || null,
      reference_id: variationId,
      reference_type: "JobVariationSignedDocument",
      original_name: file.originalname,
      // multer-s3 named the object from the administrator-configured format;
      // the key's basename is that name. De-duplicate — file_name is UNIQUE.
      file_name: await ensureUniqueDriveFileName(file.key.split("/").pop()),
      s3_key: file.key,
      file_extension: ext,
      mime_type: file.mimetype,
      size: file.size,
    });

    // Point the variation at the new file and advance the tracker past step 4.
    const nextStage = Math.max(Number(variation.stage) || 0, 5);
    await variation.update({ signed_document: driveFile.file_id, stage: nextStage });

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId: variation.job_id,
      module: "Job Variation",
      moduleId: variationId,
      recordName: variation.reference_id,
      action: "UPDATE",
      description: `Uploaded signed variation document for ${variation.reference_id}`,
    });

    const presigned = await generatePresignedDownloadUrl(driveFile.s3_key).catch(() => null);

    return {
      success: true,
      data: {
        signedDocument: { fileId: driveFile.file_id, name: driveFile.original_name },
        url: presigned?.success ? presigned.url : null,
        stage: nextStage,
      },
      message: "Signed variation document uploaded successfully",
    };
  }

  /** Return a short-lived presigned download URL for the signed document. */
  async getSignedDocument(variationId, user) {
    const { JobVariation, DriveFile } = db;
    const tenantScope = this._tenantScope(user);

    const variation = await JobVariation.findOne({
      where: { variation_id: variationId, ...tenantScope },
    });
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }
    if (!variation.signed_document) {
      return { success: false, statusCode: 404, message: "No signed document uploaded" };
    }

    const file = await DriveFile.findByPk(variation.signed_document);
    if (!file) {
      return { success: false, statusCode: 404, message: "Signed document file missing" };
    }

    // Signed off as an attachment: the tracker's "Download" button should save
    // the document to the user's machine, not preview it in a browser tab.
    const presigned = await generatePresignedDownloadUrl(
      file.s3_key,
      undefined,
      file.original_name || "signed-variation.pdf",
    ).catch(() => null);
    if (!presigned?.success) {
      return { success: false, statusCode: 500, message: "Could not generate download link" };
    }

    return {
      success: true,
      data: { fileId: file.file_id, name: file.original_name, url: presigned.url },
      message: "Signed document link generated",
    };
  }

  /**
   * Remove the signed variation document (S3 file + drive row) and clear the
   * pointer, stepping the tracker back to "Upload Signed Variation" (stage 4).
   */
  async deleteSignedDocument(variationId, user) {
    const { JobVariation, DriveFile } = db;
    const tenantScope = this._tenantScope(user);

    const variation = await JobVariation.findOne({
      where: { variation_id: variationId, ...tenantScope },
    });
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }
    if (!variation.signed_document) {
      return { success: false, statusCode: 404, message: "No signed document to delete" };
    }

    const file = await DriveFile.findByPk(variation.signed_document);
    if (file) {
      await deleteFromS3(file.s3_key);
      await file.destroy();
    }

    // Clear the pointer and reopen step 4 (don't drop below it).
    const nextStage = Math.min(Number(variation.stage) || 4, 4);
    await variation.update({ signed_document: null, stage: nextStage });

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId: variation.job_id,
      module: "Job Variation",
      moduleId: variationId,
      recordName: variation.reference_id,
      action: "UPDATE",
      description: `Deleted signed variation document for ${variation.reference_id}`,
    });

    return {
      success: true,
      data: { signedDocument: null, stage: nextStage },
      message: "Signed variation document deleted successfully",
    };
  }

  /**
   * Load a variation with the context needed to build/send its email:
   * the parent job (for reference number) and the builder (recipient), plus the
   * persisted line items.
   */
  async _getVariationWithContext(variationId, user) {
    const {
      JobVariation, Job, Builder, Users, Opportunity, Leads, JobVariationItem,
      PropertyDetail, State, Company, Address,
    } = db;
    const tenantScope = this._tenantScope(user);

    return JobVariation.findOne({
      where: { variation_id: variationId, ...tenantScope },
      include: [
        {
          model: Job,
          as: "job",
          attributes: ["job_id", "reference_number", "builder_id", "company_id", "customer_contact_id"],
          include: [
            { model: Builder, as: "builder", attributes: ["builder_id", "name", "email"] },
            // Portal contact — a fallback customer if no lead is linked.
            { model: Users, as: "customerContact", attributes: ["users_id", "name", "email"] },
            // Remitter details for the invoice PDF's FROM / bank panels.
            {
              model: Company,
              as: "company",
              required: false,
              include: [{ model: Address, as: "address", required: false }],
            },
            // Real customer lives on the lead (Job → opportunity → lead). The
            // invoice PDF also bills to their phone and property address.
            {
              model: Opportunity,
              as: "opportunity",
              attributes: ["opportunity_id"],
              required: false,
              include: [
                {
                  model: Leads,
                  as: "lead",
                  attributes: ["leads_id", "name", "email", "phone"],
                  required: false,
                  include: [
                    {
                      model: PropertyDetail,
                      as: "propertyDetail",
                      required: false,
                      include: [{ model: State, as: "state", required: false }],
                    },
                  ],
                },
              ],
            },
          ],
        },
        { model: JobVariationItem, as: "variationItems" },
      ],
    });
  }

  /** Items to render in the PDF. Colour / price-master items are excluded unless
   *  the variation's "show price master in pdf" is on. Removed items are included
   *  and styled as struck-through. */
  _filterPdfItems(items, showMaster) {
    const list = Array.isArray(items) ? items : [];
    if (showMaster) {
      return list;
    }
    return list.filter(
      (it) =>
        !(it.is_price_master || it.isPriceMaster) ||
        it.item_type === "color_upgrade" ||
        it.itemType === "color_upgrade",
    );
  }

  /**
   * Files the sender uploaded in the mail composer, delivered as base64 (either
   * a "data:<mime>;base64,XXXX" data URL or raw base64), decoded into nodemailer
   * attachments. A single unreadable attachment is skipped, not fatal.
   */
  _composerAttachments(data) {
    if (!Array.isArray(data?.attachments)) {
      return [];
    }
    const out = [];
    for (const att of data.attachments) {
      if (!att?.content || !att?.filename) {
        continue;
      }
      const raw = String(att.content);
      const base64 = raw.includes(",") ? raw.slice(raw.indexOf(",") + 1) : raw;
      try {
        out.push({
          filename: att.filename,
          content: Buffer.from(base64, "base64"),
          contentType: att.content_type || "application/octet-stream",
        });
      } catch (attErr) {
        console.error(`Bad composer attachment "${att.filename}":`, attErr.message);
      }
    }
    return out;
  }

  /**
   * Payment terms (in days) for the variation's builder/company, from
   * job_invoice_settings. 0 / no settings row => the invoice is due on receipt.
   */
  async _resolveInvoiceTermsDays(variation, user) {
    const { JobInvoiceSettings } = db;
    const scopes = [
      { company_id: variation.company_id, builder_id: variation.builder_id },
      { company_id: user?.company_id, builder_id: user?.builder_id },
    ];
    for (const where of scopes) {
      if (!where.company_id && !where.builder_id) {
        continue;
      }
      const record = await JobInvoiceSettings.findOne({
        where,
        attributes: ["invoice_terms_days"],
      }).catch(() => null);
      if (record) {
        return Number(record.invoice_terms_days) || 0;
      }
    }
    return 0;
  }

  /**
   * Invoice identity + dates for a variation: "INV-<reference>", issued today,
   * due `termsDays` later (dueDate null when terms are 0 => due on receipt).
   */
  async _buildInvoiceContext(variation, user) {
    const referenceId = variation.reference_id || variation.variation_id;
    const termsDays = await this._resolveInvoiceTermsDays(variation, user);
    const invoiceDate = new Date();
    let dueDate = null;
    if (termsDays > 0) {
      dueDate = new Date(invoiceDate);
      dueDate.setDate(dueDate.getDate() + termsDays);
    }
    return {
      invoiceNumber: variationInvoiceNumber(referenceId),
      referenceId,
      termsDays,
      invoiceDate,
      dueDate,
    };
  }

  /** Resolve the job's customer (name/email): prefer the lead, fall back to the
   *  portal contact. */
  _resolveCustomer(variation) {
    const lead = variation?.job?.opportunity?.lead;
    const contact = variation?.job?.customerContact;
    const property = lead?.propertyDetail;
    return {
      name: lead?.name || contact?.name || null,
      email: lead?.email || contact?.email || null,
      // Only the lead carries a phone/property; the portal contact fallback has
      // neither, so these stay null and the invoice prints "N/A".
      phone: lead?.phone || null,
      address: [
        property?.lot_number,
        property?.street,
        property?.address_line1,
        property?.address_line2,
        property?.city,
        property?.state?.name,
        property?.zip_code,
      ]
        .map((s) => s?.trim?.() ?? s)
        .filter(Boolean)
        .join(", ") || null,
    };
  }

  /** Remitter (FROM / bank) details for the invoice PDF, from the job's company. */
  _resolveCompany(variation) {
    const company = variation?.job?.company;
    const address = company?.address;
    return {
      name: company?.name || null,
      abnNumber: company?.abn_number || null,
      address1: address?.address_line1 || null,
      address2: address?.address_line2 || null,
      city: address?.city || null,
      zipPostalCode: address?.zip_code || null,
      accountName: company?.account_name || null,
      accountNumber: company?.account_number || null,
      accountBsb: company?.account_bsb || null,
      bankName: company?.bank_name || null,
    };
  }

  /**
   * Render a preview PDF of the variation items currently in the editor (which
   * may be unsaved), using the same server-side template as the sent/eSign PDF.
   * Mirrors the colour-document flow: upload to S3 (stable per-job preview key,
   * overwritten each time) and return a presigned URL to open.
   */
  async previewVariation(jobId, data, user) {
    const { Job, Builder, Users, Opportunity, Leads } = db;
    const tenantScope = this._tenantScope(user);

    const job = await Job.findOne({
      where: { job_id: jobId, ...tenantScope },
      attributes: ["job_id", "reference_number"],
      include: [
        { model: Builder, as: "builder", attributes: ["name"] },
        { model: Users, as: "customerContact", attributes: ["name"] },
        {
          model: Opportunity,
          as: "opportunity",
          attributes: ["opportunity_id"],
          required: false,
          include: [{ model: Leads, as: "lead", attributes: ["name"], required: false }],
        },
      ],
    });
    if (!job) {
      return { success: false, statusCode: 404, message: "Job not found or unauthorized" };
    }

    const customerName = job.opportunity?.lead?.name || job.customerContact?.name || null;
    const jobReference = job.reference_number || "";

    // Map all items from the editor payload, including removed ones, so they
    // render as struck-through in the preview PDF.
    const rawItems = Array.isArray(data.items) ? data.items : [];
    const items = rawItems.map((it) => ({
      additional: it.additional || it.item_name || it.name || it.description || "-",
      quantity: it.quantity,
      price: it.price,
      total: it.total,
      itemType: it.item_type || it.itemType || null,
      is_price_master: it.is_price_master || it.isPriceMaster || false,
      is_removed: it.is_removed || it.isRemoved || it.removed || false,
    }));
    const pdfItems = this._filterPdfItems(items, data.show_price_master_in_pdf || data.showPriceMasterInPdf);
    const amount =
      data.amount != null
        ? data.amount
        : pdfItems.reduce((sum, i) => sum + (Number(i.total) || 0), 0);

    const html = generateVariationDocumentHTML({
      variation: {
        referenceId: data.reference_id || `${jobReference} (Preview)`,
        title: data.title,
        amount,
      },
      customer: { name: customerName },
      jobReference,
      items: pdfItems,
      showPrice: true,
    });

    const pdfBuffer = await generatePDF(html);
    const key = `variation-previews/job_${jobId}.pdf`;
    const upload = await uploadFile(key, pdfBuffer, "application/pdf");
    if (!upload?.success) {
      return { success: false, statusCode: 500, message: "Failed to generate preview" };
    }
    const presigned = await generatePresignedDownloadUrl(upload.key || key);

    return {
      success: true,
      data: { url: presigned?.success ? presigned.url : upload.location || null },
      message: "Preview generated",
    };
  }

  /**
   * Everything the DocuSign flow needs to send a variation for e-signature:
   * the customer signer, the job's lead id, and a freshly rendered variation PDF
   * buffer to use as the signing document.
   */
  async getEsignContext(variationId, user) {
    const variation = await this._getVariationWithContext(variationId, user);
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    const customer = this._resolveCustomer(variation);
    const referenceId = variation.reference_id || variation.variation_id;
    const jobReference = variation.job?.reference_number || "";
    const leadId = variation.job?.opportunity?.lead?.leads_id || null;
    const allItems = (variation.variationItems || []).map((i) =>
      typeof i.get === "function" ? i.get({ plain: true }) : i,
    );
    const items = this._filterPdfItems(allItems, variation.show_price_master_in_pdf || variation.showPriceMasterInPdf);

    const pdfHtml = generateVariationDocumentHTML({
      variation: {
        referenceId,
        title: variation.title,
        amount: variation.amount,
        variationDate: variation.variation_date,
        createdAt: variation.created_at,
      },
      customer: { name: customer.name },
      jobReference,
      items,
      showPrice: true,
    });
    const pdfBuffer = await generatePDF(pdfHtml);

    return {
      success: true,
      data: { customer, referenceId, jobReference, leadId, jobId: variation.job_id, pdfBuffer },
    };
  }

  /**
   * Prefill data for the mail composer. `recipient` selects who the email is
   * for: "builder" (the "Send Variation approved Notification" — default) or
   * "customer" (the "Send this Variation", where the PDF is attached).
   */
  async getVariationEmailData(variationId, user, recipient = "builder") {
    const variation = await this._getVariationWithContext(variationId, user);
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    const builder = variation.job?.builder;
    const customer = this._resolveCustomer(variation);
    const referenceId = variation.reference_id || variation.variation_id;
    const jobReference = variation.job?.reference_number || "";

    if (recipient === "customer") {
      return {
        success: true,
        data: {
          to: customer.email ? [customer.email] : [],
          toName: customer.name || null,
          subject: `Variation ${referenceId}${jobReference ? ` — ${jobReference}` : ""}`.trim(),
          message: defaultCustomerVariationMessageHtml({
            customerName: customer?.name,
            referenceId,
            jobReference,
            amount: variation.amount,
          }),
        },
        message: "Variation email data fetched successfully",
      };
    }

    return {
      success: true,
      data: {
        to: builder?.email ? [builder.email] : [],
        toName: builder?.name || null,
        subject: variationApprovedSubject({ referenceId, jobReference }),
        message: defaultVariationMessageHtml({
          builderName: builder?.name,
          referenceId,
          jobReference,
          amount: variation.amount,
        }),
      },
      message: "Variation email data fetched successfully",
    };
  }

  /**
   * Send the variation approval email to the builder (or whichever recipients
   * the sender kept). Sends directly (guaranteed delivery), records the result
   * in the Notifications table, and logs it on the job activity feed.
   *
   * @param {object} data - { to: string[], subject, content, send_copy }
   *                        (already snake-cased by camelToSnakeMiddleware)
   */
  async sendVariationEmail(variationId, data, user) {
    const { Notifications } = db;

    const variation = await this._getVariationWithContext(variationId, user);
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    // Keep only real email addresses — a stray display-name tag would abort the
    // whole SMTP send otherwise.
    const recipients = (Array.isArray(data.to) ? data.to : [data.to])
      .map((e) => String(e || "").trim())
      .filter((e) => e.includes("@"));
    if (recipients.length === 0) {
      return { success: false, statusCode: 400, message: "A valid recipient email is required" };
    }

    const builder = variation.job?.builder;
    const customer = this._resolveCustomer(variation);
    const referenceId = variation.reference_id || variation.variation_id;
    const jobReference = variation.job?.reference_number || "";
    const items = (variation.variationItems || []).map((i) =>
      typeof i.get === "function" ? i.get({ plain: true }) : i,
    );

    const { subject: defaultSubject, html, text } = buildVariationEmail({
      builderName: builder?.name,
      jobReference,
      referenceId,
      amount: variation.amount,
      items,
      userMessageHtml: data.content || null,
    });
    const subject = (data.subject && String(data.subject).trim()) || defaultSubject;

    const cc = data.send_copy && user?.email ? [user.email] : null;

    // Attach the variation document PDF when requested (the "Send this Variation"
    // customer flow). A PDF-generation failure must not block the send.
    const attachments = [];
    if (data.attach_pdf) {
      try {
        const pdfHtml = generateVariationDocumentHTML({
          variation: {
            referenceId,
            title: variation.title,
            amount: variation.amount,
            variationDate: variation.variation_date,
            createdAt: variation.created_at,
          },
          customer: { name: customer?.name },
          jobReference,
          items: this._filterPdfItems(items, variation.show_price_master_in_pdf || variation.showPriceMasterInPdf),
          showPrice: true,
        });
        const pdfBuffer = await generatePDF(pdfHtml);
        const safeRef = String(referenceId).replace(/[^\w.-]+/g, "_");
        attachments.push({
          filename: `Variation-${safeRef}.pdf`,
          content: pdfBuffer,
          contentType: "application/pdf",
        });

        // Also save the variation document into the Job Documents tab (best-effort;
        // keyed by variation_id, replacing the previous one so a re-send overwrites).
        try {
          const docKey = `job-variation-documents/Variation-${safeRef}-${Date.now()}.pdf`;
          const docUpload = await uploadFile(docKey, pdfBuffer, "application/pdf");
          if (docUpload?.success) {
            const prev = await db.DriveFile.findAll({
              where: { reference_id: variation.variation_id, reference_type: "JobVariationDocument" },
            });
            for (const p of prev) {
              await p.destroy({ force: true });
            }
            await db.DriveFile.create({
              company_id: variation.company_id || user?.company_id || null,
              builder_id: variation.builder_id || user?.builder_id || null,
              uploaded_by: user?.users_id || null,
              reference_id: variation.variation_id,
              reference_type: "JobVariationDocument",
              original_name: `Variation-${safeRef}.pdf`,
              file_name: (docUpload.key || docKey).split("/").pop(),
              s3_key: docUpload.key || docKey,
              file_extension: "pdf",
              mime_type: "application/pdf",
              size: pdfBuffer.length,
            });
          }
        } catch (saveErr) {
          console.error("sendVariationEmail: saving variation document to drive failed:", saveErr.message);
        }
      } catch (pdfErr) {
        console.error("sendVariationEmail PDF generation failed:", pdfErr.message);
      }
    }

    attachments.push(...this._composerAttachments(data));

    // 1) Persist the approval FIRST so the variation status is guaranteed in the
    //    DB even if the notification email later fails to deliver. The approval
    //    is the primary action; the email is just the notification.
    let approved = false;
    if (data.approve && variation.status !== "approved") {
      await variation.update({
        status: "approved",
        approved_by: user?.users_id || null,
        approved_at: new Date(),
        updated_by: user?.users_id || null,
        // Approve done → tracker moves to "Send to Customer" (stage 3).
        stage: Math.max(Number(variation.stage) || 0, 3),
      });
      approved = true;
    }

    // 2) Send the notification (best-effort — the approval is already saved).
    let emailSent = true;
    let emailError = null;
    try {
      await sendEmailNow(recipients, subject, text, html, attachments, cc);
    } catch (error) {
      emailSent = false;
      emailError = String(error.message);
      console.error("sendVariationEmail delivery error:", emailError);
    }

    // 3) Record the notification result.
    await Notifications.create({
      sender_id: user?.users_id || null,
      receiver_info: JSON.stringify({ to: recipients, cc }),
      template_id: null,
      notification_type: "EMAIL",
      title: subject.slice(0, 500),
      body: subject.slice(0, 999),
      metadata_json: JSON.stringify({ variationId, jobId: variation.job_id, referenceId, approved }),
      delivery_status: emailSent ? "SENT" : "FAILED",
      failure_reason: emailSent ? null : emailError.slice(0, 500),
    }).catch(() => {});

    // Nothing succeeded (no approval requested and the email failed) — surface it.
    if (!approved && !emailSent) {
      return { success: false, statusCode: 502, message: `Failed to send email: ${emailError}` };
    }

    // Customer send done (PDF attached) → tracker moves past "Send to Customer".
    // Reaching this step means the variation is approved, so stamp the approver
    // if it wasn't already (keeps the list's "Approved" column populated).
    if (data.attach_pdf && emailSent && (Number(variation.stage) || 0) < 4) {
      const stageUpdate = { stage: 4, updated_by: user?.users_id || null };
      if (variation.status !== "approved") {
        stageUpdate.status = "approved";
        stageUpdate.approved_by = user?.users_id || null;
        stageUpdate.approved_at = new Date();
      }
      await variation.update(stageUpdate);
    }

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId: variation.job_id,
      module: "Job Variation",
      moduleId: variationId,
      recordName: referenceId,
      action: approved ? "APPROVE" : "EMAIL_SENT",
      description: approved
        ? `Variation ${referenceId} approved${
          emailSent ? ` and notification sent to ${recipients.join(", ")}` : " (notification email failed)"
        }`
        : `Variation ${referenceId} approval email sent to ${recipients.join(", ")}`,
    });

    return {
      success: true,
      data: { to: recipients, cc, subject, status: variation.status, stage: variation.stage, approved, emailSent },
      message: approved
        ? emailSent
          ? "Variation approved and email sent successfully"
          : "Variation approved, but the notification email could not be sent"
        : "Variation email sent successfully",
    };
  }

  /**
   * Prefill for the "Send Invoice to Customer" composer (tracker step 6): the
   * job's customer as recipient, plus the default invoice subject/message.
   */
  async getInvoiceEmailData(variationId, user) {
    const variation = await this._getVariationWithContext(variationId, user);
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    const customer = this._resolveCustomer(variation);
    const jobReference = variation.job?.reference_number || "";
    const { invoiceNumber, referenceId, dueDate } = await this._buildInvoiceContext(variation, user);

    return {
      success: true,
      data: {
        to: customer.email ? [customer.email] : [],
        toName: customer.name || null,
        subject: variationInvoiceSubject({ invoiceNumber, jobReference }),
        message: defaultInvoiceMessageHtml({
          customerName: customer.name,
          invoiceNumber,
          referenceId,
          jobReference,
          amount: variation.amount,
          dueDate,
        }),
        invoiceNumber,
        dueDate,
      },
      message: "Invoice email data fetched successfully",
    };
  }

  /**
   * Generate the invoice PDF for the variation amount, store it in drive_files
   * (replacing any previous invoice for this variation), attach it to an email
   * and send it to the customer. On success the tracker moves past step 6.
   *
   * Ordering mirrors sendVariationEmail: persist the artefact FIRST so a
   * delivery failure still leaves a stored, downloadable invoice to retry with.
   * Unlike the variation send, a PDF failure IS fatal here — the invoice
   * document is the thing being delivered, so there's nothing to send without it.
   */
  async sendInvoiceEmail(variationId, data, user) {
    const { JobVariation, DriveFile, Notifications } = db;

    const variation = await this._getVariationWithContext(variationId, user);
    if (!variation) {
      return { success: false, statusCode: 404, message: "Variation not found or unauthorized" };
    }

    // Keep only real email addresses — a stray display-name tag would abort the
    // whole SMTP send otherwise.
    const recipients = (Array.isArray(data.to) ? data.to : [data.to])
      .map((e) => String(e || "").trim())
      .filter((e) => e.includes("@"));
    if (recipients.length === 0) {
      return { success: false, statusCode: 400, message: "A valid recipient email is required" };
    }

    const customer = this._resolveCustomer(variation);
    const jobReference = variation.job?.reference_number || "";
    const items = (variation.variationItems || []).map((i) =>
      typeof i.get === "function" ? i.get({ plain: true }) : i,
    );
    const invoice = await this._buildInvoiceContext(variation, user);
    const pdfItems = this._filterPdfItems(
      items,
      variation.show_price_master_in_pdf || variation.showPriceMasterInPdf,
    );

    // 1) Render the invoice PDF.
    let pdfBuffer;
    try {
      pdfBuffer = await generatePDF(
        generateInvoiceDocumentHTML({
          invoice: {
            number: invoice.invoiceNumber,
            invoiceDate: invoice.invoiceDate,
            dueDate: invoice.dueDate,
            termsDays: invoice.termsDays,
          },
          variation: {
            referenceId: invoice.referenceId,
            title: variation.title,
            amount: variation.amount,
          },
          customer,
          company: this._resolveCompany(variation),
          jobReference,
          items: pdfItems,
        }),
      );
    } catch (pdfErr) {
      console.error("sendInvoiceEmail PDF generation failed:", pdfErr.message);
      return { success: false, statusCode: 500, message: "Could not generate the invoice PDF" };
    }

    const safeNumber = String(invoice.invoiceNumber).replace(/[^\w.-]+/g, "_");
    // Name the invoice from the administrator-configured format (Admin →
    // Integration → File Naming); its own invoice number is the reference.
    const fileName = await ensureUniqueDriveFileName(
      await buildFileName({
        companyId: variation.company_id || user?.company_id || null,
        builderId: variation.builder_id || user?.builder_id || null,
        jobId: variation.job_id,
        referenceNumber: invoice.invoiceNumber,
        fileType: "Invoice",
        extension: ".pdf",
      }),
    );
    const s3Key = `job-variation-invoices/${Date.now()}/${fileName}`;
    const upload = await uploadFile(s3Key, pdfBuffer, "application/pdf");
    if (!upload?.success) {
      return { success: false, statusCode: 500, message: "Could not store the invoice PDF" };
    }

    // 2) Store it in drive_files, replacing the previous invoice for this
    //    variation (re-sending regenerates the document).
    if (variation.invoice_document) {
      const prev = await DriveFile.findByPk(variation.invoice_document);
      if (prev) {
        await deleteFromS3(prev.s3_key).catch(() => {});
        await prev.destroy().catch(() => {});
      }
    }

    const driveFile = await DriveFile.create({
      company_id: variation.company_id || user?.company_id || null,
      builder_id: variation.builder_id || user?.builder_id || null,
      uploaded_by: user?.users_id || null,
      reference_id: variationId,
      reference_type: "JobVariationInvoiceDocument",
      original_name: `${safeNumber}.pdf`,
      file_name: fileName,
      s3_key: upload.key || s3Key,
      file_extension: "pdf",
      mime_type: "application/pdf",
      size: pdfBuffer.length,
    });

    await JobVariation.update(
      { invoice_document: driveFile.file_id, updated_by: user?.users_id || null },
      { where: { variation_id: variationId } },
    );

    // 3) Send the invoice email with the PDF attached.
    const { subject: defaultSubject, html, text } = buildInvoiceEmail({
      customerName: customer.name,
      jobReference,
      referenceId: invoice.referenceId,
      invoiceNumber: invoice.invoiceNumber,
      amount: variation.amount,
      dueDate: invoice.dueDate,
      items,
      userMessageHtml: data.content || null,
    });
    const subject = (data.subject && String(data.subject).trim()) || defaultSubject;
    const cc = data.send_copy && user?.email ? [user.email] : null;

    const attachments = [
      { filename: `${safeNumber}.pdf`, content: pdfBuffer, contentType: "application/pdf" },
      ...this._composerAttachments(data),
    ];

    let emailSent = true;
    let emailError = null;
    try {
      await sendEmailNow(recipients, subject, text, html, attachments, cc);
    } catch (error) {
      emailSent = false;
      emailError = String(error.message);
      console.error("sendInvoiceEmail delivery error:", emailError);
    }

    // 4) Record the notification result.
    await Notifications.create({
      sender_id: user?.users_id || null,
      receiver_info: JSON.stringify({ to: recipients, cc }),
      template_id: null,
      notification_type: "EMAIL",
      title: subject.slice(0, 500),
      body: subject.slice(0, 999),
      metadata_json: JSON.stringify({
        variationId,
        jobId: variation.job_id,
        referenceId: invoice.referenceId,
        invoiceNumber: invoice.invoiceNumber,
      }),
      delivery_status: emailSent ? "SENT" : "FAILED",
      failure_reason: emailSent ? null : emailError.slice(0, 500),
    }).catch(() => {});

    // The invoice PDF is stored either way, so a retry just regenerates it — but
    // the step isn't done until the customer actually has the invoice.
    if (!emailSent) {
      return { success: false, statusCode: 502, message: `Failed to send invoice: ${emailError}` };
    }

    // Invoice sent → tracker moves past "Send Invoice to Customer" (stage 7).
    const nextStage = Math.max(Number(variation.stage) || 0, 7);
    await JobVariation.update(
      { stage: nextStage, updated_by: user?.users_id || null },
      { where: { variation_id: variationId } },
    );

    await logJobActivity(null, {
      userId: user?.users_id || null,
      jobId: variation.job_id,
      module: "Job Variation",
      moduleId: variationId,
      recordName: invoice.referenceId,
      action: "EMAIL_SENT",
      description: `Invoice ${invoice.invoiceNumber} for variation ${invoice.referenceId} sent to ${recipients.join(", ")}`,
    });

    return {
      success: true,
      data: {
        to: recipients,
        cc,
        subject,
        invoiceNumber: invoice.invoiceNumber,
        dueDate: invoice.dueDate,
        invoiceDocument: { fileId: driveFile.file_id, name: driveFile.original_name },
        stage: nextStage,
        emailSent,
      },
      message: "Invoice sent to the customer successfully",
    };
  }
}

export default new JobVariationService();
