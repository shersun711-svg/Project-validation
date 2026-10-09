# DQ Engine: Phase 1–2 prototype

This implementation uses SAS as the controller and Teradata for all numeric calculations. It implements Numeric Basic only: ten metrics, three reporting levels, persistent aggregate results, shared percentage classification, configuration reads and run/batch logging. The supplied workbook and view DDL were reviewed. No source view changes are required.

Percentiles, outliers, categorical profiling, PSI, date/identifier profiling and Excel export are deferred. Their switches must remain `N`; selecting a deferred feature raises an error before connecting. No placeholder implementation pretends to execute a deferred test.

## Deploy

Prerequisites are SAS 9.4 with SAS/ACCESS to Teradata, an approved SAS authentication domain, and an approved Teradata database separate from the RDS source. Target Teradata 16.20 or Vantage with SPL, dynamic SQL, `GROUPING SETS`, `GROUPING`, `STDDEV_SAMP`, `REGEXP_SIMILAR`, diagnostics and volatile CTAS support. This target has not been compiled or executed here; verify the installed release first.

The deployment account needs create-table/view/procedure privileges in the DQ database. The runtime account needs SELECT on the source, configuration reads, results/log/snapshot DML, EXECUTE on the engine procedures and supported access to `DBC.SysExecSQL`. Verify dynamic-SQL privileges with the DBA. Volatile aggregates require spool space. Grant only approved project source access: procedures use `SQL SECURITY INVOKER`.

1. Make deployment copies of the SQL files and replace **every** `DQ_DB` token with the approved DQ database name, including tokens inside dynamic SQL strings and configuration values. Use an ordinary identifier, maximum 128 characters. Do not execute the supplied RDS source-view DDL.
2. In a Teradata-mode session, deploy `setup/00_create_config_tables.sql`, `01_create_result_tables.sql`, then `02_create_log_tables.sql`. File 00 also installs the ten fixed Numeric Basic metric definitions. Project, field and settings tables stay empty until Excel is loaded. These are one-time creates; do not drop existing tables to rerun deployment.
3. Deploy `setup/06_create_excel_config_tables.sql`, then compile `setup/07_apply_excel_config.sql` as one complete procedure statement. The former project seed file has been removed; no project configuration needs editing in SQL.
4. Deploy `results/90_colour_classification.sql` and `91_dq_summary_views.sql`. Database type validation has been removed; skip the former `04_config_validation.sql` step. Submit each `REPLACE PROCEDURE` as a complete SPL statement in a supported client; ordinary semicolon splitting will break a procedure body. With BTEQ, extract the procedure statement to its own file and use the site's approved `.COMPILE FILE` workflow.
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

## Run and retry

The single entry program calls `%run_dq_engine`. A direct controller invocation after setting connection variables is:

```sas
%include "/approved/path/DQ_ENGINE/sas/01_dq_controller.sas";
%run_dq_engine(project=RDS,numeric_basic=Y);
```

The macro generates a UUID and calls `SP_DQ_RUN_ENGINE`. The orchestrator registers the run, invokes Numeric Basic, applies the shared colour rules, and marks the run successful only after these steps succeed. The numeric procedure aggregates configured fields in batches, captures the selected field list, and writes only aggregate results. SAS reads the configuration report, logs and run summary.

On failure, inspect `ERROR_INFORMATION` and the failed batch's `SQL_TEXT`; fix the underlying issue. Retry with the failed UUID:

```sas
%run_dq_engine(project=RDS,numeric_basic=Y,
    retry_run_id=00000000-0000-4000-8000-000000000004);
```

That UUID is illustrative; use the UUID of **your failed run**. A retry refreshes configuration, replays Numeric Basic from the beginning, removes partial results and preserves prior attempt logs. A completed or active run ID is refused. Use a new UUID for a new completed historical observation.

A lost session may leave a `RUNNING` record. An operator must verify that its database request is no longer executing before explicitly marking it FAILED for recovery. Never infer that an active run is abandoned from elapsed time alone. If failure logging itself lacks privileges or fails, SAS treats success as unconfirmed; investigate the database directly.

There is no Extended execution mode yet. Future modules will add calls inside the shared orchestration boundary and extend controller selection. They can reuse project/field settings, run IDs, period conventions, results and colour metadata. Future non-percentage indices such as PSI must use `IS_PERCENTAGE='N'`.

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
| `config/rds_fields.csv` | All 589 workbook field/type mappings |
| `config/rds_ddl_validation.csv` | Per-field DDL presence review; physical types unverified |
| `tests/00_create_numeric_fixture.sql` | Synthetic null/zero/constant/precision/empty/failure fixtures |
| `tests/test_numeric.sql` | Numeric expectations and all-period reconciliation |
| `tests/test_colour.sql` | Exact and adjacent percentage boundaries |
| `tests/test_failure_restart.sql` | Invalid configuration, runtime overflow and recovery |
| `tests/test_full_execution.sas` | Controller switches, successful execution and protected history |
| `tests/test_sas_reconciliation.sas` | Ten metrics compared with SAS sample calculations |
| `tests/validate_rds.sql` | Configuration, key uniqueness, nulls and baseline checks |
| `tests/benchmark_numeric.sql` | EXPLAIN and timing queries |
| `tools/check_static.mjs` | Developer-only template/input checks; not required to deploy |

Read CONFIGURATION_GUIDE.md for field changes, RESULTS_DICTIONARY.md for semantics, PERFORMANCE_NOTES.md for plans/staging, INPUT_REVIEW.md for source findings, and VALIDATION_EVIDENCE.md for what was actually checked.
