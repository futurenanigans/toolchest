#!/usr/bin/env bash
set -euo pipefail
mkdir -p docs
cat > docs/incident-2026-11.md <<'MD'
# Incident Report: November Checkout Outage

## Overview

This document provides a comprehensive overview of the recent checkout service incident. It's worth noting that our team worked tirelessly to investigate the landscape of distributed systems issues — ensuring that every angle was thoroughly explored.

---

## Investigation Background

The checkout API serves as the primary gateway for customer orders. On November 20, alerts fired across multiple regions. Engineers reviewed dashboards, inspected logs, and coordinated across teams to navigate the issue seamlessly.

## Root Cause and Resolution

Release v2.4.1 lowered `db.pool.idleTimeoutMs` from 30000 to 5000 in `config/prod.json`. Under normal traffic, connections closed mid-burst and exhausted the Postgres connection limit (max 100), returning HTTP 503 on `/api/checkout`. Reverting `idleTimeoutMs` to 30000 in commit `9f2a1c4` restored error rates to 0.01% within 90 seconds.

## Summary

In summary, this incident highlights the importance of careful configuration changes.
MD
