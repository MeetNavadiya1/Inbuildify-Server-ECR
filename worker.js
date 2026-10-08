import "./src/utils/overrideConsole.js";
import { connectPostgre } from "./src/config/postgre.connect.js";
import { warmupBrowser } from "./src/modules/quotation/pdf.service.js";

import emailQueue from "./src/queues/emailQueue.js";
import pdfQueue from "./src/queues/pdfQueue.js";
import sampleDataQueue from "./src/queues/sampleDataQueue.js";
import jobAutomationQueue from "./src/queues/jobAutomationQueue.js";

import { register as registerNotification } from "./src/processors/notificationProcessor.js";
import { register as registerQuoteApprovedEmail } from "./src/processors/quoteApprovedEmailProcessor.js";
import { register as registerEngineerEmail } from "./src/processors/engineerEmailProcessor.js";
import { register as registerAppointmentEmail } from "./src/processors/appointmentEmailProcessor.js";
import { register as registerWelcomeEmail } from "./src/processors/welcomeEmailProcessor.js";
import { register as registerPdfGeneration } from "./src/processors/pdfGenerationProcessor.js";
import { register as registerQuotationEmail } from "./src/processors/quotationEmailProcessor.js";
import { register as registerSampleDataImport } from "./src/processors/sampleDataImportProcessor.js";
import { register as registerJobAutomation, scheduleRecurring as scheduleJobAutomation } from "./src/processors/jobAutomationProcessor.js";

connectPostgre()
  .then(() => {
    // emailQueue — all email delivery jobs (I/O-bound)
    registerNotification(emailQueue);
    registerQuoteApprovedEmail(emailQueue);
    registerEngineerEmail(emailQueue);
    registerAppointmentEmail(emailQueue);
    registerWelcomeEmail(emailQueue);

    // pdfQueue — all PDF generation jobs (CPU-heavy, Puppeteer)
    registerPdfGeneration(pdfQueue);
    registerQuotationEmail(pdfQueue);

    // sampleDataQueue — long-running demo data clone (DB + S3 heavy)
    registerSampleDataImport(sampleDataQueue);

    // jobAutomationQueue — daily Settings → Job auto-archive sweep
    registerJobAutomation(jobAutomationQueue);
    scheduleJobAutomation(jobAutomationQueue);

    warmupBrowser();
    console.log("Worker process started and listening for jobs...");
  })
  .catch((err) => {
    console.error("Worker: Could not connect to database:", err);
    process.exit(1);
  });

const cleanupAndExit = async (err) => {
  if (err) {
    console.error("Worker: Unhandled error, shutting down:", err);
  }
  console.log("Worker: Gracefully closing Redis connections...");
  try {
    await Promise.all([
      emailQueue.close(),
      pdfQueue.close(),
      sampleDataQueue.close(),
      jobAutomationQueue.close(),
    ]);
    console.log("Worker: Redis connections closed.");
  } catch (error) {
    console.error("Worker: Error closing Redis connections:", error);
  }
  process.exit(err ? 1 : 0);
};

process.on("SIGINT", () => cleanupAndExit());
process.on("SIGTERM", () => cleanupAndExit());
process.on("SIGUSR2", () => cleanupAndExit());
process.on("uncaughtException", (err) => cleanupAndExit(err));
process.on("unhandledRejection", (reason) => cleanupAndExit(reason));
