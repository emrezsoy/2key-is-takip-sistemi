#!/usr/bin/env bash
# Canlı sunucuda kesintisiz güncelleme (sunucuda: cd /opt/gorev-puantaj && bash deploy.sh).
# Kod (src, prisma vb.) önceden yerine kopyalanmış ve gerekiyorsa migration uygulanmış olmalı.
# 1) Yeni sürüm boştaki klasörde (.next-a / .next-b) derlenir; çalışan uygulama bu sırada hizmet vermeye devam eder.
# 2) Derleme başarılıysa uygulama yeni klasörle yeniden başlatılır (birkaç saniye; bu sırada nginx bakım sayfası gösterir).
# 3) Yeni sürüm açılmazsa otomatik olarak eski klasöre geri dönülür.
set -euo pipefail
cd "$(dirname "$0")"

APP=puantaj-sistemi
CUR=$(cat .active-dist 2>/dev/null || echo .next)
if [ "$CUR" = ".next-a" ]; then NEW=.next-b; else NEW=.next-a; fi
LOG=/tmp/build${NEW}.log

echo "Çalışan sürüm: $CUR  →  yeni derleme: $NEW (log: $LOG)"
rm -rf "$NEW"
# --durdur: bellek yetmezse uygulama derleme boyunca durdurulur (kullanıcılar bakım sayfasını görür).
if [ "${1:-}" = "--durdur" ]; then
  echo "Uygulama derleme süresince durduruluyor (bakım sayfası)."
  pm2 stop "$APP" > /dev/null
fi
if ! NEXT_DIST_DIR=$NEW NEXT_SKIP_TYPECHECK=1 nice -n 10 npm run build > "$LOG" 2>&1; then
  echo "DERLEME BAŞARISIZ: çalışan sürüm ($CUR) yerinde bırakıldı."
  tail -30 "$LOG"
  if [ "${1:-}" = "--durdur" ]; then
    NEXT_DIST_DIR=$CUR pm2 restart "$APP" --update-env > /dev/null
  fi
  exit 1
fi

wait_up() {
  local c=000
  for _ in $(seq 1 60); do
    c=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/giris || true)
    [ "$c" = "200" ] && break
    sleep 1
  done
  echo "$c"
}

NEXT_DIST_DIR=$NEW pm2 restart "$APP" --update-env > /dev/null
code=$(wait_up)
if [ "$code" != "200" ]; then
  echo "YENİ SÜRÜM AÇILMADI (HTTP $code): $CUR sürümüne geri dönülüyor."
  NEXT_DIST_DIR=$CUR pm2 restart "$APP" --update-env > /dev/null
  echo "Geri dönüş: HTTP $(wait_up)"
  exit 1
fi

echo "$NEW" > .active-dist
pm2 save > /dev/null
echo "Tamam: $NEW yayında (HTTP 200). Eski derleme ($CUR) yedek olarak duruyor."
