import Joi from "joi";

// --- Shared patterns ---
const MONEY_PATTERN = /^\$?\s*(\d+|\d{1,3}(,\d{3})+)(\.\d{1,2})?$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// --- Phone numbers ---
// Mirrors contractPhoneRules on the form. Spacing and punctuation are cosmetic,
// and "+61"/"0061" is folded back to the "0" the local form uses, so the number
// itself can be matched: 02/03/07/08 landlines and 04 mobiles are 10 digits,
// 1300/1800 are 10, and 13 xx xx is 6. An overseas number is accepted only in
// full international form, since without the "+" there is nothing to tell it
// apart from a mistyped local one.
const AU_PHONE_PATTERNS = [/^0[23478]\d{8}$/, /^1[38]00\d{6}$/, /^13\d{4}$/];

const normalisePhone = (value) =>
  String(value)
    .replace(/[\s().-]/g, "")
    .replace(/^(?:\+61|0061)0?/, "0");

const phoneField = (label) =>
  Joi.string()
    .trim()
    .max(50)
    .custom((value, helpers) => {
      const normalised = normalisePhone(value);
      if (!/^\+?\d+$/.test(normalised)) {
        return helpers.error("any.invalid");
      }
      const isValid = normalised.startsWith("+")
        ? /^\+[1-9]\d{6,14}$/.test(normalised) // E.164
        : AU_PHONE_PATTERNS.some((pattern) => pattern.test(normalised));
      return isValid ? value : helpers.error("any.invalid");
    })
    .allow(null, "")
    .optional()
    .messages({
      "any.invalid": `${label} must be a valid phone number, e.g. 0391234567 or 0412345678`,
    });

// --- Schedule fields kept in STRING columns ---
// These carry a unit in the text ("12%", "$500 per day"), so the column stays a
// string and the shape is checked here instead of by the column type. Mirrors
// rateRules / moneyRules / payingPartyRules on the form.

