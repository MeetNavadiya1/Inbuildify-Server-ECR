/**
 * Refuse a country / state / city combination that does not belong together.
 *
 * The dropdowns only ever offer a state of the selected country and a city of
 * the selected state, but the save has to hold the same line: a stale form, an
 * API client or a bug upstream must not be able to store Maharashtra under
 * Australia, or a Karnataka city under Kerala.
 *
 * Enforced at the model rather than per endpoint for the reason the sample-data
 * guard is: a location is written by a dozen services (addresses for users,
 * builders, companies, contacts and referral partners; estates, lots, suppliers,
 * surveyors, property details, business contacts…), some through repositories,
 * some with bare `Model.create` / `Model.update`. A rule with a dozen chances to
 * be forgotten is not a rule. Every model carrying a `state_id` column is wired.
 *
 * The rules, all read from `modules/city/city.data.js` — the same data the city
 * dropdown is filled from:
 *   1. a state must exist;
 *   2. with a country alongside it, the state must belong to that country;
 *   3. with a city alongside it, a country that restricts cities (India) only
 *      accepts a city listed for that state. A listed city is stored as the list
 *      spells it, so "mumbai" is saved as "Mumbai";
 *   4. with a postcode alongside it, the postcode has that country's number of
 *      digits (Australia 4, India 6) and, for India, a PIN code that belongs to
 *      the selected state (see `postcodeProblem`);
 *   5. for India, every phone on the row is a valid Indian number (see
 *      `phoneProblem`). Users and builders keep their location in an address
 *      row, so their phones are checked by `wireAddressPhoneGuard` instead.
 *
 * The country is the state's when a state is set, else the row's `country_id`.
 * With neither there is nothing to check against.
 */

import { Model } from "sequelize";

import {
  getCountryCode,
  phoneProblem,
  postcodeProblem,
  resolveCityName,
} from "../../../../modules/city/city.data.js";

const COUNTRY = "country_id";
const STATE = "state_id";
const CITY = "city";
// Surveyors call it `zip_postal_code`, estates `zip`; everything else `zip_code`.
const POSTCODES = ["zip_code", "zip_postal_code", "zip"];
// Every phone column a row with a location can carry.
const PHONES = ["phone", "phone_number", "primary_phone", "secondary_phone"];
const WIRED = Symbol("locationGuardWired");

const locationError = (message) => {
  const error = new Error(message);
  // Both spellings: handleControllerError reads either, and several older
  // controllers read only `status`.
  error.status = 400;
  error.statusCode = 400;
  return error;
};

const titleCase = (value) => String(value || "").replace(/\b\w/g, (c) => c.toUpperCase());

const hasValue = (value) => value !== null && value !== undefined && String(value).trim() !== "";

const checkPostcode = (countryName, stateName, postcode) => {
  const problem = hasValue(postcode) ? postcodeProblem(countryName, stateName, postcode) : null;
  if (problem) {
    throw locationError(problem);
  }
};

// Only India is judged (see `phoneProblem`); every other country keeps its forms' own rules.
const checkPhones = (countryName, values) => {
  for (const column of PHONES) {
    const problem = hasValue(values[column]) ? phoneProblem(countryName, values[column]) : null;
    if (problem) {
      throw locationError(problem);
    }
  }
};

/**
 * Check one row's location. Returns the city as it should be stored (possibly
 * re-spelled), or `undefined` when the row carries no city.
 */
const checkLocation = async (db, values, transaction) => {
  const { country_id, state_id, city } = values;
  const postcode = POSTCODES.map((column) => values[column]).find(hasValue);

  if (!state_id) {
    if (country_id && (hasValue(postcode) || PHONES.some((column) => hasValue(values[column])))) {
      const country = await db.Country.findByPk(country_id, { attributes: ["name"], transaction });
      checkPostcode(country?.name, null, postcode);
      checkPhones(country?.name, values);
    }
    return city;
  }

  const state = await db.State.findByPk(state_id, {
    include: [{ model: db.Country, as: "country", attributes: ["name"] }],
    transaction,
  });

  if (!state) {
    throw locationError("The selected state / region does not exist.");
  }

  if (country_id && state.country_id !== country_id) {
    throw locationError("The selected state / region does not belong to the selected country.");
  }

  checkPostcode(state.country?.name, state.name, postcode);
  checkPhones(state.country?.name, values);

  if (typeof city !== "string" || !city.trim()) {
    return city;
  }

  const resolved = resolveCityName(state.country?.name, state.name, city);
  if (resolved === null) {
    throw locationError(`"${city.trim()}" is not a city in ${titleCase(state.name)}.`);
  }
  return resolved;
};

