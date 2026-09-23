import {
  KNOWLEDGE_INGEST_CHUNK_OVERLAP,
  KNOWLEDGE_INGEST_CHUNK_SIZE,
} from "./constants";

/**
 * Split large paste into overlapping chunks on paragraph boundaries when possible.
 */
export function chunkText(
  input: string,
  chunkSize = KNOWLEDGE_INGEST_CHUNK_SIZE,
  overlap = KNOWLEDGE_INGEST_CHUNK_OVERLAP,
): string[] {
  const text = input.trim();
  if (!text) return [];
  if (text.length <= chunkSize) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length);
    if (end < text.length) {
      const slice = text.slice(start, end);
      const paraBreak = Math.max(
        slice.lastIndexOf("\n\n"),
        slice.lastIndexOf("\n"),
      );
      if (paraBreak > chunkSize * 0.4) {
        end = start + paraBreak;
      }
    }
    const piece = text.slice(start, end).trim();
    if (piece) chunks.push(piece);
    if (end >= text.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}