/** A percentage rate written as text — "12" and "12%" are the same rate. */
const rateField = (label) =>
  Joi.string()
    .trim()
    .max(100)
    .custom((value, helpers) => {
      const cleaned = value.replace(/[\s%]/g, "");
      if (!/^\d+(\.\d{1,2})?$/.test(cleaned) || Number(cleaned) > 100) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .allow(null, "")
    .optional()
    .messages({
      "any.invalid": `${label} must be a percentage between 0 and 100, e.g. 12 or 12.5%`,
    });

/** A daily amount written as text — "$500", "500.00". */
const perDayAmountField = (label, max = 100000) =>
  Joi.string()
    .trim()
    .max(100)
    .custom((value, helpers) => {
      const cleaned = value.replace(/[$,\s]/g, "");
      if (!/^\d+(\.\d{1,2})?$/.test(cleaned) || Number(cleaned) > max) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .allow(null, "")
    .optional()
    .messages({
      "any.invalid": `${label} must be a daily amount up to $${max.toLocaleString("en-AU")}, e.g. 500`,
    });

// --- States and postcodes ---
// Stored as the abbreviation the form's Select now uses. The ranges are
// Australia Post's allocations, so a postcode can be checked against the state
// saved with it — the one field most often typed from memory.
const AU_STATES = ["ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"];

const STATE_POSTCODE_RANGES = {
  ACT: [[200, 299], [2600, 2618], [2900, 2920]],
  NSW: [[1000, 2599], [2619, 2899], [2921, 2999]],
  NT: [[800, 999]],
  QLD: [[4000, 4999], [9000, 9999]],
  SA: [[5000, 5999]],
  TAS: [[7000, 7999]],
  VIC: [[3000, 3999], [8000, 8999]],
  WA: [[6000, 6797], [6800, 6999]],
};

/**
 * Volume and Folio references off the certificate of title (must contain numbers only).
 */
const volumeFolioField = (label, max = 20) =>
  Joi.string()
    .trim()
    .max(max)
    .pattern(/^\d+$/)
    .allow(null, "")
    .optional()
    .messages({
      "string.pattern.base": `${label} must contain only numbers`,
    });

/**
 * A volume / folio / plan-of-subdivision reference off the certificate of
 * title. Each identifies a record by number, so one with no digit in it is a
 * note typed into the wrong box.
 */
const titleReferenceField = (label, max = 20) =>
  Joi.string()
    .trim()
    .max(max)
    .custom((value, helpers) => {
      if (!/^[A-Za-z0-9\s/-]+$/.test(value) || !/\d/.test(value)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .allow(null, "")
    .optional()
    .messages({
      "any.invalid": `${label} must be the reference from the title, e.g. letters and numbers only`,
    });

/** Which party obtains and pays for a permit. */
const payingPartyField = (label) =>
  Joi.string()
    .trim()
    .valid("builder", "owner")
    .insensitive()
    .allow(null, "")
    .optional()
    .messages({
      "any.only": `${label} must be Builder or Owner`,
    });

// --- Sub-schemas ---
const progressPaymentStagesSchema = Joi.array()
  .max(50)
  .items(
    Joi.object({
      // A row id for the editor, not contract data — the stage's name and its
      // numbers are what the contract holds. Schedules stored before the editor
      // generated ids carry none, and rejecting those made an otherwise complete
      // contract unsaveable, so the service fills in what is missing instead.
      key: Joi.string().trim().max(50).allow(null, "").optional(),
      stage: Joi.string().trim().max(100).required().messages({
        "any.required": "Stage is required",
        "string.empty": "Stage cannot be empty",
      }),
      percent: Joi.number().min(0).max(100).allow(null).optional(),
      amount: Joi.string().trim().max(50).pattern(MONEY_PATTERN).allow(null, "").optional().messages({
        "string.pattern.base": "Amount must be a valid money format",
      }),
    })
  )
  .allow(null)
  .optional();

const specialConditionsSchema = Joi.array()
  .max(100)
  .items(
    Joi.object({
      description: Joi.string().trim().max(2000).required().messages({
        "any.required": "Description is required",
        "string.empty": "Description cannot be empty",
      }),
    })
  )
  .allow(null)
  .optional();

const checklistAnswersSchema = Joi.array()
  .max(100)
  .items(
    Joi.object({
      name: Joi.string().trim().max(100).required().messages({
        "any.required": "Question name is required",
        "string.empty": "Question name cannot be empty",
      }),
      label: Joi.string().trim().max(1000).allow(null, "").optional(),
      value: Joi.string().trim().max(200).allow("").required().messages({
        "any.required": "Value is required",
      }),
    })
  )
  .allow(null)
  .optional();

// --- Main schemas ---

// GET /building-contract/job/:job_id & POST /building-contract/job/:job_id
export const getBuildingContractParamsSchema = Joi.object({
  job_id: Joi.string().uuid().required().messages({
    "string.uuid": "Job ID must be a valid UUID",
    "string.guid": "Job ID must be a valid UUID",
    "any.required": "Job ID is required",
  }),
});

// POST /building-contract/:building_contract_id/pdf
export const previewBuildingContractPdfParamsSchema = Joi.object({
  building_contract_id: Joi.string().uuid().required().messages({
    "string.uuid": "Building contract ID must be a valid UUID",
    "string.guid": "Building contract ID must be a valid UUID",
    "any.required": "Building contract ID is required",
  }),
});

// POST /building-contract/job/:job_id (Body schema)
export const saveBuildingContractBodySchema = Joi.object({
  // Customer contact
  home_telephone: phoneField("Home telephone"),
  business_telephone: phoneField("Business telephone"),

  // Building period (days)
  actual_building_period: Joi.number().integer().min(0).max(3650).allow(null).optional(),
  delay_weather: Joi.number().integer().min(0).max(365).allow(null).optional(),
  delay_breaks: Joi.number().integer().min(0).max(365).allow(null).optional(),
  delay_nature: Joi.number().integer().min(0).max(365).allow(null).optional(),
  // 5000, not 3650: the total is the actual period plus the three delay
  // allowances, so its ceiling has to leave room for all four.
  total_building_period: Joi.number().integer().min(0).max(5000).allow(null).optional(),

  // Building works & fees
  garage_size: Joi.string().trim().valid("single", "double").insensitive().allow(null, "").optional().messages({
    "any.only": "Garage size must be Single or Double",
  }),
  spec_pages_count: Joi.number().integer().min(0).max(9999).allow(null).optional(),
  number_of_pages_of_plans: Joi.number().integer().min(0).max(9999).allow(null).optional(),
  // Who obtains and pays for the permit — one of the two parties, not free text.
  paying_planning_approval: payingPartyField("Paying planning approval"),
  planning_approval_days: Joi.number().integer().min(0).max(365).allow(null).optional(),
  paying_builder_permit: payingPartyField("Paying builder permit"),
  builder_permit_days: Joi.number().integer().min(0).max(365).allow(null).optional(),
  contract_ended_percent: Joi.number().min(0).max(100).precision(2).allow(null).optional(),
  progress_payment_days: Joi.number().integer().min(0).max(365).allow(null).optional(),
  // Interest rate on an overdue progress claim; STRING so the unit can be
  // written with it, hence the format check.
  late_interest: rateField("Late interest"),
  // Liquidated damages per day — an amount, in a STRING column.
  late_completion: perDayAmountField("Late completion"),
  extra_work_percent: Joi.number().min(0).max(100).precision(2).allow(null).optional(),
  delay_damage: perDayAmountField("Delay damage"),
  bedroom: Joi.number().integer().min(1).max(30).allow(null).optional(),

  // Lending
  lending_body: Joi.string().trim().max(200).allow(null, "").optional(),
  lending_address: Joi.string().trim().max(300).allow(null, "").optional(),
  lending_finance_amount: Joi.string().trim().max(50).pattern(MONEY_PATTERN).allow(null, "").optional().messages({
    "string.pattern.base": "Lending finance amount must be a valid money format",
  }),
  lending_approval_days: Joi.number().integer().min(0).max(365).allow(null).optional(),

  // Insurer
  insurer: Joi.string().trim().max(200).allow(null, "").optional(),
  insurer_address1: Joi.string().trim().max(300).allow(null, "").optional(),
  insurer_address2: Joi.string().trim().max(300).allow(null, "").optional(),
  insurer_state: Joi.string().trim().valid(...AU_STATES).insensitive().allow(null, "").optional().messages({
    "any.only": `State must be one of ${AU_STATES.join(", ")}`,
  }),
  // Four digits, and — when a state is being saved with them — four digits
  // Australia Post allocated to that state.
  postcode: Joi.string()
    .trim()
    .pattern(/^\d{4}$/)
    .custom((value, helpers) => {
      const state = String(helpers.state.ancestors[0]?.insurer_state ?? "").toUpperCase();
      const ranges = STATE_POSTCODE_RANGES[state];
      if (!ranges) return value;
      const postcode = Number(value);
      return ranges.some(([from, to]) => postcode >= from && postcode <= to)
        ? value
        : helpers.error("any.invalid", { state });
    })
    .allow(null, "")
    .optional()
    .messages({
      "string.pattern.base": "Postcode must be exactly 4 digits",
      "any.invalid": "{{#label}} is not a postcode in that state",
    }),
  phone: phoneField("Insurer phone"),
  name_of_insured: Joi.string().trim().max(200).allow(null, "").optional(),

  // Company and Surveyor
  company_name: Joi.string().trim().max(200).allow(null, "").optional(),
  // Length only — the ATO's modulus-89 checksum was deliberately dropped so a
  // placeholder like "11111111111" can be saved. The spaces in
  // "12 345 678 901" are cosmetic. Keep buildingContractValidation.ts in step.
  abn: Joi.string()
    .trim()
    .max(50)
    .custom((value, helpers) => {
      const digits = value.replace(/\s/g, "");
      if (!/^\d{11}$/.test(digits)) {
        return helpers.error("any.invalid");
      }
      return value;
    })
    .allow(null, "")
    .optional()
    .messages({
      "any.invalid": "ABN must be exactly 11 digits",
    }),
  surveyor_name: Joi.string().trim().max(200).allow(null, "").optional(),

  // Land details
  site_address: Joi.string().trim().max(1000).allow(null, "").optional(),
  volume_number: volumeFolioField("Volume number", 5),
  folio_number: volumeFolioField("Folio number", 4),
  plan_of_subdivision_number: titleReferenceField("Plan of subdivision number", 100),
  covenants_restrictions_easements: Joi.string().trim().max(2000).allow(null, "").optional(),

  // Pricing
  price_excluding_gst: Joi.string().trim().max(50).pattern(MONEY_PATTERN).allow(null, "").optional().messages({
    "string.pattern.base": "Price excluding GST must be a valid money format",
  }),
  gst_on_the_price: Joi.string().trim().max(50).pattern(MONEY_PATTERN).allow(null, "").optional().messages({
    "string.pattern.base": "GST amount must be a valid money format",
  }),
  contract_price_including_gst: Joi.string().trim().max(50).pattern(MONEY_PATTERN).allow(null, "").optional().messages({
    "string.pattern.base": "Contract price including GST must be a valid money format",
  }),
  months_price_fixed: Joi.number().integer().min(0).max(120).allow(null).optional(),
  deposit_due: Joi.string().trim().max(50).pattern(MONEY_PATTERN).allow(null, "").optional().messages({
    "string.pattern.base": "Deposit due must be a valid money format",
  }),
  deposit_paid: Joi.string().trim().max(50).pattern(MONEY_PATTERN).allow(null, "").optional().messages({
    "string.pattern.base": "Deposit paid must be a valid money format",
  }),

  // Progress payment
  progress_method: Joi.string()
    .trim()
    .valid("method1", "method2")
    .allow(null, "")
    .optional()
    .messages({
      "any.only": "Payment method must be method1 or method2",
    }),
  progress_payment_stages: progressPaymentStagesSchema,

  // Signatories
  purchaser1_full_name: Joi.string().trim().max(200).allow(null, "").optional(),
  purchaser2_full_name: Joi.string().trim().max(200).allow(null, "").optional(),
  purchaser_witness_full_name: Joi.string().trim().max(200).allow(null, "").optional(),
  purchaser_witness_email: Joi.string().trim().max(200).email({ tlds: { allow: false } }).allow(null, "").optional().messages({
    "string.email": "Purchaser witness email must be a valid email",
  }),
  purchaser_witness_address: Joi.string().trim().max(1000).allow(null, "").optional(),
  purchaser_witness_signature: Joi.string().allow(null, "").optional(),
  builder_witness_same: Joi.boolean().optional(),
  builder_witness_full_name: Joi.string().trim().max(200).allow(null, "").optional(),
  builder_witness_email: Joi.string().trim().max(200).email({ tlds: { allow: false } }).allow(null, "").optional().messages({
    "string.email": "Builder witness email must be a valid email",
  }),
  builder_witness_address: Joi.string().trim().max(1000).allow(null, "").optional(),
  builder_witness_signature: Joi.string().allow(null, "").optional(),
  guarantor_signature: Joi.boolean().optional(),
  guarantor_full_name: Joi.string().trim().max(200).allow(null, "").optional(),
  guarantor_signature_image: Joi.string().allow(null, "").optional(),

  // Dates
  contract_signed_date: Joi.string().pattern(ISO_DATE_PATTERN).allow(null, "").optional().messages({
    "string.pattern.base": "Contract signed date must be in YYYY-MM-DD format",
  }),
  contract_expiry_date: Joi.string().pattern(ISO_DATE_PATTERN).allow(null, "").optional().messages({
    "string.pattern.base": "Contract expiry date must be in YYYY-MM-DD format",
  }),

  special_conditions: specialConditionsSchema,
  checklist_answers: checklistAnswersSchema,
})
  .custom((value, helpers) => {
    // Helper to parse currency strings to numbers
    const toAmount = (val) => {
      if (val === null || val === undefined || val === "") return null;
      const parsed = Number(String(val).replace(/[$,\s]/g, ""));
      return Number.isFinite(parsed) ? parsed : null;
    };

    const excl = toAmount(value.price_excluding_gst);
    const gst = toAmount(value.gst_on_the_price);
    const incl = toAmount(value.contract_price_including_gst);

    // Cross-field math validation
    if (excl !== null && gst !== null && incl !== null && Math.abs(excl + gst - incl) > 1) {
      return helpers.message(
        "Contract price including GST must equal the price excluding GST plus the GST"
      );
    }

    // Deposit legal maximum validation
    const deposit = toAmount(value.deposit_due);
    if (deposit !== null && incl !== null && incl > 0) {
      const max = incl < 20000 ? incl * 0.1 : incl * 0.05;
      if (deposit - max > 0.01) {
        return helpers.message(
          `Deposit exceeds the legal maximum of ${incl < 20000 ? "10%" : "5%"} of the contract price`
        );
      }
    }

    const paid = toAmount(value.deposit_paid);
    if (paid !== null && deposit !== null && paid - deposit > 0.01) {
      return helpers.message("Deposit paid cannot exceed the deposit due");
    }

    if (value.contract_signed_date && value.contract_expiry_date) {
      if (value.contract_expiry_date <= value.contract_signed_date) {
        return helpers.message("Contract expiry date must be after the contract signed date");
      }
    }

    return value;
  })
  .messages({
    "object.unknown":
      "{#label} is not a field on the building contract. Send camelCase keys that match the contract columns.",
  });

export default {
  getBuildingContractParamsSchema,
  previewBuildingContractPdfParamsSchema,
  saveBuildingContractBodySchema,
};
