import { Op } from "sequelize";
import db from "../../config/database/models/postgre-models/index.js";
import { buildTermsUrl, newPublicToken } from "../../utils/quotationTermsLink.js";
import {
  sanitizeRichText,
  sanitizePlainText,
  isRichTextEmpty,
} from "../../utils/htmlSanitizer.js";

export { buildTermsUrl };

/** Hard caps so one tenant cannot make a PDF (or the public page) unbounded. */
const MAX_SECTIONS = 60;
const MAX_SECTION_BODY = 20000;
const MAX_INTRO = 20000;
const MAX_FOOTER_NOTE = 5000;

/**
 * The tenant key for a terms document: ONE document per builder.
 *
 * Deliberately not `{builder_id, company_id}`. authMiddleware resolves
 * company_id from the builder when the user's own is NULL, so the pair is not
 * stable — a change in how company resolution works (or a user whose company
 * link is added later) would key a second document for the same builder and the
 * quotation queries would start picking between two rival documents. Keying on
 * the builder makes that impossible.
 *
 * Users with no builder at all (Company Administrators created via
 * /company-signup) fall back to their company. Partial unique indexes in the
 * migration enforce exactly this shape.
 *
 * Seeded documents are excluded, and every caller here wants that. A builder who
 * has imported Sample Data holds a second, `is_sample_data` document — the demo
 * quotations' one — and it is not the builder's to edit, confirm, sync or serve
 * on their own public link. Without the exclusion `findOne` could hand any of
 * those the demo document instead, which is how the two came to overwrite each
 * other in the first place.
 */
const tenantWhere = ({ builderId, companyId }) => ({
  ...(builderId
    ? { builder_id: builderId }
    : { builder_id: null, company_id: companyId ?? null }),
  // `Op.not` rather than `false`: the column is NOT NULL now, but rows written
  // before the migration are matched by the same rule everywhere else.
  is_sample_data: { [Op.not]: true },
});

/**
 * The seeded document belonging to one import.
 *
 * Keyed by owner as well as tenant because the importer clones per person: two
 * colleagues under one builder each hold their own demo dataset, and each one's
 * demo quotations must resolve to the document their own import brought across.
 */
const sampleTermsWhere = ({ builderId, companyId, ownerId }) => ({
  ...(builderId
    ? { builder_id: builderId }
    : { builder_id: null, company_id: companyId ?? null }),
  is_sample_data: true,
  sample_data_owner_id: ownerId ?? null,
});

/**
 * Normalise + sanitise the clause list coming off the editor.
 *
 * Clauses with neither a title nor a body are dropped rather than rejected: an
 * empty row is what an editor leaves behind when the builder adds a clause and
 * changes their mind, and failing the whole save over it would be hostile.
 */
function normaliseSections(sections) {
  if (!Array.isArray(sections)) return [];
  return sections
    .slice(0, MAX_SECTIONS)
    .map((section, index) => {
      const title = sanitizePlainText(section?.title, 200);
      const body = sanitizeRichText(section?.body, MAX_SECTION_BODY);
      return {
        // A stable id lets the editor reorder/remove rows without React key
        // churn, and lets the public page deep-link a clause.
        id: sanitizePlainText(section?.id, 64) || `clause-${index + 1}`,
        title,
        body,
      };
    })
    .filter((section) => section.title || !isRichTextEmpty(section.body));
}

/**
 * What Confirm published, as a plain object.
 *
 * Rows confirmed before `confirmed_snapshot` existed fall back to their live
 * columns — for those, the columns ARE what was published, because nothing else
 * could have been.
 */
function publishedOf(plain) {
  if (!plain?.is_confirmed) return null;
  const snap = plain.confirmed_snapshot;
  if (snap && typeof snap === "object" && (snap.title || snap.sections)) {
    return {
      title: snap.title || "Terms & Conditions",
      intro: snap.intro || "",
      sections: Array.isArray(snap.sections) ? snap.sections : [],
      footerNote: snap.footerNote || "",
      version: snap.version ?? plain.version,
    };
  }
  return {
    title: plain.title,
    intro: plain.intro || "",
    sections: Array.isArray(plain.sections) ? plain.sections : [],
    footerNote: plain.footer_note || "",
    version: plain.version,
  };
}

