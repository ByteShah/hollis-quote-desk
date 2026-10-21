// What each role may do. The database enforces the same rules (RLS policies,
// has_role() checks in functions and triggers); this copy decides what the
// screens offer, so people aren't shown buttons that would only fail.

export type Role = "owner" | "manager" | "estimator";

export const ROLE_LABEL: Record<Role, string> = {
  owner: "Owner",
  manager: "Manager",
  estimator: "Estimator",
};

export const ROLE_HINT: Record<Role, string> = {
  owner: "Everything, including the AI key, company settings and the team.",
  manager: "Quotes, approvals, prices, customers and imports.",
  estimator: "Drafts and edits quotes and customers. Can't approve or change prices.",
};

const RULES = {
  "quote.approve": ["owner", "manager"],
  "rate.edit": ["owner", "manager"],
  "customer.edit": ["owner", "manager", "estimator"],
  "data.import": ["owner", "manager"],
  "data.export": ["owner", "manager"],
  "company.settings": ["owner"],
  "team.manage": ["owner"],
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof RULES;

export function can(role: Role, permission: Permission): boolean {
  return (RULES[permission] as readonly Role[]).includes(role);
}
