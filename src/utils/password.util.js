import crypto from "crypto";

// Generate strong password
export function generateStrongPassword(length = 12) {
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const digits = "0123456789";

  const all = upper + lower + digits;

  let pwd =
    upper[Math.floor(Math.random() * upper.length)] +
    lower[Math.floor(Math.random() * lower.length)] +
    digits[Math.floor(Math.random() * digits.length)];

  for (let i = 3; i < length; i++) {
    pwd += all[Math.floor(Math.random() * all.length)];
  }

  return pwd
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
}

// Validate password security policy
export function validatePasswordPolicy(password) {
  return (
    typeof password === "string" &&
    password.length >= 8 &&
    /[A-Z]/.test(password) &&
    /[a-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

export default {
  generateStrongPassword,
  validatePasswordPolicy,
};
