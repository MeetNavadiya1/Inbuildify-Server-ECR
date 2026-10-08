import db, { initModels } from "../config/database/models/postgre-models/index.js";
import { env } from "../config/env.config.js";

const seedEmailTemplates = async () => {
  try {
    console.log("🌱 Starting email_templates seeding...");

    // Initialize Sequelize models
    await initModels();
    const { EmailTemplates } = db;

    const templates = [
      {
        template_key: "password_reset",
        category: "Authentication",
        subject: "CRMSimplify - Password Reset Request",
        title: "Reset Your Password",
        message: `Hello,<br/><br/>We received a request to reset your CRMSimplify account password. 
        For your account's security, this link will remain active for the next <b>10 minutes</b>. 
        Please click the button below to securely create a new password and regain access to your account.<br/><br/>
        If you did not make this request, please contact our support team immediately so we can help safeguard your account.`,
        cta_text: "Reset Password",
        cta_link: `${env.EMAIL.FRONTEND_BASE_URL}/auth/reset-password?token=\${resetPasswordToken}&email=\${email}`,
      },
      {
        template_key: "invite_user",
        category: "User Onboarding",
        subject: "You're Invited to Join CRMSimplify",
        title: "Welcome to CRMSimplify",
        message: `Hi,<br/><br/>You have been invited to join <b>CRMSimplify</b>. 
        This platform will help streamline project communication, manage contractors, and track client progress seamlessly. 
        Please click the button below to accept your invitation and set up your account.<br/><br/>
        Once your account is set up, you'll be able to collaborate, track updates, and access all tools provided by your team.`,
        cta_text: "Accept Invitation",
        cta_link: `${env.EMAIL.FRONTEND_BASE_URL}/auth/accept-invite?token=\${inviteToken}&email=\${email}`,
      },
      {
        template_key: "quote_accepted",
        category: "Project",
        subject: "Your Quote Has Been Accepted",
        title: "Quote Accepted – Next Steps",
        message: `Hello,<br/><br/>Great news! Your quote has been accepted by the client. 
        You can now proceed with the next steps of the project planning process. 
        Please log in to your CRMSimplify dashboard to review the project details, confirm timelines, and start working with your client.<br/><br/>
        Our system ensures all communication and documentation are stored securely for easy access throughout the project.`,
        cta_text: "View Project",
        cta_link: `${env.EMAIL.FRONTEND_BASE_URL}/dashboard/projects/\${projectId}`,
      },
      {
        template_key: "new_message",
        category: "Communication",
        subject: "You Have a New Message",
        title: "New Message Notification",
        message: `Hello,<br/><br/>You have received a new message in your CRMSimplify account. 
        Staying updated helps ensure smoother collaboration and faster progress. 
        Please click below to log in and check the message details.<br/><br/>
        Keeping all communication within CRMSimplify ensures that nothing gets lost in emails or calls.`,
        cta_text: "Read Message",
        cta_link: `${env.EMAIL.FRONTEND_BASE_URL}/dashboard/messages/\${messageId}`,
      },
      {
        template_key: "payment_confirmation",
        category: "Payments",
        subject: "Payment Confirmation – CRMSimplify",
        title: "Payment Successful",
        message: `Hello,<br/><br/>We are pleased to confirm that we have received your payment for the project.
        The payment details have been securely recorded in your CRMSimplify account.<br/><br/>
        You can log in to your dashboard anytime to view invoices, track payment history, and manage your financial records.`,
        cta_text: "View Invoice",
        cta_link: `${env.EMAIL.FRONTEND_BASE_URL}/dashboard/payments/\${paymentId}`,
      },
      {
        template_key: "quotation_send",
        category: "Quotation",
        subject: "Your Quotation is Ready – InBuildify",
        title: "Your Quotation is Ready",
        message: `Hello,<br/><br/>Thank you for your interest. Your quotation has been prepared and is ready for your review.<br/><br/>
        Please click the button below to view your quotation details and proceed with the signing process.<br/><br/>
        This link is securely generated and contains your quotation information. If you did not request this, please ignore this email.`,
        cta_text: "View Quotation",
        cta_link: `${env.EMAIL.FRONTEND_BASE_URL}/quotation/view?token=\${secureToken}`,
      },
    ];

    for (const template of templates) {
      const [record, created] = await EmailTemplates.findOrCreate({
        where: { template_key: template.template_key },
        defaults: template,
      });

      if (created) {
        console.log(`✅ Created email template: ${template.template_key}`);
      } else {
        console.log(`ℹ️ Email template already exists: ${template.template_key}`);
      }
    }

    console.log("✅ Email templates seeding completed.");
  } catch (error) {
    console.error("❌ Seeding failed:", error);
  } finally {
    if (db.sequelize) {
      await db.sequelize.close();
    }
    process.exit(0);
  }
};

seedEmailTemplates();
