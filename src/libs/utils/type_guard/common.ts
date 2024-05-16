// Info Murky (20240505): type guards
export function isStringNumber(value: any): value is string {
  return typeof value === 'string' && !isNaN(Number(value));
}
