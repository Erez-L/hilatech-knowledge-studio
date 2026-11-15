"use client";

import { Tabs } from "radix-ui";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { directionOf, type Locale } from "@/i18n/routing";
import {
  citedPassageIds,
  company,
  conversations,
  documents,
  getDocument,
  getPassage,
} from "@/sample/northstar";
import { cn } from "@/lib/cn";
import { AnswerBlocks } from "@/components/shared/answer-blocks";
import { FileGlyph } from "@/components/shared/file-glyph";
import { SourcePage, useLocatorLabel } from "@/components/shared/source-page";
import { Button } from "@/components/ui/button";

export function ProductPreview() {
  const t = useTranslations("product");
  const tc = useTranslations("common");
  const locale = useLocale() as Locale;
  const locatorLabel = useLocatorLabel();
  const reduceMotion = useReducedMotion();

  const [conversationId, setConversationId] = useState(conversations[0]!.id);
  const [selected, setSelected] = useState<Record<string, string>>({});

  return (
    <section id="product" className="bg-stage text-on-stage">
      <div className="page-container py-(--space-section)">
        <div className="grid gap-6 wide:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] wide:items-end">
          <h2 className="type-h2 max-w-[18ch]">{t("title")}</h2>
          <p className="type-lead max-w-[36rem] text-on-stage-muted!">{t("body")}</p>
        </div>

        <Tabs.Root
          value={conversationId}
          onValueChange={setConversationId}
          dir={directionOf(locale)}
          orientation="vertical"
          className="mt-12 grid overflow-hidden rounded-stage border border-stage-border bg-background text-foreground shadow-float lg:grid-cols-[17rem_minmax(0,1fr)] wide:grid-cols-[18rem_minmax(0,1fr)_minmax(0,24rem)]"
        >
          {/* Questions and library */}
          <div className="flex flex-col gap-6 border-b border-border bg-sunken p-4 sm:p-5 lg:border-e lg:border-b-0">
            <div>
              <p className="mb-2 px-2 text-label font-semibold text-tertiary">{t("questionsLabel")}</p>
              <Tabs.List className="flex flex-col gap-1" aria-label={t("questionsLabel")}>
                {conversations.map((conversation) => (
                  <Tabs.Trigger
                    key={conversation.id}
                    value={conversation.id}
                    className={cn(
                      "rounded-control px-3 py-2.5 text-start text-small leading-snug font-medium text-secondary transition-colors",
                      "hover:bg-hover hover:text-foreground",
                      "data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-raised",
                    )}
                  >
                    {conversation.question[locale]}
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </div>
            <div className="hidden lg:block">
              <p className="mb-2 px-2 text-label font-semibold text-tertiary">
                {t("libraryLabel", { company: company[locale] })}
              </p>
              <ul className="flex flex-col">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center gap-3 px-2 py-2">
                    <FileGlyph kind={doc.kind} />
                    <span className="min-w-0 text-label leading-snug font-medium">{doc.title[locale]}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {conversations.map((conversation) => {
            const blocks = conversation.answer[locale];
            const ids = citedPassageIds(blocks);
            const numbers = Object.fromEntries(ids.map((id, i) => [id, i + 1]));
            const activeId = selected[conversation.id] ?? ids[0]!;
            const passage = getPassage(activeId)!;
            return (
              <Tabs.Content
                key={conversation.id}
                value={conversation.id}
                className="col-span-1 grid outline-none wide:col-span-2 wide:grid-cols-subgrid"
              >
                <div className="flex flex-col gap-5 p-5 sm:p-8">
                  <p className="max-w-[30rem] self-end rounded-panel rounded-ee-sm bg-bubble px-4 py-3 text-[0.9375rem] leading-normal font-medium text-on-bubble">
                    {conversation.question[locale]}
                  </p>
                  <AnswerBlocks
                    blocks={blocks}
                    numbers={numbers}
                    activeId={activeId}
                    onCite={(id) => setSelected((current) => ({ ...current, [conversation.id]: id }))}
                    citationLabel={(id, n) => {
                      const p = getPassage(id)!;
                      const d = getDocument(p.documentId)!;
                      return tc("citation", { n, title: d.title[locale], locator: locatorLabel(d, p.locator) });
                    }}
                    className="max-w-[38rem] text-[0.9375rem]"
                  />
                  <p className="type-meta mt-auto pt-2 text-tertiary">{t("note")}</p>
                </div>

                <div className="border-t border-border bg-sunken p-5 sm:p-6 wide:border-s wide:border-t-0">
                  <p className="mb-3 flex items-center gap-2 text-label font-semibold text-tertiary">
                    <span className="type-meta inline-flex size-5 items-center justify-center rounded-md bg-accent font-medium text-on-accent">
                      {numbers[activeId]}
                    </span>
                    {t("sourceLabel")}
                  </p>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.div
                      key={activeId}
                      initial={reduceMotion ? false : { opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduceMotion ? undefined : { opacity: 0, y: -6 }}
                      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                    >
                      <SourcePage passage={passage} size="sm" active />
                    </motion.div>
                  </AnimatePresence>
                </div>
              </Tabs.Content>
            );
          })}
        </Tabs.Root>

        <div className="mt-10">
          <Button asChild variant="accent" size="lg">
            <Link href="/demo">{t("cta")}</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
