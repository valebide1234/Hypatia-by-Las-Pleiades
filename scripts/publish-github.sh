#!/bin/sh
# Publishes Hypatia to GitHub in one go: checks the project, signs you in, saves your work as a
# commit, creates the repository, pushes it and turns on the live site (GitHub Pages).
#
#   npm run publish:github            do it (asks before each step that changes something)
#   npm run publish:github -- --check only check that the project is ready; changes nothing
#
# It uses GitHub's own command-line tool (gh). Signing in happens in your browser; this script
# never sees your password.
set -e
cd "$(dirname "$0")/.."
CHECK_ONLY=0; [ "$1" = "--check" ] && CHECK_ONLY=1
ask() { printf "%s [Y/n] " "$1"; read -r a; [ -z "$a" ] || [ "$a" = "y" ] || [ "$a" = "Y" ]; }

echo "== 1. Checking the project =="
if git ls-files --error-unmatch .env >/dev/null 2>&1; then echo "STOP: .env is tracked by git. It must never be published."; exit 1; fi
BIG=$(git ls-files -co --exclude-standard | while IFS= read -r f; do if [ -f "$f" ] && [ "$(wc -c < "$f")" -gt 50000000 ]; then echo "$f"; fi; done)
if [ -n "$BIG" ]; then echo "STOP: these files are over 50 MB, too large for GitHub:"; echo "$BIG"; exit 1; fi
if git ls-files -co --exclude-standard | grep -v '^node_modules/' | xargs grep -lE 'sk-ant-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{20,}|eyJhbGciOi[A-Za-z0-9_-]{30,}' 2>/dev/null | grep -q .; then
  echo "STOP: a file looks like it contains a secret key. Remove it before publishing."; exit 1
fi
npm run typecheck --silent
npm test --silent
echo "The project is ready: no secrets, no oversized files, tests pass."
if [ "$CHECK_ONLY" = 1 ]; then echo "(--check: nothing was changed.)"; exit 0; fi
if [ ! -t 0 ]; then
  echo; echo "The next steps ask you questions, so they need a terminal you can type in."
  echo "Open the Terminal panel and run:  cd ~/Desktop/Hypatia && npm run publish:github"; exit 1
fi

echo; echo "== 2. GitHub sign-in =="
if ! command -v gh >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1 && ask "GitHub's command-line tool (gh) is not installed. Install it with Homebrew?"; then brew install gh
  else echo "Install it from https://cli.github.com and run this again."; exit 1; fi
fi
if ! gh auth status >/dev/null 2>&1; then
  echo "Your browser will open GitHub. Copy the code shown below, paste it there and approve."
  echo "(No GitHub account yet? Create one first at https://github.com/signup and run this again.)"
  gh auth login --hostname github.com --git-protocol https --web --scopes workflow
fi
# Publishing the site's build instructions needs the "workflow" permission.
gh auth status 2>&1 | grep -q workflow || gh auth refresh --hostname github.com --scopes workflow
gh auth setup-git
LOGIN=$(gh api user -q .login); ID=$(gh api user -q .id); NAME=$(gh api user -q '.name // .login')
echo "Signed in as $LOGIN."

echo; echo "== 3. Saving your work =="
BRANCH=$(git branch --show-current)
if [ -n "$(git status --porcelain)" ]; then
  # Commits carry your GitHub name and GitHub's private address, not a personal email.
  if ask "Sign the commit as \"$NAME\" (GitHub user $LOGIN)?"; then
    git config user.name "$NAME"; git config user.email "$ID+$LOGIN@users.noreply.github.com"
  fi
  git add -A
  git commit -q -m "Add discovery engine, Lab, assistant, languages and team proposals"
  echo "Saved as a commit on the branch $BRANCH."
else echo "Nothing new to save."; fi

echo; echo "== 4. The repository =="
if ! git remote get-url origin >/dev/null 2>&1; then
  printf "Name for the repository [hypatia]: "; read -r REPO; REPO=${REPO:-hypatia}
  echo "A public repository can have a free live site; a private one cannot on a free plan."
  if ask "Make it public?"; then VIS=--public; else VIS=--private; fi
  gh repo create "$REPO" $VIS --source=. --remote=origin
fi
FULL=$(gh repo view --json nameWithOwner -q .nameWithOwner)

echo; echo "== 5. Publishing =="
git push -u origin "$BRANCH"
# The live site is turned on before main is pushed, so its first build can publish.
gh api -X POST "repos/$FULL/pages" -f build_type=workflow >/dev/null 2>&1 || true
if [ "$BRANCH" != "main" ] && ask "Make this the main version (merge $BRANCH into main)? The live site is built from main."; then
  git checkout -q main
  if git merge -q --ff-only "$BRANCH"; then git push -u origin main; else echo "main has other changes; it was left as it is."; fi
  git checkout -q "$BRANCH"
fi

echo; echo "Done."
echo "  Code:       https://github.com/$FULL"
echo "  Build:      https://github.com/$FULL/actions   (the first one takes a few minutes)"
echo "  Live site:  https://$(echo "$FULL" | cut -d/ -f1 | tr 'A-Z' 'a-z').github.io/$(echo "$FULL" | cut -d/ -f2)/"
