import { readFile, writeFile } from 'node:fs/promises';
import { z } from 'zod';
import { gradeSchema, packSchema, rubricResponseSchema } from '../shared/core/src/contracts.ts';

for (const [filename, schema] of [
  ['grading-pack.v1.json', packSchema],
  ['grading-result.v1.json', gradeSchema],
  ['rubric-response.v1.json', rubricResponseSchema],
]) {
  const path = new URL(`../shared/schemas/${filename}`, import.meta.url);
  const contents = JSON.stringify(z.toJSONSchema(schema), null, 2) + '\n';
  if (process.argv.includes('--check')) {
    if (await readFile(path, 'utf8') !== contents) {
      console.error(`${filename} is out of date. Run node scripts/contracts.mjs.`);
      process.exitCode = 1;
    }
  } else {
    await writeFile(path, contents);
  }
}
