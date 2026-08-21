import { createHash, randomUUID } from "node:crypto";
import { query, transaction } from "./db";

export type KnowledgeChunk = { content: string; title: string | null; url: string };

export async function searchKnowledge(searchText: string): Promise<KnowledgeChunk[]> {
  try {
    const result = await query<KnowledgeChunk>(
      `SELECT kc.content, ks.title, ks.url
       FROM knowledge_chunks kc
       JOIN knowledge_sources ks ON ks.id = kc.source_id
       WHERE ks.active = TRUE
         AND kc.search_vector @@ websearch_to_tsquery('simple', $1)
       ORDER BY ts_rank(kc.search_vector, websearch_to_tsquery('simple', $1)) DESC
       LIMIT 6`,
      [searchText],
    );
    return result.rows;
  } catch {
    return [];
  }
}

export async function replaceKnowledgeSource(input: { url: string; title: string; text: string }) {
  const contentHash = createHash("sha256").update(input.text).digest("hex");
  const chunks = input.text.match(/.{1,1100}(?:\s|$)/gs)?.map(chunk => chunk.trim()).filter(Boolean) ?? [];
  return transaction(async client => {
    const existing = await client.query<{ id: string; content_hash: string }>("SELECT id, content_hash FROM knowledge_sources WHERE url = $1", [input.url]);
    const sourceId = existing.rows[0]?.id ?? randomUUID();
    if (existing.rows[0]?.content_hash === contentHash) return { changed: false, sourceId, chunks: chunks.length };
    await client.query(
      `INSERT INTO knowledge_sources(id, url, title, content_hash, active, indexed_at)
       VALUES($1, $2, $3, $4, TRUE, NOW())
       ON CONFLICT(url) DO UPDATE SET title = EXCLUDED.title, content_hash = EXCLUDED.content_hash, active = TRUE, indexed_at = NOW()`,
      [sourceId, input.url, input.title, contentHash],
    );
    await client.query("DELETE FROM knowledge_chunks WHERE source_id = $1", [sourceId]);
    for (const [position, content] of chunks.entries()) {
      await client.query("INSERT INTO knowledge_chunks(id, source_id, position, content) VALUES($1, $2, $3, $4)", [randomUUID(), sourceId, position, content]);
    }
    return { changed: true, sourceId, chunks: chunks.length };
  });
}
