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

## 9. Approved setup plan (approved by the owner on 2026-11-15; EXECUTED on 2026-11-17)

The three resources below were created on 2026-11-17. What was created, where it differs from this plan, and the result of the first verification run are in `docs/VERIFICATION_RUN_2026-11-17.md`. The text below is the plan as approved and is kept unchanged.

**Decisions.** Same account, Region us-east-1. Chat model: Claude Haiku 5.5, subject to verifying its exact Bedrock model ID, inference profile, availability and price in this account **[Unverified]**. Embeddings: `cohere.embed-multilingual-v3`, 1024 dimensions. Runtime identity for verification: **IAM Identity Center**, temporary credentials on the owner's machine through `aws sso login`. No access keys. The SaaS role, server and buckets are not touched. No EC2, RDS, ECS or ElastiCache.

**Preconditions, in order.**
1. MFA is enabled on `erez-admin` (IAM → Users → erez-admin → Security credentials). If it is not, stop.
2. Identity Center is managed from this account or its organization's management account, and the owner's Identity Center user can be assigned to account `590184083649` **[Unverified]**. If Identity Center is managed elsewhere, stop and ask.
3. In the Bedrock model catalog (us-east-1): the Haiku 5.5 model ID and the ID and ARN of its inference profile; whether it is a `us.` or `global.` profile, and the Regions it routes to.

**Resources to create.**

| # | Resource | Specification |
|---|---|---|
| 1 | Identity Center permission set `KnowledgeStudioApp` | Session 1 hour. No AWS managed policies. Inline policy below. Assigned to the owner's Identity Center user for account `590184083649`. Identity Center creates the IAM role `AWSReservedSSO_KnowledgeStudioApp_*` itself; that role is the dedicated least-privilege role, and its trust policy (the account's Identity Center SAML provider) is written by AWS |
| 2 | S3 bucket `hilatech-knowledge-studio-docs-590184083649` | us-east-1. Block Public Access: all four settings on. Default encryption SSE-S3. ACLs disabled (bucket owner enforced). Versioning off. No bucket policy. Tag `project=knowledge-studio` |
| 3 | Budget `knowledge-studio-bedrock` | Cost budget, monthly, $10, filtered to service Amazon Bedrock. Email alerts at 50% and 80% of actual spend. No actions (so it is free). Note: the filter covers all Bedrock use in the account, the SaaS included; Bedrock on-demand usage cannot be split per application without application inference profiles |

**Inline policy for the permission set** (replace the two placeholders after precondition 3):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "InvokeTheTwoModels",
      "Effect": "Allow",
      "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
      "Resource": [
        "arn:aws:bedrock:us-east-1::foundation-model/cohere.embed-multilingual-v3",
        "<ARN of the Haiku 5.5 inference profile in account 590184083649>",
        "arn:aws:bedrock:*::foundation-model/<Haiku 5.5 model ID>"
      ]
    },
    {
      "Sid": "DocumentObjects",
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::hilatech-knowledge-studio-docs-590184083649/*"
    },
    {
      "Sid": "SoAMissingObjectIsReportedAsMissing",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::hilatech-knowledge-studio-docs-590184083649"
    }
  ]
}
```

The third Bedrock resource uses `*` for the Region because a cross-Region inference profile forwards the request to the foundation model in whichever Region serves it **[Doc]**; narrow it to the profile's Regions once they are known. The first invocation of each model may also need AWS Marketplace permissions that this policy does not grant **[Doc]**: the owner makes that first call once as administrator, when paid calls are approved.

**Checks after creation (none of them invokes a model).**
- IAM policy simulator, or the role's Permissions tab: the role allows the two Bedrock actions on the two models only, and S3 on this bucket only; it has no SSM, SES, IAM or EC2 permission.
- Bucket → Permissions: Block Public Access on, no policy, "Bucket and objects not public". Properties: default encryption on.
- Budgets: the new budget is listed with two alert thresholds and a confirmed email recipient.
- `aws sso login` followed by `aws sts get-caller-identity` on the owner's machine shows the `AWSReservedSSO_KnowledgeStudioApp_*` role.

**Environment for the verification run** (values, no secrets): `AWS_PROFILE=<the sso profile>`, `AWS_REGION=us-east-1`, `LLM_PROVIDER=bedrock`, `LLM_MODEL_ID=<inference profile ID>`, `EMBEDDINGS_PROVIDER=bedrock-cohere`, `EMBEDDINGS_MODEL_ID=cohere.embed-multilingual-v3`, `STORAGE_DRIVER=s3`, `S3_BUCKET=hilatech-knowledge-studio-docs-590184083649`, `BUDGET_DAILY_INPUT_TOKENS=200000`, `BUDGET_DAILY_OUTPUT_TOKENS=20000`. Then the order in section 7. Paid calls need a separate approval.

**Expected additional cost of the setup itself:** none. A permission set, an empty bucket and a budget without actions are not charged.
