#!/bin/sh
set -e

: "${CRON_SECRET:?CRON_SECRET is required}"
: "${MAYA_BASE_URL:=http://127.0.0.1:3850/admin-maya}"

# Wrapper : appelle les endpoints cron de MAYA avec son en-tête d'authentification
# `--max-time` : 120 s suffisaient tant que les tâches étaient courtes. La
# rédaction d'article demande cinq à six minutes de modèle, plus l'attente du
# visuel. Couper avant la fin ne l'empêcherait pas d'aboutir — Next ne s'arrête
# pas parce que le client raccroche — mais le journal afficherait un échec sur
# un article bel et bien déposé, ce qui est pire qu'un échec franc.
cat > /usr/local/bin/call-cron.sh << EOF
#!/bin/sh
ENDPOINT="\$1"
TS=\$(date '+%Y-%m-%d %H:%M:%S')
echo "[\$TS] -> \$ENDPOINT"
curl -sS --max-time 600 \
  -H "Authorization: Bearer ${CRON_SECRET}" \
  "${MAYA_BASE_URL}/api/cron/\$ENDPOINT" \
  || echo "[\$TS] !! \$ENDPOINT failed"
EOF
chmod +x /usr/local/bin/call-cron.sh

# Install crontab
cp /crontab.template /etc/crontabs/root

echo "==> MAYA cron started at $(date) — TZ=$TZ"
echo "==> Schedules:"
cat /etc/crontabs/root | grep -v '^#' | grep -v '^$'

# Run crond in foreground with logging to stderr
exec crond -f -d 8
