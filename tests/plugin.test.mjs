// 플러그인 문장·설정 점검 — 저장소 루트에서 `node --test tests/*.test.mjs`. 플러그인을 쓰는 데는 Node 가 필요 없다(고치는 사람만 돌린다).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = path.join(ROOT, "plugin", "vcu-tutor");
const S = path.join(P, "skills", "study");
const read = (p) => fs.readFileSync(p, "utf8");
const json = (p) => JSON.parse(read(p));

const READ_TOOLS = ["list_folders", "list_items", "get_item", "get_index", "get_text", "search", "concepts", "get_outline"];
const STUDY_TOOLS = ["study_progress", "study_start", "study_set_unit", "study_set_practice", "study_set_mode", "study_record", "study_review_clear"];
const ALL = [...READ_TOOLS, ...STUDY_TOOLS];
const SKILL_FILES = ["SKILL.md", "modes.md", "practice.md"];
// 스킬 폴더 파일 읽기만 좁혀 허용한다(스킬이 켜진 응답 한정 — Claude Code 의 allowed-tools 는 그 턴에만 먹는다). 범위 없는 Read 는 넣지 않는다
const READ_RULES = ["Read(/${CLAUDE_SKILL_DIR}/**)", "Read(~/.claude/plugins/cache/vcu-tutor-plugins/**)"];

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(m, "SKILL.md 머리(---)가 없습니다");
  return m[1];
}

// allowed-tools 는 YAML 목록(두 칸 들여 쓴 `- 이름`)으로 쓴다는 약속까지 같이 본다
function allowedTools(fm) {
  const lines = fm.split("\n");
  const i = lines.indexOf("allowed-tools:");
  assert.ok(i >= 0, "allowed-tools: 줄이 없습니다");
  const out = [];
  for (const l of lines.slice(i + 1)) {
    const m = l.match(/^  - (\S+)$/);
    if (!m) break;
    out.push(m[1]);
  }
  return out;
}

// 머리 칸 한 줄(`    - matcher: "…"`)의 YAML 큰따옴표 값을 푼다 — YAML 해석기가 없으니 줄을 정확히 읽고, 이스케이프는 JSON 문자열 규칙으로 푼다
// (YAML 큰따옴표 이스케이프 가운데 JSON 과 같은 것만 쓴다는 약속 — 다른 이스케이프면 JSON.parse 가 던져 시험이 깨진다)
function matcherRegex(fm) {
  const lines = fm.split("\n").filter((l) => /^\s+- matcher: /.test(l));
  assert.equal(lines.length, 1, "PreToolUse matcher 줄이 하나가 아닙니다");
  const m = lines[0].match(/^\s+- matcher: ("(?:[^"\\]|\\.)*")$/);
  assert.ok(m, "matcher 는 큰따옴표 한 값이어야 합니다");
  return new RegExp(JSON.parse(m[1]));
}

// hook 의 args 줄(`args: ["%s", '<JSON>']`)에서 printf 가 그대로 내보낼 JSON 을 꺼낸다 — YAML 작은따옴표 안의 '' 는 ' 하나다
function hookOutput(fm) {
  const lines = fm.split("\n").filter((l) => /^\s+args: /.test(l));
  assert.equal(lines.length, 1, "hook args 줄이 하나가 아닙니다");
  const m = lines[0].match(/^\s+args: \["%s", '((?:[^']|'')*)'\]$/);
  assert.ok(m, "args 는 [\"%s\", '<JSON>'] 꼴이어야 합니다");
  return JSON.parse(m[1].replaceAll("''", "'"));
}

// 플러그인 도구 이름 앞부분 = mcp__plugin_<플러그인 이름>_<서버 이름>__ (manifest·.mcp.json 에서 만든다)
function prefix() {
  const name = json(path.join(P, ".claude-plugin", "plugin.json")).name;
  const servers = Object.keys(json(path.join(P, ".mcp.json")).mcpServers);
  assert.deepEqual(servers, ["tutor"]);
  return `mcp__plugin_${name}_${servers[0]}__`;
}

