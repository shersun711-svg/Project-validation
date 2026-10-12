# DQ Engine: Phase 1–2 prototype

This implementation uses SAS as the controller and Teradata for all numeric calculations. It implements Numeric Basic only: ten metrics, three reporting levels, persistent aggregate results, shared percentage classification, configuration reads and run/batch logging. The supplied workbook and view DDL were reviewed. No source view changes are required.

Percentiles, outliers, categorical profiling, PSI, date/identifier profiling and Excel export are deferred. Their switches must remain `N`; selecting a deferred feature raises an error before connecting. No placeholder implementation pretends to execute a deferred test.

## Deploy

Prerequisites are SAS 9.4 with SAS/ACCESS to Teradata, an approved SAS authentication domain, and an approved Teradata database separate from the RDS source. Target Teradata 16.20 or Vantage with SPL, dynamic SQL, `GROUPING SETS`, `GROUPING`, `STDDEV_SAMP`, `REGEXP_SIMILAR`, diagnostics and volatile CTAS support. This target has not been compiled or executed here; verify the installed release first.

The deployment account needs create-table/view/procedure privileges in the DQ database. The runtime account needs SELECT on the source, configuration reads, results/log/snapshot DML, EXECUTE on the engine procedures and supported access to `DBC.SysExecSQL`. Verify dynamic-SQL privileges with the DBA. Volatile aggregates require spool space. Grant only approved project source access: procedures use `SQL SECURITY INVOKER`.

1. Make deployment copies of the SQL files and replace **every** `DQ_DB` token with the approved DQ database name, including tokens inside dynamic SQL strings and configuration values. Use an ordinary identifier, maximum 128 characters. Do not execute the supplied RDS source-view DDL.
2. In a Teradata-mode session, deploy `setup/00_create_config_tables.sql`, `01_create_result_tables.sql`, then `02_create_log_tables.sql`. File 00 also installs the ten fixed Numeric Basic metric definitions. Project, field and settings tables stay empty until Excel is loaded. These are one-time creates; do not drop existing tables to rerun deployment.
3. Deploy `setup/06_create_excel_config_tables.sql`, then compile `setup/07_apply_excel_config.sql` as one complete procedure statement. The former project seed file has been removed; no project configuration needs editing in SQL.
4. Deploy `results/90_colour_classification.sql`, `91_dq_summary_views.sql`, then `92_dq_numeric_review.sql`. Database type validation has been removed; skip the former `04_config_validation.sql` step. Submit each `REPLACE PROCEDURE` as a complete SPL statement in a supported client; ordinary semicolon splitting will break a procedure body. With BTEQ, extract the procedure statement to its own file and use the site's approved `.COMPILE FILE` workflow.
5. Compile `modules/10_numeric_basic.sql`, then `modules/00_run_engine.sql`. The latter depends on the former. Inspect compiler errors and warnings; a client accepting a file is insufficient evidence.
6. Edit `config/DQ_RDS_config.xlsx` and load it using `sas/04_load_dq_config.sas`, following [Excel configuration instructions](EXCEL_CONFIGURATION.md). The first load creates the RDS project, all field mappings and its settings row. Require load status APPLIED, then run `tests/validate_rds.sql` configuration/population queries. Workbook FIELD_TYPE is authoritative, with no database metadata comparison. Missing columns or incompatible numeric/date operations will fail during SQL execution and be logged. No missing columns were found in the supplied DDL; no live physical type compatibility is claimed.
7. In a **test environment**, render and run `tests/00_create_numeric_fixture.sql`, `test_numeric.sql`, `test_colour.sql` and `test_failure_restart.sql`, in that order. Fixtures provide their own project settings and do not need an RDS/global seed. CALL/DDL errors fail the test. Each assertion SELECT must return zero rows. Fixture names/UUIDs are synthetic and reserved by these scripts. Run once on a fresh fixture deployment; new repeated test runs need new UUIDs and restored fixtures, not deletion of production history. The additional `tests/test_config_apply.sql` exercises Excel configuration application and rollback; its temporary constraint requires an isolated test engine.
8. Edit the labelled settings in `sas/00_run_dq_engine.sas`: `engine_root`, `td_server`, `td_authdomain`, `dq_database`, `project`, switches and optional retry UUID. Have SAS resolve credentials through the organisation-approved AUTHDOMAIN. No passwords, raw tokens or account-level extracts are needed. Ensure the client uses the approved encrypted Teradata connection configuration.
9. Include the controller in a SAS test session with those connection settings. Run `tests/test_full_execution.sas`, then `test_sas_reconciliation.sas`. Stop on any SAS error or assertion failure. These exercise the synthetic fixture, not production RDS rows.
10. Run `00_run_dq_engine.sas` for `project=RDS`, `numeric_basic=Y`, all other switches `N`. Keep Teradata session mode, **without an enclosing explicit transaction**, so statement-level logging and failure handling work as designed. Check `dq_status`, `WORK.DQ_RUN_STATUS`, `WORK.DQ_MODULE_STATUS` and the database run log. Require `SUCCEEDED`, expected fields/periods, and reconciled sample metrics before accepting results.

