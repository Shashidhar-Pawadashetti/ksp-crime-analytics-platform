import { createObjectCsvWriter } from 'csv-writer';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

export async function ensureDir(filePath) {
  await mkdir(dirname(filePath), { recursive: true });
}

export function createCsvWriter(filePath, columns) {
  return createObjectCsvWriter({
    path: filePath,
    header: columns.map(({ id, title }) => ({ id, title })),
  });
}

export async function writeCSV(dataDir, generator) {
  const { FILE_NAME, COLUMNS, generate } = generator;
  const filePath = join(dataDir, FILE_NAME);
  await ensureDir(filePath);

  const records = await generate();
  const writer = createCsvWriter(filePath, COLUMNS);
  await writer.writeRecords(records);

  const count = records.length;
  console.log(`  ${FILE_NAME.padEnd(25)} ${count} records`);

  return { file: FILE_NAME, path: filePath, count, records };
}
