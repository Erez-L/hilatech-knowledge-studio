"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { ApiError, createApi, storeProjectId, type Api, type ConversationView, type Me, type ProjectView, type Scope } from "@/lib/api";

type AppState = {
  /** "app": signed-in application. "demo": public, read-only demo tenant. */
  scope: Scope;
  api: Api;
  /** Where "new chat" and a missing conversation lead. */
  homePath: "/app" | "/demo";
  me: Me | null;
  /** null while loading. */
  conversations: ConversationView[] | null;
  refreshConversations: () => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  /** The organization's projects; null while loading, empty in the demo. */
  projects: ProjectView[] | null;
  refreshProjects: () => Promise<void>;
  /** Makes a project the active one and reloads the application in it. */
  switchProject: (id: string) => void;
  /** Sends the browser to sign-in when the server says the session has ended. */
  handleAuthError: (error: unknown) => boolean;
};

const Context = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}

export function AppProvider({ children, scope = "app" }: { children: ReactNode; scope?: Scope }) {
  const router = useRouter();
  const api = useMemo(() => createApi(scope), [scope]);
  const homePath = scope === "demo" ? "/demo" : "/app";
  const [me, setMe] = useState<Me | null>(null);
  const [conversations, setConversations] = useState<ConversationView[] | null>(null);
  const [projects, setProjects] = useState<ProjectView[] | null>(null);

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        // App: the session ended. Demo: the anonymous session expired; reloading issues a new one.
        if (scope === "demo") {
          // At most one reload per minute, so a session that cannot be issued never loops.
          try {
            const last = Number(window.sessionStorage.getItem("hks-demo-reload") ?? 0);
            if (Date.now() - last > 60_000) {
              window.sessionStorage.setItem("hks-demo-reload", String(Date.now()));
              window.location.reload();
            }
          } catch {
            /* storage unavailable: stay on the page */
          }
        } else router.replace("/sign-in");
        return true;
      }
      return false;
    },
    [router, scope],
  );

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await api.conversations());
    } catch (error) {
      if (!handleAuthError(error)) setConversations((current) => current ?? []);
    }
  }, [api, handleAuthError]);

  const refreshProjects = useCallback(async () => {
    try {
      setProjects(await api.projects());
    } catch (error) {
      if (!handleAuthError(error)) setProjects((current) => current ?? []);
    }
  }, [api, handleAuthError]);

  const switchProject = useCallback(
    (id: string) => {
      storeProjectId(id);
      // A full load: every list, conversation and open document belongs to the previous project.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign(`${window.location.pathname.split("/").slice(0, 2).join("/")}${homePath}`);
    },
    [homePath],
  );

  const removeConversation = useCallback(
    async (id: string) => {
      await api.deleteConversation(id);
      setConversations((current) => current?.filter((c) => c.id !== id) ?? null);
    },
    [api],
  );

  useEffect(() => {
    const controller = new AbortController();
    api
      .me(controller.signal)
      .then(setMe)
      .catch((error) => {
        if (!controller.signal.aborted) handleAuthError(error);
      });
    // Initial load: state is set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshConversations();
    void refreshProjects();
    return () => controller.abort();
  }, [api, handleAuthError, refreshConversations, refreshProjects]);

  const value = useMemo(
    () => ({
      scope, api, homePath: homePath as "/app" | "/demo", me, conversations, refreshConversations, removeConversation,
      projects, refreshProjects, switchProject, handleAuthError,
    }),
    [scope, api, homePath, me, conversations, refreshConversations, removeConversation, projects, refreshProjects, switchProject, handleAuthError],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
