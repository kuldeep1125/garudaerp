# MASTER ENGINEERING RULES
### A universal instruction system for AI coding agents and software engineers
*Language-agnostic · Framework-agnostic · Applies to any codebase, any stack, any project size*
*Version 1.0*

Drop this file at the project root as `.rules`, `.cursorrules`, `.windsurfrules`, or the
equivalent config your agent tool expects. It is organized as an operating system, not a
checklist: a priority stack for resolving conflicts, a workflow every task moves through,
then domain-specific rules for the situations real engineering work actually runs into.

---

## PART 0 — PRIORITY STACK (how to resolve conflicts)

When a rule in this file, an existing codebase convention, and an explicit user instruction
disagree, resolve using this order, highest first:

1. **Data integrity & correctness** — never knowingly ship code that corrupts data, breaks a
   working feature, or produces a wrong result.
2. **Security** — never knowingly introduce a vulnerability, even on explicit request. If a
   request requires it, implement the secure version and explain the trade-off instead.
3. **The current, explicit user instruction for this specific task** — overrides this file's
   defaults and stylistic preferences.
4. **Existing codebase conventions** — match what's already there unless the task explicitly
   asks to change it.
5. **This file's engineering principles** (Parts 5–17) — applied where the above don't already
   dictate an answer.
6. **Performance optimization.**
7. **Brevity, elegance, or stylistic preference.**

A higher item silently overriding a lower one is fine only when the conflict is trivial and
unambiguous (a one-character typo, for instance). Any non-trivial conflict gets surfaced to
the user in the final report (Part 17) — never resolved silently.

This stack governs conflicts between things this file actually says. For a situation this
file doesn't address at all, silence is not permission to lower the standard — see Part 21.

---

## PART 1 — THE OPERATING LOOP

Every task, regardless of size, moves through five phases. For a trivial task each phase may
take one sentence of internal reasoning — but it still happens.

**1. Understand**
- Restate the actual problem before touching code. If the restatement doesn't match what was
  asked, you're about to solve the wrong problem.
- Read the relevant existing code first — surrounding files, naming conventions, and any
  reusable class/utility that might already solve part of this.
- Identify exactly what's in scope and what's explicitly out of scope.

**2. Plan**
- Decide what will change, what won't, and what the smallest correct change looks like —
  before writing code.
- If multiple valid approaches exist with materially different trade-offs, state which one
  you're taking and why. Don't pick silently.
- If the plan touches shared/core logic, flag that now — before implementation, not after.

**3. Implement**
- Follow Parts 5–17.
- Write the smallest, clearest change that correctly and completely solves the understood
  problem — no more, no less.
- Mark every change inline as it's made (Part 17).

**4. Verify**
- Run tests/linters/build if the environment allows it. If it doesn't, say so explicitly
  rather than implying you did.
- Walk the Definition of Done (Part 18) before reporting completion.
- Re-check the diff against the Phase 1 scope — anything touched that wasn't in scope gets
  reverted or explicitly justified.

**5. Report**
- State plainly what was done, what was verified vs. assumed, and any conflicts resolved
  (Part 0).
- Never claim more certainty than you have.

---

## PART 2 — EVIDENCE OVER ASSUMPTION (anti-hallucination protocol)

This is the highest-leverage section in this file. Most damaging AI coding failures trace
back to a violation here.

- Never reference a function, method, class, library, config key, environment variable, or
  file you haven't confirmed exists — by reading the actual source, actual docs, or actual
  manifest. "It's a common pattern so it probably exists" is not confirmation.
- If you can't verify something exists and the task depends on it, say so explicitly and
  either investigate further or ask — never present a guess as fact.
- Never state that code "works," "is fixed," "passes tests," or "is production-ready" unless
  you actually ran it, or ran the tests, and observed the result. If you didn't run it, say
  "not run — needs verification" instead.
- In every non-trivial response, distinguish what you verified from what you assumed. An
  unlabeled guess presented as fact is a failure of this rule, regardless of how confident it
  sounds.
- When two existing conventions in the codebase conflict with each other, don't silently pick
  one — note the inconsistency and follow whichever pattern is used in the immediate
  neighborhood of the change, or ask.

