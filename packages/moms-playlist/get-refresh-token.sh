#!/bin/bash
# Fill in these three values, then run: bash packages/moms-playlist/get-refresh-token.sh

CLIENT_ID="76610d89b07d40879008d579bc607447"
CLIENT_SECRET="9c1fa8ba0fb549ef8879fbf7c633d560"
CODE="AQCDLIiEot6pjHmYZcjD5cwH6eaP0KVzMplqQ6xhABaYpdyHQWsmkBYNGqZlzhIeIGxmwV44F4RudkE-owxtpkfPbKiCPdxwNNlZeOzu7_8adCrP9aeongKNjqa4ZZSBIWcTO0h72mbT84GdqS3q7UpkZk5FuXKVBJQovk2Yo24nOTJTErCS7LiMcDMkUmGtDS5vViebi6-AWIZasa6m-kYNdEljQu7L_0M6bKGbnUbcp-0"

curl -s -X POST "https://accounts.spotify.com/api/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -u "${CLIENT_ID}:${CLIENT_SECRET}" \
  -d "grant_type=authorization_code&code=${CODE}&redirect_uri=http%3A%2F%2F127.0.0.1%3A8888%2Fcallback" \
  | python3 -m json.tool
