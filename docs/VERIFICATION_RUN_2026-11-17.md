# Real-provider verification run, 2026-11-17

First run of `docs/REAL_PROVIDER_VERIFICATION.md` against real providers. It was carried out from AWS CloudShell in `us-east-1` (account `590184083649`) at commit `804f67b` of `milestone-2-rag-foundation`, with PostgreSQL 16 + pgvector and Redis in containers and a disposable database `hks_verify`.

All provider calls after the first-invocation step used the restricted role `AWSReservedSSO_KnowledgeStudioApp_*` through `aws sso login --use-device-code`. `aws sts get-caller-identity` confirmed the role before the tests ran.

**Read this first.** The chat model was **Claude Haiku 4.5**, not the planned Haiku 5.5: on this date Bedrock answered every Haiku 5.5 call, as administrator and through both the `us.` and `global.` profiles, with `AccessDeniedException: anthropic.claude-haiku-5-5 is not available for this account`. Every chat, pipeline and evaluation number below belongs to Haiku 4.5. They say nothing about Haiku 5.5.

## Setup that now exists in AWS

| Resource | State |
|---|---|
| Permission set `KnowledgeStudioApp` | Created, 1-hour session, inline policy only, assigned to Identity Center user `ErezL` for the account. Role: `AWSReservedSSO_KnowledgeStudioApp_c121152b31c3e2fd` |
| Bucket `hilatech-knowledge-studio-docs-590184083649` | Created in us-east-1. Block Public Access on (all four), bucket owner enforced, SSE-S3, versioning off, no bucket policy, tag `project=knowledge-studio` |
| Budget `knowledge-studio-bedrock` | $10 monthly cost budget, filter Service = Bedrock, alerts at 50% and 80% of actual spend to a verified address, no actions |

Differences from section 9 of `AWS_EXISTING_INFRASTRUCTURE_AUDIT.md`:

- The inline policy names the three destination Regions of the profile (us-east-1, us-east-2, us-west-2) instead of `*`.
- The inline policy also allows the Haiku 4.5 profile `us.anthropic.claude-haiku-4-5-20251001-v1:0` and its foundation model in the same three Regions. This was added for this run. Remove it once Haiku 5.5 works, if 4.5 is no longer wanted.
- The budget filter probably does **not** cover the model charges. Bedrock bills third-party models as separate AWS Marketplace services (for example "Claude Haiku 5.5 (Amazon Bedrock Edition)"), and only "Bedrock" was offered in the filter list on the day. Add those services to the filter once they appear in Cost Explorer. Not verified against a bill.

## Identifiers

| Item | Value |
|---|---|
| Haiku 5.5 model ID | `anthropic.claude-haiku-5-5` |
| Haiku 5.5 inference profile | `us.anthropic.claude-haiku-5-5` (destinations us-east-1, us-east-2, us-west-2); a `global.` profile also exists |
| Haiku 5.5 price in this account's Marketplace offer | $0.10 input, $0.50 output per million tokens (global standard) |
| Chat model used in this run | `us.anthropic.claude-haiku-4-5-20251001-v1:0` |
| Embeddings model | `cohere.embed-multilingual-v3`, 1024 dimensions |

## Account problems met on the way

1. **Payment instrument.** The first embeddings call succeeded, then every model call failed with `INVALID_PAYMENT_INSTRUMENT ... Your AWS Marketplace subscription for this model cannot be completed`. The owner changed the default payment method; about two minutes later Cohere reported `AVAILABLE` and Haiku 4.5 answered.
2. **Haiku 5.5 unavailable.** A different error from the one above, before and after the payment change. `get-foundation-model-availability` reports `agreementAvailability: NOT_AVAILABLE` with `authorizationStatus: AUTHORIZED`. Cause unknown; not resolved.

## Results

Settings: defaults, except `CHUNK_TARGET_CHARS=1000` and `CHUNK_MAX_CHARS=1400` (set before it was clear that the ingest path already sizes chunks by estimated tokens; see "Findings"). Thresholds were the defaults `RAG_MIN_SIMILARITY=0.3`, `RAG_EVIDENCE_MIN_SIMILARITY=0.4`.

