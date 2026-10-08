import db from "../../config/database/models/postgre-models/index.js";
import { DEFAULT_COUNTRY, SUPPORTED_COUNTRIES, getPostcodeRanges } from "../city/city.data.js";

/**
 * Fetches the states of the default country (Australia).
 *
 * Only for the forms that have no Country field. A form that lets the user pick
 * a country must ask by country id instead, or it would offer another country's
 * states.
 */
export const getAllStatesService = async () => {
  const { State, Country } = db;

  const states = await State.findAll({
    include: [
      {
        model: Country,
        as: "country",
        where: { name: DEFAULT_COUNTRY },
        attributes: ["name"],
      },
    ],
    order: [["name", "ASC"]],
  });

  return states.map((state) => {
    const item = state.toJSON();
    return {
      stateId: item.state_id,
      name: item.name,
      countryId: item.country_id,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      countryName: item.country?.name,
    };
  });
};

/**
 * Fetches the states of one supported country — and only that country.
 */
export const getStatesByCountryIdService = async (countryId) => {
  const { State, Country } = db;

  const country = await Country.findOne({
    where: {
      country_id: countryId,
      name: SUPPORTED_COUNTRIES,
    },
  });

  if (!country) {
    return { error: "Country not found.", status: 404 };
  }

  const states = await State.findAll({
    where: { country_id: countryId },
    order: [["name", "ASC"]],
  });

  if (states.length === 0) {
    return { error: "State not found with this country.", status: 404 };
  }

  return states.map((state) => {
    const item = state.get({ plain: true });
    return {
      stateId: item.state_id,
      name: item.name,
      countryId: item.country_id,
      // First-three-digit ranges of this state's postcodes (India's PIN codes), so
      // the form checks the postcode against the state the way the save does.
      postcodeRanges: getPostcodeRanges(country.name, item.name),
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  });
};

export default {
  getAllStatesService,
  getStatesByCountryIdService,
};
