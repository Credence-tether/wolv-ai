import { createHash, randomUUID } from "node:crypto";
import { getAIProvider } from "./ai";
import { query, transaction } from "./db";
import { env } from "./env";

export type KnowledgeChunk = { content: string; title: string | null; url: string };

export async function searchKnowledge(searchText: string): Promise<KnowledgeChunk[]> {
  try {
    const [embedding] = await getAIProvider().embed([searchText]);
    const result = await query<KnowledgeChunk>(
      `SELECT kc.content, ks.title, ks.url
       FROM knowledge_chunks kc
       JOIN knowledge_sources ks ON ks.id = kc.source_id
       WHERE ks.active = TRUE AND kc.embedding IS NOT NULL
       ORDER BY kc.embedding <=> $1::vector
       LIMIT 6`,
      [toVectorLiteral(embedding)],
    );
    if (result.rows.length) return result.rows;
  } catch {
    // Keyword retrieval remains available while embedding configuration is absent.
  }
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
  const existing = await query<{ id: string; content_hash: string }>("SELECT id, content_hash FROM knowledge_sources WHERE url = $1", [input.url]);
  if (existing.rows[0]?.content_hash === contentHash) return { changed: false, sourceId: existing.rows[0].id, chunks: chunks.length };
  let embeddings: number[][] | undefined;
  try {
    const candidateEmbeddings = await getAIProvider().embed(chunks);
    if (candidateEmbeddings.some(embedding => embedding.length !== env.ai.embeddingDimensions)) throw new Error("Embedding dimensions do not match the pgvector column.");
    embeddings = candidateEmbeddings;
  } catch {
    // Keep indexing usable for installations that have not configured embeddings yet.
  }
  return transaction(async client => {
    const sourceId = existing.rows[0]?.id ?? randomUUID();
    await client.query(
      `INSERT INTO knowledge_sources(id, url, title, content_hash, active, indexed_at)
       VALUES($1, $2, $3, $4, TRUE, NOW())
       ON CONFLICT(url) DO UPDATE SET title = EXCLUDED.title, content_hash = EXCLUDED.content_hash, active = TRUE, indexed_at = NOW()`,
      [sourceId, input.url, input.title, contentHash],
    );
    await client.query("DELETE FROM knowledge_chunks WHERE source_id = $1", [sourceId]);
    for (const [position, content] of chunks.entries()) {
      await client.query("INSERT INTO knowledge_chunks(id, source_id, position, content, embedding) VALUES($1, $2, $3, $4, $5::vector)", [randomUUID(), sourceId, position, content, embeddings ? toVectorLiteral(embeddings[position]) : null]);
    }
    return { changed: true, sourceId, chunks: chunks.length };
  });
}

function toVectorLiteral(values: number[]) {
  if (!values.length || values.some(value => !Number.isFinite(value))) throw new Error("Embedding contains invalid values.");
  return `[${values.join(",")}]`;
}
