"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Check, Copy, Files, Info, LibraryBig, PanelRightClose, PanelRightOpen, RotateCcw, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { ApiError, type DocumentView, type MessageView, type SourceView } from "@/lib/api";
import { useMediaQuery } from "@/lib/use-media-query";
import { LogoMark } from "@/components/shared/logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChatComposer } from "@/components/workspace/chat-composer";
import { useApp } from "./app-provider";
import { OpenNavigationButton } from "./app-shell";
import { MarkdownAnswer } from "./markdown-answer";
import { GuideSteps } from "./guide-steps";
import { QuestionScope } from "./question-scope";
import { SourceViewer, useLocation, type ViewerTarget } from "./source-viewer";

type UiMessage =
  | { id: string; role: "user"; content: string }
  | {
      id: string;
      role: "assistant";
      content: string;
      status: "streaming" | "complete" | "cancelled" | "failed";
      answerStatus: "answered" | "insufficient_evidence" | "uncited" | null;
      /** "sample": produced by a deterministic test double, not by an AI model. */
      pipelineMode: "live" | "sample" | null;
      sources: SourceView[];
      errorCode?: string;
      question?: string;
    };

type Evidence = { open: boolean; messageId: string | null; label: string | null; target: ViewerTarget | null };
const closedEvidence: Evidence = { open: false, messageId: null, label: null, target: null };

const fromStored = (message: MessageView): UiMessage =>
  message.role === "user"
    ? { id: message.id, role: "user", content: message.content }
    : {
        id: message.id,
        role: "assistant",
        content: message.content,
        status: message.status === "streaming" ? "failed" : message.status,
        answerStatus: message.answerStatus,
        pipelineMode: message.pipelineMode,
        sources: message.citations,
      };

const targetOf = (source: SourceView): ViewerTarget | null =>
  source.documentId && source.sourceState !== "removed"
    ? {
        documentId: source.documentId,
        title: source.documentTitle ?? "",
        fileType: source.fileType ?? (source.pageNumber ? "pdf" : "docx"),
        page: source.pageNumber,
        chunkId: source.chunkId,
      }
    : null;

