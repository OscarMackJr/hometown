import * as fs from 'fs/promises';
import * as path from 'path';
import { AnswerTrace, AnswerTraceSchema, IAnswerTraceWriter } from './trace.js';

export class FileAnswerTraceWriter implements IAnswerTraceWriter {
  public constructor(private readonly filePath: string) {}

  public async write(trace: AnswerTrace): Promise<void> {
    const parsed = AnswerTraceSchema.parse(trace);
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    await fs.appendFile(this.filePath, `${JSON.stringify(parsed)}\n`, 'utf8');
  }
}

export async function readJsonlTraces(filePath: string): Promise<AnswerTrace[]> {
  const content = await fs.readFile(filePath, 'utf8');
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => AnswerTraceSchema.parse(JSON.parse(line)));
}