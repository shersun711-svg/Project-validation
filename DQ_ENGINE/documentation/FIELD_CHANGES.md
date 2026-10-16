# Field-level MoM and YoY

**DQ_FIELD_CHANGE_REVIEW**, defined in file **94**, is the final wide comparison
view, like DQ_BASIC_REVIEW. One row represents a successful run, field and actual
monthly POU_DT. Each metric has its current value, MoM change and YoY change in
adjacent columns. Numeric Basic and Outliers combine into one field/month row.
There is one deployed comparison view; file 95 has been removed.

It reads saved monthly results only. No RDS scan, configuration reload, result
table, stored procedure, rule evaluation or profiling rerun is needed. Querying
the view calculates changes on demand. SAS file 06 reads a summary, not all details.
Account-level jumps/reversions, categorical PSI and rule colours are separate work.

## Upgrade the previous comparison layout

1. If you deployed the former file 95, drop its dependent review view first:

   ```sql
   DROP VIEW LAB_T_ORION_MVT.DQ_CHANGE_REVIEW;
   ```

   Skip this statement if that view was never created. It removes only a view,
   not saved profiling results. No other view/table needs dropping.
2. Replace DQ_DB with LAB_T_ORION_MVT in
   `teradata/results/94_dq_field_change_review.sql`. Run the complete REPLACE VIEW
   statement in SQL Assistant, followed by its SELECT grant separately.
   Existing view owners still need grantable SELECT on its dependencies.
3. Run the updated `sas/01_dq_controller.sas` in the SAS session. Require version
   **20261016_WIDE_CHANGES**. The old controller expects the former detailed
   layout and must be reloaded after replacing the view.
4. Run `sas/06_run_dq_changes.sas` for your successful short run number with
   mom=Y and/or yoy=Y. Require dq_change_status=SUCCEEDED.

File 06's settings, Excel files and profiling procedures do not need changes.
No rerun of file 00 or configuration load is required. Fresh installations
create only the current file-94 view and its grant; they skip the obsolete-view
cleanup. The table-backed MOM/YOY catalogue also fixes the Teradata error
`A SELECT for a UNION,INTERSECT or MINUS must reference a table`.

## Comparison scope

MoM compares the same field/module/metric with the previous calendar month.
YoY compares with the same calendar month one year earlier. Actual POU_DT gives
the month key, so different snapshot days and leap years do not break matching.
Missing February never makes March compare with January as MoM. YoY does not
require all intervening months or depend on twelve preceding rows.

Only successful monthly results with captured POU_DT are eligible. Overall,
yearly, unknown dates and older results without captured dates are excluded.
Fields/modules come from the saved run, not today's ACTIVE_IND settings. Runs
and projects never borrow comparison values from one another. If numeric and
other types were profiled in separate runs, review their run numbers separately.

## Columns and units

| Example column | Meaning |
|---|---|
| MISSING_RATE | Current fractional rate, such as 0.080000 |
| MISSING_RATE_MOM_CHANGE | Current minus previous calendar month's rate |
| MISSING_RATE_YOY_CHANGE | Current minus the same calendar month's rate last year |

This pattern covers total/non-missing/missing counts and missing rate, special
count/rate, outlier valid count/count/rate, distinct count, zero count/rate,
MIN_VALUE, MAX_VALUE, MEAN_VALUE and STDDEV_VALUE. Counts and their changes are
integers. Rates, numeric statistics and their changes have six decimals.
Categorical/identifier populations reuse saved missing-rate counts as in
DQ_BASIC_REVIEW. Unsupported columns stay NULL for the field type.

Changes are **signed differences**, not relative percentage changes. For a rate
moving from 0.02 to 0.08, the change is **0.060000**. For mean 100 to 125, the
change is **25.000000**. Six-decimal review precision is used throughout;
changes below that precision can disappear. First/missing reference months and
undefined metrics give NULL changes, never zero. A zero baseline still allows
a signed difference. Negative values keep their normal subtraction semantics.

