"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError, type ConversationView, type Me } from "@/lib/api";

type AppState = {
  me: Me | null;
  /** null while loading. */
  conversations: ConversationView[] | null;
  refreshConversations: () => Promise<void>;
  removeConversation: (id: string) => Promise<void>;
  /** Sends the browser to sign-in when the server says the session has ended. */
  handleAuthError: (error: unknown) => boolean;
};

const Context = createContext<AppState | null>(null);

export function useApp(): AppState {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppProvider");
  return value;
}

export function AppProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [conversations, setConversations] = useState<ConversationView[] | null>(null);

  const handleAuthError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.status === 401) {
        router.replace("/sign-in");
        return true;
      }
      return false;
    },
    [router],
  );

  const refreshConversations = useCallback(async () => {
    try {
      setConversations(await api.conversations());
    } catch (error) {
      if (!handleAuthError(error)) setConversations((current) => current ?? []);
    }
  }, [handleAuthError]);

  const removeConversation = useCallback(
    async (id: string) => {
      await api.deleteConversation(id);
      setConversations((current) => current?.filter((c) => c.id !== id) ?? null);
    },
    [],
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
    return () => controller.abort();
  }, [handleAuthError, refreshConversations]);

  const value = useMemo(
    () => ({ me, conversations, refreshConversations, removeConversation, handleAuthError }),
    [me, conversations, refreshConversations, removeConversation, handleAuthError],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
