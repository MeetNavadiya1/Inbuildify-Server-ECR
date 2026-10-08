import docusign from "docusign-esign";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import docusignConfig from "../config/docusign.config.js";
import { generatePresignedDownloadUrl, uploadFile } from "./s3.service.js";
import { logActivity } from "../utils/activityLogger.js";
import db from "../config/database/models/postgre-models/index.js";
import emailQueue from "../queues/emailQueue.js";
import {
  upsertQuotationDriveFile,
  getQuotationDriveFileS3Key,
} from "../helper/quotationDriveFile.helper.js";
import { DRIVE_FILE_MAPPING } from "../constants/driveFile.js";

/**
 * Extracts and logs every available detail from a DocuSign / Axios error.
 */
function logDocuSignError(label, error) {
  const status = error.response?.status ?? error.statusCode ?? error.status ?? "N/A";
  const body = error.response?.data ?? error.response?.body ?? error.body ?? null;
  const headers = error.response?.headers ?? null;

  console.error("\n╔══════════════════════════════════════════════════");
  console.error(`║ [DocuSign ERROR] ${label}`);
  console.error("╠══════════════════════════════════════════════════");
  console.error("║ HTTP Status :", status);
  console.error("║ Message     :", error.message);
  if (body) console.error("║ Body        :", JSON.stringify(body, null, 2));
  if (headers) console.error("║ Headers     :", JSON.stringify(headers));
  console.error("║ Stack       :", error.stack?.split("\n").slice(0, 4).join("\n║              "));
  console.error("╚══════════════════════════════════════════════════\n");

  const errCode = body?.error ?? body?.errorCode ?? "";
  if (errCode === "consent_required" || String(body).includes("consent_required")) {
    console.error(
      `[DocuSign] ⚠️  CONSENT REQUIRED — open this URL in a browser once:\n` +
      `  https://account-d.docusign.com/oauth/auth` +
      `?response_type=code&scope=signature%20impersonation` +
      `&client_id=${docusignConfig.clientId}` +
      `&redirect_uri=${encodeURIComponent(docusignConfig.signingRedirectUrl)}\n`
    );
  }
}

class DocuSignService {
  constructor() {
    this.apiClient = new docusign.ApiClient();
    this.apiClient.setBasePath(docusignConfig.basePath);
  }

  async getJwtToken() {
    let rawPem;
    try {
      rawPem = fs.readFileSync(path.join(process.cwd(), "private.key"), "utf8");
    } catch {
      rawPem = docusignConfig.rsaKey;
    }

    const normalizedPem = rawPem.replace(/\\n/g, "\n").replace(/\\r/g, "").trim();
    const privateKey = crypto.createPrivateKey(normalizedPem);

    let results;
    try {
      results = await this.apiClient.requestJWTUserToken(
        docusignConfig.clientId,
        docusignConfig.userId,
        ["signature", "impersonation"],
        privateKey,
        3600,
      );
    } catch (error) {
      logDocuSignError("requestJWTUserToken", error);
      throw new Error(`DocuSign JWT request failed: ${error.message}`);
    }

    const token = results?.body?.access_token;
    if (!token) {
      const body = results?.body ?? results ?? {};
      logDocuSignError("requestJWTUserToken (no access_token)", { message: "No access_token in response", body, response: { data: body } });
      throw new Error(`DocuSign returned no access_token: ${JSON.stringify(body)}`);
    }

    return token;
  }

  async getUserInfo(accessToken) {
    this.apiClient.addDefaultHeader("Authorization", `Bearer ${accessToken}`);
    try {
      return await this.apiClient.getUserInfo(accessToken);
    } catch (error) {
      logDocuSignError("getUserInfo", error);
      throw new Error(`DocuSign getUserInfo failed: ${error.message}`);
    }
  }

