import { sql } from "drizzle-orm";
import type { Executor, TenantContext } from "./client.ts";

export type RetrievedChunk = {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  fileType: string;
  chunkIndex: number;
  pageNumber: number | null;
  pageEnd: number | null;
  sectionPath: string[] | null;
  text: string;
  tokenEstimate: number;
  similarity: number;
};

/** Below this many vectors in a workspace, search is exact. */
export const EXACT_SEARCH_MAX_ROWS = 20_000;

/**
 * Nearest chunks to `queryVector` within ONE workspace and ONE embedding index.
 *
 * Tenant filtering happens before ranking, never after: the candidate set is
 * the workspace's own rows. For workspaces up to EXACT_SEARCH_MAX_ROWS the
 * search is exact (a materialized tenant subset, then a sort), which also
 * avoids the known pgvector behaviour where a filtered approximate scan can
 * return fewer rows than requested. Larger workspaces use the HNSW index with
 * a raised ef_search and over-fetching; that path is not yet load-tested.
 */
export async function searchChunks(
  tx: Executor,
  ctx: TenantContext,
  input: { embeddingIndexId: string; queryVector: number[]; topK: number; documentIds?: string[] },
): Promise<RetrievedChunk[]> {
  // Optional narrowing to chosen documents. Ids are applied inside the tenant and workspace
  // filter, so an id from elsewhere simply matches nothing.
  const scope = input.documentIds?.length
    ? sql` and e.chunk_id in (select id from document_chunks where document_id in (${sql.join(input.documentIds.map((id) => sql`${id}::uuid`), sql`, `)}))`
    : sql``;
  const vector = `[${input.queryVector.join(",")}]`;
  const tenant = sql`e.organization_id = ${ctx.organizationId}::uuid
    and e.workspace_id = ${ctx.workspaceId}::uuid
    and e.embedding_index_id = ${input.embeddingIndexId}::uuid${scope}`;

  const counted = await tx.execute<{ n: string }>(
    sql`select count(*)::text as n from (select 1 from chunk_embeddings e where ${tenant} limit ${EXACT_SEARCH_MAX_ROWS + 1}) s`,
  );
  const exact = Number(counted.rows[0]?.n ?? 0) <= EXACT_SEARCH_MAX_ROWS;

  const nearest = exact
    ? sql`with scoped as materialized (
            select e.chunk_id, e.embedding from chunk_embeddings e where ${tenant}
          )
          select chunk_id, 1 - (embedding <=> ${vector}::vector) as similarity
          from scoped order by embedding <=> ${vector}::vector limit ${input.topK}`
    : sql`select e.chunk_id, 1 - (e.embedding <=> ${vector}::vector) as similarity
          from chunk_embeddings e where ${tenant}
          order by e.embedding <=> ${vector}::vector limit ${input.topK}`;

  if (!exact) await tx.execute(sql`set local hnsw.ef_search = 400`);

  const result = await tx.execute<{
    chunk_id: string;
    document_id: string;
    document_title: string;
    file_type: string;
    chunk_index: number;
    page_number: number | null;
    page_end: number | null;
    section_path: string[] | null;
    text: string;
    token_estimate: number;
    similarity: number;
  }>(sql`
    select c.id as chunk_id, c.document_id, d.title as document_title, d.file_type, c.chunk_index,
           c.page_number, c.page_end, c.section_path, c.text, c.token_estimate, n.similarity
    from (${nearest}) n
    join document_chunks c on c.id = n.chunk_id
    join documents d on d.id = c.document_id
    where c.organization_id = ${ctx.organizationId}::uuid
      and c.workspace_id = ${ctx.workspaceId}::uuid
      and d.status = 'ready'
    order by n.similarity desc
  `);

  return result.rows.map((row) => ({
    chunkId: row.chunk_id,
    documentId: row.document_id,
    documentTitle: row.document_title,
    fileType: row.file_type,
    chunkIndex: row.chunk_index,
    pageNumber: row.page_number,
    pageEnd: row.page_end,
    sectionPath: row.section_path,
    text: row.text,
    tokenEstimate: row.token_estimate,
    similarity: Number(row.similarity),
  }));
}
