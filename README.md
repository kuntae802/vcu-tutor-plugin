# vcu-tutor-plugin

바이브코딩대학 온라인 과정 학습지원 수강생용 튜터 플러그인 마켓플레이스(`vcu-tutor-plugins`)입니다. 홈 강의실에서 본 회차를 Claude Code에서 과외식으로 복습합니다. 지금은 Claude Code만 지원합니다.

## 설치 4단계

1. Claude Code에서 플러그인 저장소를 추가합니다.

   ```
   /plugin marketplace add kuntae802/vcu-tutor-plugin
   ```

2. 플러그인을 설치합니다. 설치 뒤 Claude Code를 다시 열거나 `/reload-plugins`를 실행합니다.

   ```
   /plugin install vcu-tutor@vcu-tutor-plugins
   ```

3. `/mcp`를 열고 목록에서 `plugin:vcu-tutor:tutor`(needs authentication)를 골라 **Authenticate**를 누릅니다. 브라우저가 열리면 바이브코딩대학 홈페이지 계정으로 로그인합니다.
   - 처음 도구를 부를 때 브라우저가 저절로 열리지 않으니 이 단계를 먼저 합니다.
   - 학습지원이 없는 계정이면 브라우저에 안내가 나옵니다. 그때 Claude Code 로그인 창은 닫아도 됩니다.

   진도·확인 문답·질문·메모가 튜터에 남고 담당 조교님과 운영진이 볼 수 있어요.

4. 처음 붙여 넣을 문장입니다.

   ```
   vcu-tutor로 1회차 공부 시작하자
   ```

   튜터 마이페이지의 "튜터로 이어서 공부하기"가 복사해 주는 문장(`vcu-tutor로 <과정 이름표> 이어서 공부하자` 꼴, 예 `vcu-tutor로 2회차 · 크롤러 구축과 WEB의 이해 이어서 공부하자`)을 붙여 넣어도 됩니다.

   공부 중에 Claude Code가 허용 창을 띄우면 다시 묻지 않는 쪽(`Yes, and don't ask again for vcu-tutor:study in …` 또는 `Yes, allow reading from … during this session`)을 고릅니다.

## SSH·원격 환경

SSH·원격 환경에서 브라우저가 열리지 않으면 Claude Code가 보여 주는 로그인 주소를 내 컴퓨터 브라우저에서 열고, 로그인 뒤 주소창의 `http://localhost:…/callback?…` 주소를 통째로 복사해 Claude Code에 붙여 넣습니다.

## 판 올리기

터미널에서 `claude plugin marketplace update vcu-tutor-plugins` 뒤 `claude plugin update vcu-tutor@vcu-tutor-plugins`를 실행합니다. 새 판은 다음 세션부터 쓰입니다(열려 있는 세션은 `/reload-plugins`).

## 시험(고치는 사람만)

저장소 루트에서 `node --test tests/*.test.mjs`
