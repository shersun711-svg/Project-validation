# Special-value configuration and review

Users configure project-wide lists in Excel. Basic profiling counts special
values separately and excludes them from numeric distribution statistics and
categorical distinct counts. Only SQL NULL contributes to missing counts.

## Excel lists

The SpecialValues sheet contains FIELD_TYPE, SPECIAL_VALUE and ACTIVE_IND.
Each row defines one numeric or categorical value. Format SPECIAL_VALUE as Text;
Y enables it and N disables it. Lists apply to all selected fields of that type.
Date and identifier fields are unchanged. The starter includes the user's
21 numeric values and 11 categorical labels; config/special_values.csv contains
the same sheet contents for copying.

Preserve your edited Project, Fields and Settings sheets. Copy only SpecialValues
from the starter into your workbook. The unedited starter enables all 589 fields.
Load with file 04 and require APPLIED. Numeric equality uses typed DECIMAL(38,10)
values; there is no matching tolerance or source-value rounding. Numeric specials
use signed decimal text with up to 28 integer and 10 fractional digits, without
scientific notation. Categorical matching uses UPPER(TRIM(value)), ignoring case
and surrounding ordinary spaces. Remaining distinct values retain source
comparison semantics.

A present SpecialValues sheet replaces the project's whole list atomically with
other configuration. An empty sheet with headers clears it. An older workbook
without that sheet preserves stored lists. Disabled entries remain in configuration
but not in the run snapshot. Duplicate normalized categorical labels or malformed
numeric text fail application. SAS loads directly without a validation-preview stage.

## Populations and results

| Metric | Definition |
|---|---|
| TOTAL_COUNT | All source rows |
| NON_MISSING_COUNT | Non-NULL values, including specials |
| MISSING_COUNT / MISSING_RATE_PCT | SQL NULL count and 100 * missing / total |
| SPECIAL_COUNT / SPECIAL_RATE_PCT | Matching non-NULL count and 100 * specials / total |
| Numeric MINIMUM, MAXIMUM, MEAN, STDDEV_POP | Exclude NULL and numeric specials |
| Categorical DISTINCT_COUNT | Exclude NULL and categorical specials |

Statistics use NON_MISSING_COUNT - SPECIAL_COUNT observations. All-special fields
can have zero missing count and NULL statistics. A singleton valid population has
zero population deviation; constants also have zero deviation.
Empty sources have zero counts and NULL rates; their classifications are
NOT_EVALUATED in DQ_RULE_RESULT. Missing and special percentages use the same
exact-count green/amber/red rules, stored separately from profiling values.

Zero count/rate retain their original definition, even if zero is added to the
special list. Availability dates still use non-NULL values, including specials.
Basic Numeric stores 12 metrics per field/period; Categorical stores 5, Date 4
and Identifier 3. DQ_BASIC_REVIEW presents the values in one field/period row;
matching statuses are available in DQ_RULE_RESULT. Old runs without special
calculations have NULL special columns. Configuration changes do not rewrite
completed results.

## Test special values first

Use the controller already deployed in your working SAS session while the
current server test finishes. For a Basic-only special-value test, enable
numeric_basic and categorical_basic; keep date_basic, identifier_basic,
numeric_outliers, categorical_psi and export_excel=N. The older deployed
controller also has a retired module switch: leave it N. This release's SAS
entry program no longer exposes that switch.

Require SUCCEEDED, then review the new RUN_NUMBER in DQ_BASIC_REVIEW. Compare
SPECIAL_COUNT and SPECIAL_RATE_PCT for known sentinel fields, verify missing
counts remain NULL-based, and compare numeric extrema/mean/deviation after
excluding specials. Categorical distinct counts must exclude configured labels.
A small field selection still reads the configured source population.

For future Basic-only runs, SQL_BATCH_SIZE can be restored to 25 in Excel and
reloaded with file 04. Effective caps remain 10 numeric and 8 categorical fields.
Keep configuration/source stable throughout a run; do not reload during execution.

## Deployment and validation

For new installations use [the current deployment sequence](README.md#one-time-deployment).
The repository includes prepared optional Outliers and its shared statistics
prerequisite. Before replacing current Basic/run procedures, follow
[the Outlier support deployment guide](NUMERIC_OUTLIERS.md), even if its switch
will remain N. Do not deploy piecemeal during a running profile or rerun existing
CREATE scripts. This repository update does not change the deployed database.

The special-value schema/loader uses setup 14/15, helper 02 and apply procedure 07.
Excel layout and loader are unchanged by removing the retired module. Old stored
metric definitions/results need no deletion; retain them for history.

In an isolated test engine run tests/02_create_extended_fixture.sql, then
 tests/test_extended.sql and tests/test_extended.sas. The mixed Basic fixture has
390 metrics/36 review rows; the empty fixture has 65 metrics/6 review rows.
tests/test_extended_config.sql checks replacement, escaped quotes and rollback.
Use fresh consistent UUIDs when repeating completed fixture runs.

Local tools execute adapted generated aggregates/inserts and review queries
on synthetic SQLite data plus workbook checks. These do not compile Teradata
SPL or run SAS. Supplied server tests, runtime privileges, source compatibility,
cleanup and performance remain server checks. Outliers is prepared separately;
PSI and Excel reporting remain deferred.
