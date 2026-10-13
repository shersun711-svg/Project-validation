# Validation evidence

Local developer checks execute generated Basic and Outlier queries on synthetic
SQLite data after narrow dialect adaptation. They check special-value exclusions,
unchanged NULL counts, all 12 numeric/5 categorical metric branches, exact rate
numerators/denominators, period separation, successful-only review, +/-3 outlier
boundaries, empty/insufficient populations and unrounded statistics reuse.
Workbook checks preserve all 589 source mappings and the four configuration sheets.
These checks do not compile Teradata SPL or execute SAS.

The user previously reported successful Numeric Basic and mixed-type RDS runs
with sampled results checked, and successful Excel configuration loads. The current
special-value Basic test on 20 numeric/9 categorical fields is still running;
no result is claimed. Outlier scripts are prepared but their deployment/execution
and supplied SQL/SAS validation suites remain unverified on the user server.

Verify installed-release syntax, source type compatibility, grants, transactional
application, cleanup/retry, count ranges, spool and execution time on the server.
No full RDS source reconciliation or performance acceptance has been established.

The manager's current scope excludes the retired distribution module. Its code,
SAS switch, review columns and test cases were removed. No stored database history
or running job was modified. Earlier evidence is retained in Git history and the history/ directory
for audit context; its instructions are not current deployment steps.