test("manifest·연결 = 튜터 OAuth 한 줄, 토큰·사용자 설정·Codex 없음", () => {
  const m = json(path.join(ROOT, ".claude-plugin", "marketplace.json"));
  assert.equal(m.name, "vcu-tutor-plugins");
  assert.deepEqual(m.plugins.map((p) => [p.name, p.source]), [["vcu-tutor", "./plugin/vcu-tutor"]]);
  const pj = json(path.join(P, ".claude-plugin", "plugin.json"));
  assert.equal(pj.name, "vcu-tutor");
  assert.match(pj.version, /^\d+\.\d+\.\d+$/);
  assert.equal(pj.userConfig, undefined);
  assert.deepEqual(Object.keys(pj.hooks ?? {}), ["PreToolUse"], "plugin.json hooks 는 PreToolUse 하나만");
  assert.deepEqual(json(path.join(P, ".mcp.json")),
    { mcpServers: { tutor: { type: "http", url: "https://lab.vibecoding-univ.com/tutor/mcp", oauth: { clientId: "vcu-tutor" } } } });
  for (const p of [path.join(ROOT, ".agents"), path.join(P, ".codex-plugin")]) assert.ok(!fs.existsSync(p), `${p} 가 남았습니다`);
});

const SAVED_NOTE = "진도·확인 문답·질문·메모가 튜터에 남고 담당 조교님과 운영진이 볼 수 있어요";   // 첫 연결 안내(★ 판단 기록) — README·스킬 같은 글자
// 튜터 웹이 내미는 두 문장(웹 lib/plugin.ts FIRST_SENTENCE · lib/study.ts tutorSentence) — 스킬 트리거·README 가 같은 글자를 받는다
const FIRST_SENTENCE = "vcu-tutor로 1회차 공부 시작하자";
const MYPAGE_SENTENCE = "vcu-tutor로 <과정 이름표> 이어서 공부하자";
const MYPAGE_EXAMPLE = "vcu-tutor로 2회차 · 크롤러 구축과 WEB의 이해 이어서 공부하자";   // 마이페이지가 실제로 복사해 주는 글자(2회차 과정 이름표)

test("스킬 문서에 운영진·뷰어·가져오기·논문 전제가 없다", () => {
  const BANNED = ["study_import", "progress.json", "예전 진도", "구간 주소", "`anchor`", "`url`", "/f/", "브라우저에서 열어", "아카이브",
    "internal_study", "internal-study", "운영진", "토큰", "논문", "papers/", "#p", "Codex", "$study"];
  for (const f of SKILL_FILES) {
    const t = read(path.join(S, f)).replaceAll(SAVED_NOTE, "");      // 보는 사람 안내 한 줄만 "운영진"을 쓴다
    for (const bad of BANNED) assert.ok(!t.includes(bad), `${f} 에 ${bad}`);
  }
});

