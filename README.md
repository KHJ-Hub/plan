# 배정고 수강신청 결과 확인 및 진로 과목 점검 시스템

학생이 학교의 최신 수강신청 결과를 학기별로 확인하고, 희망 진로·대학·학과 기준의 권장 과목을 점검하는 웹서비스입니다. 교사는 실제 Excel 결과와 과목 설명 자료를 미리보기 후 안전하게 교체할 수 있습니다.

> 개인정보 주의: `test-data/`의 실제 Excel/PDF와 여기서 파생한 학생 정보 JSON·CSV·DB dump는 GitHub, 이슈, 외부 서비스에 절대 올리지 마세요.

## 화면

- 학생: `/`
- 교사: `/teacher.html`

학생 화면은 2학년 1학기부터 3학년 2학기까지 현재 등록된 최신 결과, 미등록 학기, 진로 과목 충족·부족·확인 필요 상태를 보여줍니다. 교사 화면은 학기별 등록 현황, 신청안 점검, 최신 결과 업로드, 결과 검증, 기준자료, 백업·복구를 제공합니다.

## 기술 구조

- UI: React 19 + Vinext(App Router 호환) + Vite
- 서버: Cloudflare Worker의 `app/api/*` route
- DB: Cloudflare D1 + Drizzle schema/SQL migrations
- 파일 분석: 브라우저 `xlsx`, PDF.js
- 배포: Wrangler + GitHub Actions
- 과거 코드: `legacy/index.html`은 현재 앱과 연결되지 않은 이전 단일 HTML 보관본

GitHub Pages는 Worker API와 D1을 실행할 수 없으므로 이 프로젝트의 운영 호스팅으로 사용할 수 없습니다.

## 로컬 실행

요구 사항은 Node.js 24 권장(최소 `22.13.0`)입니다.

```powershell
Copy-Item .env.example .env.local
npm ci
npx wrangler d1 migrations apply DB --local --config wrangler.jsonc
npm run dev
```

`.env.local`에서 아래 값을 반드시 교체합니다.

```dotenv
ADMIN_PASSWORD=<교사용 초기 비밀번호>
SESSION_SECRET=<예측 불가능한 32자 이상 문자열>
# 선택: 기본 교육기관 도메인 외 공개 PDF 호스트
PUBLIC_PDF_ALLOWED_HOSTS=<files.example.org,cdn.example.org>
```

`SESSION_SECRET`이 없거나 예시값이면 세션을 발급하지 않습니다. 실제 비밀값은 커밋하지 마세요. 현재 로컬 D1 상태에 따라 `0003`~`0010` migration이 pending일 수 있으므로 실행 전 migration 목록을 확인할 수 있습니다.

```powershell
npx wrangler d1 migrations list DB --local --config wrangler.jsonc
```

개발 서버는 장시간 실행되므로 IDE 터미널에서 직접 `npm run dev`를 실행하세요.

## 핵심 데이터 모델

공식 결과의 운영 단위는 `입학년도 + 대상 학년 + 대상 학기`입니다. 내부 저장은 학생의 현재 반별 파일 scope를 사용하지만 학생에게는 각 학기의 현재 active 결과만 표시합니다.

- 지원 학기: 2-1, 2-2, 3-1, 3-2
- `round_number`: 기존 신청안/과거 DB 호환용이며 최신 결과 교체 key가 아님
- 재업로드: 같은 입학년도·반·학년·학기의 기존 active 파일을 새 파일로 교체
- 과거 업로드: 삭제하지 않고 inactive 이력으로 보존
- 미등록 학기: 오류가 아니라 “아직 결과가 등록되지 않았습니다”로 표시

입학년도는 DB와 화면 입력값이므로 2026에 고정되지 않습니다.

## 최신 결과 Excel 업로드

교사 화면의 `실제 결과 업로드`에서 다음 순서로 처리합니다.

1. 교사 화면의 입학년도 확인
2. `.xls` 또는 `.xlsx` 선택(전교생 통합 파일 또는 반별 파일)
3. 자동 분석 후 각 반의 대상 학년·학기를 직접 확인/수정
4. 학생 수, 과목 수, 제외 행, 오류, 확인 필요 선택군 확인
5. 기존 최신 자료가 있으면 교체 체크
6. 최종 확인 후 반영