  async createQuotationEnvelope(quotationVersionId, options, userId, leadsId) {
    const transaction = await db.sequelize.transaction();
    try {
      const { QuotationVersion, Quotation, Leads } = db.sequelize.models;
      const quotation = await QuotationVersion.findOne({
        where: { quotation_version_id: quotationVersionId },
        include: [
          {
            model: Quotation,
            as: "quotation",
            include: [{ model: Leads, as: "lead" }]
          }
        ],
        transaction
      });

      if (!quotation) throw new Error("Quotation version not found");
      const qData = quotation.get({ plain: true });

      const accessToken = await this.getJwtToken();
      const userInfo = await this.getUserInfo(accessToken);
      const accountId = userInfo.accounts[0].accountId;
      const envelopesApi = new docusign.EnvelopesApi(this.apiClient);

      let documentBase64;
      if (options.pdfBuffer) {
        documentBase64 = options.pdfBuffer.toString("base64");
      } else {
        const s3Key = await getQuotationDriveFileS3Key(
          quotationVersionId,
          DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT,
          { transaction },
        );
        if (!s3Key) throw new Error("Quotation PDF not generated yet.");

        try {
          const documentUrlResult = await generatePresignedDownloadUrl(s3Key);
          documentBase64 = await this.getDocumentAsBase64(documentUrlResult.url);
        } catch (pdfError) {
          throw new Error(`Failed to fetch PDF from S3: ${pdfError.message}`);
        }
      }

      const envDef = new docusign.EnvelopeDefinition();
      envDef.emailSubject = options.emailSubject || docusignConfig.defaultEmailSubject.quotation;
      envDef.emailBlurb = options.emailBlurb || docusignConfig.defaultEmailMessage.quotation;
      envDef.status = "sent";

      const doc = new docusign.Document();
      doc.documentBase64 = documentBase64;
      doc.name = `Quotation - ${qData.quotation.reference_number}`;
      doc.fileExtension = "pdf";
      doc.documentId = "1";
      envDef.documents = [doc];

      envDef.recipients = new docusign.Recipients();
      let recipientIdCounter = 1;

      const docSigners = options.signers.map((s, index) => {
        const signer = new docusign.Signer();
        signer.email = s.email;
        signer.name = s.name;
        signer.recipientId = recipientIdCounter.toString();
        signer.routingOrder = s.routingOrder || "1";

        if (options.useEmbeddedSigning) {
          signer.clientUserId = s.clientUserId || s.email;
        }

        const signHere = new docusign.SignHere();
        signHere.documentId = "1";
        signHere.pageNumber = "1";
        signHere.recipientId = recipientIdCounter.toString();
        signHere.tabLabel = `Signature_${recipientIdCounter}`;
        signHere.xPosition = (100 + index * 150).toString();
        signHere.yPosition = "100";

        signer.tabs = new docusign.Tabs();
        signer.tabs.signHereTabs = [signHere];

        recipientIdCounter++;
        return signer;
      });
      envDef.recipients.signers = docSigners;

      if (options.ccRecipients && options.ccRecipients.length > 0) {
        const carbonCopies = options.ccRecipients.map((cc) => {
          const carbonCopy = new docusign.CarbonCopy();
          carbonCopy.email = cc.email;
          carbonCopy.name = cc.name;
          carbonCopy.recipientId = recipientIdCounter.toString();
          carbonCopy.routingOrder = cc.routingOrder || "2";
          recipientIdCounter++;
          return carbonCopy;
        });
        envDef.recipients.carbonCopies = carbonCopies;
      }

      const webhookUrl = docusignConfig.webhookUrl;
      if (webhookUrl) {
        const eventNotification = new docusign.EventNotification();
        eventNotification.url = webhookUrl;
        eventNotification.loggingEnabled = "true";
        eventNotification.requireAcknowledgment = "true";
        eventNotification.useSoapInterface = "false";
        eventNotification.includeDocuments = "false";
        eventNotification.includeEnvelopeVoidReason = "true";
        eventNotification.includeTimeZone = "false";
        eventNotification.includeSenderAccountAsCustomField = "false";
        eventNotification.includeDocumentFields = "false";
        eventNotification.includeCertificateOfCompletion = "false";
        eventNotification.envelopeEvents = [
          { envelopeEventStatusCode: "sent" },
          { envelopeEventStatusCode: "completed" },
          { envelopeEventStatusCode: "declined" },
          { envelopeEventStatusCode: "voided" },
        ];
        envDef.eventNotification = eventNotification;
      }

      let envelope;
      try {
        envelope = await envelopesApi.createEnvelope(accountId, { envelopeDefinition: envDef });
      } catch (error) {
        logDocuSignError("createEnvelope", error);
        throw new Error(`DocuSign createEnvelope failed: ${error.message}`);
      }

      const primarySigner = options.signers[0];
      await this.saveEnvelopeInfo(
        transaction,
        envelope.envelopeId,
        quotationVersionId,
        "quotation",
        primarySigner.email,
        primarySigner.name,
        userId,
        leadsId,
      );

      await logActivity(transaction, {
        userId,
        referenceId: leadsId,
        referenceType: "LEAD",
        module: "DocuSign",
        moduleId: envelope.envelopeId,
        recordName: qData.quotation.reference_number,
        action: "CREATE",
        description: `DocuSign envelope sent for: ${qData.quotation.reference_number}`,
      });

      await transaction.commit();
      return { success: true, envelopeId: envelope.envelopeId, status: envelope.status };
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }
  }

