import { createAccessControl } from "better-auth/plugins/access";

const statement = {
  user: ["create", "read", "update", "delete", "list", "invite"],
  dashboard: ["read"],
  bi: ["read"],
  configuracion: ["read", "update"],
} as const;

export const ac = createAccessControl(statement);

export const ceoRole = ac.newRole({
  user: ["create", "read", "update", "delete", "list", "invite"],
  dashboard: ["read"],
  bi: ["read"],
  configuracion: ["read", "update"],
});

export const adminRole = ac.newRole({
  user: ["create", "read", "update", "delete", "list", "invite"],
  dashboard: ["read"],
  bi: ["read"],
  configuracion: ["read", "update"],
});

export const comercialRole = ac.newRole({
  user: ["read"],
  dashboard: ["read"],
});
