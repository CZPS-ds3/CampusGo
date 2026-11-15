#!/bin/sh
# Runs inside the production web container before nginx starts (nginx image: /docker-entrypoint.d/).
# Writes one "set_real_ip_from" line per address in TRUSTED_PROXIES (comma or space separated: the school's web
# server, as an IP or CIDR range). nginx then takes the visitor's IP from X-Forwarded-For only when the request
# comes from one of these addresses; anybody else who reaches the port directly cannot fake an IP, so the API's
# per-IP rate limits (login codes, location checks) hold.
set -eu

OUT=/etc/nginx/trusted-proxies.conf
echo '# Written at container start from TRUSTED_PROXIES (frontend/docker-trusted-proxies.sh).' > "$OUT"

list=$(printf '%s' "${TRUSTED_PROXIES:-}" | tr ',' ' ')
for address in $list; do
  # Only IP addresses and CIDR ranges: anything else could inject nginx directives.
  if ! printf '%s' "$address" | grep -Eq '^[0-9A-Fa-f:.]+(/[0-9]{1,3})?$'; then
    echo "[trusted-proxies] refusing \"$address\": use an IP address or CIDR range" >&2
    exit 1
  fi
  echo "set_real_ip_from $address;" >> "$OUT"
done

if ! grep -q set_real_ip_from "$OUT"; then
  echo '[trusted-proxies] warning: TRUSTED_PROXIES is empty, every visitor shares the proxy IP for rate limits' >&2
fi
