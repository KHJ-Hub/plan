# Source control policy

- Treat GitHub `main` as the source of truth for this project.
- Before reporting any implementation as complete or publishing it to the operating site, commit the intended changes and push the exact commit to `origin/main`.
- Do not deploy uncommitted code or code that has not been pushed to GitHub `main`.
- Keep deployment-only credentials, runtime secrets, and generated temporary archives out of Git and out of user-facing output.
