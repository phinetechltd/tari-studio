# Sprint 1 Findings — Platform Documentation Update
**Date**: 2026-09-24
**Sprint**: Sprint 1 (Infrastructure & Stabilization)
**Author**: @creator

---

## Platform Architecture Summary

The Agency Platform is a multi-tenant SaaS built on Next.js + PostgreSQL + Prisma ORM. Each tenant (Organization) is a separate agency with its own users, brands, content, campaigns, and social channels.

### Tech Stack
- **Framework**: Next.js (App Router)
- **Database**: PostgreSQL 17.10 (embedded on dev, via @embedded-postgres)
- **ORM**: Prisma with 34 models
- **Auth**: TOTP + password, token versioning, active organization switching
- **Port**: 3400 (dev), 54329 (embedded Postgres)

### Data Model (34 tables)
Core entities: Organization, User, Membership, Brand, CatalogueItem, ContentTask, SocialChannel, SocialPost, Campaign, Project, ContentSubmission, TrackedLink, Issue, HealthCheck, DashboardWidget, and more.

### Multi-Tenancy
- One User can belong to multiple Organizations (via Membership with role)
- All tenant data is scoped by organizationId
- Module licensing gates features per organization (CONTENT_STUDIO, SOCIAL_PUBLISHING, CAMPAIGN_TRACKING, AI_CONTENT)
- Plans: TRIAL, STARTER, GROWTH, PRO, INTERNAL

---

## Sprint 1 Achievements

### Infrastructure
- Dev server running at localhost:3400
- Embedded Postgres on port 54329
- Full Prisma schema with 34 models, 4 migrations applied
- Project tracker schema added (Project, Issue, IssueComment, IssueHistory, HealthCheck, DashboardWidget, UserDashboard, ProjectIntegration)

### Seed Data
- 2 organizations (Demo Agency with all modules, Bare Agency with none for license gate testing)
- 8 users across both orgs with proper roles (OWNER, APPROVER, DESIGNER, MARKETER, ANALYST)
- 2 brands with 7 catalogue products
- 4 content tasks in various states (DRAFT, IN_REVIEW, APPROVED)
- 4 social channels (Facebook + Instagram for both brands)
- 2 campaigns with UTM parameters

### Skills Created
- platform-performance-benchmark: benchmarking tooling
- sprint-orchestrator: sprint management automation

### Process
- 3 sprint templates created (Planning, Standup, Retrospective)
- Kanban board with 11 daily tasks decomposed across Mon-Fri
- 4 bots active (creator, bug-detector, manager, bill)

---

## Gotchas for Future Sprint Participants

1. **Prisma JS client**: Use `$queryRawUnsafe` with quoted table names for raw JS scripts. The TS client works normally.
2. **SocialChannel columns**: snake_case in DB despite camelCase Prisma model.
3. **Project table**: uses ownerId (User FK), not organizationId.
4. **Rate limits**: Creator tasks are heavily rate-limited. Stagger calls.
5. **Dev server**: ~10-15s startup. Test after sleep.
6. **Seed**: Run both seed.ts (platform) and seed-domain.ts (domain data). Safe to re-run (upsert only).
7. **Embedded Postgres on Windows**: Started via `npm run pg:start`. Port 54329.

---

## Health Check Procedure

From the platform directory:
```
node health-check.js
```

This verifies: DB connection, all table row counts, seed data details, query latency.

---

## Entry Points for Next Sprint

- **Sign in**: http://localhost:3400
- **Admin**: platform-admin@demo.test / Demo@2026-Agency
- **Org owner**: owner@demo.test / Demo@2026-Agency
- **Project tracker**: Sprint 1 project (sprint-1) at http://localhost:3400
- **API base**: http://localhost:3400/api/v1
