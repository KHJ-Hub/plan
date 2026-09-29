# KIRO 작업 보고서

작성일: 2026-09-30
대상: 배정고 수강신청 결과 확인 및 진로 과목 점검 시스템

## 1. 작업 시작 당시 프로젝트 구조

저장소는 Next App Router 호환 Vinext/Vite 앱이었다. `app/`에 학생·교사 UI와 8개 API route, `db/`에 D1/Drizzle schema, `drizzle/`에 0000~0010 SQL, `lib/`에 Excel/PDF/도메인 로직, `tests/`에 8개 Node 단위 테스트가 있었다. `wrangler.jsonc`, Cloudflare Vite plugin, `.openai/hosting.json`이 존재했으며 `legacy/index.html`은 현재 앱과 연결되지 않은 이전 단일 HTML 보관본이었다.

## 2. 발견한 주요 문제

- `test-data/`가 작업 트리 `.gitignore`에만 추가된 상태였으며 우선 추적 여부 확인이 필요했다.
- 공식 결과가 차수 중심으로 노출되고 다중 반 업로드가 부분 성공해도 finalized될 수 있었다.
- 실제 `.xls`에 대한 중복/빈값/집계행/복합 선택군 진단이 부족했다.
- 학생 로그인은 공개적으로 알기 쉬운 4개 개인정보 조합뿐이다.
- 알려진 기본 세션 secret fallback이 있어 운영 토큰 위조 위험이 있었다.
- 실제 교육청 PDF에서 기존 parser 정상 추출이 0건이고 오탐·중복이 발생했다.
- 백업이 제출 스냅샷과 최신 기준자료 테이블을 누락했다.
- GitHub Actions가 없고 D1 ID가 placeholder였다.
- 전체 TypeScript 검사에서 기존 오류 20건이 있었다.
- 실제 3학년 Excel과 실제 대학/학과 요구과목 자료가 없었다.

## 3. 실제 Excel 분석 결과

원본은 설명과 달리 `.xlsx`가 아니라 `.xls` 2개였다. 두 파일 모두 `Sheet1` 하나, 헤더 1행, 데이터 범위 109행이었다. 학생은 각 106명, 6개 반(17·18·18·18·18·17명)이었다. 숨김/빈 행은 없고 병합 셀은 각 5개였다. 학번/외부 ID 열은 없었다. 두 파일의 `반+번호+이름` 106건은 모두 일치했고 동일 반·번호에서 이름이 바뀐 학생은 없었다. 이름만 보면 동명이인 1쌍이 있어 이름 단독 식별은 안전하지 않다.

학생 선택 표시는 모두 영문 `O`였고 학생당 10개였다. 마지막 2개 행은 과목별 집계와 “N개 중 N개 선택” 안내로, 학생 식별값이 없어 제외해야 한다. `/`가 들어간 두 선택군 헤더는 개별 과목을 확정할 수 없다.

## 4. 2-1 / 2-2 구조 비교

| 항목 | 2학년 1학기 | 2학년 2학기 |
|---|---:|---:|
| 전체 열 | 18 | 20 |
| 과목 헤더 | 14 | 16 |
| 학생 | 106 | 106 |
| 학생당 O | 10 | 10 |
| 자동 제외 집계행 | 2 | 2 |

공통 메타 열은 `순번, 반, 번호, 이름`이다. 공통 선택군은 음악/미술 및 정보/일본어 계열이며, 나머지 학기별 과목 구성이 다르다. 두 파일 모두 동일한 parser와 반별 분리 구조로 처리 가능하다.

## 5. 실제 PDF 분석 결과

실제 교육청 PDF는 5.24MB, 243쪽이며 235쪽에 텍스트가 있었다. 과목별 표/일반 텍스트가 섞이고 일부 과목은 2쪽에 걸친다. PDF.js 읽기 순서상 “관련 과목 및 위계/관련 직업” 헤더가 먼저 나오고 셀 본문이 이어져 기존 단순 marker-between 로직이 필드를 섞었다.

개선 전: 후보 150, 고유명 137, 정상 0, 확인 필요 150, 명백한 제목 오탐 16, 중복 13.
개선 후: 고유 과목 114, 정상 85, 확인 필요 29, 제목 오탐 0, 중복 0.