/**
 * The shape the editor reads.
 *
 * `title`/`intro`/`sections`/`footerNote` are the builder's WORKING DRAFT — what
 * the editor should load. `published` is what Confirm last put in front of
 * customers, and is what the preview panel renders, so the preview can never
 * show wording a customer cannot actually reach.
 */
function toDto(row) {
  if (!row) return null;
  const plain = typeof row.toJSON === "function" ? row.toJSON() : row;
  return {
    quotationTermsId: plain.quotation_terms_id,
    title: plain.title,
    intro: plain.intro || "",
    sections: Array.isArray(plain.sections) ? plain.sections : [],
    footerNote: plain.footer_note || "",
    version: plain.version,
    isConfirmed: plain.is_confirmed,
    confirmedAt: plain.confirmed_at,
    publicToken: plain.public_token,
    publicUrl: buildTermsUrl(plain.public_token),
    isActive: plain.is_active,
    published: publishedOf(plain),
    createdAt: plain.created_at ?? plain.createdAt,
    updatedAt: plain.updated_at ?? plain.updatedAt,
  };
}

/**
 * The starter document a builder sees the first time they open the tab.
 *
 * Deliberately not blank: an empty editor gives no clue what "fixed format"
 * means or what a clause should look like, and every builder needs roughly
 * these headings anyway. It is a draft (is_confirmed stays false), so nothing
 * reaches a customer until the builder has read and confirmed it.
 */
const DEFAULT_SECTIONS = [
  {
    id: "clause-1",
    title: "Quotation Validity",
    body: "<p>This quotation is valid for 30 days from the date of issue. Prices are subject to review after that period.</p>",
  },
  {
    id: "clause-2",
    title: "Pricing & GST",
    body: "<p>All prices are quoted in Australian Dollars (AUD) and are inclusive of GST where applicable, unless stated otherwise.</p>",
  },
  {
    id: "clause-3",
    title: "Inclusions & Exclusions",
    body: "<p>Only the items listed in this quotation are included. Anything not expressly listed is excluded and will be quoted separately.</p>",
  },
  {
    id: "clause-4",
    title: "Site Conditions",
    body: "<p>Pricing assumes normal site conditions. Rock, fill, reactive soil, restricted access or service relocation may attract additional charges, confirmed in writing before work proceeds.</p>",
  },
  {
    id: "clause-5",
    title: "Payment Terms",
    body: "<p>A deposit is payable on acceptance. Progress payments fall due at the stages set out in the building contract.</p>",
  },
  {
    id: "clause-6",
    title: "Variations",
    body: "<p>Any change to the scope, selections or specification must be documented as a variation and signed by both parties before the work is carried out.</p>",
  },
];

const DEFAULT_INTRO =
  "<p>The following terms and conditions apply to this quotation and form part of any agreement arising from it. Please read them carefully before accepting.</p>";

const DEFAULT_FOOTER_NOTE =
  "<p>By accepting this quotation you acknowledge that you have read, understood and agreed to these terms and conditions.</p>";

// ─── Builder side ────────────────────────────────────────────────────────────

/**
 * Fetch this builder's terms, creating the starter draft on first open.
 *
 * Concurrent first opens (two tabs, or a page that fires the fetch twice) race
 * on the tenant unique index; the catch re-reads instead of surfacing a
 * constraint error the user cannot act on.
 */