test("수강생에게 보이는 안내에 자료 slug·id 를 내지 않는다 — 이름표로", () => {
  const skill = read(path.join(S, "SKILL.md"));
  const memo = skill.split("\n").filter((l) => l.includes("메모로 남겼습니다"));
  assert.equal(memo.length, 1, "메모 알림 줄이 하나가 아닙니다");
  assert.ok(memo[0].includes('`메모로 남겼습니다 — <이름표>: "<메모 글 앞 40자>…"`') && memo[0].includes("`study_record` 결과의 `label`"), memo[0]);
  assert.ok(!/<자료 slug>|<구간>/.test(memo[0]), memo[0]);
  // 수강생에게 보이는 글에 자료·차시·폴더 id, slug, 구간 번호를 내지 않는다. 도구 호출식(`study_progress(<폴더 id>)` 처럼 도구 이름 뒤 괄호)은 걷어 낸다.
  // a) 문장 꼴 — "옆에 폴더 id", "폴더 id를 보여 준다", "폴더 id로 가른다", "slug를 알린다"
  const PHRASE = [/옆에\s*(폴더|차시|자료)?\s*id/, /(폴더|차시|자료)?\s*id(\(`[^`]*`\))?[를을]?\s*(같이\s*)?(보여|보이|알려|말해|말한)/,
    /(폴더|차시|자료)\s*id로\s*가른/, /slug[를을]?\s*(같이\s*)?(보여|보이|알려|말해|말한)/,
    /\d+-\d+-\d+\s*(번\s*)?차시/, /차시\s*\d+-\d+-\d+/];                     // "1-1-0 차시는 마쳤습니다"(lab 끝단 실측) 같은 꼴
  // b) 보여 주는 꼴 — 따옴표·백틱·「」 안에 한글 글과 함께 든 id·slug·구간 자리표시(`<차시 id> 실습 <번호>`)나 날 slug(1-3-2).
  //    자리표시만 있는 것(`<차시 id>`는 …, `<공부 폴더>/<자료 slug>/` 디스크 폴더 이름)은 도구 인자·폴더 이름이라 보지 않는다
  const HIDDEN = /<[^>\n]*(\bid|slug|구간 번호)>|<구간>|(?<![\w/-])\d+-\d+-\d+(?![\w-])/;
  for (const f of SKILL_FILES) {
    const text = read(path.join(S, f)).replace(new RegExp(`(${ALL.join("|")})\\([^()\\n]*\\)`, "g"), "CALL");   // 백틱 짝이 어긋나지 않게 자리만 남긴다
    for (const re of PHRASE) {
      const m = text.match(re);
      assert.equal(m, null, `${f} 에 id·slug 를 보이는 문장: …${m && text.slice(Math.max(0, m.index - 40), m.index + 40)}…`);
    }
    for (const span of text.match(/`[^`\n]+`|"[^"\n]+"|「[^」\n]+」/g) ?? []) {
      const shown = HIDDEN.test(span) && /[가-힣]/.test(span.replace(/<[^>\n]*>/g, ""));
      assert.ok(!shown, `${f} 에 id·slug·구간 번호를 보여 주는 꼴: ${span}`);
    }
  }
  assert.ok(skill.includes("**차시·자료는 이름표나 제목으로만 말한다.**"), "늘 지킬 것에 이름표로만 말하기 규칙이 없습니다");
  assert.ok(skill.includes("번호를 떼고 말한다"), "번호로 시작하는 차시 제목 규칙이 없습니다");
  // 연결(relations·builds_on)의 target 은 자료 id — 말할 때는 get_item 의 이름표로
  assert.ok(skill.includes("`get_item(<target>)`의 `label`"), "연결 자료를 이름표로 말하는 규칙이 없습니다");
});

test("홈 강의실 이름표·권장 흐름·연결 안내 문장이 있다", () => {
  const skill = read(path.join(S, "SKILL.md"));
  for (const s of ["**영상은 홈 강의실에서 먼저 본다.**", "## 강의실 이름표", "도구 결과의 `label`만 쓴다", "회차는 `label`의 것을 쓴다",
    "`/mcp`를 열어 `tutor` 서버에 로그인해 주세요", "/vcu-tutor:study", SAVED_NOTE]) assert.ok(skill.includes(s), `SKILL.md 에 없는 문장: ${s}`);
  assert.ok(read(path.join(S, "practice.md")).includes("튜터에는 파일을 내려받는 곳이 없다"));
});

test("README 설치 4단계와 원격 한 줄", () => {
  const r = read(path.join(ROOT, "README.md"));
  // 2·3단계의 명령·서버 이름·단추 = 튜터 웹 lib/plugin.ts(PLUGIN_RELOAD·PLUGIN_MCP_SERVER·PLUGIN_MCP_AUTH)와 같은 글자 — 웹 lib/plugin.test.ts 가 저쪽을 묶는다
  for (const s of ["설치 뒤 Claude Code를 다시 열거나 `/reload-plugins`를 실행합니다.",
    "`/mcp`를 열고 목록에서 `plugin:vcu-tutor:tutor`(needs authentication)를 골라 **Authenticate**를 누릅니다."])
    assert.ok(r.includes(s), `README 에 없는 문장: ${s}`);
  for (const s of ["/plugin marketplace add kuntae802/vcu-tutor-plugin", "/plugin install vcu-tutor@vcu-tutor-plugins", "`/mcp`",
    "vcu-tutor로 1회차 공부 시작하자", SAVED_NOTE, "localhost",                // 첫 문장 = 웹 Task 9 FIRST_SENTENCE 와 같은 글자
    "튜터로 이어서 공부하기", MYPAGE_SENTENCE, MYPAGE_EXAMPLE,                    // 마이페이지 단추와 그 단추가 복사해 주는 꼴(웹 tutorSentence)
    "공부 중에 Claude Code가 허용 창을 띄우면 다시 묻지 않는 쪽(`Yes, and don't ask again for vcu-tutor:study in …` 또는 `Yes, allow reading from … during this session`)을 고릅니다."])   // 실제 허용 창의 선택지 글자
    assert.ok(r.includes(s), `README 에 없는 문장: ${s}`);
});

