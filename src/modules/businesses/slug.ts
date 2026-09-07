/**
 * Lowercase ASCII slug: letters, digits, hyphens.
 */
export function slugifyBusinessName(name: string): string {
  const ascii = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9\s-]/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

  const clipped = ascii.slice(0, 100);
  return clipped.length > 0 ? clipped : "business";
}

/**
 * Builds a uniqueness candidate from a base slug.
 * attempt 0 = base; attempts 1..49 append -2, -3, ...
 */
export function buildUniqueSlugCandidate(
  baseSlug: string,
  attempt: number,
): string {
  if (attempt <= 0) {
    return baseSlug;
  }
  return `${baseSlug.slice(0, 90)}-${attempt + 1}`;
}