export async function getTermsService({ builderId, companyId, userId }) {
  const where = tenantWhere({ builderId, companyId });

  const existing = await db.QuotationTerms.findOne({ where });
  if (existing) return toDto(existing);

  try {
    const created = await db.QuotationTerms.create({
      // Both ids are stored (company_id feeds the display name and the FK);
      // only the builder identifies the document.
      builder_id: builderId ?? null,
      company_id: companyId ?? null,
      title: "Terms & Conditions",
      intro: DEFAULT_INTRO,
      sections: DEFAULT_SECTIONS,
      footer_note: DEFAULT_FOOTER_NOTE,
      version: 1,
      is_confirmed: false,
      public_token: newPublicToken(),
      created_by: userId ?? null,
      updated_by: userId ?? null,
    });
    return toDto(created);
  } catch (error) {
    if (error?.name === "SequelizeUniqueConstraintError") {
      const raced = await db.QuotationTerms.findOne({ where });
      if (raced) return toDto(raced);
    }
    throw error;
  }
}

/**
 * Save the editor's contents.
 *
 * @param {boolean} confirm when true this is the Confirm action: the document
 *   is marked confirmed and its version bumped, which is what makes it eligible
 *   for Sync and for the public page. A plain save leaves both alone so the
 *   builder can park a half-written clause without publishing it.
 */
export async function saveTermsService({ builderId, companyId, userId, payload, confirm = false }) {
  const where = tenantWhere({ builderId, companyId });

  // Guarantees the row exists (and handles the first-open race) before update.
  await getTermsService({ builderId, companyId, userId });
  const row = await db.QuotationTerms.findOne({ where });

  if (!row) {
    const error = new Error("Terms & Conditions not found for this builder.");
    error.status = 404;
    throw error;
  }

  const title = sanitizePlainText(payload?.title, 255) || "Terms & Conditions";
  const intro = sanitizeRichText(payload?.intro, MAX_INTRO);
  const sections = normaliseSections(payload?.sections);
  const footerNote = sanitizeRichText(payload?.footer_note ?? payload?.footerNote, MAX_FOOTER_NOTE);

  if (confirm && !sections.length && isRichTextEmpty(intro)) {
    const error = new Error(
      "Add an introduction or at least one clause before confirming your Terms & Conditions.",
    );
    error.status = 400;
    throw error;
  }

  // Bumping only on Confirm keeps the version meaningful: it counts published
  // revisions, so comparing a snapshot's version against it answers "is this
  // quotation on the builder's current terms?".
  const nextVersion = confirm ? (row.version || 0) + 1 : row.version;

  await row.update({
    title,
    intro,
    sections,
    footer_note: footerNote,
    // Confirm is the ONLY thing that changes what customers read. A plain save
    // leaves confirmed_snapshot alone, so a half-written draft never reaches
    // the public page or an un-synced quotation.
    ...(confirm
      ? {
          version: nextVersion,
          is_confirmed: true,
          confirmed_at: new Date(),
          confirmed_snapshot: { title, intro, sections, footerNote, version: nextVersion },
        }
      : {}),
    // A token is only missing on rows written before this column existed.
    public_token: row.public_token || newPublicToken(),
    updated_by: userId ?? null,
  });

  return toDto(row);
}

// ─── Sync ────────────────────────────────────────────────────────────────────

/**
 * Every quotation version belonging to this tenant, split by whether terms have
 * already been attached — the counts the Sync dialog shows next to its two
 * options.
 *
 * Tenancy runs quotation_version → quotation → leads (quotation_version itself
 * carries no builder_id), which is the same path quotation.repository.js takes.
 *
 * Seeded quotations are excluded. They carry the terms their own import brought
 * across, frozen at import time, and Sync is the one action that could rewrite
 * them: "All" re-freezes a fresh snapshot over every row it reaches, so a
 * builder confirming a revision and syncing it was republishing the builder's
 * wording onto their demo quotations. Demo data changes when the demo data is
 * re-imported and at no other time — including here.
 */
function tenantVersionScopeSql(companyId) {
  const companyCondition = companyId ? " OR l.company_id = :companyId" : "";
  return `
    FROM quotation_version qv
    JOIN quotation q ON qv.quotation_id = q.quotation_id
    JOIN leads l ON q.leads_id = l.leads_id
    LEFT JOIN quotation_version_terms qvt ON qvt.quotation_version_id = qv.quotation_version_id
    WHERE (l.builder_id = :builderId${companyCondition})
      AND l.is_sample_data IS NOT TRUE
  `;
}