test("허용 도구 칸 = 읽기 8 + study_* 7(플러그인 연결 이름 꼴) + 스킬 폴더로 좁힌 Read 둘", () => {
  const got = allowedTools(frontmatter(read(path.join(S, "SKILL.md"))));
  assert.equal(new Set(got).size, got.length, "같은 도구가 두 번 있습니다");
  assert.deepEqual(got.filter((t) => t.startsWith("mcp__")).sort(), ALL.map((t) => prefix() + t).sort());
  assert.deepEqual(got.filter((t) => !t.startsWith("mcp__")), READ_RULES, "MCP 도구 밖 허용은 좁힌 Read 둘뿐이어야 합니다");
  const skill = read(path.join(S, "SKILL.md"));
  assert.ok(skill.includes("이 스킬이 켜진 그 응답에서 [modes.md](modes.md)와 [practice.md](practice.md)를"), "보조 파일을 스킬이 켜진 응답에서 읽는 규칙이 없습니다");
});

test("플러그인 Skill 훅은 vcu-tutor:study 일 때만 allow 를 내고 늘 0 으로 끝난다", () => {
  const h = json(path.join(P, ".claude-plugin", "plugin.json")).hooks.PreToolUse;
  assert.equal(h.length, 1);
  assert.equal(h[0].matcher, "^Skill$");
  assert.equal(h[0].hooks.length, 1);
  const cmd = h[0].hooks[0].command;
  const run = (skill, args = "x") => execFileSync("bash", ["-c", cmd], { input: JSON.stringify({ tool_name: "Skill", tool_input: { skill, args } }), encoding: "utf8" });
  const out = JSON.parse(run("vcu-tutor:study")).hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.equal(out.permissionDecision, "allow");
  for (const other of ["superpowers:brainstorming", "vcu-tutor:study-x", "study"]) assert.equal(run(other), "", `${other} 까지 허용합니다`);
  assert.equal(run("other", '"skill":"vcu-tutor:study"'), "", "args 안의 글자로 허용합니다");   // JSON 이스케이프로 \" 가 붙어 맞지 않아야
});

test("허용 hook 은 같은 15개 도구에만 걸리고 allow 를 낸다", () => {
  const fm = frontmatter(read(path.join(S, "SKILL.md")));
  const re = matcherRegex(fm);
  for (const t of ALL) assert.ok(re.test(prefix() + t), `${t} 가 맞지 않습니다`);
  const BLOCKED = ["create_item", "submit_generated", "submit_outline", "submit_translation", "get_refine_brief", "get_translation_part",
    "get_outline_brief", "get_translation_brief", "study_import"];
  for (const t of BLOCKED) assert.ok(!re.test(prefix() + t), `${t} 까지 허용합니다`);
  assert.ok(!re.test("mcp__internal-study__study_record"), "플러그인 밖 연결까지 허용합니다");
  assert.ok(!re.test("mcp__plugin_internal-study_archive__study_record"), "다른 플러그인 연결까지 허용합니다");
  assert.ok(fm.includes("PreToolUse:"));
  assert.ok(fm.includes("command: printf"));
  const out = hookOutput(fm).hookSpecificOutput;
  assert.equal(out.hookEventName, "PreToolUse");
  assert.equal(out.permissionDecision, "allow");
});

test("스킬 문서가 부르는 study_* 는 허용 칸의 7개뿐이고 7개 모두 문서에 나온다", () => {
  const body = SKILL_FILES.map((f) => read(path.join(S, f))).join("\n");
  // 앞에 글자·밑줄·붙임표가 붙은 것(`vcu-tutor_tutor` 접두사 등)은 도구 이름이 아니다
  const used = new Set(body.match(/(?<![\w-])study_[a-z_]+/g) ?? []);
  for (const t of used) assert.ok(STUDY_TOOLS.includes(t), `허용 칸에 없는 도구: ${t}`);
  for (const t of STUDY_TOOLS) assert.ok(used.has(t), `문서에 안 나오는 도구: ${t}`);
});

