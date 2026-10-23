export function relativeActivityLabel(value: Date | string | null | undefined): string {
  if (!value) return "مفيش نشاط لسه";
  const diffMs = Date.now() - new Date(value).getTime();
  if (!Number.isFinite(diffMs)) return "مفيش نشاط لسه";
  const minutes = Math.max(0, Math.floor(diffMs / 60_000));
  if (minutes < 1) return "دلوقتي";
  if (minutes < 60) return `منذ ${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `منذ ${hours} ساعة`;
  const days = Math.floor(hours / 24);
  return `منذ ${days} يوم`;
}
