# Special values and numeric percentiles

Users configure lists in Excel. Basic profiling counts configured specials
separately and excludes them from distribution statistics. Numeric Percentiles
is an independent optional module selected with numeric_percentiles=Y in file 00.
No SAS or Teradata execution of this extension has been performed here.

## Configuration

Add a SpecialValues sheet to your existing edited workbook by copying that
sheet from config/DQ_RDS_config.xlsx. Preserve your Project, Fields and Settings
sheets, including your selected 50 numeric, 2 identifier, 4 date and 9 categorical
fields. Do not replace your edited workbook with the unedited starter: it enables
all 589 fields. config/special_values.csv also contains the same sheet contents.

| Column | Meaning |
|---|---|
| FIELD_TYPE | NUMERIC or CATEGORICAL |
| SPECIAL_VALUE | One value per row; format this column as Excel Text |
| ACTIVE_IND | Y enables this special value; N disables it |

Lists apply to every active field of the matching type in the workbook's project.
There are no per-field lists or flags. Dates and identifiers are unchanged.
The supplied sheet contains the user's 21 numeric values and 11 categorical
labels. Edit lists only in Excel, then reload using file 04.

Numeric comparisons use typed DECIMAL(38,10) configuration values and equality;
there is no tolerance or rounding of source values before matching. Categorical
matching uses UPPER(TRIM(value)), ignoring case and surrounding ordinary spaces.
Distinct values that remain after exclusion retain source comparison semantics.
Numeric specials use signed decimal text with up to 28 integer and 10 fractional
digits (for example 0.5; no scientific notation). Keep
values as text to preserve their intended representation through the XLSX loader.
Malformed numeric text fails database application and rolls back configuration.

A present SpecialValues sheet replaces this project's complete stored list in
the same transaction as Project/Fields/Settings. An empty sheet with headers
clears the list. An older workbook without this sheet preserves the stored list;
for a project with no stored list it excludes nothing. Disabled values are retained
in configuration but not in the run snapshot. Duplicate normalized categorical
values fail application; each value should have one configuration row.
SAS loads configuration directly and does not add a workbook-validation stage.

## Results and populations

- TOTAL_COUNT, NON_MISSING_COUNT and MISSING_COUNT remain based on SQL NULL.
- SPECIAL_COUNT counts non-NULL values matching the configured list.
- SPECIAL_RATE_PCT = 100 * SPECIAL_COUNT / TOTAL_COUNT. The shared percentage
  classification uses exact saved counts and captured thresholds.
- Numeric MINIMUM, MAXIMUM, MEAN and STDDEV_SAMP exclude NULL and special values.
- Numeric percentiles exclude NULL and special values, even when Numeric Basic=N.
- Categorical DISTINCT_COUNT excludes NULL and special values.
- Zero count/rate retain the original definition, including if a user adds zero
  to the special list. Availability dates retain the original non-NULL definition.

Specials remain non-missing: the statistics population is
NON_MISSING_COUNT - SPECIAL_COUNT. An all-special numeric field can have zero
missing count and NULL statistics. An empty source has zero counts, NULL rates
and NOT_EVALUATED rate classifications. An all-NULL field with rows has 100%
missing, zero specials and NULL statistics. A singleton valid population has
NULL sample standard deviation and identical quantiles; a constant valid
population has constant quantiles and zero deviation when n >= 2.

Basic Numeric now stores 12 metrics per field/period; Categorical Basic stores
5; Date Basic remains 4; Identifier Basic remains 3. Percentiles store 7 extra
metrics, never percentages and never coloured. Old completed metrics are preserved:
new special/percentile columns are NULL for runs that did not calculate them.
Historical statistics retain the definitions used when those runs executed.

DQ_BASIC_REVIEW remains the final combined view. Basic metrics and quantiles
share one field/period row; MODULE_NAME is NUMERIC_BASIC+PERCENTILES when both
are present. Percentiles-only rows have NULL basic metrics and availability.
DQ_RUN_SUMMARY still groups by module; field counts overlap across basic and
percentile modules. Do not sum module field counts to obtain distinct fields.
DQ_RUN_SPECIAL_VALUE preserves the latest attempt's selected special definitions.
Retries refresh configuration, while previous attempts' SQL remains in module logs.

## Percentile method

For sorted valid observations x[1] ... x[n] and probability p:

    h = 1 + (n - 1) * p
    result = x[floor(h)] + (h - floor(h)) * (x[ceil(h)] - x[floor(h)])

This is continuous linear interpolation, Hyndman-Fan type 7. It differs from
SAS's default PCTLDEF=5; do not compare it to default PROC MEANS percentiles.
Use the formula above for SAS reconciliation. Probabilities are 0.01, 0.05,
0.25, 0.50, 0.75, 0.95 and 0.99. Duplicates keep their full row multiplicity.
Native numeric values determine sorting; positions and interpolation use FLOAT,
then persist DECIMAL(38,10). Large integers beyond FLOAT precision and very
close values require tolerance and may lose precision in the interpolated result.
This is exact rank-based selection, not approximate sampling or percentile bins.

