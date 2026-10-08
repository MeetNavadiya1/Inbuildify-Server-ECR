export function wrapAuthEmailHTML({ subject = "", bodyHtml = "", pillText = "" } = {}) {
  const esc = (value) => {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f6f9fc; padding: 40px 10px; margin: 0;">
      <table border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 12px rgba(0,0,0,0.05); border: 1px solid #eef2f5;">
        <tr>
          <td style="background-color: #0056b3; padding: 28px 40px;">
            <table border="0" cellpadding="0" cellspacing="0" width="100%">
              <tr>
                <td><span style="font-size: 24px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">inBuildify</span></td>
                <td style="text-align: right;"><span style="font-size: 11px; font-weight: 700; color: #d6e7f8; text-transform: uppercase; letter-spacing: 1px; background-color: rgba(255,255,255,0.15); padding: 4px 10px; border-radius: 4px;">${esc(pillText)}</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td style="padding: 36px 40px 30px;">
            ${subject ? `<h2 style="font-size: 20px; font-weight: 700; color: #1e293b; margin: 0 0 18px; line-height: 1.3;">${esc(subject)}</h2>` : ""}
            <div style="font-size: 15px; color: #475569; line-height: 1.6;">${bodyHtml}</div>
          </td>
        </tr>
        <tr>
          <td style="background-color: #f8fafc; padding: 28px 40px; text-align: center; border-top: 1px solid #eef2f5;">
            <p style="font-size: 12px; color: #94a3b8; margin: 0 0 8px;">This is an automated message. Please do not reply directly to this email.</p>
            <p style="font-size: 12px; font-weight: 600; color: #64748b; margin: 0;"><strong>inBuildify</strong> | Modern Construction &amp; CRM Solutions</p>
          </td>
        </tr>
      </table>
    </div>`;
}

export default wrapAuthEmailHTML;
