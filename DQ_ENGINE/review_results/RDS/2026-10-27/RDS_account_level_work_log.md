# RDS non-numeric account-level review — work log

Recorded: 27 October 2026

## Scope and evidence

Run 19 covers nine selected categorical fields and `CUTOVER_DT`, January
2005–March 2026. The analyst executed the checks in Teradata and supplied
exports and follow-up results for review. This log records the work completed,
the evidence retained and outstanding clarifications. It does not record an
independent rerun against Teradata.

The updated analyst workbook `Book1 (3).xlsx` contains:

| Original sheet | Work evidenced | Repository evidence |
|---|---|---|
| `Overall` | Ten field summaries, each covering 255 months. | Original aggregate values retained. |
| `POU` | 1,236 field/month exception rows. | Original aggregate values retained. |
| `Specific field` | February/May 2019 package-ID overlap; both MV_EXDAY_PAYREV patterns; both IO_IND patterns; all 12 repayment-type reversion patterns. | Original values retained; later overlap, next-month presence and property-classification pattern results appended. |
| `IO_IND` | 1,839 observations covering 613 flagged three-month windows, with actual and expected indicator values. | Aggregated by flagged month and reversion pattern; event/observation/mismatch totals reconcile to the original. Individual account records are excluded. |

Repository copy: [RDS_account_level_evidence_run19.xlsx](RDS_account_level_evidence_run19.xlsx).
The original account-level workbook remains outside the public repository.
The repository workbook is a working paper, not a manager report. It keeps
the four original sheet names and adds `SQL and analysis`, which records the
question, reproducible SQL, saved result location and interpretation for each
step. Queries were reconstructed from the review discussion and were not rerun
here. The original individual account observations remain in the internal copy.
Future revisions to the working papers are to be saved to the repository;
public copies continue to exclude individual customer records and identifiers.

## Review work and conclusions

| Field / check | Work completed | Review conclusion |
|---|---|---|
| `IO_AT_ORIGINATION_IND` | Monthly summary reviewed for fixed changes and other flags. | No tested movements flagged among eligible comparisons. |
| `CUTOVER_DT` | Monthly summary reviewed; expected missingness considered against W381. | No tested movements flagged; completeness is not established by this result. |
| `PCKG_FTB_CALC_IND` | Monthly summary reviewed. | No tested movements flagged. |
| `MV_EXDAY_PAYREV` | Both pattern totals reviewed: 89,602 and 80,101 events. Ten events sampled across 30 observations in early and later periods; categories reconciled to exposed inputs. | No issue identified in targeted checks. All sampled changes were driven by days in excess moving between zero and positive values. Not full-population source verification. |
| `IO_IND` | All 613 flagged events reconciled across their three-month windows. The uploaded workbook was also checked locally: 1,839 rows, zero actual/expected mismatches, zero expected-value discrepancies against the documented mapping. | Classification check passed. Underlying arrangement validity is a separate question. |
| `REPAY_TYPE_CD` missingness | Analyst inspected all 111 December 2013 temporary-missing records: 1 → missing → 1. | Low-priority finding 2. One further became-missing record did not meet the recovery condition and remains uninvestigated. |
| `REPAY_TYPE_CD` value reversions | All 12 pattern totals reviewed, totalling 654 events. Principal patterns are 3 → 1 → 3 (441) and 2 → 1 → 2 (63). Codes 5/6 are PCI; 0 means no regular repayment. | Low-priority business clarification under finding 3. Counts are events, not distinct accounts. |
| `EVENT_DESCRIPTION` / `MV_PROP_POSTCODE_NM` gaps | Account overlap with missing PCKG_ID checked in February/May 2019, February 2020, March 2022 and November 2024. Following-month presence checked for each field and month. | Most newly missing observations also have missing package IDs; most affected accounts have no observation the following month. Finding 1 requires event/source reconciliation; cause and exact intersection of the two populations are unconfirmed. |
| `MV_PROP_POSTCODE_NM` reversions | All five June 2007 patterns reviewed: 64 events, including 37 house/apartment, 18 urban/non-urban house and nine missing-type/house reversions. | Low-volume observation; detailed source tracing deferred. No error established. |
| `PCKG_2ND_INC_OCC_DESC` / `PCKG_HI_INC_OCC_DESC` | Monthly counts and timing reviewed. Respectively 622/639 and 4,200/4,298 became-missing events occurred before 2010. W455/W462 reviewed. | Low-priority observations pending explanation. Historical capture comments do not establish the cause of populated-to-missing transitions. |

