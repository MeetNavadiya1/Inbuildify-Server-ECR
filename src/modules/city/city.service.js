import db from "../../config/database/models/postgre-models/index.js";
import {
  DEFAULT_COUNTRY,
  allowsCustomCity,
  canonicalStateName,
  getCityList,
  normalizeLocationName,
} from "./city.data.js";

/**
 * Find the state a city list is being asked for.
 *
 * Most forms store the state's id. A few older ones store its name (and the
 * country's name, or no country at all — those are the Australian-only forms),
 * so a name is resolved within its country, aliases included.
 */
const findState = async ({ state_id, state_name, country_id, country_name }) => {
  const { State, Country } = db;
  const include = [{ model: Country, as: "country", attributes: ["name"] }];

  if (state_id) {
    return State.findByPk(state_id, { include });
  }

  const country = await Country.findOne({
    where: country_id
      ? { country_id }
      : { name: normalizeLocationName(country_name) || DEFAULT_COUNTRY },
  });
  if (!country) {
    return null;
  }

  return State.findOne({
    where: {
      country_id: country.country_id,
      name: canonicalStateName(country.name, state_name),
    },
    include,
  });
};

/**
 * The cities of one state, and whether a city outside the list is accepted.
 *
 * An unknown state is not an error: it answers with an empty list, which the
 * form shows as a free-text City field.
 */
export const getCitiesService = async (query) => {
  const state = await findState(query);

  if (!state) {
    return { stateId: null, allowCustomCity: true, cities: [] };
  }

  const countryName = state.country?.name;
  return {
    stateId: state.state_id,
    allowCustomCity: allowsCustomCity(countryName),
    cities: getCityList(countryName, state.name),
  };
};

export default { getCitiesService };
