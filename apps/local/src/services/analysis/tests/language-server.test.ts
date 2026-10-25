import { expect, test } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { analyzeSemanticSources } from "../language-server";
import { languageSettingsSchema } from "@senslop/contracts";

test("semantic tools receive frozen files and outside-root references cannot enter evidence", async () => {
  const directory = await mkdtemp(join(tmpdir(), "senslop-lsp-test-"));
  try {
    const server = join(directory, "server.mjs");
    await writeFile(
      server,
      `import {readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';let buffer=Buffer.alloc(0);let uri;process.stdin.on('data',chunk=>{buffer=Buffer.concat([buffer,chunk]);for(;;){let end=buffer.indexOf('\\r\\n\\r\\n');if(end<0)return;let length=Number(/Content-Length: (\\d+)/i.exec(buffer.subarray(0,end).toString())[1]);if(buffer.length<end+4+length)return;let message=JSON.parse(buffer.subarray(end+4,end+4+length).toString());buffer=buffer.subarray(end+4+length);if(message.method==='textDocument/didOpen'){uri=message.params.textDocument.uri;if(readFileSync(fileURLToPath(uri),'utf8')!=='def run():\\n    return 1\\n')process.exit(2);}if(message.id===undefined)continue;let result=message.method==='initialize'?{capabilities:{},serverInfo:{name:'fixture',version:'1'}}:message.method==='textDocument/documentSymbol'?[{name:'run',kind:12,range:{start:{line:0,character:0},end:{line:1,character:12}},selectionRange:{start:{line:0,character:4},end:{line:0,character:7}}}]:message.method==='textDocument/references'?[{uri,range:{start:{line:1,character:4},end:{line:1,character:7}}},{uri:'file:///private/secret.py',range:{start:{line:0,character:0},end:{line:0,character:1}}}]:null;let body=JSON.stringify({jsonrpc:'2.0',id:message.id,result});process.stdout.write('Content-Length: '+Buffer.byteLength(body)+'\\r\\n\\r\\n'+body);}});`,
    );
    const settings = languageSettingsSchema.parse({
      python: { enabled: true, command: process.execPath, args: [server] },
    });
    const result = await analyzeSemanticSources(
      { "app.py": "def run():\n    return 1\n" },
      settings,
    );
    expect(result.capabilities["app.py"]?.level).toBe("semantic");
    expect(result.symbols[0]?.references).toEqual([
      { path: "app.py", line: 2 },
    ]);
    expect(result.symbols[0]?.name).toBe("run");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("missing tools become per-language limitations rather than invalidating other source", async () => {
  const result = await analyzeSemanticSources(
    { "app.py": "def run(): pass", "main.go": "package main" },
    languageSettingsSchema.parse({
      python: { enabled: true, command: "/missing/senslop-tool", args: [] },
    }),
  );
  expect(result.limitations.join(" ")).toMatch(/unavailable|ENOENT/);
  expect(result.symbols).toEqual([]);
});