  /**
   * Create a DocuSign envelope for a job variation. The variation PDF buffer is
   * supplied by the caller (options.pdfBuffer); the customer is the signer.
   * Mirrors createQuotationEnvelope but stores type = "variation".
   */
  async createVariationEnvelope(variationId, options, userId, leadsId) {
    const transaction = await db.sequelize.transaction();
    try {
      if (!options?.pdfBuffer) throw new Error("Variation PDF not provided");

      const accessToken = await this.getJwtToken();
      const userInfo = await this.getUserInfo(accessToken);
      const accountId = userInfo.accounts[0].accountId;
      const envelopesApi = new docusign.EnvelopesApi(this.apiClient);

      const envDef = new docusign.EnvelopeDefinition();
      envDef.emailSubject = options.emailSubject || "Variation — Signature Required";
      envDef.emailBlurb = options.emailBlurb || "Please review and sign the attached variation.";
      envDef.status = "sent";

      const doc = new docusign.Document();
      doc.documentBase64 = options.pdfBuffer.toString("base64");
      doc.name = options.documentName || `Variation - ${variationId}`;
      doc.fileExtension = "pdf";
      doc.documentId = "1";
      envDef.documents = [doc];

      envDef.recipients = new docusign.Recipients();
      let recipientIdCounter = 1;

      const docSigners = (options.signers || []).map((s, index) => {
        const signer = new docusign.Signer();
        signer.email = s.email;
        signer.name = s.name;
        signer.recipientId = recipientIdCounter.toString();
        signer.routingOrder = s.routingOrder || "1";

        if (options.useEmbeddedSigning) {
          signer.clientUserId = s.clientUserId || s.email;
        }

        const signHere = new docusign.SignHere();
        signHere.documentId = "1";
        signHere.pageNumber = "1";
        signHere.recipientId = recipientIdCounter.toString();
        signHere.tabLabel = `Signature_${recipientIdCounter}`;
        signHere.xPosition = (100 + index * 150).toString();
        signHere.yPosition = "600";

        signer.tabs = new docusign.Tabs();
        signer.tabs.signHereTabs = [signHere];

        recipientIdCounter++;
        return signer;
      });
      envDef.recipients.signers = docSigners;

      const webhookUrl = docusignConfig.webhookUrl;
      if (webhookUrl) {
        const eventNotification = new docusign.EventNotification();
        eventNotification.url = webhookUrl;
        eventNotification.loggingEnabled = "true";
        eventNotification.requireAcknowledgment = "true";
        eventNotification.useSoapInterface = "false";
        eventNotification.includeDocuments = "false";
        eventNotification.includeEnvelopeVoidReason = "true";
        eventNotification.envelopeEvents = [
          { envelopeEventStatusCode: "sent" },
          { envelopeEventStatusCode: "completed" },
          { envelopeEventStatusCode: "declined" },
          { envelopeEventStatusCode: "voided" },
        ];
        envDef.eventNotification = eventNotification;
      }

      let envelope;
      try {
        envelope = await envelopesApi.createEnvelope(accountId, { envelopeDefinition: envDef });
      } catch (error) {
        logDocuSignError("createEnvelope (variation)", error);
        throw new Error(`DocuSign createEnvelope failed: ${error.message}`);
      }

      const primarySigner = options.signers[0];
      await this.saveEnvelopeInfo(
        transaction,
        envelope.envelopeId,
        variationId,
        "variation",
        primarySigner.email,
        primarySigner.name,
        userId,
        leadsId,
      );

      await logActivity(transaction, {
        userId,
        referenceId: leadsId,
        referenceType: "LEAD",
        module: "DocuSign",
        moduleId: envelope.envelopeId,
        recordName: options.documentName || variationId,
        action: "CREATE",
        description: `DocuSign variation envelope sent: ${options.documentName || variationId}`,
      });

      await transaction.commit();
      return { success: true, envelopeId: envelope.envelopeId, status: envelope.status };
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }
  }

