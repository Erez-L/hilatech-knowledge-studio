"use client";

import { Check, Copy, Files, Info, RotateCcw } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import {
  answerToPlainText,
  citedPassageIds,
  conversations,
  documents,
  getConversation,
  getDocument,
  getPassage,
} from "@/sample/northstar";
import { AnswerBlocks } from "@/components/shared/answer-blocks";
import { FileGlyph } from "@/components/shared/file-glyph";
import { LogoMark } from "@/components/shared/logo";
import { useLocatorLabel } from "@/components/shared/source-page";
import type { Message } from "./types";

/* ---------------------------------------------------------------- Empty state */

export function WorkspaceEmptyState({ onAsk }: { onAsk: (conversationId: string) => void }) {
  const t = useTranslations("workspace.empty");
  const locale = useLocale() as Locale;

  return (
    <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col justify-center py-10">
      <h1 className="text-app-title leading-(--leading-heading) font-extrabold tracking-(--tracking-heading)">
        {t("title")}
      </h1>
      <p className="type-lead mt-3 max-w-[36rem]">{t("body")}</p>

      <h2 className="mt-10 mb-3 text-label font-semibold text-tertiary">{t("examples")}</h2>
      <ul className="border-b border-border">
        {conversations.map((conversation) => {
          const firstSource = getPassage(citedPassageIds(conversation.answer[locale])[0]!)!;
          const doc = getDocument(firstSource.documentId)!;
          return (
            <li key={conversation.id} className="border-t border-border">
              <button
                type="button"
                data-example-question={conversation.id}
                onClick={() => onAsk(conversation.id)}
                className="group flex w-full flex-col gap-x-6 gap-y-1.5 py-4 text-start sm:flex-row sm:items-baseline sm:justify-between"
              >
                <span className="text-[1.0625rem] leading-snug font-semibold">
                  <span className="mark-evidence bg-size-[0%_100%]! transition-[background-size] duration-300 ease-out group-hover:bg-size-[100%_100%]! group-focus-visible:bg-size-[100%_100%]!">
                    {conversation.question[locale]}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 text-label text-tertiary">
                  <FileGlyph kind={doc.kind} className="h-6 w-5 pb-0.5 text-[0.4375rem]" />
                  {doc.title[locale]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <h2 className="mt-8 mb-3 text-label font-semibold text-tertiary">{t("docs")}</h2>
      <ul className="flex flex-wrap gap-x-5 gap-y-2">
        {documents.map((doc) => (
          <li key={doc.id} className="flex items-center gap-2 text-small font-medium text-secondary">
            <span aria-hidden className="size-1.5 rounded-full bg-brand" />
            {doc.title[locale]}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------- Messages */

type MessageListProps = {
  messages: Message[];
  activeMessageId: string | null;
  activePassageId: string | null;
  onCite: (messageId: string, passageId: string) => void;
  onShowSources: (messageId: string) => void;
  onRetry: (messageId: string) => void;
  onAsk: (conversationId: string) => void;
};

export function MessageList(props: MessageListProps) {
  const t = useTranslations("workspace");
  return (
    <ol className="mx-auto flex w-full max-w-[46rem] flex-col gap-8 py-8" aria-live="polite">
      {props.messages.map((message) => (
        <li key={message.id}>
          {message.role === "user" && (
            <div className="flex justify-end">
              <p
                dir="auto"
                className="max-w-[85%] rounded-panel rounded-ee-sm bg-bubble px-4 py-3 text-[0.9375rem] leading-normal font-medium whitespace-pre-wrap text-on-bubble [overflow-wrap:anywhere]"
              >
                <span className="sr-only">{t("you")}: </span>
                {message.text}
              </p>
            </div>
          )}
          {message.role === "assistant" && <AssistantMessage message={message} {...props} />}
          {message.role === "notice" && <UnavailableNotice onAsk={props.onAsk} />}
        </li>
      ))}
    </ol>
  );
}

function AssistantMessage({
  message,
  activeMessageId,
  activePassageId,
  onCite,
  onShowSources,
  onRetry,
  onAsk,
}: MessageListProps & { message: Extract<Message, { role: "assistant" }> }) {
  const t = useTranslations("workspace");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const locatorLabel = useLocatorLabel();
  const [copied, setCopied] = useState(false);

  const conversation = getConversation(message.conversationId)!;
  const blocks = conversation.answer[locale];
  const ids = citedPassageIds(blocks);
  const numbers = Object.fromEntries(ids.map((id, i) => [id, i + 1]));
  const done = message.status === "complete";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(answerToPlainText(blocks));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable: leave the button unchanged */
    }
  };

  return (
    <article data-answer-complete={done || undefined} aria-busy={message.status === "revealing"}>
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 text-small font-bold">
          <LogoMark className="size-5" />
          {t("assistant")}
        </span>
        <span className="type-meta rounded-full border border-border-strong px-2 py-0.5 text-secondary">
          {t("preview.answerTag")}
        </span>
      </header>

      <AnswerBlocks
        blocks={blocks}
        visibleBlocks={message.visible}
        numbers={numbers}
        activeId={activeMessageId === message.id ? activePassageId : null}
        onCite={(id) => onCite(message.id, id)}
        citationLabel={(id, n) => {
          const passage = getPassage(id)!;
          const doc = getDocument(passage.documentId)!;
          return tc("citation", { n, title: doc.title[locale], locator: locatorLabel(doc, passage.locator) });
        }}
        className="[&_.answer-block]:animate-[block-in_320ms_var(--ease-out)]"
      />

      {message.status === "revealing" && (
        <div className="mt-4 flex flex-col gap-2" aria-hidden>
          <span className="skeleton h-3.5 w-11/12" />
          <span className="skeleton h-3.5 w-7/12" />
        </div>
      )}

      {message.status === "stopped" && (
        <p className="mt-4 flex items-center gap-2 text-small text-tertiary">
          <Info className="size-4" aria-hidden />
          {t("stopped")}
        </p>
      )}

      {message.status !== "revealing" && (
        <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-border pt-3">
          {done && (
            <button type="button" onClick={() => onShowSources(message.id)} className={actionClass}>
              <Files className="size-4" aria-hidden />
              {t("actions.sources", { count: ids.length })}
            </button>
          )}
          {done && (
            <button type="button" onClick={copy} className={actionClass}>
              {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
              <span aria-live="polite">{copied ? t("actions.copied") : t("actions.copy")}</span>
            </button>
          )}
          <button type="button" onClick={() => onRetry(message.id)} className={actionClass}>
            <RotateCcw className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("actions.retry")}
          </button>
        </div>
      )}

      {done && (
        <div className="mt-6">
          <h3 className="mb-2 text-label font-semibold text-tertiary">{t("followUps")}</h3>
          <ul className="flex flex-col items-start gap-2">
            {conversation.followUps.map((id) => {
              const next = getConversation(id);
              if (!next) return null;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onAsk(id)}
                    className="rounded-control border border-border bg-surface px-3.5 py-2 text-start text-small font-medium transition-colors hover:border-foreground/40 hover:bg-hover"
                  >
                    {next.question[locale]}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}

const actionClass =
  "inline-flex h-9 items-center gap-2 rounded-control px-2.5 text-small font-semibold text-secondary transition-colors hover:bg-hover hover:text-foreground";

function UnavailableNotice({ onAsk }: { onAsk: (conversationId: string) => void }) {
  const t = useTranslations("workspace.unavailable");
  const locale = useLocale() as Locale;
  return (
    <div role="status" className="rounded-panel border border-border-strong bg-surface p-5">
      <h3 className="flex items-center gap-2.5 text-[0.9375rem] font-bold">
        <Info className="size-4.5 shrink-0 text-brand" aria-hidden />
        {t("title")}
      </h3>
      <p className="mt-2 max-w-[60ch] text-small leading-relaxed text-secondary">{t("body")}</p>
      <ul className="mt-4 flex flex-col items-start gap-2">
        {conversations.slice(0, 3).map((conversation) => (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onAsk(conversation.id)}
              className="rounded-control border border-border px-3.5 py-2 text-start text-small font-medium transition-colors hover:border-foreground/40 hover:bg-hover"
            >
              {conversation.question[locale]}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
