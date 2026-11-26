import { beforeAll, describe, expect, it } from "vitest";
import { register, waitForDocument } from "./client.ts";

/**
 * A document moved to another project: the citations of answers given before the move keep
 * opening (text, page image, original file), inside the same organization only.
 */

type Registered = Awaited<ReturnType<typeof register>>;
let carol: Registered;
let dave: Registered;
let documentId: string;
let conversationId: string;
let archiveId: string;

beforeAll(async () => {
  carol = await register("carol");
  dave = await register("dave");
  const text = "The loyalty discount for long-standing customers is seven percent. It applies from the third year of a contract.";
  const upload = await carol.client.upload("loyalty-terms.txt", new TextEncoder().encode(text));
  expect(upload.status).toBe(202);
  documentId = (await upload.json()).document.id;
  expect((await waitForDocument(carol.client, documentId)).status).toBe("ready");

  const { events } = await carol.client.ask("What is the loyalty discount for long-standing customers?");
  expect(events.at(-1)).toMatchObject({ type: "done", answerStatus: "answered" });
  expect(events.at(-1).sources[0].documentId).toBe(documentId);
  conversationId = events[0].conversationId;

  const created = await carol.client.post("/api/v1/projects", { name: "Archive" });
  expect(created.status).toBe(201);
  archiveId = (await created.json()).project.id;
  expect((await carol.client.post(`/api/v1/documents/${documentId}/move`, { projectId: archiveId })).status).toBe(200);
});

describe("citations to a moved document", () => {
  it("keep their source, and the document still opens from the old conversation's project", async () => {
    const thread = await carol.client.getJson(`/api/v1/conversations/${conversationId}`);
    expect(thread.messages[1].citations[0]).toMatchObject({ documentId, sourceState: "available" });

    // The conversation lives in the first project; the document is now in "Archive".
    const content = await carol.client.get(`/api/v1/documents/${documentId}/content`);
    expect(content.status).toBe(200);
    const body = await content.json();
    expect(body.movedTo).toEqual({ id: archiveId, name: "Archive" });
    expect(body.chunks.map((c: { text: string }) => c.text).join(" ")).toContain("seven percent");
    expect((await carol.client.get(`/api/v1/documents/${documentId}/file`)).status).toBe(200);

    // In its own project it is not "moved".
    const inArchive = await carol.client.request(`/api/v1/documents/${documentId}/content`, { headers: { "x-hks-project": archiveId } });
    expect((await inArchive.json()).movedTo).toBeNull();
  });

  it("does not let changes reach it from the old project", async () => {
    expect((await carol.client.request(`/api/v1/documents/${documentId}`, { method: "DELETE" })).status).toBe(404);
    expect((await carol.client.post(`/api/v1/documents/${documentId}/retry`)).status).toBe(404);
  });

  it("stays invisible to another organization", async () => {
    expect((await dave.client.get(`/api/v1/documents/${documentId}/content`)).status).toBe(404);
    expect((await dave.client.get(`/api/v1/documents/${documentId}/file`)).status).toBe(404);
    expect((await dave.client.get(`/api/v1/documents/${documentId}/pages/1`)).status).toBe(404);
  });
});
