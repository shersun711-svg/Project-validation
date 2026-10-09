# Validation evidence and unverified dependencies

## Executed in this workspace

- Reviewed the full master specification, actual workbook and complete RDS view definition.
- Extracted and reconciled all 589 workbook rows, preserving names and normalising type capitalisation only. Counts: 415 NUMERIC, 125 CATEGORICAL, 35 DATE, 14 IDENTIFIER.
- Reconciled the 589 distinct outer-view output names against the workbook: no missing names, extra names or duplicate configured names.
- Ran `node DQ_ENGINE/tools/check_static.mjs` with both original input paths. All checks passed for the original 20 SQL/SAS files: seed/config alignment, SQL/SAS quote/comment/parenthesis checks, basic procedural/macro block counts, deferred-file absence and reconstructed dynamic SQL templates.
- Reconstructed the actual aggregate/insert templates for 25 real fields and 30 maximum-length field names. Statement lengths fit declared buffers, all ten numeric CASE branches retain their own DECIMAL casts, and generated SQL references the source once per batch template.

Node is used only for developer-side file checks; it is not an engine runtime dependency. No Python was used. These checks are lexical/configuration/template evidence, **not** SQL/SAS compiler evidence or application execution tests.

Reproduce the local checks from the checkout:

```sh
node DQ_ENGINE/tools/check_static.mjs
# Optional: also reconcile the original inputs (requires unzip):
node DQ_ENGINE/tools/check_static.mjs /path/book2.xlsx /path/2.1._final_RDS_view_ddl.sql
```

## Workbook-authoritative revision

The user reported that view physical types were NULL in DBC.ColumnsV and requested removal of that check. The runtime now follows the workbook classifications without a metadata lookup. The configuration validation view was removed, the SAS controller reads DQ_FIELD_CONFIG directly, and missing/incompatible field fixtures exercise SQL execution failure and recovery. Configuration identifier and selection checks remain. The current static checker covers 19 SQL/SAS files; database/SAS execution remains unverified.

## Teradata SQLSTATE correction

The user reported SPL020 during Numeric Basic compilation: SQLSTATE 75001
was invalid. All custom SIGNAL codes in both procedures now use Teradata's
user-defined class U (U0001 through U0011). The completed-run rejection test
expects U0002. Static checks validate these codes; live compilation of this
revision remains unverified.

## Monthly reconciliation format correction

The user reported a datatype/FORMAT error in query 13 of test_numeric.sql.
The independent monthly baseline now formats FACT_DT as DATE before casting
to CHAR(10). This changes only the test expression, not the profiling engine.
Local static checks passed; the corrected statement has not been executed
against Teradata here.

## Supplied but not executed

All database fixture tests, live RDS queries, SAS execution/reconciliation and benchmarks are unrun. There is no SAS executable, Teradata client/session or database connection in this workspace. No successful Teradata compilation, data validation, failure recovery, runtime or performance result is claimed.

The SQL fixture tests cover missing/zero counts and rates, min/max/mean/sample deviation, eight overall/year/month/UNKNOWN periods, count reconciliation, all-NULL/constant/singleton fields, large exact decimal extrema, empty sources, exact/adjacent 1% and 5% boundaries, non-percentage colours, invalid configuration, runtime overflow cleanup, retries, historical attempts and protected completed IDs. SAS tests cover switch validation, success-status reads, repeated completed-ID rejection and ten synthetic overall metrics compared with VARDEF=DF calculations. Remaining module tests are deliberately absent.

## Deployment assumptions requiring verification

1. Installed Teradata release accepts the SPL/dynamic CTAS, GROUPING/empty grouping-set, diagnostics, CASE, sample-deviation and update-from syntax used here. Submit complete procedure bodies to the compiler and run fixtures; local checks cannot establish this.
2. Teradata session-mode statement transactions allow persisted failure logs/cleanup. The SAS connection explicitly requests `mode=teradata`; do not wrap the CALL in BT/ET or an ANSI transaction. Force the supplied runtime failure and verify persisted FAILED status before production use.
3. Runtime grants cover source SELECT, DQ configuration/table DML, procedure EXECUTE and DBC.SysExecSQL. Database column metadata is no longer required. Test both deployment and runtime accounts separately.
4. SAS/ACCESS Teradata supports the site's AUTHDOMAIN, encrypted connection setup, UUIDGEN, explicit CALL and small LIBNAME configuration uploads. Compile/run with the organisation's SAS release and authentication configuration.
5. Workbook logical classifications are assumed correct by user decision. Physical types are not checked. Values must fit DECIMAL(38,10); additional fractional digits round at storage, and overflow/incompatible operations must be captured by execution error handling. Live source range and arithmetic remain unverified.
6. AGMT_ID/FACT_DT uniqueness, interval non-overlap, upstream join cardinality and source population stability are unverified. Results count final-view rows. Run the supplied key and population checks.
7. For future TIMESTAMP WITH TIME ZONE reporting fields, align time-zone extraction conventions with SAS/business calendar expectations. The configured reporting date is assumed compatible with EXTRACT; no dictionary confirmation is performed.
8. Empty grouping sets produce an OVERALL row even with no input, and singleton sample deviation is NULL on the installed release. The fixtures explicitly require these outcomes.
9. Statement/spool limits, workload policies, actual physical scans, batch optimum and direct-view-versus-stage benefit are unmeasured. Approve them with EXPLAIN/DBQL and reconciliation evidence.
10. Per-attempt field/config capture is checked, but data is not locked into a source snapshot across batches. Recovery after session cancellation requires an operator to confirm the old request has ended before changing RUNNING status.

Do not treat a zero-row, skipped or failed test run as a pass. Inspect every assertion query, client return code and SAS log. Keep live validation evidence alongside the run UUID and deployment version when these steps are executed.
