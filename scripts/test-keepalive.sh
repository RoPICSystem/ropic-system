#!/bin/bash

# Test script for keepalive endpoints
# Usage: ./test-keepalive.sh [local|production]

ENVIRONMENT=${1:-local}

if [ "$ENVIRONMENT" = "local" ]; then
    BASE_URL="http://localhost:3000"
else
    BASE_URL="https://ropic.vercel.app"
fi

echo "Testing keepalive endpoints on $ENVIRONMENT environment..."
echo "Base URL: $BASE_URL"
echo ""

# Test main keepalive endpoint
echo "Testing /api/keepalive..."
curl -s -X GET "$BASE_URL/api/keepalive" \
  -H "Content-Type: application/json" \
  | jq '.' || echo "Response is not valid JSON"

echo ""
echo "Testing /api/keepalive-alt..."
curl -s -X GET "$BASE_URL/api/keepalive-alt" \
  -H "Content-Type: application/json" \
  | jq '.' || echo "Response is not valid JSON"

echo ""
echo "Test completed."
