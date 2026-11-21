#!/usr/bin/env bash
# Run from any directory. Intentionally continue after the first failure to collect both results.
set -uo pipefail
cd "$(dirname "$0")/../.."
task_root="$PWD"
mkdir -p .cache/ci/conversion
first_code=0
for suite in dem osm; do
  if [[ "$suite" == dem ]]; then
    image=map-service-elevation-tools:ci
  else
    image=map-service-osm-tools:ci
  fi
  docker run --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --tmpfs /tmp:rw,nosuid,nodev,size=256m,mode=1777 --user "$(id -u):$(id -g)" \
    --mount "type=bind,src=$task_root,dst=/workspace,readonly" --workdir /workspace \
    --env PYTHONDONTWRITEBYTECODE=1 --env TMPDIR=/tmp --entrypoint /usr/bin/python3 \
    "$image" scripts/ci/conversion.py "$suite" 2>&1 | tee ".cache/ci/conversion/$suite.log"
  # Preserve Docker/Python's exit code even though stdout is also logged by tee.
  pipeline_status=("${PIPESTATUS[@]}")
  status=${pipeline_status[0]}
  if (( status == 0 && pipeline_status[1] != 0 )); then status=${pipeline_status[1]}; fi
  if (( status != 0 && first_code == 0 )); then first_code=$status; fi
  if (( first_code == 0 && status == 0 )) && [[ ! -s ".cache/ci/conversion/$suite.log" ]]; then first_code=1; fi
done
exit "$first_code"
