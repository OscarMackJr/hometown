import * as fs from 'fs/promises';
import * as path from 'path';
import { AnswerTraceSchema } from './trace.js';
export class FileAnswerTraceWriter {
    filePath;
    constructor(filePath) {
        this.filePath = filePath;
    }
    async write(trace) {
        const parsed = AnswerTraceSchema.parse(trace);
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        await fs.appendFile(this.filePath, `${JSON.stringify(parsed)}\n`, 'utf8');
    }
}
export async function readJsonlTraces(filePath) {
    const content = await fs.readFile(filePath, 'utf8');
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => AnswerTraceSchema.parse(JSON.parse(line)));
}
