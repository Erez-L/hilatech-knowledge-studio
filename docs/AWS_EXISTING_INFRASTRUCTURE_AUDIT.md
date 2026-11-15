# AWS existing infrastructure audit and reuse plan

Read-only audit of the existing HilaTech AWS account, made on 2026-11-15 through the AWS Management Console as the signed-in IAM user. Nothing was created, changed, invoked or downloaded. No object contents and no parameter values were read.

Each finding is labelled: **[AWS]** verified in AWS, **[Repo]** verified in the repository, **[Doc]** documented AWS behaviour, **[Unverified]** not observed or needs approval.

Scope limits: only `us-east-1` was inspected. Other Regions, ElastiCache, Secrets Manager, CloudTrail, VPC settings and the per-bucket settings of the existing buckets were **not** inspected.

## 1. Existing infrastructure inventory

| Service | Resource | Region | Purpose | Observed configuration |
|---|---|---|---|---|
| Account | `590184083649` | — | Single HilaTech account | **[AWS]** Console default Region is us-east-1. Member of an AWS Organization and IAM Identity Center (service-linked roles present) |
| IAM user | `erez-admin` | global | Console administrator | **[AWS]** Created 3 days before the audit. The IAM dashboard recommends adding MFA for this user: it has none |
| IAM user | `aws.lecture.test` | global | Unrelated (course) | **[AWS]** No recorded activity |
| IAM role | `hilatech-demo-server` | global | EC2 instance role of the SaaS demo server | **[AWS]** Trusted entity: EC2. Policies: `AmazonSSMManagedInstanceCore` (AWS managed); inline `demo`: `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on `Resource: "*"`, and `ssm:GetParameter` on `parameter/hilatech/demo/*`; inline `ses-send` (not opened). Used minutes before the audit |
| IAM roles | 19 others | global | SSM Quick Setup, Identity Center, service-linked | **[AWS]** None is an application role |
| EC2 | `hilatech-demo` (`i-0dbaef6ebf899621c`) | us-east-1 | SaaS demo server | **[AWS]** Running. Instance type not read |
| EC2 | `Dev-machine-wi…` (`i-0d26fd16349c273cb`) | us-east-1 | Development machine | **[AWS]** Stopped |
| SSM Parameter Store | `/hilatech/demo/ghcr-token` | us-east-1 | Container registry token for the SaaS | **[AWS]** SecureString, standard tier. Value not read. It is the only parameter |
| Bedrock | Provisioned Throughput | us-east-1 | — | **[AWS]** None (0). All Bedrock use in this Region is on demand |
| Bedrock | `cohere.embed-multilingual-v3` | us-east-1 | — | **[AWS]** Listed in the model catalog as serverless, 1024 dimensions, maximum input 512 tokens. Whether this account has already invoked it was not determined |
| Bedrock | Claude model used by the SaaS | us-east-1 | — | **[Unverified]** The model ID is not stored in AWS configuration that was visible (it is not in Parameter Store). It lives in the SaaS application's own configuration |
| S3 | `ahuvanails.com`, `spa-gal-assets` | us-east-1 | Website and its assets | **[AWS]** Exist. Encryption and Block Public Access not inspected |
| S3 | `el90.aws.lecture`, `do-not-delete-ssm-diagnosis-…` | us-east-1 | Course material; SSM | **[AWS]** Exist |
| RDS | — | us-east-1 | — | **[AWS]** No databases |
| Budgets | `account-monthly` | global | Whole-account monthly budget | **[AWS]** $100.00; $53.58 used and $89.64 forecast at the time of the audit; status healthy |

## 2. Reuse matrix

| Resource | Recommendation | Reason | Required change |
|---|---|---|---|
| AWS account | **Reuse** | One account is the owner's stated preference; usage-priced services add no fixed cost | None |
| Region us-east-1 | **Reuse** | Already in use; the embeddings model is offered there **[AWS]** | Set `AWS_REGION=us-east-1` |
| Bedrock on-demand access | **Reuse** | Access is per account and Region, billed per token. A second application does not create a second charge for the same tokens | First invocation of each model may need AWS Marketplace permissions **[Doc]**; see section 6 |
| Role `hilatech-demo-server` | **Do not reuse** | It is the SaaS server's identity. Sharing it would give Knowledge Studio the SaaS's registry token and mail permission, and make the two applications indistinguishable in logs | Create a separate least-privilege role or user |
| Parameter path `/hilatech/demo/*` | **Do not reuse** | Belongs to the SaaS | If Parameter Store is used, a separate path such as `/hilatech/knowledge-studio/*` (standard parameters are not charged **[Doc]**) |
| Existing S3 buckets | **Do not reuse** | Website and course buckets; customer documents must sit in a bucket that is private by construction | One new private bucket |
| EC2 `hilatech-demo` | **Possible, not recommended yet** | Hosting Knowledge Studio next to the SaaS avoids a second server but couples two products on one machine | Decide when deployment is planned; not needed for verification |
| Budget `account-monthly` | **Reuse and extend** | It already covers the account; it cannot show what Knowledge Studio alone costs | Add a second budget filtered by a cost-allocation tag or by service |

## 3. Bedrock model compatibility

| Item | Finding |
|---|---|
| Embeddings: `cohere.embed-multilingual-v3` | **[AWS]** Offered in us-east-1, 1024 dimensions, 512-token input limit. **[Repo]** The adapter sends `input_type`, `truncate: "NONE"` and expects 1024 dimensions, which matches. **[Unverified]** No call has been made |
| Embeddings token limit | **[Repo]** The length guard counts characters (`CHUNK_MAX_CHARS=1800`), the service counts tokens. Hebrew text may exceed 512 tokens within 1800 characters and the request would be rejected. To be measured by `LIVE_BEDROCK_EMBEDDINGS=1` before any ingestion |
| Chat: Claude | **[Doc]** Current Claude models on Bedrock are invoked through an inference profile ID (for example a `us.` or `global.` prefix), not the bare model ID. **[Repo]** `LLM_MODEL_ID` is passed to Converse unchanged, so a profile ID works without a code change. **[Unverified]** Which Claude model the SaaS uses, and whether Knowledge Studio should use the same one |
| Cross-Region inference | **[Doc]** A `us.` profile may route a request to another US Region. IAM must then allow both the inference profile and the foundation model in each destination Region. No fixed cost |
| Provisioned Throughput | **[AWS]** None exists, so there is no committed capacity to share or to pay for |
| IAM | **[AWS]** The SaaS policy allows invoking any model (`Resource: "*"`). Knowledge Studio's policy should name its two models only |

## 4. Cost comparison

No prices are quoted here: the current figures are on https://aws.amazon.com/bedrock/pricing/ and https://aws.amazon.com/s3/pricing/, and the volume depends on usage that does not exist yet. What can be stated without assumptions:

| | A. Reuse the existing Bedrock setup (same account, same Region, own role and bucket) | B. Separate configuration in the same account (other Region, own everything) | C. Independent supporting infrastructure (RDS, ElastiCache, own server) |
|---|---|---|---|
| New fixed monthly cost | None. A role, a policy, an empty bucket and two budgets cost nothing (budgets that only monitor and notify are free without a limit on their number; only budgets with automated actions are charged, after the first two, at $0.10 per day each, and each emailed budget report costs $0.01 **[Doc]**, https://aws.amazon.com/aws-cost-management/aws-budgets/pricing/) | None | Yes: database, cache and server instances are billed per hour whether used or not |
| Model charges | Per token, on demand | The same per-token prices unless the Region differs | The same |
| Embedding charges | Per token: once per document at ingestion, once per question | The same | The same |
| S3 | Per GB stored and per request; negligible for twelve small sample files | The same | The same |
| Operational complexity | Lowest | Higher: two Regions to reason about | Highest |
| Security | Good, provided the role and bucket are separate | Good | Best isolation, at a cost that a portfolio demonstration does not justify |

**Recommendation: A.** Two applications calling the same on-demand model are billed for the tokens each sends; there is no per-application fee and nothing is paid twice. The only fixed costs in this account today are the existing ones (chiefly the running EC2 instance), and Knowledge Studio verification adds none.

Verification itself is a bounded, one-time usage charge: embedding the twelve sample documents, a few probe calls, and at most 46 evaluation questions with one chat call each. The exact amount depends on the Claude model chosen.

## 5. Security recommendations

1. **Add MFA to `erez-admin`** **[AWS]**. It is an administrator with console access and no second factor. This is the most important finding of the audit and is unrelated to Knowledge Studio.
2. **Separate identity for Knowledge Studio**, limited to: `bedrock:InvokeModel` and `bedrock:InvokeModelWithResponseStream` on the two models (and the inference profile); `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` on the one bucket's objects; `s3:ListBucket` on that bucket, so that a missing object is reported as 404 rather than 403 **[Doc]**.
3. **Prefer temporary credentials.** On AWS, an instance role as the SaaS already does **[AWS]**. For verification from a laptop, either Identity Center, which this account already has **[AWS]**, or a short-lived access key that is deleted afterwards. Never in the repository or in chat.
4. **New bucket:** Block Public Access on (all four settings), default encryption, no bucket policy granting anyone else. Tenant separation inside the bucket is by key prefix `org/<id>/…` and is enforced by the application **[Repo]**.
5. **Narrow the SaaS Bedrock policy** from `Resource: "*"` to the models it uses. Optional, and a change to the other project.
6. **Logging:** Bedrock model-invocation logging stores prompts and answers. If enabled, it would contain customer document text; keep it off for Knowledge Studio or restrict access to the log group.

## 6. Required actions (each needs the owner's approval; none was performed)

1. Add MFA to `erez-admin`.
2. Decide which Claude model Knowledge Studio uses, and note its inference profile ID for us-east-1.
3. Make the first invocation of each of the two models once, as the administrator, from the Bedrock console playground. This is what subscribes the account to a third-party model **[Doc]**. It is a paid call of negligible size.
4. Create an IAM identity for Knowledge Studio with the policy in section 5.2.
5. Create one private S3 bucket in us-east-1.
6. Create a second budget for Knowledge Studio with an email alert, and a cost-allocation tag (for example `project=knowledge-studio`) on the bucket and role. Bedrock on-demand usage is not tagged per caller by default; separating it by project needs an application inference profile **[Doc]**, which can wait.

## 7. Verification plan

In this order, stopping at the first failure. Details and the environment variables are in `docs/REAL_PROVIDER_VERIFICATION.md`.

1. `pnpm check:readiness` — no paid calls.
2. `LIVE_BEDROCK_EMBEDDINGS=1 pnpm test:live` — a few embedding calls. Confirms access, the 1024 dimensions and where the 512-token limit falls for Hebrew. **If Hebrew chunks exceed the limit, lower `CHUNK_MAX_CHARS` before continuing.**
3. `LIVE_BEDROCK_CHAT=1 pnpm test:live` — at most four chat calls. Confirms the model or profile ID, streaming and IAM.
4. `LIVE_S3=1 pnpm test:live` — confirms the bucket policy, including the missing-object case.
5. `LIVE_PIPELINE=1 pnpm test:live` — one document through the whole pipeline, against a disposable database.
6. `pnpm demo:seed`, then `pnpm evaluate -- --yes` — twelve documents and 46 questions. This is the only step whose result says anything about retrieval and answer quality.

Open code issues that the run is expected to touch are listed in `docs/MILESTONE_2_PLAN.md` under "Known issues": the character-based length guard, S3 missing-object mapping, and the daily token budget not covering ingestion.

## 8. Preflight addendum (2026-11-15, read-only)

- **Claude model of the SaaS: still [Unverified].** It is not in IAM, Parameter Store or any other configuration visible in the console. Cost Explorer, filtered to Amazon Bedrock and grouped by usage type for May to October 2026, showed no Claude usage type; the SaaS server was created on 13 November, after that range, so this says nothing about the SaaS. The value has to be read from the SaaS application's own configuration (`LLM`/model setting on the server or in its repository). A model ID is not a secret.
- **Two roles on one EC2 instance are not possible [Doc]:** an instance has one instance profile, and a profile holds one role. If both applications ever share the instance, the instance role should hold only `sts:AssumeRole` on two application roles, and each application assumes its own (`hilatech-saas-app`, `hilatech-knowledge-studio-app`) through the AWS SDK's `role_arn` + `credential_source = Ec2InstanceMetadata` profile. This separates permissions and audit trails, but not the applications from each other at the operating-system level: any process on the instance can reach the metadata service and assume either role. Real isolation needs separate instances or container task roles (ECS).
- **The three code fixes named in section 7 are not implemented yet [Repo]:** the embeddings length guard still counts characters, the daily token budget is not checked before ingestion, and the S3 adapter does not map a 403 for a missing object. They are listed as open in `docs/MILESTONE_2_PLAN.md`.
