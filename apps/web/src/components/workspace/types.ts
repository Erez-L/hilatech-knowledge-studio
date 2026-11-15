export type Message =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      conversationId: string;
      status: "revealing" | "complete" | "stopped";
      /** Number of answer blocks currently shown. */
      visible: number;
    }
  | { id: string; role: "notice" };

export type EvidenceState = {
  open: boolean;
  /** The assistant message whose sources are listed. */
  messageId: string | null;
  /** The cited passage that is selected, if any. */
  passageId: string | null;
  /** The document and location shown in the viewer. */
  documentId: string | null;
  locator: string | null;
};
