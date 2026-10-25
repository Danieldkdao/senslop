import { spawn } from "node:child_process";

// IPC disconnect supervision also stops command groups when the app owner exits.
const supervisor = `
const {spawn}=require('node:child_process');
const command=process.argv[1];
const child=spawn(command,{shell:true,stdio:['ignore','inherit','inherit'],detached:process.platform!=='win32'});
let stopping=false;
const signal=(force)=>{if(!child.pid)return;try{if(process.platform==='win32')spawn('taskkill',['/pid',String(child.pid),'/T',...(force?['/F']:[])]);else process.kill(-child.pid,force?'SIGKILL':'SIGTERM');}catch{}};
const stop=()=>{if(stopping)return;stopping=true;signal(false);setTimeout(()=>signal(true),1000);};
process.on('message',stop);process.once('disconnect',stop);process.once('SIGTERM',stop);process.once('SIGINT',stop);
child.once('error',error=>{console.error(error.message);process.exitCode=127;if(process.connected)process.disconnect();});
child.once('close',code=>{process.exitCode=stopping?130:(code??1);if(process.connected)process.disconnect();});
`;

export const runCheckProcess = ({
  command,
  cwd,
  timeoutSeconds,
  signal,
  onOutput,
}: {
  command: string;
  cwd: string;
  timeoutSeconds: number;
  signal: AbortSignal;
  onOutput: (text: string) => void;
}) =>
  new Promise<{
    exitCode: number | null;
    canceled: boolean;
    timedOut: boolean;
  }>((resolve) => {
    // Repository commands receive only standard tool/runtime variables, never app credentials.
    const env: NodeJS.ProcessEnv = Object.create(null);
    env.CI = "1";
    env.TERM = "dumb";
    for (const key of [
      "PATH",
      "HOME",
      "USERPROFILE",
      "SystemRoot",
      "COMSPEC",
      "PATHEXT",
      "TMPDIR",
      "TEMP",
      "TMP",
    ])
      if (process.env[key]) env[key] = process.env[key];
    let timedOut = false;
    let settled = false;
    const child = spawn(process.execPath, ["-e", supervisor, command], {
      cwd,
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    const stop = () => {
      if (child.connected) child.send("stop");
    };
    const timer = setTimeout(() => {
      timedOut = true;
      stop();
    }, timeoutSeconds * 1000);
    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      resolve({ exitCode, canceled: signal.aborted, timedOut });
    };
    child.stdout?.setEncoding("utf8").on("data", onOutput);
    child.stderr?.setEncoding("utf8").on("data", onOutput);
    child.once("error", (error) => {
      onOutput(error.message);
      finish(127);
    });
    child.once("close", finish);
    signal.addEventListener("abort", stop, { once: true });
    if (signal.aborted) stop();
  });
