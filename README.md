# AngioCAD Clinician Web

의료진용 React 워크스테이션의 첫 구현입니다. Figma의 `고밀도 워크스테이션 v2`를 기준으로 하며 CDSS 배포 API와 비식별 mock 모드를 모두 지원합니다.

## 실행

```bash
pnpm install
pnpm dev
```

## 현재 범위

- 환자·검토 대기 큐와 환자 선택
- 의료진 JWT 로그인 및 세션 스토리지 보관
- 실제 환자 목록, 대시보드 요약, AI 상태, 환자 타임라인 조회
- CAG 예시 뷰어와 AI overlay 토글
- AI 정량 결과와 병변 목록
- 판독 소견 편집 및 확인 체크리스트
- loading/error API 상태를 붙일 수 있는 타입 분리

## API 연결

- API: `https://api.34-50-57-207.sslip.io`
- Swagger: `https://api.34-50-57-207.sslip.io/api/docs/`
- 로컬 개발에서는 `vite.config.ts`의 `/api` 프록시를 사용합니다.
- 액세스 토큰은 `localStorage`가 아닌 현재 탭의 `sessionStorage`에만 보관합니다.
- 실제 계정이 없을 때는 로그인 화면의 mock 버튼으로 UI를 확인할 수 있습니다.

배포된 프런트에서 API 도메인을 직접 호출하려면 백엔드 CORS에 프런트 도메인을 허용하거나, 운영 웹 서버에서 `/api` reverse proxy를 구성해야 합니다.
