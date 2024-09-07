import * as path from 'path';

const homePath =
  process.env[process.platform == 'win32' ? 'USERPROFILE' : 'HOME'];

export const BASE_STORAGE_FOLDER =
  process.env.BASE_STORAGE_PATH?.replace('${HOME}', homePath) || '.';

export enum FileFolder {
  INVOICE = 'invoice',
  KYC = 'kyc',
  TMP = 'tmp',
}

export const UPLOAD_IMAGE_FOLDERS_TO_CREATE_WHEN_START_SERVER = Object.values(
  FileFolder,
).map((folder) => path.join(BASE_STORAGE_FOLDER, folder));
