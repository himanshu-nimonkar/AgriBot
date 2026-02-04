# Security Policy

## Overview

Yolo Deep-Ag Copilot (AgriBot) is an agricultural intelligence system that handles sensitive operational data including geospatial coordinates, farm telemetry, and real-time agricultural advice. We take security seriously and appreciate the community's help in identifying vulnerabilities.

---

## Supported Versions

We actively maintain security updates for the following versions:

| Version | Supported          | End of Support |
| ------- | ------------------ | -------------- |
| 1.2.x   | Yes                | TBD            |
| 1.1.x   | Critical fixes only| Jun 2026       |
| 1.0.x   | No                 | Dec 2025       |
| < 1.0   | No                 | -              |

**Note**: We recommend always using the latest 1.2.x release for production deployments.

---

## Security Architecture

### Current Security Measures

1. **API Security**
   - Rate limiting via Redis (FastAPI-Limiter)
   - CORS policy enforcement for web dashboard
   - Input sanitization using regex patterns
   - Safe rate limiter fallback for lightweight deployments

2. **Authentication & Authorization**
   - Vapi.ai private key authentication for voice calls
   - Cloudflare API token for AI inference and vectorization
   - Google Earth Engine service account authentication
   - WebSocket connection validation

3. **Data Protection**
   - Geospatial data constrained to Yolo County boundaries
   - Session-based conversation isolation
   - No persistent storage of voice recordings
   - Environment-based credential management

4. **Third-Party Services**
   - Google Earth Engine (satellite imagery)
   - Cloudflare Workers AI (LLM inference)
   - Vapi.ai (voice interface)
   - OpenMeteo (weather data)

### Known Security Considerations

- **Credential Management**: Service account keys and API tokens stored in `.env` files
- **Public Endpoints**: WebSocket connections for real-time dashboard updates
- **Voice Interface**: PSTN calls routed through Vapi.ai infrastructure
- **Dependency Chain**: 40+ Python packages including ML frameworks

---

## Reporting a Vulnerability

### Where to Report

**DO NOT** open a public GitHub issue for security vulnerabilities.

Please report security issues via one of the following channels:

1. **Email**: Send details to `himanshu.nimonkar@[your-domain]` with subject line: `[SECURITY] AgriBot Vulnerability`
2. **GitHub Security Advisory**: Use the [private vulnerability reporting](https://github.com/himanshu-nimonkar/AgriBot/security/advisories/new) feature

### What to Include

Please provide the following information:

- **Vulnerability Type**: (e.g., Authentication bypass, XSS, SQL injection, API abuse)
- **Affected Component**: (Frontend, Backend, specific service or endpoint)
- **Affected Version(s)**: Which versions are impacted
- **Steps to Reproduce**: Clear, numbered steps including:
  - Environment setup
  - Specific API calls or user actions
  - Expected vs actual behavior
- **Impact Assessment**: Your analysis of potential damage
- **Proof of Concept**: Code, screenshots, or curl commands (if applicable)
- **Suggested Fix**: If you have recommendations

### Response Timeline

| Stage | Timeline | Action |
|-------|----------|--------|
| **Initial Response** | 48 hours | Acknowledgment of report receipt |
| **Triage** | 5 business days | Severity assessment and validation |
| **Status Update** | Weekly | Progress reports during investigation |
| **Fix Development** | Varies by severity | See table below |
| **Public Disclosure** | After patch release | Coordinated disclosure |

### Severity-Based SLA

| Severity | Description | Patch Timeline |
|----------|-------------|----------------|
| **Critical** | Remote code execution, complete auth bypass, API key exposure | 7 days |
| **High** | Privilege escalation, data exposure, partial auth bypass | 14 days |
| **Medium** | Limited data exposure, DoS vulnerabilities | 30 days |
| **Low** | Minor information disclosure, low-impact bugs | 90 days |

### What Happens Next

**If Accepted:**
1. We will confirm the vulnerability and its severity
2. Develop a patch in a private security branch
3. Notify you when the patch is ready for validation
4. Release the security update across supported versions
5. Credit you in the security advisory (unless you prefer anonymity)
6. Publish a CVE if applicable (CVSS ≥7.0)

**If Declined:**
1. We will explain why we don't consider it a security issue
2. Provide reasoning or alternative perspective
3. Suggest alternative reporting channels if appropriate (e.g., bug tracker for non-security issues)

---

## Security Best Practices for Deployment

### Environment Configuration

```bash
# NEVER commit these files
.env
backend/config/indigo-splice-485617-j0-873f46d5b26f.json  # GEE credentials

# Use environment variables or secret managers
export CLOUDFLARE_API_TOKEN="secure_token"
export VAPI_PRIVATE_KEY="secure_key"
export GEE_SERVICE_ACCOUNT_FILE="/secure/path/to/credentials.json"
```

### Docker Deployment

```bash
# Use secrets instead of environment variables in compose
docker-compose --env-file .env.prod up -d

# Ensure proper file permissions
chmod 600 backend/config/*.json
chmod 600 .env
```

### Network Security

- Deploy behind a reverse proxy (nginx/Cloudflare Tunnel)
- Enable HTTPS/TLS for all public endpoints
- Restrict WebSocket origins to trusted domains
- Use firewall rules to limit access to port 8000 (backend)

### Dependency Management

```bash
# Regularly update dependencies
pip install --upgrade pip
pip install -r backend/requirements.txt --upgrade

# Audit for known vulnerabilities
pip-audit
safety check
```

---

## Out of Scope

The following are **NOT** considered security vulnerabilities:

- Rate limiting bypasses in development/local mode (when Redis is disabled)
- Geospatial data accuracy or crop recommendations (agronomic issues)
- Third-party service outages (Google Earth Engine, Cloudflare, Vapi.ai)
- Browser-specific rendering issues
- Performance degradation under extreme load without DoS attack evidence
- Reports from automated scanners without validated proof of concept

---

## Security Advisories

Published security advisories will be available at:
- GitHub Security Advisories: `https://github.com/himanshu-nimonkar/AgriBot/security/advisories`
- Release Notes: Tagged with `[SECURITY]` prefix

---

## Acknowledgments

We appreciate responsible disclosure and will recognize security researchers who help improve AgriBot's security:

<!-- Contributors will be listed here -->
- *No security reports received yet*

---

## Contact

For non-security issues, please use:
- **Bug Reports**: [GitHub Issues](https://github.com/himanshu-nimonkar/AgriBot/issues)
- **General Questions**: [GitHub Discussions](https://github.com/himanshu-nimonkar/AgriBot/discussions)

**Last Updated**: February 2, 2026  
**Policy Version**: 1.0
