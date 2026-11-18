"use client";

import { Check, FolderPlus, Folders, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/api";
import { useApp } from "./app-provider";

/**
 * Projects keep subjects apart: each has its own documents and conversations, and a question is
 * answered from the active project only. Switching reloads the application in the chosen project.
 */
export function ProjectSwitcher() {
  const t = useTranslations("app.projects");
  const { me, api, projects, switchProject, refreshProjects, handleAuthError } = useApp();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!me || !projects) return null;
  const canManage = me.capabilities.manageProjects;

  const run = async (work: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
    } catch (cause) {
      if (!handleAuthError(cause)) {
        const code = cause instanceof ApiError ? cause.code : "internal";
        setError(t.has(`errors.${code}`) ? t(`errors.${code}`) : t("errors.internal"));
      }
    } finally {
      setBusy(false);
    }
  };

  const create = (event: FormEvent) => {
    event.preventDefault();
    const clean = name.trim();
    if (!clean) return;
    void run(async () => {
      const project = await api.createProject(clean);
      switchProject(project.id);
    });
  };

  const rename = (event: FormEvent, id: string) => {
    event.preventDefault();
    const clean = editName.trim();
    if (!clean) return;
    void run(async () => {
      await api.renameProject(id, clean);
      setEditing(null);
      await refreshProjects();
    });
  };

  const remove = (id: string) =>
    void run(async () => {
      await api.deleteProject(id);
      await refreshProjects();
    });

  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-11 w-full items-center gap-3 rounded-control border border-border bg-surface px-3 text-start text-small font-semibold text-foreground hover:bg-hover"
      >
        <Folders className="size-4.5 shrink-0 text-secondary" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block text-label font-semibold text-tertiary">{t("label")}</span>
          <span className="block truncate" dir="auto">{me.project.name}</span>
        </span>
      </button>

      {open ? (
        <div className="mt-2 rounded-control border border-border bg-surface p-2">
          <ul className="flex flex-col gap-0.5">
            {projects.map((project) => {
              const current = project.id === me.project.id;
              return (
                <li key={project.id} className="group flex items-center gap-1">
                  {editing === project.id ? (
                    <form onSubmit={(event) => rename(event, project.id)} className="flex min-w-0 flex-1 gap-1">
                      <input
                        autoFocus
                        dir="auto"
                        value={editName}
                        maxLength={120}
                        onChange={(event) => setEditName(event.target.value)}
                        aria-label={t("renameLabel")}
                        className="min-h-9 min-w-0 flex-1 rounded-control border border-border bg-background px-2 text-small"
                      />
                      <button type="submit" disabled={busy} className="min-h-9 rounded-control px-2 text-small font-semibold text-foreground hover:bg-hover">
                        {t("save")}
                      </button>
                    </form>
                  ) : (
                    <>
                      <button
                        type="button"
                        aria-current={current ? "true" : undefined}
                        onClick={() => (current ? setOpen(false) : switchProject(project.id))}
                        className={cn(
                          "flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-control px-2 text-start text-small",
                          current ? "font-semibold text-foreground" : "text-secondary hover:bg-hover hover:text-foreground",
                        )}
                      >
                        <Check className={cn("size-4 shrink-0", current ? "opacity-100" : "opacity-0")} aria-hidden />
                        <span className="min-w-0 flex-1 truncate" dir="auto">{project.name}</span>
                        <span className="shrink-0 text-label text-tertiary">{t("documentCount", { count: project.documentCount })}</span>
                      </button>
                      {canManage ? (
                        <>
                          <button
                            type="button"
                            aria-label={t("rename", { name: project.name })}
                            onClick={() => {
                              setEditing(project.id);
                              setEditName(project.name);
                            }}
                            className="grid size-8 shrink-0 place-items-center rounded-control text-tertiary hover:bg-hover hover:text-foreground"
                          >
                            <Pencil className="size-3.5" aria-hidden />
                          </button>
                          {!project.isDefault && project.documentCount === 0 && !current ? (
                            <button
                              type="button"
                              disabled={busy}
                              aria-label={t("delete", { name: project.name })}
                              onClick={() => remove(project.id)}
                              className="grid size-8 shrink-0 place-items-center rounded-control text-tertiary hover:bg-hover hover:text-foreground"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  )}
                </li>
              );
            })}
          </ul>

          {canManage ? (
            <form onSubmit={create} className="mt-2 flex gap-1 border-t border-border pt-2">
              <input
                dir="auto"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("newPlaceholder")}
                aria-label={t("newPlaceholder")}
                className="min-h-9 min-w-0 flex-1 rounded-control border border-border bg-background px-2 text-small"
              />
              <button
                type="submit"
                disabled={busy || !name.trim()}
                aria-label={t("create")}
                className="grid size-9 shrink-0 place-items-center rounded-control text-foreground hover:bg-hover disabled:opacity-40"
              >
                <FolderPlus className="size-4" aria-hidden />
              </button>
            </form>
          ) : null}
          {error ? <p role="alert" className="mt-2 px-1 text-label text-danger">{error}</p> : null}
          <p className="mt-2 px-1 text-label leading-relaxed text-tertiary">{t("hint")}</p>
        </div>
      ) : null}
    </div>
  );
}
