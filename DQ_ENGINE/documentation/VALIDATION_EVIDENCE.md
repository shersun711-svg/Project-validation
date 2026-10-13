# Current validation evidence

## User-server observations

The user has reported:

- Successful Excel loading, first for all 589 field mappings and later for
  selected field subsets using ACTIVE_IND.
- A successful numeric RDS run with 50 fields and 139,000 metric rows, with
  selected results checked by the user.
- Synthetic non-numeric and combined-module runs with expected overall values
  and period row counts, including date count/missing metrics and availability.
- A completed mixed RDS run with the expected 65 selected fields: 50 numeric,
  9 categorical, 4 date and 2 identifier.

These are user-server observations. The mixed RDS source metrics have not been
fully reconciled here; success status and expected field counts alone do not
establish every calculation's accuracy. Empty-source/failure/retry suites and
concurrent number allocation are not claimed verified by the user's latest
runs. No SAS/Teradata session or executable is available in this workspace.

## Local checks

The current repository passes:

```sh
node DQ_ENGINE/tools/check_static.mjs
node DQ_ENGINE/tools/check_config_workbook.mjs
node DQ_ENGINE/tools/check_review_views.mjs
git diff --check
```

Static checks inspect SQL/SAS structure, schema references and generated
aggregate/insert text. They also execute adapted categorical/identifier period
SELECT logic and the legacy selection-fold UPDATE on synthetic SQLite rows.
The workbook check verifies the starter's three tabs, three field columns,
589 original mappings and defaults. It is not a SAS workbook approval step.
Portable review checks execute adapted checked-in SELECT logic on synthetic
rows, checking period separation, successful-run filtering, count/rate displays,
NULL unrelated date columns, short numbers and overall-only availability.

These checks do not compile Teradata SPL, run SAS, verify grants, validate
transactions/locking, or benchmark the RDS source. Node tools are developer-only;
production calculation remains in SAS/Teradata.

## Important implementation limits

- Workbook classifications are authoritative; no database type lookup occurs.
- Counts profile source rows, without automatic deduplication or sentinel-value
  conversion. Only SQL NULL is missing.
- Numeric values must fit DECIMAL(38,10); mean/deviation/rates need tolerances.
- Source data must remain stable across batches/period queries. No whole-run
  source snapshot or managed source staging is implemented.
- Distinct aggregation uses explicit period queries because the user observed
  incorrect GROUPING flags with DISTINCT/GROUPING SETS. Confirm workload,
  count range, spool and installed-release behaviour for each deployment.
- Run numbering uses a brief transaction/locked counter; verify concurrent
  execution and permissions on the server. UUIDs remain internal keys.
- Date Basic supplies counts/missing percentage only. Availability uses the
  reporting date where each field is non-NULL, only on OVERALL rows.

## Cleanup verification

Retired date-table creation and the redundant numeric-only review scripts were
removed. The current engine uses DQ_BASIC_REVIEW; numeric-only review filters
FIELD_TYPE=NUMERIC. The completed field-selection migration and its upgrade
instructions have also been removed; Git history preserves them.
Runtime calculations, workbook and deployed database objects were untouched by
this cleanup. Optional regression tests remain for maintenance.

The detailed [revision history](history/VALIDATION_HISTORY.md) records earlier
failures, fixes and evidence. Historical instructions are not current deployment
steps; use the main README and configuration/deployment guides.

## Special-value and percentile extension

Local generated-query checks passed for filtered numeric/categorical Basic
aggregates and 210 percentile results across five fields and six periods,
including NULL dates, specials, all-NULL/all-special fields, constants, singletons
and empty populations. Combined review tests verify merging quantiles into
basic rows. Workbook checks preserve all 589 mappings and verify the four sheets.
These are adapted SQLite/static checks, not SAS/Teradata execution. The supplied
extended SQL/SAS/configuration tests and all new stored-procedure compilation
remain unverified on the user server. Earlier user-reported runs predate this extension.

Documentation cleanup removed superseded Basic/date/availability upgrade guides
and consolidated field selection into CONFIGURATION_GUIDE.md. Current definitions
and deployment instructions replace old procedure order and metric counts.
Production SQL/SAS, configuration workbooks and deployed objects were unchanged.

## Numeric Outliers

Local generated-SQL checks passed for 180 field/period/metric outlier results,
strict +/-3 boundary equality, special exclusions, zero deviation, singleton/
empty populations, and valid rate denominators. Statistics checks verify 36
period aggregates and preservation of full FLOAT precision. Supplied SQL/SAS
outlier fixtures, failure/retry tests and database compilation remain unverified
on the user server. The user reported Teradata 2646 spool exhaustion in Numeric
Percentiles and is testing a smaller batch; no successful rerun is claimed.
