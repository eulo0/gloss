# CI

GitHub Actions runs on every pull request and on pushes to `main` (`.github/workflows/ci.yml`).
Node's version comes from `.nvmrc`. New pushes to the same branch cancel the older run.

## Jobs

| Job         | Runner         | Checks                                                  | Required |
| ----------- | -------------- | ------------------------------------------------------- | -------- |
| `lint`      | ubuntu-latest  | `npm run lint` (ESLint) and `npm run format:check`      | yes      |
| `typecheck` | ubuntu-latest  | `npm run typecheck` (`tsc --noEmit`)                    | yes      |
| `test`      | ubuntu-latest  | `npm test` (Vitest)                                     | yes      |
| `package`   | windows-latest | `npm run package`; runs only after the three above pass | yes      |
| `commits`   | ubuntu-latest  | commitlint (Conventional Commits) on the PR's commits   | yes      |
| `audit`     | ubuntu-latest  | `npm audit --audit-level=high`                          | no       |

`audit` is informational: a new advisory shouldn't block unrelated pull requests.
Each job has a 15-minute timeout. Tests never use the network or real TTS (see CLAUDE.md).

## Reproduce locally

```bash
npm run check      # lint -> format:check -> typecheck -> test (the first four jobs' checks)
npm run package    # the package job
npx commitlint --from origin/main --to HEAD --verbose   # the commits job
npm audit --audit-level=high
```

`npm run format` fixes formatting problems that `format:check` reports.

## Reading a failure

```bash
gh run list --branch <branch>      # find the run
gh run view <run-id>               # per-job status
gh run view <run-id> --log-failed  # only the failing steps' logs
gh pr checks                       # status of the current branch's PR
```

Or open the PR's "Checks" tab and expand the red job.

## Dependabot

`.github/dependabot.yml` opens weekly pull requests, with the `chore(deps)` prefix so commitlint passes:

- npm: one PR for dev dependencies and one for production dependencies (minor and patch updates);
  each major update gets its own PR.
- GitHub Actions: all updates in one PR.

## Set up branch protection on `main` (by hand, in the GitHub UI)

Do this after the first CI run on `main` or on a PR, because GitHub only lets you pick status checks it has already seen.

1. Open https://github.com/eulo0/gloss/settings/branches.
2. Under "Branch protection rules" click **Add branch protection rule**
   (or **Add classic branch protection rule**). If your UI shows "Rulesets" instead, use
   Settings -> Rules -> Rulesets -> New ruleset -> New branch ruleset, target `main`, and pick the equivalent options below.
3. Branch name pattern: `main`.
4. Tick **Require a pull request before merging**. Approvals can stay at 0 for a solo repository.
5. Tick **Require status checks to pass before merging**, then **Require branches to be up to date before merging**.
6. In the status check search box add: `lint`, `typecheck`, `test`, `package`, `commits`.
   Do **not** add `audit`.
7. Optional: tick **Do not allow bypassing the above settings** so it applies to you too.
8. Click **Create** (or **Save changes**).

From then on, `main` only changes through pull requests whose required checks are green.
