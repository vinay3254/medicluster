# Dashboard Consolidation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans. Steps use checkbox tracking.

**Goal:** Verify real tumor/radar inference, remove standalone Predict, and merge Home into Dashboard while retaining CliniQ and all other features.

**Architecture:** Dashboard owns Overview and Clustering views. Reuse Home's saved population summary as DashboardOverview. Root and retired Predict links redirect to Dashboard. Preserve Clinical AI's existing embedded prediction and backend API because other features must remain.

**Tech Stack:** React, React Router, Vite, Playwright, Flask, SAM-Med3D, Chronos-2.

**Spec:** User request in current session, October 26, 2026.

## Constraints

- Preserve existing uncommitted work and running local services.
- Keep CliniQ and remaining sidebar features in their current groups.
- Use isolated verification artifacts, never real patient data, for inference checks.
- Keep dataset, results and onboarding handoff when switching Dashboard views.
- No credential values or patient data in committed tests or reports.

## Review Focus

- Root and old Predict URLs reach Dashboard without redirect loops.
- Overview empty/error states remain usable.
- Clustering results survive switching to Overview and back.
- Onboarding's uploaded dataset opens Clustering directly.
- Desktop and mobile Dashboard views remain usable.

## Tasks

- [x] Add browser regression coverage for redirects, navigation, overview and retained clustering state; confirm failure.
- [x] Extract DashboardOverview, add Dashboard views, remove Predict page/navigation and update patient shortcut.
- [x] Update existing tests for consolidated page; run frontend unit suite, relevant browser tests and production build.
- [x] Independently execute real SAM-Med3D segmentation and Chronos-2 forecast. Record nonempty geometry and finite ordered quantiles.
- [x] Review changes and report verified results and limitations.

## Verification Results

- Frontend unit suite: 59 passed.
- Dashboard, workspace and research responsive browser tests: 21 passed.
- Production build passed; existing chunk-size warning remains.
- Code review: no remaining blockers.
- SAM-Med3D-turbo: real demo MRI segmentation produced 26,099 mask voxels and valid mesh in 4.199 seconds.
- Chronos-2: six-step forecast across six simulated vitals; all 108 quantile values finite and ordered, 3.119 seconds.
- Backend gateway health confirms both models loaded/ready. Research pages render against live backend.
- Temporary inference artifacts removed; evidence stored in /tmp/medicluster-run/research-verification.json.
