# Contract: Backup Format

## Blob names

Container `backups`:

```text
backups/<yyyy-mm-dd>/bikelog-<yyyymmddThhmmssZ>.dump            # pg_dump --format=custom
backups/<yyyy-mm-dd>/bikelog-<yyyymmddThhmmssZ>.manifest.json   # written after the dump
```

Times are UTC at job start. Blobs are created with a single Put Blob call and an `If-None-Match: *`
header, so an existing name is never overwritten. The job identity has no permission to overwrite or
delete in any case.

## Manifest (`.manifest.json`)

```json
{
  "formatVersion": 1,
  "createdUtc": "2026-10-20T02:30:04Z",
  "snapshotId": "00000003-0000001B-1",
  "serverVersion": "18.1",
  "pgDumpVersion": "18.6",
  "dumpBlob": "backups/2026-10-20/bikelog-20261020T023004Z.dump",
  "dumpBytes": 184320,
  "dumpSha256": "<hex>",
  "migration": "20261013073652_ComponentGroupsWeight",
  "tables": { "Bikes": 3, "Components": 41, "Installations": 57, "Rides": 212, "...": 0 },
  "usage": [
    { "componentId": "<uuid>", "lifetimeMetres": 1234500, "lifetimeSeconds": 98765 }
  ]
}
```

**Rules**:

- `tables` has the exact row count of every table in the application schema, including
  `__EFMigrationsHistory`, `BikeLogUsers` and `WebSessions`. The values are read inside the exported
  snapshot that `pg_dump --snapshot` uses.
- `usage` holds each component's stored lifetime totals from the usage projection, read in the same
  snapshot, ordered by `componentId`. Exact column names are fixed at implementation from the current
  `UsageProjection` mapping.
- `migration` is the latest row of `__EFMigrationsHistory`.
- The manifest contains IDs and counts only: no names, emails, notes or tokens.

## Restore comparison

`restore-rehearsal.sh` passes only if all of these hold:

1. The dump's SHA-256 equals `dumpSha256`.
2. `pg_restore` exits 0 into an empty database.
3. Every table count equals the manifest's count, and the restored database has no tables beyond those
   listed.
4. Every `usage` entry matches exactly, with no extra or missing components.
5. The latest migration equals `migration`.

The script prints a table of each check and exits non-zero on any mismatch.
