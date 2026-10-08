/**
 * HTML for the Building Contract PDF (Job → Custom Documents → Building
 * Contract → Preview). All data comes from the building_contracts DB row.
 *
 * Restyled onto the shared PDF design system (utils/pdfDesignSystem.js) so it
 * matches the rest of the InBuildify document family — the Payment Receipt /
 * TAX INVOICE, Variation, Invoice, Colour Selection and Engineer PDFs. That
 * means the amber `#f59e0b` accent (this document used its own `#e07b2a`), the
 * inlined InBuildify logo header, section rules, card surfaces, key/value rows,
 * amber-underlined tables, a totals block and the repeating page footer with
 * page numbers.
 *
 * Rendered by `pdf.service.generatePDF` (headless Chrome), which injects the
 * watermark + print rules, aborts every http(s) request (so the logo is inlined
 * and there are no remote fonts) and lifts `.pdf-footer` into the bottom page
 * margin. Page margins come from page.pdf(), hence no page padding here.
 *
 * @param {object} contract - a building_contracts row (snake_case, as stored)
 * @returns {string} HTML string ready for Puppeteer
 */
import {
  renderPdfDocument,
  brandHeader,
  brandLogoHtml,
  pdfDivider,
  sectionHeader,
  card,
  infoList,
  infoRow,
  docMetaLine,
  pdfTable,
  totalsBlock,
  pdfFooter,
  esc,
} from "../utils/pdfDesignSystem.js";

const DASH = "—";

/** Present a stored value, or the em-dash placeholder when it is blank. */
const v = (val) => {
  if (val === null || val === undefined) {
    return DASH;
  }
  const text = String(val).trim();
  return text === "" ? DASH : text;
};

