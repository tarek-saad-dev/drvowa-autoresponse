// Pure policy shared by capture and AI gates. Never guess an opaque LID's phone.
export function normalizePrivatePhone(input: string): string | null {
  const value = input.trim().replace(/[\s()-]/g, "");
  return /^\+?[1-9]\d{7,14}$/.test(value) ? value.replace(/^\+/, "") : null;
}
export function isPrivateContactBlocked(phones: readonly string[], phone: string | null | undefined): boolean {
  if (!phones.length) return false;
  const normalized = phone ? normalizePrivatePhone(phone) : null;
  // An unresolved identity cannot safely be distinguished from a private contact.
  return !normalized || phones.includes(normalized);
}
