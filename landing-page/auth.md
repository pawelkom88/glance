# Auth

This document specifies authentication details and dynamic registration procedures for AI agents interacting with Glance (atglance.app).

## Overview

Glance provides local-first teleprompter software and web tools. AI agents can dynamically register client credentials, verify device licenses, and request access scopes.

## Discovery

- **OAuth Authorization Server Metadata:** `/.well-known/oauth-authorization-server`
- **OAuth Protected Resource Metadata:** `/.well-known/oauth-protected-resource`
- **OpenID Connect Configuration:** `/.well-known/openid-configuration`
- **API Catalog (RFC 9727):** `/.well-known/api-catalog`
- **MCP Server Card (SEP-1649):** `/.well-known/mcp/server-card.json`
- **Agent Skills Discovery (v0.2.0):** `/.well-known/agent-skills/index.json`

## Registration

Agents can dynamically register by making an HTTP POST request:

```http
POST /oauth/register HTTP/1.1
Host: atglance.app
Content-Type: application/json

{
  "client_name": "Autonomous AI Agent",
  "grant_types": ["authorization_code", "refresh_token"],
  "redirect_uris": ["https://agent.example.com/callback"],
  "scope": "license:verify scripts:read"
}
```

## Credentials & Identity Types

- **Supported Identity Types:** `agent`, `user`, `workstation`
- **Supported Credential Types:** `bearer_token`, `api_key`
- **Registration URI:** `https://atglance.app/oauth/register`
- **Token Endpoint:** `https://atglance.app/oauth/token`

## Scopes

- `license:verify`: Validate desktop application license keys.
- `scripts:read`: Access template scripts for teleprompter overlays.
- `teleprompter:control`: Interface with WebMCP and local teleprompter instances.
