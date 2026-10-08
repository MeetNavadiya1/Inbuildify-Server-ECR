
import pkg from "lodash";

const { replace } = pkg;

export default (validationMessageArray) => {
  return validationMessageArray.reduce((obj, item) => {
    const newObj = obj;
    newObj[item.path[0]] = replace(item.message, /"/g, "");
    return newObj;
  }, {});
};
