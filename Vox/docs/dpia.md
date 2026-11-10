# Data protection impact assessment (working draft)

**Status: draft for legal review.** This document records the assessment the
engineering team can make. It does **not** declare VoxSafe legally compliant, and
it does not substitute for advice from counsel in each operating jurisdiction.

## 1. Processing description

| Item | Description |
|---|---|
| Controller | The collections organisation deploying VoxSafe |
| Processor | Whoever operates the VoxSafe deployment |
| Data subjects | Borrowers whose calls are recorded; collection agents and supervisors (staff monitoring) |
| Personal data | Voice audio of a financial conversation; call metadata (filename, date, duration, consent reference); derived acoustic estimates; supervisor notes; staff account and access records |
| Special-category-adjacent inference | Arousal/valence/dominance and a distress estimate — an inference about emotional state, not a diagnosis |
| Purpose | Identify moments of potential borrower distress and route them to a human supervisor; stop automated payment pressure |
| Legal basis | **To be determined by the controller.** Candidate: explicit consent/notice at call start, contract necessity for the collection activity, or legitimate interests — jurisdiction-specific |
| Recipients | Supervisor and auditor roles inside the controller; no third-party transfer in this build |
| Retention | Audio 90 days (configurable); decisions, handoffs and audit retained per records schedule |
| Transfers | None implemented; if hosted outside the borrower's jurisdiction this must be assessed |

## 2. Necessity and proportionality

- **Purpose limitation:** audio is used only for acoustic estimation and review.
  There is no transcription, no speaker identification, no marketing or
  profitability analysis.
- **Data minimisation:** no borrower name, address, debt amount or transcript is
  required by the system; the only identity fields are an uploader-supplied
  filename and an optional consent reference.
- **Accuracy:** the model is explicitly unvalidated; every surface states that
  estimates carry uncertainty and are not facts about the person.
- **Human oversight:** no automated action is taken against a borrower. The only
  automated effect of a distress flag is to **stop** automated pressure and
  require a human — a restriction on the controller, not on the borrower.
- **Rights:** access/erasure requests are constrained by the audit obligation
  (append-only integrity) and by the fact that audio may not be linkable to a
  named borrower unless the controller stores that link elsewhere. The controller
  must document how a borrower's request maps to a call record.

## 3. Risk register

| # | Risk | L | S | Mitigation | Residual |
|---|---|---|---|---|---|
| 1 | False negative: distress missed, pressure continues | M | High | R1/R3 thresholds, R4 forces review on insufficient evidence, supervisor queue, lock cannot be silently released | **High — model unvalidated.** Must not be relied on as the only safeguard |
| 2 | False positive: calm borrower flagged and reviewed | H | Low–M | Review is non-punitive; UI language forbids treating flags as findings; no automated consequence | Low |
| 3 | Emotional inference used to profile or rank borrowers | L | High | No such feature; policy schema allow-list; docs prohibit; no export API | Low (governance-dependent) |
| 4 | Valence misread across accents/languages | H | M | Valence alone never triggers handoff; group evaluation is a release gate (not yet run) | **High until evaluated** |
| 5 | Audio exposed to unauthorized staff | L | High | Auth + tenant scoping, audited access, private storage, no public URLs | Medium (insider access is inherent) |
| 6 | Consent not actually obtained | M | High | API rejects unconfirmed consent; consent reference stored; UI requires explicit confirmation | Medium — process control needed at the telephony layer |
| 7 | Audit trail challenged as incomplete or altered | L | High | Hash chain, append-only triggers, verification endpoint, head-hash export recommended | Medium until external anchoring ships |
| 8 | Staff surveillance concerns | M | M | Access is role-scoped and audited; only call audio is analysed, not agent keystrokes or screens | Low |
| 9 | Retention failure (audio kept too long) | M | M | Read-time expiry, lifecycle rule recommended, deletion job specified | Medium until job ships |
| 10 | Model change without revalidation | M | High | Model version pinned per call, policy version pinned per decision, release checklist | Low |

## 4. Compliance checklist

| Control area | Status | Evidence |
|---|---|---|
| Consent and notice | Partial | API-level enforcement + consent reference; call-start notice is a telephony/process requirement outside this build |
| Purpose limitation | Implemented | No transcription/ID/profiling; feature allow-list; product copy |
| Data minimisation | Implemented | Minimal metadata; no borrower identity fields |
| Retention | Partial | Read-time enforcement + configurable days; deletion job not shipped |
| Encryption in transit | Deployment | TLS terminated by the operator; no TLS in the local dev server |
| Encryption at rest | Deployment | S3 SSE-KMS recommended; local filesystem unencrypted in dev |
| Access control | Implemented | RBAC + tenant isolation, tested per role |
| Access logging | Implemented | `audio.accessed`, auth events, handoff/lock events |
| Audit integrity | Implemented | Hash chain + verification + append-only triggers |
| Human oversight | Implemented | Mandatory handoff, reason-bearing lock release, supervisor-only acknowledgment |
| Fairness evaluation | **Not done** | Requires consented, group-labelled evaluation data |
| Model-risk documentation | Implemented | `docs/model-card.md` |
| DPIA sign-off | **Open** | This document |

## 5. Jurisdiction notes (questions, not conclusions)

**India — Digital Personal Data Protection Act, 2023.** Consider: notice and
consent at call start in the borrower's language; purpose limitation for
"borrower protection"; the Data Principal's rights (access, correction, erasure)
against the audit-retention obligation; breach notification duties; cross-border
transfer restrictions if hosted abroad; whether the deployment is a Significant
Data Fiduciary. Debt-recovery conduct rules (e.g. RBI/regulator fairness
guidelines and the Digital Lending directions where applicable) may require
recording retention and grievance-redress addresses — align the retention period
with those obligations rather than the 90-day default if they conflict.

**EU AI Act.** Determine whether acoustic emotion inference in a debt-collection
context falls under the prohibitions (emotion recognition in the workplace and in
education is prohibited; this is customer-facing) or under Annex III
high-risk categories (creditworthiness assessment is listed; collections is
adjacent). If a deployment touches the EU, a legal classification is required
before launch, including transparency obligations toward affected persons and
record-keeping duties. Do not assume exemption because "a human decides".

**Other markets.** Local debt-collection regulations may require call recording
notices, retention minima, and complaint-handling records. Those obligations take
precedence over product defaults.

## 6. Open items requiring legal and DPO review

1. Lawful basis for acoustic inference about emotion in a collections call.
2. Exact consent/notice wording per jurisdiction and language.
3. Whether derived emotional estimates are "special category" data in the target
   jurisdiction (they may be treated as health-adjacent inferences).
4. Retention schedule reconciliation with audit and collections-record duties.
5. Data subject request handling when audio is not linked to a borrower identity.
6. EU AI Act classification and resulting conformity obligations.
7. Processor agreements, sub-processors, and hosting region.
8. Whether any deployment requires an external ethics or works-council review.

Until these are closed, VoxSafe should be used only in controlled pilots with
documented consent and a human-safeguarded review process.
