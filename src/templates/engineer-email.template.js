/**
 * Branded wrapper for the "Mail to Structural Engineer" email body.
 *
 * The user types/edits a message (HTML) in the slide-over panel; this wraps
 * that message in the same branded layout used previously (inBuildify header,
 * specification summary card, footer) so the delivered email is styled rather
 * than raw HTML. Inline CSS only — email clients ignore <style>/external CSS.
 */

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function specRow(label, value, last = false) {
  if (!value) return "";
  const border = last ? "border-bottom: none;" : "";
  return `
    <tr>
      <td style="padding: 10px 20px; font-size: 14px; color: #64748b; ${border}">${esc(label)}</td>
      <td style="padding: 10px 20px 10px 0; font-size: 14px; font-weight: 600; color: #1e293b; text-align: right; ${border}">${esc(value)}</td>
    </tr>`;
}

/**
 * @param {object} opts
 * @param {string} opts.subject  email subject (shown as heading)
 * @param {string} opts.bodyHtml user-authored HTML message (inserted as-is)
 * @param {object} [opts.specs]  { address, rangeName, floorPlanName, facadeName, packageName }
 * @param {string} [opts.uploadUrl] optional "Upload Report" CTA link for the engineer
 * @param {string} [opts.engReqUrl] optional presigned download link for the Engineering Requirement PDF
 * @param {string} [opts.compactionUrl] optional presigned download link for the Compaction Report PDF
 * @returns {string} full HTML email
 */
export function wrapEngineerEmailHTML({ subject = "", bodyHtml = "", specs = {}, uploadUrl = "", engReqUrl = "", compactionUrl = "" } = {}) {
  const { address, rangeName, floorPlanName, facadeName, packageName } = specs;

  const specRows = [
    specRow("Property Address", address),
    specRow("Range", rangeName),
    specRow("Floor Plan", floorPlanName),
    specRow("Facade Option", facadeName),
    specRow("Selected Package", packageName, true),
  ].join("");

  const specCard = specRows
    ? `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin: 24px 0 8px; border-collapse: separate; overflow: hidden;">
        <tr>
          <td colspan="2" style="background-color: #f1f5f9; padding: 12px 20px; border-bottom: 1px solid #e2e8f0;">
            <strong style="font-size: 13px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.5px;">Specification Summary</strong>
          </td>
        </tr>
        ${specRows}
      </table>`
    : "";

  const uploadButton = uploadUrl
    ? `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 24px;">
        <tr>
          <td style="text-align: center;">
            <a href="${esc(uploadUrl)}" target="_blank" style="display: inline-block; box-sizing: border-box; width: 300px; max-width: 100%; background-color: #0056b3; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 14px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; text-align: center;">
              Upload Report
            </a>
          </td>
        </tr>
      </table>`
    : "";

  // Download links mirror the attachments so the documents stay reachable even
  // when the recipient's mail provider strips attachments (e.g. disposable
  // inboxes like mailinator/yopmail) or rejects large messages.
  function downloadButton(url, label) {
    if (!url) return "";
    return `
        <tr>
          <td style="text-align: center; padding-top: 12px;">
            <a href="${esc(url)}" target="_blank" style="display: inline-block; box-sizing: border-box; width: 300px; max-width: 100%; background-color: #0056b3; color: #ffffff; text-decoration: none; padding: 14px 24px; border-radius: 8px; font-size: 14px; font-weight: 700; text-align: center;">
              ${esc(label)}
            </a>
          </td>
        </tr>`;
  }
  const downloadButtons = (engReqUrl || compactionUrl)
    ? `
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="margin-top: 16px;">
        <tr>
          <td style="text-align: center; padding-bottom: 4px; font-size: 13px; color: #64748b;">
            Use the buttons below to download the documents.
          </td>
        </tr>
        ${downloadButton(engReqUrl, "Download Engineering Requirement")}
        ${downloadButton(compactionUrl, "Download Compaction Report")}
      </table>`
    : "";

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f9fc; padding: 40px 10px; margin: 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eef2f5;">
        <tr>
          <td style="background-color: #0056b3; padding: 28px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td><span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">inBuildify</span></td>
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #d6e7f8; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">Engineering Request</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 36px 40px 30px;">
            ${subject ? `<h2 style="font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 18px; line-height: 1.3;">${esc(subject)}</h2>` : ""}
            <div style="font-size: 15px; color: #475569; line-height: 1.6;">${bodyHtml}</div>
            ${specCard}
            ${downloadButtons}
            ${uploadButton}
          </td>
        </tr>
        <tr>
          <td style="background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 8px;">This email is regarding structural engineering requirements. Use the download buttons above to access the documents.</p>
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>
      </table>
    </div>`;
}

export default wrapEngineerEmailHTML;
