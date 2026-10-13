# Field selection and module switches

The Fields sheet contains FIELD_NAME, FIELD_TYPE and ACTIVE_IND.
ACTIVE_IND=Y selects a field; N excludes it from all tests. The test switches in
sas/00_run_dq_engine.sas apply to every active field of the matching type.
There are no per-field test flags. The project ACTIVE_IND controls whether the
project itself is enabled.

For example, numeric_basic=Y and numeric_outliers=N run Numeric Basic on all
active NUMERIC fields. To test 50 numeric fields, mark those 50 ACTIVE_IND=Y
and the remaining numeric fields N. Other types keep their own active selection.
Select categorical_basic, date_basic and identifier_basic as needed.
Percentiles, outliers, PSI and Excel export remain unavailable and must stay N.

The starter workbook contains 589 field mappings, all active. Preserve your
edited workbook and reload it only when configuration changes. Use file 04 to
load Excel and require APPLIED before running file 00. Require SUCCEEDED before
reviewing DQ_BASIC_REVIEW.

## Check active fields after loading Excel

```sql
SELECT FIELD_TYPE,COUNT(*) AS ACTIVE_FIELDS
FROM LAB_T_ORION_MVT.DQ_FIELD_CONFIG
WHERE PROJECT_ID='RDS' AND ACTIVE_IND='Y'
GROUP BY FIELD_TYPE;
```

Compare these counts with your workbook selection. Module switches determine
which selected field types actually run. A selected module with no eligible
fields fails explicitly.
