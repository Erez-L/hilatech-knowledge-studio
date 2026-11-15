"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, PanelRightClose, PanelRightOpen, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Locale } from "@/i18n/routing";
import { citedPassageIds, getConversation, getPassage, passages, type Passage } from "@/sample/northstar";
import { useMediaQuery } from "@/lib/use-media-query";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ChatComposer } from "./chat-composer";
import { MessageList, WorkspaceEmptyState } from "./conversation";
import { EvidencePanel } from "./evidence-panel";
import type { EvidenceState, Message } from "./types";
import { WorkspaceSidebar } from "./workspace-sidebar";

const REVEAL_INTERVAL_MS = 420;
const closedEvidence: EvidenceState = { open: false, messageId: null, passageId: null, documentId: null, locator: null };

/**
 * The Knowledge Workspace in SAMPLE-PREVIEW mode.
 *
 * Nothing here calls a model. Example questions replay pre-written answers
 * from `@/sample/northstar`, revealed block by block; the UI labels them as
 * pre-written at all times. Typed questions are not answered.
 */
export function KnowledgeWorkspace() {
  const t = useTranslations("workspace");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const reduceMotion = useReducedMotion();
  const inlineEvidence = useMediaQuery("(min-width: 48rem)");

  const [messages, setMessages] = useState<Message[]>([]);
  const [evidence, setEvidence] = useState<EvidenceState>(closedEvidence);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const counter = useRef(0);
  const nextId = () => `m${++counter.current}`;

  const revealing = messages.find((m) => m.role === "assistant" && m.status === "revealing");
  const firstAnswer = messages.find((m) => m.role === "assistant");
  const activeConversation = firstAnswer?.role === "assistant" ? getConversation(firstAnswer.conversationId) : undefined;

  /* ----------------------------------------------------------- conversation */

  const exchange = useCallback(
    (conversationId: string): Message[] => {
      const conversation = getConversation(conversationId)!;
      return [
        { id: nextId(), role: "user", text: conversation.question[locale] },
        {
          id: nextId(),
          role: "assistant",
          conversationId,
          status: reduceMotion ? "complete" : "revealing",
          visible: reduceMotion ? conversation.answer[locale].length : 1,
        },
      ];
    },
    [locale, reduceMotion],
  );

  const startConversation = (conversationId: string) => {
    setMessages(exchange(conversationId));
    setEvidence(closedEvidence);
    setSidebarOpen(false);
  };
  const askFollowUp = (conversationId: string) => setMessages((current) => [...current, ...exchange(conversationId)]);
  const newChat = () => {
    setMessages([]);
    setEvidence(closedEvidence);
    setSidebarOpen(false);
  };
  const sendTyped = (text: string) =>
    setMessages((current) => [...current, { id: nextId(), role: "user", text }, { id: nextId(), role: "notice" }]);
  const stop = () =>
    setMessages((current) =>
      current.map((m) => (m.role === "assistant" && m.status === "revealing" ? { ...m, status: "stopped" } : m)),
    );
  const retry = (messageId: string) =>
    setMessages((current) =>
      current.map((m) => {
        if (m.id !== messageId || m.role !== "assistant") return m;
        const total = getConversation(m.conversationId)!.answer[locale].length;
        return reduceMotion ? { ...m, status: "complete", visible: total } : { ...m, status: "revealing", visible: 1 };
      }),
    );

  // Reveal the pre-written answer one block at a time.
  useEffect(() => {
    if (!revealing || revealing.role !== "assistant") return;
    const total = getConversation(revealing.conversationId)!.answer[locale].length;
    const timer = window.setTimeout(() => {
      setMessages((current) =>
        current.map((m) => {
          if (m.id !== revealing.id || m.role !== "assistant" || m.status !== "revealing") return m;
          return m.visible >= total ? { ...m, status: "complete" } : { ...m, visible: m.visible + 1 };
        }),
      );
    }, REVEAL_INTERVAL_MS);
    return () => window.clearTimeout(timer);
  }, [revealing, locale]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduceMotion ? "auto" : "smooth" });
  }, [messages, reduceMotion]);

  /* --------------------------------------------------------------- evidence */

  const sources: Passage[] = useMemo(() => {
    const message = messages.find((m) => m.id === evidence.messageId);
    if (!message || message.role !== "assistant") return [];
    const blocks = getConversation(message.conversationId)!.answer[locale];
    return citedPassageIds(blocks)
      .map((id) => getPassage(id))
      .filter((p): p is Passage => Boolean(p));
  }, [messages, evidence.messageId, locale]);

  const cite = (messageId: string, passageId: string) => {
    const passage = getPassage(passageId);
    if (!passage) return; // a citation always resolves to a real passage
    setEvidence({ open: true, messageId, passageId, documentId: passage.documentId, locator: passage.locator });
  };
  const showSources = (messageId: string) => {
    const message = messages.find((m) => m.id === messageId);
    if (!message || message.role !== "assistant") return;
    const first = citedPassageIds(getConversation(message.conversationId)!.answer[locale])[0];
    if (first) cite(messageId, first);
  };
  const openDocument = (documentId: string) => {
    const first = passages.find((p) => p.documentId === documentId);
    setEvidence((current) => ({
      open: true,
      messageId: current.messageId,
      passageId: null,
      documentId,
      locator: first?.locator ?? "1",
    }));
    setSidebarOpen(false);
  };
  const navigate = (documentId: string, locator: string) =>
    setEvidence((current) => ({
      ...current,
      documentId,
      locator,
      passageId: sources.find((s) => s.documentId === documentId && s.locator === locator)?.id ?? null,
    }));
  const closeEvidence = () => setEvidence((current) => ({ ...current, open: false }));

  const hasEvidence = evidence.documentId !== null;
  const panel = (
    <EvidencePanel
      sources={sources}
      selectedPassageId={evidence.passageId}
      documentId={evidence.documentId}
      locator={evidence.locator}
      onSelectSource={(id) => evidence.messageId && cite(evidence.messageId, id)}
      onNavigate={navigate}
    />
  );
  const sidebar = (
    <WorkspaceSidebar
      activeConversationId={activeConversation?.id ?? null}
      onNewChat={newChat}
      onOpenConversation={startConversation}
      onOpenDocument={openDocument}
    />
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-72 shrink-0 border-e border-border wide:block">{sidebar}</aside>

      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="start" title={t("navLabel")} closeLabel={t("closeSidebar")} className="wide:hidden">
          {sidebar}
        </SheetContent>
      </Sheet>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
          <Button
            variant="ghost"
            size="icon"
            className="wide:hidden"
            aria-label={t("openSidebar")}
            onClick={() => setSidebarOpen(true)}
          >
            <Menu aria-hidden />
          </Button>
          <p className="truncate-start text-[0.9375rem] font-bold">
            {activeConversation ? activeConversation.title[locale] : t("newConversation")}
          </p>
          <span className="type-meta shrink-0 rounded-full bg-highlight px-2.5 py-1 font-medium text-foreground">
            {tc("samplePreview")}
          </span>
          <span className="flex-1" />
          {hasEvidence && (
            <Button
              variant={evidence.open ? "outline" : "ghost"}
              size="sm"
              aria-expanded={evidence.open}
              aria-controls="evidence-region"
              onClick={() => setEvidence((current) => ({ ...current, open: !current.open }))}
            >
              {evidence.open ? (
                <PanelRightClose className="rtl:-scale-x-100" aria-hidden />
              ) : (
                <PanelRightOpen className="rtl:-scale-x-100" aria-hidden />
              )}
              <span className="max-lg:sr-only">{t("evidence.title")}</span>
            </Button>
          )}
        </header>

        <p className="flex shrink-0 items-start gap-2.5 border-b border-border bg-sunken px-4 py-2.5 text-label leading-snug text-secondary sm:px-6">
          <span aria-hidden className="mt-[0.3em] size-2 shrink-0 rounded-full bg-accent ring-1 ring-foreground/30" />
          {t("preview.banner")}
        </p>

        <div
          ref={scrollRef}
          className="scroll-quiet ruled-ground flex min-h-0 flex-1 flex-col overflow-y-auto px-4 sm:px-8"
          style={messages.length ? { backgroundImage: "none" } : undefined}
        >
          {messages.length === 0 ? (
            <WorkspaceEmptyState onAsk={startConversation} />
          ) : (
            <MessageList
              messages={messages}
              activeMessageId={evidence.open ? evidence.messageId : null}
              activePassageId={evidence.open ? evidence.passageId : null}
              onCite={cite}
              onShowSources={showSources}
              onRetry={retry}
              onAsk={askFollowUp}
            />
          )}
        </div>

        <div className="shrink-0 px-4 pt-2 pb-4 sm:px-8 md:pb-3">
          <ChatComposer busy={Boolean(revealing)} onSend={sendTyped} onStop={stop} />
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
                  <Button variant="ghost" size="icon" aria-label={t("evidence.close")} onClick={closeEvidence}>
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
          <SheetContent side="bottom" title={t("evidence.title")} closeLabel={t("evidence.close")} className="h-[86dvh] bg-sunken">
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
