#!/bin/sh
# Apply pending migrations (a verified backup is taken first when a database exists), then serve.
set -eu
node dist/cli.js migrate
exec node dist/server.js
