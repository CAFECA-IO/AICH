#!/bin/bash

# 設定工作目錄
cd /workspace/AICH/

# 檢查是否有更新
git fetch

# 比較本地和遠端分支
LOCAL=$(git rev-parse HEAD)
REMOTE=$(git rev-parse @{u})

if [ "$LOCAL" != "$REMOTE" ]; then
  echo "New commits detected. Pulling latest changes..."
  git pull
  echo "Installing dependencies..."
  rm -rf node_modules
  npm install
  echo "Running build..."
  npm run build
  echo "Restarting application..."
  pm2 delete AICH
  pm2 start npm --name AICH -- run production
else
  echo "No new commits."
fi