The engine database is not automatically created, scripts are not automatically submitted, and no live credentials are supplied by this repository. The SQL and SAS files are actual source code; live compilation/execution and performance acceptance remain deployment gates.

## Normal configuration workflow

Edit the three-sheet `config/DQ_RDS_config.xlsx` workbook and run
`sas/04_load_dq_config.sas` to load Project, Fields and Settings directly into
Teradata. There is no SAS workbook validation/preview phase. Loading stays
separate from profiling. Existing installations need only the additive
`setup/06_create_excel_config_tables.sql` and
`setup/07_apply_excel_config.sql` upgrade. Read
[Excel configuration instructions](EXCEL_CONFIGURATION.md) for exact steps.
Excel configuration input is available; Excel report generation remains deferred.
Users maintain project/source/field/settings values in Excel. The ten metric
definitions installed by file 00 are fixed engine metadata, not user settings.

## Current Enterprise Guide connection and first test

The entry program now uses the user-provided non-secret connection settings:
server `dwhprod`, AUTHDOMAIN `TeraAuth`, engine database
`LAB_T_ORION_MVT`. It defaults to `project=DQ_TEST`, Numeric Basic=Y,
and all deferred switches=N. No password or customer data is included.

In EG 8.2 connected to a SAS server, open the latest local
`sas/01_dq_controller.sas` and run it first to define the macros in that
session. Then open/run `sas/00_run_dq_engine.sas`. Its engine_root is blank
for this workflow; it uses the loaded controller and does not INCLUDE a PC
Downloads path on the server. If the controller is missing, it stops with an
instruction to run that file first. If files are later uploaded, set
engine_root to the actual SAS server DQ_ENGINE folder for automatic INCLUDE.

After the SAS fixture test succeeds, change project to RDS deliberately.
This connection setup has not been executed from this workspace.

For controller tests, run the latest file 01 first, then submit the whole
`tests/test_full_execution.sas` file in that same EG server session. The test
now defines its own non-secret `dwhprod`/`TeraAuth`/`LAB_T_ORION_MVT` connection
settings at the top, so it does not depend on running file 00 first. For another
test deployment, edit that labelled block. It checks the context before starting
tests and prints labelled cases plus controller error detail on an unexpected
status. Only the final lifecycle passing NOTE establishes success; an abort or
connection/datatype error is a failed test.

If the CALL reports U0001 for an invalid run UUID/project, update and rerun
`01_dq_controller.sas` in the same EG server session before running file 00.
The corrected controller resolves IDs first and then uses single-quoted SQL
literals. Its `NOTE: DQ CALL:` log line should contain a 36-character UUID and
the selected project, not unresolved macro-variable names. Replacing a file
alone does not replace a macro already loaded in the session. The SAS-only fix
does not require recompiling Teradata procedures; execution still needs checking
on the user's SAS server.

For `At least one of the columns ... has a datatype that is not supported`,
run `tests/diagnose_sas_reads.sas` in that same session. Its seven zero-row,
read-only probes identify the failing result shape and compare bounded log text
and summary count casts. Each probe uses a fresh PROC SQL to isolate NOEXEC.
Inspect every `NOTE: DQ READ PROBE` result; this checks datatype conversion,
not calculation correctness. It does not call profiling or modify Teradata data.

