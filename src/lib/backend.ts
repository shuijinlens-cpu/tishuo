/* 题说 v2 · 视频内核客户端
 *
 * App 与后端（HuggingFace Space / 自有服务器）之间的契约。
 * 后端接口见 tishuo-backend/app.py。
 */

export type JobState = 'queued' | 'running' | 'done' | 'error';

export interface JobStatus {
  status: JobState;
  progress: number;
  step: string;
  error: string | null;
  video: string | null;
  backend: string;
  configured: boolean;
}

export interface HealthInfo {
  ok: boolean;
  backend: string;
  configured: boolean;
  tts_enabled: boolean;
  tts_voice: string;
}

function join(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}${path}`;
}

/** 提交一道题，返回任务 id（异步渲染，需轮询） */
export async function submitProblem(
  apiBase: string,
  problem: string,
  stage: string,
  voice: string,
): Promise<string> {
  const res = await fetch(join(apiBase, '/api/generate'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ problem, stage, voice }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`提交失败（${res.status}）${t.slice(0, 140)}`);
  }
  const d = await res.json();
  if (!d.job_id) throw new Error('服务端没有返回任务 id');
  return d.job_id as string;
}

/** 轮询任务进度 */
export async function getJob(apiBase: string, jobId: string): Promise<JobStatus> {
  const res = await fetch(join(apiBase, `/api/job/${jobId}`));
  if (!res.ok) throw new Error('查询任务失败');
  return (await res.json()) as JobStatus;
}

/** 任务完成后的视频地址 */
export function videoUrl(apiBase: string, jobId: string): string {
  return join(apiBase, `/api/video/${jobId}`);
}

/** 服务端试听：把文字用指定音色合成 mp3（手机端必定出声） */
export async function previewVoice(
  apiBase: string,
  text: string,
  voice: string,
): Promise<ArrayBuffer> {
  const res = await fetch(join(apiBase, '/api/preview-voice'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`试听失败（${res.status}）${t.slice(0, 140)}`);
  }
  return res.arrayBuffer();
}