export async function getSyncSummaryService({ builderId, companyId }) {
  const rows = await db.sequelize.query(
    `
      SELECT
        COUNT(*)::int AS total,
        COUNT(qvt.quotation_version_terms_id)::int AS with_terms
      ${tenantVersionScopeSql(companyId)}
    `,
    {
      replacements: { builderId: builderId ?? null, companyId: companyId ?? null },
      type: db.Sequelize.QueryTypes.SELECT,
    },
  );

  const total = rows?.[0]?.total ?? 0;
  const withTerms = rows?.[0]?.with_terms ?? 0;

  // How many synced rows are on an older revision — the reason "All" exists
  // even when nothing is missing.
  const terms = await db.QuotationTerms.findOne({
    where: tenantWhere({ builderId, companyId }),
    attributes: ["version", "is_confirmed"],
  });

  let outdated = 0;
  if (terms?.version) {
    const outdatedRows = await db.sequelize.query(
      `
        SELECT COUNT(*)::int AS outdated
        ${tenantVersionScopeSql(companyId)}
          AND qvt.quotation_version_terms_id IS NOT NULL
          AND COALESCE(qvt.terms_version, 0) < :currentVersion
      `,
      {
        replacements: {
          builderId: builderId ?? null,
          companyId: companyId ?? null,
          currentVersion: terms.version,
        },
        type: db.Sequelize.QueryTypes.SELECT,
      },
    );
    outdated = outdatedRows?.[0]?.outdated ?? 0;
  }

  return {
    total,
    withTerms,
    withoutTerms: Math.max(total - withTerms, 0),
    outdated,
    isConfirmed: !!terms?.is_confirmed,
    currentVersion: terms?.version ?? null,
  };
}

/**
 * Push the builder's confirmed terms onto their quotation versions.
 *
 * @param {"all"|"missing"} scope
 *   "missing" — only versions with no terms yet. Nothing already sent to a
 *     customer changes wording underneath them.
 *   "all"     — every version, re-freezing a fresh snapshot over any existing
 *     one. This is the destructive option, which is exactly why the UI makes
 *     the user pick rather than defaulting.
 *
 * Runs in one transaction so a partial sync can never leave half the
 * quotations on one revision and half on another.
 */
export async function syncTermsService({ builderId, companyId, userId, scope = "missing" }) {
  const normalisedScope = scope === "all" ? "all" : "missing";

  const terms = await db.QuotationTerms.findOne({
    where: tenantWhere({ builderId, companyId }),
  });

  if (!terms) {
    const error = new Error("Set up your Terms & Conditions before syncing them to quotations.");
    error.status = 400;
    throw error;
  }
  if (!terms.is_confirmed) {
    const error = new Error("Confirm your Terms & Conditions before syncing them to quotations.");
    error.status = 400;
    throw error;
  }

  const dto = toDto(terms);
  // Freeze what was PUBLISHED, never the working draft — otherwise Sync would
  // push unconfirmed edits onto quotations.
  const snapshot = dto.published;

  const missingOnly = normalisedScope === "missing" ? " AND qvt.quotation_version_terms_id IS NULL" : "";

  const targets = await db.sequelize.query(
    `
      SELECT qv.quotation_version_id, qvt.quotation_version_terms_id
      ${tenantVersionScopeSql(companyId)}${missingOnly}
    `,
    {
      replacements: { builderId: builderId ?? null, companyId: companyId ?? null },
      type: db.Sequelize.QueryTypes.SELECT,
    },
  );

  if (!targets.length) {
    return { scope: normalisedScope, processed: 0, created: 0, updated: 0, version: dto.version };
  }

  const now = new Date();
  const toCreate = [];
  const toUpdateIds = [];

  for (const target of targets) {
    if (target.quotation_version_terms_id) {
      toUpdateIds.push(target.quotation_version_terms_id);
    } else {
      toCreate.push({
        quotation_version_id: target.quotation_version_id,
        quotation_terms_id: terms.quotation_terms_id,
        builder_id: builderId ?? null,
        company_id: companyId ?? null,
        terms_snapshot: snapshot,
        terms_version: dto.version,
        public_token: newPublicToken(),
        synced_at: now,
        created_by: userId ?? null,
        updated_by: userId ?? null,
      });
    }
  }

  const transaction = await db.sequelize.transaction();
  try {
    if (toCreate.length) {
      // ignoreDuplicates rather than a pre-check: two admins hitting Sync at the
      // same moment would otherwise collide on the quotation_version_id unique
      // index and fail the whole batch.
      await db.QuotationVersionTerms.bulkCreate(toCreate, { transaction, ignoreDuplicates: true });
    }

    if (toUpdateIds.length) {
      // Chunked: a builder with thousands of quotations would otherwise build an
      // IN list big enough to blow past the parameter limit.
      const CHUNK = 500;
      for (let i = 0; i < toUpdateIds.length; i += CHUNK) {
        await db.QuotationVersionTerms.update(
          {
            quotation_terms_id: terms.quotation_terms_id,
            terms_snapshot: snapshot,
            terms_version: dto.version,
            synced_at: now,
            updated_by: userId ?? null,
          },
          { where: { quotation_version_terms_id: toUpdateIds.slice(i, i + CHUNK) }, transaction },
        );
      }
    }

    await transaction.commit();
  } catch (error) {
    await transaction.rollback();
    throw error;
  }

  return {
    scope: normalisedScope,
    processed: targets.length,
    created: toCreate.length,
    updated: toUpdateIds.length,
    version: dto.version,
  };
}

