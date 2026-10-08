import crypto from "crypto";
import docusignService from "../../service/docusign.service.js";
import docusignConfig from "../../config/docusign.config.js";
import { successResponse, errorResponse, handleControllerError } from "../../helper/response.js";
import { keysToCamelCase } from "../../utils/common.js";
import db from "../../config/database/models/postgre-models/index.js";
import { decodeSignToken } from "../../utils/hashEncoder.js";
import { env } from "../../config/env.config.js";
import { Op } from "sequelize";
import { getQuotationDriveFileS3Key } from "../../helper/quotationDriveFile.helper.js";
import { DRIVE_FILE_MAPPING } from "../../constants/driveFile.js";
import jobVariationService from "../job-variation/job-variation.service.js";

class DocuSignController {
  /**
   * Send a job variation for e-signature and return an embedded signing URL.
   * Mirrors the quotation eSign flow: render the variation PDF, create a
   * DocuSign envelope with the customer as signer, then create a recipient view.
   */
  async sendVariationForEsign(req, res) {
    try {
      const { variation_id } = req.params;
      const { user_id } = req.user;

      const ctx = await jobVariationService.getEsignContext(variation_id, req.user);
      if (!ctx.success) return errorResponse(res, ctx.statusCode || 400, ctx.message);

      const { customer, referenceId, leadId, pdfBuffer } = ctx.data;
      if (!customer?.email) {
        return errorResponse(res, 400, "Customer email not available for this variation");
      }

      const signerName = customer.name || customer.email;
      const result = await docusignService.createVariationEnvelope(
        variation_id,
        {
          pdfBuffer,
          documentName: `Variation - ${referenceId}`,
          emailSubject: `Variation ${referenceId} — Signature Required`,
          useEmbeddedSigning: true,
          signers: [{ email: customer.email, name: signerName }],
        },
        user_id,
        leadId,
      );

      const backendBaseUrl = env.BACKEND_URL || `http://localhost:${env.PORT || 5000}`;
      const returnUrl = `${backendBaseUrl}/docusign/public/signing-callback?envelopeId=${result.envelopeId}`;
      const view = await docusignService.getRecipientViewUrl(
        result.envelopeId,
        returnUrl,
        customer.email,
        signerName,
      );

      return successResponse(res, { envelopeId: result.envelopeId, signingUrl: view.url });
    } catch (error) {
      console.error("Error sending variation for e-signature:", error);
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Send quotation for e-signature
   */
  async sendQuotationForEsign(req, res) {
    try {
      const { quotation_version_id } = req.params;
      const payloadOptions = req.body;
      const { user_id, builder_id, company_id } = req.user;

      const { QuotationVersion, Quotation, Leads } = db.sequelize.models;
      const quotation = await QuotationVersion.findOne({
        where: { quotation_version_id },
        include: [
          {
            model: Quotation,
            as: "quotation",
            include: [{ 
              model: Leads, 
              as: "lead",
              where: {
                [Op.or]: [
                  { builder_id },
                  ...(company_id ? [{ company_id }] : [])
                ]
              }
            }]
          }
        ]
      });

      if (!quotation) return errorResponse(res, 404, "Quotation not found or unauthorized");
      if (quotation.esign_envelope_id) return errorResponse(res, 400, "Quotation already sent for e-signature");

      const result = await docusignService.createQuotationEnvelope(
        quotation_version_id,
        payloadOptions,
        user_id,
        quotation.quotation.lead.leads_id
      );

      await QuotationVersion.update(
        { esign_status: "sent", esign_envelope_id: result.envelopeId },
        { where: { quotation_version_id } }
      );

      return successResponse(res, { envelopeId: result.envelopeId, status: result.status });
    } catch (error) {
      console.error("Error sending quotation for e-signature:", error);
      return handleControllerError(res, error, error.message);
    }
  }

  async cancelEsignRequest(req, res) {
    try {
      const { envelope_id } = req.params;
      const { void_reason } = req.body;
      const { builder_id, company_id } = req.user;

      const { DocuSignEnvelope, QuotationVersion, Quotation, Leads } = db.sequelize.models;
      const envelope = await DocuSignEnvelope.findOne({
        where: { envelope_id },
        include: [
          {
            model: QuotationVersion,
            as: "quotationVersion",
            include: [{
              model: Quotation,
              as: "quotation",
              include: [{
                model: Leads,
                as: "lead",
                where: {
                  [Op.or]: [
                    { builder_id },
                    ...(company_id ? [{ company_id }] : [])
                  ]
                }
              }]
            }]
          }
        ]
      });

      if (!envelope) return errorResponse(res, 404, "Envelope not found or unauthorized");

      await docusignService.cancelEnvelope(envelope_id, void_reason);
      return successResponse(res, { message: "E-signature request canceled successfully" });

    } catch (error) {
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Get envelope status
   */
  async getEnvelopeStatus(req, res) {
    try {
      const { envelopeId } = req.params;
      const result = await docusignService.getEnvelopeStatus(envelopeId);
      return successResponse(res, {
        envelopeId: result.envelopeId,
        status: result.status
      });
    } catch (error) {
      console.error("Error getting envelope status:", error);
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Get signing URL for embedded signing
   */
  async getSigningUrl(req, res) {
    try {
      const { envelope_id } = req.params;
      const { return_url, signer_email, signer_name } = req.query;
      const { builder_id, company_id } = req.user;

      const { DocuSignEnvelope, QuotationVersion, Quotation, Leads } = db.sequelize.models;
      const envelope = await DocuSignEnvelope.findOne({
        where: { envelope_id },
        include: [
          {
            model: QuotationVersion,
            as: "quotationVersion",
            include: [{
              model: Quotation,
              as: "quotation",
              include: [{
                model: Leads,
                as: "lead",
                where: {
                  [Op.or]: [
                    { builder_id },
                    ...(company_id ? [{ company_id }] : [])
                  ]
                }
              }]
            }]
          }
        ]
      });

      if (!envelope) return errorResponse(res, 404, "Envelope not found or unauthorized");

      const finalReturnUrl = return_url || docusignConfig.signingRedirectUrl || "https://localhost:3000";

      const result = await docusignService.getRecipientViewUrl(
        envelope_id,
        finalReturnUrl,
        signer_email,
        signer_name
      );

      return successResponse(res, { signingUrl: result.url });
    } catch (error) {
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Download signed document
   */
  async downloadSignedDocument(req, res) {
    try {
      const { envelope_id } = req.params;
      const { builder_id, company_id } = req.user;

      const { DocuSignEnvelope, QuotationVersion, Quotation, Leads } = db.sequelize.models;
      const envelope = await DocuSignEnvelope.findOne({
        where: { envelope_id },
        include: [
          {
            model: QuotationVersion,
            as: "quotationVersion",
            include: [{
              model: Quotation,
              as: "quotation",
              include: [{
                model: Leads,
                as: "lead",
                where: {
                  [Op.or]: [
                    { builder_id },
                    ...(company_id ? [{ company_id }] : [])
                  ]
                }
              }]
            }]
          }
        ]
      });

      if (!envelope) return errorResponse(res, 404, "Envelope not found or unauthorized");

      const result = await docusignService.downloadSignedDocument(envelope_id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="signed-document-${envelope_id}.pdf"`);
      return res.send(result.document);
    } catch (error) {
      return handleControllerError(res, error, error.message);
    }
  }


  /**
   * Get e-signature status for quotation versions
   */
  async getQuotationEsignStatus(req, res) {
    try {
      const { quotationVersionId } = req.params;
      const { builderId, companyId } = req.user;

      const { QuotationVersion, Quotation, Leads, DocuSignEnvelope } = db.sequelize.models;
      const quotation = await QuotationVersion.findOne({
        where: { quotation_version_id: quotationVersionId },
        include: [
          {
            model: Quotation,
            as: "quotation",
            include: [{ 
              model: Leads, 
              as: "lead",
              where: {
                [Op.or]: [
                  { builder_id: builderId },
                  ...(companyId ? [{ company_id: companyId }] : [])
                ]
              }
            }]
          },
          {
            model: DocuSignEnvelope,
            as: "esignEnvelope"
          }
        ]
      });

      if (!quotation) {
        return errorResponse(res, 404, "Quotation version not found or unauthorized");
      }

      const qData = quotation.get({ plain: true });

      const [pdfS3Key, signedPdfS3Key] = await Promise.all([
        getQuotationDriveFileS3Key(quotationVersionId, DRIVE_FILE_MAPPING.SUB_REFERENCES.QUOTATION_REPORT),
        getQuotationDriveFileS3Key(quotationVersionId, DRIVE_FILE_MAPPING.SUB_REFERENCES.SIGNED_QUOTATION_REPORT),
      ]);

      const s3Prefix = `https://${env.AWS.S3_BUCKET_NAME}.s3.${env.AWS.AWS_REGION}.amazonaws.com/`;
      const pdfUrl = pdfS3Key ? `${s3Prefix}${pdfS3Key}` : null;
      const signedPdfUrl = signedPdfS3Key ? `${s3Prefix}${signedPdfS3Key}` : null;

      const statusData = {
        quotationVersionId,
        referenceNumber: qData.quotation.reference_number,
        esignStatus: qData.esign_status,
        envelopeId: qData.esignEnvelope?.envelope_id,
        envelopeStatus: qData.esignEnvelope?.status,
        signerEmail: qData.esignEnvelope?.signer_email,
        signerName: qData.esignEnvelope?.signer_name,
        pdfUrl,
        signedPdfUrl,
      };

      return successResponse(res, keysToCamelCase(statusData));

    } catch (error) {
      console.error("Error getting e-signature status:", error);
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Public — no auth. Called from the email Sign button.
   */
  async publicSigningRedirect(req, res) {
    const frontendBaseUrl = env.EMAIL.FRONTEND_BASE_URL || "http://localhost:3000";
    try {
      const { token } = req.query;
      if (!token) {
        return res.redirect(`${frontendBaseUrl}/signing-error?reason=missing_token`);
      }

      let decoded;
      try {
        decoded = decodeSignToken(token);
      } catch {
        return res.redirect(`${frontendBaseUrl}/signing-error?reason=invalid_token`);
      }

      const { envelopeId, signerEmail, signerName } = decoded;
      console.log(`[DocuSign] publicSigningRedirect — envelopeId: ${envelopeId}, signer: ${signerEmail}`);

      // Use the public backend URL so DocuSign can redirect the signer's
      // browser back here after signing. Must NOT depend on NODE_ENV: we run
      // live with NODE_ENV=development (to avoid Sequelize forcing DB SSL), so
      // gating on isDev would wrongly produce http://localhost for real clients.
      const backendBaseUrl = env.BACKEND_URL || `http://localhost:${env.PORT || 5000}`;
      const returnUrl = `${backendBaseUrl}/docusign/public/signing-callback?envelopeId=${envelopeId}`;
      const result = await docusignService.getRecipientViewUrl(envelopeId, returnUrl, signerEmail, signerName);

      console.log(`[DocuSign] Redirecting signer to DocuSign URL`);
      return res.redirect(result.url);
    } catch (error) {
      console.error("[DocuSign] publicSigningRedirect error:", error.message);
      return res.redirect(`${frontendBaseUrl}/signing-error?reason=docusign_error`);
    }
  }

  /**
   * Public — no auth. Fallback status sync.
   */
  async publicStatusSync(req, res) {
    try {
      const { envelope_id } = req.params;
      if (!envelope_id) return errorResponse(res, 400, "Missing envelope_id");

      const envelopeStatus = await docusignService.getEnvelopeStatus(envelope_id);
      await docusignService.processWebhook({
        envelopeId: envelope_id,
        status: envelopeStatus.status,
      });

      return successResponse(res, { envelopeId: envelope_id, status: envelopeStatus.status });
    } catch (error) {
      console.error("[DocuSign] publicStatusSync error:", error.message);
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Handle DocuSign Connect webhooks
   */
  async handleWebhook(req, res) {
    try {
      const secret = docusignConfig.webhookSecret;
      if (secret) {
        const signature = req.headers["x-docusign-signature-1"];
        if (!signature) return errorResponse(res, 401, "Missing webhook signature");

        const rawBytes = req.rawBody ?? Buffer.from(JSON.stringify(req.body), "utf8");
        const expected = crypto.createHmac("sha256", Buffer.from(secret, "base64")).update(rawBytes).digest("base64");
        if (signature !== expected) return errorResponse(res, 401, "Invalid webhook signature");
      }

      await docusignService.processWebhook(req.body);
      return successResponse(res, { message: "Webhook processed" });
    } catch (error) {
      console.error("[DocuSign Webhook] Error:", error.message);
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Get current e-signature request status
   */
  async resendEsignRequest(req, res) {
    try {
      const { quotationVersionId } = req.params;
      const { builderId, companyId } = req.user;

      const { QuotationVersion, Quotation, Leads, DocuSignEnvelope } = db.sequelize.models;
      const quotation = await QuotationVersion.findOne({
        where: { quotation_version_id: quotationVersionId },
        include: [
          {
            model: Quotation,
            as: "quotation",
            include: [{ 
              model: Leads, 
              as: "lead",
              where: {
                [Op.or]: [
                  { builder_id: builderId },
                  ...(companyId ? [{ company_id: companyId }] : [])
                ]
              }
            }]
          },
          {
            model: DocuSignEnvelope,
            as: "esignEnvelope"
          }
        ]
      });

      if (!quotation) return errorResponse(res, 404, "Quotation version not found or unauthorized");
      if (!quotation.esign_envelope_id) return errorResponse(res, 400, "No e-signature envelope found for this quotation");

      const envelopeStatus = await docusignService.getEnvelopeStatus(quotation.esign_envelope_id);
      return successResponse(res, {
        envelopeId: quotation.esign_envelope_id,
        status: envelopeStatus.status,
        message: "E-signature request status retrieved"
      });

    } catch (error) {
      console.error("Error resending e-signature request:", error);
      return handleControllerError(res, error, error.message);
    }
  }

  async publicDownloadSignedDocument(req, res) {
    try {
      const { envelope_id } = req.params;
      
      const { DocuSignEnvelope } = db.sequelize.models;
      const envelope = await DocuSignEnvelope.findOne({ where: { envelope_id } });
      if (!envelope) return errorResponse(res, 404, "Envelope not found");

      const result = await docusignService.downloadSignedDocument(envelope_id);

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="signed-quotation.pdf"`);
      return res.send(result.document);
    } catch (error) {
      console.error("[DocuSign] publicDownloadSignedDocument error:", error.message);
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Get all e-signature history for the company/builder
   */
  async getEsignHistory(req, res) {
    try {
      const { builder_id, company_id } = req.user;
      const { DocuSignEnvelope, QuotationVersion, Quotation, Leads } = db.sequelize.models;

      const envelopes = await DocuSignEnvelope.findAll({
        include: [
          {
            model: QuotationVersion,
            as: "quotationVersion",
            required: true,
            include: [{
              model: Quotation,
              as: "quotation",
              required: true,
              include: [{
                model: Leads,
                as: "lead",
                required: true,
                where: {
                  [Op.or]: [
                    { builder_id },
                    ...(company_id ? [{ company_id }] : [])
                  ]
                }
              }]
            }]
          }
        ],
        order: [["created_at", "DESC"]],
      });

      const historyData = await Promise.all(envelopes.map(async (envelopeRecord) => {
        const data = envelopeRecord.get({ plain: true });
        const qv = data.quotationVersion;
        const q = qv?.quotation;
        const lead = q?.lead;

        let signedPdfUrl = null;
        if (data.status === "completed" && data.quotation_version_id) {
          const s3Key = await getQuotationDriveFileS3Key(data.quotation_version_id, DRIVE_FILE_MAPPING.SUB_REFERENCES.SIGNED_QUOTATION_REPORT);
          if (s3Key) {
            signedPdfUrl = `https://${env.AWS.S3_BUCKET_NAME}.s3.${env.AWS.AWS_REGION}.amazonaws.com/${s3Key}`;
          }
        }

        return {
          envelopeId: data.envelope_id,
          status: data.status,
          signerName: data.signer_name,
          signerEmail: data.signer_email,
          referenceNumber: q?.reference_number,
          customerName: lead?.customer_name,
          createdAt: data.created_at,
          signedPdfUrl,
          quotationVersionId: data.quotation_version_id,
        };
      }));

      return successResponse(res, historyData);
    } catch (error) {
      console.error("Error getting e-sign history:", error);
      return handleControllerError(res, error, error.message);
    }
  }

  /**
   * Public — no auth. DocuSign redirects here after signing.
   */
  async signingCallback(req, res) {
    const frontendBaseUrl = env.EMAIL.FRONTEND_BASE_URL || "http://localhost:3000";
    const backendBaseUrl = env.BACKEND_URL || `http://localhost:${env.PORT || 5000}`;
    try {
      const { envelopeId, event } = req.query;
      if (!envelopeId) return res.redirect(`${frontendBaseUrl}/signing-error?reason=missing_envelope`);

      const { DocuSignEnvelope, QuotationVersion, Quotation } = db.sequelize.models;
      const envelope = await DocuSignEnvelope.findByPk(envelopeId);

      if (event === "signing_complete") {
        await docusignService.processWebhook({ envelopeId, status: "completed" });

        const isVariation = envelope?.type === "variation";
        const heading = isVariation ? "Variation Approved" : "Quotation Approved";
        const docKind = isVariation ? "variation" : "quotation";
        const docsHeading = isVariation ? "Your Signed Variations" : "Your Signed Quotations";

        let allSignedDocsHtml = "";
        if (envelope?.leads_id) {
          const allSignedEnvelopes = await DocuSignEnvelope.findAll({
            where: { leads_id: envelope.leads_id, type: envelope.type, status: "completed" },
            include: isVariation
              ? []
              : [
                  {
                    model: QuotationVersion,
                    as: "quotationVersion",
                    include: [{ model: Quotation, as: "quotation" }],
                  },
                ],
            order: [["created_at", "DESC"]],
          });

          // For variations, resolve reference numbers from the job_variation table
          // (DocuSignEnvelope only associates the quotation side).
          let variationRefMap = {};
          if (isVariation && allSignedEnvelopes.length > 0) {
            const { JobVariation } = db.sequelize.models;
            const variations = await JobVariation.findAll({
              where: { variation_id: allSignedEnvelopes.map((e) => e.reference_id) },
              attributes: ["variation_id", "reference_id"],
            });
            variations.forEach((v) => {
              variationRefMap[v.variation_id] = v.reference_id;
            });
          }

          if (allSignedEnvelopes.length > 0) {
            allSignedDocsHtml = `
              <div class="docs-list">
                <h3 style="margin-bottom: 16px; color: #0f172a; text-align: left; font-size: 18px;">${docsHeading}</h3>
                ${allSignedEnvelopes.map(envRecord => {
                  const data = envRecord.get({ plain: true });
                  const refNumber = isVariation
                    ? (variationRefMap[data.reference_id] || "Variation")
                    : (data.quotationVersion?.quotation?.reference_number || "Quotation");
                  const date = new Date(data.created_at).toLocaleDateString();
                  return '<div class="doc-item"><div class="doc-info"><strong>' + refNumber + '</strong><span class="doc-date">Signed on ' + date + '</span></div><a href="' + backendBaseUrl + '/docusign/public/download/' + data.envelope_id + '" class="download-link">Download</a></div>';
                }).join('')}
              </div>
            `;
          }
        }

        return res.send(`
          <!DOCTYPE html>
          <html lang="en">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>${heading}</title>
            <style>
              :root {
                --primary: #0056b3;
                --primary-light: #e6f0fa;
                --success: #10b981;
                --success-light: #d1fae5;
                --text-dark: #0f172a;
                --text-gray: #64748b;
                --bg-color: #f6f9fc;
                --card-bg: #ffffff;
              }
              body {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                background-color: var(--bg-color);
                background-image: radial-gradient(circle at 100% 0%, #e6f0fa 0%, transparent 40%), radial-gradient(circle at 0% 100%, #d1fae5 0%, transparent 40%);
                margin: 0;
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                padding: 40px 20px;
                box-sizing: border-box;
              }
              .header {
                margin-bottom: 32px;
                font-size: 28px;
                font-weight: 800;
                color: var(--primary);
                letter-spacing: -0.5px;
              }
              .card {
                background: var(--card-bg);
                padding: 50px 40px;
                border-radius: 20px;
                box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
                text-align: center;
                max-width: 440px;
                width: 90%;
                border: 1px solid rgba(255, 255, 255, 0.8);
                position: relative;
                overflow: hidden;
                animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
              }
              .icon-container {
                width: 88px;
                height: 88px;
                border-radius: 50%;
                background: var(--success-light);
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0 auto 28px;
                position: relative;
                animation: scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
              }
              .icon-container::after {
                content: '';
                position: absolute;
                width: 100%;
                height: 100%;
                border-radius: 50%;
                border: 2px solid var(--success);
                opacity: 0.2;
                animation: pulse 2s infinite;
              }
              .icon {
                color: var(--success);
                font-size: 42px;
                line-height: 1;
              }
              h1 {
                margin: 0 0 12px;
                font-size: 28px;
                font-weight: 800;
                color: var(--text-dark);
                letter-spacing: -0.5px;
              }
              p.message {
                margin: 0 0 30px;
                color: var(--text-gray);
                font-size: 16px;
                line-height: 1.6;
              }
              .footer-note {
                padding-top: 24px;
                border-top: 1px solid #f1f5f9;
                font-size: 14px;
                color: #94a3b8;
                font-weight: 500;
              }
              .docs-list {
                margin: 24px 0;
                text-align: left;
                background: #f8fafc;
                border-radius: 12px;
                padding: 20px;
                border: 1px solid #e2e8f0;
              }
              .doc-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid #e2e8f0;
              }
              .doc-item:last-child {
                border-bottom: none;
                padding-bottom: 0;
              }
              .doc-info {
                display: flex;
                flex-direction: column;
              }
              .doc-info strong {
                color: #0f172a;
                font-size: 15px;
                margin-bottom: 4px;
              }
              .doc-date {
                color: #64748b;
                font-size: 13px;
              }
              .download-link {
                background-color: var(--primary);
                color: #ffffff;
                text-decoration: none;
                padding: 8px 16px;
                border-radius: 6px;
                font-weight: 600;
                font-size: 13px;
                transition: background-color 0.2s;
              }
              .download-link:hover {
                background-color: #004494;
              }
              @keyframes slideUp {
                from { opacity: 0; transform: translateY(30px); }
                to { opacity: 1; transform: translateY(0); }
              }
              @keyframes scaleIn {
                from { opacity: 0; transform: scale(0.5); }
                to { opacity: 1; transform: scale(1); }
              }
              @keyframes pulse {
                0% { transform: scale(1); opacity: 0.5; }
                100% { transform: scale(1.4); opacity: 0; }
              }
            </style>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap" rel="stylesheet">
          </head>
          <body>
            <div class="header">inBuildify</div>
            <div class="card">
              <div class="icon-container">
                <div class="icon">✓</div>
              </div>
              <h1>${heading}</h1>
              <p class="message">Thank you for signing. Your ${docKind} has been approved successfully and is now saved in our records.</p>
              
              ${allSignedDocsHtml}

              <div class="footer-note">
                You can safely close this window.
              </div>
            </div>
          </body>
          </html>
        `);
      }

      return res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Signing Status</title>
          <style>
            :root {
              --primary: #0056b3;
              --text-dark: #0f172a;
              --text-gray: #64748b;
              --bg-color: #f6f9fc;
              --card-bg: #ffffff;
              --warning: #f59e0b;
              --warning-light: #fef3c7;
            }
            body {
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
              background-color: var(--bg-color);
              background-image: radial-gradient(circle at 100% 0%, #e6f0fa 0%, transparent 40%), radial-gradient(circle at 0% 100%, #fef3c7 0%, transparent 40%);
              margin: 0;
              min-height: 100vh;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
            }
            .header {
              position: absolute;
              top: 40px;
              font-size: 28px;
              font-weight: 800;
              color: var(--primary);
              letter-spacing: -0.5px;
            }
            .card {
              background: var(--card-bg);
              padding: 50px 40px;
              border-radius: 20px;
              box-shadow: 0 20px 40px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05);
              text-align: center;
              max-width: 440px;
              width: 90%;
              border: 1px solid rgba(255, 255, 255, 0.8);
              animation: slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1);
            }
            .icon-container {
              width: 88px;
              height: 88px;
              border-radius: 50%;
              background: var(--warning-light);
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0 auto 28px;
              animation: scaleIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both;
            }
            .icon {
              color: var(--warning);
              font-size: 42px;
              line-height: 1;
            }
            h1 {
              margin: 0 0 12px;
              font-size: 28px;
              font-weight: 800;
              color: var(--text-dark);
              letter-spacing: -0.5px;
            }
            p.message {
              margin: 0 0 30px;
              color: var(--text-gray);
              font-size: 16px;
              line-height: 1.6;
            }
            .status-badge {
              display: inline-block;
              padding: 6px 14px;
              background-color: #f1f5f9;
              color: #334155;
              border-radius: 20px;
              font-weight: 600;
              font-size: 14px;
              text-transform: capitalize;
              margin-top: 8px;
            }
            .footer-note {
              padding-top: 24px;
              border-top: 1px solid #f1f5f9;
              font-size: 14px;
              color: #94a3b8;
              font-weight: 500;
            }
            @keyframes slideUp {
              from { opacity: 0; transform: translateY(30px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes scaleIn {
              from { opacity: 0; transform: scale(0.5); }
              to { opacity: 1; transform: scale(1); }
            }
          </style>
          <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;800&display=swap" rel="stylesheet">
        </head>
        <body>
          <div class="header">inBuildify</div>
          <div class="card">
            <div class="icon-container">
              <div class="icon">!</div>
            </div>
            <h1>Signing Ended</h1>
            <p class="message">The document signing process has concluded with the following status:</p>
            <div style="margin-bottom: 24px;">
              <span class="status-badge">${event || 'unknown'}</span>
            </div>
            <div class="footer-note">
              You can safely close this window.
            </div>
          </div>
        </body>
        </html>
      `);
    } catch (error) {
      console.error("[DocuSign] signingCallback error:", error.message);
      return res.redirect(`${frontendBaseUrl}/signing-error?reason=callback_error`);
    }
  }
}

export default new DocuSignController();
