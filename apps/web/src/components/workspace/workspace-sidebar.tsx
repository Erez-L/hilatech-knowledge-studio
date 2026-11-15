"use client";

import { ArrowLeft, MessageSquareText, Plus } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { company, conversations, documents } from "@/sample/northstar";
import { cn } from "@/lib/cn";
import { FileGlyph } from "@/components/shared/file-glyph";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { Button } from "@/components/ui/button";

type WorkspaceSidebarProps = {
  activeConversationId: string | null;
  onNewChat: () => void;
  onOpenConversation: (id: string) => void;
  onOpenDocument: (id: string) => void;
  className?: string;
};

export function WorkspaceSidebar({
  activeConversationId,
  onNewChat,
  onOpenConversation,
  onOpenDocument,
  className,
}: WorkspaceSidebarProps) {
  const t = useTranslations("workspace");
  const locale = useLocale() as Locale;

  return (
    <div className={cn("flex h-full min-h-0 flex-col bg-sunken", className)}>
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/" className="rounded-control">
          <Logo />
        </Link>
      </div>

      <div className="px-4 pb-2">
        <Button variant="outline" className="w-full justify-start bg-surface" onClick={onNewChat}>
          <Plus aria-hidden />
          {t("newChat")}
        </Button>
      </div>

      <nav aria-label={t("navLabel")} className="scroll-quiet flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 py-4">
        <section aria-labelledby="sidebar-history">
          <h2 id="sidebar-history" className="mb-1.5 px-2 text-label font-semibold text-tertiary">
            {t("history")}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {conversations.map((conversation) => {
              const active = conversation.id === activeConversationId;
              return (
                <li key={conversation.id}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => onOpenConversation(conversation.id)}
                    className={cn(
                      "flex min-h-10 w-full items-center gap-2.5 rounded-control px-2 py-2 text-start text-small font-medium transition-colors",
                      active
                        ? "bg-surface text-foreground shadow-raised"
                        : "text-secondary hover:bg-hover hover:text-foreground",
                    )}
                  >
                    <MessageSquareText className="size-4 shrink-0 text-tertiary" aria-hidden />
                    <span className="truncate-start">{conversation.title[locale]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section aria-labelledby="sidebar-library">
          <h2 id="sidebar-library" className="mb-1.5 px-2 text-label font-semibold text-tertiary">
            {t("library")}
          </h2>
          <ul className="flex flex-col gap-0.5">
            {documents.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => onOpenDocument(doc.id)}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-2 text-start transition-colors hover:bg-hover"
                >
                  <FileGlyph kind={doc.kind} />
                  <span className="min-w-0 text-small leading-snug font-medium">{doc.title[locale]}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </nav>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="px-2 pb-2">
          <p className="text-small font-semibold">{t("workspaceName")}</p>
          <p className="text-label text-tertiary">{company[locale]}</p>
        </div>
        <div className="flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex h-11 items-center gap-2 rounded-control px-2 text-small font-semibold text-secondary transition-colors hover:bg-hover hover:text-foreground"
          >
            <ArrowLeft className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("backToSite")}
          </Link>
          <div className="flex items-center">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
      </div>
    </div>
  );
}
