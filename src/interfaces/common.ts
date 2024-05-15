// Info Murky (20240505): type guards
export function isStringNumber(value: any): value is string {
  return typeof value === 'string' && !isNaN(Number(value));
}

// Info Murky (20240505): type cleaner
export function toString(value: any): string {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch (e) {
      return '[object Object]';
    }
  }
  return String(value);
}
