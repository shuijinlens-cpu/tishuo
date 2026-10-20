import { useState } from 'react';
import { PROVIDERS, isConfigured, chat } from '../lib/ai';
import { applyPreset } from '../lib/store';
import type { Settings } from '../lib/types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

export function SettingsModal({ settings, onChange, onClose }: Props) {
  const [s, setS] = useState<Settings>(settings);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const preset = PROVIDERS.find((p) => p.id === s.providerId) || PROVIDERS[0];

  const set = (patch: Partial<Settings>) => setS((prev) => ({ ...prev, ...patch }));

  const save = () => {
    onChange(s);
    onClose();
  };

  const test = async () => {
    setTesting(true);
    setTestMsg('');
    try {
      await chat(s, [{ role: 'user', content: '只回复两个字：可用' }]);
      setTestMsg('✅ 连通成功，模型可用');
    } catch (e: any) {
      setTestMsg(`❌ ${e?.message || '连接失败'}`);
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>模型与生成设置</h2>
            <p className="sub">配置存在本机浏览器，不会上传到任何服务器。</p>
          </div>
          <button className="btn ghost sm" onClick={onClose}>关闭</button>
        </div>

        <div className="modal-body">
          <section>
            <label className="field">
              <span>服务商</span>
              <select
                value={s.providerId}
                onChange={(e) => setS(applyPreset(s, e.target.value))}
              >
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <p className="hint">{preset.note}</p>
          </section>

          {s.providerId !== 'demo' && (
            <>
              <section className="grid2">
                <label className="field">
                  <span>接口地址（Base URL）</span>
                  <input
                    value={s.baseUrl}
                    placeholder="https://xxx/v1"
                    onChange={(e) => set({ baseUrl: e.target.value.trim() })}
                  />
                </label>
                <label className="field">
                  <span>API Key</span>
                  <input
                    type="password"
                    value={s.apiKey}
                    placeholder="sk-..."
                    onChange={(e) => set({ apiKey: e.target.value.trim() })}
                  />
                </label>
              </section>

              <section className="grid2">
                <label className="field">
                  <span>文本模型（解题 / 写分镜）</span>
                  <input value={s.textModel} placeholder="gpt-4o-mini" onChange={(e) => set({ textModel: e.target.value.trim() })} />
                </label>
                <label className="field">
                  <span>视觉模型（拍照识题）</span>
                  <input value={s.visionModel} placeholder="gpt-4o / qwen-vl-max" onChange={(e) => set({ visionModel: e.target.value.trim() })} />
                </label>
              </section>

              <section>
                <div className="row between">
                  <span className="label">配音方式</span>
                  <div className="seg">
                    {([
                      ['api', '接口配音'],
                      ['browser', '浏览器配音'],
                      ['none', '静音'],
                    ] as const).map(([k, label]) => (
                      <button
                        key={k}
                        className={s.ttsEngine === k ? 'on' : ''}
                        onClick={() => set({ ttsEngine: k })}
                      >{label}</button>
                    ))}
                  </div>
                </div>
                <p className="hint">
                  浏览器配音免费，但<strong>无法被录进视频</strong>（只能导出带字幕的版本）；接接口配音才能导出带人声的视频。
                </p>
              </section>

              {s.ttsEngine === 'api' && (
                <section className="grid2">
                  <label className="field">
                    <span>TTS 模型</span>
                    <input value={s.ttsModel} placeholder="gpt-4o-mini-tts / qwen-tts" onChange={(e) => set({ ttsModel: e.target.value.trim() })} />
                  </label>
                  <label className="field">
                    <span>音色</span>
                    <input value={s.ttsVoice} placeholder="alloy / Cherry" onChange={(e) => set({ ttsVoice: e.target.value.trim() })} />
                  </label>
                </section>
              )}

              <div className="row gap8">
                <button className="btn ghost sm" onClick={test} disabled={testing || !isConfigured(s)}>
                  {testing ? '测试中…' : '测试连接'}
                </button>
                {testMsg && <span className="hint inline">{testMsg}</span>}
              </div>
            </>
          )}

          <section>
            <div className="row between">
              <span className="label">画面比例</span>
              <div className="seg">
                <button className={s.ratio === '16:9' ? 'on' : ''} onClick={() => set({ ratio: '16:9' })}>横屏 16:9</button>
                <button className={s.ratio === '9:16' ? 'on' : ''} onClick={() => set({ ratio: '9:16' })}>竖屏 9:16</button>
              </div>
            </div>
            <div className="row between mt12">
              <span className="label">画面风格</span>
              <div className="seg">
                <button className={s.theme === 'night' ? 'on' : ''} onClick={() => set({ theme: 'night' })}>深色黑板</button>
                <button className={s.theme === 'light' ? 'on' : ''} onClick={() => set({ theme: 'light' })}>浅色纸面</button>
              </div>
            </div>
          </section>

          <section>
            <div className="row between">
              <span className="label">语速</span>
              <div className="seg">
                {[0.85, 1, 1.15, 1.3].map((v) => (
                  <button key={v} className={s.speed === v ? 'on' : ''} onClick={() => set({ speed: v })}>{v}×</button>
                ))}
              </div>
            </div>
            <label className="check mt12">
              <input type="checkbox" checked={s.captions} onChange={(e) => set({ captions: e.target.checked })} />
              <span>画面底部显示字幕</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={s.autoDuration} onChange={(e) => set({ autoDuration: e.target.checked })} />
              <span>按解说词长度自动计算每屏时长</span>
            </label>
          </section>

          <p className="tiny">
            换模型 / 换服务商只改这里，不用改代码。仓库里的 <code>proxy/worker.js</code> 可一键部署到 Cloudflare Workers，
            把 Key 藏到服务端并顺带解决浏览器跨域限制。
          </p>
        </div>

        <div className="modal-foot">
          <button className="btn ghost" onClick={onClose}>取消</button>
          <button className="btn primary" onClick={save}>保存设置</button>
        </div>
      </div>
    </div>
  );
}
