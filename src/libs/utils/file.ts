import { BASE_STORAGE_FOLDER, FileFolder } from '@/constants/file';
import { promises as fs } from 'fs';
import { randomUUID, createHash } from 'crypto';
import * as mime from 'mime-types';
import * as path from 'path';

export async function saveTemporaryFile(
  folder: FileFolder,
  file: Express.Multer.File,
  fileHashName?: string,
) {
  if (!fileHashName) {
    const uuid = randomUUID();
    const hash = createHash('md5');
    fileHashName = hash.update(uuid).digest('hex').toLocaleLowerCase();
  }

  let extension = mime.extension(file.mimetype);
  if (!extension) {
    extension = 'jpg';
  }
  const fileName = fileHashName;
  const folderPath = path.join(BASE_STORAGE_FOLDER, folder, fileName);

  try {
    await fs.writeFile(folderPath, file.buffer);
  } catch (error) {
    console.error('Error happen in utils/file', error);
  }

  return {
    folderPath,
    fileName,
    extension,
  };
}

export async function deleteTemporaryFile(filePath: string) {
  let isSuccessful = true;
  try {
    await fs.unlink(filePath);
  } catch (error) {
    console.error('Error happen in utils/file', error);
    isSuccessful = false;
  }
  return isSuccessful;
}
