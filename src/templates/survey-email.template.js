/**
 * Branded wrapper for the "Survey invitation" email sent to a lead/contact.
 *
 * The recipient clicks the CTA which opens the public survey page (no login),
 * secured by a per-response access token embedded in the link.
 * Inline CSS only — email clients ignore <style>/external CSS.
 */

function esc(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object} opts
 * @param {string} opts.recipientName  lead/contact name (greeting)
 * @param {string} opts.surveyName     survey template name
 * @param {string} opts.surveyUrl      public tokenized link to answer the survey
 * @param {string} [opts.companyName]  builder/company name shown in header + footer
 * @returns {string} full HTML email
 */
export function wrapSurveyEmailHTML({ recipientName = "", surveyName = "", surveyUrl = "", companyName = "inBuildify" } = {}) {
  const greeting = recipientName ? `Hi ${esc(recipientName)},` : "Hi,";

  return `
  <div style="margin:0; padding:0; background-color:#f1f5f9;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9; padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-radius:12px; overflow:hidden; font-family:Arial,Helvetica,sans-serif;">
            <tr>
              <td style="background-color:#0f172a; padding:24px 32px;">
                <span style="color:#ffffff; font-size:20px; font-weight:700;">${esc(companyName)}</span>
              </td>
            </tr>
            <tr>
              <td style="padding:32px;">
                <p style="margin:0 0 16px; font-size:16px; color:#1e293b;">${greeting}</p>
                <p style="margin:0 0 16px; font-size:14px; line-height:1.6; color:#334155;">
                  We'd love your feedback. Please take a moment to complete our survey
                  <strong>"${esc(surveyName)}"</strong>. It only takes a few minutes.
                </p>
                <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
                  <tr>
                    <td style="border-radius:8px; background-color:#2563eb;">
                      <a href="${esc(surveyUrl)}" target="_blank"
                        style="display:inline-block; padding:14px 32px; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none;">
                        Start Survey
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:0 0 8px; font-size:12px; color:#64748b;">
                  If the button doesn't work, copy and paste this link into your browser:
                </p>
                <p style="margin:0; font-size:12px; word-break:break-all;">
                  <a href="${esc(surveyUrl)}" target="_blank" style="color:#2563eb;">${esc(surveyUrl)}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px; border-top:1px solid #e2e8f0; font-size:12px; color:#94a3b8;">
                &copy; ${esc(companyName)}. This is an automated message, please do not reply.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </div>`;
}

export default { wrapSurveyEmailHTML };
