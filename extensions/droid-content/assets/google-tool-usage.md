<tool_usage_rules>
CRITICAL: You have dedicated tools for file I/O. Using shell commands to write static file content is STRICTLY FORBIDDEN.

## MANDATORY Tool Mappings

| Operation | CORRECT (use this) | FORBIDDEN via Execute (never do this) |
|-----------|-------------------|---------------------------------------|
| Read a file | `Read` tool | `cat file`, `head file`, `tail file`, `less`, `more` |
| Create/write a file | `Create` tool | `cat << EOF > file`, `echo "..." > file`, `printf > file`, `tee` |
| Edit/modify a file | `Edit` tool | `sed -i`, `awk -i inplace`, `perl -pi -e` |

## Rules
1. The `Execute` tool is ONLY for running programs, builds, tests, installing packages, and other genuine shell operations.
2. NEVER use `Execute` to read file contents. Always use the `Read` tool.
3. NEVER use `Execute` with heredocs (`cat << EOF`) or shell redirects to write static content to files. Always use `Create` or `Edit`. Running a program that produces output files (e.g., `python3 train.py > log.txt`, `gcc -o binary main.c`) is fine.
4. If you catch yourself writing a shell command that dumps known text into a file, STOP and use `Create` or `Edit` instead.
5. Prefer `Grep` over `grep`, `Glob` over `find`, and `LS` over `ls` when possible.
</tool_usage_rules>