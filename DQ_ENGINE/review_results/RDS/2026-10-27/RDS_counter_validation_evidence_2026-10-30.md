# RDS month-counter validation evidence

Recorded: 30 October 2026. Analyst: Siqi Chen (MVT).

Purpose: retain the rationale, agreed checks and broad results for the final
validation report planned for the coming weeks. This is an evidence note for
use when preparing the final report.

## Scope and implementation

The assessment covers two fields:

- `MTHS_SINCE_DETERIORATION_CNT`: months since the latest deterioration event.
- `MV_CUST_ALL_MTHS_SNC_DIST_CNT`: months since the latest qualifying distress
  event across the relevant customer mortgages.

The uploaded results cover January 2005-March 2026: 255 months per field and
510 field/month summary rows. Account-month comparisons are not unique accounts.

Implementation: [RDS_counter_progression_review.sql](../../../teradata/review/RDS_counter_progression_review.sql).
The final decrease-split version is pinned to commit
[`0e4d66a69e3607b9fba2c141d5ab331a11341ec6`](https://github.com/shersun711-svg/Project-validation/blob/0e4d66a69e3607b9fba2c141d5ab331a11341ec6/DQ_ENGINE/teradata/review/RDS_counter_progression_review.sql).
The output contains 23 columns, including `TOTAL_COUNT`.

The standalone query reads `LAB_T_ORION_MVT.VW_RDS_PHASE2_FACT`, keyed by
`AGMT_ID` and calendar month of `FACT_DT`. It does not change source data,
production account-engine logic or saved results. It uses the shared NUMERIC
special-value snapshot captured for successful RDS account run 20. The source
is the current view; this does not reconstruct the source as it stood at run 20.
The actual special-code contents were not supplied for independent review.

## Why the original generic rule was refined

The original numeric check flagged absolute movements of at least three
months, including decreases. A months-since counter normally advances by one
per consecutive month when the reference event remains unchanged. A new event
can reset it to zero, and repeated events can leave it at zero in successive
months. Generic two-sided numeric thresholds therefore do not distinguish
expected progression and possible resets from unexplained movements.

MVT refined the checks through analyst review of the definitions and observed
results. These are variable-specific review criteria, not regulatory or policy
materiality thresholds. A decrease to a positive value was subsequently
separated because it requires explanation; it is not equivalent to a reset to
zero. Historical event-date corrections or changes in linked-account scope
could explain such a decrease, but should not be presumed.

## Agreed rules

Let A, B and C be values for the same account and field in three consecutive
calendar months. Valid values exclude NULL and configured numeric specials.
Numeric comparisons use valid values; missing references, account entries and
account exits are not treated as missing-value transitions.

| Pattern / output | Condition | Example / interpretation |
|---|---|---|
| `EXPECTED_PLUS1_COUNT` | A and B valid; B=A+1 | 10 -> 11; accepted progression |
| `ZERO_UNCHANGED_COUNT` | A=B=0, both valid | 0 -> 0; accepted at this screening level |
| `POSITIVE_UNCHANGED_COUNT` | A=B>0, both valid | 10 -> 10; review exception |
| `DECREASE_TO_ZERO_COUNT` | A and B valid; B<A and B=0 | 12 -> 0; consistent with a reset at this screening level |
| `DECREASE_TO_POSITIVE_COUNT` | A and B valid; 0<B<A | 12 -> 11 or 12 -> 5; review exception |
| `COUNTER_JUMP_COUNT` | A and B valid; B-A>=2 | 10 -> 30; upward-jump exception |
| `COUNTER_REVERSION_COUNT` | A, B, C valid; B-A>=2, C<B and C<=A+1 | 10 -> 30 -> 11; jump and numeric reversion |
| `JUMP_TO_MISSING_COUNT` | A valid; B missing | Valid-to-missing transition |
| `JUMP_TO_SPECIAL_COUNT` | A valid; B special | Valid-to-special transition |
| `TEMP_MISSING_COUNT` | A valid; B missing; C valid | Temporary missing observation |
| `TEMP_SPECIAL_COUNT` | A valid; B special; C valid | Temporary special observation |

The final agreed numeric reversion rule is **C<=A+1**, not C=A+2.
Consequently 10 -> 30 -> 12 is a numeric jump only; 10 -> 30 -> 11 (or a lower
valid value) is both a jump and numeric reversion. This supersedes the earlier
discussion of an expected-path numeric reversion.

Each temporary missing/special event is additionally assigned to exactly one
recovery type:

| Recovery type | Condition | Missing example | Special example |
|---|---|---|---|
| Expected | C=A+2 | 10 -> NULL -> 12 | 10 -> special -> 12 |
| Above expected | C>A+2 | 10 -> NULL -> 13 | 10 -> special -> 13 |
| Below expected | C<A+2 | 10 -> NULL -> 11 | 10 -> special -> 11 |

The output has separate `MISSING_RECOVERY_EXPECTED_COUNT`,
`MISSING_RECOVERY_ABOVE_COUNT`, `MISSING_RECOVERY_BELOW_COUNT`, and the
corresponding three `SPECIAL_RECOVERY_...` counts. All three types flag the
temporary invalid state. The recovered value's relation to expected progression
is descriptive; a below-expected recovery can be consistent with a reset.

Numeric reversions overlap numeric jumps. Temporary-state counts overlap
transitions. Do not add these overlapping categories as distinct affected
accounts. The three recovery subtypes sum to their respective temporary-state
total. Events and recoveries are assigned to the current/middle month.

## Coverage, reconciliation and interpretation

`TOTAL_COUNT` counts all source observations for that field/month, including
valid, missing and special values. `VALID_PAIR_COUNT` counts consecutive-month
pairs with both values valid. `VALID_TRIPLE_COUNT` counts consecutive-month
triples with all three values valid. Missing/special transition eligibility and
valid-neighbour triples are computed separately inside the query.

For non-negative whole-month counters, the accepted-pattern reconciliation is:

`EXPECTED_PLUS1_COUNT + ZERO_UNCHANGED_COUNT + DECREASE_TO_ZERO_COUNT = VALID_PAIR_COUNT`

Do not substitute the old all-decreases count in this equation. Also check
positive unchanged values, positive-value decreases, numeric flags,
missing/special flags and review warnings separately before recording a pass.
Months with no eligible pairs/triples have no evaluated comparisons for those
checks; zero flags alone do not demonstrate coverage.

The query retains internal controls for duplicate/null account keys,
ambiguous/missing run references and noninteger values. Reference/grain failures
suppress exception counts; `REVIEW_STATUS` surfaces warnings. `EVALUATED`
indicates execution/evaluation status, not an automatic overall pass.

## Evidence reviewed and broad results

### Uploaded workbook independently reviewed

Source: `MTHS_CNT_Result.xlsx`, uploaded by Siqi on 30 October 2026. This export
predates the final split of decreases into zero versus positive values.

| Metric | Deterioration counter | Distress counter |
|---|---:|---:|
| Months in export | 255 | 255 |
| Valid monthly pairs | 13,896,697 | 12,988,050 |
| Expected +1 progression | 11,160,845 | 6,133,520 |
| Zero unchanged | 1,898,968 | 6,682,485 |
| All decreases (old combined column) | 836,884 | 172,045 |
| Positive unchanged | 0 | 0 |
| Numeric upward jumps | 0 | 0 |
| Numeric reversions | 0 | 0 |
| Transitions to missing | 0 | 0 |
| Transitions to special | 0 | 0 |
| Temporary missing / special events and all six recovery subtypes | 0 | 0 |

All 510 rows were `EVALUATED`; no source-grain, unverified-value or noninteger
warnings were present. Progression-category totals and recovery-subtype totals
reconciled. Monthly population controls matched the saved run-20 summaries;
this is aggregate agreement, not proof of identical source records.

The original generic run-20 screen had 372,366 numeric jumps for the
deterioration counter and 100,962 for the distress counter. The refined export
had no upward jumps. This supports the interpretation that decreases drove the
earlier generic flags, but a record-level comparison was not performed.

### Final decrease-split rerun: analyst confirmation

After the final script update, Siqi confirmed on 30 October 2026:

> Perfect result all good, all make sense

Record this as the analyst's confirmation that the final rerun was satisfactory
under the agreed rules, including the zero-versus-positive decrease distinction.
The final rerun workbook and exact split counts were not uploaded in this
conversation. Do not describe its detailed counts as independently reviewed,
and do not relabel the old combined decrease totals as confirmed zero-reset
totals. Retain the final export with the working papers for the final report.

Broad disposition: **no new issue to raise from these two counter checks,
based on the reviewed export and the analyst's satisfactory final-rerun
confirmation**. Earlier pass statements made before separating decrease types
were provisional; this note records the final rule and the evidence distinction.

## Use in the final validation report

Describe the work as a definition-led refinement of account-level testing:
MVT distinguished ordinary monthly ageing, repeated zero values, possible
resets, positive-value decreases, upward jumps, numeric reversions and temporary
missing/special states, rather than applying one generic movement tolerance.

Draft broad wording, to reconcile to the retained final export when assembling
the final report:

> MVT performed account-level checks on the two months-since-event counters,
> assessing monthly progression, resets, upward jumps and reversions, and
> transitions to or temporary occurrences of missing and special values. The
> checks reflected the expected behaviour of each counter. No exceptions were
> reported following the final counter-specific review.

This conclusion is limited to the agreed temporal checks and observed account
history. It does not independently validate all underlying event dates,
linked-account mappings or reasons for resets. It does not establish the
absence of missing/special values in the population, and it does not support
an overall pass for the other account-level fields.
