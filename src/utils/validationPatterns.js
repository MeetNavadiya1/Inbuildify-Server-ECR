// Names and addresses accept any character, special characters included (& ' ( ) / # , é …),
// except < and > so markup can't be stored. Mirrors CRMSimplify's formInputValidations.

/** At least one letter (any script); anything but < and >. */
export const NAME_PATTERN = /^(?=.*\p{L})[^<>]+$/u;
export const NAME_PATTERN_MESSAGE = "Name must contain at least one letter and cannot contain < or >";

/** At least one letter or digit (any script); anything but < and >. */
export const ADDRESS_PATTERN = /^(?=.*[\p{L}\p{N}])[^<>]+$/u;
export const ADDRESS_PATTERN_MESSAGE =
  "Address must contain at least one letter or number and cannot contain < or >";
