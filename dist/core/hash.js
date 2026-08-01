import crypto from 'node:crypto';
export function canonicalize(value) {
    return JSON.stringify(sortValue(value));
}
export function sha256Hex(value) {
    return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}
export function hashQuestionText(questionText) {
    return sha256Hex(questionText.trim());
}
export function hashAnswerText(answerText) {
    return sha256Hex(answerText);
}
export function hashSemanticRecord(record) {
    return sha256Hex(canonicalize(record));
}
function sortValue(value) {
    if (Array.isArray(value))
        return value.map(sortValue);
    if (!value || typeof value !== 'object')
        return value;
    return Object.fromEntries(Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortValue(nested)]));
}