test("옛 진도 스크립트·Node 점검·세션 시작 hook 이 남지 않았다", () => {
  assert.ok(!fs.existsSync(path.join(S, "scripts")), "skills/study/scripts 가 남았습니다");
  assert.ok(!fs.existsSync(path.join(S, "tests")), "skills/study/tests 가 남았습니다");
  assert.ok(!fs.existsSync(path.join(P, "hooks")), "hooks/ 가 남았습니다");
  const OLD = ["progress.mjs", "node --version", 'node "$SKILL', "--dir", "--section", "--note", "set --unit", "practice --unit", "mode --mode", "show --skipped", "`show`", "진도 스크립트"];
  for (const f of SKILL_FILES) {
    const t = read(path.join(S, f));
    for (const bad of OLD) assert.ok(!t.includes(bad), `${f} 에 옛 낱말 ${bad}`);
  }
});

test("튜터 웹이 내미는 두 문장 꼴(첫 문장·마이페이지 복사)이 트리거에 있다", () => {
  const skill = read(path.join(S, "SKILL.md"));
  const fm = frontmatter(skill);
  const desc = fm.split("\n").find((l) => l.startsWith("description: ")).slice("description: ".length);
  // description 은 스킬 허용 창에 그대로 보인다(꺾쇠는 &lt; &gt; 로 찍힌다) — 자리표시 없이 실제 문장으로
  for (const s of ["'이어서 공부하자'", `'${FIRST_SENTENCE}'`, `'${MYPAGE_EXAMPLE}'`]) assert.ok(desc.includes(s), `description 에 없는 꼴: ${s}`);
  assert.ok(!/[<>]/.test(desc), "description 에 꺾쇠 자리표시가 있습니다");
  assert.ok(!/: /.test(desc), "description 값에 쌍점+빈칸이 있습니다(YAML 평문 값이 깨진다)");
  assert.ok(skill.includes("「<과정 이름> 이어서 공부하자」"));
  assert.ok(skill.includes(`「${MYPAGE_SENTENCE}」`));
  assert.ok(skill.includes(`「${FIRST_SENTENCE}」`));
  assert.ok(skill.includes("「vcu-tutor로」"), "앞에 붙은 「vcu-tutor로」를 떼는 규칙이 없습니다");
});

test("물은 응답은 거기서 끝내고 답을 기다린다", () => {
  // lab 끝단 실측(2026-11-11): 영상 봤는지 묻고 → 전달 → "질문 있으세요?" → 확인 문항까지 한 응답에 쏟았다
  const skill = read(path.join(S, "SKILL.md"));
  for (const s of ["**물은 응답은 거기서 끝낸다.**", "**물으면 답을 기다린다.**", "확인 문항은 하나를 내고 답을 기다린다", "묻고 그 응답을 끝낸다",
    "먼저 보셨는지 묻고 그 응답을 끝낸다"]) assert.ok(skill.includes(s), `SKILL.md 에 없는 문장: ${s}`);
  assert.ok(!skill.includes("사용자가 멈추자고 하지 않으면 다음으로 이어 간다"), "짧은 쉼이 아직 묻고 이어 갑니다");
});

test("기록 규칙의 핵심 문장이 있다", () => {
  const skill = read(path.join(S, "SKILL.md"));
  for (const s of ["**기록은 말한 그대로 남긴다.**", "**말한 그대로 남긴다.**", "**기록은 진도가 아니다.**", "다시 볼 것 표시를 풀까요?", "공부는 이어 갑니다.", "메모로 남겼습니다 — "]) {
    assert.ok(skill.includes(s), `없는 문장: ${s}`);
  }
});

