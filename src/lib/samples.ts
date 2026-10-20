import type { Storyboard, Stage } from './types';

export interface Sample {
  id: string;
  stage: Stage;
  label: string;
  question: string;
  storyboard: Storyboard;
}

export const SAMPLES: Sample[] = [
  /* ---------------- 小学 1：异分母分数加法 ---------------- */
  {
    id: 'p-fraction',
    stage: 'primary',
    label: '二分之一 + 三分之一',
    question: '小明吃了蛋糕的 1/2，弟弟吃了蛋糕的 1/3，两人一共吃了这个蛋糕的几分之几？',
    storyboard: {
      stage: 'primary',
      topic: '异分母分数加法',
      answer: '5/6',
      source: 'demo',
      question: '',
      scenes: [
        {
          type: 'title',
          title: '半块蛋糕 + 一小块，是多少？',
          subtitle: '三年级 · 分数加法',
          narration: '妈妈买了一个大蛋糕，你吃了半个，弟弟吃了三分之一。你们一共吃了多少呢？先别急着算，我们把它画出来看看。',
        },
        {
          type: 'pie',
          mode: 'pie',
          title: '先看清楚：一半 和 三分之一',
          parts: [
            { label: '1/2', value: 3, color: '#FFB020' },
            { label: '1/3', value: 2, color: '#FF7A59' },
            { label: '剩下', value: 1, color: '#3A4560' },
          ],
          narration: '把蛋糕平均分成两份，一份就是二分之一；平均分成三份，一份就是三分之一。你看，这两块大小不一样，所以不能直接把分子相加。',
        },
        {
          type: 'pie',
          mode: 'strip',
          title: '都切成六份，就能加啦',
          parts: [
            { label: '3/6', value: 3, color: '#FFB020' },
            { label: '2/6', value: 2, color: '#FF7A59' },
            { label: '1/6', value: 1, color: '#3A4560' },
          ],
          narration: '现在把蛋糕平均切成六份。二分之一正好是三份，三分之一正好是两份。单位一样了，三份加两份，就是五份，也就是六分之五。',
        },
        {
          type: 'formula',
          math: '1/2 + 1/3\n= 3/6 + 2/6 = 5/6',
          note: '分母不同先通分，2 和 3 的最小公倍数是 **6**。',
          tip: '口诀：分母不同先通分，分子相加不变身',
          narration: '写下来就是：二分之一加三分之一，先把它们都变成六分之几，三加二等于五，所以答案是六分之五。',
        },
        {
          type: 'conclusion',
          title: '记住这句话',
          math: '5/6',
          subtitle: '通分，就是把不一样的"小块"变成一样大的"小块"',
          narration: '记住啦：分数相加，分母不一样的时候，先通分，让每一块一样大，再数一共有几块。',
        },
      ],
    },
  },

  /* ---------------- 小学 2：鸡兔同笼 ---------------- */
  {
    id: 'p-chicken',
    stage: 'primary',
    label: '鸡兔同笼（抬腿法）',
    question: '笼子里有鸡和兔共 35 只，一共 94 条腿。鸡和兔各有多少只？',
    storyboard: {
      stage: 'primary',
      topic: '鸡兔同笼',
      answer: '兔 12 只，鸡 23 只',
      source: 'demo',
      question: '',
      scenes: [
        {
          type: 'title',
          title: '鸡兔同笼，不许列方程！',
          subtitle: '四年级 · 抬腿法',
          narration: '鸡和兔子关在一个笼子里，一共三十五个头，九十四条腿。不许列方程，我们用一个特别好玩的办法。',
        },
        {
          type: 'objects',
          title: '先记住：鸡 2 条腿，兔 4 条腿',
          emoji: '🐔',
          groups: [
            { count: 4, emoji: '🐔', label: '鸡：2 条腿' },
            { count: 4, emoji: '🐰', label: '兔：4 条腿' },
          ],
          narration: '鸡有两条腿，兔子有四条腿。整道题的秘密，就在这个小小的差别里。',
        },
        {
          type: 'steps',
          title: '让所有动物都抬起两条腿',
          steps: [
            { text: '一共 35 个头，就有 35 只动物' },
            { text: '每只都抬起 2 条腿，共抬起 35 × 2 = 70 条', note: '鸡全抬完了，兔子还剩两条' },
            { text: '地上还剩 94 − 70 = 24 条腿' },
            { text: '这 24 条全是兔子的，每只兔 2 条', note: '24 ÷ 2 = 12 只兔' },
          ],
          note: '剩下的腿只属于兔子，这就是突破口',
          narration: '想象一声口令，所有动物都抬起两条腿。三十五只动物，一共抬起七十条腿。原来九十四条，地上还剩二十四条。鸡已经没腿可抬了，所以这二十四条全是兔子的。',
        },
        {
          type: 'formula',
          math: '兔 = (94 − 35 × 2) ÷ 2 = 12',
          note: '鸡 = 35 − 12 = **23** 只',
          tip: '先假设全是鸡，再看多出来的腿',
          narration: '写成算式：九十四减去三十五乘二，等于二十四，再除以二，兔子十二只。鸡就是三十五减十二，二十三只。',
        },
        {
          type: 'conclusion',
          title: '答案',
          math: '兔 12 只 · 鸡 23 只',
          subtitle: '先假设，再算差，最后除以每只的差',
          narration: '所以笼子里有十二只兔子、二十三只鸡。这个方法叫抬腿法，你也可以叫它假设法。',
        },
      ],
    },
  },

  /* ---------------- 初中 1：二次函数最值 ---------------- */
  {
    id: 'j-quadratic',
    stage: 'junior',
    label: '二次函数最小值',
    question: '求函数 y = x² − 2x − 3 的最小值，并写出取得最小值时 x 的值。',
    storyboard: {
      stage: 'junior',
      topic: '二次函数最值',
      answer: 'x = 1 时，最小值 −4',
      source: 'demo',
      question: '',
      scenes: [
        {
          type: 'title',
          title: 'y = x² − 2x − 3 的最小值',
          subtitle: '配方 → 看图 → 秒答',
          narration: '这道题很多同学直接代公式，其实只要配个方、画个图，答案一眼就能看出来。',
        },
        {
          type: 'formula',
          math: 'y = x² − 2x − 3\n= (x² − 2x + 1) − 1 − 3\n= (x − 1)² − 4',
          note: '加上 1 就要减掉 1，**别把常数丢了**。',
          tip: 'y = a(x − h)² + k ⇒ 顶点 (h, k)',
          narration: '先配方：x 平方减二 x，加上一就是一个完全平方，为了不改变大小，再减掉一，最后合并常数，得到 x 减一的平方再减四。',
        },
        {
          type: 'graph',
          title: '把它画出来',
          view: [-2, 4, -6, 4],
          curves: [{ expr: 'x^2-2*x-3', label: 'y = x²−2x−3', color: '#5EE7C4' }],
          vlines: [{ x: 1, label: '对称轴 x = 1' }],
          hlines: [{ y: -4, label: '最低点 −4' }],
          points: [
            { x: 1, y: -4, label: '顶点 (1, −4)' },
            { x: -1, y: 0, label: '(−1, 0)' },
            { x: 3, y: 0, label: '(3, 0)' },
          ],
          narration: '画出图像：开口向上，左右对称，最低点就在对称轴上面。横坐标是一，纵坐标是负四。',
        },
        {
          type: 'graph',
          title: '它其实是平移来的',
          view: [-2, 4, -6, 4],
          curves: [
            { expr: 'x^2', label: 'y = x²', color: '#7C9CFF', dashed: true },
            { expr: '(x-1)^2-4', label: 'y = (x−1)²−4', color: '#5EE7C4' },
          ],
          points: [{ x: 1, y: -4, label: '顶点 (1, −4)' }],
          narration: '对比 y 等于 x 平方：向右移一格，向下移四格。所以最小值就是负四，在 x 等于一处取到。',
        },
        {
          type: 'conclusion',
          title: '结论',
          math: '最小值 = −4（x = 1）',
          subtitle: '开口向上看最低点，开口向下看最高点，都在顶点处',
          narration: '所以答案：当 x 等于一时，函数取得最小值负四。二次函数求最值，先配方找顶点，再结合开口方向。',
        },
      ],
    },
  },

  /* ---------------- 初中 2：几何旋转 ---------------- */
  {
    id: 'j-rotate',
    stage: 'junior',
    label: '等边三角形旋转 60°',
    question:
      '等边三角形 ABC 中，D 是边 BC 上一点，将 △ABD 绕点 A 逆时针旋转 60° 得到 △ACD′。求证：BD = CD′。',
    storyboard: {
      stage: 'junior',
      topic: '旋转全等',
      answer: 'BD = CD′，因为旋转前后三角形全等',
      source: 'demo',
      question: '',
      scenes: [
        {
          type: 'title',
          title: '旋转 60° 之后，那条边去哪了？',
          subtitle: '等边三角形 · 旋转全等',
          narration: '看到六十度、看到等边三角形，第一反应应该是旋转。我们把三角形转一下，答案自己就跳出来了。',
        },
        {
          type: 'geometry',
          title: '先看清三角形',
          pts: [
            { id: 'A', x: 50, y: 14 },
            { id: 'B', x: 15, y: 82 },
            { id: 'C', x: 85, y: 82 },
            { id: 'D', x: 38, y: 82 },
          ],
          segs: [
            { a: 'A', b: 'B' },
            { a: 'B', b: 'C' },
            { a: 'C', b: 'A' },
          ],
          angles: [{ at: 'A', from: 'B', to: 'C', label: '60°' }],
          note: '等边三角形：三边相等，三个角都是 60°',
          narration: '等边三角形 ABC，三条边一样长，三个角都是六十度。D 是底边 BC 上的一点。',
        },
        {
          type: 'geometry',
          title: '把 △ABD 绕 A 转 60°',
          pts: [
            { id: 'A', x: 50, y: 14 },
            { id: 'B', x: 15, y: 82 },
            { id: 'C', x: 85, y: 82 },
            { id: 'D', x: 38, y: 82 },
          ],
          segs: [
            { a: 'A', b: 'B' },
            { a: 'B', b: 'C' },
            { a: 'C', b: 'A' },
            { a: 'A', b: 'D', dashed: true, delay: 0.5, label: 'AD' },
            { a: 'B', b: 'D', color: '#FFC24B', delay: 0.6, label: 'BD' },
          ],
          ghost: { rotate: { center: 'A', deg: 60 } },
          note: '旋转不改变长度，也不改变角度 —— 只改变位置',
          narration: '把三角形 ABD 绕点 A 逆时针旋转六十度。注意，旋转只改变位置，线段的长度和角的大小都不会变。',
        },
        {
          type: 'geometry',
          title: '为什么 AB 正好落在 AC 上？',
          pts: [
            { id: 'A', x: 50, y: 14 },
            { id: 'B', x: 15, y: 82 },
            { id: 'C', x: 85, y: 82 },
            { id: 'D', x: 38, y: 82 },
          ],
          segs: [
            { a: 'A', b: 'B' },
            { a: 'B', b: 'C' },
            { a: 'C', b: 'A' },
            { a: 'A', b: 'D', dashed: true, delay: 0.4 },
            { a: 'C', b: 'D', color: '#FFC24B', dashed: true, delay: 0.9, label: 'CD′' },
          ],
          angles: [{ at: 'A', from: 'B', to: 'C', label: '60°' }],
          ghost: { rotate: { center: 'A', deg: 60 } },
          note: 'AB = AC，又转了 60°，所以 B 落到 C，D 落到 D′',
          narration: '因为 AB 本来就等于 AC，而角 BAC 正好是六十度，所以 AB 转六十度以后，正好和 AC 重合。于是 B 点落到 C 点，D 点落到 D 一撇。',
        },
        {
          type: 'conclusion',
          title: '旋转全等',
          math: 'BD = CD′',
          subtitle: '对应边相等：转过去是谁，就和谁一样长',
          narration: '旋转前后两个三角形完全重合，BD 就对应 CD 一撇，所以它们相等。以后看到六十度、九十度，先想旋转。',
        },
      ],
    },
  },

  /* ---------------- 高中 1：对称轴秒杀 ---------------- */
  {
    id: 's-symmetry',
    stage: 'senior',
    label: '抽象函数对称轴',
    question: '已知函数 f(x) 对任意实数 x 都满足 f(x) = f(2 − x)，求 y = f(x) 图像的对称轴。',
    storyboard: {
      stage: 'senior',
      topic: '函数对称性',
      answer: '对称轴 x = 1',
      source: 'demo',
      question: '',
      scenes: [
        {
          type: 'title',
          title: '一个等式，秒出对称轴',
          subtitle: '抽象函数 · 三秒杀',
          narration: '这种题不要求解析式，只给一个等式。别慌，看括号里的 x 就够了。',
        },
        {
          type: 'formula',
          math: 'f(x) = f(2 − x)',
          note: '函数值相等 ⇒ 这两个自变量关于某条竖线**对称**',
          narration: '这个等式的意思是：当自变量取 x 和取二减 x 的时候，函数值一样。也就是说，这两个点一样高。',
        },
        {
          type: 'graph',
          title: '举一个符合条件的例子',
          view: [-1, 3, -1, 3],
          curves: [{ expr: '(x-1)^2', label: 'f(x) = (x−1)²', color: '#7C9CFF' }],
          points: [
            { x: 0, y: 1, label: '(0, 1)' },
            { x: 2, y: 1, label: '(2, 1)' },
            { x: 1, y: 0, label: '最低点 (1, 0)' },
          ],
          vlines: [{ x: 1, label: '对称轴 x = 1' }],
          narration: '取 x 等于零，另一个自变量就是二，两点函数值都是一。把这两个点连起来，中点的横坐标正好是一。',
        },
        {
          type: 'formula',
          math: 'x + (2 − x) = 2\n⇒ 对称轴 x = 2 ÷ 2 = 1',
          note: '括号里两个自变量相加，再除以 2，就是对称轴。',
          tip: 'f(a + x) = f(a − x) ⇒ 轴 x = a；f(x) = f(2a − x) ⇒ 轴 x = a',
          narration: '把括号里两个自变量加起来，x 加二减 x 等于二，再除以二，对称轴就是 x 等于一。这就是"和一半，就是轴"。',
        },
        {
          type: 'conclusion',
          title: '秒杀口诀',
          math: '对称轴 x = 1',
          subtitle: '括号里的 x 相加除以 2 —— 一秒出答案',
          narration: '所以对称轴是 x 等于一。记住这个口诀：括号里的自变量相加除以二，就是对称轴。',
        },
      ],
    },
  },

  /* ---------------- 高中 2：柯西不等式 ---------------- */
  {
    id: 's-cauchy',
    stage: 'senior',
    label: '柯西不等式求最值',
    question: '已知实数 a、b 满足 a² + b² = 5，求 3a + 4b 的最大值。',
    storyboard: {
      stage: 'senior',
      topic: '柯西不等式',
      answer: '5√5',
      source: 'demo',
      question: '',
      scenes: [
        {
          type: 'title',
          title: '3a + 4b 最大能到多少？',
          subtitle: '柯西不等式 · 数形结合',
          narration: '条件是平方和，要求的是乘积和。这种结构一出现，就该想到柯西不等式。',
        },
        {
          type: 'formula',
          math: '(a² + b²)(c² + d²) ≥ (ac + bd)²',
          note: '等号成立当且仅当 **a : b = c : d**',
          narration: '柯西不等式：两组数的平方和相乘，大于等于对应乘积之和的平方。取等条件是两组数成比例。',
        },
        {
          type: 'graph',
          title: '换个看法：圆和直线',
          view: [-4, 4, -4, 4],
          curves: [
            { expr: 'sqrt(5-x^2)', color: '#7C9CFF' },
            { expr: '-sqrt(5-x^2)', color: '#7C9CFF' },
            { expr: '(11.18-3*x)/4', label: '3a + 4b = 5√5', color: '#FFC24B', dashed: true },
          ],
          points: [{ x: 1.34, y: 1.79, label: '切点', color: '#FFC24B' }],
          area: undefined as any,
          narration: '把 a、b 看成坐标：a 平方加 b 平方等于五，就是一个半径根号五的圆。而 3a 加 4b 等于一个常数，是一条斜率固定的直线。直线平移，和圆相切的时候最大。',
        },
        {
          type: 'formula',
          math: '3a + 4b ≤ √((a² + b²)(3² + 4²))\n= √(5 × 25) = 5√5',
          note: '取等：a : b = 3 : 4，即 (a, b) = (3√5/5, 4√5/5)',
          narration: '套公式：a 平方加 b 平方是五，三平方加四平方是二十五，乘起来一百二十五，开根号就是五倍根号五。',
        },
        {
          type: 'conclusion',
          title: '结论',
          math: '最大值 = 5√5',
          subtitle: '平方和 × 平方和 ≥ 乘积和²，取等看比例',
          narration: '所以最大值是五倍根号五。看到平方和配平方和，就写柯西；别忘了检验取等条件。',
        },
      ],
    },
  },

  /* ---------------- 大学 1：重要极限 ---------------- */
  {
    id: 'c-limit',
    stage: 'college',
    label: '重要极限 sin x / x',
    question: '证明 lim(x→0) sin x / x = 1。',
    storyboard: {
      stage: 'college',
      topic: '重要极限',
      answer: '1',
      source: 'demo',
      question: '',
      scenes: [
        {
          type: 'title',
          title: '为什么 sin x / x 的极限是 1？',
          subtitle: '两个重要极限之一',
          narration: '这个极限不是"规定"的，它来自一个很干净的几何夹逼。先看直觉，再给证明。',
        },
        {
          type: 'graph',
          title: '先看直觉：原点附近几乎重合',
          view: [-8, 8, -2, 2],
          curves: [
            { expr: 'sin(x)', label: 'y = sin x', color: '#B79BFF' },
            { expr: 'x', label: 'y = x', color: '#FFC24B', dashed: true },
          ],
          narration: '把 y 等于 sin x 和 y 等于 x 画在一起。x 越靠近零，两条曲线贴得越紧，这就是极限等于一的直觉。',
        },
        {
          type: 'formula',
          title: '证明的关键：面积夹逼',
          math: 'sin x  <  x  <  tan x    (0 < x < π/2)',
          note: '单位圆中：小三角形面积 < 扇形面积 < 大三角形面积',
          narration: '在单位圆里比较三块面积：小三角形、扇形、大三角形。中间那块扇形的面积是 x 的一半，两边一夹，就得到这个不等式。',
        },
        {
          type: 'formula',
          math: 'cos x  <  sin x / x  <  1',
          note: '同除 sin x 后取倒数；x → 0⁺ 时 cos x → 1',
          tip: '由夹逼定理，两端都趋于 1，中间只能趋于 1',
          narration: '三边同时除以 sin x，再取倒数，就得到 cos x 小于 sin x 比 x 小于一。当 x 趋于零，cos x 趋于一，两端都趋于一，中间被夹住，只能趋于一。',
        },
        {
          type: 'conclusion',
          title: '结论',
          math: 'lim(x→0) sin x / x = 1',
          subtitle: '前提：x 用弧度制，且 x ≠ 0',
          narration: '所以极限等于一。注意两个前提：必须用弧度制，而且 x 本身不能等于零。',
        },
      ],
    },
  },

  /* ---------------- 大学 2：定积分 ---------------- */
  {
    id: 'c-integral',
    stage: 'college',
    label: '定积分算面积',
    question: '计算定积分 ∫₀¹ x² dx。',
    storyboard: {
      stage: 'college',
      topic: '定积分',
      answer: '1/3',
      source: 'demo',
      question: '',
      scenes: [
        {
          type: 'title',
          title: '∫₀¹ x² dx 到底在算什么？',
          subtitle: '定积分 · 面积与牛顿-莱布尼茨公式',
          narration: '先明确一件事：这个积分算的是曲线下的面积，不是求原函数本身。',
        },
        {
          type: 'graph',
          title: '几何意义：曲线下的面积',
          view: [-0.2, 1.4, -0.2, 1.4],
          curves: [{ expr: 'x^2', label: 'y = x²', color: '#B79BFF' }],
          area: { expr: 'x^2', from: 0, to: 1, color: '#B79BFF' },
          points: [
            { x: 1, y: 1, label: '(1, 1)' },
            { x: 1, y: 0, label: '1' },
          ],
          narration: '曲线 y 等于 x 平方，从零到一这一段，和 x 轴围成的面积，就是所求的积分值。',
        },
        {
          type: 'steps',
          title: '标准做法：四步',
          steps: [
            { text: '找被积函数的一个原函数', note: 'x² 的原函数是 x³/3' },
            { text: '写出牛顿-莱布尼茨公式', note: '∫ₐᵇ f(x)dx = F(b) − F(a)' },
            { text: '代入上限 1 和下限 0', note: 'F(1) = 1/3，F(0) = 0' },
            { text: '相减得到结果', note: '1/3 − 0 = 1/3' },
          ],
          note: '先原函数，再代上下限 —— 顺序不能反',
          narration: '做法很固定：第一步，找原函数，x 平方的原函数是三分之 x 立方；第二步，写牛顿-莱布尼茨公式；第三步，代入上限一和下限零；第四步，相减。',
        },
        {
          type: 'formula',
          math: '∫₀¹ x² dx = [ x³/3 ]₀¹\n= 1/3 − 0 = 1/3',
          note: '结果为正，与"面积"的几何意义一致。',
          tip: '若曲线在 x 轴下方，积分值为负，但面积要取绝对值',
          narration: '所以积分值等于三分之一。结果是正的，和面积的意义对得上。',
        },
        {
          type: 'conclusion',
          title: '结论',
          math: '∫₀¹ x² dx = 1/3',
          subtitle: '先找原函数，再代上下限；上下限的顺序决定正负',
          narration: '答案三分之一。记住：定积分是数，不定积分是函数族，别混。',
        },
      ],
    },
  },
];

export function samplesFor(stage: Stage) {
  return SAMPLES.filter((s) => s.stage === stage);
}

export function sampleById(id: string) {
  return SAMPLES.find((s) => s.id === id);
}
