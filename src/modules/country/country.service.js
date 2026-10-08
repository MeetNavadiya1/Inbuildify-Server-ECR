import db from "../../config/database/models/postgre-models/index.js";
import { keysToCamelCase } from "../../utils/common.js";
import {
  SUPPORTED_COUNTRIES,
  getCountryCode,
  getPostcodeLabel,
  getPostcodeLength,
} from "../city/city.data.js";

class CountryService {
  /**
   * Fetch the countries the app supports (see SUPPORTED_COUNTRIES)
   * @returns {Promise<Array>}
   */
  async getCountries() {
    const { Country } = db.sequelize.models;
    const countries = await Country.findAll({
      where: { name: SUPPORTED_COUNTRIES },
      order: [["name", "ASC"]],
    });

    // postcodeLength lets the forms validate the postcode the way the save will.
    return keysToCamelCase(countries.map(c => c.get({ plain: true }))).map(country => ({
      ...country,
      // Matches timezones.countryCode, so a form can offer only this country's timezones.
      countryCode: getCountryCode(country.name),
      postcodeLength: getPostcodeLength(country.name),
      postcodeLabel: getPostcodeLabel(country.name),
    }));
  }
}

export default new CountryService();
