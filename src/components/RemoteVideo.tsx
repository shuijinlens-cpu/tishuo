import { useEffect, useRef, useState } from 'react';

interface Props {
  url: string;
  topic?: string;
  onRegen: () => void;
  regenerating?: boolean;
}

/** 服务端生成的讲解视频：直接播放 + 下载，不再用本地 canvas 录制 */
export function RemoteVideo({ url, topic, onRegen, regenerating }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState('');
  const [name, setName] = useState('tishuo.mp4');

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onLoaded = () => setReady(true);
    const onErr = () => setErr('视频加载失败，检查网络或视频内核地址是否正确');
    v.addEventListener('loadeddata', onLoaded);
    v.addEventListener('error', onErr);
    return () => {
      v.removeEventListener('loadeddata', onLoaded);
      v.removeEventListener('error', onErr);
    };
  }, [url]);

  useEffect(() => {
    setName(`题说-${topic || '讲解'}-${new Date().toISOString().slice(5, 16).replace(/[:T-]/g, '')}.mp4`);
  }, [topic]);

  return (
    <div className="stage-card">
      <div className="stage-topbar">
        <div className="row gap8 center">
          <span className="dot" style={{ background: '#2f7df6' }} />
          <strong>{topic || '讲解视频'}</strong>
          <span className="tag">服务端渲染</span>
        </div>
        <div className="row gap8">
          <button className="btn ghost sm" onClick={onRegen} disabled={regenerating}>
            {regenerating ? '生成中…' : '重新生成'}
          </button>
          <a className="btn primary sm" href={url} download={name}>下载视频</a>
        </div>
      </div>

      <div className="canvas-wrap wide">
        <video
          ref={videoRef}
          src={url}
          controls
          autoPlay
          playsInline
          style={{ width: '100%', display: 'block', background: '#000', borderRadius: 12 }}
        />
        {!ready && !err && (
          <div className="canvas-placeholder">
            <div className="big">⏳</div>
            <p>视频缓冲中…</p>
          </div>
        )}
        {err && <div className="canvas-placeholder"><div className="big">⚠️</div><p>{err}</p></div>}
      </div>

      <p className="stage-msg">
        ✅ 这是视频内核在服务器端生成的讲解视频（含配音）。可直接下载发抖音 / 视频号 / 班级群。
      </p>
    </div>
  );
}