파일명과 시트명은 학년·학기 추정에만 사용하며 최종 적용값은 교사가 확인한 값입니다. 중앙 열 별칭은 `lib/excel-logic.mjs`의 `officialColumnMappings`에서 관리합니다.

현재 지원 사항:

- `순번/연번`, `반/학급`, `번호/출석번호`, `이름/성명`, 선택적 학번 별칭
- `O`, `o`, `○`, `◯` 신청 표시
- 집계·안내·빈 행 자동 제외와 행 번호 진단
- 중복 학생·과목 열, 빈 식별값, 잘못된 학년·학기 검사
- 통합 파일의 반별 자동 분리
- Excel 10MB, 5,000행, 300열 상한

`음악 … / 미술 …`, `정보 / 일본어` 같은 헤더는 개별 선택 과목을 확정할 수 없으므로 임의로 분리하지 않고 확인 필요 선택군으로 보존합니다.

### 안전한 교체 방식

모든 입력을 먼저 검증하고 새 파일을 `active=0` staging으로 저장합니다. 모든 반·학기 staging이 성공해야 기존 active 해제와 새 파일 활성화를 하나의 짧은 D1 batch로 실행합니다. 실패하면 기존 최신 결과는 계속 active 상태로 남습니다. 실패한 staging의 inactive 이력은 조회 결과에 포함되지 않습니다.

## 학생 식별과 개인정보

현재 실제 Excel에는 학번이 없어 학생은 `입학년도 + 현재 반 + 현재 번호 + 이름`으로 식별합니다. 이름만으로 조회하지 않고 URL에도 개인정보를 넣지 않으며, 학생 API는 자신의 불필요한 external ID를 반환하지 않습니다.

이 방식은 학교 명단을 아는 다른 학생의 대리 조회 위험을 완전히 막지 못합니다. 공개 운영 전 학교가 학생별 PIN 또는 학교 SSO, 재발급 절차, 보유 기간을 결정해야 합니다. 결정 전에는 접근 범위를 학교 내부로 제한하는 것을 권장합니다.

## 과목 설명 PDF

`기준자료 관리`에서 교육기관의 공개 PDF URL을 가져오거나 기기의 PDF 파일을 직접 선택합니다.

1. 공개 HTTPS URL 입력 후 가져오기 또는 PDF 직접 선택
2. 페이지 분석
3. 전체 추출 과목을 10개씩 페이지 이동하며 검수
4. 과목명·교과군·선택 유형·위계·관련 직업·관련 학과 수정
5. 학생 공개 가능/확인 필요 상태 확인
6. 최종 저장

URL 가져오기는 인증된 관리자만 사용할 수 있습니다. 기본적으로 `.go.kr`, `.edu.kr`, `.ac.kr`, `.school.kr`, `.edu` 교육기관 호스트만 허용하며, 추가 호스트는 `PUBLIC_PDF_ALLOWED_HOSTS`에 쉼표로 등록합니다. HTTPS, redirect 3회, 15초 timeout, 20MB streaming 상한, `application/pdf`, `%PDF-` signature를 검사하고 내부 주소·IPv6 literal·인증정보·비표준 port를 차단합니다. redirect 목적지도 같은 allowlist로 다시 검증합니다.

실제 교육청 자료의 1~2쪽 과목 설명 구조를 연결해 추출합니다. 필수 설명이 없는 행은 관리자가 상태를 바꾸더라도 서버에서 `needs_confirmation`으로 유지하며 학생에게 표시하지 않습니다. 중복 과목명과 잘못된 행이 있으면 최종 저장을 차단합니다.

## 과목명 정규화

표시명은 원문을 보존하고 비교 key만 별도로 만듭니다.

- 연속 공백, NFKC 전각 문자, 유니코드 로마 숫자, 중점 표기를 보수적으로 정리
- 괄호 내용은 제거하지 않음
- `/` 선택군은 완전 동일 문자열 외 자동 병합하지 않음
- 단순 유사도 매칭을 하지 않음
- 명확하지 않은 후보는 `확인 필요`

구현은 `lib/domain.mjs`의 `courseMatchKey`, `courseComparisonKey`, `classifyCourseNameMatch`를 사용합니다.

