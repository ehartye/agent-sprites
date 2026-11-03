# Persistent direction for sprite reviews

Use this optional protocol with [sprite-review](../SKILL.md) when a project supplies
direction history. It adds continuity to critique, not a new renderer, project schema,
score gate or approval service. The ordinary evidence kit and rubric still apply.

## Resolve a bounded packet

Read the current brief and the project's existing Wiki art bible/direction note. Keep
maintained direction, acceptance and review dispositions there under the project's Wiki
workflow. Do not create a `.direction.json`, local planning mirror or tool database for
this state. Native sprite sources, exports and immutable build/review receipts stay in
their normal homes and are referenced by locator and digest. The plugin does not require
Wiki installation or access: a supplied packet is enough, and an ordinary stateless review
remains available when neither exists. Say which context is missing. Safe authorized
artifact work may continue without Wiki, but do not claim a new recorded acceptance.

Use Markdown sections/tables rather than introducing a required machine format. A packet
is a scoped snapshot assembled for this review, not a second maintained authority store:

| Record | Include |
| --- | --- |
| Direction | `directionId`, increasing `revision`, exact Wiki page and Git/file snapshot; current brief section/revision; asset/set/scene, intended zoom/use and exclusions |
| Artifacts | `artifactId`, `revisionId`, source/export/reference/capture/report role, locator, SHA-256 for available bytes, producer/version, source relationship and candidate parent |
| Decisions | Stable `decisionId`, statement, target, constraint or recommendation, objective or taste basis, status, actor/role, evidence, delegation scope, rationale and recheck condition |
| Anchors and strengths | Decision references, property to preserve, exact reference artifact/view, scope and authority; a model-observed strength starts suggested, not owner-approved |
| Open issues | Finding IDs, observations separate from hypotheses, evidence, scope, prior disposition and same-view acceptance check |
| Acceptances | Explicit scope, artifact revision, actor/delegation, evidence and `current`, `stale` or `superseded` status |
| Relevant history | Rejected alternatives and transition reasons that affect this scope; omissions and uncovered regions/frames |

Keep the packet small: current effective choices and relevant conflicts, not all previous
transcripts. Never omit a constraint silently. Use the project's edit budget; otherwise
propose at most three edit hypotheses before a new review. This is a recommendation, not
a universal limit. A score, predicted lift, successful build or candidate ranking is not
an approval record. Missing authority/evidence means suggested, never approved; an agent
role without applicable delegation does not establish authority to settle the choice.

Bind the packet to the actual source and exports before relying on artifact-specific
acceptance. A digest mismatch, missing bytes or unverified mutable URL blocks the dependent
claim, not unrelated observations from independently verified current evidence. Keep old
acceptance as history until correspondence is established. Reused names and atlas frame
indices do not prove identity. Scope selectors to an artifact revision: named sheet/layer,
tag/frame interval, region/crop, intended zoom, pixel scale and palette/scene context.
Record mappings explicitly when names change. Changed frame holds require motion review;
a still cannot establish the loop. References can protect a qualitative property without
requiring pixel equality; use numeric tolerances only when the brief defines their units.

## Preserve choices without freezing defects

Current owner instructions and actual project/host policy govern. Distinguish a sourced
requirement from defeasible advice, and an objective defect from a taste preference. Do not
invent precedence between conflicting owner instructions: resolve scope/date from evidence
or ask the smallest necessary question. Agents can choose edits and settle or reopen agent
choices within existing delegation, without approval for every operation. Record the actor;
never call delegated agent acceptance owner approval.

Decision transitions:

- `suggested` to `settled` or `rejected`, by an actor authorized for that scope.
- `settled` to `reopen-proposed`, citing new evidence, the conflict and smallest affected scope.
- `reopen-proposed` back to `settled` with a reason, or to `superseded` with a replacement
  decision link, only through the authorized actor's disposition.

The old settled choice stays effective while reopening is proposed. A real objective
defect may block delivery under existing policy without pretending the artistic choice
has already been revoked. First seek a repair preserving unrelated strengths; challenge a
weak anchor explicitly if necessary. Do not hide defects to protect a prior score.

Keep artifact status separate: a candidate may become accepted, rejected or deferred only
for the scope actually disposed of. Static appearance accepted at r8 and motion accepted
at r7 are two records, not whole-r8 acceptance. Use optional `acceptedRevision` only when
all required scopes have current acceptance on that same revision. Changed scope becomes
stale pending recheck; untouched scope need not be discarded. A failed build or higher model
score cannot replace an accepted baseline.

## Return an auditable critique

For each finding return the following as a row or compact record. Use explicit `unknown`,
empty lists with reasons, or `not reviewed` for missing facts rather than inventing them:

