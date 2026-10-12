# Data Quality Engine - SAS and Teradata

This repository contains the Phase 1-2 Data Quality Engine in [DQ_ENGINE](DQ_ENGINE/).
Users maintain configuration in Excel, SAS loads it and starts profiling, and
Teradata stores the configuration and calculates the results.

Numeric Basic is implemented: total, non-missing, missing and zero counts,
missing/zero percentages, minimum, maximum, mean and sample standard deviation.
Results cover overall, yearly and monthly periods, with green/amber/red
classifications for percentages. Percentiles, outliers, PSI, other profiling
modules and Excel report export are not implemented yet.

## Start here

- **Existing installation:** follow the everyday workflow below.
- **New installation:** follow [one-time deployment instructions](DQ_ENGINE/documentation/README.md#one-time-deployment).
- **Configuration changes:** see [Excel configuration instructions](DQ_ENGINE/documentation/EXCEL_CONFIGURATION.md).
- **Result meanings:** see [metric definitions](DQ_ENGINE/documentation/RESULTS_DICTIONARY.md).

## Everyday workflow

Use the same SAS server session for these steps. Connect to a server that can
access both the workbook and Teradata; SASApp is the user's working connection.

| When | File to run | Purpose |
|---|---|---|
| Once per new session | [01_dq_controller.sas](DQ_ENGINE/sas/01_dq_controller.sas) | Defines the engine macros |
| Once per session when loading Excel | [05_dq_excel_config.sas](DQ_ENGINE/sas/05_dq_excel_config.sas) | Defines the Excel loader |
| First configuration load or after an Excel edit | [04_load_dq_config.sas](DQ_ENGINE/sas/04_load_dq_config.sas) | Loads Excel; require APPLIED |
| Each profiling run | [00_run_dq_engine.sas](DQ_ENGINE/sas/00_run_dq_engine.sas) | Runs selected profiling; require SUCCEEDED |

Edit the workbook path and approved connection settings before first use.
The workbook path and optional engine_root must be SAS server paths.
If configuration is unchanged and the controller is loaded, run only file 00.
No passwords belong in the workbook or repository.

The [starter workbook](DQ_ENGINE/config/DQ_RDS_config.xlsx) contains 589 RDS
field mappings and enables all 415 numeric fields. To test fewer fields, set
NUMERIC_BASIC_IND=Y only for the desired numeric fields, keep their ACTIVE_IND=Y,
then reload Excel. In file 00 use project=RDS, numeric_basic=Y, other switches=N
and a blank retry_run_id for a new run.

## Final results

Review `DQ_NUMERIC_REVIEW`: one row per field and period, with all ten metrics
as columns and the missing/zero percentage classifications. It includes only
successful runs. Filter by your project's RUN_ID to select the correct results.
See [review query and view deployment](DQ_ENGINE/documentation/README.md#review-the-final-result).

| Teradata object | Purpose |
|---|---|
| `DQ_CONFIG_LOAD_LOG` | Confirms the Excel load status |
| `DQ_FIELD_CONFIG` | Confirms enabled fields |
| `DQ_RUN_LOG` / `DQ_MODULE_LOG` | Run status, progress and errors |
| `DQ_METRIC_RESULT` | Stored results, one row per metric |
| `DQ_COMPLETED_RESULT` | Successful results, one row per metric |
| `DQ_NUMERIC_REVIEW` | Final review, metrics as columns |

## Repository map

```text
DQ_ENGINE/
  config/          Excel workbook and original input audit references
  sas/             Four SAS files for configuration and execution
  teradata/
    setup/         One-time database deployment
    modules/       Numeric profiling and run orchestration
    results/       Classification and result views
  documentation/   Deployment, settings, metrics and validation evidence
  tests/           Optional regression and performance checks
  tools/           Developer-only static and workbook checks
```

[Optional tests](DQ_ENGINE/tests/README.md) support engine maintenance; they
are not part of every profiling run. Local checks do not compile SAS or Teradata.
See [validation evidence](DQ_ENGINE/documentation/VALIDATION_EVIDENCE.md) for
user-server results and remaining assumptions.
