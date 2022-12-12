#!/usr/bin/env bash
set -euo pipefail
readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"

cd $script_dir
npm start -- to-102x162 $@
firefox result.pdf