| Step | Result | Measurements |
|---|---|---|
| 2.1 Region and profile destinations | pass | us-east-1, us-east-2, us-west-2 |
| 2.2 Model availability | Cohere `AVAILABLE`; Haiku 5.5 `NOT_AVAILABLE` | Haiku 4.5 answers; its status was not re-read after the payment change |
| 2.3 Restricted policy used | pass | variant 1 (inference profile), without the `bedrock:InferenceProfileArn` condition |
| A Anthropic API chat | not run | no API key was used |
| B Bedrock chat (Haiku 4.5) | pass, 5/5 | 6 text deltas; no unsupplied label; injected instruction not obeyed; long answer stopped at the token cap |
| C1 Embeddings dimensions | pass | norms 0.999897 (document), 0.999834 (query); cosine document-vs-query for the same text 0.8805 |
| C2 Batching and order | pass | |
| C3 Over-long text | first run: test failed (see Findings 3). Re-run on the fixed branch: pass, 6/6 | 2,048 and 1,800 Hebrew characters rejected with `ValidationException`; 1,200 embedded; cosine between two 1,200-character texts differing only in the last sentence 0.972506, so no silent truncation |
| C4 Hebrew/English observation | holds | he~en translation 0.7837; he~unrelated en 0.3504; he~unrelated he 0.6031; he question~he passage 0.7831; he question~en passage 0.6320; he question~unrelated 0.2253 to 0.3813 |
| D S3 | pass, 5/5 | missing key maps to `not_found`; anonymous HTTPS GET denied |
| E Pipeline | pass, 4/4 | two documents Ready with live vectors; answer cited page 7, the page holding the fact; unanswerable question refused; `pipeline_mode = 'live'` |
| F0 Evaluation at default thresholds 0.3 / 0.4 (chunks 1000/1400) | ran, 46 questions, 0 errors | first table below |
| F1 Evaluation at thresholds 0 / 0 | ran, 46 questions, 0 errors | see "Second session" |
| G Threshold calibration | done | proposed `RAG_MIN_SIMILARITY=0.4`, `RAG_EVIDENCE_MIN_SIMILARITY=0.5`; defaults in code not changed |
| F2 Evaluation at 0.4 / 0.5 | ran, 46 questions, 0 errors | see "Second session" |
| H Grounding review | done by the AI assistant that ran the session, not by a person | 19 answers read, 2 with a remark |
| 14 Cost | | evaluation: 46 chat calls, 63,685 input and 3,911 output tokens, 59 embedding calls for 140 texts. About $0.08 at Haiku 4.5 list prices; billed amount not checked |

### Evaluation, 46 questions, Haiku 4.5, default thresholds

| Category | Questions | Answered | Required facts present | Correct refusals | Cited document is the expected one |
|---|---|---|---|---|---|
| English question, English source | 8 | 8/8 | 8/8 | | 8/8 |
| Hebrew question, Hebrew source | 8 | 8/8 | 8/8 | | 6/8 |
| English question, Hebrew source | 7 | 7/7 | 7/7 | | 0/7 |
| Hebrew question, English source | 7 | 7/7 | 7/7 | | 1/7 |
| Multi-source | 8 | 8/8 | 7/8 | | 8/8 |
| Insufficient evidence | 8 | | | 8/8 | |
| **All** | **46** | **38/38** | **37/38** | **8/8** | **23/38** |

Wrong refusals: 0. Delivered citations to a label that was not supplied: 0. Safety violations: 0.

## Second session, same day: steps F1, G, F2 and H

Run on branch `verification-2026-11-17` (commit `8792ecd`, which contains the `cause` fix), same role and models, **default chunk settings** (`CHUNK_TARGET_CHARS=1200`, `CHUNK_MAX_CHARS=1800`), so these runs are not directly comparable with the first table, which used 1000/1400.

### F1 and F2

| | F1: thresholds 0 / 0 | F2: thresholds 0.4 / 0.5 |
|---|---|---|
| Answered (of 38 answerable) | 38 | 38 |
| Wrong refusals | 0 | 0 |
| Uncited answers | 0 | 0 |
| Correct refusals (of 8) | 8, all by the model itself | 8, of which 2 without a model call |
| Required facts present | 37/38 | 37/38 |
| Cited document is the expected one | 24/38 | 24/38 |
| All expected documents cited | 23/38 | 23/38 |
| Page matches where a document matched | 24/24 | 24/24 |
| Model wrote an unsupplied label | 0 | 0 |
| Safety violations | 0 | 0 |
| Chat tokens in / out | 63,685 / 3,540 | 59,940 / 3,572 |

Per category in F2, cited document is the expected one: English/English 8/8, Hebrew/Hebrew 7/8, English question with Hebrew source 0/7, Hebrew question with English source 1/7, multi-source 8/8 (all expected documents cited in 7/8).

### G: similarity scores from F1

| Pairing | Top similarity, answerable questions | Best similarity of an expected source (rank) |
|---|---|---|
| English question, English source | 0.5989 to 0.7833 | same, always rank 1 |
| Hebrew question, Hebrew source | 0.7271 to 0.8792 | same, always rank 1 |
| English question, Hebrew source | 0.6515 to 0.8120 | 0.4480 to 0.7418 (rank 2 to 11) |
| Hebrew question, English source | 0.6877 to 0.8573 | 0.5181 to 0.7242 (rank 2 to 8) |
| Multi-source | 0.6552 to 0.7902 | same, always rank 1 |
| Should be refused (8 questions) | 0.4558 to 0.7376 | |

