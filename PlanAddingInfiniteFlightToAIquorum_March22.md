# Plan: Adding InfiniteFlight to AIQuorum.org

**Date:** March 22, 2026
**Updated:** March 23, 2026 — all decisions confirmed by Michael
**Status:** PLAN — not yet implemented

---

## Goal

Add InfiniteFlight (browser-based 3D flight simulator) as a free app on aiquorum.org. Default access: all logged-in users. Admin can restrict access to specific users if needed.

---

## Current State

- **InfiniteFlight** is a single `index.html` file (~4,200 lines, Three.js) with zero backend requirements. No build step, no dependencies to install.
- **AIQuorum** is a FastAPI + Jinja2 platform with Google OAuth, JWT sessions, and an admin panel. Apps follow a consistent pattern: APPS registry entry in `app.py`, a Jinja2 template in `web/templates/`, and optionally an `apps/<name>/` backend module.
- Existing precedent: **Mandelbrot Fractal Explorer** is a pure-frontend app (no backend, no auth required) served as a single template. InfiniteFlight follows the same pattern but adds auth + access control.

---

## Architecture Decision

**Approach: Embed the full HTML as a Jinja2 template with auth gate**

Since InfiniteFlight is a single HTML file with no backend needs:
- No `apps/flight/` backend directory needed (no API routes, no database)
- The entire `index.html` becomes `web/templates/flight.html`
- Auth check happens in the page route in `app.py`
- Access control uses a new lightweight pattern (not Jane's env-var whitelist)

**Why not iframe?** The platform doesn't use iframes for any app. Keeping it consistent as a template means the auth cookie and user context are naturally available.

**Why not Jane's whitelist pattern?** Jane uses an env-var whitelist (`JANE_ALLOWED_USERS`) because it protects sensitive integrations (smart home, trading). InfiniteFlight is a game — the default is "everyone gets access" with optional admin restriction. A different, simpler pattern fits better.

---

## Implementation Plan

### Step 1: Access Control System (new, reusable)

**File:** `core/app_access.py` (new, ~40 lines)

Create a lightweight, admin-manageable access control system that can be reused by any future app:

```python
"""Per-app access control.

Access modes:
- "all"       → any logged-in user (default for InfiniteFlight)
- "whitelist" → only users in the allowed list (like Jane)
- "admin"     → admin-only

Admin can change the mode and manage the whitelist via the admin panel.
Stored in: data/app_access.json
"""
```

**Data file:** `data/app_access.json`
```json
{
  "flight": {
    "mode": "all",
    "allowed_users": []
  }
}
```

- `mode: "all"` → any authenticated user can access (default)
- `mode: "whitelist"` → only emails in `allowed_users` list can access
- `mode: "admin"` → only `is_admin` users can access
- Admins always have access regardless of mode

**Functions:**
- `check_app_access(user, app_slug) → bool`
- `get_app_access_config(app_slug) → dict`
- `set_app_access_mode(app_slug, mode) → None`
- `add_app_user(app_slug, email) → None`
- `remove_app_user(app_slug, email) → None`

### Step 2: Add to APPS Registry

**File:** `app.py` (edit, ~15 lines)

Add entry to the `APPS` dict after the mandelbrot entry:

```python
"flight": {
    "name": "InfiniteFlight",
    "description": "Browser-based 3D flight simulator. Fly 7 aircraft across 8 real-world locations with realistic physics, cockpit views, and real USGS terrain.",
    "icon": '<path d="..."/>',  # Custom fighter jet SVG — design during implementation
    "gradient_start": "#1e3a5f",
    "gradient_end": "#0f2440",
    "tags": ["Flight Sim", "3D", "Free"],
    "status": "live",
    "url": "/flight",
},
```

**Confirmed decisions:**
- **Icon:** Custom fighter jet silhouette (swept wings, distinct from Bessie's travel airplane)
- **Gradient:** Navy/steel blue (`#1e3a5f` → `#0f2440`) — cockpit/night sky feel, distinct from all other apps

### Step 3: Page Route with Access Control

**File:** `app.py` (edit, ~20 lines)

Add the `/flight` route near the other app routes:

```python
@app.get("/flight", response_class=HTMLResponse)
async def flight_page(request: Request):
    """Render the InfiniteFlight simulator page."""
    user = get_current_user_optional(request)
    if not user:
        return RedirectResponse(url="/?signin=required", status_code=302)

    # Check app access (admin-configurable, defaults to all users)
    from core.app_access import check_app_access
    if not check_app_access(user, "flight"):
        return templates.TemplateResponse(
            "app-restricted.html",
            {"request": request, "user": user, "app_name": "InfiniteFlight"},
            status_code=403,
        )

    return templates.TemplateResponse(
        "flight.html",
        {"request": request, "user": user},
    )
```

### Step 4: Create the Template

**File:** `web/templates/flight.html` (new)

Copy InfiniteFlight's `index.html` content into a Jinja2 template. Minimal changes:
1. Keep all existing HTML/CSS/JS exactly as-is (the simulator is self-contained)
2. Add the **standard "Q" home button** — a stylized "Q" in the top-left corner that navigates back to `/` (the AIQuorum home screen). This is now the platform-wide standard for all apps.
3. Optionally inject `{{ user.name }}` somewhere in the UI
4. Three.js loads from CDN (already in the file) — no static files needed

**"Q" button spec:**
- Fixed position, top-left corner
- Stylized "Q" (matches AIQuorum branding)
- Semi-transparent, unobtrusive over the 3D scene
- On click: navigates to `/` (home screen)
- Must not interfere with simulator controls or HUD

The file is ~4,200 lines. That's fine — the music player template is 555KB, the admin template is 31KB. Large self-contained templates are normal in this platform.

### Step 5: Restricted Access Page

**File:** `web/templates/app-restricted.html` (new, ~30 lines)

A generic "you don't have access to this app" page, reusable for any future app:

```html
<!-- Shows: "Access to {app_name} is restricted. Contact an admin for access." -->
<!-- Links back to home page -->
<!-- Styled consistently with jane-unauthorized.html -->
```

### Step 6: Admin Panel — App Access Management

**File:** `web/templates/admin.html` (edit)

Add a new "App Access" tab to the admin panel with:
- Dropdown to select an app (initially just "InfiniteFlight")
- Radio buttons: "All Users" / "Whitelist" / "Admin Only"
- If whitelist mode: text input to add/remove email addresses
- Save button that calls new admin API endpoints

**File:** `app.py` (edit, ~40 lines)

Add admin API endpoints:
```
GET  /api/admin/app-access?app=flight     → get current config
POST /api/admin/app-access                → set mode + allowed users
```

Both require `is_admin`. Actions logged to audit trail.

### Step 7: Initialize Default Config

**File:** `data/app_access.json` (new)

Create with default config on first deploy:
```json
{
  "flight": {
    "mode": "all",
    "allowed_users": []
  }
}
```

The `core/app_access.py` module auto-creates this file if it doesn't exist, defaulting to `"all"` for any app not listed.

---

## What Does NOT Need to Change

- **No Q-Bucks metering** — this is a free app with no AI API calls
- **No `apps/flight/` backend directory** — no API routes needed
- **No database** — no user data to store
- **No WebSocket** — purely client-side rendering
- **No static files** — everything is inline in the HTML template (Three.js from CDN)
- **No nginx config changes** — standard HTTP route, no WebSocket upgrade needed

---

## Files Changed/Created Summary

| File | Action | Lines | Purpose |
|------|--------|-------|---------|
| `core/app_access.py` | **NEW** | ~60 | Reusable per-app access control |
| `data/app_access.json` | **NEW** | ~6 | Access config data |
| `web/templates/flight.html` | **NEW** | ~4,250 | InfiniteFlight simulator page |
| `web/templates/app-restricted.html` | **NEW** | ~50 | Generic "access restricted" page |
| `app.py` | **EDIT** | +~35 | APPS entry + `/flight` route + admin endpoints |
| `web/templates/admin.html` | **EDIT** | +~80 | App Access tab in admin panel |

**Total new code:** ~4,480 lines (of which ~4,200 is the existing InfiniteFlight HTML)
**Total platform code changes:** ~280 lines

---

## Deployment Steps

1. Implement all changes in AIQuorumPlatform repo
2. Test locally: `make dev` → sign in → verify `/flight` loads
3. Test access control: change mode to `whitelist` via admin panel, verify non-listed user gets restricted page
4. Commit with descriptive message
5. Deploy to Lightsail (`./deploy.sh` or manual push + restart)
6. Test on production: sign in at aiquorum.org → click InfiniteFlight → fly

---

## Future Considerations

- **The `core/app_access.py` module is generic.** Once built, any future app can use it. Could retrofit Jane to use it instead of the env-var whitelist.
- **InfiniteFlight updates:** When the simulator gets new features (in `/Users/michaelashe/Projects/InfiniteFlight/index.html`), just copy the updated content into `web/templates/flight.html`. Could automate this with a script.
- **Mobile touch controls:** The simulator already handles touch/tilt. Should work on iPhone Safari through aiquorum.org with no changes.
- **Performance:** 4,200-line template is fine. Jinja2 renders it once server-side; the browser handles the rest.

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Three.js CDN blocked by CSP headers | Medium | Check `Content-Security-Policy` in nginx config; add `cdnjs.cloudflare.com` if needed |
| AWS Terrain Tiles CORS on aiquorum.org domain | Low | Already uses `crossOrigin: 'anonymous'`; tiles are public |
| Large template slows page load | Low | Music player template is larger and works fine |
| Admin access control JSON file permissions | Low | Same pattern as `data/users.json` |

---

## Decisions (Confirmed March 23, 2026)

| # | Decision | Choice |
|---|----------|--------|
| 1 | App slug | `flight` → `aiquorum.org/flight` |
| 2 | Icon | Custom fighter jet SVG (swept wings, distinct from Bessie) |
| 3 | Gradient | Navy/steel blue `#1e3a5f` → `#0f2440` |
| 4 | Tags | "Flight Sim", "3D", "Free" |
| 5 | Navigation | Stylized "Q" button top-left → navigates to home. **Now a platform-wide standard for all apps.** |
