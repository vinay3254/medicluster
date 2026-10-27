# SOS Location Correction

User reports browser location is wrong; actual area is Rajanukunte. Do not substitute area center for an exact pickup point or mutate live requests automatically.

- Search an area, then require a map click or pin drag before confirmation.
- A confirmed pin can be used for a new SOS or update an existing unassigned pending SOS.
- Backend enforces patient ownership and conditional status/assignment filters.
- Assigned responses require contacting dispatch for location changes.
- Preserve original idempotency payload and all existing emergency/call controls.
- Verify UI on mobile and desktop, coordinate payloads, pending correction, assignment race rejection, and existing SOS flow.

Backend tests: 93 passed. No live SOS records changed during implementation.
