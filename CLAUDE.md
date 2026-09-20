## Project Rules

### Testing

- **MUST manually test every change before considering it done.** After finishing any code change, run the app and verify the affected feature works correctly end-to-end. Do not rely on type-checking or linting alone.

- **MUST chạy lại bộ test chấm bài trên tài liệu thật sau mỗi lần cập nhật phần mềm**, trước khi coi là xong. Việc nhận diện bảng bài tập dựa vào CHỮ trong header của Google Doc, nên một thay đổi trông vô hại vẫn có thể làm chết cả một buổi mà không unit test nào bắt được — đã xảy ra với buổi 14 (header gõ nhầm "Chữa phải").

  Ba tài liệu, mỗi tài liệu chấm **buổi 5, 10 và 14**:

  | Template   | Link                                                                                                    |
  | ---------- | ------------------------------------------------------------------------------------------------------- |
  | trước 20/9 | https://docs.google.com/document/d/1XjFYb9if1NfqQaWxbFbCXKlJhlLKo3a-CtUaxvs_U9s                         |
  | sau 20/9   | https://docs.google.com/document/d/11jspLatFMaAxWcTZkswnw4Hc8YLhX1WBXcup1XCGSrA                         |
  | cũ hơn     | https://docs.google.com/document/d/1o3_WVX6kBMrMLB2uzfiuHfNc2RdRGE871xIDMuRpMPc/edit?tab=t.fkfgiit6qyss |

  Quy trình cho từng cặp (tài liệu × buổi):

  1. Bấm **"Xóa feedback"** trước. Nút này dùng CHUNG cơ chế nhận diện bảng với việc chấm (`collectExerciseRows`), nên bản thân nó đã là một phép thử — và nó đảm bảo lần chấm sau ghi lên ô trống.
  2. Chấm buổi đó.
  3. **PASS** = chạy trót lọt, KHÔNG có cảnh báo "không nhận ra được là bảng bài tập", và feedback ghi thật vào cột cuối của **mọi** dòng học viên đã làm.

  Bảng **BÀI TẬP TỰ CHỌN** ở cuối mỗi buổi phải KHÔNG bao giờ bị ghi feedback.

  Số cặp câu hỏi/trả lời hiện có, để đối chiếu xem có bỏ sót dòng nào không:

  |            | buổi 5 | buổi 10 | buổi 14 |
  | ---------- | ------ | ------- | ------- |
  | trước 20/9 | 18     | 15      | 13      |
  | sau 20/9   | 26     | 14      | **0**   |
  | cũ hơn     | 18     | 15      | 21      |

  Tránh báo động giả: **buổi 14 của template "sau 20/9" chưa có câu trả lời nào** (21 dòng câu hỏi, 0 dòng đã làm). Chấm nó sẽ báo "Không tìm thấy câu trả lời nào để chấm" — đó là ĐÚNG, không phải lỗi. Muốn test thật buổi đó thì điền tay vài câu trước.

### .env Files

- **NEVER delete a line from any `.env` file.** If a variable value needs to change, comment out the old line with `#` and add a new line below with the updated value. Example:
  ```
  # OLD_VALUE (updated 2026-06-15)
  # VITE_MY_VAR=old_value
  VITE_MY_VAR=new_value
  ```

<!-- gitnexus:start -->

# GitNexus — Code Intelligence

This project is indexed by GitNexus as **auto-check-exercise-website** (576 symbols, 1676 relationships, 46 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "main"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource                                                     | Use for                                  |
| ------------------------------------------------------------ | ---------------------------------------- |
| `gitnexus://repo/auto-check-exercise-website/context`        | Codebase overview, check index freshness |
| `gitnexus://repo/auto-check-exercise-website/clusters`       | All functional areas                     |
| `gitnexus://repo/auto-check-exercise-website/processes`      | All execution flows                      |
| `gitnexus://repo/auto-check-exercise-website/process/{name}` | Step-by-step execution trace             |

## CLI

| Task                                         | Read this skill file                                        |
| -------------------------------------------- | ----------------------------------------------------------- |
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md`       |
| Blast radius / "What breaks if I change X?"  | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?"             | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md`       |
| Rename / extract / split / refactor          | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md`     |
| Tools, resources, schema reference           | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md`           |
| Index, status, clean, wiki CLI commands      | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md`             |

<!-- gitnexus:end -->
