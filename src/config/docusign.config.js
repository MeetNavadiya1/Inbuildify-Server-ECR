import { env } from "./env.config.js";

const docusignConfig = {
  basePath: env.DOCUSIGN.BASE_URL,
  oAuthBasePath: env.DOCUSIGN.OAUTH_BASE_PATH,
  clientId: env.DOCUSIGN.CLIENT_ID,
  userId: env.DOCUSIGN.USER_ID,
  rsaKey: env.DOCUSIGN.RSA_KEY,
  webhookUrl: env.DOCUSIGN.WEBHOOK_URL,
  webhookSecret: env.DOCUSIGN.WEBHOOK_SECRET,
  signingRedirectUrl: env.DOCUSIGN.SIGNING_REDIRECT_URL,
  expirationDays: env.DOCUSIGN.EXPIRATION_DAYS,

  defaultEmailSubject: {
    quotation: "Please review and sign your quotation",
  },
  defaultEmailMessage: {
    quotation: "Please review the attached quotation and sign it at your earliest convenience.",
  },
};

export default docusignConfig;
