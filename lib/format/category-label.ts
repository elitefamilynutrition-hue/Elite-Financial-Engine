/**
 * Turns Plaid PFC codes like `FOOD_AND_DRINK_RESTAURANT` into readable labels.
 */
export function formatCategoryLabel(raw: string | null | undefined): string {
  const value = (raw || '').trim();
  if (!value) return 'Uncategorized';

  // Prefer the first segment when comma-joined legacy categories are present.
  const primary = value.split(',')[0].trim();

  return primary
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}