## 6. 선택한 데이터 모델

운영 key는 `입학년도 + 대상 학년 + 대상 학기`다. 내부 파일 교체는 여기에 학생의 현재 반을 더한 scope를 사용한다. 기존 `round_number`는 신청안과 과거 DB 호환을 위해 유지하지만 최신 공식 결과의 교체 key로 쓰지 않는다. 입학년도와 2/3학년·1/2학기는 입력/DB 기반이라 특정 연도에 고정되지 않는다.

## 7. 배포 구조

현재 구조를 유지해 React/Vinext → Cloudflare Worker API → D1로 배포한다. GitHub는 소스 관리와 CI 트리거, Cloudflare는 실제 실행 환경이다. GitHub Pages는 API/D1을 실행할 수 없어 사용하지 않는다.

## 8. 실제 운영 URL 또는 배포 TODO

이 환경은 `npx wrangler whoami` 결과 미인증이며 실제 운영 URL을 확인하지 못했다. `wrangler.jsonc`의 D1 ID도 placeholder다. GitHub secrets와 Cloudflare 권한 설정 후 workflow를 실행해야 한다.

## 9. 변경한 파일

- 보안/배포: `.env.example`, `.gitignore`, `.github/workflows/ci-deploy.yml`, `lib/server.ts`, `package.json`, `package-lock.json`, `vite.config.ts`
- 데이터/API: `app/api/import/route.ts`, `app/api/action/route.ts`, `app/api/auth/route.ts`, `app/api/overview/route.ts`, `app/api/backup/route.ts`, `app/api/education-guide/route.ts`, `db/schema.ts`
- 파서/도메인: `lib/excel.ts`, `lib/excel-logic.mjs`, `lib/excel-logic.d.ts`, `lib/domain.mjs`, `lib/domain.d.ts`, `lib/education-guide-pdf.ts`, `lib/pdf-reader.ts`
- UI: `app/planner-app.tsx`, `app/globals.css`
- 테스트/문서: `tests/domain.test.mjs`, `tests/real-data.test.mjs`, `README.md`, `WORK_PROGRESS.md`, `KIRO_WORK_REPORT.md`

## 10. 구현한 기능

- 실제 `.xls/.xlsx` 중앙 컬럼 매핑과 상세 검증
- 전교생 통합 파일 반별 분리
- 최신 학기 결과 staging/원자적 활성화
- 관리자 업로드 미리보기·변경 요약·교체 확인
- 4학기 학생 결과 흐름과 미등록 상태
- 진로 권장과목 충족/부족/확인 필요 표시
- 보수적 과목명 비교
- 실제 PDF의 1~2쪽 과목 설명 추출
- 확인 필요 PDF 자료 학생 비노출
- 관리자 학기별 데이터 등록 현황
- 전체 backup v2와 위험한 v1 복구 차단
- fail-closed 세션 secret
- CI 검사와 조건부 Cloudflare 배포

## 11. Excel importer 구조

브라우저가 파일 bytes를 읽고 SHA-256 checksum을 계산한다. `officialColumnMappings`가 메타 열 별칭을 판별하고, `parseOfficialRows`가 헤더, 과목 열, 학생, 제외 행, 중복, 지원하지 않는 표시, 복합 선택군을 진단한다. 관리자가 반·학년·학기를 확인한 정규화 JSON만 관리자 API로 보낸다. 서버는 같은 규칙을 다시 검증하고 허용 범위(학생 1,000명/반, 과목 200열)를 확인한다. 클라이언트 파일 자체는 서버나 외부 서비스로 업로드하지 않는다.

## 12. 최신 결과 교체 방식

1. 전체 요청 검증
2. 현재 active scope와 checksum 조회
3. 교체 동의 확인
4. 새 파일/결과를 `active=0`으로 staging
5. 모든 staging 성공 확인
6. 한 D1 batch에서 기존 동일 scope active 해제
7. 새 staging 활성화 및 감사 로그 기록

