# HTTPS без Docker Caddy (Caddy на Ubuntu)

Если `docker compose --profile https` не может скачать образ Caddy — ставим Caddy **на сервер**, приложение только в Docker.

## 1. Запустить приложение (без Caddy)

```bash
cd /opt/zynqo
docker compose up -d --build
curl -s http://127.0.0.1:8787/api/health
```

## 2. Установить Caddy на Ubuntu 22.04

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
apt update
apt install -y caddy
```

## 3. Конфиг Caddy

```bash
cat > /etc/caddy/Caddyfile << 'EOF'
zynqo.ru {
	encode gzip
	reverse_proxy 127.0.0.1:8787
}

www.zynqo.ru {
	redir https://zynqo.ru{uri} permanent
}
EOF
```

## 4. Перезапуск

```bash
systemctl reload caddy
systemctl status caddy
```

Откройте **https://zynqo.ru** — сертификат Let's Encrypt выпустится автоматически.

## Файрвол

```bash
ufw allow 80/tcp
ufw allow 443/tcp
# 8787 наружу не открывать — только localhost
```
