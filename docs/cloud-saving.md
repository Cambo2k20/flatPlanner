# Cloud saving

Flat Planner can keep a private copy of your flats, catalogue, notes, preferences and
floorplan pictures in Supabase. Sign in with the same email in each browser. Local
editing and backup files still work without an account or a connection.

## Connect a project

1. Create or choose a Supabase project. Run [schema.sql](../supabase/schema.sql) in
   its SQL editor. It creates `planner_workspaces` with row-level security: a signed-in
   user can read, insert and update only the row whose `user_id` matches their account.
   Anonymous visitors have no access. A revision check prevents simultaneous uploads
   from overwriting each other.
2. Under **Authentication → Sign In / Providers**, enable **Email** and allow new users
   to sign up. Under **Email Templates**, put the code `{{ .Token }}` in both the
   **Magic Link** and **Confirm signup** templates. For example:

   ```html
   <h2>Sign in to Flat Planner</h2>
   <p>Your code is <strong>{{ .Token }}</strong>.</p>
   ```

   The app asks for this code; it does not depend on email links or redirects, which
   would interfere with the planner's `#/` routes. Keep the usual code expiry and
   rate limits. To deliver to addresses outside the Supabase project team, configure
   a custom SMTP provider: Supabase's built-in mail service restricts recipients.
3. Find the **Project URL** and **publishable key** in the project's Connect/API settings.
   For local development, copy `.env.example` to `.env.local` and fill in those two
   values. The older public `anon` key also works as `VITE_SUPABASE_ANON_KEY` locally.
   **Never put a secret or service-role key in a Vite variable.** Vite variables are
   included in the public site; privacy comes from authentication and the row policies.
4. In the GitHub repository, add two **Actions repository variables** under
   **Settings → Secrets and variables → Actions → Variables**:

   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY`

   The Pages workflow passes them into the production build. Redeploy after changing
   them; changing a local `.env` does not change an already published site.
5. Open the deployed planner and choose **Sign in to save**. Enter your email, then
   the code from your inbox. Wait for **Saved to account**. Open another browser and
   sign in with that same email to retrieve your flats.

Without these values the app keeps working locally and explains that cloud saving
is not available yet. No backend credentials are needed for the automated tests.

## What is kept

- Changes start saving to IndexedDB immediately. Cloud uploads wait briefly after a
  change, and the app checks for updates every 20 seconds while visible, on returning
  to the tab, and when the connection comes back. **Save now** also retries immediately.
- The first account used in a browser receives the flats already there. The original
  guest copy stays on that browser. It is not automatically given to later accounts.
- Every account has its own local cache and last acknowledged cloud copy. Signing out
  shows the guest copy, not the previous account's cache. Offline changes rejoin the
  cloud on the next sign-in to their account.
- Different flats and catalogue entries merge separately. Deleting a flat on one
  device does not make an unchanged older browser put it back. If both browsers edit
  the same flat or catalogue entry, the cloud version and a named `(copy)` are kept.
  If one deletes it while the other edits it, the edited version is kept as a copy.
- Floorplan images travel with the flat; catalogue photos travel with their entries.
  Generated card thumbnails are local and can be redrawn. Each save sends one JSON
  workspace, appropriate for a personal collection rather than a large image archive.
- Remote changes wait while a form is open or a field is being edited, so a refresh
  cannot discard text still being typed. No cloud success is shown until the server
  has acknowledged the save. Backup and flat-file exports remain available.

## Check it

```sh
npm ci
npm test
npm run build
npx playwright install --with-deps chromium webkit
npm run test:browser
```

Unit tests cover concurrent edits, deletions, stale browsers, interrupted uploads,
account caches and migration. Browser tests use a simulated Supabase boundary and real
IndexedDB/auth sessions in separate Chromium and WebKit contexts at 390 × 844. They
check email-code sign-in, account isolation, images, reloads and offline recovery.
The simulated service does not validate a production database's policies or deliver
real email; check those once against the connected project before relying on it.
