# Validation evidence and unverified dependencies

## Current status

- Local static and starter-workbook checks passed. They do not compile or run
  SAS or Teradata.
- The user's supplied SAS log confirmed the synthetic controller/lifecycle
  test passed on their server.
- The user later reported a successful Excel load and a 50-field RDS run;
  they confirmed field counts, result counts and sample metrics.
- Teradata deployment of the new basic modules, run-number allocation and
  review views has not been confirmed.
- Full RDS reconciliation, performance benchmarking and configuration-rollback
  tests are not claimed complete.

The sections below are a revision history. Earlier statements about connection
failures, removed helpers or unverified fixes describe their status at that time;
use README.md and EXCEL_CONFIGURATION.md for current operating instructions.

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

## Direct Excel configuration revision

Added an editable three-sheet RDS workbook, a direct SAS loader and an additive
Teradata migration/apply procedure. Per the final user instruction there is no
SAS workbook validation or approval-preview phase. Connection/file/staging errors
remain errors, and the database applies the configuration transactionally.
Original field mappings and profiling SQL are unchanged. New workbook packaging,
static source checks and source/seed alignment were checked locally; new SAS/XLSX
reads, transactions and live loading remain unexecuted. A database test script
covers commit/rollback and history preservation. The user's current Teradata
connection failure is still unresolved and must be retested on Monday.

Checks executed for this revision:

- `node DQ_ENGINE/tools/check_static.mjs`: passed for 24 SQL/SAS files;
  dynamic aggregate templates stayed below the existing SQL text limit at
  batch sizes 25 and 30.
- `node DQ_ENGINE/tools/check_config_workbook.mjs`: passed; three sheets,
  all 589 field mappings and initial settings match the supplied configuration.
- ZIP integrity and a secure JDK XML parser: passed for the workbook archive
  and all eight XML/relationship files. This does not establish Excel or SAS
  compatibility at runtime.
- `git diff --check`: passed. Existing profiling modules, result SQL and
  SAS run/controller files were unchanged by this revision.

## Excel replaces project seed configuration

Removed `setup/03_seed_rds_config.sql`. Its project/field/settings values were
already present in the editable three-sheet workbook. The ten fixed Numeric
Basic metric definitions moved unchanged into the one-time file 00 table setup.
Fresh installs leave project configuration empty; the first workbook load creates
the project and its own settings, without a global row. Existing installations
retain their previously loaded
metadata, settings and results; no live migration or deletion was performed.

Test fixtures now provide settings for every synthetic project. Ten database
assertions use aggregate anchors so that an absent global settings row cannot
silently skip their checks. Local checks cover the fixed metric catalog, workbook
mapping and SQL/SAS structure; fresh-install SAS/Teradata execution is unverified.

Executed `check_static.mjs` (23 SQL/SAS files), `check_config_workbook.mjs` and
`git diff --check`: passed. Compared the ten moved metric INSERT statements
with the former seed: identical. The workbook, profiling modules, result SQL
and active SAS controller/Excel loader were unchanged by this revision.

## SAS SQL literal correction

The user reported U0001 (invalid run UUID) after restoring the SAS connection.
The controller contained single-quoted macro references in its CALL and read
filters; these can reach Teradata as literal variable names. It now uses SAS
QUOTE with a single-quote delimiter to construct resolved SQL literals before
issuing the statements. The same correction covers both configuration loaders
and the synthetic SAS reconciliation query. A safe `NOTE: DQ CALL:` diagnostic
records only the database, run UUID and project.

The static checker rejects unresolved macro references inside SAS single-quoted
strings and includes the failing CALL shape as a regression example. Source and
workbook checks passed locally. SAS macro expansion and the corrected live CALL
have not been executed here. No Teradata procedure, field mapping, workbook or
profiling calculation was changed.

## SAS datatype diagnostic

The user reported an unsupported DBMS datatype followed by PROC SQL NOEXEC,
without the failed query. A read-only SAS diagnostic now describes all four
controller result shapes with WHERE 1=0, then compares module-log projections
with/without its long Unicode SQL text and a summary with numeric casts. Each
probe starts a fresh PROC SQL and records both SAS SQLRC and DBMS SQLXRC.
No profiling procedure is called. At that point the failing live datatype was
unidentified; neither workaround was claimed verified. The
diagnostic has passed local source checks but has not been executed in SAS.

## SAS module-log text compatibility

