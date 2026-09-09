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
