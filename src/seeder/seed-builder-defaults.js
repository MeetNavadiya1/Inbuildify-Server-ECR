/**
 * Master orchestrator — seeds all default settings for a new builder.
 * Called from registerRoot in auth.service.js within the same transaction.
 */

import db, { initModels } from "../config/database/models/postgre-models/index.js";
import { seedGeneralSettings } from "./seed-general-settings.js";
import { seedPriceList } from "./seed-price-list.js";
import { seedSalesModuleSettings } from "./seed-sales-module-settings.js";
import { seedQuotationSettings } from "./seed-quotation-settings.js";
import { seedLeadLostReasons } from "./seed-lead-lost-reasons.js";
import { seedHouseLandPackageSettings } from "./seed-house-land-package-settings.js";
import { seedJobSettings } from "./seed-job-settings.js";
import { seedJobColorSettings } from "./seed-job-color-settings.js";
import { seedJobWorkflowSettings } from "./seed-job-workflow-settings.js";
import { seedJobInvoiceSettings } from "./seed-job-invoice-settings.js";
import { seedJobVariationSettings } from "./seed-job-variation-settings.js";
import { seedJobCommissionSettings } from "./seed-job-commission-settings.js";
import { seedJobProcessStages } from "./seed-job-process-stages.js";
import { seedMaintenanceSettings } from "./seed-maintenance-settings.js";
import { seedConstructionSettings } from "./seed-construction-settings.js";
import { seedPasswordPolicy } from "./seed-password-policy.js";
import { seedPortalSettings } from "./seed-portal-settings.js";
import { seedIntegrationSettings } from "./seed-integration-settings.js";
import { seedTemplateEmailSignature } from "./seed-template-email-signature.js";
import { seedSchedulerSettings } from "./seed-scheduler-settings.js";
import { seedConstructionEtsRecharge } from "./seed-construction-ets-recharge.js";
import { seedConstructionOhsSettings } from "./seed-construction-ohs-settings.js";
import { seedRecalculateDate } from "./seed-recalculate-date.js";
import { seedDocumentFolderMapping } from "./seed-document-folder-mapping.js";
import { seedDocumentFileNamingFormat } from "./seed-document-file-naming-format.js";
import { seedTemplateEmail } from "./seed-template-email.js";
import { seedInitialPdfTemplates } from "./template-pdf.seed.js";
import { seedNotificationTemplate } from "./seed-notification-template.js";

/**
 * Seeds all default settings for a newly registered builder.
 * Runs within the caller's transaction (uses the provided client).
 *
 * @param {Object} params
 * @param {string|null} params.company_id
 * @param {string} params.builder_id
 * @param {string} params.created_by - users_id of the root user
 * @param {Object} params.transaction - Sequelize transaction
 */
export async function seedBuilderDefaults({ company_id, builder_id, created_by, transaction }) {
  const ctx = { company_id, builder_id, created_by, transaction };

  console.log("🌱 Seeding default settings for builder:", builder_id);

  // 1. General Settings
  await seedGeneralSettings(ctx);

  // 2. Sales Module Settings
  await seedSalesModuleSettings(ctx);

  // 3. Quotation Settings
  await seedQuotationSettings(ctx);

  // 4. House & Land Package Settings
  await seedHouseLandPackageSettings(ctx);

  // 5. Job Settings
  await seedJobSettings(ctx);

  // 6. Job Color Settings
  await seedJobColorSettings(ctx);

  // 7. Job Workflow Settings
  await seedJobWorkflowSettings(ctx);

  // 8. Job Invoice Settings
  await seedJobInvoiceSettings(ctx);

  // 9. Job Variation Settings
  await seedJobVariationSettings(ctx);

  // 10. Job Commission Settings
  await seedJobCommissionSettings(ctx);

  // 10.1 Job Process Stages (default 5 stages)
  await seedJobProcessStages(ctx);

  // 11. Maintenance Settings
  await seedMaintenanceSettings(ctx);

  // 12. Construction Settings
  await seedConstructionSettings(ctx);

  // 13. Password Policy
  await seedPasswordPolicy(ctx);

  // 14. Portal Settings
  await seedPortalSettings(ctx);

  // 15. Integration Settings
  await seedIntegrationSettings(ctx);

  // 16. Template Email Signature
  await seedTemplateEmailSignature(ctx);

  // 17. Scheduler Settings
  await seedSchedulerSettings(ctx);

  // 18. Construction ETS Recharge
  await seedConstructionEtsRecharge(ctx);

  // 19. Construction OHS Settings
  await seedConstructionOhsSettings(ctx);

  // 20. Recalculate Date
  await seedRecalculateDate(ctx);

  // 21. Document Folder Mapping
  await seedDocumentFolderMapping(ctx);

  // 19. Document File Naming Format
  await seedDocumentFileNamingFormat(ctx);

  // 20. Template Email
  await seedTemplateEmail(ctx);

  // 21. PDF Templates (existing seeder)
  await seedInitialPdfTemplates({ company_id, builder_id, created_by, transaction });

  // 22. Price List (Base Price) and default Price List Item
  await seedPriceList(ctx);

  // 23. Lead Lost Reasons
  await seedLeadLostReasons(ctx);

  // 23. Notification Templates
  await seedNotificationTemplate(ctx);

  console.log("✅ All default settings seeded for builder:", builder_id);

}

// ── Standalone runner ──
// Run directly:  node src/seeder/seed-builder-defaults.js
if (process.argv[1] && (import.meta.url === `file://${process.argv[1]}` || import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/")))) {
  (async () => {
    try {
      await initModels();
      const { Builder } = db;

      const builders = await Builder.findAll();
      if (!builders.length) {
        console.log("ℹ️ No builders found — nothing to seed.");
        return;
      }

      for (const builder of builders) {
        console.log(`\n🏗️  Processing builder: ${builder.name} (${builder.builder_id})`);
        await seedBuilderDefaults({
          company_id: builder.company_id,
          builder_id: builder.builder_id,
          created_by: null,
          transaction: null,
        });
      }

      console.log("\n🏁 All builder defaults seeded successfully.");
    } catch (error) {
      console.error("❌ Seeding failed:", error);
    } finally {
      if (db.sequelize) {
        await db.sequelize.close();
      }
      process.exit(0);
    }
  })();
}

export default { seedBuilderDefaults };
