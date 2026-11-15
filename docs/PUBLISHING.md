# Publishing Hypatia

Hypatia is a web app: a folder of static files (`npm run build` writes it to `dist/`). Publishing means putting that folder on a web server. Nothing here has been published yet.

## GitHub (code) and GitHub Pages (the live app)

**The quick way: one command.**

```bash
npm run publish:github
```

It checks the project (no secret keys, no oversized files, tests pass), signs you in to GitHub in your browser, saves your work as a commit under your GitHub name, creates the repository, pushes it and turns on the live site. It asks before each step that changes something. `npm run publish:github -- --check` only runs the checks.

The steps below are the same thing by hand.

1. **Create the repository**: <https://github.com/new>. Name it, for example, `hypatia`. Do not add a README or a licence there; the project already has its files.
2. **Send the code** from the project folder (replace `USER` with the GitHub user or organisation):

   ```bash
   git remote add origin https://github.com/USER/hypatia.git
   git push -u origin main
   ```

   The work in progress is on the branch `feat/discovery-engine`; merge it into `main` first, or push that branch and open a pull request.
3. **Turn Pages on**: in the repository, Settings → Pages → Build and deployment → Source: **GitHub Actions**.
4. The workflow `.github/workflows/deploy-pages.yml` then builds and publishes the app every time `main` changes. The address will be `https://USER.github.io/hypatia/`.

Things to know:

- **Accounts need Supabase.** Without `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (set them as repository *variables*, Settings → Secrets and variables → Actions → Variables) the published app offers guest mode only. In Supabase, add the published address to Auth → URL configuration.
- **Keys.** The Supabase anon key and the Cesium token are designed to be public. `SUPABASE_SERVICE_ROLE_KEY` and `ANTHROPIC_API_KEY` must never be put in the repository or in a `VITE_` variable.
- **Engine updates.** `.github/workflows/engine-update.yml` re-runs the engine monthly and commits the new data files, which triggers a new deployment.
- **Who the commits belong to.** Check `git config user.name` and `git config user.email` before committing; they say whose name appears on GitHub.
- A sub-path build was checked locally (`VITE_BASE=/hypatia/ npm run build`, then `vite preview`): the pages, the images, the globe and the data files load. The workflows themselves have not been run on GitHub.

## App Store

The App Store only takes native apps, and Hypatia is a web app, so this is a second project:

1. **Apple Developer Program** (99 USD per year; the account holder must be an adult): <https://developer.apple.com/programs/enroll/>
2. **Wrap the web app** in a native shell with Capacitor: <https://capacitorjs.com/docs/ios>. This needs a Mac with Xcode.
3. **Submit it** through App Store Connect: <https://appstoreconnect.apple.com/>. Apple reviews every app; one that is only a website in a wrapper can be rejected (guideline 4.2, minimum functionality), so it should work offline or use device features.

A web address works on every phone and computer straight away, so GitHub Pages is the faster way to let people use Hypatia.
