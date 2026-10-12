#!/usr/bin/env bash
# Create/complete .env with strong random secrets (AICH_MASTER_KEY, AICH_JWT_SECRET). Never overwrites a value that is already set.
#   ./scripts/init_env.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.sample .env

rand_hex()  { openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
rand_b64()  { openssl rand -base64 "$1" 2>/dev/null | tr -d '\n' || head -c "$1" /dev/urandom | base64 | tr -d '\n'; }

# set_if_empty NAME VALUE — fills NAME only when it is missing or empty.
set_if_empty() {
  local name="$1" value="$2" current
  current="$(grep -E "^${name}=" .env | head -1 | cut -d= -f2- || true)"
  if [ -n "$current" ]; then
    echo "  = ${name} already set (kept)"
    return 1
  fi
  if grep -qE "^${name}=" .env; then
    # replace the empty line in place (portable: no sed -i differences between macOS/Linux)
    awk -v n="$name" -v v="$value" 'BEGIN{FS=OFS="="} $1==n && $2=="" {print n "=" v; next} {print}' .env > .env.tmp && mv .env.tmp .env
  else
    printf '%s=%s\n' "$name" "$value" >> .env
  fi
  echo "  + ${name} generated"
  return 0
}

echo "Initialising .env"
set_if_empty AICH_MASTER_KEY "$(rand_hex 32)" || true
set_if_empty AICH_JWT_SECRET "$(rand_b64 48)" || true
chmod 600 .env
echo "Done. Start with: docker compose up -d --build"
echo "The first person to sign in (CAFECA or email) becomes the administrator."
