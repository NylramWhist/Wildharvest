# Wildharvest data initialization

## Data schema v1 — module version 0.90.0

Wildharvest is intentionally installed as a new, clean Foundry module with ID `wildharvest`.

It does not read, register, copy, merge, delete, or otherwise mutate settings and flags belonging to any earlier module ID. Existing worlds therefore start with Wildharvest defaults and must be configured independently.

On the active GM client, startup maintenance:

1. creates the mandatory snapshot of the current `wildharvest` settings and Actor/Item flags,
2. initializes the hidden `wildharvest.dataVersion` setting to schema version 1,
3. performs no legacy namespace or content-package migration.

Future Wildharvest schema changes must increment this version, create a backup first, and receive dedicated regression coverage before mutating world data.