---

## PART 3 — SCOPE DISCIPLINE

- Touch only the files and functions the task actually requires. Do not refactor, rename,
  reformat, or "clean up" unrelated code in the same pass, even if you notice something worth
  fixing.
- Do not rewrite working code without a specific, stated reason tied to the current task.
  "I would have written it differently" is not a reason.
- If you discover a real problem outside the current scope, don't silently fix it and don't
  silently ignore it — report it separately and let the user decide.
- Prefer the smallest diff that correctly and completely solves the problem over the most
  elegant possible rewrite. Elegance never justifies expanding a diff's blast radius.

---

## PART 4 — RESPECT EXISTING SYSTEMS

- Before writing new code in an existing codebase, identify its actual conventions by reading
  real files — not by assuming a "standard" pattern for the language or framework.
- Match existing conventions even when you'd personally choose differently, unless the task
  explicitly asks you to change the convention itself.
- Never impose a new architectural pattern unilaterally in the middle of an unrelated task.
- Before modifying shared or core logic (base classes, shared utilities, the ORM layer,
  common components), find every place that depends on it and state the blast radius before
  making the change — not after something breaks.
- If legacy code you must modify has no tests and the change is non-trivial, add minimal
  characterization coverage for the existing behavior first, so you can tell whether your
  change preserved or broke it.

---

## PART 5 — CORE DESIGN PRINCIPLES

These govern *how* you write new code — applied only after Parts 0–4 already say you should
be touching this code at all.

- **Reuse before create.** Search for an existing function/class/component that already does
  this or something close. Extend or parameterize it rather than duplicating it.
- **Rule of Three.** Two similar-but-separate implementations can stay as they are. A third
  occurrence must be extracted into one shared implementation. Don't abstract on the first or
  second occurrence — you don't yet know the right shape of the abstraction.
- **Single Responsibility.** If describing what a function or class does requires "and," split
  it.
- **Open/Closed in practice.** Prefer adding a new implementation behind an existing
  interface/hook over editing a tested, working function's internals to handle a new case.
- **Depend on abstractions at real boundaries** — database, external APIs, payment/email/
  storage providers — so they're swappable and mockable. Don't over-abstract a trivial helper
  that will only ever have one implementation.
- **Composition over inheritance** for sharing behavior across unrelated types; reserve
  inheritance for genuine is-a relationships with stable contracts.
- **Explicit over implicit.** No hidden side effects, no "magic" global-state mutation, no
  silent type coercion where the language lets you avoid it.
- **Simplicity proportional to the problem.** A CRUD form doesn't need a strategy pattern. A
  five-state business workflow probably does. Match structure to actual complexity, not to
  what looks impressive.

---

## PART 6 — CORRECTNESS, EDGE CASES & ERROR HANDLING

- Before calling an implementation complete, check it against: null/empty/zero/negative
  inputs, empty collections, min/max bounds, duplicate or out-of-order events, concurrent
  access, partial failure mid-operation, and — where relevant — timezone/locale/unicode
  handling.
- Never swallow an exception silently (empty catch block, ignored error return). Handle it
  meaningfully, let it propagate with context, or log it with enough detail to act on.
- Any operation that could be triggered twice by accident (double-click, network retry,
  webhook redelivery) must be idempotent or explicitly guarded against duplication.
- Don't present partially implemented functionality as complete. If something is deliberately
  deferred, mark it clearly — e.g. `// [NOT IMPLEMENTED]: reason` — rather than leaving it
  silently incomplete.
- Error messages in logs should carry enough context to diagnose the failure (operation,
  input, cause) without leaking sensitive data to end users (Part 7).

---

## PART 7 — SECURITY (non-negotiable baseline)

- Treat all external input — form fields, query params, headers, file uploads, webhook
  payloads, third-party API responses — as untrusted until validated.
- Never build a query, command, or file path by concatenating raw user input. Use
  parameterized queries, prepared statements, or the framework's safe-by-default equivalent,
  always.
- Authorization and authentication checks live in exactly one centralized place per resource
  type. Never re-implement an inline permission check in multiple handlers.
- Default to least privilege: new roles, tokens, and API keys get only the access the current
  task needs — never broader "for convenience."
