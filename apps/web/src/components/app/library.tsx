"use client";

import { useRouter } from "@/i18n/navigation";
import { Dialog } from "radix-ui";
import { Check, CloudUpload, Eye, Highlighter, LoaderCircle, RotateCcw, Search, Trash2, TriangleAlert, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { ApiError, type DocumentView } from "@/lib/api";
import { cn } from "@/lib/cn";
import { FileGlyph } from "@/components/shared/file-glyph";
import { Button } from "@/components/ui/button";
import { inputClass } from "@/components/ui/field";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { useApp } from "./app-provider";
import { OpenNavigationButton } from "./app-shell";
import { SourceViewer, type ViewerTarget } from "./source-viewer";

type Upload = { id: string; name: string; progress: number; error: string | null };
const FAILURES = [
  "unsupported_scanned_pdf", "malformed_file", "duplicate_document", "extraction_failed", "too_many_pages", "embedding_failed",
  "payload_too_large", "unsupported_file_type", "validation", "rate_limited", "budget_exceeded", "provider_not_configured", "forbidden", "network",
] as const;
const failureKey = (code: string | null | undefined) => FAILURES.find((known) => known === code) ?? "generic";
const kindOf = (fileType: string) => (fileType === "pdf" || fileType === "docx" ? fileType : "txt");
const inProgress = (doc: DocumentView) => ["queued", "processing", "uploaded", "pending_upload"].includes(doc.status);

export function Library() {
  const router = useRouter();
  const t = useTranslations("app.library");
  const tw = useTranslations("workspace");
  const te = useTranslations("app.evidence");
  const locale = useLocale();
  const { api, me, handleAuthError } = useApp();

  const [documents, setDocuments] = useState<DocumentView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirm, setConfirm] = useState<DocumentView | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [preview, setPreview] = useState<ViewerTarget | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const counter = useRef(0);

  const canUpload = Boolean(me?.capabilities.upload && me.pipeline.indexing);
  const maxMb = Math.floor((me?.limits.uploadMaxBytes ?? 20 * 1024 * 1024) / (1024 * 1024));

  const load = useCallback(
    async (term: string, signal?: AbortSignal) => {
      try {
        setDocuments(await api.documents(term, signal));
        setFailed(false);
      } catch (error) {
        if (signal?.aborted || handleAuthError(error)) return;
        setFailed(true);
      }
    },
    [api, handleAuthError],
  );

  // Debounced search.
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const controller = new AbortController();
    // Loads when the search term changes: state is set after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(search, controller.signal);
    return () => controller.abort();
  }, [search, load]);

  // While anything is being processed, keep the statuses fresh.
  const polling = documents?.some(inProgress) ?? false;
  useEffect(() => {
    if (!polling) return;
    const timer = window.setInterval(() => void load(search), 1500);
    return () => window.clearInterval(timer);
  }, [polling, search, load]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 5000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const uploadFiles = (files: File[]) => {
    for (const file of files.slice(0, 20)) {
      const id = `u${++counter.current}`;
      setUploads((current) => [...current, { id, name: file.name, progress: 0, error: null }]);
      const update = (change: Partial<Upload>) => setUploads((current) => current.map((u) => (u.id === id ? { ...u, ...change } : u)));
      // Size is checked here for a fast answer; the server checks it again, along with the real file type.
      if (me && file.size > me.limits.uploadMaxBytes) {
        update({ error: "payload_too_large" });
        continue;
      }
      api
        .upload(file, (fraction) => update({ progress: fraction }))
        .then(() => {
          setUploads((current) => current.filter((u) => u.id !== id));
          void load(search);
        })
        .catch((error) => {
          if (handleAuthError(error)) return;
          update({ error: error instanceof ApiError ? error.code : "generic" });
        });
    }
  };

  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (canUpload) uploadFiles([...event.dataTransfer.files]);
  };

  const remove = async () => {
    if (!confirm) return;
    setDeleting(true);
    try {
      await api.deleteDocument(confirm.id);
      setToast(t("toastDeleted", { title: confirm.title }));
      setConfirm(null);
      void load(search);
    } catch (error) {
      if (!handleAuthError(error)) setToast(t(`failure.${failureKey(error instanceof ApiError ? error.code : null)}`));
      setConfirm(null);
    } finally {
      setDeleting(false);
    }
  };

  const retry = async (doc: DocumentView) => {
    try {
      await api.retryDocument(doc.id);
      setToast(t("toastRetry", { title: doc.title }));
      void load(search);
    } catch (error) {
      if (!handleAuthError(error)) setToast(t(`failure.${failureKey(error instanceof ApiError ? error.code : null)}`));
    }
  };

  const size = (bytes: number) =>
    new Intl.NumberFormat(locale, { style: "unit", unit: bytes >= 1024 * 1024 ? "megabyte" : "kilobyte", maximumFractionDigits: 1 }).format(
      bytes >= 1024 * 1024 ? bytes / (1024 * 1024) : Math.max(1, bytes / 1024),
    );
  const date = (iso: string) => new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(new Date(iso));
  const canDelete = (doc: DocumentView) => Boolean(me && (me.capabilities.deleteAnyDocument || doc.uploadedByUserId === me.user.id));

  return (
    <main
      className="relative flex min-w-0 flex-1 flex-col"
      onDragEnter={(event) => {
        if (!canUpload || !event.dataTransfer.types.includes("Files")) return;
        dragDepth.current++;
        setDragging(true);
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDragOver={(event) => canUpload && event.preventDefault()}
      onDrop={onDrop}
    >
      <header className="flex h-16 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-5">
        <OpenNavigationButton />
        <p className="text-[0.9375rem] font-bold">{t("title")}</p>
      </header>

      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[68rem] px-4 py-8 sm:px-8 sm:py-10">
          <h1 className="text-app-title leading-(--leading-heading) font-extrabold tracking-(--tracking-heading)">{t("title")}</h1>
          <p className="mt-2 max-w-[44rem] text-secondary">{t("body")}</p>

          {/* Upload */}
          {me && !canUpload ? (
            <p className="mt-8 flex items-start gap-2.5 rounded-control border border-border-strong bg-surface px-4 py-3 text-small text-secondary">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
              {me.capabilities.upload ? t("indexingOff") : t("noUploadRole")}
            </p>
          ) : (
            <div
              className={cn(
                "mt-8 flex flex-col items-start gap-4 rounded-panel border border-dashed p-5 transition-[border-color,background-color] duration-200 sm:flex-row sm:items-center sm:p-6",
                dragging ? "border-foreground bg-highlight" : "border-border-strong bg-surface",
              )}
            >
              <span className={cn("inline-flex size-12 shrink-0 items-center justify-center rounded-control transition-colors", dragging ? "bg-accent text-on-accent" : "bg-sunken text-secondary")}>
                <CloudUpload className="size-6" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[1.0625rem] font-bold">{dragging ? t("dropActive") : t("dropTitle")}</p>
                <p className="mt-1 text-small text-secondary">{me?.limits.scannedPdfPages ? t("dropBodyScanned", { max: maxMb, pages: me.limits.scannedPdfPages }) : t("dropBody", { max: maxMb })}</p>
              </div>
              <input
                ref={fileInput}
                type="file"
                multiple
                accept=".pdf,.docx,.txt,.md,.markdown,application/pdf,text/plain"
                className="sr-only"
                tabIndex={-1}
                aria-hidden
                onChange={(event) => {
                  uploadFiles([...(event.target.files ?? [])]);
                  event.target.value = "";
                }}
              />
              <Button variant="accent" disabled={!me} onClick={() => fileInput.current?.click()}>
                {t("browse")}
              </Button>
            </div>
          )}

          {uploads.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2" aria-label={t("status.uploading")}>
              {uploads.map((upload) => (
                <li key={upload.id} className={cn("flex items-center gap-3 rounded-control border bg-surface px-4 py-3", upload.error ? "border-danger/40" : "border-border")}>
                  <span dir="auto" className="truncate-start flex-1 text-small font-semibold">
                    {upload.name}
                  </span>
                  {upload.error ? (
                    <>
                      <span role="alert" className="text-small text-danger">
                        {t(`failure.${failureKey(upload.error)}`)}
                      </span>
                      <button
                        type="button"
                        aria-label={t("dismiss")}
                        onClick={() => setUploads((current) => current.filter((u) => u.id !== upload.id))}
                        className="inline-flex size-9 shrink-0 items-center justify-center rounded-control text-secondary hover:bg-hover hover:text-foreground"
                      >
                        <X className="size-4" aria-hidden />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-label text-tertiary">{t("status.uploading")}</span>
                      <Progress value={Math.round(upload.progress * 100)} label={`${t("status.uploading")}: ${upload.name}`} />
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}

          {/* Search */}
          <div className="relative mt-10 max-w-[28rem]">
            <label htmlFor="library-search" className="sr-only">
              {t("search")}
            </label>
            <Search className="pointer-events-none absolute start-4 top-1/2 size-4.5 -translate-y-1/2 text-tertiary" aria-hidden />
            <input
              id="library-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className={cn(inputClass, "ps-11")}
            />
          </div>

          {/* Documents */}
          <div className="mt-6">
            {failed ? (
              <StateBox icon={<TriangleAlert className="size-6 text-warning" aria-hidden />} title={t("loadFailedTitle")} body={t("loadFailedBody")}>
                <Button variant="outline" onClick={() => void load(search)}>
                  {t("reload")}
                </Button>
              </StateBox>
            ) : documents === null ? (
              <ul className="border-t border-border" aria-hidden>
                {[0, 1, 2, 3].map((row) => (
                  <li key={row} className="flex items-center gap-4 border-b border-border py-4">
                    <span className="skeleton h-8 w-7" />
                    <span className="flex flex-1 flex-col gap-2">
                      <span className="skeleton h-4 w-2/5" />
                      <span className="skeleton h-3 w-1/4" />
                    </span>
                    <span className="skeleton h-4 w-20" />
                  </li>
                ))}
              </ul>
            ) : documents.length === 0 ? (
              search ? (
                <StateBox title={t("noResultsTitle", { query: search })} body={t("noResultsBody")}>
                  <Button variant="outline" onClick={() => setQuery("")}>
                    {t("clearSearch")}
                  </Button>
                </StateBox>
              ) : (
                <StateBox title={t("emptyTitle")} body={t("emptyBody")} />
              )
            ) : (
              <>
                <div aria-hidden className="hidden grid-cols-[minmax(0,1fr)_14rem_5.5rem_7rem_7.5rem] gap-4 border-b border-foreground pb-2 text-label font-semibold text-tertiary lg:grid">
                  <span>{t("columns.document")}</span>
                  <span>{t("columns.status")}</span>
                  <span>{t("columns.size")}</span>
                  <span>{t("columns.added")}</span>
                  <span className="text-end">{t("columns.actions")}</span>
                </div>
                <ul>
                  {documents.map((doc) => (
                    <li
                      key={doc.id}
                      data-document-status={doc.status}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 border-b border-border py-4 lg:grid-cols-[minmax(0,1fr)_14rem_5.5rem_7rem_7.5rem]"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <FileGlyph kind={kindOf(doc.fileType)} />
                        <div className="min-w-0">
                          <p dir="auto" className="truncate-start text-[0.9375rem] font-semibold">
                            {doc.title}
                          </p>
                          <p className="ltr-run type-meta truncate-start text-start text-tertiary rtl:text-end">{doc.filename}</p>
                        </div>
                      </div>

                      <div className="order-3 col-span-2 lg:order-none lg:col-span-1">
                        <Status doc={doc} />
                      </div>
                      <p className="order-4 text-label text-secondary lg:order-none">
                        <span className="sr-only">{t("columns.size")}: </span>
                        {size(doc.sizeBytes)}
                      </p>
                      <p className="order-5 text-end text-label text-secondary lg:order-none lg:text-start">
                        <span className="sr-only">{t("columns.added")}: </span>
                        {date(doc.createdAt)}
                      </p>

                      <div className="order-2 flex items-center justify-end gap-0.5 lg:order-none">
                        {doc.status === "ready" && (
                          <IconAction
                            label={t("open", { title: doc.title })}
                            onClick={() => setPreview({ documentId: doc.id, title: doc.title, fileType: doc.fileType, page: doc.fileType === "pdf" ? 1 : null, chunkId: null })}
                          >
                            <Eye className="size-4.5" aria-hidden />
                          </IconAction>
                        )}
                        {doc.status === "ready" && (
                          <IconAction label={t("study", { title: doc.title })} onClick={() => router.push(`/app/library/${doc.id}`)}>
                            <Highlighter className="size-4.5" aria-hidden />
                          </IconAction>
                        )}
                        {doc.status === "failed" && canUpload && (
                          <IconAction label={`${t("retry")}: ${doc.title}`} onClick={() => void retry(doc)}>
                            <RotateCcw className="size-4.5 rtl:-scale-x-100" aria-hidden />
                          </IconAction>
                        )}
                        {canDelete(doc) && (
                          <IconAction label={`${t("delete")}: ${doc.title}`} onClick={() => setConfirm(doc)} danger>
                            <Trash2 className="size-4.5" aria-hidden />
                          </IconAction>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Whole-page drop target */}
      {dragging && <div aria-hidden className="pointer-events-none absolute inset-2 rounded-panel border-2 border-dashed border-foreground/60" />}

      {/* Toast */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-4">
        {toast && (
          <p className="pointer-events-auto flex items-center gap-3 rounded-control bg-primary py-2.5 ps-4 pe-2 text-small font-medium text-on-primary shadow-float animate-[block-in_240ms_var(--ease-out)]">
            <span dir="auto">{toast}</span>
            <button type="button" aria-label={t("dismiss")} onClick={() => setToast(null)} className="inline-flex size-8 items-center justify-center rounded-control opacity-80 hover:opacity-100">
              <X className="size-4" aria-hidden />
            </button>
          </p>
        )}
      </div>

      {/* Delete confirmation */}
      <Dialog.Root open={confirm !== null} onOpenChange={(open) => !open && !deleting && setConfirm(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-stage/45 backdrop-blur-[2px] data-[state=open]:animate-[fade-in_200ms_ease-out]" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-50 w-[min(30rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 rounded-panel border border-border bg-surface p-6 shadow-float outline-none data-[state=open]:animate-[fade-in_200ms_ease-out]">
            <Dialog.Title className="text-[1.25rem] font-bold tracking-(--tracking-heading)">{t("deleteTitle")}</Dialog.Title>
            <Dialog.Description dir="auto" className="mt-3 text-secondary [overflow-wrap:anywhere]">
              {confirm ? t("deleteBody", { title: confirm.title }) : ""}
            </Dialog.Description>
            <div className="mt-6 flex flex-wrap justify-end gap-3">
              <Button variant="outline" disabled={deleting} onClick={() => setConfirm(null)}>
                {t("cancel")}
              </Button>
              <Button variant="danger" disabled={deleting} onClick={remove}>
                {deleting && <LoaderCircle className="animate-spin" aria-hidden />}
                {deleting ? t("deleting") : t("confirmDelete")}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      {/* Document preview */}
      <Sheet open={preview !== null} onOpenChange={(open) => !open && setPreview(null)}>
        <SheetContent side="end" title={te("title")} closeLabel={tw("evidence.close")} className="bg-sunken">
          {preview && <SourceViewer sources={[]} selectedLabel={null} onSelectSource={() => {}} target={preview} onNavigate={setPreview} />}
        </SheetContent>
      </Sheet>
    </main>
  );

  function Status({ doc }: { doc: DocumentView }) {
    if (doc.status === "ready") {
      return (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-small">
          <span className="flex items-center gap-1.5 font-semibold text-success">
            <Check className="size-4" aria-hidden />
            {t("status.ready")}
          </span>
          <span className="text-label text-tertiary">
            {doc.pageCount ? t("pages", { count: doc.pageCount }) : t("passages", { count: doc.chunkCount })}
          </span>
        </p>
      );
    }
    if (doc.status === "failed" || doc.status === "unsupported") {
      return (
        <p className="text-small">
          <span className="flex items-center gap-1.5 font-semibold text-danger">
            <TriangleAlert className="size-4" aria-hidden />
            {t(`status.${doc.status}`)}
          </span>
          <span className="mt-0.5 block text-label text-secondary">{t(`failure.${failureKey(doc.failureCode)}`)}</span>
        </p>
      );
    }
    const step = doc.processing?.step;
    return (
      <div className="flex items-center gap-3 text-small">
        <span className="font-semibold text-secondary">{step ? t(`step.${step}`) : t(`status.${doc.status}`)}</span>
        <Progress value={doc.processing?.progress ?? 0} label={`${t("status.processing")}: ${doc.title}`} />
      </div>
    );
  }
}

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <span role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-hover">
      <span className="block h-full rounded-full bg-brand transition-[width] duration-500 ease-out" style={{ width: `${Math.max(4, value)}%` }} />
    </span>
  );
}

function IconAction({ label, onClick, danger, children }: { label: string; onClick: () => void; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "inline-flex size-10 items-center justify-center rounded-control text-secondary transition-colors hover:bg-hover",
        danger ? "hover:text-danger" : "hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function StateBox({ icon, title, body, children }: { icon?: React.ReactNode; title: string; body: string; children?: React.ReactNode }) {
  return (
    <div role="status" className="ruled-ground flex flex-col items-start gap-3 rounded-panel border border-border px-6 py-12">
      {icon}
      <h2 dir="auto" className="type-h3">
        {title}
      </h2>
      <p className="max-w-[44ch] text-secondary">{body}</p>
      {children && <div className="mt-2">{children}</div>}
    </div>
  );
}