The user identified the module log's SQL_TEXT column as the unsupported field.
The controller now leaves SQL_TEXT in Teradata entirely and reads only the
module's status, errors, counts and timings. It no longer imports a SQL preview
or preview-length/truncation fields. No table alteration or procedure recompile
is needed. This read-format change remains unverified on the user's server.
Rerunning file 01 should print `DQ controller loaded: 20261012_SUMMARY_FLOAT` and
the SAS session encoding. Each database read also prints a `NOTE: DQ READ:`
stage so a remaining error can be located without rerunning the datatype probes.

The status helper checks SAS SQLRC after CONNECT, since SQLXRC may be undefined
or stale at that point. After pass-through statements it also checks SQLXRC
when available. It does not reset or manufacture SAS system return codes.

The user's full log subsequently showed successful configuration/run/module
reads, followed by an unsupported datatype in the run summary. The controller
now explicitly casts all five summary counts to FLOAT for SAS. The database
view and its exact aggregates are unchanged. This affects the SAS summary
representation only; no Teradata recompile is needed. After loading the latest
file 01, rerun the existing full-execution test in the same SAS server session.

If EG reports `Failed to transcode data from U_UTF8_CE to U_LATIN9_CE` with a
source excerpt such as `LOG_START_INDICATOR` or `title`, code submission is
failing. This is separate from reading the SQL_TEXT database column. All
checked-in SAS files are ASCII. Create a new blank EG program named `dq_check`
and type this ASCII statement to test submission:

```sas
%put NOTE: SAS encoding=%sysfunc(getoption(encoding));
```

If it works, inspect the original program and EG-generated titles/labels for
characters that LATIN9 cannot represent, and use the downloaded ASCII SAS files
in plainly named programs. If the fresh program fails too, collect the complete
error for the SAS/EG administrator to inspect the generated submission wrapper.
Do not change the encoding of stored data to suppress this error. Session
ENCODING is chosen at SAS startup; an actual UTF-8 server session requires the
site's supported server configuration, not a runtime OPTIONS statement.

## Run and retry

The single entry program calls `%run_dq_engine`. A direct controller invocation after setting connection variables is:

```sas
%include "/approved/path/DQ_ENGINE/sas/01_dq_controller.sas";
%run_dq_engine(project=RDS,numeric_basic=Y);
```

The macro generates a UUID and calls `SP_DQ_RUN_ENGINE`. The orchestrator registers the run, invokes Numeric Basic, applies the shared colour rules, and marks the run successful only after these steps succeed. The numeric procedure aggregates configured fields in batches, captures the selected field list, and writes only aggregate results. SAS reads the configuration report, logs and run summary.

On a database profiling failure, inspect `ERROR_INFORMATION` and the failed
batch's `SQL_TEXT` directly in Teradata; fix the underlying issue. SAS does not
import SQL_TEXT from DQ_MODULE_LOG.
A SAS read failure can occur after the database completed successfully. Check
DQ_RUN_LOG before deciding whether to retry: only FAILED database runs accept
a retry UUID. Retry a failed database run with its UUID:

```sas
%run_dq_engine(project=RDS,numeric_basic=Y,
    retry_run_id=00000000-0000-4000-8000-000000000004);
```

That UUID is illustrative; use the UUID of **your failed run**. A retry refreshes configuration, replays Numeric Basic from the beginning, removes partial results and preserves prior attempt logs. A completed or active run ID is refused. Use a new UUID for a new completed historical observation.

A lost session may leave a `RUNNING` record. An operator must verify that its database request is no longer executing before explicitly marking it FAILED for recovery. Never infer that an active run is abandoned from elapsed time alone. If failure logging itself lacks privileges or fails, SAS treats success as unconfirmed; investigate the database directly.

There is no Extended execution mode yet. Future modules will add calls inside the shared orchestration boundary and extend controller selection. They can reuse project/field settings, run IDs, period conventions, results and colour metadata. Future non-percentage indices such as PSI must use `IS_PERCENTAGE='N'`.

## Final results for review

Use `DQ_NUMERIC_REVIEW` for the final Numeric Basic review: one row per run,
field and reporting period, with the ten metrics as columns and the stored
missing/zero percentage classifications alongside them. It exposes only
SUCCEEDED runs. Numeric values retain the stored DECIMAL(38,10) precision;
NULL statistics and NOT_EVALUATED classifications retain their meaning.