MOM_PREVIOUS_POU_DT and YOY_PREVIOUS_POU_DT retain available actual reference dates.
MOM_STATUS and YOY_STATUS summarise only the metrics present for that field:

- EVALUATED: all present metrics have an evaluable signed difference.
- PARTIALLY_EVALUATED: some present metrics can be compared, while others have
  unavailable current/reference values or reference metric rows.
- NOT_EVALUATED: none of the present metrics can be compared.

Unsupported metrics do not contribute to these statuses. A NULL change with a
missing reference date means no usable reference month/metric was found. A NULL
change with a reference date can mean an unavailable metric value. The wide
layout exposes current values and signed changes; the former per-metric
previous-value/relative-change/reason columns are no longer public columns.
Statuses are separate from DQ_RULE_RESULT and introduce no classifications.

## Run and review

Run the current controller once per SAS session. File 06 accepts a successful
short run number and independent mom/yoy Y/N switches. No Excel reload is needed.
For example:

```sas
%run_dq_changes(project=RDS,run_number=17,mom=Y,yoy=Y);
```

Both switches N returns SKIPPED without a database read. Invalid inputs,
unsuccessful/wrong-project runs and absent dated monthly results fail clearly.
Errors leave the original profiling run and dq_status unchanged; inspect
separate dq_change_status and dq_change_error. No module/run logs are written.
Optional switches in file 00 still request the summary after profiling succeeds.
The view always derives both types; SAS switches select which summaries to show.

WORK.DQ_CHANGE_SUMMARY now counts **field/month rows**, not individual metric
comparisons. It shows COMPARISON_TYPE, FIELD_MONTHS, EVALUATED_COUNT, PARTIAL_COUNT,
NOT_EVALUATED_COUNT, FIELDS_COMPARED and the first/last POU_DT. The three status
counts sum to FIELD_MONTHS for each selected type. The SAS controller reads one
aggregate of the wide view and formats the requested summaries locally.

```sql
SELECT *
FROM LAB_T_ORION_MVT.DQ_FIELD_CHANGE_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=17
ORDER BY FIELD_NAME,POU_DT;
```

For a focused review:

```sql
SELECT FIELD_NAME,POU_DT,
       MISSING_RATE,MISSING_RATE_MOM_CHANGE,MISSING_RATE_YOY_CHANGE,
       SPECIAL_RATE,SPECIAL_RATE_MOM_CHANGE,SPECIAL_RATE_YOY_CHANGE,
       OUTLIER_RATE,OUTLIER_RATE_MOM_CHANGE,OUTLIER_RATE_YOY_CHANGE,
       MEAN_VALUE,MEAN_VALUE_MOM_CHANGE,MEAN_VALUE_YOY_CHANGE,
       MOM_STATUS,YOY_STATUS
FROM LAB_T_ORION_MVT.DQ_FIELD_CHANGE_REVIEW
WHERE PROJECT_ID='RDS' AND RUN_NUMBER=17
ORDER BY FIELD_NAME,POU_DT;
```

Always filter project/run, optionally field. Comparisons are computed from saved
results on demand, so runtime depends on result volume, filter pushdown and the
Teradata workload/plan. DQ_BASIC_REVIEW remains the profiling-only review.

## Verification and independence

The development team's behavior was reviewed as a reference only. This engine's
comparison SQL was written independently; no implementation was copied. No
source/customer data, account IDs or credentials were added.

`node DQ_ENGINE/tools/check_field_changes.mjs` executes the SQL with SQLite date
and decimal adaptations. It checks exact calendar gaps, all types, specials and
outliers, missing/zero/negative values, large values, source retention and run/
project isolation. It verifies every wide metric/change cell against internal
comparison rows, plus dates, statuses, module merging and the actual SAS summary
SELECT (including empty results). The isolated optional Teradata fixture
`tests/test_field_changes.sql` uses the new wide layout; each assertion must
return zero rows. No fixture is required to review completed production results.

SAS DATA-step/macro execution, Teradata compilation/grants, numeric edge cases,
query plans and full RDS runtime remain unverified in this workspace.
