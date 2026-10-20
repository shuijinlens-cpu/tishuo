import type { OcrResult } from '../lib/ocr';

interface Props {
  image: string | null;
  text: string;
  result: OcrResult;
  onChange: (v: string) => void;
  onRetry: () => void;
  onConfirm: () => void;
  onDismiss: () => void;
  busy?: boolean;
}

/**
 * 识题确认卡：识别 → 用户核对 → 可以改 → 再生成视频。
 * 这一步很关键：OCR 再怎么优化都会有错字，让用户改一下比事后返工便宜得多。
 */
export function OcrConfirm({ image, text, result, onChange, onRetry, onConfirm, onDismiss, busy }: Props) {
  const isVision = result.engine === 'vision';
  const conf = Math.round(result.confidence);
  const quality = isVision ? 'high' : conf >= 80 ? 'high' : conf >= 55 ? 'mid' : 'low';

  return (
    <div className="ocr-card">
      <div className="ocr-head">
        <div className="ocr-badges">
          <span className="ocr-badge">{isVision ? '🤖 AI 识题' : '📱 本机识别'}</span>
          <span className={`ocr-quality ${quality}`}>
            {isVision ? '准确度高' : `置信度 ${conf}%`}
          </span>
        </div>
        <button className="btn ghost sm" onClick={onDismiss}>收起</button>
      </div>

      {result.warn && <div className="ocr-warn">⚠ {result.warn}</div>}

      <div className="ocr-body">
        {image && <img className="ocr-thumb" src={image} alt="题目原图" />}
        <div className="ocr-edit">
          <label className="ocr-label">识别结果（可以直接改，改完再生成）</label>
          <textarea
            className="input area ocr-area"
            rows={5}
            value={text}
            onChange={(e) => onChange(e.target.value)}
            placeholder="识别到的题目会出现在这里，发现错了就改一下"
          />
        </div>
      </div>

      <div className="ocr-actions">
        <button className="btn ghost sm" onClick={onRetry} disabled={busy}>重拍 / 重识别</button>
        <button className="btn primary sm" onClick={onConfirm} disabled={busy || !text.trim()}>
          确认无误，生成讲解视频
        </button>
      </div>
    </div>
  );
}