Periods use the configured reporting date. Overall is calculated independently;
yearly and monthly include UNKNOWN for NULL reporting dates. Domain periods
are generated from all rows, so all-special/all-NULL periods still receive seven
NULL quantiles. An empty source produces only OVERALL with seven NULL results.

## Deploy to an already working engine

Pause profiling and Excel loads. Replace DQ_DB with the approved schema,
currently LAB_T_ORION_MVT, in deployment copies, including dynamic SQL literals.
Back up configuration through your normal database process. No completed
results or existing configuration need to be deleted.

1. Run setup/14_create_special_values.sql once to add four small config/staging/
   snapshot tables. Do not rerun existing table CREATE scripts.
2. Run setup/15_add_extended_metrics.sql to add fixed metric definitions.
3. Compile modules/02_special_value_list.sql as one procedure.
4. Recompile modules/10_numeric_basic.sql and modules/15_other_basic.sql.
5. Compile modules/11_numeric_percentiles.sql as one procedure.
6. Recompile setup/07_apply_excel_config.sql as one procedure.
7. Recompile the three complete procedures in modules/00_run_engine.sql
   separately: SP_DQ_RUN_PROFILE, then SP_DQ_RUN_BASIC, then SP_DQ_RUN_ENGINE.
   The two existing basic APIs remain available with their previous signatures.
8. Recompile results/93_dq_basic_review.sql. Existing classification and completed/
   summary views remain usable without recompilation.
9. Have your DBA apply the approved source/config/DML/EXECUTE privileges,
   including owner-reference rights for the new helper, percentile and PROFILE
   procedures. Follow the same containing-database grant approach that resolved
   the earlier owner-reference error; do not assume old grants cover new objects.
10. Load current SAS 01 and 05 in the same session. Controller version is
    20261013_SPECIAL_PERCENTILES. Add SpecialValues to your edited workbook and
    load with file 04. Require APPLIED and confirm field selections and special lists.
11. Test a small numeric/categorical selection using file 00 with numeric_basic=Y,
    numeric_percentiles=Y and categorical_basic=Y. Leave outliers/PSI/export=N.
    Require SUCCEEDED and inspect DQ_BASIC_REVIEW before a full RDS run.

```sql
SELECT FIELD_TYPE,COUNT(*) AS ACTIVE_FIELDS
FROM LAB_T_ORION_MVT.DQ_FIELD_CONFIG
WHERE PROJECT_ID='RDS' AND ACTIVE_IND='Y' GROUP BY FIELD_TYPE;

SELECT FIELD_TYPE,SPECIAL_VALUE,NUMERIC_VALUE,ACTIVE_IND
FROM LAB_T_ORION_MVT.DQ_SPECIAL_VALUE_CONFIG
WHERE PROJECT_ID='RDS' ORDER BY FIELD_TYPE,SPECIAL_VALUE;

SELECT * FROM LAB_T_ORION_MVT.DQ_BASIC_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=YOUR_RUN_NUMBER
ORDER BY FIELD_NAME,PERIOD_LEVEL,PERIOD_VALUE;
```

## Validation and limits

In an isolated test engine, run tests/02_create_extended_fixture.sql once, then
 tests/test_extended.sql and tests/test_extended.sas. Every SQL assertion must
return zero rows; CALL/DDL failures fail testing. The mixed fixture has 600
metric rows and 36 review rows; percentiles-only has 210 metrics and 30 review
rows; the empty mixed fixture has 100 metrics and 6 review rows.

These scripts cover specials versus NULL, fractional numeric specials,
case/space categorical matching, filtered statistics, period-specific quantiles,
UNKNOWN dates, all-NULL/all-special fields, constants, singletons, empty sources
independent percentile switching and failed-module cleanup/retry. tests/test_extended_config.sql covers
sheet replacement, escaped quotes and application rollback. Fixed completed
UUIDs cannot be reused: substitute consistent fresh UUIDs for repeat tests.
Do not run fixture scripts against the production engine.

Local tools execute adapted generated query logic and view logic on synthetic
SQLite data, plus workbook/static checks. They do not compile Teradata SPL or
execute SAS. Verify on the installed Teradata release: volatile MULTISET CTAS
with NO PRIMARY INDEX, analytic ROW_NUMBER/SUM, FLOOR/CEILING, numeric formatting
in literal lists, exact result precision, spool, permissions, cleanup and retry.

Basic source reads and percentile batches are separate; keep source/configuration
stable. Percentiles stage up to 5 cleaned fields plus reporting date per batch
inside Teradata, then expand retained values into three period levels for each
field's sort. This can consume substantial spool. Numeric Basic caps at 10 fields,
Categorical Basic at 8, Identifier Basic at 20, Date Basic at 30. Lower the shared
SQL_BATCH_SIZE if needed; caps bound generated SQL, not measured optimal sizes.
No workload/performance benchmarks have been run here. No underlying source
records are retrieved by SAS. Outliers, PSI and Excel reporting remain deferred.