/** The Knowledge Workspace on real data: questions go to the server, answers stream back, citations open real documents. */
export function AskWorkspace() {
  const t = useTranslations("app");
  const tw = useTranslations("workspace");
  const locale = useLocale() as "he" | "en";
  const router = useRouter();
  const requested = useSearchParams().get("c");
  const reduceMotion = useReducedMotion();
  const inlineEvidence = useMediaQuery("(min-width: 48rem)");
  const { api, scope, homePath, me, conversations, refreshConversations, handleAuthError } = useApp();

  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(Boolean(requested));
  const [evidence, setEvidence] = useState<Evidence>(closedEvidence);
  const [documents, setDocuments] = useState<DocumentView[] | null>(null);
  // Documents the next question is limited to; empty means the whole project.
  const [scopeIds, setScopeIds] = useState<string[]>([]);
  const [usage, setUsage] = useState<{ used: number; limit: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const localId = () => `local-${++counter.current}`;

  const busy = messages.some((m) => m.role === "assistant" && m.status === "streaming");
  const title = conversations?.find((c) => c.id === conversationId)?.title ?? null;
  const answering = me?.pipeline.answering ?? true;
  const sessionReady = scope === "app" || me !== null;

  const refreshUsage = useCallback(() => {
    api.usage().then((u) => setUsage({ used: u.today.questions, limit: u.limits.questionsPerDay })).catch(() => {});
  }, [api]);

  // Load the conversation named in the URL (or reset for a new chat).
  useEffect(() => {
    if (requested === conversationId) return;
    abortRef.current?.abort();
    setEvidence(closedEvidence);
    if (!requested) {
      setConversationId(null);
      setMessages([]);
      setLoading(false);
      return;
    }
    // The demo's anonymous session starts with the status request; wait for it before asking for a conversation.
    if (!sessionReady) return;
    const controller = new AbortController();
    setLoading(true);
    api
      .conversation(requested, controller.signal)
      .then((data) => {
        setConversationId(requested);
        setMessages(data.messages.map(fromStored));
        setLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted || handleAuthError(error)) return;
        setLoading(false); // show the empty workspace rather than a skeleton that never resolves
        router.replace(homePath); // gone, or not ours
      });
    return () => controller.abort();
    // conversationId is intentionally not a dependency: it changes when WE start a conversation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, sessionReady, handleAuthError, router, api, homePath]);

  useEffect(() => {
    const controller = new AbortController();
    api.documents("", controller.signal).then(setDocuments).catch(() => setDocuments([]));
    refreshUsage();
    return () => controller.abort();
  }, [api, refreshUsage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && messages.length) el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, reduceMotion]);

  const patch = (id: string, change: (message: Extract<UiMessage, { role: "assistant" }>) => Partial<Extract<UiMessage, { role: "assistant" }>>) =>
    setMessages((current) => current.map((m) => (m.id === id && m.role === "assistant" ? { ...m, ...change(m) } : m)));

  const send = async (question: string) => {
    if (busy || !answering) return;
    const answerId = localId();
    const controller = new AbortController();
    abortRef.current = controller;
    setMessages((current) => [
      ...current,
      { id: localId(), role: "user", content: question },
      { id: answerId, role: "assistant", content: "", status: "streaming", answerStatus: null, pipelineMode: null, sources: [], question },
    ]);

    try {
      for await (const event of api.ask(
        { question, conversationId: conversationId ?? undefined, locale, documentIds: scopeIds.length ? scopeIds.slice(0, 50) : undefined },
        controller.signal,
      )) {
        if (event.type === "start") {
          patch(answerId, () => ({ pipelineMode: event.pipelineMode }));
          if (!conversationId) {
            setConversationId(event.conversationId);
            // Reflect the new conversation in the URL without reloading it from the server.
            window.history.replaceState(null, "", `${window.location.pathname}?c=${event.conversationId}`);
            void refreshConversations();
          }
        } else if (event.type === "text") patch(answerId, (m) => ({ content: m.content + event.text }));
        else if (event.type === "marker") patch(answerId, (m) => ({ content: `${m.content}[${event.label}]` }));
        else if (event.type === "citation") patch(answerId, (m) => ({ sources: [...m.sources, event.source] }));
        else if (event.type === "done") {
          patch(answerId, (m) => ({
            status: event.status,
            answerStatus: event.answerStatus,
            sources: event.status === "complete" ? event.sources : m.sources,
          }));
        } else if (event.type === "error") patch(answerId, () => ({ status: "failed", errorCode: event.code }));
      }
      // The stream ended without a final event (connection dropped).
      patch(answerId, (m) => (m.status === "streaming" ? { status: "failed", errorCode: "generic" } : {}));
    } catch (error) {
      if (controller.signal.aborted) patch(answerId, () => ({ status: "cancelled" }));
      else if (!handleAuthError(error)) {
        patch(answerId, () => ({ status: "failed", errorCode: error instanceof ApiError ? error.code : "generic" }));
      }
    } finally {
      refreshUsage();
    }
  };

  const stop = () => abortRef.current?.abort();

  /* --------------------------------------------------------------- evidence */

  const evidenceMessage = messages.find((m) => m.id === evidence.messageId);
  const sources = evidenceMessage?.role === "assistant" ? evidenceMessage.sources : [];

  const openSource = (messageId: string, source: SourceView) =>
    setEvidence({ open: true, messageId, label: source.label, target: targetOf(source) });
  const cite = (messageId: string, label: string) => {
    const message = messages.find((m) => m.id === messageId);
    const source = message?.role === "assistant" ? message.sources.find((s) => s.label === label) : undefined;
    if (source) openSource(messageId, source);
  };
  const closeEvidence = () => setEvidence((current) => ({ ...current, open: false }));
  const hasEvidence = evidence.messageId !== null;

  const panel = (
    <SourceViewer
      sources={sources}
      selectedLabel={evidence.label}
      onSelectSource={(source) => evidence.messageId && openSource(evidence.messageId, source)}
      target={evidence.target}
      onNavigate={(target) => setEvidence((current) => ({ ...current, target }))}
    />
  );

  const ready = documents?.filter((d) => d.status === "ready") ?? [];
  const processing = documents?.filter((d) => d.status === "queued" || d.status === "processing") ?? [];

  return (
    <>
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
          <OpenNavigationButton />
          <p dir="auto" className="truncate-start text-[0.9375rem] font-bold">
            {title ?? t("nav.newChat")}
          </p>
          {me?.pipeline.mode === "sample" && (
            <span className="type-meta shrink-0 rounded-full bg-warning-surface px-2.5 py-1 font-medium text-warning">{t("mode.sampleBadge")}</span>
          )}
          {scope === "demo" && (
            <span className="type-meta shrink-0 rounded-full border border-border-strong px-2.5 py-1 font-medium text-secondary">{t("demo.badge")}</span>
          )}
          <span className="flex-1" />
          {hasEvidence && (
            <Button
              variant={evidence.open ? "outline" : "ghost"}
              size="sm"
              aria-expanded={evidence.open}
              aria-controls="evidence-region"
              onClick={() => setEvidence((current) => ({ ...current, open: !current.open }))}
            >
              {evidence.open ? <PanelRightClose className="rtl:-scale-x-100" aria-hidden /> : <PanelRightOpen className="rtl:-scale-x-100" aria-hidden />}
              <span className="max-lg:sr-only">{t("evidence.title")}</span>
            </Button>
          )}
        </header>

        {me?.pipeline.mode === "sample" && (
          <p className="flex shrink-0 items-start gap-2.5 border-b border-border bg-sunken px-4 py-2.5 text-label leading-snug text-secondary sm:px-6">
            <TriangleAlert className="mt-px size-4 shrink-0 text-warning" aria-hidden />
            {t("mode.sampleBanner")}
          </p>
        )}

        <div ref={scrollRef} className="scroll-quiet flex min-h-0 flex-1 flex-col overflow-y-auto px-4 sm:px-8">
          {loading ? (
            <div className="mx-auto flex w-full max-w-[46rem] flex-col gap-4 py-10" role="status" aria-label={t("evidence.loading")}>
              <span className="skeleton ms-auto h-12 w-3/5 rounded-panel" />
              <span className="skeleton h-4 w-11/12" />
              <span className="skeleton h-4 w-4/5" />
              <span className="skeleton h-4 w-2/3" />
            </div>
          ) : messages.length === 0 ? (
            <EmptyState
              ready={ready}
              processing={processing.length}
              loaded={documents !== null}
              unconfigured={me !== null && !answering}
              demo={scope === "demo"}
              onAsk={send}
            />
          ) : (
            <ol className="mx-auto flex w-full max-w-[46rem] flex-col gap-8 py-8">
              {messages.map((message) => (
                <li key={message.id}>
                  {message.role === "user" ? (
                    <div className="flex justify-end">
                      {/* The label sits outside the paragraph: inside it, its language would decide the
                          direction of the whole question and misplace punctuation in the other language. */}
                      <span className="sr-only">{tw("you")}: </span>
                      <p dir="auto" className="max-w-[85%] rounded-panel rounded-ee-sm bg-bubble px-4 py-3 text-[0.9375rem] leading-normal font-medium whitespace-pre-wrap text-on-bubble [overflow-wrap:anywhere]">
                        {message.content}
                      </p>
                    </div>
                  ) : (
                    <Answer
                      message={message}
                      activeLabel={evidence.open && evidence.messageId === message.id ? evidence.label : null}
                      onCite={(label) => cite(message.id, label)}
                      onShowSources={() => message.sources[0] && openSource(message.id, message.sources[0])}
                      onRetry={message.question ? () => send(message.question!) : undefined}
                    />
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        <div className="shrink-0 px-4 pt-2 pb-4 sm:px-8 md:pb-3">
          {scope === "app" && documents ? <QuestionScope documents={documents} selected={scopeIds} onChange={setScopeIds} disabled={busy} /> : null}
          <ChatComposer
            busy={busy}
            onSend={send}
            onStop={stop}
            disabled={!answering}
            footnote={
              scope === "demo" && me
                ? t("demo.usage", { limit: me.limits.questionsPerDay })
                : usage && answering
                  ? t("chat.usage", { used: usage.used, limit: usage.limit })
                  : undefined
            }
          />
        </div>
      </main>

      {inlineEvidence ? (
        <AnimatePresence initial={false}>
          {evidence.open && hasEvidence && (
            <motion.aside
              id="evidence-region"
              aria-label={t("evidence.title")}
              key="evidence"
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "var(--evidence-width)", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={reduceMotion ? { duration: 0 } : { duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              className="shrink-0 overflow-hidden border-s border-border bg-sunken [--evidence-width:clamp(20rem,36vw,30rem)]"
            >
              <div className="flex h-full w-(--evidence-width) flex-col">
                <div className="flex h-16 shrink-0 items-center justify-between border-b border-border ps-5 pe-2">
                  <h2 className="text-[0.9375rem] font-bold">{t("evidence.title")}</h2>
                  <Button variant="ghost" size="icon" aria-label={tw("evidence.close")} onClick={closeEvidence}>
                    <X aria-hidden />
                  </Button>
                </div>
                {panel}
              </div>
            </motion.aside>
          )}
        </AnimatePresence>
      ) : (
        <Sheet open={evidence.open && hasEvidence} onOpenChange={(open) => !open && closeEvidence()}>
          <SheetContent side="bottom" title={t("evidence.title")} closeLabel={tw("evidence.close")} className="h-[86dvh] bg-sunken">
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </>
  );
}

function EmptyState({
  ready,
  processing,
  loaded,
  unconfigured,
  demo,
  onAsk,
}: {
  ready: DocumentView[];
  processing: number;
  loaded: boolean;
  unconfigured: boolean;
  demo: boolean;
  onAsk: (question: string) => void;
}) {
  const t = useTranslations("app");
  const suggestions = demo ? (["refund", "priority", "onboarding", "plans"] as const) : [];
  if (unconfigured) {
    return (
      <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col justify-center py-10">
        <div role="status" className="rounded-panel border border-border-strong bg-surface p-6">
          <h1 className="flex items-center gap-2.5 text-[1.0625rem] font-bold">
            <Info className="size-5 shrink-0 text-brand" aria-hidden />
            {t("mode.unconfiguredTitle")}
          </h1>
          <p className="mt-2 max-w-[60ch] text-secondary">{t("mode.unconfiguredBody")}</p>
        </div>
      </div>
    );
  }
  const noDocuments = loaded && ready.length === 0 && processing === 0;
  return (
    <div className="ruled-ground -mx-4 flex flex-1 flex-col px-4 sm:-mx-8 sm:px-8">
      <div className="mx-auto flex w-full max-w-[46rem] flex-1 flex-col justify-center py-10">
        <h1 className="text-app-title leading-(--leading-heading) font-extrabold tracking-(--tracking-heading)">
          {demo ? t("demo.emptyTitle") : noDocuments ? t("empty.noDocsTitle") : t("empty.title")}
        </h1>
        <p className="type-lead mt-3 max-w-[36rem]">{demo ? t("demo.emptyBody") : noDocuments ? t("empty.noDocsBody") : t("empty.body")}</p>
        {!demo ? <GuideSteps compact className="mt-8" /> : null}

        {!loaded ? (
          <div className="mt-10 flex flex-col gap-3" aria-hidden>
            <span className="skeleton h-4 w-40" />
            <span className="skeleton h-4 w-72" />
          </div>
        ) : noDocuments ? (
          <div className="mt-8">
            <Button asChild size="lg">
              <Link href="/app/library">
                <LibraryBig aria-hidden />
                {t("empty.goLibrary")}
              </Link>
            </Button>
          </div>
        ) : (
          <div className="mt-10">
            {suggestions.length > 0 && (
              <>
                <h2 className="mb-3 text-label font-semibold text-tertiary">{t("demo.suggestionsTitle")}</h2>
                <ul className="mb-10 border-b border-border">
                  {suggestions.map((key) => (
                    <li key={key} className="border-t border-border">
                      <button
                        type="button"
                        data-suggested-question={key}
                        onClick={() => onAsk(t(`demo.suggestions.${key}`))}
                        className="group w-full py-4 text-start text-[1.0625rem] leading-snug font-semibold"
                      >
                        <span className="mark-evidence bg-size-[0%_100%]! transition-[background-size] duration-300 ease-out group-hover:bg-size-[100%_100%]! group-focus-visible:bg-size-[100%_100%]!">
                          {t(`demo.suggestions.${key}`)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h2 className="mb-3 text-label font-semibold text-tertiary">{t("empty.docsReady", { count: ready.length })}</h2>
            <ul className="border-b border-border">
              {ready.slice(0, demo ? 12 : 6).map((doc) => (
                <li key={doc.id} dir="auto" className="flex items-baseline justify-between gap-6 border-t border-border py-3 text-[0.9375rem] font-semibold">
                  <span className="truncate-start">{doc.title}</span>
                  <span className="type-meta shrink-0 font-normal text-tertiary uppercase">{doc.fileType}</span>
                </li>
              ))}
            </ul>
            {processing > 0 && <p className="mt-3 text-small text-secondary">{t("empty.docsProcessing", { count: processing })}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function Answer({
  message,
  activeLabel,
  onCite,
  onShowSources,
  onRetry,
}: {
  message: Extract<UiMessage, { role: "assistant" }>;
  activeLabel: string | null;
  onCite: (label: string) => void;
  onShowSources: () => void;
  onRetry?: () => void;
}) {
  const t = useTranslations("app");
  const tw = useTranslations("workspace");
  const tc = useTranslations("common");
  const location = useLocation();
  const [copied, setCopied] = useState(false);
  const numbers = useMemo(() => Object.fromEntries(message.sources.map((s) => [s.label, s.ordinal])), [message.sources]);
  const streaming = message.status === "streaming";
  const insufficient = message.answerStatus === "insufficient_evidence";
  const errorKey = (["rate_limited", "budget_exceeded", "provider_not_configured", "provider_error", "unauthenticated", "not_found"] as const).find(
    (code) => code === message.errorCode,
  );
  const { scope } = useApp();
  const errorText =
    scope === "demo" && errorKey === "budget_exceeded"
      ? t("demo.limitReached")
      : errorKey
        ? t(`chat.errors.${errorKey}`)
        : message.errorCode
          ? t("chat.errors.generic")
          : t("chat.failed");

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message.content.replace(/\[S\d{1,3}\]/g, "").replace(/ {2,}/g, " ").trim());
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <article data-answer-status={message.status} aria-busy={streaming}>
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 text-small font-bold">
          <LogoMark className="size-5" />
          {tw("assistant")}
        </span>
        {message.pipelineMode === "sample" && (
          <span className="type-meta rounded-full border border-warning/50 px-2 py-0.5 text-warning">{t("mode.sampleAnswerTag")}</span>
        )}
      </header>

      {insufficient ? (
        <p className="text-body leading-(--leading-body)">{t("chat.insufficient")}</p>
      ) : (
        <MarkdownAnswer
          content={message.content}
          numbers={numbers}
          activeLabel={activeLabel}
          onCite={onCite}
          citationLabel={(label, n) => {
            const source = message.sources.find((s) => s.label === label);
            return tc("citation", { n, title: source?.documentTitle ?? "", locator: (source && location(source)) ?? "" });
          }}
        />
      )}

      {streaming && (
        <div className="mt-4 flex flex-col gap-2" role="status">
          {!message.content && <span className="text-small text-tertiary">{t("chat.thinking")}</span>}
          <span className="skeleton h-3.5 w-11/12" aria-hidden />
          <span className="skeleton h-3.5 w-7/12" aria-hidden />
        </div>
      )}

      {message.status === "complete" && message.answerStatus === "uncited" && (
        <p className="mt-4 flex gap-2.5 rounded-control border border-warning/40 bg-warning-surface px-4 py-3 text-small text-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("chat.uncited")}
        </p>
      )}
      {message.status === "cancelled" && (
        <p className="mt-4 flex items-center gap-2 text-small text-tertiary">
          <Info className="size-4" aria-hidden />
          {t("chat.cancelled")}
        </p>
      )}
      {message.status === "failed" && (
        <div role="alert" className="mt-4 flex flex-wrap items-center gap-3 rounded-control border border-danger/40 bg-danger-surface px-4 py-3 text-small text-danger">
          <TriangleAlert className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{errorText}</span>
          {onRetry && (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RotateCcw className="rtl:-scale-x-100" aria-hidden />
              {t("chat.retry")}
            </Button>
          )}
        </div>
      )}

      {message.status === "complete" && !insufficient && message.content && (
        <div className="mt-5 flex flex-wrap items-center gap-1 border-t border-border pt-3">
          {message.sources.length > 0 && (
            <button type="button" onClick={onShowSources} className={actionClass}>
              <Files className="size-4" aria-hidden />
              {tw("actions.sources", { count: message.sources.length })}
            </button>
          )}
          <button type="button" onClick={copy} className={actionClass}>
            {copied ? <Check className="size-4 text-success" aria-hidden /> : <Copy className="size-4" aria-hidden />}
            <span aria-live="polite">{copied ? tw("actions.copied") : tw("actions.copy")}</span>
          </button>
        </div>
      )}
    </article>
  );
}

const actionClass =
  "inline-flex h-9 items-center gap-2 rounded-control px-2.5 text-small font-semibold text-secondary transition-colors hover:bg-hover hover:text-foreground";
