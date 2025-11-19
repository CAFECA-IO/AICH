import { randomBytes } from 'crypto';

const randomHex = (length = 8): string => {
  const byteLength = Math.ceil(length / 2);
  return randomBytes(byteLength).toString('hex').slice(0, length);
};

export { randomHex };
