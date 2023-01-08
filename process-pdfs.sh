#!/usr/bin/env bash
set -euo pipefail
readonly script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd)"
cd $script_dir

exec 3>&1 4>&2
trap 'exec 2>&4 1>&3' 0 1 2 3
exec 1>log.out 2>&1

whoami

export PATH="$PATH:/home/adam/.nvm/versions/node/v16.14.2/bin/"
npm start -- to-102x162 $@
xdg-open result.pdf
