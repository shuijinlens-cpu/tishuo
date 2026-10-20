import { useState } from 'react';
import { PROVIDERS, isConfigured, chat } from '../lib/ai';
import { VOICE_PRESETS, describeBestVoice, previewVoice, waitForVoices } from '../lib/voice';
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
  const [trying, setTrying] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
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

  const tryVoice = async (id: string) => {
    const vp = VOICE_PRESETS.find((x) => x.id === id)!;
    set({ voicePreset: id });
    setTrying(id);
    await waitForVoices();
    setVoiceNote(`正在用「${describeBestVoice(vp)}」试听`);
    await previewVoice(vp, s.speed);
    setTimeout(() => setTrying(''), 9000);
  };

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>设置</h2>
            <p className="sub">配置只存在本机，不会上传到任何服务器。</p>
          </div>
          <button className="btn ghost sm" onClick={onClose}>关闭</button>
        </div>

        <div className="modal-body">
          {/* ---------- 声音 ---------- */}
          <section>
            <div className="row between">
              <span className="label">讲解音色</span>
              <button
                className="btn ghost sm"
                onClick={() => tryVoice(s.voicePreset)}
              >▶ 试听当前音色</button>
            </div>
            <div className="voice-grid">
              {VOICE_PRESETS.map((v) => (
                <button
                  key={v.id}
                  className={`voice-card ${s.voicePreset === v.id ? 'on' : ''}`}
                  onClick={() => tryVoice(v.id)}
                >
                  <span className="vc-emoji">{v.emoji}</span>
                  <strong>{v.name}</strong>
                  <small>{v.desc}</small>
                  {trying === v.id && <em className="vc-playing">正在试听…</em>}
                </button>
              ))}
            </div>
            {voiceNote && <p className="hint">{voiceNote}</p>}
            <p className="hint">
              系统音色里带「自然 / Online / Neural」的是真・神经网络发音，明显不像机器。
              电脑端 Edge 效果最好（晓晓、云希）；手机端建议用 Android 系统自带的「Google 语音服务」。
            </p>
          </section>

          {/* ---------- 朗读引擎 ---------- */}
          <section>
            <div className="row between">
              <span className="label">朗读方式</span>
              <div className="seg">
                {([
                  ['browser', '本机神经音色'],
                  ['api', '云端人声（推荐）'],
                  ['none', '静音只留字幕'],
                ] as const).map(([k, label]) => (
                  <button key={k} className={s.ttsEngine === k ? 'on' : ''} onClick={() => set({ ttsEngine: k })}>{label}</button>
                ))}
              </div>
            </div>
            <p className="hint">
              本机音色免费、随点随听，但<strong>录不进视频</strong>（浏览器不允许抓取系统语音）；
              要导出带人声的视频，用云端人声（CosyVoice / gpt-4o-mini-tts 接近真人，还能复刻音色）。
            </p>
          </section>

          {s.ttsEngine === 'api' && (
            <section className="tts-box">
              <div className="grid2">
                <label className="field">
                  <span>TTS 模型</span>
                  <input value={s.ttsModel} placeholder="qwen-tts / gpt-4o-mini-tts" onChange={(e) => set({ ttsModel: e.target.value.trim() })} />
                </label>
                <label className="field">
                  <span>音色 ID</span>
                  <input value={s.ttsVoice} placeholder="Cherry / nova / 复刻音色 ID" onChange={(e) => set({ ttsVoice: e.target.value.trim() })} />
                </label>
              </div>
              <div className="row between mt12">
                <span className="label">接口协议</span>
                <div className="seg">
                  <button className={s.ttsProtocol === 'openai' ? 'on' : ''} onClick={() => set({ ttsProtocol: 'openai' })}>OpenAI /audio/speech</button>
                  <button className={s.ttsProtocol === 'dashscope' ? 'on' : ''} onClick={() => set({ ttsProtocol: 'dashscope' })}>阿里百炼 qwen-tts</button>
                </div>
              </div>
              <label className="field mt12">
                <span>声音风格描述（越具体越像真人）</span>
                <textarea
                  className="input area"
                  rows={3}
                  value={s.voiceStyle}
                  placeholder={'例如：温柔耐心的女老师，语速偏慢，讲到关键步骤时语气加重，句尾自然下沉'}
                  onChange={(e) => set({ voiceStyle: e.target.value })}
                />
              </label>
              <p className="hint">
                支持该参数的模型（gpt-4o-mini-tts、CosyVoice）会按描述调整语气；
                想做「网络人物音色」，在百炼里用 10 秒录音复刻一个音色，把音色 ID 填到上面即可。
              </p>
            </section>
          )}

          {/* ---------- 识题 ---------- */}
          <section>
            <div className="row between">
              <span className="label">识题方式</span>
              <div className="seg">
                {([
                  ['auto', '自动'],
                  ['local', '本机 OCR'],
                  ['vision', '视觉大模型'],
                ] as const).map(([k, label]) => (
                  <button key={k} className={s.ocrEngine === k ? 'on' : ''} onClick={() => set({ ocrEngine: k })}>{label}</button>
                ))}
              </div>
            </div>
            <p className="hint">
              自动 = 配了视觉模型就用大模型（公式更准），否则用手机本机 OCR（离线、免费、约 2MB 模型）。
            </p>
          </section>

          {/* ---------- 模型 ---------- */}
          <section>
            <label className="field">
              <span>AI 服务商（解题 / 写分镜）</span>
              <select value={s.providerId} onChange={(e) => setS(applyPreset(s, e.target.value))}>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <p className="hint">{preset.note}</p>
          </section>

          {s.providerId === 'demo' && (
            <section className="free-guide">
              <strong>想解锁任意题目的 AI 讲解？3 分钟免费开通</strong>
              <ol>
                <li>打开 bigmodel.cn 注册，实名后进「API Keys」新建一个 Key</li>
                <li>回到这里，服务商选「智谱 GLM（有免费模型）」</li>
                <li>粘贴 Key → 保存。glm-4-flash（解题）与 glm-4v-flash（识题）都是免费的</li>
              </ol>
            </section>
          )}

          {s.providerId !== 'demo' && (
            <>
              <section className="grid2">
                <label className="field">
                  <span>接口地址（Base URL）</span>
                  <input value={s.baseUrl} placeholder="https://xxx/v1" onChange={(e) => set({ baseUrl: e.target.value.trim() })} />
                </label>
                <label className="field">
                  <span>API Key</span>
                  <input type="password" value={s.apiKey} placeholder="sk-..." onChange={(e) => set({ apiKey: e.target.value.trim() })} />
                </label>
              </section>

              <section className="grid2">
                <label className="field">
                  <span>文本模型（解题 / 写分镜）</span>
                  <input value={s.textModel} placeholder="glm-4-flash" onChange={(e) => set({ textModel: e.target.value.trim() })} />
                </label>
                <label className="field">
                  <span>视觉模型（拍照识题）</span>
                  <input value={s.visionModel} placeholder="glm-4v-flash / qwen-vl-max" onChange={(e) => set({ visionModel: e.target.value.trim() })} />
                </label>
              </section>

              <div className="row gap8">
                <button className="btn ghost sm" onClick={test} disabled={testing || !isConfigured(s)}>
                  {testing ? '测试中…' : '测试连接'}
                </button>
                {testMsg && <span className="hint inline">{testMsg}</span>}
              </div>
            </>
          )}

          {/* ---------- 画面 ---------- */}
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