const locationFields = (model) =>
  [COUNTRY, STATE, CITY, ...POSTCODES, ...PHONES].filter((field) => Boolean(model.rawAttributes[field]));

const touchesLocation = (fields, changed) => fields.some((field) => changed.includes(field));

export const wireLocationGuard = (db) => {
  for (const model of Object.values(db)) {
    // Real models only — see the note in `wireSampleDataFlag` on `db.Sequelize`.
    if (typeof model !== "function" || typeof model.addHook !== "function") {
      continue;
    }
    if (!(model.prototype instanceof Model)) {
      continue;
    }
    if (model.prototype[WIRED]) {
      continue;
    }

    const stateColumn = model.rawAttributes?.[STATE];
    // The State table's own primary key is not a reference to a state.
    if (!stateColumn || stateColumn.primaryKey) {
      continue;
    }

    const fields = locationFields(model);

    // Single-row paths: `Model.create()`, `instance.save()`, `instance.update()`.
    const guardInstance = async (instance, options) => {
      if (!instance.isNewRecord && !touchesLocation(fields, instance.changed() || [])) {
        return;
      }

      const values = Object.fromEntries(fields.map((field) => [field, instance.get(field)]));
      const city = await checkLocation(db, values, options?.transaction);

      if (fields.includes(CITY) && city !== values[CITY]) {
        instance.set(CITY, city);
      }
    };

    model.addHook("beforeCreate", guardInstance);
    model.addHook("beforeUpdate", guardInstance);
    model.addHook("beforeBulkCreate", async (instances, options) => {
      for (const instance of instances) {
        await guardInstance(instance, options);
      }
    });

    // `Model.update({...}, { where })`: no instances, and the statement may set
    // only part of the location (just the city, say). Judge each affected row
    // as it will be once the update lands.
    model.addHook("beforeBulkUpdate", async (options) => {
      const attributes = options?.attributes || {};
      if (!touchesLocation(fields, Object.keys(attributes))) {
        return;
      }

      const rows = await model.findAll({
        where: options.where,
        attributes: fields,
        transaction: options.transaction,
        raw: true,
      });

      const incoming = Object.fromEntries(
        fields.filter((field) => field in attributes).map((field) => [field, attributes[field]]),
      );

      const cities = new Set();
      for (const row of rows) {
        cities.add(await checkLocation(db, { ...row, ...incoming }, options.transaction));
      }

      // Re-spell the city only when every row agrees on how.
      if (CITY in attributes && cities.size === 1) {
        const [city] = cities;
        if (city !== undefined) {
          attributes[CITY] = city;
        }
      }
    });

    model.prototype[WIRED] = true;
  }
};

/**
 * A company's timezone must be one of its address country's timezones.
 *
 * The Timezone dropdown only offers the selected country's timezones and
 * switches to India Standard Time when India is picked; this holds the same
 * line on save, for the company settings and the onboarding flow alike.
 *
 * Both write the address first and the company after it in one transaction, so
 * reading the address here — inside that transaction — sees the country being
 * saved. Nothing is checked while either side is unknown.
 */
const checkCompanyTimezone = async (db, { timezone_id, address_id }, transaction) => {
  if (!timezone_id || !address_id) {
    return;
  }

  const [timezone, address] = await Promise.all([
    db.Timezones.findByPk(timezone_id, { attributes: ["country_code", "display_name"], transaction }),
    db.Address.findByPk(address_id, {
      attributes: ["country_id"],
      include: [{ model: db.Country, as: "country", attributes: ["name"] }],
      transaction,
    }),
  ]);

  const countryName = address?.country?.name;
  const countryCode = getCountryCode(countryName);
  if (!timezone || !countryCode || timezone.country_code === countryCode) {
    return;
  }

  throw locationError(
    `The timezone "${timezone.display_name}" is not in ${titleCase(countryName)}. ` +
      `Choose one of ${titleCase(countryName)}'s timezones.`,
  );
};

