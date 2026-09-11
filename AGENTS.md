# Source control policy

- Treat GitHub `main` as the source of truth for this project.
- Before reporting any implementation as complete or publishing it to the operating site, commit the intended changes and push the exact commit to `origin/main`.
- Do not deploy uncommitted code or code that has not been pushed to GitHub `main`.
- Keep deployment-only credentials, runtime secrets, and generated temporary archives out of Git and out of user-facing output.

# 작업 중단·재개 규칙

- 프로젝트 루트의 `WORK_PROGRESS.md`를 작업 진행 상태의 기록으로 사용한다.
- 작업 시작 시 `AGENTS.md`, `WORK_PROGRESS.md`, `git status`, 최근 커밋을 차례로 확인하고, 완료된 작업을 다시 구현하지 않는다.
- 실제 코드·Git 상태와 진행 기록이 다르면 실제 코드·Git 상태를 우선하고 `WORK_PROGRESS.md`를 갱신한다.
- 큰 작업은 의미 있는 단위로 나눈다. 각 단위가 완료되면 테스트 → `WORK_PROGRESS.md` 갱신 → add → commit → push 순서로 처리한다.
- 실패하거나 미완료인 작업은 성공으로 기록하거나 커밋하지 않는다. 실패 원인과 다음 시작점을 `WORK_PROGRESS.md`에 남긴다.
- 사용자가 “계속 진행해줘”, “이어가줘”, “아까 하던 거 계속해줘”라고 요청하면 `WORK_PROGRESS.md`의 남은 작업과 다음 시작점부터 바로 재개한다.
- 작업이 완료된 뒤에도 `WORK_PROGRESS.md`를 삭제하지 않고, 완료 상태·최종 커밋·선택적 개선 사항을 남긴다.
- 진행 기록에는 학생 신청안과 공식 결과의 분리, 차수별 결과 보존, 입학년도와 신청 대상 학년의 분리, 현재 반·번호·이름 기반 학생 식별, 추천과목 미선택은 경고만 표시, 확인 완료 후 변경 시 재확인 필요, GitHub `main` 원본 기준을 유지한다.

# 운영 사이트 검증 규칙

- 운영 검증에 Codex/GPT 내부 브라우저를 사용하지 않는다. 내부 브라우저의 `This page couldn’t load`는 실제 사이트 상태의 증거로 사용하지 않는다.
- 모든 변경은 우선 정적 검증을 수행한다: lint, unit test, build 및 작업에 필요한 최소 테스트.
- GitHub Pages를 사용하는 프로젝트는 `git push` 성공 여부, Pages용 GitHub Actions workflow 성공 여부, 최신 커밋이 배포 대상인지 확인한다.
- 운영 URL은 HTTP 요청(curl 또는 동등한 도구)으로 확인한다. 최소한 HTTP 200, `index.html`, 주요 JS/CSS 응답과 필요 시 cache header를 확인한다.
- 실제 UI 브라우저 테스트가 필요하면 가능한 경우 Playwright와 이 PC의 실제 Chromium/Chrome을 사용한다. local dev server 또는 운영 URL에서 주요 요소, 클릭, 모달, 날짜 이동, 반응형 레이아웃을 검증한다.
- Chrome/Chromium과 Whale 차이가 중요한 경우 Chromium 자동 테스트를 우선하고 Whale 확인은 사용자 수동 확인 항목으로 남긴다.
- Google/Firebase 등 실제 학교 계정 인증은 자동 로그인 우회나 비밀번호 저장을 하지 않는다. 로그인 전까지만 자동화하고 로그인 이후는 사용자 수동 확인으로 구분한다.
- 내부 브라우저 로딩 실패만을 이유로 코드를 수정하거나 배포를 반복하거나 새 커밋을 만들지 않는다.
- 최종 보고에는 자동 테스트, HTTP 운영 URL, GitHub Pages 배포, Playwright 수행 여부, 사용자 수동 확인 항목을 각각 구분해 기록한다.
