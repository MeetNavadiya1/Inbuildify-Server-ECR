/**
 * Templates for the S-Drive delete-approval emails.
 *
 *   1. wrapDriveDeleteRequestHTML  — to the owner, carrying the review link.
 *   2. wrapDriveDeleteDecisionHTML — back to the requester once it is decided.
 *
 * Same shell as job-task-workflow.template.js: a 600px card on a #f6f9fc
 * canvas, blue header bar with the inBuildify wordmark and a section badge, a
 * bordered details card of label/value rows, then the footer. Inline CSS only —
 * mail clients ignore <style> and external stylesheets.
 */

const PLACEHOLDER = "—";

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const esc = escapeHtml;

function val(value) {
  if (value === null || value === undefined) return PLACEHOLDER;
  const str = String(value).trim();
  return str.length ? escapeHtml(str) : PLACEHOLDER;
}

/** House date format for emails — "16 Oct 2026". */
export function formatEmailDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

/** One label/value row inside a details card. Skipped entirely when empty. */
function detailRow(label, value, last = false) {
  if (value === null || value === undefined || value === "") return "";
  const borderBottom = last ? "none" : "1px solid #f1f5f9";
  return `
    <tr>
      <td style="padding: 10px 0; font-size: 13px; color: #64748b; border-bottom: ${borderBottom}; vertical-align: top; width: 42%; padding-right: 16px;">${esc(label)}</td>
      <td style="padding: 10px 0; font-size: 13px; font-weight: 600; color: #1e293b; border-bottom: ${borderBottom}; vertical-align: top;">${val(value)}</td>
    </tr>`;
}

/** A titled card wrapping a set of detail rows. */
function detailsCard(title, rows) {
  if (!rows) return "";
  return `
            <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; margin-bottom: 24px; overflow: hidden;">
              <div style="background-color: #f1f5f9; padding: 11px 20px; border-bottom: 1px solid #e2e8f0;">
                <strong style="font-size: 12px; color: #1e293b; text-transform: uppercase; letter-spacing: 0.6px;">${esc(title)}</strong>
              </div>
              <div style="padding: 4px 20px 8px;">
                <table border="0" cellpadding="0" cellspacing="0" width="100%">
                  ${rows}
                </table>
              </div>
            </div>`;
}

/** Primary call-to-action button. */
function ctaButton(url, label) {
  if (!url || url === "#") return "";
  return `
            <table border="0" cellpadding="0" cellspacing="0" style="margin-bottom: 28px;">
              <tr>
                <td style="background-color: #2563eb; border-radius: 6px; padding: 12px 28px;">
                  <a href="${esc(url)}" style="font-size: 14px; font-weight: 700; color: #ffffff; text-decoration: none; display: inline-block;">${esc(label)}</a>
                </td>
              </tr>
            </table>`;
}

/** The shared shell every one of these emails is built from. */
function emailShell({ badge, bodyHtml, footerNote }) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f9fc; padding: 40px 10px; margin: 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eef2f5;">

        <!-- ── Header ── -->
        <tr>
          <td style="background-color: #2563eb; padding: 28px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td><span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">inBuildify</span></td>
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #b3d7ff; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">${esc(badge)}</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- ── Body ── -->
        <tr>
          <td style="padding: 36px 40px 30px;">
${bodyHtml}
          </td>
        </tr>

        <!-- ── Footer ── -->
        <tr>
          <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            ${footerNote ? `<p style="font-size: 12px; color: #94a3b8; margin: 0 0 6px;">${esc(footerNote)}</p>` : ""}
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>

      </table>
    </div>`;
}

/**
 * Sent to the item's owner: someone wants this deleted, and nothing happens
 * until you say so.
 *
 * @returns {{ subject: string, html: string, text: string }}
 */
export function wrapDriveDeleteRequestHTML({
  ownerName = "",
  requestedByName = "",
  itemName = "",
  itemType = "file",
  sharedFolderName = null,
  // Set when the recipient owns the folder the item sits in rather than the
  // item itself — several documents are filed with no uploader recorded, and
  // being asked about "a file you own" you have never seen reads as a mistake.
  ownedViaFolder = null,
  reason = "",
  requestedAt = null,
  reviewUrl = "#",
} = {}) {
  const typeLabel = itemType === "folder" ? "Folder" : "File";
  const ownership = ownedViaFolder
    ? `a ${itemType} in your folder "${esc(ownedViaFolder)}"`
    : `a ${esc(itemType)} you own`;

  const rows = [
    detailRow(typeLabel, itemName),
    detailRow("Location", sharedFolderName),
    detailRow("Requested by", requestedByName),
    detailRow("Requested on", formatEmailDate(requestedAt), true),
  ].join("");

  const reasonCard = reason
    ? `
            <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 16px 20px; margin-bottom: 24px;">
              <p style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; margin: 0 0 8px;">Reason Given</p>
              <p style="font-size: 14px; color: #1e293b; line-height: 1.7; margin: 0; white-space: pre-line;">${esc(reason)}</p>
            </div>`
    : "";

  const body = `
            <p style="font-size: 15px; color: #475569; margin: 0 0 6px;">Dear ${esc(ownerName) || "there"},</p>

            <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Approval Needed to Delete</h2>

            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
              ${esc(requestedByName) || "Someone"} has asked to delete ${ownership} in S-Drive.
              It has <strong>not</strong> been deleted — nothing happens unless you approve below.
            </p>
            ${detailsCard("Item", rows)}