export const wireTimezoneGuard = (db) => {
  const { Company } = db;
  if (!Company || Company.prototype[WIRED]) {
    return;
  }

  const fields = ["timezone_id", "address_id"];

  const guardInstance = async (instance, options) => {
    if (!instance.isNewRecord && !touchesLocation(fields, instance.changed() || [])) {
      return;
    }
    await checkCompanyTimezone(
      db,
      { timezone_id: instance.get("timezone_id"), address_id: instance.get("address_id") },
      options?.transaction,
    );
  };

  Company.addHook("beforeCreate", guardInstance);
  Company.addHook("beforeUpdate", guardInstance);

  // `Company.update({...}, { where })`, which is how onboarding saves.
  Company.addHook("beforeBulkUpdate", async (options) => {
    const attributes = options?.attributes || {};
    if (!touchesLocation(fields, Object.keys(attributes))) {
      return;
    }

    const rows = await Company.findAll({
      where: options.where,
      attributes: fields,
      transaction: options.transaction,
      raw: true,
    });
    for (const row of rows) {
      await checkCompanyTimezone(
        db,
        {
          timezone_id: attributes.timezone_id !== undefined ? attributes.timezone_id : row.timezone_id,
          address_id: attributes.address_id !== undefined ? attributes.address_id : row.address_id,
        },
        options.transaction,
      );
    }
  });

  Company.prototype[WIRED] = true;
};

/**
 * Phones on rows whose location lives in an address row (users, builders).
 *
 * The country is read from the linked address inside the same transaction, so
 * an address written just before the row is seen as saved. Only India is judged
 * (see `phoneProblem`).
 */
const checkAddressPhones = async (db, values, transaction) => {
  if (!values.address_id || !PHONES.some((column) => hasValue(values[column]))) {
    return;
  }
  const address = await db.Address.findByPk(values.address_id, {
    attributes: ["country_id"],
    include: [{ model: db.Country, as: "country", attributes: ["name"] }],
    transaction,
  });
  checkPhones(address?.country?.name, values);
};

export const wireAddressPhoneGuard = (db) => {
  for (const model of Object.values(db)) {
    if (typeof model !== "function" || typeof model.addHook !== "function") {
      continue;
    }
    if (!(model.prototype instanceof Model) || model.prototype[WIRED]) {
      continue;
    }
    // Rows with their own state are covered by wireLocationGuard.
    if (!model.rawAttributes?.address_id || model.rawAttributes?.[STATE]) {
      continue;
    }
    const phones = PHONES.filter((column) => model.rawAttributes[column]);
    if (phones.length === 0) {
      continue;
    }

    const fields = ["address_id", ...phones];

    const guardInstance = async (instance, options) => {
      if (!instance.isNewRecord && !touchesLocation(fields, instance.changed() || [])) {
        return;
      }
      const values = Object.fromEntries(fields.map((field) => [field, instance.get(field)]));
      await checkAddressPhones(db, values, options?.transaction);
    };

    model.addHook("beforeCreate", guardInstance);
    model.addHook("beforeUpdate", guardInstance);
    model.addHook("beforeBulkCreate", async (instances, options) => {
      for (const instance of instances) {
        await guardInstance(instance, options);
      }
    });
    model.addHook("beforeBulkUpdate", async (options) => {
      const attributes = options?.attributes || {};
      if (!touchesLocation(fields, Object.keys(attributes))) {
        return;
      }
      const rows = await model.findAll({
        where: options.where,
        attributes: fields,
        transaction: options.transaction,
        raw: true,
      });
      const incoming = Object.fromEntries(
        fields.filter((field) => field in attributes).map((field) => [field, attributes[field]]),
      );
      for (const row of rows) {
        await checkAddressPhones(db, { ...row, ...incoming }, options.transaction);
      }
    });

    model.prototype[WIRED] = true;
  }
};

export default wireLocationGuard;
