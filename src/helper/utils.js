export default function isAuthorized(roles, requiredRoles) {
  console.log("►►► ~ requiredRoles:", requiredRoles);
  const rolesArray =
    typeof roles === "string"
      ? roles.replace(/[{}]/g, "").split(",").map((role) => role.trim())
      : roles;
  console.log("►►► ~ isAuthorized ~ rolesArray:", rolesArray);

  return rolesArray?.some((role) => requiredRoles.includes(role));
}
