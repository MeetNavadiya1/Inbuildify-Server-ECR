/**
 * Templates for the job workflow task emails.
 *
 *   1. wrapTaskAssignmentHTML      — "this task is yours", sent to the assignee.
 *   2. wrapTaskExtensionRequestHTML — extension request, carrying the review link.
 *
 * Both follow the same shell as job-completion-approval.template.js: a 600px
 * card on a #f6f9fc canvas, blue header bar with the inBuildify wordmark and a
 * section badge, a bordered details card of label/value rows, then the footer.
 * Inline CSS only — mail clients ignore <style> and external stylesheets.
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
  if (value === 0) return "0";
  if (value === null || value === undefined) return PLACEHOLDER;
  const str = String(value).trim();
  return str.length ? escapeHtml(str) : PLACEHOLDER;
}

/**
 * House date format for emails — "16 Oct 2026". Matches the completion-approval
 * worker; a bare toLocaleDateString would give the ambiguous "16/10/2026".
 */
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

/** Flatten HTML to readable text for the plain-text alternative of an email. */
export function stripHtml(html) {
  return String(html || "")
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*p\s*>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * The draft message the Request Extension panel opens with.
 *
 * Returned by the context endpoint so the builder sees, and can edit, the
 * wording that will actually be sent — rather than the server composing
 * something they never saw. Mirrors how the engineer mail panel prefills its
 * body from a template.
 */
export function buildDefaultExtensionBody({
  taskName = "",
  jobReference = "",
  requestedByName = "",
} = {}) {
  return [
    "<p>Hello,</p>",
    `<p>I am requesting additional time on the task <strong>${esc(taskName)}</strong>`,
    jobReference ? ` for job <strong>${esc(jobReference)}</strong>` : "",
    ". The details of the request are set out below.</p>",
    "<p>Please review and let me know your decision at your earliest convenience.</p>",
    "<p>Thank you.</p>",
    requestedByName ? `<p>${esc(requestedByName)}</p>` : "",
  ].join("");
}

/**
 * The draft message the "Email assignee" mail panel opens with, so the sender
 * sees and can edit the wording before it goes out.
 */
export function buildDefaultAssignmentBody({
  assigneeName = "",
  taskName = "",
  jobReference = "",
  senderName = "",
} = {}) {
  return [
    `<p>Hi ${esc(assigneeName) || "there"},</p>`,
    `<p>The task <strong>${esc(taskName)}</strong>`,
    jobReference ? ` on job <strong>${esc(jobReference)}</strong>` : "",
    " has been assigned to you. The schedule for it is set out below.</p>",
    "<p>Please let me know if anything looks wrong or if you need more time.</p>",
    "<p>Regards,</p>",
    senderName ? `<p>${esc(senderName)}</p>` : "",
  ].join("");
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

/**
 * The shared shell every workflow email is built from — header bar, body slot,
 * footer. Keeping it in one place is what makes these emails look like one
 * family rather than three separate designs.
 */
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
 * "This task is yours" — sent to a workflow task's assignee.
 *
 * @returns {{ subject: string, html: string, text: string }}
 */
export function wrapTaskAssignmentHTML({
  assigneeName = "",
  taskName = "",
  jobReference = "",
  stageName = "",
  subStageName = "",
  // What the task covers. roleName is only filled for rows assigned the old
  // way (a role and the user holding it), so at most one of the two shows.
  serviceName = "",
  roleName = "",
  durationDays = null,
  startDate = null,
  finishDate = null,
  actualDate = null,
  senderName = "",
  // The message composed in the mail panel. Replaces the generated wording;
  // the shell and the schedule card still wrap it.
  bodyHtml = null,
  // Link to the assignee's "Add Days" page. Omitted, the button is left out.
  addDaysUrl = null,
  maxExtensionDays = null,
  // How many times this task may still be extended, out of how many in total.
  extensionsLeft = null,
  extensionLimit = null,
} = {}) {
  const subject = jobReference
    ? `Task assigned: ${taskName} (Job ${jobReference})`
    : `Task assigned: ${taskName}`;

  const rows = [
    detailRow("Task", taskName),
    detailRow("Job Reference", jobReference),
    detailRow("Stage", stageName),
    detailRow("Sub-stage", subStageName),
    detailRow("Service", serviceName),
    detailRow("Role", roleName),
    detailRow("Duration", durationDays ? `${durationDays} days` : null),
    detailRow("Estimated start", startDate),
    detailRow("Estimated finish", finishDate),
    detailRow("Completed on", actualDate, true),
  ].join("");

  const messageHtml = bodyHtml
    ? `<div style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">${bodyHtml}</div>`
    : `
            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
              The workflow task below has been assigned to you${jobReference ? ` on job <strong>${esc(jobReference)}</strong>` : ""}.
              The details are as recorded in the project schedule.
            </p>`;

  // A composed message carries its own sign-off, so the generated one would
  // duplicate it.
  const signOff = bodyHtml
    ? ""
    : `
            <p style="font-size: 14px; color: #475569; margin: 0 0 4px;">Regards,</p>
            ${senderName ? `<p style="font-size: 14px; font-weight: 600; color: #1e293b; margin: 0;">${esc(senderName)}</p>` : ""}`;

  // Need more time? The assignee asks for it straight from the email — this is
  // the point of sending them the schedule in the first place.
  // How many goes are left. Stated up front so the assignee spends them
  // knowingly rather than finding out at the third attempt.
  const chancesLine = extensionsLeft !== null && extensionLimit !== null
    ? `
            <p style="font-size: 13px; color: #64748b; margin: 0 0 16px;">
              You have <strong>${esc(extensionsLeft)}</strong> of ${esc(extensionLimit)} extension${extensionLimit === 1 ? "" : "s"} left on this task.
            </p>`
    : "";

  const addDaysBlock = addDaysUrl
    ? `
            <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">
              Need more time on this task? Add extra days${maxExtensionDays ? ` — up to <strong>${esc(maxExtensionDays)}</strong> more, taking it to ${esc((durationDays || 0) + maxExtensionDays)} days in total` : ""}:
            </p>
${chancesLine}
            ${ctaButton(addDaysUrl, "Add Days")}`
    : "";

  const body = `
            <p style="font-size: 15px; color: #475569; margin: 0 0 6px;">Dear ${esc(assigneeName) || "there"},</p>

            <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Task Assigned To You</h2>
${messageHtml}
            ${detailsCard("Task Schedule", rows)}
${addDaysBlock}
${signOff}`;

  const text = [
    `Dear ${assigneeName || "there"},`,
    "",
    bodyHtml ? stripHtml(bodyHtml) : "The workflow task below has been assigned to you.",
    "",
    `Task: ${taskName}`,
    jobReference ? `Job Reference: ${jobReference}` : null,
    stageName ? `Stage: ${stageName}` : null,
    subStageName ? `Sub-stage: ${subStageName}` : null,
    serviceName ? `Service: ${serviceName}` : null,
    roleName ? `Role: ${roleName}` : null,
    durationDays ? `Duration: ${durationDays} days` : null,
    startDate ? `Estimated start: ${startDate}` : null,
    finishDate ? `Estimated finish: ${finishDate}` : null,
    actualDate ? `Completed on: ${actualDate}` : null,
    addDaysUrl ? "" : null,
    addDaysUrl
      ? `Need more time? Add extra days${maxExtensionDays ? ` (up to ${maxExtensionDays})` : ""}: ${addDaysUrl}`
      : null,
    addDaysUrl && extensionsLeft !== null && extensionLimit !== null
      ? `You have ${extensionsLeft} of ${extensionLimit} extension${extensionLimit === 1 ? "" : "s"} left on this task.`
      : null,
    bodyHtml ? null : "",
    bodyHtml ? null : "Regards,",
    bodyHtml ? null : (senderName || null),
  ].filter(v => v !== null).join("\n");

  return {
    subject,
    text,
    html: emailShell({
      badge: "Task Assignment",
      bodyHtml: body,
      footerNote: "This email relates to a task on your construction project workflow.",
    }),
  };
}

/**
 * Extension request — sent to each selected recipient with the review link.
 *
 * The recipient decides the days actually granted on the linked page, so the
 * email states the request as a proposal rather than a foregone conclusion.
 */
export function wrapTaskExtensionRequestHTML({
  recipientName = "",
  taskName = "",
  jobReference = "",
  stageName = "",
  currentDurationDays = null,
  requestedDays = null,
  maxDays = null,
  reason = "",
  reviewUrl = "#",
  requestedByName = "",
  // The message the builder composed in the panel, as HTML. When present it
  // replaces the generated wording — they have already seen and edited it, so
  // re-writing it here would throw their edits away. The branded shell, details
  // card and review button still wrap it, which is what keeps every one of
  // these emails looking the same.
  bodyHtml = null,
} = {}) {
  const rows = [
    detailRow("Task", taskName),
    detailRow("Job Reference", jobReference),
    detailRow("Stage", stageName),
    detailRow("Current duration", currentDurationDays ? `${currentDurationDays} days` : null),
    detailRow("Extension requested", requestedDays ? `${requestedDays} days` : null),
    detailRow("Maximum allowed", maxDays ? `${maxDays} days` : null, true),
  ].join("");

  // The builder's own message, or the generated wording when they left it be.
  const messageHtml = bodyHtml
    ? `<div style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">${bodyHtml}</div>`
    : `
            <p style="font-size: 14px; color: #475569; line-height: 1.7; margin: 0 0 24px;">
              ${esc(requestedByName) || "A builder"} has requested more time on the workflow task below${jobReference ? ` for job <strong>${esc(jobReference)}</strong>` : ""}.
              You can approve the number of days requested, grant a different number up to the maximum shown, or reject the request.
            </p>`;

  // Only shown when the wording was generated — a composed message already
  // says why, so repeating it verbatim underneath reads like a mistake.
  const reasonCard = bodyHtml || !reason
    ? ""
    : `
            <div style="background-color: #f8fafc; border-radius: 8px; border: 1px solid #e2e8f0; padding: 16px 20px; margin-bottom: 24px;">
              <p style="font-size: 12px; color: #64748b; text-transform: uppercase; letter-spacing: 0.6px; font-weight: 700; margin: 0 0 8px;">Reason Given</p>
              <p style="font-size: 14px; color: #1e293b; line-height: 1.7; margin: 0; white-space: pre-line;">${esc(reason)}</p>
            </div>`;

  const body = `
            <p style="font-size: 15px; color: #475569; margin: 0 0 6px;">Dear ${esc(recipientName) || "there"},</p>

            <h2 style="font-size: 18px; font-weight: 700; color: #1e293b; margin: 20px 0 10px; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Extension Requested</h2>
${messageHtml}
            ${detailsCard("Request Details", rows)}
${reasonCard}
            <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">
              Please review the request and record your decision:
            </p>
            ${ctaButton(reviewUrl, "Review Request")}

            <p style="font-size: 13px; color: #94a3b8; margin: 0;">The first response received decides this request. Once approved, the task and every date that follows it are rescheduled automatically.</p>`;

  const text = [
    `Dear ${recipientName || "there"},`,
    "",
    bodyHtml
      ? stripHtml(bodyHtml)
      : `${requestedByName || "A builder"} has requested ${requestedDays} more days on the task "${taskName}".`,
    jobReference ? `Job Reference: ${jobReference}` : null,
    stageName ? `Stage: ${stageName}` : null,
    currentDurationDays ? `Current duration: ${currentDurationDays} days` : null,
    maxDays ? `Maximum allowed: ${maxDays} days` : null,
    "",
    `Reason: ${reason}`,
    "",
    `Review this request: ${reviewUrl}`,
    "",
    "You can approve the days requested, grant a different number up to the maximum, or reject.",
    "The first response received decides this request.",
  ].filter(Boolean).join("\n");

  const subject = jobReference
    ? `Extension request: ${taskName} (Job ${jobReference})`
    : `Extension request: ${taskName}`;

  return {
    subject,
    text,
    html: emailShell({
      badge: "Extension Request",
      bodyHtml: body,
      footerNote: "This email relates to a schedule extension on your construction project.",
    }),
  };
}

export default {
  formatEmailDate,
  stripHtml,
  buildDefaultAssignmentBody,
  buildDefaultExtensionBody,
  wrapTaskAssignmentHTML,
  wrapTaskExtensionRequestHTML,
};