## Follow-up evidence provenance and internal working papers

The analyst supplied the following results in the review discussion. These
support the findings report but should be retained as original SQL exports
in the internal working papers if needed for evidence handover:

- The 111 repayment-type temporary-missing records were confirmed as 1 → missing → 1.
- The 30 MV_EXDAY_PAYREV sample observations and their exposed input values.
- The five June 2007 property-classification reversion pattern counts.
- The six additional package-ID overlap rows for February 2020, March 2022
  and November 2024; these are now transcribed in `Specific field`.
- The ten following-month presence results for both fields across all five
  identified spike months; the presence and absence counts are now in `Specific field`.

The latest report records these aggregate results. The original uploaded
`Book1 (3).xlsx` contains the four February/May 2019 overlap rows but not
the later six overlap rows or the ten following-month presence rows. The
updated repository copy includes all of those aggregate rows, transcribed
from the analyst's supplied results; they were not independently rerun.

## Outstanding follow-up

Send the [findings report](RDS_account_level_findings.md) to CDAO for the
recorded clarifications. Do not classify open observations as passed or as
confirmed errors before receiving supporting explanations. The planned
non-numeric review stage is complete with these limitations. Numeric follow-up
is recorded below.

## Numeric account-level screening — 28 October 2026

The analyst supplied `nuemric result.xlsx`: run 20, 3,570 monthly rows,
14 numeric fields with 255 months each, January 2005–March 2026. There were
14 NO_REFERENCE rows (first month) and 3,556 EVALUATED rows. Summary review
does not establish the overall run-log status or validate every flagged event.
Thresholds are provisional; utilisation and delinquency upstream scales remain
unconfirmed. Month-counter resets and large numeric movements alone were not
classified as data errors.

December 2013 source follow-up used the supplied query joining full internal
account IDs and then assigning anonymous REVIEW_ID values. The resulting
387 rows cover 129 accounts and three months. All 129 had missing package
repayment in December; 128 recovered in January. Package-ID patterns were
127 PRESENT/PRESENT/PRESENT, one PRESENT/MISSING/PRESENT and one
PRESENT/PRESENT/MISSING. The 43 temporary loan-to-income special-value
events and 60 repayment-to-income events are within this group. All 43
loan-to-income values returned exactly to the November value. All ratio
specials in the initial flagged extract were -999993. These observations do
not identify which underlying input or processing caused the gaps.

The initial extract contained only account-ID suffixes; these were not treated
as unique identifiers. Subsequent overlap conclusions above use the anonymous
IDs assigned after full-ID matching, not suffix matching. No account-level
extracts, monetary observations or identifier mappings have been published.

The combined report also records the November 2016 savings-ratio special
reversion cluster (914 events per field). Account overlap and the special
codes involved have not been checked. Attestation comments provide general
context, not a confirmed explanation for that cluster. February/May 2019
numeric missingness is added to the existing population-exit clarification;
cross-field account overlap remains unverified.

At the analyst's direction, further root-cause investigation is left to CDAO.
The report records evidence and requests explanations rather than asserting
errors. Existing raw aggregate categorical evidence is retained unchanged.

## Combined working workbook — 28 October 2026

The analyst supplied Account-level result.xlsx. Original values, formulas and
sheet contents were preserved in the downloadable internal copy. Numeric_POU
and its existing selection were left unchanged. Yellow means selected for review,
including reviewed patterns with no discrepancy; it does not mean confirmed error.
No review-note columns were added.

