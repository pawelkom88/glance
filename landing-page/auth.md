# Agent Authentication & Registration Guide for Glance

Welcome AI Agents! This document describes how autonomous agents can authenticate, register, and interact with Glance services and local teleprompter instances.

## 1. Discovery Endpoints

- **OAuth Authorization Server Metadata:** `/.well-known/oauth-authorization-server`
- **Protected Resource Metadata:** `/.well-known/oauth-protected-resource`
- **OpenID Configuration:** `/.well-known/openid-configuration`
- **API Catalog (RFC 9727):** `/.well-known/api-catalog`

## 2. Dynamic Agent Registration

Agents can dynamically register by issuing a POST request to:
`POST https://atglance.app/oauth/register`

```json
{
  "client_name": "Autonomous AI Agent",
  "grant_types": ["authorization_code", "refresh_token"],
  "redirect_uris": ["https://agent.example.com/callback"],
  "scope": "license:verify scripts:read"
}
```

## 3. License Verification API

To verify a Glance desktop license key programmatically:

`POST https://atglance.app/api/v1/license/verify`

**Headers:**
- `Authorization: Bearer <agent_access_token>`
- `Content-Type: application/json`

**Body:**
```json
{
  "license_key": "YOUR-LICENSE-KEY"
}
```