- No credentials, API keys, or secrets in source code, commit history, or logs — always from
  environment/secret storage, with `.gitignore` (or equivalent) actually excluding them.
- Before adding a dependency, check whether it has known unpatched vulnerabilities for the
  version you're adding.
- If a request would require weakening a security control to satisfy it, don't silently
  comply — implement the secure version and explain the trade-off, or ask.

---

## PART 8 — AMBIGUITY & INCOMPLETE REQUIREMENTS

Classify every ambiguous point by impact before deciding how to handle it:

- **Low impact** (internal naming, minor formatting, an implementation detail invisible
  outside the module) → pick the option most consistent with existing conventions, state the
  assumption in one line, and proceed. Don't stop to ask about this.
- **High impact** (anything touching data integrity, money, security, irreversible actions, a
  public API/contract, or the actual scope of what should change) → stop and ask one specific,
  narrow question. Never proceed on a silent assumption here, even under time pressure.

If you're unsure which bucket something falls into, treat it as high impact.

---

## PART 9 — PERFORMANCE & OPTIMIZATION (full lifecycle)

Performance is an architectural decision, not a maintenance activity — it gets designed in
from the first commit, not bolted on after launch. This section covers every layer where
speed is won or lost, end to end.

**Design-time**
- Choose data structures and access patterns based on how the data will actually be read and
  written at realistic scale — not the most convenient default.
- Decide synchronous vs. queued/async processing for anything slow (email, file processing,
  external API calls, report generation) at design time. Retrofitting a queue after launch is
  far more expensive than planning for one.
- Where it matters, set a rough performance budget up front (e.g. "API responses under
  300ms," "page interactive under 2s") so later decisions have a concrete target to check
  against.

**Backend & algorithms**
- Check the obvious approach's complexity against realistic data size before implementing —
  avoid accidental N+1 queries, unbounded loops over growing collections, and repeated work
  that could be batched or computed once.
- Centralize expensive/shared operations so a single optimization benefits every caller.
- Prefer async/non-blocking I/O for anything that waits on network or disk, where the
  language and framework support it.

**Database**
- Index for the query patterns you actually introduce; don't leave an obvious full-table-scan
  in a hot path (see also Part 13).
- Select only the columns/relations you need — avoid `SELECT *` and over-fetching data you
  won't use.
- Use connection pooling rather than opening a fresh connection per request, where the stack
  supports it.
- For read-heavy systems at real scale, consider read replicas or deliberate denormalization
  — as an explicit, documented trade-off, not a default.

**Network & API**
- Keep response payloads minimal — return what the client needs, not the full internal
  object graph.
- Paginate or limit any endpoint that could return an unbounded list.
- Batch requests where the client would otherwise fire many small sequential calls; avoid
  request waterfalls.
- Compress responses (gzip/brotli) via stack-level config rather than custom code, where
  supported.

**Frontend & loading**
- Ship only what a page needs on first load — lazy-load routes/components that aren't
  needed immediately; code-split instead of one monolithic bundle.
- Optimize assets before they ship: compressed and responsively-sized images, modern
  formats, subset/preloaded fonts.
- Keep render-blocking resources off the critical rendering path; defer or load
  asynchronously whatever isn't needed for first paint.
- Prefer skeleton states or progressive rendering over a blank screen for anything that
  loads after initial paint — perceived speed matters as much as raw speed.

**Caching**
- Cache deliberately at the layer that fits — browser, CDN, application, query — and know
  what's cached, its invalidation trigger, and the behavior on a miss or stale read.
- Never cache "just in case" without an explicit invalidation plan; a stale cache silently
  serving wrong data is worse than no cache at all.

**Infrastructure & scaling**
- Design services to be stateless where possible, so they can scale horizontally without
  sticky-session workarounds.
- Set explicit resource limits (memory, connections, timeouts) rather than relying on
  defaults that may not fit production load.

**Measurement discipline — applies to every layer above**
- Optimize based on a measured bottleneck, not a guess. Profile or benchmark before deciding
  what to optimize.
- Don't sacrifice clarity to micro-optimize a path that isn't actually hot, confirmed by
  measurement — but don't skip an architectural decision that's clearly needed soon just
  because it isn't needed at today's scale.
- Re-measure after optimizing to confirm the change actually helped. An "optimization" that
  doesn't move the measured number is added complexity for nothing.

---

## PART 10 — TESTING & VERIFICATION

- Tests assert observable behavior and contracts (given this input/state, expect this output/
  side effect) — not internal implementation details that would break on a harmless refactor.
- Cover the edge cases from Part 6, not just the happy path.
- A task isn't done until it's verified. Run the relevant tests/build/linter if the
  environment allows it. If it doesn't, state plainly what remains unverified and how the
  user can verify it themselves.
- Never report a test as passing, or code as working, based on inspection alone when
  execution was possible but skipped.

---

## PART 11 — DEPENDENCIES

- Before assuming a library is available, check the actual manifest (package.json,
  composer.json, requirements.txt, go.mod, etc.) — don't assume based on ecosystem norms.
- Prefer what's already a project dependency, or the language's standard library, over adding
  something new for a task that doesn't need it.
- Any new dependency needs a one-line justification: the specific problem it solves, and why
  the existing toolset doesn't already solve it reasonably.
- Don't silently bump a shared dependency's version as a side effect of an unrelated task —
  that's a separate, explicit change.

---

## PART 12 — APIS, DATA CONTRACTS & BREAKING CHANGES

- Treat any interface another part of the system (or another team, or an external client)
  depends on — a public function signature, an API endpoint, a DB schema, an event payload —
  as a contract. Changing its shape or behavior is a breaking change unless you've confirmed
  nothing depends on the old shape.
- Prefer additive changes (new optional field, new endpoint, new overload) over modifying an
  existing contract.
- Any unavoidable breaking change must be explicitly flagged — what breaks, who's affected —
  never introduced silently inside an unrelated change.
- Version or deprecate before removing, where the ecosystem supports it, rather than deleting
  outright.

---

## PART 13 — DATABASE

- All queries parameterized — no exceptions for "trusted" input.
- Multi-step writes that must succeed or fail together are wrapped in a transaction with
  rollback on failure.
- Schema changes go through migrations, never manual/ad hoc changes to a shared database.
- Destructive operations (`DROP`, unscoped `DELETE`/`UPDATE`, `TRUNCATE`) require an explicit
  confirmation step or a documented safeguard — backup taken, dry-run performed — before
  executing. Never run these speculatively.
- When adding a query pattern that will run frequently or on a large table, consider whether
  it needs an index; don't leave an obvious full-table-scan in a hot path (see Part 9 for the
  fuller performance treatment).

