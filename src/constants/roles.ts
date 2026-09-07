export const BUSINESS_ROLES = {
  OWNER: "OWNER",
  ADMIN: "ADMIN",
  MEMBER: "MEMBER",
} as const;

export type BusinessRole =
  (typeof BUSINESS_ROLES)[keyof typeof BUSINESS_ROLES];

export const ALL_BUSINESS_ROLES: BusinessRole[] = [
  BUSINESS_ROLES.OWNER,
  BUSINESS_ROLES.ADMIN,
  BUSINESS_ROLES.MEMBER,
];
