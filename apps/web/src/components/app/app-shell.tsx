"use client";

import { LibraryBig, LogOut, Menu, MessageSquareText, MessagesSquare, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/cn";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { Logo } from "@/components/shared/logo";
import { ThemeSwitcher } from "@/components/shared/theme-switcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useApp } from "./app-provider";

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app.nav");
  const pathname = usePathname();
  const router = useRouter();
  const active = useSearchParams().get("c");
  const { me, conversations, removeConversation } = useApp();
  const [notice, setNotice] = useState<string | null>(null);
  const onAsk = pathname === "/app";

  const signOut = async () => {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  };

  const navItem = (href: "/app" | "/app/library", label: string, Icon: typeof LibraryBig, current: boolean) => (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      onClick={onNavigate}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-control px-3 text-small font-semibold transition-colors",
        current ? "bg-surface text-foreground shadow-raised" : "text-secondary hover:bg-hover hover:text-foreground",
      )}
    >
      <Icon className="size-4.5 shrink-0" aria-hidden />
      {label}
    </Link>
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-sunken">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/" className="rounded-control">
          <Logo />
        </Link>
      </div>

      <nav aria-label={t("label")} className="flex min-h-0 flex-1 flex-col">
        <div className="flex flex-col gap-1 px-4 pb-3">
          {navItem("/app", t("workspace"), MessagesSquare, onAsk)}
          {navItem("/app/library", t("library"), LibraryBig, pathname.startsWith("/app/library"))}
        </div>

        <div className="flex items-center justify-between px-6 pt-3 pb-1.5">
          <h2 className="text-label font-semibold text-tertiary">{t("conversations")}</h2>
          <Link
            href="/app"
            onClick={onNavigate}
            aria-label={t("newChat")}
            className="inline-flex size-9 items-center justify-center rounded-control text-secondary transition-colors hover:bg-hover hover:text-foreground"
          >
            <Plus className="size-4.5" aria-hidden />
          </Link>
        </div>
        <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 pb-4">
          {conversations === null ? (
            <div className="flex flex-col gap-2 px-2 pt-1" aria-hidden>
              <span className="skeleton h-4 w-4/5" />
              <span className="skeleton h-4 w-3/5" />
              <span className="skeleton h-4 w-2/3" />
            </div>
          ) : conversations.length === 0 ? (
            <p className="px-2 pt-1 text-label leading-relaxed text-tertiary">{t("noConversations")}</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {conversations.map((conversation) => {
                const current = onAsk && active === conversation.id;
                const title = conversation.title || t("untitled");
                return (
                  <li key={conversation.id} className="group relative">
                    <Link
                      href={{ pathname: "/app", query: { c: conversation.id } }}
                      aria-current={current ? "page" : undefined}
                      onClick={onNavigate}
                      className={cn(
                        "flex min-h-10 items-center gap-2.5 rounded-control py-2 ps-2 pe-10 text-small font-medium transition-colors",
                        current ? "bg-surface text-foreground shadow-raised" : "text-secondary hover:bg-hover hover:text-foreground",
                      )}
                    >
                      <MessageSquareText className="size-4 shrink-0 text-tertiary" aria-hidden />
                      <span dir="auto" className="truncate-start">
                        {title}
                      </span>
                    </Link>
                    <button
                      type="button"
                      aria-label={t("deleteConversation", { title })}
                      onClick={async () => {
                        await removeConversation(conversation.id).catch(() => {});
                        if (current) router.replace("/app");
                      }}
                      className="absolute end-1 top-1/2 inline-flex size-8 -translate-y-1/2 items-center justify-center rounded-control text-tertiary opacity-0 transition-[opacity,color,background-color] group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-hover hover:text-danger focus-visible:opacity-100"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </nav>

      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="px-2 pb-2">
          {me ? (
            <>
              <p dir="auto" className="truncate-start text-small font-semibold">
                {me.organization.name}
              </p>
              <p className="ltr-run truncate-start text-start text-label text-tertiary rtl:text-end">{me.user.email}</p>
              <p className="mt-0.5 text-label text-tertiary">{t(`role.${me.role}`)}</p>
            </>
          ) : (
            <div className="flex flex-col gap-2" aria-hidden>
              <span className="skeleton h-4 w-3/5" />
              <span className="skeleton h-3 w-4/5" />
            </div>
          )}
        </div>
        <p aria-live="polite" className="px-2 text-label text-secondary empty:hidden">
          {notice}
        </p>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={signOut}
            className="inline-flex h-11 items-center gap-2 rounded-control px-2 text-small font-semibold text-secondary transition-colors hover:bg-hover hover:text-foreground"
          >
            <LogOut className="size-4 rtl:-scale-x-100" aria-hidden />
            {t("signOut")}
          </button>
          <div className="flex items-center">
            <LanguageSwitcher />
            <ThemeSwitcher />
          </div>
        </div>
        <button
          type="button"
          onClick={async () => {
            const { error } = await authClient.revokeOtherSessions();
            setNotice(error ? null : t("signedOutOthers"));
          }}
          className="px-2 pb-1 text-label font-medium text-tertiary underline-offset-4 hover:text-foreground hover:underline"
        >
          {t("signOutOthers")}
        </button>
      </div>
    </div>
  );
}

/** Navigation of the public demo: no account, no library, no history. */
function DemoSidebar({ onNavigate }: { onNavigate?: () => void }) {
  const t = useTranslations("app");
  return (
    <div className="flex h-full min-h-0 flex-col bg-sunken">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Link href="/" className="rounded-control">
          <Logo />
        </Link>
      </div>
      <nav aria-label={t("nav.label")} className="flex min-h-0 flex-1 flex-col gap-1 px-4">
        {/* A full navigation, so the conversation state is reset. */}
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            window.location.assign(window.location.pathname);
          }}
          className="flex min-h-11 items-center gap-3 rounded-control bg-surface px-3 text-start text-small font-semibold text-foreground shadow-raised"
        >
          <Plus className="size-4.5 shrink-0" aria-hidden />
          {t("nav.newChat")}
        </button>
        <p className="mt-4 px-2 text-label leading-relaxed text-secondary">{t("demo.sidebarNote")}</p>
      </nav>
      <div className="shrink-0 border-t border-border px-4 py-3">
        <div className="flex flex-col gap-2 pb-2">
          <Button asChild>
            <Link href="/sign-up">{t("demo.createAccount")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/sign-in">{t("demo.signIn")}</Link>
          </Button>
        </div>
        <div className="flex items-center justify-end">
          <LanguageSwitcher />
          <ThemeSwitcher />
        </div>
      </div>
    </div>
  );
}

/** Application frame: navigation on the start side, the page beside it. On small screens the navigation is a sheet. */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("workspace");
  const tn = useTranslations("app.nav");
  const [open, setOpen] = useState(false);
  const { scope } = useApp();
  const Navigation = scope === "demo" ? DemoSidebar : Sidebar;

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-72 shrink-0 border-e border-border wide:block">
        <Navigation />
      </aside>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="start" title={tn("label")} closeLabel={t("closeSidebar")} className="wide:hidden">
          <Navigation onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
      <AppShellContext.Provider value={() => setOpen(true)}>{children}</AppShellContext.Provider>
    </div>
  );
}

const AppShellContext = createContext<() => void>(() => {});

/** Button that opens the navigation sheet on screens where the sidebar is hidden. */
export function OpenNavigationButton() {
  const t = useTranslations("workspace");
  const open = useContext(AppShellContext);
  return (
    <Button variant="ghost" size="icon" className="wide:hidden" aria-label={t("openSidebar")} onClick={open}>
      <Menu aria-hidden />
    </Button>
  );
}