Seven nonzero categorical overall rows were selected (including IO_IND and
MV_EXDAY_PAYREV, whose targeted checks were satisfactory). Twenty-two monthly
rows were selected for missingness clusters, repayment-type changes, sample
windows already checked and the occupation-field concentrations. These are
review examples, not a claim that all other months passed.

| Sheet | Excel row | Field | Month |
|---|---:|---|---|
| Categorical_Overall | 3 | EVENT_DESCRIPTION | Overall |
| Categorical_Overall | 5 | IO_IND | Overall |
| Categorical_Overall | 6 | MV_EXDAY_PAYREV | Overall |
| Categorical_Overall | 7 | MV_PROP_POSTCODE_NM | Overall |
| Categorical_Overall | 8 | PCKG_2ND_INC_OCC_DESC | Overall |
| Categorical_Overall | 10 | PCKG_HI_INC_OCC_DESC | Overall |
| Categorical_Overall | 11 | REPAY_TYPE_CD | Overall |
| Categorical_POU | 169 | EVENT_DESCRIPTION | 2019-02-28 |
| Categorical_POU | 172 | EVENT_DESCRIPTION | 2019-05-31 |
| Categorical_POU | 181 | EVENT_DESCRIPTION | 2020-02-29 |
| Categorical_POU | 206 | EVENT_DESCRIPTION | 2022-03-31 |
| Categorical_POU | 238 | EVENT_DESCRIPTION | 2024-11-30 |
| Categorical_POU | 260 | IO_IND | 2006-03-31 |
| Categorical_POU | 306 | IO_IND | 2011-08-31 |
| Categorical_POU | 404 | MV_EXDAY_PAYREV | 2005-02-28 |
| Categorical_POU | 583 | MV_EXDAY_PAYREV | 2020-01-31 |
| Categorical_POU | 681 | MV_PROP_POSTCODE_NM | 2007-06-30 |
| Categorical_POU | 821 | MV_PROP_POSTCODE_NM | 2019-02-28 |
| Categorical_POU | 824 | MV_PROP_POSTCODE_NM | 2019-05-31 |
| Categorical_POU | 833 | MV_PROP_POSTCODE_NM | 2020-02-29 |
| Categorical_POU | 858 | MV_PROP_POSTCODE_NM | 2022-03-31 |
| Categorical_POU | 890 | MV_PROP_POSTCODE_NM | 2024-11-30 |
| Categorical_POU | 910 | PCKG_2ND_INC_OCC_DESC | 2005-05-31 |
| Categorical_POU | 932 | PCKG_2ND_INC_OCC_DESC | 2007-03-31 |
| Categorical_POU | 982 | PCKG_HI_INC_OCC_DESC | 2005-05-31 |
| Categorical_POU | 986 | PCKG_HI_INC_OCC_DESC | 2005-09-30 |
| Categorical_POU | 1081 | REPAY_TYPE_CD | 2006-03-31 |
| Categorical_POU | 1130 | REPAY_TYPE_CD | 2011-08-31 |
| Categorical_POU | 1158 | REPAY_TYPE_CD | 2013-12-31 |

The public RDS_account_level_review_workbook.xlsx excludes Numeric_Specific,
which contains full account identifiers and individual values. Its remaining
four sheets contain aggregate evidence and source metadata. The full workbook
remains a downloadable internal artifact. Report observations are based on
analyst-provided exports, not independently executed Teradata checks.

## Workbook publication update — 28 October 2026

The analyst requested that Numeric_Specific be retained and that the full
workbook be uploaded to GitHub after being informed that it contains account
IDs and individual financial values and that this repository is public. The
repository workbook now matches the full five-sheet working copy, including
Numeric_Specific (231 data rows). This supersedes the preceding description
of the four-sheet public copy. No source values or formulas were changed.
