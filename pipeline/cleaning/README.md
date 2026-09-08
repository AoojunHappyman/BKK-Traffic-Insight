# Cleaning rules, version 1.1

Exclude report year 2022 by the user's request. Determine the year from the report
title, log skipped sheets in summary.excluded_reports, and preserve the raw workbook.
The importer also rejects earlier exports containing 2022 surveys.

Implementation: `pipeline/clean.py`. Supports the inspected BKK XLSX layout.
CSV profiling is available, but arbitrary CSV cleaning is not implemented.

1. Check category/subtotal headers and Thai report month in A1. Fail on unfamiliar
   layouts. Keep file hash/path. Split survey blocks at nonblank sequence cells in A;
   identity uses source row, not the printed sequence number.
2. Extract Thai abbreviated dates from B, including multiline names/dates, omitted
   spaces and missing parentheses. Infer a two-digit Buddhist year's century from
   the report title, convert to Gregorian and require the same report month.
   Preserve raw date text and source row. Keep remaining name lines, including
   directions and `(2)` suffixes. Normalize only whitespace; never fuzzy-match names.
3. Split road groups at a 07:00 interval. Require exactly one C road label within
   each group, even if printed on a middle row. Require three contiguous intervals
   through 19:00 for this source layout. Unfamiliar schedules require parser review.
4. Keep actual start/end times and duration, including 09–16 / 16–19 variants.
   Never distribute observed totals into fabricated hourly observations.
5. Require six literal nonnegative integer counts in E:J. Keep zero. Reject missing,
   fractional, negative or formula-based counts. External formula caches are not
   verified upstream data and are never substituted for literal observations.
6. Sum six categories independently and reconcile K/L/M interval/road/survey totals.
   Evaluate only same-sheet `SUM(cell/range)`; reject cycles, other formulas and
   mismatches. Never use eval or fetch linked files. Stale/missing subtotal caches
   produce warnings when the subtotal can be independently recomputed.
7. Parse N latitude/longitude separated by commas/spaces; check geographic ranges.
   Invalid/missing coordinates become NULL with raw text retained and a warning.
   Outliers beyond a broad Bangkok-area envelope are flagged; this is not an
   administrative-boundary check. No coordinates are guessed or swapped.
8. Flag repeated date/location-label/road-label/interval keys as duplicate candidates.
   Quarantine all affected surveys rather than choosing a copy.
9. Any error quarantines the entire survey to prevent partial totals. Coordinate-only
   warnings can remain in accepted traffic facts. Empty template cells are not zero.
10. Save issues and raw/cached cells for quarantined rows with source references.
    Extra cells beyond N are logged, not traffic facts. Check that accepted plus
    quarantined observation rows equals all observed period rows.

Use a new output directory for each run. Source files and earlier runs are never
overwritten. JSON is canonical; CSV is a derived inspection format. A failed source
is reported as `file_error`, not silently treated as an empty dataset.

Exit codes: `0` completed without errors (warnings may remain), `2` completed with
quarantined data/errors to review, `1` run failed. Inspect `$LASTEXITCODE` in PowerShell.
This policy does not establish complete city coverage or canonical location identity.
Change rules only with evidence and tests; increase the version when policy changes.