${reasonCard}
            <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">
              Please review and record your decision:
            </p>
            ${ctaButton(reviewUrl, "Review Request")}

            <p style="font-size: 13px; color: #94a3b8; margin: 0;">On approval the ${esc(itemType)} moves to your Trash, where you can still restore it. If you were not expecting this request, reject it.</p>`;

  const text = [
    `Dear ${ownerName || "there"},`,
    "",
    ownedViaFolder
      ? `${requestedByName || "Someone"} has asked to delete the ${itemType} "${itemName}", which sits in your folder "${ownedViaFolder}".`
      : `${requestedByName || "Someone"} has asked to delete the ${itemType} "${itemName}" that you own in S-Drive.`,
    "It has NOT been deleted — nothing happens unless you approve.",
    "",
    sharedFolderName ? `Location: ${sharedFolderName}` : null,
    formatEmailDate(requestedAt) ? `Requested on: ${formatEmailDate(requestedAt)}` : null,
    reason ? `Reason: ${reason}` : null,
    "",
    `Review this request: ${reviewUrl}`,
    "",
    `On approval the ${itemType} moves to your Trash, where you can still restore it.`,
  ].filter(Boolean).join("\n");

  return {
    subject: `Approval needed: delete "${itemName}"`,
    text,
    html: emailShell({
      badge: "Delete Request",
      bodyHtml: body,
      footerNote: "This email relates to a shared document in your inBuildify S-Drive.",
    }),
  };
}

/**
 * Sent back to whoever raised the request once the owner has answered — the
 * approval flow is silent for them otherwise, and an unanswered request looks
 * identical to a rejected one from the Shared list.
 *
 * @returns {{ subject: string, html: string, text: string }}
 */
export function wrapDriveDeleteDecisionHTML({
  requestedByName = "",
  ownerName = "",
  itemName = "",
  itemType = "file",
  decision = "REJECTED",
  comments = "",
  decidedAt = null,
} = {}) {
  const approved = decision === "APPROVED";
  const headline = approved ? "Delete Request Approved" : "Delete Request Rejected";

  const rows = [
    detailRow(itemType === "folder" ? "Folder" : "File", itemName),
    detailRow("Decided by", ownerName),
    detailRow("Decision", approved ? "Approved" : "Rejected"),
    detailRow("Decided on", formatEmailDate(decidedAt), true),
  ].join("");

  const commentCard = comments
    ? `
            <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 16px 20px; margin-bottom: 24px;">
              <p style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; margin: 0 0 8px;">Owner's Comment</p>
              <p style="font-size: 14px; color: #1e293b; line-height: 1.7; margin: 0; white-space: pre-line;">${esc(comments)}</p>
            </div>`
    : "";

  const outcomeLine = approved
    ? "It has been moved to the owner's Trash and no longer appears in your shared list."
    : "It has not been deleted and remains available to you.";

  const body = `
            <p style="font-size: 15px; color: #475569; margin: 0 0 6px;">Dear ${esc(requestedByName) || "there"},</p>

            <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">${esc(headline)}</h2>

            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
              ${esc(ownerName) || "The owner"} has ${approved ? "approved" : "rejected"} your request to delete the ${esc(itemType)} below.
              ${outcomeLine}
            </p>
            ${detailsCard("Outcome", rows)}
${commentCard}`;

  const text = [
    `Dear ${requestedByName || "there"},`,
    "",
    `${ownerName || "The owner"} has ${approved ? "approved" : "rejected"} your request to delete the ${itemType} "${itemName}".`,
    outcomeLine,
    comments ? `\nOwner's comment: ${comments}` : null,
  ].filter(Boolean).join("\n");

  return {
    subject: `Delete request ${approved ? "approved" : "rejected"}: "${itemName}"`,
    text,
    html: emailShell({
      badge: "Delete Request",
      bodyHtml: body,
      footerNote: "This email relates to a shared document in your inBuildify S-Drive.",
    }),
  };
}

export default {
  formatEmailDate,
  wrapDriveDeleteRequestHTML,
  wrapDriveDeleteDecisionHTML,
};