// ─── Per-quotation lookup ────────────────────────────────────────────────────

/**
 * Is this quotation version part of somebody's Sample Data, and whose?
 *
 * Asked of the LEAD rather than the version: the lead has carried the flag and
 * the owner since sample data existed, while `quotation_version` gained the flag
 * later and never gained the owner. Returns `{ isSample: false }` for anything
 * real, which is the overwhelming majority of calls.
 */
async function sampleDataOriginOfVersion(versionId) {
  const rows = await db.sequelize.query(
    `
      SELECT l.sample_data_owner_id AS owner_id
      FROM quotation_version qv
      JOIN quotation q ON q.quotation_id = qv.quotation_id
      JOIN leads l ON l.leads_id = q.leads_id
      WHERE qv.quotation_version_id = :versionId
        AND l.is_sample_data = true
      LIMIT 1
    `,
    {
      replacements: { versionId },
      type: db.Sequelize.QueryTypes.SELECT,
    },
  );

  return rows.length
    ? { isSample: true, ownerId: rows[0].owner_id ?? null }
    : { isSample: false, ownerId: null };
}

/**
 * The terms link for one quotation version — what the quotation screens render
 * as "Terms & Conditions".
 *
 * Falls back to the tenant's live document when the version has never been
 * synced, so the link is never dead. `isSynced` tells the UI which of the two
 * it got, and the Quotation list uses it to nudge towards Sync.
 *
 * "The tenant's" means the builder's own document for a real quotation and the
 * seeded document for a demo one — never the other way round. A demo quotation
 * falling back to the builder's live document is precisely how editing Settings
 * → Terms & Conditions used to change what Sample Data showed.
 */
export async function getTermsForVersionService({ versionId, builderId, companyId }) {
  const snapshotRow = await db.QuotationVersionTerms.findOne({
    where: { quotation_version_id: versionId },
  });

  if (snapshotRow) {
    const snapshot = snapshotRow.terms_snapshot || {};
    return {
      quotationVersionId: versionId,
      isSynced: true,
      title: snapshot.title || "Terms & Conditions",
      version: snapshotRow.terms_version ?? snapshot.version ?? null,
      publicToken: snapshotRow.public_token,
      publicUrl: buildTermsUrl(snapshotRow.public_token),
    };
  }

  const origin = await sampleDataOriginOfVersion(versionId);

  const terms = await db.QuotationTerms.findOne({
    where: origin.isSample
      ? sampleTermsWhere({ builderId, companyId, ownerId: origin.ownerId })
      : tenantWhere({ builderId, companyId }),
  });

  if (!terms || !terms.is_confirmed) return null;

  // Published wording, not the draft the builder may be part-way through.
  const published = toDto(terms).published;

  return {
    quotationVersionId: versionId,
    isSynced: false,
    title: published.title,
    version: published.version,
    publicToken: terms.public_token,
    publicUrl: buildTermsUrl(terms.public_token),
  };
}

