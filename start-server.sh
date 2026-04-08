#!/usr/bin/env bash
# Start the AI Learning auth server
set -e
cd "$(dirname "$0")/server"
echo "🚀 Starting AI Learning auth server..."
node server.js
