export function generateCode(name = "default", type = "default") {
  const prefix = name.substring(0, 2).toUpperCase();

  const typeMap = {
    quotation: "Q",
    lead: "L",
    default: "D",
  };
  const typeCode = typeMap[type.toLowerCase()] || type.substring(0, 1).toUpperCase();

  const randomNum = String(Math.floor(Math.random() * 10000)).padStart(4, "0");

  return `${prefix}${typeCode}${randomNum}`;
}

export function generateInvoiceCode(name = "default", type = "default", versionNumber = 1) {
  const prefix = name.substring(0, 2).toUpperCase();

  const typeMap = {
    invoice: "I",
    default: "D",
  };
  const typeCode = typeMap[type.toLowerCase()] || type.substring(0, 1).toUpperCase();

  const randomNum = String(Math.floor(Math.random() * 10000)).padStart(4, "0");

  return `${prefix}${typeCode}${randomNum}-I${versionNumber}`;
}

export default { generateCode, generateInvoiceCode };