The user subsequently identified DQ_MODULE_LOG.SQL_TEXT as the unsupported
column. The controller now explicitly selects module log fields and casts the
first 8,000 SQL text characters to VARCHAR(8000), with original length and a
truncation flag. Full Unicode SQL text remains stored in Teradata. Every required
controller read checks both SQLRC and SQLXRC so a SAS conversion/CREATE failure
cannot be accepted as a successful read merely because SQLXRC stayed zero.
Local source/workbook checks passed; the bounded-text read has not been executed
in SAS here or confirmed on the user's server. Teradata tables, procedures,
calculations and workbook mappings were unchanged.

## SQL text exclusion and EG submission encoding

The full-execution test later failed on its success case. The user then supplied
an EG error converting U_UTF8_CE to U_LATIN9_CE, with a source excerpt beginning
LOG_START_INDICATOR/title. That points to code-submission transcoding; it does
not establish a failed database read or identify the offending character.
All eight checked-in SAS files were checked locally and contain ASCII only.

Independently, the controller now omits SQL_TEXT entirely from module-log reads
instead of returning the earlier bounded preview. Full text stays in Teradata.
The loader prints a controller version and SAS encoding, reads print stage
markers, and a summary-read failure has an explicit error message. No failed
test assertion was removed. Local source/workbook checks passed; this latest
controller change and EG submission check have not been verified on the server.
The earlier failed full-execution run is not claimed as a pass.

## Controller test connection setup

The user's latest complete failure log showed the three intentional switch
errors followed by missing td_server/td_authdomain/dq_database and an aborted
success assertion. The test now initialises these public connection settings
inside the same submitted file and validates the context before its cases.
Fixture summary variables are local, summary SQLRC is checked, and an unexpected
status prints the controller's error detail. Existing status, result-count and
completed-ID assertions remain. Source/workbook checks passed locally; the revised
test has not been run in SAS here. Further failures require the latest stage/error
log and are not assumed fixed by this connection-initialisation change.

## Undefined SQLXRC correction

The subsequent full log showed that connection context validation passed, then
SQLXRC was undefined after CONNECT. The combined numeric EVAL failed before the
first configuration read. A shared status helper now uses SQLRC for CONNECT
and checks SQLXRC only when available after pass-through statements. This also
avoids interpreting a stale previous DBMS return code as a CONNECT failure.
The same helper is used by configuration loaders and the read/reconciliation
diagnostics. Original system statuses, SQL_TEXT exclusion and test assertions
are preserved. Local source/workbook checks passed; live execution remains
unverified. This identifies a specific macro error, not a new datatype failure.

## SAS run-summary datatype correction

The uploaded full log confirmed controller version 20261012_SQLRC_GUARD,
successful configuration (5 rows), run-status (1 row) and module-status (4 rows)
reads, then an unsupported datatype at the run-summary read. The new SAS
projection casts its five numeric count columns to FLOAT; the Teradata view and
stored results are unchanged. Compatibility of this projection remains to be
verified on the user's server. SAS summary integers above 2^53 may round.

That log also exposed error 180 caused by an unescaped semicolon inside a
%LET error-message assignment. The three affected read-error messages now use
periods, keeping each message within its assignment. Local static/workbook and
ASCII checks passed. The user's failed full-execution test is not a pass, and
its status/result-count/completed-ID assertions remain unchanged.

## User-server controller validation, 2026-10-12

The user supplied a full SAS log ending with
`NOTE: SAS controller switch and lifecycle checks passed.` This is evidence
from the user's server; the test was not executed in this workspace.

The log and its displayed test source show:

- Invalid switch, deferred-module selection and no-module selection were
  rejected intentionally without allocating a run UUID.
- Lowercase Numeric Basic selection ran the synthetic DQ_TEST project
  successfully. Configuration, run-status, module-status and summary reads
  all completed; the summary contained one row and nine columns.
- The test's five-field/400-metric-result assertions completed without abort.
- Reusing the successful run UUID was rejected with Teradata SQLSTATE U0002.
  SAS then entered NOEXEC and reported unconfirmed status for that rejected
  request; the test correctly expected FAILED and reached its final passing NOTE.

The successful PROC SQL step took 11.09 seconds in this synthetic run. This
does not establish RDS runtime, source correctness, Excel loading or the other
database test suites. The submitted test source was the earlier minimal harness;
it exercises the same core cases/assertions but does not independently validate
the later connection-initialisation and diagnostic additions.

## Current user-server workflow and repository cleanup

The user subsequently reported a successful Excel configuration load and
confirmed its 589 field counts (415 NUMERIC, 125 CATEGORICAL, 35 DATE,
14 IDENTIFIER). They reloaded a 50-field Numeric Basic selection and confirmed
the selected count. Their RDS run was reported SUCCEEDED with 139,000 metric
rows, and they checked sample metrics and the period-count breakdown. These
are user reports, not a locally executed reconciliation or a supplied full RDS
log. No RDS runtime benchmark or all-metric source reconciliation is claimed.

