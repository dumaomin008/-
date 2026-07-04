# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Product Decisions

- Resume uploads, parsed reports, and history should persist server-side by authenticated user ID, including original file data, visible status, and parsed text. Different users must see isolated workspaces after login; browser-local storage should not be the source of truth.
- The MySQL database should keep both app-friendly JSON snapshots and Navicat-manageable normalized tables for resumes, analysis runs, candidates, score breakdowns, tags, strengths, risks, evidence, and interview questions.
- MySQL tables and columns should keep Chinese COMMENT metadata so Navicat can show readable business meanings for every managed field.
- The backend should support Supabase Postgres as a production database option via server-side connection strings, while keeping MySQL as the local/Navicat-friendly default. Frontend code should continue calling the Node `/api/*` endpoints and must not receive database passwords or service role keys.
- For this workspace, backend development and verification should use the local database by default. Supabase should remain an optional production target, not the default development database.
