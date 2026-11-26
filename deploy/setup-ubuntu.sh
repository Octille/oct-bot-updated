#!/bin/sh
# One-time setup of a fresh Ubuntu server (22.04 or 24.04): Docker, Compose and git, started on boot.
#   curl -fsSL https://raw.githubusercontent.com/Octille/oct-bot-updated/main/deploy/setup-ubuntu.sh | sh
#   (or copy this file over and run: sh setup-ubuntu.sh)
set -eu
sudo apt-get update
sudo apt-get install -y ca-certificates curl git
curl -fsSL https://get.docker.com | sudo sh
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"
echo "Done. Log out and back in (so 'docker' works without sudo), then follow docs/DEPLOY.md."
