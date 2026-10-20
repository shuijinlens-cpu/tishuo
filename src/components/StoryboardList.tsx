import type { Scene, Storyboard } from '../lib/types';

const TYPE_LABEL: Record<string, string> = {
  title: '标题',
  steps: '步骤',
  formula: '公式',
  graph: '函数图像',
  numberline: '数轴',
  geometry: '几何动画',
  pie: '比例图',
  objects: '实物模型',
  compare: '对比',
  conclusion: '结论',
};

interface Props {
  storyboard: Storyboard;
  onChange: (sb: Storyboard) => void;
  onRegenerate: () => void;
  regenerating: boolean;
}

export function StoryboardList({ storyboard, onChange, onRegenerate, regenerating }: Props) {
  const update = (i: number, patch: Partial<Scene>) => {
    const scenes = storyboard.scenes.map((s, idx) => (idx === i ? { ...s, ...patch } : s));
    onChange({ ...storyboard, scenes });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= storyboard.scenes.length) return;
    const scenes = [...storyboard.scenes];
    [scenes[i], scenes[j]] = [scenes[j], scenes[i]];
    onChange({ ...storyboard, scenes });
  };

  const remove = (i: number) => {
    const scenes = storyboard.scenes.filter((_, idx) => idx !== i);
    onChange({ ...storyboard, scenes });
  };

  const keyBase = String(storyboard.createdAt || 0);

  return (
    <div className="sb-card">
      <div className="sb-head">
        <div>
          <h3>讲解分镜</h3>
          <p className="tiny">每一屏都可以改讲解词和停留时长，改完立即生效。</p>
        </div>
        <button className="btn ghost sm" onClick={onRegenerate} disabled={regenerating}>
          {regenerating ? '重新生成中…' : '↻ 重新生成'}
        </button>
      </div>

      <div className="sb-list">
        {storyboard.scenes.map((s, i) => (
          <div className="sb-item" key={`${keyBase}-${i}-${s.type}`}>
            <div className="sb-idx">{i + 1}</div>
            <div className="sb-body">
              <div className="sb-row">
                <span className="tag accent">{TYPE_LABEL[s.type] || s.type}</span>
                <span className="spacer" />
                <label className="dur">
                  <input
                    type="number"
                    min={2}
                    max={40}
                    step={1}
                    defaultValue={Math.round(s.duration ?? 0)}
                    onBlur={(e) => {
                      const v = Number(e.target.value);
                      if (Number.isFinite(v) && v >= 2) update(i, { duration: v });
                    }}
                  />
                  <span>秒</span>
                </label>
                <button className="icon-btn" onClick={() => move(i, -1)} disabled={i === 0} title="上移">↑</button>
                <button className="icon-btn" onClick={() => move(i, 1)} disabled={i === storyboard.scenes.length - 1} title="下移">↓</button>
                <button className="icon-btn danger" onClick={() => remove(i)} title="删除">✕</button>
              </div>

              {(s.title || s.math) && (
                <div className="sb-fields">
                  {s.title !== undefined && (
                    <input
                      className="mini-input"
                      defaultValue={s.title}
                      placeholder="这屏的标题"
                      onBlur={(e) => update(i, { title: e.target.value })}
                    />
                  )}
                  {s.math !== undefined && (
                    <textarea
                      className="mini-input math"
                      rows={2}
                      defaultValue={s.math}
                      onBlur={(e) => update(i, { math: e.target.value })}
                    />
                  )}
                </div>
              )}

              <textarea
                className="narr"
                rows={2}
                defaultValue={s.narration}
                placeholder="解说词（会变成字幕 & 配音）"
                onBlur={(e) => update(i, { narration: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