  async cancelEnvelope(envelopeId, voidReason) {
    const transaction = await db.sequelize.transaction();
    try {
      const accessToken = await this.getJwtToken();
      const userInfo = await this.getUserInfo(accessToken);
      const accountId = userInfo.accounts[0].accountId;
      const envelopesApi = new docusign.EnvelopesApi(this.apiClient);

      const envelope = new docusign.Envelope();
      envelope.status = "voided";
      envelope.voidedReason = voidReason || "Canceled by sender.";

      await envelopesApi.update(accountId, envelopeId, { envelope });
      await this.updateEnvelopeStatus(envelopeId, "voided", transaction);

      await transaction.commit();
      return { success: true };
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }
  }

  async getEnvelopeStatus(envelopeId) {
    const accessToken = await this.getJwtToken();
    const userInfo = await this.getUserInfo(accessToken);
    const envelopesApi = new docusign.EnvelopesApi(this.apiClient);
    const envelope = await envelopesApi.getEnvelope(userInfo.accounts[0].accountId, envelopeId);
    return { success: true, status: envelope.status, envelopeId: envelope.envelopeId };
  }

  async getRecipientViewUrl(envelopeId, returnUrl, signerEmail, signerName) {
    const accessToken = await this.getJwtToken();
    const userInfo = await this.getUserInfo(accessToken);
    const envelopesApi = new docusign.EnvelopesApi(this.apiClient);

    const recipientViewRequest = new docusign.RecipientViewRequest();
    recipientViewRequest.returnUrl = returnUrl;
    recipientViewRequest.authenticationMethod = "email";
    recipientViewRequest.email = signerEmail;
    recipientViewRequest.userName = signerName;
    recipientViewRequest.recipientId = "1";
    recipientViewRequest.clientUserId = signerEmail;

    try {
      const viewUrl = await envelopesApi.createRecipientView(userInfo.accounts[0].accountId, envelopeId, { recipientViewRequest });
      return { success: true, url: viewUrl.url };
    } catch (error) {
      logDocuSignError("createRecipientView", error);
      throw new Error(`DocuSign createRecipientView failed: ${error.message}`);
    }
  }

  async downloadSignedDocument(envelopeId) {
    const accessToken = await this.getJwtToken();
    const userInfo = await this.getUserInfo(accessToken);
    const envelopesApi = new docusign.EnvelopesApi(this.apiClient);
    const combinedDocument = await envelopesApi.getDocument(userInfo.accounts[0].accountId, envelopeId, "combined");
    return { success: true, document: combinedDocument };
  }

  async saveEnvelopeInfo(transaction, envelopeId, referenceId, type, signerEmail, signerName, userId, leadsId) {
    const { DocuSignEnvelope } = db.sequelize.models;
    await DocuSignEnvelope.upsert({
      envelope_id: envelopeId,
      reference_id: referenceId,
      type,
      signer_email: signerEmail,
      signer_name: signerName,
      status: "sent",
      created_by: userId,
      leads_id: leadsId,
    }, { transaction });
  }

  async updateEnvelopeStatus(envelopeId, status, transaction = null) {
    const { DocuSignEnvelope } = db.sequelize.models;
    await DocuSignEnvelope.update(
      { status, updated_at: db.sequelize.literal('CURRENT_TIMESTAMP') },
      { where: { envelope_id: envelopeId }, transaction }
    );
  }

  async getDocumentAsBase64(url) {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return Buffer.from(buffer).toString("base64");
  }

