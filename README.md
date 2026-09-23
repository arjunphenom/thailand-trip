# Thailand Nov 2026

A phone-first shared checklist for 31 October to 8 November 2026. React, TypeScript, Vite and Supabase. Four tabs: Checklist, Itinerary, Money and Share.

Roster: ACHU (Admin), AJ, DRUNK, DK, AMROWW and small_dude. Admin is a display label, not an access-control role.

## Move to Your Personal Mac

Transfer only the standalone trip-app archive, not the surrounding company workspace. In remote VS Code's Explorer, right-click the archive and choose **Download**. Do not authenticate personal GitHub on the company machine. Follow company policy on transferring personal work.

1. Extract the archive on your Mac, for example into `~/Projects`.
2. Install [Node.js 24 LTS](https://nodejs.org/) and VS Code. Check `node --version` and `npm --version` in a new terminal. With nvm already installed, `nvm install` uses [.nvmrc](.nvmrc).
3. In VS Code use **File > Open Folder** to open just the extracted `thailand-trip` folder locally. The lower-left corner must not say **SSH** or **Dev Container**.
4. Open **Terminal > New Terminal** and run:

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally <http://localhost:5173/>. VS Code's **NPM Scripts** view also has a run button beside `dev`. No SSH port forwarding is needed on your Mac. Keep that terminal running during development; Ctrl+C stops it.

Without Supabase settings, the app is an explicitly read-only preview. Identity is stored on the device, but task changes are never kept as a private local copy.

### Preview on Your Phone

With the Mac and phone on the same trusted Wi-Fi network:

```sh
npm run dev -- --host 0.0.0.0
```

Open Vite's **Network** URL on the phone. If macOS asks, allow Node on your trusted network. Do not expose the development port through your router. HTTP Wi-Fi preview may not support clipboard, installation or Web Share; selectable share text remains available. The final GitHub Pages URL uses HTTPS and does not require your Mac to remain on.

## Connect Personal Supabase

1. Create a dedicated project in your personal [Supabase](https://supabase.com/) account.
2. In its SQL Editor, run these files in order:
  - [supabase/migrations/202609230001_trip.sql](supabase/migrations/202609230001_trip.sql)
  - [supabase/migrations/202609230002_traveller_names.sql](supabase/migrations/202609230002_traveller_names.sql)
  - [supabase/seed.sql](supabase/seed.sql)
3. Get the project URL and **publishable** key from the project's Connect/API settings. A legacy `anon` key also works. **Never use a secret, `service_role` key, database password or personal access token.**
4. Create a local environment file from the template:

```sh
cp .env.example .env.local
```

Enter the URL and public browser key into those two variables in VS Code on your Mac. Restart `npm run dev`. Do not put keys or passwords into chat. Environment files are git-ignored.

The SQL enables realtime on all six tables and atomic task/activity writes. Reseeding does not reset task changes. The roster migration replaces only original placeholder names, preserving custom renames. Once connected, each traveller can select their identity and use **Rename my traveller** to update their name.

**Privacy:** this is deliberately public-edit with no authentication. Anyone who discovers the project endpoint can read or modify the trip. Name selection and ACHU's Admin label are not security controls. Use a dedicated Supabase project; keep passport scans, PNRs, sensitive booking references and credentials elsewhere. Public browser keys are visible in built JavaScript. A private source repository does not make the deployed trip private.

## Publish on Personal GitHub Pages

GitHub Pages serves the app; Supabase stores and synchronizes shared data. GitHub is not the database. A public personal repository supports free Pages hosting; private repositories may require a paid plan.

1. On your Mac, create an **empty** personal GitHub repository named `thailand-trip`. Do not add a README or gitignore through GitHub.
2. Set **Settings > Pages > Build and deployment > Source** to **GitHub Actions**.
3. Under **Settings > Secrets and variables > Actions > Variables**, add these repository variables:

| Variable | Value |
| --- | --- |
| `VITE_SUPABASE_URL` | Your dedicated Supabase project's HTTPS URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Its public publishable or legacy anon key |

4. Sign into personal GitHub on your Mac through VS Code or [GitHub CLI](https://cli.github.com/). With the CLI installed:

```sh
gh auth login --hostname github.com --git-protocol https --web
gh auth setup-git
```

5. From the **trip-app directory only**, initialize its own repository. Replace the placeholders with personal details. Do not run this in the company workspace:

```sh
git init -b main
git config --local user.name "YOUR PERSONAL NAME"
git config --local user.email "YOUR PERSONAL GITHUB EMAIL"
git add .
git status --short
git diff --cached --stat
git commit -m "Build Thailand trip tracker"
git remote add origin https://github.com/YOUR_USERNAME/thailand-trip.git
git push -u origin main
```

Before committing, verify that staged files contain only this app, with no environment files, credentials or unrelated company material.

6. Open **Actions > Publish Thailand Trip**. The workflow runs tests, checks the seed, verifies phone layouts, builds, and publishes. It fails if Supabase configuration is missing or uses a server-only key. The successful deployment shows the public URL, normally `https://YOUR_USERNAME.github.io/thailand-trip/`.

Pushes to `main` redeploy automatically. Changing repository variables requires rerunning the workflow. Repository renaming works because the workflow obtains its base path from Pages. Hash routes such as `/#/itinerary` allow tab reloads without server rewrites.

## Verify Before Sharing

- Open the public URL on two phones, choose different names and confirm the connection dot is green.
- Cycle a task through todo, doing and done; the other phone should update without a refresh. Repeat for owners, comments, costs and personal completions.
- Disconnect a phone and try a change. It should report failure without a false completion. Reconnect and check the latest shared state.
- Confirm 22 tasks, nine days and six travellers. TDAC completions must belong to individual travellers.
- On iPhone use Safari's **Share > Add to Home Screen**. On Android use **Install app** or **Add to Home screen**. The installed name is **Thailand Nov 26**.

The installable app caches its shell, not a private editable trip. Shared data and saves require a database connection. Hosted two-device realtime must be verified with your actual project; local automated tests do not prove hosted socket connectivity.

## Development Checks

```sh
npm test
npm run seed:check
npm run lint
npm run build
npx playwright install chromium
npm run test:phone
```

Browser tests expect a read-only preview build. Run them before configuring local Supabase, or build with all three Supabase environment variables set to empty strings. They cover 320, 360, 390 and 430px phones and desktop, image loading, tap targets, forms, route reloads and identity persistence. Screenshots are generated under git-ignored `test-results`. The workflow tests an isolated preview before building the connected app.

For a repository path locally, run `BASE_PATH=/thailand-trip/ npm run build` then `BASE_PATH=/thailand-trip/ npm run test:phone`.

Edit [src/data/seed.json](src/data/seed.json), then run `npm run seed:sql` and `npm run seed:check`. Seed changes do not overwrite existing database rows; use targeted migrations. The INR planning rate is `THB_TO_INR` in [src/lib/trip.ts](src/lib/trip.ts). Regenerate phone icons with `node scripts/generate-icons.mjs`.

## Photograph

The bundled photo is [Isla Phi Phi Lay, Tailandia, 2013-08-19, DD 07](https://commons.wikimedia.org/wiki/File:Isla_Phi_Phi_Lay,_Tailandia,_2013-08-19,_DD_07.JPG) by [Diego Delso](https://delso.photo/), licensed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/). It was resized and converted to WebP and remains under that license. This license applies to the photograph, not the application code.