// ─── Public side ─────────────────────────────────────────────────────────────

/**
 * Resolve a public token to a renderable terms document.
 *
 * One token space, two sources: a per-quotation token serves that quotation's
 * frozen snapshot (plus the quotation's reference, so the customer can see what
 * it belongs to); the builder-level token serves the live document. The lookup
 * tries the quotation table first because its token is the one printed on PDFs.
 *
 * Never leaks anything tenant-internal — the response carries only what the
 * page prints.
 */
export async function getPublicTermsService(token) {
  if (!token || typeof token !== "string") return null;

  const snapshotRow = await db.QuotationVersionTerms.findOne({
    where: { public_token: token },
  });

  if (snapshotRow) {
    const snapshot = snapshotRow.terms_snapshot || {};

    const version = await db.QuotationVersion.findOne({
      where: { quotation_version_id: snapshotRow.quotation_version_id },
      attributes: ["quotation_version_id", "quotation_version_no", "quotation_id"],
      include: [
        {
          model: db.Quotation,
          as: "quotation",
          attributes: ["quotation_id", "reference_number"],
          required: false,
        },
      ],
    });

    return {
      title: snapshot.title || "Terms & Conditions",
      intro: snapshot.intro || "",
      sections: Array.isArray(snapshot.sections) ? snapshot.sections : [],
      footerNote: snapshot.footerNote || "",
      version: snapshotRow.terms_version ?? snapshot.version ?? null,
      effectiveDate: snapshotRow.synced_at ?? snapshotRow.created_at ?? null,
      builderName: await resolveBuilderName(snapshotRow.builder_id, snapshotRow.company_id),
      quotation: version
        ? {
            referenceNumber: version.quotation?.reference_number ?? null,
            versionNo: version.quotation_version_no ?? null,
          }
        : null,
    };
  }

  const terms = await db.QuotationTerms.findOne({
    where: { public_token: token, is_active: true },
  });

  // An unconfirmed draft is not published. Treated as "not found" rather than
  // "forbidden" so the token cannot be used to probe whether a builder exists.
  if (!terms || !terms.is_confirmed) return null;

  // The PUBLISHED wording — never the live columns, which are the builder's
  // working draft and may be mid-edit while a customer has this page open.
  const published = toDto(terms).published;

  return {
    title: published.title,
    intro: published.intro,
    sections: published.sections,
    footerNote: published.footerNote,
    version: published.version,
    effectiveDate: terms.confirmed_at ?? terms.updated_at ?? null,
    builderName: await resolveBuilderName(terms.builder_id, terms.company_id),
    quotation: null,
  };
}

/**
 * Best-effort display name for the page header. Any failure degrades to null
 * (the page then just shows the document title) — a missing company row must
 * never take the public page down.
 */
async function resolveBuilderName(builderId, companyId) {
  try {
    if (companyId && db.Company) {
      const company = await db.Company.findOne({
        where: { company_id: companyId },
        attributes: ["company_id", "name"],
      });
      if (company?.name) return company.name;
    }
    if (builderId && db.Builder) {
      const builder = await db.Builder.findOne({
        where: { builder_id: builderId },
        attributes: ["builder_id", "name", "firm_name"],
      });
      if (builder?.firm_name || builder?.name) return builder.firm_name || builder.name;
    }
  } catch (error) {
    console.warn("[quotation-terms] Could not resolve builder name:", error.message);
  }
  return null;
}

export default {
  getTermsService,
  saveTermsService,
  getSyncSummaryService,
  syncTermsService,
  getTermsForVersionService,
  getPublicTermsService,
  buildTermsUrl,
};
