# vcu-tutor

바이브코딩대학 온라인 과정 복습 튜터 플러그인.

- `.mcp.json`: 튜터 서버(`tutor`)를 OAuth로 연결한다. 토큰을 넣지 않는다 — `/mcp`에서 바이브코딩대학 홈페이지 계정으로 로그인한다. 진도와 학습 기록(확인 문답·내 질문·메모)도 이 연결로 튜터 마이페이지에 남는다.
- `skills/study/`: 과외식 복습 스킬(`/vcu-tutor:study`). 쓰는 튜터 도구 15개(읽기 8개, 진도·기록 7개)를 스킬을 부른 세션 동안 미리 허용해 공부 중에 허용 창이 뜨지 않게 한다.

설치: `/plugin marketplace add kuntae802/vcu-tutor-plugin` 뒤 `/plugin install vcu-tutor@vcu-tutor-plugins`(로그인까지 4단계는 저장소 README).
