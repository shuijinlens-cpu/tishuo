import { useEffect, useRef, useState } from 'react';
import { compressImage } from '../lib/store';

interface Props {
  image: string | null;
  onImage: (dataUrl: string | null) => void;
  onError: (msg: string) => void;
}

export function Uploader({ image, onImage, onError }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [camOpen, setCamOpen] = useState(false);

  const handleFile = async (file?: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      onError('请上传图片文件（jpg / png / webp）');
      return;
    }
    try {
      const url = await compressImage(file);
      onImage(url);
    } catch (e: any) {
      onError(e?.message || '图片处理失败');
    }
  };

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'));
      if (item) {
        const f = item.getAsFile();
        if (f) handleFile(f);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, []);

  return (
    <div className="uploader-wrap">
      <div
        className={`uploader ${drag ? 'drag' : ''} ${image ? 'has-img' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          handleFile(e.dataTransfer.files?.[0]);
        }}
        onClick={() => !image && fileRef.current?.click()}
      >
        {image ? (
          <>
            <img src={image} alt="题目" />
            <div className="uploader-actions">
              <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>换一张</button>
              <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); onImage(null); }}>移除</button>
            </div>
          </>
        ) : (
          <div className="uploader-empty">
            <div className="up-icon">📷</div>
            <strong>拍照 / 截图 / 拖进来</strong>
            <span>支持 Ctrl+V 直接粘贴截图</span>
            <div className="row gap8 center mt8">
              <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); fileRef.current?.click(); }}>选图片</button>
              <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); setCamOpen(true); }}>打开相机</button>
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      </div>
      {camOpen && <CameraModal onClose={() => setCamOpen(false)} onShot={(d) => { onImage(d); setCamOpen(false); }} onError={onError} />}
    </div>
  );
}

function CameraModal({ onClose, onShot, onError }: { onClose: () => void; onShot: (d: string) => void; onError: (m: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setReady(true);
        }
      } catch (e: any) {
        onError('无法打开相机：' + (e?.message || '请检查浏览器权限，或改用上传图片'));
        onClose();
      }
    })();
    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const shoot = () => {
    const v = videoRef.current;
    if (!v) return;
    const cv = document.createElement('canvas');
    cv.width = v.videoWidth;
    cv.height = v.videoHeight;
    cv.getContext('2d')?.drawImage(v, 0, 0);
    onShot(cv.toDataURL('image/jpeg', 0.9));
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="camera" onClick={(e) => e.stopPropagation()}>
        <video ref={videoRef} playsInline muted />
        <div className="camera-bar">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="shutter" onClick={shoot} disabled={!ready} aria-label="拍照" />
          <span className="camera-tip">对准题目，保持水平</span>
        </div>
      </div>
    </div>
  );
}