/** Parse a stored money/number string ("8,000", "10.00") to a number, or null. */
const toNum = (val) => {
  if (val === null || val === undefined || String(val).trim() === "") {
    return null;
  }
  const n = Number(String(val).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
};

/**
 * Money columns are free-text on the form, so a non-numeric entry is shown as
 * typed rather than silently zeroed — and a blank one reads "—" instead of the
 * bare "$—" the previous template produced.
 */
const money = (val) => {
  const n = toNum(val);
  if (n !== null) {
    return `$${n.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return v(val);
};

const percent = (val) => {
  const n = toNum(val);
  return n === null ? DASH : `${n}%`;
};

const days = (val) => {
  const n = toNum(val);
  if (n === null) {
    return DASH;
  }
  return `${n} ${n === 1 ? "day" : "days"}`;
};

/** Matches the date format the Variation PDF prints. */
const fmtDate = (val) => {
  if (!val) {
    return DASH;
  }
  const dt = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(dt.getTime())) {
    return v(val);
  }
  return dt.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
};

const bool = (val) => (val ? "Yes" : "No");

/** 'yes'/'no' come off the checklist radios; anything else prints as entered. */
const answerLabel = (value) => {
  const text = String(value ?? "").trim();
  if (text.toLowerCase() === "yes") {
    return "Yes";
  }
  if (text.toLowerCase() === "no") {
    return "No";
  }
  // A checklist answer is always a plain string, so a date arrives as the ISO
  // value the form stored. Print it the way the question asks for it.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const [year, month, day] = text.split("-");
    return `${day}/${month}/${year}`;
  }
  return text === "" ? DASH : text;
};

export function buildingContractHtml(contract) {
  const stages = Array.isArray(contract.progress_payment_stages) ? contract.progress_payment_stages : [];
  const specialConditions = Array.isArray(contract.special_conditions) ? contract.special_conditions : [];
  const checklistAnswers = Array.isArray(contract.checklist_answers) ? contract.checklist_answers : [];

  const reference = contract.building_contract_id
    ? String(contract.building_contract_id).slice(0, 8).toUpperCase()
    : DASH;

  // ── Header ─────────────────────────────────────────────────────────────────
  const header = brandHeader({
    logoHtml: brandLogoHtml(),
    title: "BUILDING CONTRACT",
    subtitle: "Domestic Building Contract (Major Domestic Building Contract)",
    metaHtml:
      docMetaLine("Reference", reference) +
      docMetaLine("Signed", fmtDate(contract.contract_signed_date)) +
      docMetaLine("Expires", fmtDate(contract.contract_expiry_date)),
  });

  // ── Parties ────────────────────────────────────────────────────────────────
  const partiesGrid = `
    <div class="pdf-grid-2">
      ${card({
    title: "Customer Contact",
    bodyHtml: infoList(
      infoRow("Home Telephone", v(contract.home_telephone)) +
          infoRow("Business Telephone", v(contract.business_telephone)),
    ),
  })}
      ${card({
    title: "Company & Surveyor",
    bodyHtml: infoList(
      infoRow("Company Name", v(contract.company_name)) +
          infoRow("ABN", v(contract.abn)) +
          infoRow("Surveyor Name", v(contract.surveyor_name)),
    ),
  })}
    </div>`;

  // ── Land ───────────────────────────────────────────────────────────────────
  const landSection = `
    ${sectionHeader("Land Details")}
    ${card({
    plain: true,
    bodyHtml: infoList(
      infoRow("Site Address", v(contract.site_address)) +
        infoRow("Volume Number", v(contract.volume_number)) +
        infoRow("Folio Number", v(contract.folio_number)) +
        infoRow("Plan of Subdivision Number", v(contract.plan_of_subdivision_number)) +
        infoRow("Covenants / Restrictions / Easements", v(contract.covenants_restrictions_easements)),
    ),
  })}`;

  // ── Building period ────────────────────────────────────────────────────────
  const buildingPeriodSection = `
    ${sectionHeader("Building Period")}
    ${card({
    plain: true,
    bodyHtml: `
      <div class="pdf-grid-2" style="margin-bottom:0;">
        ${infoList(
    infoRow("Actual Building Period", days(contract.actual_building_period)) +
            infoRow("Delay — Weather", days(contract.delay_weather)) +
            infoRow("Delay — Breaks", days(contract.delay_breaks)),
  )}
        ${infoList(
    infoRow("Delay — Nature", days(contract.delay_nature)) +
            infoRow("Total Building Period", days(contract.total_building_period), { accent: true }),
  )}
      </div>`,
  })}`;

  // ── Works & fees ───────────────────────────────────────────────────────────
  const worksSection = `
    ${sectionHeader("Building Works & Fees")}
    ${card({
    plain: true,
    bodyHtml: `
      <div class="pdf-grid-2" style="margin-bottom:0;">
        ${infoList(
    infoRow("Garage Size", v(contract.garage_size)) +
            infoRow("Spec Pages Count", v(contract.spec_pages_count)) +
            infoRow("Number of Pages of Plans", v(contract.number_of_pages_of_plans)) +
            infoRow("Paying Planning Approval", v(contract.paying_planning_approval)) +
            infoRow("Planning Approval Days", days(contract.planning_approval_days)) +
            infoRow("Paying Builder Permit", v(contract.paying_builder_permit)) +
            infoRow("Builder Permit Days", days(contract.builder_permit_days)),
  )}
        ${infoList(
    infoRow("Contract Ended", percent(contract.contract_ended_percent)) +
            infoRow("Progress Payment Days", days(contract.progress_payment_days)) +
            infoRow("Late Interest", v(contract.late_interest)) +
            infoRow("Late Completion", v(contract.late_completion)) +
            infoRow("Extra Work", percent(contract.extra_work_percent)) +
            infoRow("Delay Damage", v(contract.delay_damage)) +
            infoRow("Bedrooms", v(contract.bedroom)),
  )}
      </div>`,
  })}`;

  // ── Lending + insurer ──────────────────────────────────────────────────────
  const lendingSection = `
    ${sectionHeader("Lending & Insurance")}
    <div class="pdf-grid-2">
      ${card({
    title: "Lending Info",
    bodyHtml: infoList(
      infoRow("Lending Body", v(contract.lending_body)) +
          infoRow("Lending Address", v(contract.lending_address)) +
          infoRow("Finance Amount", money(contract.lending_finance_amount)) +
          infoRow("Approval Days", days(contract.lending_approval_days)),
    ),
  })}
      ${card({
    title: "Building Insurer",
    bodyHtml: infoList(
      infoRow("Insurer", v(contract.insurer)) +
          infoRow("Address 1", v(contract.insurer_address1)) +
          infoRow("Address 2", v(contract.insurer_address2)) +
          infoRow("State", v(contract.insurer_state)) +
          infoRow("Postcode", v(contract.postcode)) +
          infoRow("Phone", v(contract.phone)) +
          infoRow("Name of Insured", v(contract.name_of_insured)),
    ),
  })}
    </div>`;

  // ── Price + deposit ────────────────────────────────────────────────────────
  const priceSection = `
    ${sectionHeader("Contract Price")}
    <div class="pdf-grid-2">
      ${card({
    title: "Price",
    bodyHtml: infoList(
      infoRow("Price Excluding GST", money(contract.price_excluding_gst)) +
          infoRow("GST on the Price", money(contract.gst_on_the_price)) +
          infoRow("Months Price Fixed", v(contract.months_price_fixed)),
    ),
  })}
      ${card({
    title: "Deposit",
    bodyHtml: infoList(
      infoRow("5% Deposit Due", money(contract.deposit_due)) +
          infoRow("Deposit Paid", money(contract.deposit_paid)),
    ),
  })}
    </div>
    ${totalsBlock({
    rows: [
      { label: "Price Excluding GST", value: money(contract.price_excluding_gst) },
      { label: "GST on the Price", value: money(contract.gst_on_the_price) },
    ],
    grandLabel: "Contract Price (incl. GST)",
    grandValue: money(contract.contract_price_including_gst),
  })}`;

  // ── Progress payment schedule ──────────────────────────────────────────────
  const stageRows = stages
    .map(
      (s) => `
      <tr>
        <td><strong>${esc(v(s.stage))}</strong></td>
        <td class="pdf-amt">${esc(percent(s.percent))}</td>
        <td class="pdf-amt">${esc(money(s.amount))}</td>
      </tr>`,
    )
    .join("");

  const stagesTotal = stages.reduce((sum, s) => sum + (toNum(s.amount) ?? 0), 0);
  const stagesPercent = stages.reduce((sum, s) => sum + (toNum(s.percent) ?? 0), 0);

  const progressSection = `
    ${sectionHeader("Progress Payment")}
    ${card({
    tight: true,
    bodyHtml: infoList(
      infoRow(
        "Payment Method",
        contract.progress_method === "method2" ? "Method 2" : "Method 1",
      ),
    ),
  })}
    ${pdfTable(
    `<tr>
        <th>Stage</th>
        <th class="pdf-amt" style="width:150px;">% of Contract Price</th>
        <th class="pdf-amt" style="width:150px;">Amount</th>
      </tr>`,
    stageRows ||
        "<tr><td colspan=\"3\" style=\"text-align:center;padding:20px;color:var(--muted);\">No stages recorded.</td></tr>",
  )}
    ${stages.length
    ? totalsBlock({
      rows: [{ label: "Total Percentage", value: `${stagesPercent}%` }],
      grandLabel: "Total Contract Price",
      grandValue: money(stagesTotal),
    })
    : ""}`;

  // ── Signatories ────────────────────────────────────────────────────────────
  const purchaser1Name = contract.purchaser1_full_name || contract.purchaser_1_full_name;
  const purchaser2Name = contract.purchaser2_full_name || contract.purchaser_2_full_name;

  const sigImageHtml = (sigUrl, label = "Signature") => {
    if (!sigUrl) return "";
    return `
      <div style="margin-top: 10px; padding-top: 6px; border-top: 1px dashed var(--border);">
        <div style="font-size: 9.5px; color: var(--muted); margin-bottom: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${esc(label)}:</div>
        <img src="${sigUrl}" alt="${esc(label)}" style="max-height: 48px; max-width: 180px; object-fit: contain; background: #ffffff; padding: 3px 6px; border: 1px solid var(--border); border-radius: 4px; display: block;" />
      </div>`;
  };

  const purchaserWitnessCard = card({
    title: "Purchaser Witness",
    bodyHtml:
      infoList(
        infoRow("Full Name", v(contract.purchaser_witness_full_name)) +
          infoRow("Email", v(contract.purchaser_witness_email)) +
          infoRow("Address", v(contract.purchaser_witness_address)),
      ) + sigImageHtml(contract.purchaser_witness_signature, "Purchaser Witness Signature"),
  });

  const builderWitnessCard = contract.builder_witness_same
    ? card({
        title: "Builder Witness",
        bodyHtml: "<div class=\"pdf-empty\">Same as the purchaser witness</div>",
      })
    : card({
        title: "Builder Witness",
        bodyHtml:
          infoList(
            infoRow("Full Name", v(contract.builder_witness_full_name)) +
              infoRow("Email", v(contract.builder_witness_email)) +
              infoRow("Address", v(contract.builder_witness_address)),
          ) + sigImageHtml(contract.builder_witness_signature, "Builder Witness Signature"),
      });

  const guarantorCard = contract.guarantor_signature
    ? card({
        title: "Guarantor Details",
        bodyHtml:
          infoList(
            infoRow("Full Name", v(contract.guarantor_full_name)),
          ) + sigImageHtml(contract.guarantor_signature_image, "Guarantor Signature"),
      })
    : "";

  const signatorySection = `
    ${sectionHeader("Purchaser & Witness Details")}
    <div class="pdf-grid-2">
      ${card({
    title: "Purchasers",
    bodyHtml: infoList(
      infoRow("Purchaser 1", v(purchaser1Name)) +
          (purchaser2Name ? infoRow("Purchaser 2", v(purchaser2Name)) : "") +
          infoRow("Guarantor Required", bool(contract.guarantor_signature)),
    ),
  })}
      ${purchaserWitnessCard}
    </div>
    <div class="pdf-grid-2">
      ${builderWitnessCard}
      ${card({
    title: "Contract Dates",
    bodyHtml: infoList(
      infoRow("Contract Signed Date", fmtDate(contract.contract_signed_date)) +
          infoRow("Contract Expiry Date", fmtDate(contract.contract_expiry_date)),
    ),
  })}
    </div>
    ${guarantorCard ? `<div class="pdf-grid-2">${guarantorCard}</div>` : ""}
    <div class="pdf-signatures">
      <div class="pdf-signature">
        <div class="pdf-signature-line">Purchaser — ${esc(v(purchaser1Name))}</div>
      </div>
      <div class="pdf-signature">
        <div class="pdf-signature-line">Builder — ${esc(v(contract.company_name))}</div>
      </div>
    </div>`;

  // ── Pre-signing checklist ──────────────────────────────────────────────────
  // The question wording travels with the answer (see the frontend mapper), so
  // the catalogue is not duplicated here and edits to it reach the PDF.
  const checklistSection = checklistAnswers.length
    ? `
    ${sectionHeader("Checklist Before Signing")}
    ${pdfTable(
    "<tr><th style=\"width:32px;\">#</th><th>Question</th><th class=\"pdf-amt\" style=\"width:90px;\">Answer</th></tr>",
    checklistAnswers
      .map(
        (a, i) => `
        <tr>
          <td>${i + 1}.</td>
          <td>${esc(v(a.label || a.name))}</td>
          <td class="pdf-amt">${esc(answerLabel(a.value))}</td>
        </tr>`,
      )
      .join(""),
  )}`
    : "";

  // ── Special conditions ─────────────────────────────────────────────────────
  const conditionsSection = specialConditions.length
    ? `
    ${sectionHeader("Special Conditions")}
    ${pdfTable(
    "<tr><th style=\"width:32px;\">#</th><th>Condition</th></tr>",
    specialConditions
      .map((c, i) => `<tr><td>${i + 1}.</td><td>${esc(v(c.description))}</td></tr>`)
      .join(""),
  )}`
    : "";

  const bodyHtml = `
    ${header}
    ${pdfDivider()}
    ${partiesGrid}
    ${landSection}
    ${buildingPeriodSection}
    ${worksSection}
    ${lendingSection}
    ${priceSection}
    ${progressSection}
    ${signatorySection}
    ${checklistSection}
    ${conditionsSection}
    ${pdfFooter({
    title: "InBuildify",
    note: "Building Contract — this document is system-generated.",
  })}
  `;

  return renderPdfDocument({ title: `Building Contract ${reference}`, bodyHtml });
}

export default { buildingContractHtml };
