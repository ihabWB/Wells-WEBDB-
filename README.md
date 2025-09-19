# Groundwater Wells Database + Free PWA

This repo contains:
- PostgreSQL schema for a wells database (optimized for scalability and integrity)
- Row Level Security (RLS) policies for Supabase demo usage
- A simple vanilla JS Progressive Web App (PWA) to add wells, readings, water quality, maintenance visits, and service areas
- Offline support (cache + simple queue sync)
- Ready for free hosting on GitHub Pages and Supabase

## Stack
- Database: Supabase (PostgreSQL) free tier
- App hosting: GitHub Pages (deploy from branch)
- Client: Vanilla HTML/JS with Supabase JS client
- Offline: PWA (service worker + manifest) and local queue for submission retry

## Tables and Relationships
- wells (1) → monthly_readings (many)
- wells (1) → water_quality (many)
- wells (1) → maintenance_visits (many)
- wells (1) → service_areas (many)

Monthly abstraction is auto-calculated in the database:
monthly_abstraction = meter_current - meter_last

Validation:
- meter_current >= meter_last
- Required: well_code (wells), reading_date (monthly_readings), parameter_name (water_quality)

## Quick Start

1) Create Supabase project (free)
- Go to https://supabase.com/ and create a project.
- In SQL editor, run the scripts in db/schema.sql and db/policies.sql (in that order).

2) Get your Supabase URL and anon key
- From Project Settings → API:
  - Project URL
  - anon public API key

3) Configure the app
- Copy config.example.js to config.js (root)
- Paste your SUPABASE_URL and SUPABASE_ANON_KEY values in config.js

4) Host on GitHub Pages (free)
- In repo Settings → Pages:
  - Source: Deploy from a branch
  - Branch: main (root)
- Your site will be available at https://<your-username>.github.io/<repo-name>/

5) Use the App
- Open the published site.
- Add wells first, then use the other forms.
- The app works offline; submissions are queued when offline and retried when back online (click "Sync Now").

## Security Notes
- The provided policies allow anon (public) read/write for demo simplicity. For production:
  - Require auth (Supabase Auth)
  - Restrict writes to authenticated users
  - Use finer-grained RLS (e.g., per-user ownership)

## Files
- db/schema.sql         → database tables, constraints, indexes
- db/policies.sql       → Supabase RLS (demo-open policies)
- index.html            → the app UI (root)
- app.js                → client logic with validation and offline queue
- styles.css            → basic styling
- config.example.js     → put your Supabase URL/key and rename to config.js
- manifest.webmanifest  → PWA manifest
- service-worker.js     → PWA caching for offline