import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// simplificação: fotos no disco do servidor do app, trocar por armazenamento de objetos (S3/Bunny Storage) quando houver mais de uma instância
export const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');

export const IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export async function saveUpload(data: Buffer, ext: string) {
  await mkdir(UPLOAD_DIR, { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await writeFile(path.join(UPLOAD_DIR, name), data);
  return `/api/uploads/${name}`;
}

export async function readUpload(name: string) {
  if (!/^[0-9a-f-]{36}\.(jpg|png|webp|pdf)$/.test(name)) return null;
  try {
    return await readFile(path.join(UPLOAD_DIR, name));
  } catch {
    return null;
  }
}
