import { useEffect, useMemo, useRef, useState } from 'react';
import { STAGES, stageMeta } from './engine/theme';
import { VideoStage } from './components/VideoStage';
import { StoryboardList } from './components/StoryboardList';
import { SettingsModal } from './components/SettingsModal';
import { Uploader } from './components/Uploader';
import { OcrConfirm } from './components/OcrConfirm';
import { generateStoryboard, isConfigured, PROVIDERS, recognizeQuestion, synthesize } from './lib/ai';
import type { OcrResult } from './lib/ocr';
import { warmupOcr } from './lib/ocr';
import { getPreset, presetForStage, synthesizeNarration } from './lib/voice';
import { tryLocalSolve } from './lib/localSolve';
import { getAudioContext } from './engine/player';
import { autoConfigFromKey, loadSettings, saveSettings } from './lib/store';
import { SAMPLES, samplesFor, type Sample } from './lib/samples';
import type { Settings, Stage, Storyboard } from './lib/types';

type Mode = 'solve' | 'custom';

export default function App() {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [stage, setStage] = useState<Stage>('junior');
  const [mode, setMode] = useState<Mode>('solve');
  const [image, setImage] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [plan, setPlan] = useState('');
  const [storyboard, setStoryboard] = useState<Storyboard | null>(null);
  const [buffers, setBuffers] = useState<(AudioBuffer | null)[] | null>(null);
  const [busy, setBusy] = useState('');
  const [toast, setToast] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [synthesizing, setSynthesizing] = useState(false);
  const [ocrResult, setOcrResult] = useState<OcrResult | null>(null);
  const [ocrPct, setOcrPct] = useState<{ pct: number; label: string } | null>(null);

  const live = isConfigured(settings);
  const st = stageMeta(stage);
  const providerName = PROVIDERS.find((p) => p.id === settings.providerId)?.name || '自定义';
  const activeModel = settings.textModel || settings.visionModel || '';
  const voiceName = getPreset(settings.voicePreset).name;

  useEffect(() => { saveSettings(settings); }, [settings]);

  // 进页面就在后台把 OCR 模型拉下来（约 2MB），用户拍完就能直接识别
  useEffect(() => {
    const t = setTimeout(() => { warmupOcr(); }, 2500);
    return () => clearTimeout(t);
  }, []);

  // 粘过 Key 但没选服务商 → 按 Key 格式自动补全（只做一次，之后设置里永久记住）
  const autoDone = useRef(false);
  useEffect(() => {
    if (autoDone.current) return;
    autoDone.current = true;
    setSettings((prev) => {
      const next = autoConfigFromKey(prev);
      if (next !== prev) {
        const p = PROVIDERS.find((x) => x.id === next.providerId);
        setToast(`已记住模型：${p?.name || next.providerId}${next.textModel ? ` · ${next.textModel}` : ''}，以后不用再选`);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4600);
    return () => clearTimeout(t);
  }, [toast]);

  const stageSamples = useMemo(() => samplesFor(stage), [stage]);

  const pickSample = (s: Sample) => {
    setStage(s.stage);
    setMode('solve');
    setImage(null);
    setOcrResult(null);
    setQuestion(s.question);
    setStoryboard({ ...s.storyboard, question: s.question, createdAt: Date.now() });
    setBuffers(null);
    setToast(`已载入示例：${s.label}（可直接播放 / 导出）`);
  };

  const handleOcr = async () => {
    if (!image) { setToast('先拍一张题目照片'); return; }
    setOcrPct({ pct: 0.01, label: '准备识别' });
    try {
      const r = await recognizeQuestion(settings, image, (p) => setOcrPct(p));
      setOcrResult(r);
      setQuestion(r.text);
      if (!r.text.trim()) setToast('没识别到文字，调整光线和角度再试一次');
      else setToast(r.engine === 'vision' ? 'AI 已识别，请核对后生成' : '本机已识别，请重点核对数字和符号');
    } catch (e: any) {
      setToast(e?.message || '识别失败');
    } finally {
      setOcrPct(null);
    }
  };

  /** 真正生成：能走大模型就走，不能就用本地解题器，都不行才提示开通 */
  const buildStoryboard = async (q: string): Promise<Storyboard | null> => {
    if (live) {
      try {
        return await generateStoryboard(
          settings, stage, q,
          mode === 'custom' ? plan.trim() : undefined,
          (msg) => setBusy(msg),
        );
      } catch (e: any) {
        setToast(`AI 服务出错：${e?.message || e}，改用本机解题`);
      }
    }
    const local = tryLocalSolve(q, stage);
    return local ? { ...local, question: q, stage } : null;
  };

  const handleGenerate = async () => {
    const q = question.trim();
    if (mode === 'solve' && !q) { setToast('先输入题目，或上传图片后识别'); return; }
    if (mode === 'custom' && !plan.trim()) { setToast('写下你的讲解思路，我按顺序生成'); return; }

    setBusy(mode === 'custom' ? '正在按你的思路编排分镜…' : '正在解题并设计分镜…');
    try {
      const sb = await buildStoryboard(q);
      if (!sb) {
        setToast('这道题需要大模型来拆解。可免费开通：智谱 GLM-4-Flash（识题和讲解都免费）——点右上角设置，选「智谱 GLM」即可。');
        return;
      }
      setStoryboard(sb);
      setBuffers(null);
      setOcrResult(null);
      if (sb.issues && sb.issues.length) setToast(`⚠ ${sb.issues[0]}`);
      else if (sb.exact) setToast('已用精确代数内核逐步求解（有理数运算，每一步都可核对）');
      else if (sb.verified) setToast('讲解已生成，全部算式已通过本机复核');
      else setToast(sb.source === 'local' ? '已用本机解题引擎生成，点播放预览' : '讲解已生成，点播放预览');
    } finally {
      setBusy('');
    }
  };

  const handleSynthesize = async () => {
    if (!storyboard) return;
    if (!live) { setToast('云端人声需要先在设置里配置接口；不配的话，系统神经音色也能朗读（但不能录进视频）'); return; }
    setSynthesizing(true);
    try {
      const ac = getAudioContext();
      const out: (AudioBuffer | null)[] = [];
      for (let i = 0; i < storyboard.scenes.length; i++) {
        const txt = (storyboard.scenes[i].narration || '').trim();
        if (!txt) { out.push(null); continue; }
        setBusy(`合成配音 ${i + 1}/${storyboard.scenes.length}`);
        try {
          // 逐句合成：每句按自己的语速和语气指令，句间插停顿 → 导出视频里是有起伏的人声
          const buf = await synthesizeNarration(settings, txt, ac, (d, t) =>
            setBusy(`合成配音 ${i + 1}/${storyboard.scenes.length}（第 ${d + 1}/${t} 句）`),
          );
          out.push(buf);
        } catch (e: any) {
          // 韵律合成失败（接口不支持等）→ 退回整段合成，至少保证有声音
          try {
            const arr = await synthesize(settings, txt);
            out.push(await ac.decodeAudioData(arr.slice(0)));
          } catch {
            throw e;
          }
        }
      }
      setBuffers(out);
      setToast('配音合成完成（带抑扬顿挫），导出的视频会有人声');
    } catch (e: any) {
      setToast(e?.message || '配音失败');
    } finally {
      setSynthesizing(false);
      setBusy('');
    }
  };

  const handleSbChange = (sb: Storyboard) => {
    const changed = !!buffers && sb.scenes.map((s) => s.narration).join('|') !== storyboard?.scenes.map((s) => s.narration).join('|');
    if (changed) {
      setBuffers(null);
      setToast('解说词改过了，配音需要重新合成');
    }
    setStoryboard(sb);
  };

  const regenerate = async () => {
    await handleGenerate();
  };

  const useStageVoice = (s: Stage) => {
    setStage(s);
    // 换学段时顺手换成更合适的音色（用户手动改过就不再自动覆盖）
    if (settings.voicePreset !== 'custom') {
      setSettings((prev) => ({ ...prev, voicePreset: presetForStage(s).id }));
    }
  };

  return (
    <div className="app" style={{ ['--accent' as any]: st.accent, ['--accent2' as any]: st.accent2 }}>
      <header className="top">
        <div className="brand">
          <div className="logo">题</div>
          <div>
            <h1>题说</h1>
            <p>拍照 → 讲题视频</p>
          </div>
        </div>
        <div className="top-actions">
          {live ? (
            <span className="mode-pill live" title={`解题：${settings.textModel || '-'}｜识题：${settings.visionModel || '-'}`}>
              {providerName}{activeModel ? ` · ${activeModel}` : ''}
            </span>
          ) : (
            <button
              className="mode-pill demo"
              onClick={() => setSettingsOpen(true)}
              title="点开设置，粘贴 Key 就会自动识别服务商（只配一次，自动记住）"
            >
              {settings.apiKey ? '⚠ 配置待完善 · 点我' : '本地模式 · 免 Key'}
            </button>
          )}
          <a className="btn ghost sm" href="./download.html" target="_blank" rel="noreferrer">📲 装到手机</a>
          <button className="btn ghost sm" onClick={() => setSettingsOpen(true)}>⚙ 设置</button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <h2>把一道题，讲成一个视频</h2>
            <p>拍照 → 识别题目 → 你核对修改 → 生成数形结合的分镜动画 + 人声讲解 → 一键导出，直接发抖音或班级群。</p>
          </div>
          <div className="stage-grid">
            {STAGES.map((s) => (
              <button
                key={s.key}
                className={`stage-card-btn ${stage === s.key ? 'on' : ''}`}
                style={{ ['--sc' as any]: s.accent }}
                onClick={() => useStageVoice(s.key)}
              >
                <span className="sc-emoji">{s.emoji}</span>
                <strong>{s.label}</strong>
                <small>{s.desc}</small>
              </button>
            ))}
          </div>
        </section>

        <div className="workspace">
          <aside className="panel">
            <div className="seg mode-seg">
              <button className={mode === 'solve' ? 'on' : ''} onClick={() => setMode('solve')}>拍照讲题</button>
              <button className={mode === 'custom' ? 'on' : ''} onClick={() => setMode('custom')}>定制讲解</button>
            </div>

            {mode === 'solve' ? (
              <>
                <div className="step-label"><b>1</b> 拍下题目</div>
                <Uploader image={image} onImage={(v) => { setImage(v); setOcrResult(null); }} onError={setToast} />

                <div className="row between mt12">
                  <div className="step-label no-mt"><b>2</b> 识别题目</div>
                  <button className="btn ghost sm" onClick={handleOcr} disabled={!image || !!ocrPct || !!busy}>
                    {ocrPct ? '识别中…' : '识别这道题'}
                  </button>
                </div>

                {ocrPct && (
                  <div className="ocr-progress">
                    <div className="bar"><i style={{ width: `${Math.round(ocrPct.pct * 100)}%` }} /></div>
                    <span>{ocrPct.label} {Math.round(ocrPct.pct * 100)}%</span>
                  </div>
                )}

                {ocrResult ? (
                  <OcrConfirm
                    image={image}
                    text={question}
                    result={ocrResult}
                    onChange={setQuestion}
                    onRetry={() => { setImage(null); setOcrResult(null); }}
                    onConfirm={handleGenerate}
                    onDismiss={() => setOcrResult(null)}
                    busy={!!busy}
                  />
                ) : (
                  <>
                    <div className="step-label"><b>3</b> 题目内容（可手改）</div>
                    <textarea
                      className="input area"
                      rows={4}
                      placeholder={'拍完点「识别这道题」，识别结果会出现在这里，你可以直接修改错字和符号…'}
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                    />
                  </>
                )}
              </>
            ) : (
              <>
                <div className="step-label"><b>1</b> 你的讲解思路</div>
                <textarea
                  className="input area tall"
                  rows={5}
                  placeholder={'例如：\n先讲为什么要配方（用图像看对称性），\n再推顶点式，\n最后给一个"看到 a>0 就找最低点"的秒杀口诀。\n（会严格按你写的顺序和重点生成）'}
                  value={plan}
                  onChange={(e) => setPlan(e.target.value)}
                />

                <div className="step-label"><b>2</b> 题目（可选）</div>
                <textarea
                  className="input area"
                  rows={3}
                  placeholder={'贴题目文本，或先切到「拍照讲题」识别后再回来'}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </>
            )}

            {!ocrResult && (
              <button className="btn primary block mt16" onClick={handleGenerate} disabled={!!busy}>
                {busy ? busy : mode === 'custom' ? '按我的思路生成视频' : '生成讲解视频'}
              </button>
            )}

            {!live && (
              <div className="free-tip">
                <strong>{settings.apiKey ? 'Key 已记住，还差一步' : '这套流程现在就能跑'}</strong>
                <p>
                  {settings.apiKey
                    ? '点右上角的状态标签打开设置，把 Key 粘到输入框就会自动识别服务商并填好接口和模型；识别不了就在「AI 服务商」里手动选一个（只配一次，之后永久生效）。'
                    : '识题用手机本机 OCR（离线、免费），一元一次/二次方程、四则运算这类题连讲解也能本机生成。更复杂的题目开通免费大模型即可：设置里直接粘贴智谱 Key（glm-4-flash 与 glm-4v-flash 免费），自动识别，不用手动选服务商。'}
                </p>
              </div>
            )}

            <div className="samples">
              <div className="samples-head">
                <span>示例（点一下直接看效果）</span>
              </div>
              <div className="chips">
                {stageSamples.map((s) => (
                  <button key={s.id} className="chip" onClick={() => pickSample(s)}>{s.label}</button>
                ))}
              </div>
              {stageSamples.length === 0 && <p className="tiny">这个学段暂无示例</p>}
            </div>

            <div className="tips">
              <div className="tips-title">{st.emoji} {st.label}讲解规则</div>
              <p>{st.hint}</p>
              <p className="tiny">当前音色：{voiceName}</p>
            </div>
          </aside>

          <section className="preview">
            <VideoStage
              storyboard={storyboard}
              settings={settings}
              buffers={buffers}
              synthesizing={synthesizing}
              onSynthesize={handleSynthesize}
            />

            {storyboard ? (
              <StoryboardList
                storyboard={storyboard}
                onChange={handleSbChange}
                onRegenerate={regenerate}
                regenerating={!!busy}
              />
            ) : (
              <div className="empty-hint">
                <h3>还没有讲解</h3>
                <p>左边拍一张题目，或者点一个示例，30 秒就能看到一条成片。</p>
                <div className="chips">
                  {SAMPLES.slice(0, 3).map((s) => (
                    <button key={s.id} className="chip" onClick={() => pickSample(s)}>{s.label}</button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      </main>

      <footer className="foot">
        <span>题说 Tishuo · 程序化动画渲染，数学不会画错</span>
        <span className="tiny">画布 30fps 逐帧录制 · 横屏/竖屏 · 可安装到手机桌面</span>
      </footer>

      {toast && <div className="toast">{toast}</div>}

      {settingsOpen && (
        <SettingsModal
          settings={settings}
          onChange={setSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