The two lists overlap: three of the eight questions that should be refused score above the lowest answerable question (0.5989). The thresholds therefore cannot separate them, and the model's own refusal carries the load; in F1 it refused 8 of 8.

Proposed values, following section 11 of the procedure:

- `RAG_EVIDENCE_MIN_SIMILARITY=0.5`. The lowest answerable top score is 0.5989. 0.5 leaves a margin of about 0.1 rather than sitting just below it, because the basis is 38 questions over six short documents. It stops two of the eight unanswerable questions before a model call.
- `RAG_MIN_SIMILARITY=0.4`. Below the lowest expected-source score that was retrieved (0.4480).

F2 confirms that these values cause no wrong refusal on this set. The defaults in `packages/shared/src/config.ts` (0.3 and 0.4) were **not** changed; that is the owner's decision. The values hold only for this embeddings model, these chunk settings and this corpus.

Every expected source was retrieved within the top 12 in all four language pairings. In the cross-language pairings it is never at rank 1: the same-language edition of the same document is.

### H: grounding review (by the AI assistant, not by a person)

Read from the `messages` table of the F2 run and compared with text extracted from the sample documents: all eight multi-source answers, the one answer missing a `mustContain` term, `he-he-002`, and five answers per question language (`he-he-001`, `he-he-005`, `he-he-007`, `he-en-002`, `he-en-005`, `en-en-002`, `en-en-004`, `en-en-007`, `en-he-003`, `en-he-006`). 19 answers in all. There were no uncited answers to review.

Checked: every stated fact against the source text, the language of the answer, refusal and false-premise behaviour. **Not checked:** the page shown by each citation, whether each citation marker sits next to the right sentence, and stop reasons.

- 19 of 19: every fact stated is in the sample documents. All answers are in the language of the question.
- `multi-004` (false premise): the answer corrects the premise and quotes the waiver. It is counted as missing `10%` only because the question's `mustContain` expects the normal fee to be mentioned. This is a strictness of the question set, not a wrong answer.
- Remark 1, `multi-001`: the answer adds "$90" and "$810", computed from the 10% fee and the $900 in the question. The arithmetic is right, but the figures are not in a source.
- Remark 2, `multi-008` (Hebrew): the facts are right, but the answer then says the exact refund cannot be computed, although the question states it, and its last sentence is not coherent Hebrew.
- `he-he-002` cites the English edition of the handbook for a Hebrew question; the content is the same.

## Findings

1. **Cross-language questions cite the same-language edition.** In the two cross-language categories the answers contain the required facts (7/7 each) but the cited document is the expected edition in 1 of 14 cases. Every Northstar document exists in both languages with the same content, so the retriever finds the edition written in the question's language. Whether the expectation in `samples/evaluation/questions.json` or the retrieval should change is an open decision; nothing was changed.
2. **Hebrew passage length.** Probed by hand with the test's own Hebrew sentence repeated: 2,048 and 1,800 characters are rejected, 1,500 and below are accepted. A Hebrew sample document made mostly of dates and numbers was accepted at 2,048. The ingest path already sizes chunks with `estimateCohereTokens` (1.5 characters per token for non-Latin script, target 400 tokens, so about 600 Hebrew characters) and splits further when the provider rejects a passage, so no rejection occurred during ingestion. The measurement suggests that estimate is conservative for Hebrew prose by roughly a factor of two; it was not changed.
3. **Bug in the over-long-text probe, fixed in this change and re-run.** `BedrockCohereEmbeddings` threw `EmbeddingInputTooLongError` without a `cause`, and the live test treats a rejection without a `cause` as an unexpected error. The probe therefore stopped at the first rejection instead of continuing to 1,800 and 1,200 characters. The error now carries the provider error as its `cause`. Re-run against Bedrock in the second session: the probe continued past both rejections and passed.
4. `docs/AWS_EXISTING_INFRASTRUCTURE_AUDIT.md` section 8 says the embeddings length guard still counts characters. The code at this commit already estimates tokens (see 2), so that line is out of date.

## Not done

- Step A (Anthropic API adapter): no Anthropic API key was used.
- A grounding review by a person. Step H was done by the AI assistant only.
- Anything with Haiku 5.5.
- A check of the billed amount.
- The raw reports (`artifacts/evaluation/*`, `artifacts/live-verification/*`) are **not** in the repository. They are in the CloudShell home directory of the account, `~/hks-verification-2026-11-17/`, which CloudShell keeps between sessions but deletes after 120 days without use.

## What may be claimed

Per section 16 of the procedure: the Bedrock chat adapter, the Bedrock Cohere embeddings adapter, the S3 adapter and the full pipeline have each passed once against real providers, with Haiku 4.5 as the chat model. Retrieval and answer quality have been measured once, at default thresholds, on the 46-question set. Thresholds have been measured and a pair of values proposed on this small corpus. No answer has been reviewed by a person.
