/**
 * The platform's own identity.
 *
 * Mobile Dinners needs a staff account of its own to administer the platform,
 * and `staff.org_id` is NOT NULL, so that account has to belong to something.
 * It belongs to this org — a real row that is deliberately not a restaurant:
 * it accepts no orders, publishes no menu, and is filtered out of the merchant
 * views so it never reads as a customer of ours.
 *
 * PLATFORM_ADMIN_EMAIL is an administrator wherever it signs in, without
 * MD_ADMIN_EMAILS being set. That is a convenience with a real cost, and it is
 * worth being plain about it: this repository is PUBLIC, so the address is
 * known to anyone who looks. Nothing protects this account except its
 * password, which is why nothing in this codebase ever sets one for it — see
 * scripts/create-admin.cjs, which refuses to create it in production without
 * MD_ADMIN_PASSWORD and will not accept the published demo password.
 */

export const PLATFORM_ORG_ID = "org_platform";
export const PLATFORM_ORG_SLUG = "mobile-dinners-platform";

/** Always a platform administrator, no environment variable required. */
export const PLATFORM_ADMIN_EMAIL = "admin@mobiledinners.com";
