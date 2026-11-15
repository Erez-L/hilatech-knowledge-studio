import { INSUFFICIENT_EVIDENCE } from "./prompt.ts";

export type AnswerEvent = { type: "text"; text: string } | { type: "citation"; label: string };

const GROUP = /\[\s*(S\d{1,3}(?:\s*[,;]\s*S\d{1,3})*)\s*\]/g;
/** Longest text that could still become a citation group, e.g. "[S12, S13, S14]". */
const MAX_PENDING = 40;

/**
 * Filters a model's text stream so that only citations to sources actually
 * supplied in the request survive.
 *
 * - `[S2]` where S2 was supplied → a `citation` event.
 * - `[S9]` where S9 was not supplied → dropped. It never reaches the client
 *   and can never become a link.
 * - Text is held back only while it might be the start of a citation or of
 *   the insufficient-evidence marker, so streaming stays responsive.
 */
export class CitationStreamFilter {
  private buffer = "";
  private started = false;
  private readonly cited: string[] = [];
  private text = "";
  insufficient = false;

  constructor(private readonly allowed: ReadonlySet<string>) {}

  push(delta: string): AnswerEvent[] {
    if (this.insufficient) return [];
    this.buffer += delta;

    if (!this.started) {
      const head = this.buffer.trimStart();
      // Wait until we know whether the answer is the insufficient-evidence marker.
      if (INSUFFICIENT_EVIDENCE.startsWith(head) && head.length < INSUFFICIENT_EVIDENCE.length) return [];
      if (head.startsWith(INSUFFICIENT_EVIDENCE)) {
        this.insufficient = true;
        this.buffer = "";
        return [];
      }
      this.started = true;
    }

    // Keep back an unfinished "[..." that could still turn into a citation.
    const open = this.buffer.lastIndexOf("[");
    const unfinished = open !== -1 && !this.buffer.includes("]", open) && this.buffer.length - open <= MAX_PENDING;
    const ready = unfinished ? this.buffer.slice(0, open) : this.buffer;
    this.buffer = unfinished ? this.buffer.slice(open) : "";
    return this.emit(ready);
  }

  end(): AnswerEvent[] {
    if (this.insufficient) return [];
    if (!this.started && this.buffer.trim() === INSUFFICIENT_EVIDENCE) {
      this.insufficient = true;
      return [];
    }
    const rest = this.buffer;
    this.buffer = "";
    return this.emit(rest);
  }

  /** Labels cited so far, in order of first appearance. */
  get citedLabels(): string[] {
    return [...this.cited];
  }

  /** The answer as stored: text with validated `[S1]` markers only. */
  get content(): string {
    return this.text.trim();
  }

  private emit(segment: string): AnswerEvent[] {
    const events: AnswerEvent[] = [];
    const pushText = (text: string) => {
      if (!text) return;
      this.text += text;
      events.push({ type: "text", text });
    };
    let cursor = 0;
    for (const match of segment.matchAll(GROUP)) {
      pushText(segment.slice(cursor, match.index));
      for (const label of match[1]!.split(/[,;]/).map((part) => part.trim())) {
        if (!this.allowed.has(label)) continue; // unknown label: dropped
        if (!this.cited.includes(label)) this.cited.push(label);
        this.text += `[${label}]`;
        events.push({ type: "citation", label });
      }
      cursor = match.index + match[0].length;
    }
    pushText(segment.slice(cursor));
    return events;
  }
}