## 진로·학과 과목 점검

학생의 현재 신청 과목과 등록된 기준자료를 비교해 핵심·권장·현재 선택·미선택·학교 미개설 확인 필요 상태를 보여줍니다. 실제 대학/학과 자료가 없으면 “자료 없음 / 담임 확인 필요”로 표시하며 임의 대학 정보를 생성하지 않습니다.

새 기준자료는 교사 화면에서 Excel로 등록합니다. 자동 매칭 결과는 상담 참고용이며 과목 선택이나 제출을 강제하지 않습니다.

## 다음 학년도 운영

1. 교사 상단에서 새 입학년도 입력
2. 학교 교육과정/수강신청 안내와 계열 기준 등록
3. 2-1, 2-2, 이후 3-1, 3-2 실제 결과를 각각 업로드
4. 매 업로드의 반·학년·학기와 학생/과목 수 확인
5. 학생 공개 전 교사 계정으로 학기별 등록 현황과 표본 학생 결과 확인
6. 전체 v2 백업 생성 후 안전한 위치에 보관

3학년 파일 형식은 아직 실제 자료로 확인하지 않았으므로 최초 3-1/3-2 업로드 때 헤더, 집계행, 선택 표시, 복합 선택군을 반드시 미리보기에서 검증하세요.

## 백업·복구

교사 설정에서 `course-planner-backup-v2` JSON을 생성합니다. 인증 해시와 secret은 포함하지 않습니다. v2는 제출 스냅샷, 계열 가이드, 학교 책자, 교육청 과목 자료를 포함합니다. 누락 테이블이 있는 기존 v1 백업은 안전을 위해 미리보기만 가능하고 자동 복구하지 않습니다.

백업 파일에는 학생 개인정보가 있으므로 `test-data/`와 동일한 민감 자료로 취급하고 Git에 올리지 마세요.

## 검사

```powershell
npm test
npm run lint
npm run typecheck
npm run build
# 전체 순차 실행
npm run verify
```

`tests/real-data.test.mjs`는 로컬 `test-data/`가 있을 때 개인정보 값을 출력하지 않고 실제 Excel/PDF 구조를 검증하며, CI처럼 파일이 없으면 해당 테스트를 skip합니다. `tests/public-pdf.test.mjs`는 URL allowlist, 내부 주소·redirect 차단, timeout, streaming 크기 제한, Content-Type/signature, 추출행 공개 판정을 외부 네트워크 없이 검증합니다.

## Cloudflare 공개 배포

`main` push 시 `.github/workflows/ci-deploy.yml`이 test/lint/typecheck/build를 수행합니다. 아래 GitHub `production` environment secrets가 모두 있을 때만 D1 migration과 Worker 배포를 실행하고, 하나라도 없으면 배포를 안전하게 건너뜁니다.

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_D1_DATABASE_ID`
- `ADMIN_PASSWORD`
- `SESSION_SECRET` (32자 이상)
- `PUBLIC_PDF_ALLOWED_HOSTS` (선택, 기본 교육기관 도메인 외 정확한 호스트를 쉼표로 등록)

`wrangler.jsonc`의 database ID는 의도적인 placeholder입니다. CI가 secret으로 `wrangler.deploy.jsonc`를 임시 생성하며 이 파일은 Git에서 제외됩니다. 수동 배포 시에도 실제 ID가 들어간 별도 config를 만들고 커밋하지 마세요.

현재 작업 환경은 `wrangler` 미인증 상태이므로 실제 운영 URL과 원격 D1 migration 상태는 확인하지 못했습니다. Cloudflare 권한 설정 후 첫 배포 전에 기존 운영 DB v2 백업과 migration 이력을 확인하세요.

## 알려진 제한

- 실제 3학년 Excel 미확인
- 학생 PIN/SSO 미구현
- 격리 D1에서 실패 주입을 통한 staging rollback E2E 미실행
- `xlsx@0.18.5`에 수정판 없는 보안 경고가 있어 관리자 전용·크기/행/열 제한으로 완화 중
- 학생/관리자 UI 실제 태블릿·모바일 브라우저 시각 검수 필요
- 큰 단일 client bundle은 후속 code splitting 후보
