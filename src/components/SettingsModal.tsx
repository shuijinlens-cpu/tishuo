import { useRef, useState } from 'react';
import { PROVIDERS, isConfigured, chat, detectProvider } from '../lib/ai';
import { VOICE_PRESETS, analyzeRecording, describeBestVoice, previewVoice, waitForVoices } from '../lib/voice';
import { applyPreset } from '../lib/store';
import type { Settings, VoiceProfile } from '../lib/types';

interface Props {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
}

const PROSODY_LEVELS: [string, number][] = [
  ['平稳', 0.15],
  ['自然', 0.5],
  ['抑扬顿挫', 0.85],
  ['戏剧化', 1],
];

export function SettingsModal({ settings, onChange, onClose }: Props) {
  const [s, setS] = useState<Settings>(settings);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState('');
  const [trying, setTrying] = useState('');
  const [voiceNote, setVoiceNote] = useState('');
  const [recState, setRecState] = useState<'idle' | 'rec' | 'busy'>('idle');
  const [recErr, setRecErr] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const preset = PROVIDERS.find((p) => p.id === s.providerId) || PROVIDERS[0];

  /** 改任何一项都立刻写回 App → localStorage，不再需要点"保存" */
  const set = (patch: Partial<Settings>) => {
    setS((prev) => {
      const next = { ...prev, ...patch };
      onChange(next);
      return next;
    });
  };
  /** 整份替换（如切换服务商） */
  const replace = (next: Settings) => {
    setS(next);
    onChange(next);
  };

  /** 本地模式（还没选服务商）时直接粘 Key：识别成功就自动切服务商 + 填好接口和模型，不用手动选 */
  const [keyHint, setKeyHint] = useState('');
  const pasteKeyQuick = (key: string) => {
    if (!key) { set({ apiKey: '' }); setKeyHint(''); return; }
    const p = detectProvider(key, s.baseUrl);
    if (p) {
      const next = applyPreset({ ...s, apiKey: key }, p.id);
      replace(next);
      setKeyHint(`✅ 已识别为「${p.name}」，接口地址和模型（${next.textModel}${next.visionModel ? ` / ${next.visionModel}` : ''}）都已自动填好，直接能用`);
    } else {
      set({ apiKey: key });
      setKeyHint('没认出这个 Key 的格式，在上方「AI 服务商」里手动选一个就行（只选一次，之后自动记住）');
    }
  };

  const save = () => onClose();

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
    set({ voicePreset: id, useMyVoice: false });
    setTrying(id);
    await waitForVoices();
    setVoiceNote(`正在用「${describeBestVoice(vp)}」试听`);
    await previewVoice(vp, s.speed, s.pitchShift, s.prosody);
    setTimeout(() => setTrying(''), 9000);
  };

  const startRec = async () => {
    setRecErr('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunksRef.current = [];
      const rec = new MediaRecorder(stream);
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecState('busy');
        try {
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
          const profile: VoiceProfile = await analyzeRecording(blob);
          set({
            voiceProfile: profile,
            useMyVoice: true,
            voicePreset: profile.presetId,
            pitchShift: profile.pitchScale,
          });
          setVoiceNote(
            `已分析你的声音：中位音高 ${profile.f0} Hz（${profile.gender === 'male' ? '男声' : '女声'}），` +
            `音域 ${profile.f0Low}~${profile.f0High} Hz，自动匹配「${VOICE_PRESETS.find((v) => v.id === profile.presetId)?.name}」并校准音高 ${profile.pitchScale.toFixed(2)}×`,
          );
          await waitForVoices();
          await previewVoice(VOICE_PRESETS.find((v) => v.id === profile.presetId)!, s.speed, profile.pitchScale, s.prosody);
        } catch (e: any) {
          setRecErr(e?.message || '分析失败，请重试');
        } finally {
          setRecState('idle');
        }
      };
      rec.start();
      recRef.current = rec;
      setRecState('rec');
      // 最长 25 秒自动停
      setTimeout(() => rec.state === 'recording' && rec.stop(), 25000);
    } catch (e: any) {
      setRecErr(e?.message || '拿不到麦克风权限');
    }
  };

  const stopRec = () => recRef.current?.state === 'recording' && recRef.current.stop();

  const teaching = VOICE_PRESETS.filter((v) => v.group === 'teaching');
  const characters = VOICE_PRESETS.filter((v) => v.group === 'character');

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

            {/* 我的声音 */}
            <div className={`voice-card my-voice ${s.useMyVoice ? 'on' : ''}`} style={{ width: '100%', marginBottom: 10 }}>
              <div className="row between">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="vc-emoji">🎤</span>
                  <div>
                    <strong>我的声音</strong>
                    <small>
                      {s.voiceProfile
                        ? `音高 ${s.voiceProfile.f0} Hz · ${s.voiceProfile.gender === 'male' ? '男声' : '女声'} · 已校准`
                        : '录 10 秒左右，自动匹配最接近的音色并校准'}
                    </small>
                  </div>
                </div>
                {recState === 'rec' ? (
                  <button className="btn danger sm" onClick={stopRec}>⏹ 停止录音</button>
                ) : (
                  <button className="btn ghost sm" onClick={startRec} disabled={recState === 'busy'}>
                    {recState === 'busy' ? '分析中…' : s.voiceProfile ? '重新录制' : '开始录音'}
                  </button>
                )}
              </div>
              {recState === 'rec' && (
                <p className="hint" style={{ marginTop: 8 }}>
                  🔴 正在录音…请自然地朗读：<b>"同学们好，今天我们来看这道题。已知两个条件，我们先设未知数，再一步一步列式求解。"</b>（说满 10 秒效果最好）
                </p>
              )}
              {s.voiceProfile && (
                <label className="check" style={{ marginTop: 8 }}>
                  <input
                    type="checkbox"
                    checked={!!s.useMyVoice}
                    onChange={(e) => set({ useMyVoice: e.target.checked })}
                  />
                  <span>讲解时使用我的声音画像（自动选音色 + 按你的音高校准）</span>
                </label>
              )}
              {recErr && <p className="hint" style={{ color: '#c0392b' }}>{recErr}</p>}
            </div>

            <div className="voice-grid">
              {teaching.map((v) => (
                <button
                  key={v.id}
                  className={`voice-card ${!s.useMyVoice && s.voicePreset === v.id ? 'on' : ''}`}
                  onClick={() => tryVoice(v.id)}
                >
                  <span className="vc-emoji">{v.emoji}</span>
                  <strong>{v.name}</strong>
                  <small>{v.desc}</small>
                  {trying === v.id && <em className="vc-playing">正在试听…</em>}
                </button>
              ))}
            </div>

            <p className="label" style={{ marginTop: 12 }}>角色风格音色</p>
            <div className="voice-grid">
              {characters.map((v) => (
                <button
                  key={v.id}
                  className={`voice-card ${!s.useMyVoice && s.voicePreset === v.id ? 'on' : ''}`}
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
              角色音色是<b>风格化声线</b>（动画主角感、电影旁白感…），接云端人声后会更接近影视配音。
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
              要导出带人声的视频，用云端人声（CosyVoice / gpt-4o-mini-tts 接近真人）。
              开了「我的声音」后，云端配音会自动带上你录音里分析出的音色特征描述。
            </p>
            {preset.tts && s.ttsEngine !== 'api' && (
              <button
                className="btn ghost sm mt8"
                onClick={() =>
                  replace({
                    ...s,
                    ttsEngine: 'api',
                    ttsModel: preset.ttsModel || s.ttsModel,
                    ttsVoice: preset.ttsVoice || s.ttsVoice,
                    ttsProtocol: preset.ttsProtocol,
                  })
                }
              >
                ✨ 一键开启云端人声（{preset.ttsModel}）
              </button>
            )}
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
              <select value={s.providerId} onChange={(e) => replace(applyPreset(s, e.target.value))}>
                {PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </label>
            <p className="hint">{preset.note}</p>
            {/* 本地模式下也把 Key 输入框露出来：粘上即自动识别服务商，不用去下拉框选 */}
            {s.providerId === 'demo' && (
              <label className="field mt8 quick-key">
                <span>有大模型 Key？直接粘贴，自动识别（不用选服务商）</span>
                <input
                  type="password"
                  value={s.apiKey}
                  placeholder="粘贴 Key，接口和模型名自动填好"
                  onChange={(e) => pasteKeyQuick(e.target.value.trim())}
                />
              </label>
            )}
            {keyHint && (
              <p className="hint" style={{ color: keyHint.startsWith('✅') ? '#1a7f37' : undefined }}>{keyHint}</p>
            )}
            {(s.apiKey || s.baseUrl) && (
              <button
                className="btn ghost sm mt8"
                onClick={() => {
                  const p = detectProvider(s.apiKey, s.baseUrl);
                  if (!p) {
                    setTestMsg('没认出这个 Key 的格式，手动选一下服务商就行（只选一次，之后自动记住）');
                    return;
                  }
                  replace(applyPreset(s, p.id));
                  setTestMsg(`已按 Key 识别为「${p.name}」，接口地址和模型名都填好了`);
                }}
              >
                🔍 按 Key 自动识别服务商
              </button>
            )}
            {s.providerId !== 'demo' && (s.textModel || s.visionModel) && (
              <p className="hint">
                当前生效：解题 / 写分镜用 <b>{s.textModel || '（未填）'}</b>，拍照识题用 <b>{s.visionModel || '（未填）'}</b>。
                设置即时保存，下次打开自动生效，不用再选。
              </p>
            )}
          </section>

          {s.providerId === 'demo' && (
            <section className="free-guide">
              <strong>想解锁任意题目的 AI 讲解？3 分钟免费开通</strong>
              <ol>
                <li>打开 bigmodel.cn 注册，实名后进「API Keys」新建一个 Key</li>
                <li>回到这里，把 Key 粘到上方输入框——自动识别为「智谱 GLM」，不用手动选服务商</li>
                <li>glm-4-flash（解题）和 glm-4v-flash（识题）都是免费的，粘完直接就能用</li>
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
            <div className="row between mt12">
              <span className="label">音高</span>
              <div className="seg">
                {[0.9, 1, 1.1].map((v) => (
                  <button key={v} className={Math.abs((s.pitchShift || 1) - v) < 0.01 ? 'on' : ''} onClick={() => set({ pitchShift: v })}>
                    {v === 0.9 ? '低沉' : v === 1 ? '标准' : '清亮'}
                  </button>
                ))}
              </div>
            </div>
            <div className="row between mt12">
              <span className="label">韵律起伏</span>
              <div className="seg">
                {PROSODY_LEVELS.map(([label, v]) => (
                  <button key={label} className={Math.abs((s.prosody ?? 0.6) - v) < 0.02 ? 'on' : ''} onClick={() => set({ prosody: v })}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <p className="hint">
              控制语气的"抑扬顿挫"：问句语调上扬、结论放慢加重、算式和数字咬准、短句干脆长句放缓、句间有换气停顿。
              本机音色和云端人声（含导出视频）都会生效。
            </p>
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
          <span className="tiny">所有修改已自动保存到本机</span>
          <button className="btn primary" onClick={save}>完成</button>
        </div>
      </div>
    </div>
  );
}
