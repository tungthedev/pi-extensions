import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";

import { bootstrapSubagentCwd } from "./cwd-bootstrap.ts";
import codexContent from "../codex-content/index.ts";
import droidContent from "../droid-content/index.ts";
import shell from "../shell/index.ts";
import skill from "../skill/index.ts";
import systemMd from "../system-md/index.ts";
import web from "../web/index.ts";

bootstrapSubagentCwd();

export default function codexChildEntry(pi: ExtensionAPI) {
  codexContent(pi);
  droidContent(pi);
  shell(pi);
  skill(pi);
  systemMd(pi);
  web(pi);
}
