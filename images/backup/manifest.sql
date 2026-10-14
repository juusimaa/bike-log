-- The facts a backup manifest records and a restore must reproduce
-- (contracts/backup-format.md). backup.sh runs it inside the snapshot that
-- pg_dump uses; restore-rehearsal.sh runs it on the restored copy.
-- Output: one JSON object on one line. IDs and counts only, no personal data.
SELECT json_build_object(
    'serverVersion', split_part(current_setting('server_version'), ' ', 1),
    'migration', (
        SELECT "MigrationId" FROM "__EFMigrationsHistory"
        ORDER BY "MigrationId" DESC LIMIT 1
    ),
    -- Exact row counts of every table in the application schema.
    'tables', (
        SELECT json_object_agg(
            t.table_name,
            (xpath('/row/c/text()', query_to_xml(
                format('SELECT count(*) AS c FROM public.%I', t.table_name),
                false, true, '')))[1]::text::bigint
            ORDER BY t.table_name)
        FROM information_schema.tables t
        WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE'
    ),
    -- Stored lifetime totals of the usage projection (ComponentUsageRow).
    'usage', (
        SELECT coalesce(json_agg(json_build_object(
            'componentId', "ComponentId",
            'lifetimeMetres', "LifetimeMetres",
            'lifetimeSeconds', "LifetimeSeconds") ORDER BY "ComponentId"), '[]'::json)
        FROM "ComponentUsages"
    )
);
