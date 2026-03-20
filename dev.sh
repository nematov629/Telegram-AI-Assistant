#!/bin/bash

# Set up Node.js path
export PATH="/tmp/node-v24.0.0-darwin-arm64/bin:$PATH"

# Load environment variables from .env file
while IFS='=' read -r key value; do
  # Skip comments and empty lines
  [[ "$key" =~ ^#.*$ ]] && continue
  [[ -z "$key" ]] && continue
  # Remove leading/trailing whitespace
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)
  export "$key=$value"
done < .env

# Confirm environment is loaded
echo "🚀 Starting API Server..."
echo "Environment loaded:"
echo "  - TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:0:20}..."
echo "  - OPENAI_API_KEY: ${OPENAI_API_KEY:0:20}..."
echo "  - AI_INTEGRATIONS_OPENAI_API_KEY: ${AI_INTEGRATIONS_OPENAI_API_KEY:0:20}..."
echo "  - DATABASE_URL: $DATABASE_URL"
echo ""

# Run the development server
pnpm --filter @workspace/api-server run dev