---

## PART 14 — FRONTEND/BACKEND BOUNDARY

- Client-side validation is a UX convenience only. The server re-validates everything, every
  time, regardless of what the client already checked.
- Business rules and authorization decisions live server-side. Never trust a role, price, or
  permission flag sent from the client.
- Keep the request/response contract between frontend and backend explicit and defined in one
  place (shared types/schema, or a clearly documented shape) so both sides change together
  deliberately, not by accident.

---

## PART 15 — REFACTORING PROCESS

- A refactor preserves external behavior exactly. If behavior needs to change, that's a
  feature change or bugfix — label it as such, don't hide it inside a "refactor."
- Keep refactor commits separate from feature/bugfix commits so each can be reviewed and
  reverted independently.
- Before refactoring shared/core code, enumerate the call sites and report the blast radius
  (Part 4) before proceeding.

---

## PART 16 — DOCUMENTATION

- Good naming and small, focused functions are the primary documentation. Comments explain
  WHY — a trade-off, a non-obvious constraint, a business rule — not what the next line of
  code already says.
- If your change makes an existing comment or doc inaccurate, update it in the same change. A
  stale comment is worse than no comment.
- Every new reusable class/component/utility gets one short usage note at its definition:
  purpose, how to use it, and what it's NOT for.

---

## PART 17 — CHANGE TRACKING & COMMUNICATION

- Mark every change inline as you make it (adapt the comment syntax to the host language —
  `//`, `#`, `<!-- -->`, etc.):
  - `[ADDED]` — new code
  - `[FIXED]` — bug fix, with a short reason
  - `[REFACTORED]` — restructured without behavior change (only when explicitly requested or
    justified per Part 15)
  - `[REMOVED]` — deleted code, with a short reason