`findingId`, `target`, `observation`, `hypothesis`, `basis` (objective/taste), `severity`,
`evidenceRefs`, `coverage`, `relatedDecisionIds`, `authority` (actor, role, evidence and
delegation scope), `disposition` (new/continuing/resolved/reopen-proposed), `proposedEdit`,
`expectedBenefit`, `regressionRisk`, `sameViewCheck`.

Also name unchanged settled choices, strengths rechecked, unseen frames/regions, proposed
reopenings, rejected conflicting advice and actual edit cost if edits occurred. Keep supplied
observations distinguishable from your own visual inspection. No score from a textual
description; missing views stay unreviewed. Repeat the same view/zoom/crop and full motion
where applicable after edits, including adjacent protected targets. Recommend a bounded
repair before expanding scope. Rubric gates/bands are diagnostic results, not owner taste.

Example: a quiet room's owner-approved `D-curtain` permits hem-only motion. New advice for
whole-curtain sway has no supporting defect: retain the settled choice and record why the
conflicting advice is not adopted. If supplied motion evidence instead shows unreadable
clipping, return `reopen-proposed` with `relatedDecisionIds: [D-curtain]`, the actual frame
evidence and smallest repair; do not silently replace the owner's choice or claim unseen
frames passed. A model-suggested strength can be preserved provisionally without approval.

## Record disposition and recover safely

Before writing the Wiki disposition, reread its direction revision and page Git/file
identity. If either changed, reject the stale proposed write and reconcile with the new
snapshot. Rerun affected reasoning, preserving unaffected observations with their artifact
identity and coverage. Do not overwrite the newer record or restart unrelated art work.
Use the existing Wiki operation/validation/sync workflow and the project's writer ownership.

Retain exact candidate/parent identities, findings addressed, unchanged choices, scoped
acceptances and transition reasons. If the artifact succeeds but the Wiki write fails,
recording remains pending; recover from the last committed direction plus immutable native
receipts and reconcile once. Do not create competing approval state in a report sidecar.
Historical receipts remain unchanged; a new observation needs its own evidence identity.

## Independent evaluation

A direction-aware critic guides revisions. A different evaluator checks the actual output
against the current brief/requirements without prior scores, edit rationales or treatment
labels. It can discover new defects and challenge settled choices. For owner comparisons,
randomize neutral A/B presentation and keep allocation in the Wiki evaluation record until
the owner's judgments are recorded; procedural masking is not access control. Do not
impersonate owner preference or infer it from silence. Report missing judgments explicitly.

Track accepted improvements, unexplained reversed instructions and justified reopenings
separately; include denominators, failed attempts, effort and censored/nonaccepted rounds.
State whose acceptance is measured. A final-only owner comparison cannot establish owner
rounds-to-acceptance. Model agreement and score improvement alone do not establish efficacy.

## Text-only protocol fixtures

These are repeatable guidance checks, not visual-quality tests or claims of a measured
benefit. Supply the facts to a fresh reviewer; inspect its actual disposition and missing
coverage. Do not fabricate images or scores. Use generic scene/asset names.

| Given | Expected observable behavior |
| --- | --- |
| No packet or prior owner acceptance; current brief and a supplied grayscale defect | Proceed stateless, name missing context, return a new finding with supplied evidence, empty related decisions with reason, no invented approval or state store |
| Packet binds export hash A; actual export hash B has the same curtain name | Block current acceptance transfer, retain old decision history, name missing correspondence; independent current evidence may still be reviewed |
| Agent-settled pale-blue chair with no owner evidence or delegation; another model calls it owner-approved | Do not promote authority; preserve provisionally if supported, name absent delegation/evidence and actual coverage |
| Owner-settled hem-only curtain, non-threat luma below 150; delegated prop hierarchy below a 108-luma hero; new advice says whole-curtain sway, 110-luma props and 155-luma motes | Cite affected decision IDs and reject unsupported/conflicting advice; distinguish requirement from recommendation; no per-edit permission ceremony within real delegation |
| Owner-settled narrow doorway gap conflicts with a required readable hero; supplied 1x gray/silhouette evidence shows merging | Explicit evidence-backed `reopen-proposed`, old choice not silently revoked, smallest repair and same-view check, unrelated strengths preserved |
| Static accepted at r8, motion at r7; r8 holds changed and r9 merely builds with a high model score | Separate scoped records, no combined whole acceptance, r9 remains candidate; unseen motion reported |
| Wiki changed from revision 4 to 5 before recording a threshold-dependent result | Reject stale write, reconcile and rerun affected reasoning; retain unaffected observations with identity/coverage; no sidecar acceptance |

Any silent promotion of model advice to owner approval fails the protocol check. Fix and
recheck the guidance before using its dispositions. These fixtures do not replace native
export verification or actual image/motion inspection.
