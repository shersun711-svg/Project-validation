PRE-RDS: FIRST ORION TABLE — COMPLETENESS, ACCURACY SCREENING AND UNIQUENESS
MVT. Updated 13 November 2026.

Confirmed mapping
Project: PRE_RDS_ORION_TXN
Source: DWP00V_03_ORION_LEVEL1.AGGR_ACC_TXN_FACT
Reporting date: FACT_DT
Identifier: ACC_PROBE_ID

Files
DQ_PRE_RDS_ORION_TXN_config.xlsx -- 20 NUMERIC fields + ACC_PROBE_ID as IDENTIFIER.
The workbook is prepared locally and provided in the chat. Its GitHub upload
requires separate explicit authorization; the scripts can use the downloaded copy.
02_run_profiling.sas            -- source-specific wrapper for the existing engine.
03_check_uniqueness.sql        -- read-only monthly uniqueness aggregates.
01_check_source_columns.sql    -- optional metadata check if a source column fails.

Run order — keep SAS steps in one session
1. Put DQ_PRE_RDS_ORION_TXN_config.xlsx on the SAS server.
2. Load basic_profiling/02_load_controller.sas.
3. Load basic_profiling/03_define_excel_loader.sas.
4. Set config_workbook and approved connection settings in
   basic_profiling/04_load_configuration.sas. Run and require APPLIED.
5. Run this folder's 02_run_profiling.sas and require SUCCEEDED.
   It enables numeric_basic, numeric_outliers and identifier_basic.
   The project is already PRE_RDS_ORION_TXN; other modules remain N.
6. Run 03_check_uniqueness.sql in Teradata SQL Assistant, or through the approved
   SAS/Teradata connection. It does not depend on a profiling run number.
7. Retain the run number and export monthly profiling results plus the uniqueness
   output for review. Do not rerun installation CREATE scripts.

Meaning of the checks
Completeness: source row counts, nonmissing/missing counts and missing rates.
Accuracy screening: numeric min/max, mean, percentiles and mean +/-3 population-SD
outlier counts. Unusual values are review candidates, not proof of incorrect data.
Identifier profiling: NULL/non-NULL and distinct-key counts by enabled period.
Uniqueness: one nonmissing ACC_PROBE_ID per calendar month of FACT_DT.
The same identifier in different months is expected and is not a duplicate.
Overall identifier distinct counts should not be compared with all-history row
counts as though each account could occur only once across the entire history.

Uniqueness output
MONTH_END: month of FACT_DT; NULL is the missing-reporting-date bucket.
TOTAL_COUNT: source rows.
MISSING_KEY_COUNT: NULL or blank identifiers.
DUPLICATE_KEY_GROUPS: nonmissing monthly identifier groups with >1 row.
EXCESS_DUPLICATE_ROWS: rows above one per such group.
FACT_DATE_COUNT: different FACT_DT dates in the month. If >1, confirm the source
grain before treating duplicate groups as data errors.
The SQL combines NULL and blank keys as missing; the generic Identifier Basic
module's missing count is NULL-only. Their missing counts can differ if blanks
are present. No account IDs or source values are included in the SQL output.

Configuration decisions
The separate project ID preserves RDS configuration and results.
No source-specific special codes were confirmed. Inherited RDS example specials
remain inactive; some could be genuine transaction amounts.
The original input's AGMT_ID identifier was replaced with the confirmed
ACC_PROBE_ID. No assumption that the two are equivalent is made.
Overall/monthly profiling stays Y/Y; yearly is N; outlier multiplier is 3.
Existing green/red thresholds are screening defaults, not approved materiality.

Population and execution
The existing engine profiles the configured source as supplied. This workbook
has no source filter or observation-window setting. The uniqueness query uses
the same unfiltered source. Restrict saved monthly comparisons to the intended
period and verify denominator counts against CDAO before diagnosing differences.
Keep source data stable; separate queries are not a transaction-wide snapshot.
These files were prepared and locally checked, but live SAS/Teradata execution
and comparison to CDAO outputs remain to be completed by MVT.
