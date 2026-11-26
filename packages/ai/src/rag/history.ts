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
 * Ranks the passages of the two retrieval queries together; each passage appears once, with its
 * best similarity.
 *
 * - When the new question finds good evidence on its own (`standsAlone`), its passages keep their
 *   order and come first; passages found only through the earlier questions follow. A change of
 *   subject therefore answers the new subject, with the earlier one only as extra context.
 * - When it does not (a follow-up such as "and the second one?" names nothing), both lists are
 *   ranked together by similarity, so the earlier subject's passages can lead.
 */
export function mergeRetrieval<T extends { chunkId: string; similarity: number }>(
  primary: T[],
  fromHistory: T[],
  topK: number,
  standsAlone: boolean,
): T[] {
  const best = new Map<string, T>();
  for (const chunk of [...primary, ...fromHistory]) {
    const seen = best.get(chunk.chunkId);
    if (!seen || chunk.similarity > seen.similarity) best.set(chunk.chunkId, chunk);
  }
  const bySimilarity = (x: T, y: T) => y.similarity - x.similarity;
  if (!standsAlone) return [...best.values()].sort(bySimilarity).slice(0, topK);
  const own = new Set(primary.map((chunk) => chunk.chunkId));
  const first = primary.map((chunk) => best.get(chunk.chunkId)!);
  const extra = [...best.values()].filter((chunk) => !own.has(chunk.chunkId)).sort(bySimilarity);
  return [...first, ...extra].slice(0, topK);
}