  async processWebhook(webhookData) {
    const transaction = await db.sequelize.transaction();
    try {
      let envelopeId, rawStatus;
      if (webhookData.event && webhookData.data?.envelopeId) {
        envelopeId = webhookData.data.envelopeId;
        rawStatus = webhookData.event.replace("envelope-", "");
      } else if (webhookData.envelopeId && webhookData.status) {
        envelopeId = webhookData.envelopeId;
        rawStatus = webhookData.status.toLowerCase();
      } else {
        return { success: false, message: "Invalid payload" };
      }

      let status = "sent";
      if (rawStatus === "completed") status = "completed";
      else if (rawStatus === "voided") status = "voided";
      else if (rawStatus === "declined") status = "declined";
      else if (["sent", "resent", "delivered"].includes(rawStatus)) status = "sent";

      console.log(`Processing Webhook: Envelope ${envelopeId} status changed to ${status}`);

      await this.updateEnvelopeStatus(envelopeId, status, transaction);

      const { DocuSignEnvelope, QuotationVersion } = db.sequelize.models;
      const envelope = await DocuSignEnvelope.findOne({ where: { envelope_id: envelopeId }, transaction });

      if (envelope) {
        await logActivity(transaction, {
          userId: null,
          referenceId: envelope.leads_id,
          referenceType: "LEAD",
          module: "DocuSign",
          moduleId: envelopeId,
          recordName: envelope.type,
          action: "WEBHOOK",
          description: `DocuSign webhook received: ${status} for ${envelope.type}`,
        });

        if (status === "completed" && envelope.type === 'quotation') {
          const signedDocResult = await this.downloadSignedDocument(envelopeId);
          const rawDoc = signedDocResult.document;
          const fileBuffer = Buffer.isBuffer(rawDoc) ? rawDoc : Buffer.from(rawDoc, "binary");

          const timestamp = new Date().getTime();
          const s3Key = `signed_documents/leads_${envelope.leads_id}/quote_${envelope.reference_id}_${timestamp}.pdf`;
          const uploadResult = await uploadFile(s3Key, fileBuffer, "application/pdf");

          // The signed PDF is stored exclusively as a DriveFile
          // (sub_reference_type=SignedQuotationReport). The legacy
          // signed_pdf_url column is no longer written per the DriveFile
          // migration blueprint.
          if (uploadResult.success) {
            await upsertQuotationDriveFile({
              versionId: envelope.reference_id,
              subReferenceType: DRIVE_FILE_MAPPING.SUB_REFERENCES.SIGNED_QUOTATION_REPORT,
              s3Key: uploadResult.key,
              size: fileBuffer.length,
              originalName: `Signed_Quotation.pdf`,
              leadId: envelope.leads_id,
              transaction,
            });
          }

          await QuotationVersion.update({
            esign_status: status,
            is_approve: true
          }, {
            where: { quotation_version_id: envelope.reference_id },
            transaction
          });

          await emailQueue.add(
            "quoteApprovedEmail",
            { quotationVersionId: envelope.reference_id, envelopeId },
            { attempts: 3, backoff: { type: "exponential", delay: 5000 } }
          );
        } else if (envelope.type === 'quotation') {
          await QuotationVersion.update({ esign_status: status }, { where: { quotation_version_id: envelope.reference_id }, transaction });
        } else if (status === "completed" && envelope.type === 'variation') {
          const { JobVariation } = db.sequelize.models;

          // Store the signed variation PDF in S3 and record its key on the
          // envelope, then advance the variation's tracker past "Upload Signed".
          try {
            const signedDocResult = await this.downloadSignedDocument(envelopeId);
            const rawDoc = signedDocResult.document;
            const fileBuffer = Buffer.isBuffer(rawDoc) ? rawDoc : Buffer.from(rawDoc, "binary");
            const timestamp = new Date().getTime();
            const s3Key = `signed_documents/variation_${envelope.reference_id}_${timestamp}.pdf`;
            const uploadResult = await uploadFile(s3Key, fileBuffer, "application/pdf");
            if (uploadResult?.success) {
              await DocuSignEnvelope.update(
                { signed_document_url: uploadResult.key || s3Key },
                { where: { envelope_id: envelopeId }, transaction },
              );
            }
          } catch (docErr) {
            console.error("[DocuSign] variation signed-doc store failed:", docErr.message);
          }

          await JobVariation.update(
            { stage: db.sequelize.literal("GREATEST(stage, 5)") },
            { where: { variation_id: envelope.reference_id }, transaction },
          );
        }
      }

      await transaction.commit();
      return { success: true };
    } catch (error) {
      if (transaction) await transaction.rollback();
      throw error;
    }
  }
}

export default new DocuSignService();
