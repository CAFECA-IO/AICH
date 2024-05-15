// Info Murky (20240425) - Helper function to convert date strings to timestamps
// will return timestamp of current if input is not valid
export function convertDateToTimestamp(dateStr: string | number): number {
  // 檢查是否為有效的日期字串
  const defaultDateTimestamp = new Date().getTime();
  if (!dateStr) {
    return defaultDateTimestamp;
  }

  if (typeof dateStr === 'number') {
    return dateStr as number;
  }

  function rocYearToAD(rocYear: string, sperator: string): string {
    let modifiedRocYear = rocYear;
    if (rocYear.split(sperator)[0].length < 4) {
      // Info 民國年
      const year = parseInt(rocYear.split(sperator)[0], 10) + 1911;
      modifiedRocYear = `${year}-${rocYear.split(sperator)[1]}-${rocYear.split(sperator)[2]}`;
    }
    return modifiedRocYear;
  }

  let modifiedDateStr = dateStr;
  if (dateStr.includes('/')) {
    modifiedDateStr = rocYearToAD(dateStr, '/');
  } else if (dateStr.includes('-')) {
    modifiedDateStr = rocYearToAD(dateStr, '-');
  }

  const date = new Date(modifiedDateStr);
  const timestamp = date.getTime();

  // 檢查生成的日期是否有效
  if (Number.isNaN(timestamp)) {
    return defaultDateTimestamp;
  }

  return timestamp;
}

// Info Murky (20240425) - Helper function to remove special char from numbers and convert to number type
export function cleanNumber(numberStr: unknown): number {
  if (!numberStr) {
    return 0;
  }

  if (typeof numberStr === 'number') {
    return numberStr;
  }

  if (typeof numberStr !== 'string') {
    return 0;
  }

  return parseFloat(numberStr.replace(/[^\w\s]/gi, ''));
}

export function cleanBoolean(booleanStr: unknown): boolean {
  if (!booleanStr || ['string', 'number'].includes(typeof booleanStr)) {
    return false;
  }

  if (typeof booleanStr === 'boolean') {
    return booleanStr;
  }

  if (booleanStr === 'true') {
    return true;
  }

  if (booleanStr === 'false') {
    return false;
  }

  return false;
}

export function isZero(number: number | string): boolean {
  if (typeof number === 'string') {
    return parseFloat(number) === 0;
  }
  return number === 0;
}