test("서버 진도의 새 꼴(resume·창·잘린 기록·자료 제목)을 문장이 쓴다", () => {
  const skill = read(path.join(S, "SKILL.md"));
  const practice = read(path.join(S, "practice.md"));
  const MUST = [
    "`resume`이 이어 갈 차시다",                    // 다음 할 곳 = 서버 resume(웹 '이어서 공부하기'와 같은 차시)
    "`resume.stopped`",
    "`counts.done == counts.total`",
    "`unit_offset`을 0·30·60…으로 넘겨 가며",        // 창 밖 차시 찾기
    "`unit_offset=<ord>`",
    "`truncated: true`",                             // 잘린 다시 볼 것·메모
    "같은 뜻의 질문을 새로 만들어",
    "`item_title`",                                  // 자료 제목 칸
    "화면에 내지 않을 글을 기록에만 쓰지 않고",       // 기록 = 화면에 낼 글(시범 실측: 기록에만 있는 해설)
    "번호 머리(\"질문 1.\")와 굵게 표시",           // 웹 기록 제목이 "질문 1." 이 되지 않게(시범 실측)                         // 작업 폴더 밖 Read 는 허용 창(시범 실측)
    "`courses`",
  ];
  for (const s of MUST) assert.ok(skill.includes(s), `SKILL.md 에 없는 문장: ${s}`);
  assert.ok(practice.includes("`unit_offset`을 0·30·60…으로 넘겨 가며"), "practice.md builds_on 이 창 밖 차시를 찾지 않습니다");
  assert.ok(!skill.includes("`units`에서 `last_unit`의 차시를 찾는다"), "다음 할 곳이 아직 last_unit 으로 찾습니다");
  assert.ok(!skill.includes("상위 폴더로 올라가며"), "예전 진도 파일을 상위 폴더까지 찾습니다(작업 폴더 밖 허용 창)");
});