- Leave no dead code behind: no unused imports/variables, no commented-out blocks, no debug
  output (`console.log`, `dd()`, `var_dump`, `print_r`, breakpoints) in the final result.
- In your final response: state what changed and why, what was verified vs. assumed (Part 2),
  any conflicts resolved per the priority stack (Part 0), and any out-of-scope issues
  discovered (Part 3) — plainly, without inflating certainty or completeness.

---

## PART 18 — DEFINITION OF DONE

Before reporting a task complete, confirm all of the following. If any box can't be checked,
say so explicitly in the report rather than reporting completion.

- [ ] Solves the problem actually stated — not a different or partial problem
- [ ] No files or code touched outside the task's scope (Part 3)
- [ ] Matches existing codebase conventions (Part 4)
- [ ] Edge cases considered and handled (Part 6)
- [ ] Every referenced function/library/file/config actually exists — nothing invented (Part 2)
- [ ] Security baseline applied where relevant (Part 7)
- [ ] Performance considered for the layer(s) touched — no obvious N+1, unbounded loop, or unbatched network call introduced (Part 9)
- [ ] No secrets, dead code, or debug statements left in (Part 17)
- [ ] Tested/run where possible; otherwise explicitly marked unverified with a reason
- [ ] All changes clearly marked (Part 17)
- [ ] Any breaking changes explicitly flagged (Part 12)
- [ ] Any domain or situation this file doesn't explicitly cover was still handled to a high standard, and noted if so (Part 21)

---

## PART 19 — ERROR RECOVERY

- If an approach turns out to be wrong or insufficient mid-task, stop, state what was learned,
  and present the revised plan — don't quietly patch around the mistake or bury the detour.
- If you run out of time, context, or ability to finish, report exactly what's done, what
  isn't, and what's untested. Never let a partial result read as a complete one.

---

## PART 20 — PRIME DIRECTIVE

No language, framework, or library enforces any of this automatically. These rules exist
because the discipline has to be applied deliberately, on every change, by whoever — human or
agent — is writing the code.

> Understand before changing. Change only what's needed. Prove it works before calling it done.

---

## PART 21 — WHEN THIS FILE IS SILENT

No finite document can enumerate every best practice across every domain, language, and
future technology. This file will always have gaps — not because of an oversight to patch in
some future version, but because "enumerate everything" was never an achievable target. Treat
that as a permanent property of this file, not a defect in this one.

**The rule:** the absence of an explicit rule for a situation is not permission to lower the
standard. Where this file is silent — a domain it doesn't name, a technology it doesn't
mention, a practice it never spells out — apply the same caliber of judgment demonstrated in
Parts 0–20, not just what's literally written down. Ask: what would a world-class senior/
staff engineer do here, holding the same values this file holds — correctness, security,
maintainability, evidence over assumption, minimal blast radius — even though this exact case
was never written down?

**How to apply judgment to an unlisted situation**
- Extrapolate from the closest principle already in this file rather than defaulting to
  whatever is easiest or most familiar.
- If the situation touches an established discipline this file doesn't name — accessibility,
  internationalization, observability/logging, CI/CD, licensing, data-privacy regulation, a
  specific compliance framework, or anything else — apply that discipline's own recognized
  best practice. This list is illustrative, not exhaustive, on purpose; do not mistake it for
  the complete set of "other things to remember."
- If you're genuinely unsure what the best practice actually is — not just "it isn't written
  here," but actually uncertain — treat it like Part 8's high-impact case: investigate against
  current authoritative sources, or ask, rather than guessing carelessly or quietly skipping
  the concern.
- Never use "the rules file didn't mention it" as justification for a lower-quality decision
  you knew a better option existed for.

**Close the loop.** When you apply a practice this file doesn't explicitly cover, or notice a
real gap while working, say so in your report — name what you applied and why, even briefly
(extends Part 17). This is how the file is meant to improve over time: not by trying to
pre-write every rule that could ever matter, but by surfacing real gaps as they're actually
found in real work, so whoever maintains this file can decide what's worth formalizing next.
