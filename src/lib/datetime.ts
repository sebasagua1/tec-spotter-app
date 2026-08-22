/** Combina una fecha (se ignora su hora) con un "HH:MM". */
export function combineDateTime(date: Date, time: string): Date {
  const [hours, mins] = time.split(':').map(Number);
  const d = new Date(date);
  d.setHours(hours || 0, mins || 0, 0, 0);
  return d;
}

/** La hora de un Date en el "HH:MM" que guardan los formularios. */
export function toTimeValue(date: Date): string {
  return `${date.getHours().toString().padStart(2, '0')}:${date
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;
}