test("한 응답 안의 순서 — 도구는 먼저 다, 답은 맨 끝에 한 번 다", () => {
  // 공부 시범 실측(2026-11-09, 0.2.0): 답 → study_record → 같은 답을 요약해 다시 써서 화면에 답이 두 번 나갔다(세 턴 연속).
  // 공부 시범 실측(2026-11-10, 0.2.1): 진도 → study_record(해설은 기록 칸에만) → "기록 뒤 글 금지"라 화면에 해설이 안 나갔다.
  // 두 번 다 튜터는 "도구 먼저, 글은 맨 끝"으로 움직였다 — 그 결에 맞춰 기록까지 먼저 부르고 해설은 맨 끝에 다 쓴다.
  const skill = read(path.join(S, "SKILL.md"));
  const practice = read(path.join(S, "practice.md"));
  for (const s of [
    "**한 응답 안의 순서 — 답은 한 번만 쓴다.**",
    "답보다 먼저 부른다",                              // 진도 쓰기·읽기는 앞
    "학습 기록(`study_record`)까지 모두 답보다 먼저 부른다",
    "해설을 줄이려는 것이 아니다",                     // 0.2.1 에서 해설이 사라진 것을 막는 의도 문장
    "기록에 넣은 글 그대로 줄이지 않고 다 쓴다",
    "답을 쓴 뒤에는 도구를 부르지 않는다",
    "**기록 = 화면에 낼 글.**",
    "그 문답을 확인 문답으로 먼저 남기고",
    "그 줄에는 답·해설·맞고 틀림을 쓰지 않는다",       // 도구 앞 한 줄 알림에 평가를 넣으면 평가가 두 번 나간다
    "그 구간을 마치는 응답에서 글보다 먼저 부른다",
    "`question`은 사용자가 이번에 답한 질문이다",
    "해설 뒤에 이어 쓰는 다음 질문·다음 구간 설명·닫기 정리는 넣지 않는다", // 다음 글을 기록 앞에 쓰므로 explanation 에서 뗀다
    "답 뒤에 이어 쓰는 전달·다음 질문은 넣지 않는다",
    "그 말 바로 앞 응답의 네 글(전달·답·해설) 그대로다",
    "실패 알림은 무엇이 실패했든 그 응답 맨 끝 글의 첫머리에 쓰고",
    "결과 한 줄로 그 응답을 끝낸다. 해설·다음 질문은 다시 쓰지 않는다", // "다시 남겨 줘"
    "도구에 넣은 글은 사용자에게 답으로 보이지 않는다", // 0.2.1 착각(기록에 넣었으니 말한 셈)의 뿌리
    "학습 기록은 도구 가운데 맨 나중에",              // 검색·원문을 다 읽은 뒤 기록을 짓는다
    "\"기록해 두었습니다\" 같은 말로 해설을 대신하지 않는다",
    "화면에 글이 없다는 알림이 오면 기록을 다시 부르지 말고",
    "앞 응답에서 이미 화면에 낸 글을 남기는 기록",   // 메모·다시 남겨 줘는 다시 쓰지 않는다
    "해설의 길이는 모드가 정한다",
    "새 질문 기록으로 먼저 남기고",                   // 다시 볼 것 — 내 질문
    "질문 기록을 먼저 남기고 답한다",
    "**따로 묻거나 메모를 부탁한 응답은 그 답에서 끝낸다.**", // 이어 가면 되돌아보기·기록 경계가 한 응답에서 엉킨다(사용자 확정 11-10)
    "같은 응답에서 다음 구간으로 넘어가지 않는다",
  ]) assert.ok(skill.includes(s), `SKILL.md 에 없는 문장: ${s}`);
  const modes = read(path.join(S, "modes.md"));
  assert.ok(!skill.includes("바로 따르고, `study_set_mode"), "SKILL.md 모드 바꾸기가 아직 글 뒤에 진도를 씁니다");
  assert.ok(!modes.includes("바로 따르고 `study_set_mode"), "modes.md 모드 바꾸기가 아직 글 뒤에 진도를 씁니다");
  assert.ok(modes.includes("그 응답에서 글보다 먼저 `study_set_mode"), "modes.md 모드 바꾸기에 순서 문장이 없습니다");
  assert.ok(practice.includes("남기는 응답에서 글보다 먼저 부른다"), "practice.md 실습 진도에 순서 문장이 없습니다");
  assert.ok(practice.includes("끝나는 응답에서 글보다 먼저 `done`이나 `changed`"), "건너뛴 실습 다시 하기에 순서 문장이 없습니다");
  const open = skill.indexOf('`study_set_unit(<차시 id>, "doing")`을 먼저 부른다');
  const last = skill.indexOf("- 지난 위치를 확인한다.");
  assert.ok(open > 0 && open < last, "열기에서 doing 쓰기가 말하기보다 뒤에 있습니다");
  assert.ok(!skill.includes("다음 질문으로 가기 전에 그 문답을"), "확인 단계가 아직 기록 뒤에 다음 질문을 씁니다");
  const all = skill + practice + modes;
  for (const old of [
    "화면에 먼저, 기록은 그 뒤에", "기록이 돌아온 뒤에는 화면에 글을 더 내지 않는다", "응답 맨 끝에 부른다", "응답 맨 끝에 그 문답을", "응답 맨 끝에 새 확인 문답으로", // 0.2.1 — 해설이 사라진 순서
    "기록 뒤에 다음 질문을 쓰지 않는다", "`study_record`) 말고",
    "화면에 짧게 말할 거면",                          // 해설을 줄여도 된다는 허락으로 읽힌다
    "다시 답하고, 새 질문 기록으로 남긴다", "답한 것은 강의 밖 설명이든 아니든 질문 기록으로 남긴다", "그 사이 오간 질문은 질문 기록으로 남긴다.", // 답 → 기록 옛 순서
  ]) assert.ok(!all.includes(old), `옛 순서 문구가 남았습니다: ${old}`);
  const first = skill.indexOf("까지 모두 답보다 먼저 부른다");
  const ans = skill.indexOf("도구가 다 돌아오면 답을 한 번 쓴다");
  assert.ok(first > 0 && first < ans, "순서 규칙에서 도구 먼저가 답 쓰기보다 뒤에 있습니다");
  const done = skill.indexOf('`study_set_unit(<차시 id>, "done")`을 먼저 부른다');
  const sum = skill.indexOf("이 차시를 두세 줄로 정리한다");
  assert.ok(done > 0 && done < sum, "닫기에서 done 쓰기가 정리 글보다 뒤에 있습니다");
  assert.ok(!practice.includes("바로 넘어가고 `study_set_practice"), "건너뜀 기록이 아직 글 뒤에 진도를 씁니다");
});

test("지난 위치는 차시 이름표로 말한다 — 제목만 떼면 '1.'을 회차로 잘못 읽는다", () => {
  const line = read(path.join(S, "SKILL.md")).split("\n").find((l) => l.includes("지난 위치는"));
  assert.ok(line, "지난 위치 안내 줄이 있어야 한다");
  assert.match(line, /`label`/);
  assert.doesNotMatch(line, /<차시 제목>/);
});

