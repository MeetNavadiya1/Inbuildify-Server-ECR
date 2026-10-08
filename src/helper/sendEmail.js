import sendEmail from "../service/sendMail.service.js";
import { wrapAuthEmailHTML } from "../templates/auth-email.template.js";

export async function sendPasswordEmail(email, loginId, password) {
  try {
    const subject = "Your Login Credentials";
    const text = `
Your login credentials have been updated.

Login ID: ${loginId}
Password: ${password}

Please log in and change your password if required.
    `;
    const html = wrapAuthEmailHTML({
      subject,
      pillText: "Credentials",
      bodyHtml: `
        <p style="margin: 0 0 16px;">Your login credentials have been updated. You can use the details below to access your account:</p>
        <div style="margin: 24px 0; padding: 20px; background-color: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0;">
          <p style="margin: 0 0 12px; font-size: 15px; color: #1e293b;"><strong>Login ID:</strong> <span style="font-family: monospace; font-size: 16px;">${loginId}</span></p>
          <p style="margin: 0; font-size: 15px; color: #1e293b;"><strong>Password:</strong> <span style="font-family: monospace; font-size: 16px;">${password}</span></p>
        </div>
        <p style="margin: 16px 0 0; color: #64748b; font-size: 14px;">Please log in and change your password if required.</p>
      `
    });
    const result = await sendEmail(email, subject, text, html);
    return result;
  } catch (error) {
    console.error(`Failed to send password email to ${email}:`, error);
    throw error;
  }
}

export async function sendLoginIdEmail(email, loginId) {
  try {
    const subject = "Your Login ID Has Changed";
    const text = `
Your login ID has been changed.

New Login ID: ${loginId}

If you did not request this change, please contact support.
    `;
    const html = wrapAuthEmailHTML({
      subject,
      pillText: "Account Update",
      bodyHtml: `
        <p style="margin: 0 0 16px;">Your login ID has been successfully changed.</p>
        <div style="margin: 24px 0; padding: 20px; background-color: #f1f5f9; border-radius: 8px; border: 1px solid #e2e8f0;">
          <p style="margin: 0; font-size: 15px; color: #1e293b;"><strong>New Login ID:</strong> <span style="font-family: monospace; font-size: 16px;">${loginId}</span></p>
        </div>
        <p style="margin: 16px 0 0; color: #64748b; font-size: 14px;">If you did not request this change, please contact support immediately.</p>
      `
    });
    const result = await sendEmail(email, subject, text, html);
    return result;
  } catch (error) {
    console.error(`Failed to send login ID email to ${email}:`, error);
    throw error;
  }
}

export default {
  sendPasswordEmail,
  sendLoginIdEmail,
};
