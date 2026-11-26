/**
 * Follow-up questions: what the earlier turns of a conversation contribute to a new question.
 *
 * No model call is made here. A follow-up such as "and what about the second one?" names
 * nothing a search can find, so retrieval also runs a second query that carries the earlier
 * questions (see `historyQuery`), and the model receives a short transcript of the earlier turns
 * (see `formatHistory`) so it can tell what the question refers to. The transcript is never a
 * source: citations are still checked against the passages retrieved for this question only.
 */

/** One earlier exchange, oldest first. `answer` is null when no answer was given. */
export type HistoryTurn = { question: string; answer: string | null };

const MAX_QUESTION_CHARS = 400;
const MAX_ANSWER_CHARS = 700;
/** Upper bound of the search query built from the history; well under any embedding limit. */
export const HISTORY_QUERY_MAX_CHARS = 1500;

/** Citation markers of an earlier answer refer to that answer's sources, not to this request's. */
const stripMarkers = (text: string) => text.replace(/\s*\[S\d+\]/g, "");

const clip = (text: string, max: number) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`;
};

/**
 * The text of the second retrieval query: the earlier questions, most recent last, followed by
 * the new one. Earlier answers are left out on purpose: they would pull the search towards the
 * passages already shown, while the questions carry the subject. Returns null when there is no
 * history, so the caller runs only the plain query.
 */
export function historyQuery(question: string, history: HistoryTurn[]): string | null {
  const earlier = history.map((turn) => clip(turn.question, MAX_QUESTION_CHARS)).filter(Boolean);
  if (earlier.length === 0) return null;
  const current = clip(question, HISTORY_QUERY_MAX_CHARS);
  const parts = [...earlier, current];
  // Drop the oldest questions first until the query fits.
  while (parts.length > 1 && parts.join("\n").length > HISTORY_QUERY_MAX_CHARS) parts.shift();
  return parts.length > 1 ? parts.join("\n") : null;
}

/** The earlier turns as short plain text for the model: markers removed, long text clipped. */
export function historyForPrompt(history: HistoryTurn[]): { question: string; answer: string }[] {
  return history
    .map((turn) => ({
      question: clip(turn.question, MAX_QUESTION_CHARS),
      answer: turn.answer ? clip(stripMarkers(turn.answer), MAX_ANSWER_CHARS) : "(no answer was found in the documents)",
    }))
    .filter((turn) => turn.question);
}

/**
 * Pairs the messages of a conversation (oldest first) into question/answer turns and keeps the
 * last `limit`. An assistant reply that failed or was cancelled before any text counts as no answer.
 */
export function pairTurns(
  messages: { role: "user" | "assistant"; content: string; answerStatus?: string | null; status?: string }[],
  limit: number,
): HistoryTurn[] {
  if (limit <= 0) return [];
  const turns: HistoryTurn[] = [];
  for (const message of messages) {
    if (message.role === "user") turns.push({ question: message.content, answer: null });
    else {
      const last = turns.at(-1);
      if (!last || last.answer !== null) continue;
      const usable = message.status !== "failed" && message.answerStatus !== "insufficient_evidence" && message.content.trim();
      last.answer = usable ? message.content : null;
    }
  }
  return turns.slice(-limit);
}

/**
 * Ranks the passages of the two retrieval queries together. A passage found by both keeps its
 * best similarity. The history query's scores are discounted for ranking, so when the user
 * changes the subject the passages for the new question come first; when the new question
 * names nothing on its own, the history query's passages still rise to the top.
 */
export const HISTORY_RANK_WEIGHT = 0.9;

export function mergeRetrieval<T extends { chunkId: string; similarity: number }>(primary: T[], fromHistory: T[], topK: number): T[] {
  const best = new Map<string, { chunk: T; rank: number }>();
  const consider = (chunk: T, rank: number) => {
    const seen = best.get(chunk.chunkId);
    if (!seen) best.set(chunk.chunkId, { chunk, rank });
    else {
      if (chunk.similarity > seen.chunk.similarity) seen.chunk = chunk;
      seen.rank = Math.max(seen.rank, rank);
    }
  };
  for (const chunk of primary) consider(chunk, chunk.similarity);
  for (const chunk of fromHistory) consider(chunk, chunk.similarity * HISTORY_RANK_WEIGHT);
  return [...best.values()]
    .sort((x, y) => y.rank - x.rank || y.chunk.similarity - x.chunk.similarity)
    .slice(0, topK)
    .map((entry) => entry.chunk);
}