test("인트로 차시는 확인 문답 없이 구간을 끊지 않고 한 번에 전하고, 나머지는 다른 차시와 같다", () => {
  // 사용자 결정(2026-11-11): 인트로는 질답만 뺀다 · 실습은 넣는다 · 내용은 구간 없이 한 번에 — 그 밖은 정하지 않는다(유연성)
  const skill = read(path.join(S, "SKILL.md"));
  const modes = read(path.join(S, "modes.md"));
  const at = skill.indexOf("### 인트로 차시");
  assert.ok(at > skill.indexOf("### 5. 닫기") && at < skill.indexOf("## 학습 기록"), "인트로 차시 절이 닫기 뒤 · 학습 기록 앞에 있어야 합니다");
  const sec = skill.slice(at, skill.indexOf("## 학습 기록"));
  for (const s of ["이름표가 「인트로」로 끝나는 차시는 인트로 강의다", "두 가지만 다르게 한다. 나머지(열기·실습·닫기·쉼)는 다른 차시와 같다.",
    "**구간을 나누지 않는다:**", "구간 사이에 쉬거나 구간마다 진도를 남기지 않는다", "깊이는 모드대로다", "**확인 문답을 하지 않는다.**"]) {
    assert.ok(sec.includes(s), `인트로 차시 절에 없는 문장: ${s}`);
  }
  for (const k of ["회차 인트로", "개념 인트로", "심화 인트로", "실습 인트로", "챕터 인트로"]) assert.ok(sec.includes(k), `인트로 갈래가 빠졌습니다: ${k}`);
  // 진도 units·resume 의 label 은 멈춘 구간 시각("· 6분쯤")이 붙어 「인트로」로 끝나지 않는다 — 떼지 않으면 이어 갈 때 확인 문답이 되살아난다
  assert.ok(sec.includes("「· 6분쯤」·「· 처음 부분」") && sec.includes("떼고 본다"), "진도 이름표의 시각 꼬리를 떼는 규칙이 없습니다");
  for (const old of ["두세 줄 정리는 하지 않는다", "분량에 세지", "<마지막 구간>"]) assert.ok(!sec.includes(old), `인트로 전용으로 더 정하지 않는다: ${old}`);
  // 단계·이어 가기·쉼·모드 문서가 인트로 절을 가리킨다(단계만 읽고 확인 문항을 내지 않게)
  const deliver = skill.slice(skill.indexOf("### 2. 전달"), skill.indexOf("### 3. 확인"));
  const check = skill.slice(skill.indexOf("### 3. 확인"), skill.indexOf("### 4. 실습"));
  assert.ok(deliver.includes("인트로 차시는 구간을 끊지 않고 한 번에 전한다"), "전달 단계가 인트로 절을 가리키지 않습니다");
  assert.ok(check.includes("인트로 차시는 확인을 하지 않는다"), "확인 단계가 인트로 절을 가리키지 않습니다");
  const resume = skill.split("\n").find((l) => l.includes("`resume.stopped`이면 그 차시를 하다 멈춘 것이다"));
  assert.ok(resume && resume.includes("인트로 차시면 확인은 하지 않는다"), "시작 2번 이어 가기가 인트로 예외를 가리키지 않습니다");
  assert.ok(skill.includes("인트로 차시는 전달 전체"), "짧은 쉼이 인트로를 구간마다 끊습니다");
  // 구간 진도를 남기라는 옛 문장(열기 첫 구간 · 차시 중간 기록 · 일반·심화 진도)에 인트로 예외가 붙어 있다
  assert.equal(skill.split("(인트로 차시는 빼고 — 아래 \"인트로 차시\")").length - 1, 2, "열기·차시 중간 기록에 인트로 예외가 빠졌습니다");
  assert.equal(modes.split("(인트로 차시는 빼고").length - 1, 2, "modes.md 일반·심화 진도에 인트로 예외가 빠졌습니다");
  for (const s of ["**인트로:**", "구간마다 진도를 남기지 않는다", "인트로 차시는 전달 전체)마다 짧은 쉼", "(인트로 차시는 확인이 없다)", "꼭 남긴다(인트로 차시는 빼고"]) {
    assert.ok(modes.includes(s), `modes.md 에 없는 인트로 예외: ${s}`);
  }
});
