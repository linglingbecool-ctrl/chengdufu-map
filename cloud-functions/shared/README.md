# Stable postcard and participant numbers

`memory-numbers.js` is shared by `reviewContribution`, `getMyContributions`,
`processContribution` and `linkMemoryAccount`. After editing it, run:

```sh
node tests/sync-number-module.cjs
node tests/memory-numbers.test.cjs
node tests/postcards.test.cjs
```

## Data contract

- `memoryNumberRegistry/main` must be `ADMINONLY`; clients cannot read or write it.
- `memories` maps hashed contribution IDs to stable numbers (`CD-000001`).
- `badges` maps hashed canonical account IDs to the first campus approval award.
- Only curator approval at `sichuandaxue` or `huaxiba`, with both consent fields
  confirmed, awards the campus badge. Reading or downloading never awards it.
- Anonymous-account linkage keeps the earliest existing participant award.
  Superseded numbers are retired, never reassigned. Previously downloaded files
  are not rewritten.
- A transaction commits review status and numbering together; retries cannot
  overwrite a final review or consume another number.
- Do not reset, overwrite or reseed a populated registry. Missing/not-ready
  registry fails closed and preserves the contribution.

## Initial release

2026-10-20: backfilled 66 contribution numbers and 12 participant numbers from
14 qualifying campus-approved contributions, after consolidating existing account
links. All qualifying first approvals had distinct, recorded review timestamps.
No contribution text or photo was changed.

The small-site registry has explicit limits of 5,000 memories and 2,000 account
aliases. Before reaching them, migrate transactionally to per-record number
documents and counters; preserve every issued number.
