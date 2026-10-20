import { useEffect, useRef, useState } from 'react';
import { Player, recordVideo } from '../engine/player';
import type { Settings, Storyboard } from '../lib/types';
import { stageMeta } from '../engine/theme';

interface Props {
  storyboard: Storyboard | null;
  settings: Settings;
  buffers: (AudioBuffer | null)[] | null;
  synthesizing: boolean;
  onSynthesize: () => void;
}

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${String(ss).padStart(2, '0')}`;
}

export function VideoStage({ storyboard, settings, buffers, synthesizing, onSynthesize }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const playerRef = useRef<Player | null>(null);
  const [playing, setPlaying] = useState(false);
  const [t, setT] = useState(0);
  const [total, setTotal] = useState(0);
  const [recording, setRecording] = useState(false);
  const [progress, setProgress] = useState(0);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<{ url: string; mime: string; hasAudio: boolean; name: string } | null>(null);
  const [scale, setScale] = useState(1);

  // 初始化播放器
  useEffect(() => {
    if (!canvasRef.current) return;
    const p = new Player(canvasRef.current);
    playerRef.current = p;
    p.cfg = null;
    p.render(0);
    return () => p.destroy();
  }, []);

  // 画布尺寸
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    const w = settings.ratio === '16:9' ? 1280 : 720;
    const h = settings.ratio === '16:9' ? 720 : 1280;
    p.resize(w, h);
    const onResize = () => {
      const el = canvasRef.current?.parentElement;
      if (el) setScale(Math.min(1, el.clientWidth / w));
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [settings.ratio]);

  // 载入分镜
  useEffect(() => {
    const p = playerRef.current;
    if (!p || !storyboard) return;
    p.load({
      storyboard,
      settings,
      buffers: buffers || undefined,
      onTime: (tt) => setT(tt),
      onEnd: () => setPlaying(false),
    });
    setTotal(p.total);
    setPlaying(false);
    setResult(null);
    setMsg('');
    p.seek(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storyboard, settings, buffers]);

  useEffect(() => {
    setPlaying(false);
    playerRef.current?.pause();
  }, [storyboard]);

  const toggle = () => {
    const p = playerRef.current;
    if (!p || !storyboard) return;
    if (p.playing) {
      p.pause();
      setPlaying(false);
    } else {
      p.play();
      setPlaying(true);
    }
  };

  const seek = (v: number) => {
    const p = playerRef.current;
    if (!p) return;
    p.seek(v);
    setT(v);
    setPlaying(p.playing);
  };

  const canRecord = !!storyboard;
  const audioWillBeSilent = settings.ttsEngine === 'browser' || settings.ttsEngine === 'none' || !buffers;

  const exportVideo = async () => {
    const p = playerRef.current;
    if (!p || !storyboard) return;
    if (settings.ttsEngine === 'api' && !buffers) {
      setMsg('还没有合成配音，先点"合成配音"，或把配音方式改成"浏览器配音"导出字幕版。');
      return;
    }
    setRecording(true);
    setProgress(0);
    setMsg('');
    try {
      const res = await recordVideo(p, (x) => setProgress(x));
      const url = URL.createObjectURL(res.blob);
      const ext = res.mime.includes('mp4') ? 'mp4' : 'webm';
      const name = `题说-${storyboard.topic || '讲解'}-${new Date().toISOString().slice(5, 16).replace(/[:T-]/g, '')}.${ext}`;
      setResult({ url, mime: res.mime, hasAudio: res.hasAudio, name });
      setMsg(res.hasAudio ? '✅ 已生成带配音的视频' : '✅ 已生成带字幕的视频（无配音轨道）');
    } catch (e: any) {
      setMsg('导出失败：' + (e?.message || '浏览器不支持录制'));
    } finally {
      setRecording(false);
      setPlaying(false);
    }
  };

  const snapshot = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    cv.toBlob((b) => {
      if (!b) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `题说-封面-${Date.now()}.png`;
      a.click();
    }, 'image/png');
  };

  const st = storyboard ? stageMeta(storyboard.stage) : null;

  return (
    <div className="stage-card">
      <div className="stage-topbar">
        <div className="row gap8 center">
          <span className="dot" style={{ background: st?.accent || '#999' }} />
          <strong>{storyboard ? storyboard.topic : '预览'}</strong>
          {storyboard && <span className="tag">{storyboard.scenes.length} 屏</span>}
        </div>
        <div className="row gap8">
          <button className="btn ghost sm" onClick={snapshot} disabled={!storyboard}>存封面</button>
          <button
            className="btn primary sm"
            onClick={exportVideo}
            disabled={!canRecord || recording}
          >
            {recording ? `录制中 ${Math.round(progress * 100)}%` : '导出视频'}
          </button>
        </div>
      </div>

      <div className={`canvas-wrap ${settings.ratio === '16:9' ? 'wide' : 'tall'}`}>
        <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
        {!storyboard && (
          <div className="canvas-placeholder">
            <div className="big">🎬</div>
            <p>上传题目或点一个示例，讲解视频会在这里生成</p>
          </div>
        )}
        {recording && (
          <div className="rec-overlay">
            <div className="rec-badge">● REC {Math.round(progress * 100)}%</div>
            <div className="rec-bar"><i style={{ width: `${progress * 100}%` }} /></div>
            <p>正在逐帧录制，请不要切换标签页（约需 {Math.ceil(total)} 秒）</p>
          </div>
        )}
      </div>

      <div className="stage-controls">
        <button className="play-btn" onClick={toggle} disabled={!storyboard} aria-label="播放">
          {playing ? '❚❚' : '▶'}
        </button>
        <span className="time">{fmtTime(t)} / {fmtTime(total)}</span>
        <input
          className="seek"
          type="range"
          min={0}
          max={Math.max(0.1, total)}
          step={0.05}
          value={Math.min(t, total)}
          onChange={(e) => seek(Number(e.target.value))}
          disabled={!storyboard}
        />
        {settings.ttsEngine === 'api' && (
          <button className="btn ghost sm" onClick={onSynthesize} disabled={!storyboard || synthesizing}>
            {synthesizing ? '合成中…' : buffers ? '重新合成配音' : '合成配音'}
          </button>
        )}
      </div>

      {msg && <p className="stage-msg">{msg}</p>}
      {audioWillBeSilent && storyboard && settings.ttsEngine !== 'api' && (
        <p className="stage-hint">
          当前是{settings.ttsEngine === 'none' ? '静音' : '浏览器配音'}：预览能听到声音，但导出的视频只有字幕没有人声。
          想要配音成片，请在设置里选择"接口配音"并合成。
        </p>
      )}

      {result && (
        <div className="result">
          <video src={result.url} controls playsInline />
          <div className="result-info">
            <strong>{result.hasAudio ? '配音版已就绪' : '字幕版已就绪'}</strong>
            <span className="tiny">{result.mime} · 可直接发抖音/视频号/班级群</span>
            <div className="row gap8 mt8">
              <a className="btn primary sm" href={result.url} download={result.name}>下载视频</a>
              <a className="btn ghost sm" href={result.url} target="_blank" rel="noreferrer">新窗口播放</a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
