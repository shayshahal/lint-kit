# 16 Doubt Interview Ideation

skills/doubt-driven-development, skills/interview-me, skills/idea-refine and its refinement-criteria reference.

---

# batch-C3 — doubt-driven-development, interview-me, idea-refine

Source repo @ `1401c8b8030e023baeebb31781a6653fe8e93026`. Extracted by the lead agent.

## skills/doubt-driven-development/SKILL.md  (243 lines; sections 193-243 read in full)
verdict: 11 candidates. This file is unusual in the corpus: it labels one of its own red flags
"**checkable signal**" (:215), which is a direct invitation to mechanise it, and several others are
properties of a prompt the agent constructs rather than of code.

### doubt-theater-is-a-checkable-signal
- source: skills/doubt-driven-development/SKILL.md:215 — "**Doubt theater (checkable signal)**: across 2 or more cycles where the reviewer surfaced substantive findings, zero findings were classified as actionable. You are validating, not doubting. Stop and escalate."
- classification: mechanical
- target: transcript check
- detection: two or more doubt cycles in which the reviewer returned substantive findings and the agent classified none of them actionable. The source names it as a checkable signal and gives the exact condition (2+ cycles, zero actionable). The transcript carries both the reviewer's output and the classification.
- fail: three cycles, 11 findings, all classified "noise".
- pass: at least one actionable finding across the cycles, or a cycle with no substantive findings.
- false positives: a genuinely clean artifact where the reviewer's findings really are noise; the 2-cycle floor is what distinguishes it from a single clean pass.
- effort: M

### reviewer-receives-artifact-and-contract-not-the-claim
- source: skills/doubt-driven-development/SKILL.md:237 — "The reviewer received ARTIFACT + CONTRACT — NOT the CLAIM, NOT your reasoning" (red flag at :221 — "Passing the CLAIM to the reviewer (biases toward agreement)")
- classification: mechanical
- target: transcript check
- detection: the reviewer's prompt must contain the artifact text and the contract, and must not contain the agent's CLAIM statement or its reasoning. Three presence/absence assertions on a constructed prompt — the most mechanically checkable rule in the file.
- fail: a reviewer prompt opening "I claim this migration is safe because…".
- pass: the artifact plus the contract only, as at :237.
- false positives: an artifact that itself states the claim (a commit message under review); needs the claim to be the agent's own framing rather than the artifact's content.
- effort: S

### reviewer-prompt-is-adversarial
- source: skills/doubt-driven-development/SKILL.md:238 — "The reviewer's prompt was adversarial (\"find issues\"), not validating (\"is it good\")" (red flag at :212 — "Prompting the reviewer with \"is this good?\" instead of \"find issues\"")
- classification: mechanical
- target: transcript check
- detection: the prompt text must contain an adversarial instruction and must not contain a validating one. Two literal phrase families; the source gives both.
- fail: "Is this implementation good?"
- pass: "Find issues that would make this fail under the contract" as at :199.
- false positives: a prompt that asks both; the source's own phrasing at :199 is the model.
- effort: S

