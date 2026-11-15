// "2027-01-04T09:00:00-08:00" -> "2027-01-04T09:00" (for datetime-local inputs)
export function toDateTimeInput(iso: string): string {
  // If it is already a plain date, add a default time.
  if (iso.length === 10) return `${iso}T09:00`;
  // Use the clock time written in the string itself, so we avoid timezone shifts.
  return iso.slice(0, 16);
}

// "2027-01-04" or "2027-01-04T09:00..." -> "2027-01-04" (for date inputs)
export function toDateInput(iso: string): string {
  return iso.slice(0, 10);
}