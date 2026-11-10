# ADR 0001 — Separate probabilistic inference from deterministic enforcement

- **Status:** accepted
- **Date:** 2026-11-09
- **Context:** VoxSafe must never let an unvalidated acoustic model act directly
  on a borrower. The build guide requires "the ML model estimates, the policy
  engine decides, the human supervisor handles the situation", an escalate-only
  severity ordering, and an independently testable evaluator.

## Decision

1. `ml/voxml` computes acoustic descriptors and produces estimates only. It does
   not import the web application, does not read policy files, and does not know
   what a handoff is.
2. `policy/` is a standalone package: Pydantic schema with an explicit feature
   allow-list, a YAML policy document, and a pure evaluator that maps a flat
   feature mapping to the **maximum** severity among fired rules. It performs no
   I/O and has no dependency on `ml/` or `backend/`.
3. `backend/` orchestrates: it calls the model, hands the smoothed features to
   the evaluator, persists both the estimates and the decision, and enforces the
   resulting action server-side (handoff row, `script_locked`, audit events).
4. The policy layer can only escalate. Missing features and disabled capabilities
   skip a rule and are reported; they never produce a "calm" default.
5. Credibility is a gated capability, review-only, and the schema rejects any
   rule that could use it to trigger `HANDOFF_IMMEDIATE`.
6. Policy and model versions are stored on every decision, so a decision can be
   reproduced from its inputs exactly.

## Consequences

**Positive**

- The safety property is testable without audio: Hypothesis proves across
  generated feature combinations that adding distress evidence cannot lower
  severity (`backend/tests/test_policy_safety.py`).
- A model swap cannot silently change the meaning of a decision; thresholds are
  explicit and versioned, and the model version is pinned per call.
- Reviewers can see the exact rule and observed values that fired, from stored
  decisions rather than re-derivation.
- The evaluator can run in batch evaluation, tests, and future live ingestion
  without the web stack.

**Negative / accepted costs**

- Two representations must be kept in sync: `voxml` must emit exactly the feature
  names the policy allow-list permits. A test asserts the shipped policy's rules
  and the producer's feature keys agree in practice.
- Smoothed features live in the ML layer while the schema lives in policy: the
  boundary is a plain mapping, which is deliberately untyped at the policy side
  (validated by name).
- Versioned policies need an approval workflow that V1 does not expose in the UI;
  until then changes go through code review, with the two-person constraint
  already enforced by the database.

## Alternatives rejected

- **Threshold checks inside the model/scoring code.** Would make the model the
  decision maker, mix concerns, and make the escalate-only property impossible to
  prove independently.
- **Let the backend decide ad hoc per endpoint.** Would duplicate logic and allow
  a future endpoint to bypass the ordering guarantee.
- **An LLM explanation layer over decisions.** Explicitly prohibited: generated
  prose can imply certainty the evidence does not support. Explanations are
  assembled from recorded rule hits and observed values.