### doubt-loop-bounded-to-three-cycles
- source: skills/doubt-driven-development/SKILL.md:211 — "Looping >3 cycles without escalating to the user" (exit criterion at :240 — "A stop condition was met (trivial findings, 3 cycles, or user override)")
- classification: mechanical
- target: transcript check
- detection: a count of doubt cycles on one artifact exceeding three. The number is stated, and the three named stop conditions are alternatives.
- fail: a fifth review cycle on the same artifact.
- pass: two cycles, then a stop.
- false positives: a user who explicitly asked for another round (:240's "user override").
- effort: S

### no-re-spawning-on-an-unchanged-artifact
- source: skills/doubt-driven-development/SKILL.md:214 — "Re-spawning fresh-context on an unchanged artifact (you'll get the same findings; you're stalling)"
- classification: mechanical
- target: transcript check
- detection: two doubt invocations whose artifact content hashes identically, with no edit in between. A content hash comparison — exact.
- fail: the same diff reviewed twice with no change.
- pass: a revised artifact re-reviewed.
- false positives: a re-run after a model or prompt change (which the source's cross-model rule encourages at :204); needs the prompt to be part of the comparison.
- effort: S

### doubt-does-not-run-for-trivial-changes
- source: skills/doubt-driven-development/SKILL.md:209 — "Spawning a fresh-context reviewer for a one-line rename or formatting change" (rationalization at :201 — "\"If I doubt every step I'll never ship\" | The skill applies to non-trivial decisions, not every keystroke.")
- classification: heuristic-only
- target: transcript check
- detection: a doubt cycle whose artifact is below a size threshold or is purely cosmetic (a rename, formatting). The mechanical proxy is the artifact's changed-line count and whether the diff is formatting-only — both already computed by other rules in this catalog.
- fail: a doubt cycle on a one-line rename.
- pass: a doubt cycle on a migration.
- false positives: a one-line change that is genuinely high-stakes (a permission check); the source's "non-trivial" definition must include semantic risk, not just size.
- effort: M

### cross-model-offer-is-visible
- source: skills/doubt-driven-development/SKILL.md:218 — "**Silently skipping cross-model in an interactive doubt cycle.** Even when not recommending it, the offer must be visible. Skipping is fine; silent skipping is not." (exit criteria at :241-242)
- classification: mechanical
- target: transcript check
- detection: in interactive mode, the agent's output must contain an explicit cross-model offer; in non-interactive mode, the skip must be announced. Two presence assertions, with the mode determining which applies. The source is emphatic that the offer's *visibility* is the requirement, not the decision.
- fail: an interactive cycle with no mention of cross-model.
- pass: the offer present as at :204.
- false positives: a non-interactive run; the announced-skip branch covers it.
- effort: S

### external-cli-authorised-per-invocation
- source: skills/doubt-driven-development/SKILL.md:205 — "Each invocation is its own authorization. The artifact, the prompt, and the flags change between calls — re-confirm the exact command with the user before every run." and :243 — "Any external CLI invocation was preceded by a PATH check, a working-binary test, syntax confirmation with the user, and explicit authorization to run" (the red flag is at :217)
- classification: mechanical
- target: transcript check
- detection: four prerequisites before each external CLI call — a PATH check, a working-binary test, syntax confirmation with the user, and explicit authorization. The exit criterion enumerates all four, and the per-invocation (not per-session) scope is stated. All four are transcript-visible.
- fail: a second CLI call reusing the first authorization.
- pass: the four steps before each call.
- false positives: a CLI the user configured in a prior turn and explicitly re-authorised; needs the re-authorisation to be present.
- effort: M

### cli-failure-is-surfaced-not-silently-fallen-back
- source: skills/doubt-driven-development/SKILL.md:219 — "Falling back silently when an external CLI errors or is missing — surface the failure and let the user redirect"
- classification: mechanical
- target: transcript check
- detection: a CLI error or a missing binary followed by a fallback with no message to the user. The error itself is in the tool output; the absence of a subsequent user-facing message is the finding.
- fail: the reviewer binary missing and the agent proceeding with an in-context review silently.
- pass: the failure surfaced with a choice offered.
- false positives: a fallback the user pre-approved; needs the approval in the transcript.
- effort: S

### findings-are-classified-against-the-artifact-text
- source: skills/doubt-driven-development/SKILL.md:239 — "Findings were classified against the artifact text (not rubber-stamped) using the precedence: contract misread / actionable / trade-off / noise" (red flag at :210 — "Treating reviewer output as authoritative without re-reading the artifact text")
- classification: mechanical
- target: transcript check
- detection: every reviewer finding must receive one of the four classifications, and the classification must be drawn from the stated precedence order. A closed set of four labels — the same mechanism as the review-severity rule in batch A3.
- fail: findings accepted with no classification.
- pass: the four-label precedence at :239.
- false positives: a finding that is purely informational; the source's "noise" label covers it.
- effort: M

### doubt-runs-in-flight-not-only-at-review
- source: skills/doubt-driven-development/SKILL.md:216 — "Doubting only after committing — that's `/review`, not doubt-driven development" (rationalization at :200 — "\"I'll do doubt at the end with `/review`\" | `/review` is a final gate. Doubt-driven catches wrong directions early when course-correction is cheap. By PR time it's too late.")
- classification: mechanical
- target: transcript check
- detection: a doubt cycle that runs only after the commit that introduced the artifact. Ordering is exact in a transcript: the commit timestamp versus the review invocation.
- fail: one doubt cycle, invoked after the PR was opened.
- pass: a cycle before the commit, as the source prescribes.
- false positives: a repo whose policy is PR-time review only, where `/review` is the intended gate; the source treats them as complementary (:225), so the rule should require *a* pre-commit cycle only when the skill was invoked.
- effort: M

## skills/interview-me/SKILL.md  (235 lines; sections 40-52, 113-141, 196-235 read in full)
verdict: 11 candidates. Several are exact: a one-question-per-message rule, a numeric confidence
floor, a six-field restate, and a stop-the-turn rule.

### one-question-per-message
- source: skills/interview-me/SKILL.md:53 — "Ask one question at a time, each with a guess attached" and :211 — "Three or more questions in a single message: that's batching, not interviewing"
- classification: mechanical
- target: transcript check
- detection: an assistant message containing three or more questions (count of `?`-terminated sentences, excluding rhetorical ones). The threshold is stated exactly, and the source's rationalization at :199 argues the count is the discipline.
- fail: one message asking three questions.
- pass: one question per message as at :53.
- false positives: a single question with a sub-clause containing a `?`; the count needs sentence-level parsing.
- effort: M

### hypothesis-carries-a-confidence-number
- source: skills/interview-me/SKILL.md:42 — "Before asking anything, write down your current best read of what the user wants in **one sentence**, plus an honest confidence number (0–100%):" (the format at :45-46; exit criterion at :223)
- classification: mechanical
- target: transcript check
- detection: the first turn of an interview must contain a `HYPOTHESIS:` line of one sentence and a `CONFIDENCE:` line with a percentage. Two literal markers, both given in the source's example block.
- fail: an interview that opens with a question.
- pass: the block at :45-46.
- false positives: a user who asks a direct question first; the hypothesis belongs to the interview skill's invocation, not to every turn.
- effort: S

### confidence-below-seventy-needs-a-reason
- source: skills/interview-me/SKILL.md:51 — "When confidence is below ~70%, append a brief reason on the same line — what's still unresolved or missing." and :219 — "A confidence number below ~70% with no reason attached: the user can't help close the gap if they don't know what's missing" (exit criterion at :228)
- classification: mechanical
- target: transcript check
- detection: a `CONFIDENCE:` line whose percentage is below 70 and which carries no reason after the number. The threshold is stated as ~70, and the source's example shows the form (`~30% — missing: who it's for, …`).
- fail: `CONFIDENCE: 45%`
- pass: `CONFIDENCE: ~45% — missing: the success criteria`
- false positives: a confidence at or above 70, which needs no reason; the comparison is the whole rule.
- effort: S

### restate-has-six-fields
- source: skills/interview-me/SKILL.md:231 — "A concrete restate (Outcome / User / Why now / Success / Constraint / Out of scope) was written back to the user" (red flag at :221 — "Skipping the \"Out of scope\" line in the restate")
- classification: mechanical
- target: transcript check
- detection: six named fields in the restate, with `Out of scope` called out separately because the source says it is the one most often skipped. Presence check on six labels.
- fail: a restate with Outcome, User, and Success only.
- pass: the six fields at :226.
- false positives: a trivially scoped ask where a field is genuinely empty; the source requires the line, so an empty-but-present field passes.
- effort: S

### confirmation-is-an-explicit-yes
- source: skills/interview-me/SKILL.md:115 — "The gate is an explicit \"yes.\" The following are **not** yes:" with the four non-yes forms at :117-120 — "\"Whatever you think is best.\" … \"Sounds good.\" … \"Sure, let's go.\" … Silence followed by \"okay let's start.\"" (exit criterion at :225)
- classification: heuristic-only
- target: transcript check
- detection: a four-phrase denylist of non-confirmations, plus the requirement that a restate be re-confirmed after a correction. Three of the four are literal strings; the fourth (silence) needs turn-gap analysis.
- fail: proceeding after "Sounds good."
- pass: an explicit "yes" following the restate.
- false positives: a user who says "yes, go ahead" — which contains "go" but is an explicit yes; the rule must match the phrases as whole utterances.
- effort: M

### stop-the-turn-after-confirmation
- source: skills/interview-me/SKILL.md:130 — "**STOP YOUR TURN IMMEDIATELY.** Do NOT invoke tools or start downstream work in this turn." and :215 — "Invoking tools or starting downstream work immediately upon intent confirmation instead of stopping the turn" (exit criterion at :228)
- classification: mechanical
- target: transcript check
- detection: a tool invocation in the same assistant turn as the confirmation. Turn boundaries make this exact, and the source states it as CRITICAL. Same shape as `spec-turn-ends-before-planning-or-code` in batch E2.
- fail: the agent writes `docs/intent/x.md` in the same turn as the confirmation.
- pass: the restate, the offer, and a stop.
- false positives: a read-only tool call the user asked for; the source says "Do NOT invoke tools", so no exemption is implied.
- effort: M

### no-spec-or-plan-before-confirmation
- source: skills/interview-me/SKILL.md:214 — "Producing a spec, plan, or task list before the user has explicitly confirmed your restate"
- classification: mechanical
- target: transcript check
- detection: a `SPEC.md`, `tasks/plan.md`, or `tasks/todo.md` write before the confirmation turn. File-write ordering against the confirmation, both in the transcript.
- fail: a spec written while the restate is still unconfirmed.
- pass: the spec written in a later turn after the yes.
- false positives: a user who asked for the spec directly; the skill's precondition would then be waived explicitly.
- effort: M

### intent-doc-not-saved-before-confirmation
- source: skills/interview-me/SKILL.md:220 — "Saving the intent doc before the user has confirmed (the doc itself implies a yes the user didn't give)"
- classification: mechanical
- target: transcript check
- detection: a write to `docs/intent/<topic>.md` before the confirmation. A single file-path write ordering rule — the most exact rule in the file.
- fail: the doc saved after the first restate.
- pass: the doc saved after the yes.
- false positives: an autosave the user configured; needs the write to be agent-initiated.
- effort: S

### probe-sophistication-signalling-answers
- source: skills/interview-me/SKILL.md:230 — "At least one \"what would you actually want if you didn't have to justify it?\" probe ran when the user gave a sophistication-signaling or convention-signaling answer" and :217 — "The user gives a sophistication-signaling answer (\"scalable\", \"clean\", \"modern\") and you accept it without probing whether it's what they actually want"
- classification: heuristic-only
- target: transcript check
- detection: a user turn containing a signalling adjective (`scalable`, `clean`, `modern`, `robust`, `enterprise-grade`, `best practice`) followed by an agent turn that does not probe. The adjective list is the configuration; the probe's presence is the check.
- fail: the user says "make it scalable" and the agent proceeds.
- pass: the probe at :225.
- false positives: a user who genuinely means scalability and explains why; the probe should then be satisfied by the explanation.
- effort: M

### confidence-stop-test-is-checkable
- source: skills/interview-me/SKILL.md:136 — "Can I predict the user's reaction to the next three questions I would ask?" (:140 — "This is a checkable test, not a vibe. It also has a floor: if you've gone several rounds and still can't predict, that's information about the ask, not a reason to keep grinding.")
- classification: heuristic-only
- target: transcript check
- detection: the source calls the test checkable but its answer is an agent self-report, so the mechanical form is weaker: a round count above a threshold with no stop and no "something foundational is missing" escalation (:140). The countable half is the round count.
- fail: nine interview rounds with no escalation.
- pass: a stop when the prediction test passes, or the escalation at :140.
- false positives: a genuinely complex ask that needs many rounds; the escalation is the required behaviour, not a stop.
- effort: M

## skills/idea-refine/SKILL.md  (178 lines) and references/refinement-criteria.md  (113 lines)
verdict: 9 candidates. The output template at :115-134 is a literal schema, and the anti-pattern list
carries a numeric bound.

### five-to-eight-variations-not-twenty
- source: skills/idea-refine/SKILL.md:144 — "**Don't generate 20+ ideas.** Quality over quantity. 5-8 well-considered variations beat 20 shallow ones." (red flag at :160 — "Generating 20+ shallow variations instead of 5-8 considered ones")
- classification: mechanical
- target: transcript check
- detection: a count of generated variations outside the 5–8 band, with 20+ named as the failure. Both bounds are stated, so the rule is a range check on the count of idea items in the output.
- fail: 24 bullet variations.
- pass: 6 variations.
- false positives: a session the user asked to be exhaustive; needs an explicit user request.
- effort: S

### target-user-is-named
- source: skills/idea-refine/SKILL.md:146 — "**Don't skip \"who is this for.\"** Every good idea starts with a person and their problem." and :173 — "The target user and success criteria are defined" (red flag at :161)
- classification: mechanical
- target: transcript check
- detection: the ideation artifact must name a target user and success criteria. Two presence assertions on the output template, which the source models at :115-134.
- fail: a one-pager with a problem statement and no user.
- pass: the template at :115-134.
- false positives: an internal developer-tooling idea where the user is the team; the field must still be filled.
- effort: S

### not-doing-list-is-mandatory
- source: skills/idea-refine/SKILL.md:164 — "Producing a plan without a \"Not Doing\" list" and :129 — "## Not Doing (and Why)" (the MVP principle is skills/idea-refine/refinement-criteria.md:112 — "**The 'Not Doing' list is mandatory.**")
- classification: mechanical
- target: md-lint
- detection: a `## Not Doing (and Why)` section present and non-empty in the ideation artifact. The heading is given verbatim, and the source states it three times across two files, which makes the requirement unambiguous.
- fail: a one-pager with Problem, Direction, and MVP only.
- pass: the section at :129.
- false positives: none; the source calls it mandatory.
- effort: S

### assumptions-are-surfaced-with-validation-strategies
- source: skills/idea-refine/SKILL.md:147 — "**Don't produce a plan without surfacing assumptions.** Untested assumptions are the #1 killer of good ideas." and :175 — "Hidden assumptions are explicitly listed with validation strategies" (the template section is at :121)
- classification: mechanical
- target: md-lint
- detection: a `## Key Assumptions to Validate` section where every bullet names both an assumption and how it would be validated. The section's presence is exact; the pairing is a two-part check per bullet.
- fail: an assumptions list with no validation column.
- pass: the section at :121 with strategies.
- false positives: an assumption that cannot be validated yet; the source's three-category audit handles priority, not exemption.
- effort: M

### assumption-audit-uses-three-categories
- source: skills/idea-refine/refinement-criteria.md:79 — "### Must Be True (Dealbreakers)" — "### Must Be True (Dealbreakers) / Assumptions that, if wrong, kill the idea entirely. These need validation before building. … ### Should Be True (Important) / … ### Might Be True (Nice to Have) / Assumptions about secondary features or optimizations. Don't validate these until the core is proven."
- classification: mechanical
- target: md-lint
- detection: three named categories with the stated validation priority — dealbreakers validated before building, nice-to-haves deferred until the core is proven. The labels are literal; the ordering constraint is the added rule.
- fail: a flat assumptions list with no categories.
- pass: the three headings at :79-91.
- false positives: a session with one assumption; the categories still apply.
- effort: S

### output-is-a-markdown-one-pager
- source: skills/idea-refine/SKILL.md:177 — "The output is a concrete artifact (markdown one-pager), not just conversation" (the template is at :115-134)
- classification: mechanical
- target: transcript check
- detection: the session must end with a written artifact rather than only chat. A file-write presence check, with the template at :115-134 defining the required sections.
- fail: an ideation session that ends in conversation.
- pass: the one-pager written.
- false positives: a user who asked not to save anything; needs the explicit request.
- effort: S

### phases-run-in-order
- source: skills/idea-refine/SKILL.md:166 — "Jumping straight to Phase 3 output without running Phases 1 and 2" (the anti-pattern at :148 — "**Don't over-engineer the process.** Three phases, each doing one thing well.")
- classification: mechanical
- target: transcript check
- detection: a Phase-3 artifact produced with no Phase-1 or Phase-2 activity in the transcript. Ordering and presence across three named phases.
- fail: a one-pager produced immediately.
- pass: the three phases in sequence.
- false positives: a user who supplies a fully-formed idea and asks only for the output; needs the user's framing to count.
- effort: M

### direction-chosen-against-the-value-feasibility-matrix
- source: skills/idea-refine/refinement-criteria.md:100 — "| **High Value**     | Do this first     | Worth the risk   |" and :103 — "Then use differentiation as the tiebreaker between options in the same quadrant." (the matrix is lines 98-102)
- classification: heuristic-only
- target: md-lint
- detection: a recommended direction with no stated value/feasibility assessment, or one whose assessment contradicts the matrix (a low-value/low-feasibility direction recommended). The matrix gives four quadrants and their verdicts, so the contradiction is checkable; the assessment itself is judgement.
- fail: a recommended direction marked low value and low feasibility.
- pass: a high-value/high-feasibility direction, or a stated rationale for a riskier one.
- false positives: a strategic bet outside the matrix; needs a rationale field.
- effort: L

### user-confirmed-the-direction-before-implementation
- source: skills/idea-refine/SKILL.md:178 — "The user confirmed the final direction before any implementation work"
- classification: mechanical
- target: transcript check
- detection: a source-file write before the user confirmed the chosen direction. Same shape as interview-me's stop rule, applied to the ideation hand-off.
- fail: code written during the ideation session.
- pass: the one-pager, then a confirmation, then implementation.
- false positives: a spike the user asked for; needs the explicit request.
- effort: M
