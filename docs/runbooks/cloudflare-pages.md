# Cloudflare Pages: connecting the site

One-time setup, done in the Cloudflare dashboard. The result is `https://latentdata.org`
rebuilding on every push to `main`, with a preview URL for every pull request.

## 1. Create the Pages project

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**.
2. Pick the `latentdata` repository. Authorise the Cloudflare GitHub App on that one repo only.
3. Build settings:

   | Setting                | Value                                 |
   | ---------------------- | ------------------------------------- |
   | Production branch      | `main`                                |
   | Framework preset       | None                                  |
   | Build command          | `npm ci && npm run build -w apps/web` |
   | Build output directory | `apps/web/dist`                       |
   | Root directory         | `/` (leave empty)                     |

4. Environment variables (both Production and Preview): `NODE_VERSION` = `24.18.0`.
   An exact version, not `24`: Pages resolves a bare major to an older patch than the test
   tooling accepts, and `npm ci` then stops with `EBADENGINE`. The repo's `.node-version` carries
   the same value; raise both together.
   The three `VITE_…` values that turn admin sign-in on are added later, once the stack exists:
   `docs/runbooks/admin-access.md`, step 4.
5. Save and deploy. The first build takes a couple of minutes.

## 2. Custom domain

1. In the Pages project → **Custom domains** → **Set up a custom domain** → `latentdata.org`.
2. Cloudflare adds the CNAME itself because the zone is on the same account. Accept it.
3. Add `www.latentdata.org` the same way if you want it; Pages redirects it to the apex.

## 3. Checks

- `https://latentdata.org` shows the dashboard and the "data as of" time matches the snapshot.
- Open a pull request: the Cloudflare bot comments a preview URL on it.
- **Settings → Builds & deployments → Branch control**: production = `main`, preview = all
  non-production branches. Leave it there; Dependabot branches get previews too, which is
  fine and free.

## Notes

- The build validates `apps/web/src/data/snapshot.json` before Vite runs (`prebuild`), so a bad
  snapshot fails the Cloudflare build rather than shipping a broken page.
- Free tier is 500 builds a month. The publisher (M2) caps its snapshot commits at 200.
- Nothing here needs an API token in the repo. If the Git integration is ever replaced with
  Direct Upload, that token goes into GitHub secrets and a workflow, not into the code.
