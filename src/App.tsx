import { useEffect, useMemo, useState } from 'react';
import { STAGES, stageMeta } from './engine/theme';
import { VideoStage } from './components/VideoStage';
import { StoryboardList } from './components/StoryboardList';
import { SettingsModal } from './components/SettingsModal';
import { Uploader } from './components/Uploader';
import { generateStoryboard, isConfigured, ocrQuestion, PROVIDERS, synthesize } from './lib/ai';
import { getAudioContext } from './engine/player';
import { loadSettings, saveSettings } from './lib/store';
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

  const demo = !isConfigured(settings);
  const st = stageMeta(stage);
  const providerName = PROVIDERS.find((p) => p.id === settings.providerId)?.name || '自定义';

  useEffect(() => { saveSettings(settings); }, [settings]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(''), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const stageSamples = useMemo(() => samplesFor(stage), [stage]);

  const pickSample = (s: Sample) => {
    setStage(s.stage);
    setMode('solve');
    setImage(null);
    setQuestion(s.question);
    setStoryboard({ ...s.storyboard, question: s.question, createdAt: Date.now() });
    setBuffers(null);
    setToast(`已载入示例：${s.label}（可直接播放 / 导出）`);
  };

  const handleOcr = async () => {
    if (!image) { setToast('先拍一张题目照片'); return; }
    if (demo) {
      const s = stageSamples[0];
      setQuestion(s.question);
      setToast('演示模式不调用识题接口，已填入示例题目。配置 Key 后即可真实识别。');
      return;
    }
    setBusy('正在识别题目…');
    try {
      const text = await ocrQuestion(settings, image);
      setQuestion(text);
      setToast('题目已识别，可手动修正');
    } catch (e: any) {
      setToast(e?.message || '识别失败');
    } finally {
      setBusy('');
    }
  };

  const handleGenerate = async () => {
    if (mode === 'solve' && !question.trim()) { setToast('先输入题目，或上传图片后识别'); return; }
    if (mode === 'custom' && !plan.trim()) { setToast('写下你的讲解思路，我按顺序生成'); return; }

    if (demo) {
      const s = stageSamples[0];
      setStoryboard({
        ...s.storyboard,
        question: question.trim() || s.question,
        stage,
        createdAt: Date.now(),
      });
      setBuffers(null);
      setToast(mode === 'custom'
        ? '演示模式：先用示例分镜占位。填入模型 Key 后，才会真正按你的思路重排讲解。'
        : '演示模式：已用内置分镜渲染。配置模型 Key 后，这里会变成针对你题目的真实讲解。');
      return;
    }

    setBusy(mode === 'custom' ? '正在按你的思路编排分镜…' : '正在解题并设计分镜…');
    try {
      const sb = await generateStoryboard(settings, stage, question.trim(), mode === 'custom' ? plan.trim() : undefined);
      setStoryboard(sb);
      setBuffers(null);
      setToast('讲解已生成，点播放预览');
    } catch (e: any) {
      setToast(e?.message || '生成失败');
    } finally {
      setBusy('');
    }
  };

  const handleSynthesize = async () => {
    if (!storyboard) return;
    if (!isConfigured(settings)) { setToast('请先在设置里配置模型接口'); return; }
    setSynthesizing(true);
    try {
      const ac = getAudioContext();
      const out: (AudioBuffer | null)[] = [];
      for (let i = 0; i < storyboard.scenes.length; i++) {
        const txt = (storyboard.scenes[i].narration || '').trim();
        if (!txt) { out.push(null); continue; }
        setBusy(`合成配音 ${i + 1}/${storyboard.scenes.length}`);
        const arr = await synthesize(settings, txt);
        const buf = await ac.decodeAudioData(arr.slice(0));
        out.push(buf);
      }
      setBuffers(out);
      setToast('配音合成完成，现在导出的视频会带人声');
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
          <span className={`mode-pill ${demo ? 'demo' : 'live'}`}>
            {demo ? '演示模式' : providerName}
          </span>
          <button className="btn ghost sm" onClick={() => setSettingsOpen(true)}>⚙ 设置</button>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-text">
            <h2>把一道题，讲成一个视频</h2>
            <p>拍照上传 → 自动识题 → 生成分镜动画与人声讲解 → 一键导出，直接发抖音或班级群。</p>
          </div>
          <div className="stage-grid">
            {STAGES.map((s) => (
              <button
                key={s.key}
                className={`stage-card-btn ${stage === s.key ? 'on' : ''}`}
                style={{ ['--sc' as any]: s.accent }}
                onClick={() => setStage(s.key)}
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
                <div className="step-label"><b>1</b> 上传题目</div>
                <Uploader image={image} onImage={setImage} onError={setToast} />

                <div className="row between mt12">
                  <div className="step-label no-mt"><b>2</b> 题目内容</div>
                  <button className="btn ghost sm" onClick={handleOcr} disabled={!image || !!busy}>
                    {demo ? '填入示例题' : 'AI 识别'}
                  </button>
                </div>
                <textarea
                  className="input area"
                  rows={4}
                  placeholder={'拍完点「AI 识别」，也可以直接把题目打在这里…'}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                />
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

            <button className="btn primary block mt16" onClick={handleGenerate} disabled={!!busy}>
              {busy ? busy : mode === 'custom' ? '按我的思路生成视频' : '生成讲解视频'}
            </button>

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
                <p>左边上传题目或点一个示例，30 秒就能看到一条成片。</p>
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
        <span className="tiny">画布 30fps 逐帧录制 · 支持横屏/竖屏 · 全部在本机完成</span>
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