For an existing installation, deploy only
`teradata/results/92_dq_numeric_review.sql`, replacing every `DQ_DB` with your
engine database (currently `LAB_T_ORION_MVT`). It depends on the existing
`DQ_COMPLETED_RESULT` view from file 91. The deployment account needs view
creation privileges and the required grantable access to its referenced objects;
grant reviewers SELECT on the new view using your site's approved process.
No table/procedure changes, Excel reload, or profiling rerun are needed.
Existing completed results are immediately available.

```sql
SELECT *
FROM LAB_T_ORION_MVT.DQ_NUMERIC_REVIEW
WHERE PROJECT_ID = 'RDS'
  AND RUN_ID = '<your successful run UUID>'
  AND PERIOD_LEVEL = 'OVERALL'
ORDER BY FIELD_NAME;
```

For the user's completed 50-field run, the OVERALL selection should return
50 rows. Remove the PERIOD_LEVEL filter to review yearly/monthly rows too;
order by FIELD_NAME, PERIOD_LEVEL, PERIOD_VALUE. Always filter by RUN_ID so
historical runs are not combined. The new view has no default row order.
For a complete Numeric Basic run, the number of rows across all periods
should be its ten-metric source row count divided by ten (139,000 becomes
13,900 for the reported run). The review groups stored results only and never
reads the RDS source. Local static checks do not establish Teradata compilation;
verify this new view on your server. SAS continues to read the existing run
summary; the final detailed review is available directly in Teradata.

## File responsibilities

| File | Purpose |
|---|---|
| `sas/00_run_dq_engine.sas` | Analyst settings and entry program |
| `sas/01_dq_controller.sas` | Switch validation, secure pass-through, status/summary reads |
| `sas/03_load_field_config.sas` | Legacy CSV field upload, retained for compatibility |
| `sas/04_load_dq_config.sas` | Direct Excel configuration entry program |
| `sas/05_dq_excel_config.sas` | Reads the three sheets and uploads configuration |
| `config/DQ_RDS_config.xlsx` | Editable Project/Fields/Settings workbook with 589 RDS fields |
| `setup/06_create_excel_config_tables.sql` | Additive staging/log tables for Excel loads |
| `setup/07_apply_excel_config.sql` | Atomic database configuration upsert |
| `tests/test_config_apply.sql` | Isolated-test configuration load/rollback checks |
| `tools/build_config_workbook.mjs` | Developer-only initial workbook packaging |
| `setup/00_create_config_tables.sql` | Configuration schema and ten fixed Numeric Basic metric definitions |
| `setup/01_create_result_tables.sql` | Long-format metric storage and captured numeric field selection |
| `setup/02_create_log_tables.sql` | Run and per-attempt/per-batch logs |
| `modules/10_numeric_basic.sql` | Batched source aggregation and metric persistence |
| `modules/00_run_engine.sql` | Shared run ownership, retries and completion |
| `results/90_colour_classification.sql` | One shared count-based classification rule |
| `results/91_dq_summary_views.sql` | Completed-only results and run summaries |
| `results/92_dq_numeric_review.sql` | Completed-only Numeric Basic review with metrics as columns |
| `config/rds_fields.csv` | All 589 workbook field/type mappings |
| `config/rds_ddl_validation.csv` | Per-field DDL presence review; physical types unverified |
| `tests/00_create_numeric_fixture.sql` | Synthetic null/zero/constant/precision/empty/failure fixtures |
| `tests/test_numeric.sql` | Numeric expectations and all-period reconciliation |
| `tests/test_colour.sql` | Exact and adjacent percentage boundaries |
| `tests/test_failure_restart.sql` | Invalid configuration, runtime overflow and recovery |
| `tests/test_full_execution.sas` | Controller switches, successful execution and protected history |
| `tests/test_sas_reconciliation.sas` | Ten metrics compared with SAS sample calculations |
| `tests/diagnose_sas_reads.sas` | Read-only, zero-row SAS datatype probes for configuration/logs/summary |
| `tests/validate_rds.sql` | Configuration, key uniqueness, nulls and baseline checks |
| `tests/benchmark_numeric.sql` | EXPLAIN and timing queries |
| `tools/check_static.mjs` | Developer-only template/input checks; not required to deploy |

Read CONFIGURATION_GUIDE.md for field changes, RESULTS_DICTIONARY.md for semantics, PERFORMANCE_NOTES.md for plans/staging, INPUT_REVIEW.md for source findings, and VALIDATION_EVIDENCE.md for what was actually checked.