staging/activation 실패 시 기존 active 결과는 유지된다. inactive staging은 학생 조회에 포함되지 않는다. 격리 D1 failure injection E2E는 실행하지 못했으므로 후속 테스트가 필요하다.

## 13. 학생 결과 화면 구조

첫 화면에 등록 학기 수, 신청 과목 수, 진로 과목 상태, 확인할 내용 수를 표시한다. 그 아래 2-1→2-2→3-1→3-2 흐름과 과목 카드를 보여주며, 없는 학기는 오류 대신 미등록 메시지를 표시한다. 과목 설명, 핵심/권장 배지, 복합 선택군 확인 필요를 함께 제공한다.

## 14. 학생 식별 방식

현재는 실제 파일에 학번이 없어 `입학년도+반+번호+이름`이다. 이름만 조회하지 않고 URL parameter를 쓰지 않으며 학생 API에서 external ID를 제거했다. 다만 동급생의 대리 조회 위험이 남아 있으므로 공개 운영 전 PIN 또는 학교 SSO 정책 결정이 필요하다.

## 15. 과목명 정규화 방식

표시 문자열은 원문을 유지한다. 비교 key에는 연속 공백, NFKC, 로마 숫자/전각 표기, 중점만 정리한다. 괄호 내용은 보존하고 유사도 비교는 하지 않는다. `/` 선택군은 exact 문자열 외 매칭하지 않는다. normalized 후보는 자동 적용하지 않고 확인 필요로 남긴다.

## 16. PDF 과목 설명 처리 방식

PDF.js가 브라우저에서 페이지 text item과 y좌표를 읽는다. 첫 과목 페이지의 고유 표 머리글과 중복 타이틀 패턴을 확인하고 필요하면 다음 쪽을 연결한다. 관련 과목/위계와 직업/학과를 실제 줄 순서로 분리한다. 정상(`ok`) 자료만 학생 overview에 합치며 `needs_confirmation`은 관리자 자료로 보존한다. 파일 상한은 20MB이고 `%PDF-` magic을 검사한다.

## 17. 진로/학과 비교 구조

등록된 학교 계열 가이드, 학교 책자 우선 기준, 대학 핵심/권장과목을 학생 선택 집합과 비교한다. 정확 대학+학과 자료를 우선하고 없으면 기존 fallback을 참고로 표시한다. 실제 기준자료가 없으면 자료 없음으로 안내한다. 실제 대학 정보를 임의 생성하지 않았다.

## 18. 관리자 기능

- 입학년도 선택
- 2-1/2-2/3-1/3-2 등록 상태
- 반 수, 학생 수, 최대 과목 수, 최근 업로드, 원본명
- Excel 검사·미리보기·교체 동의·최종 반영
- PDF 분석 결과와 정상/확인 필요 상태
- 신청안 필터·수정 요청
- 기준자료 관리
- v2 백업/복구

전체 데이터 초기화는 실수 위험이 커 별도 버튼을 추가하지 않았다. 검증된 새 자료 교체와 백업/복구를 사용한다.

## 19. 테스트 결과

`npm run verify` 성공:

- Node test 14/14 통과
- 실제 Excel 2개: 각 106명, 과목 열 14/16, 제외행 각 2, 학생당 선택 10
- 실제 PDF: 243쪽, 고유 과목 114, 정상 85, 확인 필요 29
- oxlint: 경고/오류 없음
- TypeScript: 오류 없음
- production build: 성공

실제 자료가 없는 CI에서는 실제 자료 테스트만 skip한다. 실제 브라우저 PC/태블릿/모바일 시각 검수와 관리자 API+D1 E2E는 수행하지 못했다.

## 20. 보안 점검 결과

- 세션 secret 기본 fallback 제거, 32자 미만 fail-closed
- 학생 API 반환 필드 최소화
- 학생 savePlan 서버측 개설과목 검증
- Excel/PDF 크기·구조 제한
- 실제 자료/파생물 외부 전송 없음
- backup v2 누락 테이블 보완
- 의존성 갱신으로 audit 12건(고위험 11) → 5건(중간 4, 고위험 1)

