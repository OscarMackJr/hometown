import crypto from 'node:crypto';
import { SemanticRecord } from './types.js';

export function canonicalize(value: unknown): string {
  return JSON.stringify(sortValue(value));
}

export function sha256Hex(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

export function hashQuestionText(questionText: string): string {
  return sha256Hex(questionText.trim());
}

export function hashAnswerText(answerText: string): string {
  return sha256Hex(answerText);
}

export function hashSemanticRecord(record: SemanticRecord): string {
  return sha256Hex(canonicalize(record));
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => [key, sortValue(nested)])
  );
}