The repository cleanup removes the retired CSV loader, its staging definition
from fresh-install SQL, the one-time workbook generator and the temporary SAS
read diagnostic. Existing deployed tables and data are untouched. Input audit
CSVs, validation suites and local checks remain. The run entry now defaults to
RDS, with field selection still controlled by the loaded workbook. The root
guide and deployment/configuration instructions describe the current workflow.
Historical evidence above records earlier revisions; it is not an instruction
to use removed helpers. The new DQ_NUMERIC_REVIEW view has passed local static
checks, but its Teradata deployment has not been confirmed by the user.

Cleanup verification: check_static.mjs passed for the 23 remaining SQL/SAS
files, check_config_workbook.mjs passed, all 20 relative documentation links
resolved, all remaining SAS source was ASCII, and git diff --check passed.
The workbook, profiling procedures and review view were unchanged by cleanup.

## Not executed in this workspace

All database fixture tests, live RDS queries, SAS execution/reconciliation and benchmarks remain unrun here. There is no SAS executable, Teradata client/session or database connection in this workspace. The user-server evidence above is separate; no local Teradata compilation or SAS execution is claimed.

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


## New basic modules and readable run numbers

The user approved categorical/identifier missing counts, missing percentages
and distinct counts, excluding category frequencies. Date scope is limited to
earliest/latest dates in final review, without date rows in DQ_METRIC_RESULT.
They also chose short run numbers while preserving internal UUIDs.

The implementation adds batched shared aggregation with public type-specific
procedures, a persisted date review store, independent SAS switches, a combined
completed-only review view and a transaction-protected number mapping/counter.
The original Numeric Basic SQL interface remains as a two-argument wrapper.
The numeric snapshot queries now isolate numeric fields; numerical calculations
are unchanged. Existing workbook structure, field classifications, numeric
metadata and colour rules are preserved. Historical results are not rewritten.

Local checks executed:

- check_static.mjs passed for 35 SQL/SAS files and reconstructed both numeric
  and new dynamic aggregate/insert templates. Thirty maximum-length field names
  generate 8,800-character categorical/identifier statements and 7,330-character
  date statements, below the 32,000-character buffer.
- check_config_workbook.mjs passed for the unchanged starter workbook.
- check_review_views.mjs executed adapted checked-in view SELECT logic using
  Node SQLite on synthetic rows. Pivoting, period separation, date-only summary,
  preserved timestamp strings, short-number filtering and exclusion of
  RUNNING/FAILED rows passed. This is not Teradata compilation or a precision,
  SPL, transaction, source-aggregation or SAS compatibility test.

New SQL/SAS fixture tests are supplied but have not been executed here. Verify
multiple DISTINCT aggregates with GROUPING SETS, aggregate count range,
TIMESTAMP conversion, serialized counter locking, grants and SAS reads on the
user's server before accepting the upgrade. Concurrent numbering requires a
separate two-session test. No customer data, credentials or live results were
added to the repository, and no SAS/Teradata deployment was performed.


## Categorical period-key failure and repair

The user reported a failed non-numeric-only SAS test with secondary-index
uniqueness errors in DQ_METRIC_RESULT for CATEGORICAL_BASIC. They confirmed the
three metric definitions matched the expected ordinal/name/percentage catalog.
Their read-only source aggregation diagnostic returned fourteen rows instead
of eight, including repeated NULL year/month rows, and every GY/GM flag was 1.
Those flags label every aggregate as OVERALL/ALL in the result insert, producing
duplicate unique keys. This is user-server evidence; a full Teradata optimizer
or version-level defect diagnosis is not claimed.

The shared helper now uses three explicit ordinary GROUP BY queries combined
with UNION ALL for categorical/identifier fields, with literal grouping flags.
Date and numeric aggregation are unchanged. No unique index is weakened and
no arbitrary result deduplication is added. Distinct counts are calculated
independently at each level. This uses three source references per batch.

The static tool reconstructs these actual dynamic SELECT templates and executes
adapted SELECT logic using Node SQLite on synthetic rows. It confirms eight
unique final period keys, distinct counts, NULL-date period separation and the
single zero-count OVERALL row for an empty source. Maximum-length 30-field
statements are 25,760 characters for categorical/identifier, below the existing
32,000-character buffer; date remains 7,330. Static checks passed for 35 SQL/SAS
files. Portable review checks and diff whitespace checks also passed.
The repaired procedure has not yet been compiled or executed on Teradata.