남은 고위험은 수정판 없는 `xlsx@0.18.5`다. 실제 `.xls` 지원을 위해 유지했으며 관리자 전용, 10MB/5,000행/300열 제한으로 완화했다.

## 21. 실제 자료가 Git에서 제외되어 있는지

`.gitignore`에 `test-data/`가 있다. `git check-ignore`로 `.xls`, `.xlsx`, `.pdf` 패턴이 적용됨을 확인했고 `git ls-files -- test-data/**` 결과는 0건이다. 임시 `work/` 분석 스크립트는 삭제했으며 개인정보 파생 파일을 만들지 않았다.

## 22. 실제 3학년 파일을 받으면 확인할 사항

시트명/개수, 헤더 위치/별칭, 학번 유무, 반·번호 체계, 선택 표시, 학생/과목 수, 집계행, 병합/숨김, 복합 선택군, 3-1/3-2 구조 차이, 2학년 파일과 학생 식별 연속성을 확인한다. 최초 업로드는 staging 미리보기와 표본 학생 결과를 교사가 수동 검증한다.

## 23. 실제 진로/대학 자료를 받으면 할 작업

기준연도, 출처, 대학/학과명 표기, 핵심/권장 구분, 과목명 매칭 상태를 미리보기한다. exact만 자동 연결하고 normalized/유사 후보는 관리자 확인 대상으로 남긴다. 샘플/임의 정보는 운영 데이터에 넣지 않는다.

## 24. 사용자가 직접 해야 하는 외부 설정

1. Cloudflare D1 생성 또는 기존 D1 확인
2. 원격 0000~0010 migration 이력 확인과 백업
3. GitHub `production` environment에 `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_D1_DATABASE_ID`, `ADMIN_PASSWORD`, `SESSION_SECRET` 등록
4. main push 후 Actions 결과와 Worker URL 확인
5. 학생 PIN/SSO와 개인정보 보유 정책 결정
6. 실제 태블릿/모바일에서 학생·교사 흐름 수동 검수

## 25. 아직 구현하지 못한 기능

- 공개 PDF URL 서버 가져오기
- 학생별 PIN/SSO, 로그인 rate limiting
- 교사별 계정/RBAC
- 실제 3학년 parser 검증
- 실제 대학/학과 원본 적용
- 관리자 추출행 전체 pagination 검수
- 공식 결과 DB failure injection 통합 테스트
- 데이터 초기화 UI

## 26. 현재 알려진 위험요소

- 학생 4개 정보 로그인은 대리 조회 위험이 있다.
- `xlsx` 수정판 없는 취약점이 남아 있다.
- 로컬 D1에서 0003~0010이 pending이고 원격 적용 상태는 모른다.
- active scope DB unique constraint는 없고 애플리케이션 batch 전환에 의존한다.
- 실패한 inactive staging과 새 학생 row 정리 정책이 필요하다.
- client bundle 약 931KB와 PDF worker 약 2.1MB로 code splitting 여지가 있다.
- 관리자 overview가 입학년도 전체 데이터를 한 번에 반환해 장기적으로 pagination이 필요하다.
- 실제 브라우저 시각/E2E 검증이 남았다.

## 27. 다음 작업 우선순위

1. Cloudflare/D1 백업·migration·Secrets 설정 후 CI 배포 검증
2. 학생 PIN 또는 SSO 정책 확정·구현
3. 격리 D1에서 최신 결과 재업로드/실패 주입/동시성 테스트
4. 실제 태블릿·모바일 학생 전체 흐름 검수
5. 실제 3학년 Excel 검증
6. 실제 대학/학과 자료 등록과 교사 매칭 검수
7. `xlsx` 대체 가능성 및 client code splitting 검토
8. PDF URL import는 SSRF/크기/redirect 정책과 함께 구현

## 28. 주요 commit hash

- `7907247` — `feat: add safe latest result import`
- `cd21f54` — `feat: improve student results and course guidance`
- `24f53aa` — `ops: harden deployment and backups`
- `d4008a7` — `test: add real data import regressions`
- `3e7ba90` — `docs: document school operations and findings`

이 커밋들은 로컬 `main`에 생성했으며 자동/수동 push는 수행하지 않았다.
