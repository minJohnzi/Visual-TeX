# LaTeX Formula Editor (LaTeX 可视化数学公式编辑器)

<div align="center">

[![Built with Google AI Studio](https://img.shields.io/badge/Built%20with-Google%20AI%20Studio-4285F4?style=for-the-badge&logo=google&logoColor=white)](https://aistudio.google.com/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-8-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind%20CSS-4-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)

<p align="center">
  <b>现代化所见即所得数学公式工作台 · 双模式平滑切换 · 毫秒级 KaTeX 实时渲染 · 多格式高保真矢量导出</b>
</p>

</div>

---

> 💡 **项目声明**：本项目由 **[Google AI Studio](https://aistudio.google.com/)** 辅助设计与全栈构建。集成了 **Symbolab 式直观排版交互** 与 **KaTeX / MathJax 极致排版速度**，支持高清 PNG、纯矢量 SVG、Word 原生 MathML、独立离线 HTML 及 LaTeX 源码导出。

---

## 🌟 核心功能特性

### 1. 🎛️ 双模式平滑切换 (Dual Input Modes)
- **所见即所得视觉模式 (Symbolab 交互体验)**：
  - 基于现代 Web Component `<math-field>` (MathLive) 构建；
  - 输入框内实时排版，呈现虚线方框占位符（如 $\frac{\square}{\square}$）；
  - 支持键盘方向键（`←` `→` `↑` `↓`）或 `Tab` 键在分子、分母、根号内外平滑跳转；
  - 自动将用户视觉输入无缝同步输出为标准 LaTeX 源码。
- **LaTeX 源码模式 (Raw LaTeX Source)**：
  - 经典代码等宽纯文本编辑框；
  - 支持原生语法高亮、自动定界符配对及快速格式化。
- **双向无缝数据同步**：切换模式时已编辑内容百分之百保留与还原，并在 `localStorage` 中自动记住用户偏好的输入模式。

---

### 2. 🧮 智能符号面板 (Intelligent Symbol Palette)
- **6 大专业数学分类**：
  1. **常用代数 (Algebra)**：分式、行内分式 (`\dfrac`)、上标、下标、上下标、根号、n次方根、二项式系数 (`\binom`)、算符、自适应括号、初等函数 (`\sin`、`\cos`、`\tan`、`\arctan`、`\ln`、`\log`、`e^x`)、省略号 (`\dots`, `\cdots`)；
  2. **微积分 (Calculus)**：极限 (`\lim`)、不定积分、定积分、二重/三重/环路积分 (`\iint`, `\iiint`, `\oint`)、常导数、偏导数、二阶偏导、求和 (`\sum`)、连乘 (`\prod`)、微分算子 (`\mathrm{d}x`)、梯度算子 (`\nabla`)、增量 (`\Delta`)、偏导符号 (`\partial`)；
  3. **希腊字母 (Greek Letters)**：全套常用小写（含自控高频 $\alpha, \beta, \gamma, \delta, \epsilon, \varepsilon, \zeta, \eta, \theta, \vartheta, \iota, \kappa, \lambda, \mu, \nu, \xi, \pi, \rho, \sigma, \tau, \phi, \varphi, \chi, \psi, \omega$）与大写希腊字母（$\Gamma, \Delta, \Theta, \Lambda, \Xi, \Pi, \Sigma, \Phi, \Psi, \Omega$）；
  4. **矩阵与线性代数 (Matrices & Linear Algebra)**：$2\times 2$ / $3\times 3$ 圆括号矩阵 (`pmatrix`)、方括号矩阵 (`bmatrix`)、行列式 (`vmatrix`)、方程组 (`cases`)、多行对齐 (`aligned`)、行/列向量、转置 ($A^T$)、逆矩阵 ($A^{-1}$)、内积 ($\langle u, v \rangle$)、克罗内克积 ($\otimes$)、垂直/对角省略号 (`\vdots`, `\ddots`)；
  5. **关系与集合 (Relations & Sets)**：不等式与关系符 ($\le, \ge, \neq, \approx, \equiv, \ll, \gg$)、集合论 ($\in, \notin, \subset, \subseteq, \cup, \cap, \emptyset$)、标准间距条件竖线 (`\mid`)、数理逻辑符号 ($\forall, \exists, \because, \therefore, \land, \lor, \neg$)、各类箭头；
  6. **修饰符与字体 (Accents & Fonts)**：向量 (`\vec`)、尖帽估计值 (`\hat`)、平均值横线 (`\bar`)、长横线 (`\overline`)、波浪线 (`\tilde`)、下划线 (`\underline`)、自控一阶/二阶导数点 (`\dot`, `\ddot`)、加框 (`\boxed`)、黑板粗体/常用数集 ($\mathbb{R}, \mathbb{C}, \mathbb{Z}, \mathbb{Q}, \mathbb{N}$) 等。
- **智能附着与占位符填充算法**：
  - 如输入 `1` 后点击“上标 (幂)”，上标会自动智能附着在 `1` 的右上角创建虚线占位框并锁定光标，随后输入 `2` 直接生成 `1^2`，底数绝不被覆盖；
  - 支持**选中文本自动包裹**：选中内容后点击分式、根号、加框或括号，选中文本自动填入分子或结构内部；
  - 全面板按钮配备防失焦保护（`onMouseDown={(e) => e.preventDefault()}`），点击按钮绝不丢失当前输入框的光标位置与高亮选区；
  - 矩阵与复杂公式防溢出缩放机制（`transform scale-80`），大括号绝不溢出或穿透相邻卡片。

---

### 3. ⚡ 实时 KaTeX 渲染与状态指示 (Live Rendering & Feedback)
- **毫秒级防抖渲染**：基于 KaTeX 引擎提供流畅的即时高清渲染反馈；
- **渲染状态指示徽章**：实时呈现 `Ready`（就绪）、`Compiling`（编译中）、`Error`（语法错误）状态；
- **错误行号与精准提示**：语法不合规时高亮显示错误详情；
- **宽容容错渲染**：智能适配 MathLive 虚拟占位符（`#?`、`\placeholder{}`、`\square`），即使公式尚未输入完整也能清晰预览。

---

### 4. 📤 高保真多格式导出 (Export & Sharing)
- **高清 PNG 图片**：
  - 支持 `100%` ~ `300%` 多档高清缩放比率；
  - 支持透明棋盘格底色（透明背景 PNG）、纯白底色、灰色及深色底色；
  - 支持**一键复制 PNG 到系统剪贴板**或**一键下载 PNG 图片**。
- **纯净矢量 SVG**：
  - 基于 MathJax 3 矢量路径渲染，无限放大不失真；
  - 支持**复制 SVG 源码**与**下载 SVG 文件**。
- **Word 原生公式 (MathML)**：
  - 一键复制标准 MathML 代码，在 Microsoft Word 中按 `Ctrl+V` 可直接转换为 Word 原生公式对象。
- **复制 LaTeX 源码**：
  - 编辑器工具栏及预览区均支持一键复制完整 LaTeX 源码，配备轻提示反馈。
- **独立离线 HTML 文件**：
  - 导出一个内嵌 KaTeX 离线样式的单文件 HTML，断网环境下双击文件即可完美展示公式。

---

### 5. 🌐 中英文双语国际化 (i18n Support)
- 原生轻量 React Context 实现，零外部重型依赖；
- 支持**简体中文 (Simplified Chinese)** 与 **English** 一键平滑切换；
- 自动根据浏览器语言环境优先适配，并通过 `localStorage` 记忆用户语言偏好。

---

### 6. 🕒 历史记录与公式模板库
- **版本历史下拉菜单**：快速查看与恢复最近编辑的 5 个公式版本；
- **会话步退/步进栈**：提供 10 级局部 Undo / Redo；
- **草稿自动保存**：编辑内容实时持久化至本地存储，防误关防丢失；
- **经典公式库 (Classic Formulas)**：
  - 内置一元二次方程求根公式、欧拉恒等式、高斯分布密度、麦克斯韦方程组、含时薛定谔方程、傅里叶变换、泰勒展开、分段函数、质能守恒等常用高频公式，一键载入学习与修改。

---

### 7. 🌗 深浅双主题与现代 UI
- 深色模式 (Dark Mode) 与 浅色模式 (Light Mode) 一键切换；
- 专属定制现代化微胶囊滚动条（彻底告别 Windows 原生滚动条白色边框与箭头）；
- 优雅响应式布局，兼顾桌面端与移动端使用体验。

---

## 🛠️ 技术栈 (Tech Stack)

| 模块 | 技术选型 | 说明 |
| :--- | :--- | :--- |
| **构建平台** | Google AI Studio | 交互式全栈构建与设计支持 |
| **前端框架** | React 19 + TypeScript | 函数式组件、Hooks 规范 |
| **构建工具** | Vite 8 | 极速热重载与模块打包 |
| **样式方案** | Tailwind CSS 4 | 现代原子化 CSS、响应式与深浅主题 |
| **可视化数学编辑** | MathLive (`<math-field>`) | 原生 Web Component，Symbolab 级交互体验 |
| **实时数学渲染** | KaTeX 0.19 | 毫秒级极速 LaTeX 数学排版 |
| **矢量图形生成** | MathJax 3 | 纯矢量 SVG 路径转换与导出 |
| **图片导出转换** | html-to-image | 高清 Canvas 栅格化与 PNG 导出 |
| **图标库** | Lucide React | 现代简洁矢量图标 |

---

## 📁 项目目录结构

```text
├── .gitignore                  # Git 忽略文件配置
├── LICENSE                     # MIT 开源许可证
├── README.md                   # 项目完整中英文说明文档
├── index.html                  # 页面 HTML 模板入口，预载 KaTeX 与 MathJax
├── package.json                # 项目依赖与运行脚本
├── tsconfig.json               # TypeScript 严格配置
├── vite.config.ts              # Vite 构建配置
├── src/
│   ├── main.tsx                # 应用渲染挂载入口
│   ├── App.tsx                 # 主工作台容器（导航栏、模态框、状态管理）
│   ├── index.css               # 全局样式、深浅主题 Token、现代滚动条
│   ├── components/
│   │   ├── FormulaEditor.tsx   # 编辑器核心（双模式切换、MathLive、Textarea、工具栏、复制功能）
│   │   ├── FormulaPreview.tsx  # 实时高清预览与导出面板（PNG/SVG/MathML）
│   │   └── SymbolPalette.tsx   # 6 大类符号面板、按钮排版与缩放保护
│   ├── data/
│   │   └── symbols.ts          # 符号分类数据、LaTeX 模板、经典公式库
│   ├── i18n/
│   │   ├── types.ts            # 国际化翻译类型规范
│   │   ├── context.tsx         # i18n Context 与 useI18n Hook
│   │   └── locales/
│   │       ├── zh.ts           # 简体中文语言包
│   │       └── en.ts           # English 语言包
│   ├── types/
│   │   └── formula.ts          # 公式渲染与编译状态类型
│   └── utils/
│       ├── insertHandler.ts    # 符号智能附着与占位符填充算法
│       ├── latex.ts            # KaTeX 安全容错渲染与词法解析
│       └── exportPng.ts        # 高清 PNG、纯矢量 SVG、Word MathML 导出驱动
```

---

## 🚀 本地快速启动

### 1. 安装依赖
```bash
npm install
```

### 2. 启动本地开发服务
```bash
npm run dev
```
开发服务器启动后，在浏览器中打开 `http://localhost:3000` 即可开始使用。

### 3. 代码规范检查与打包构建
```bash
# 类型检查
npm run lint

# 生产环境打包
npm run build

# 预览生产构建成果
npm run preview
```

---

## 📦 推送到 GitHub 仓库指南 (Push to GitHub)

如果您需要将本项目推送到您自己的 GitHub 仓库，可按如下步骤操作：

```bash
# 1. 初始化本地 Git 仓库（若尚未初始化）
git init

# 2. 添加所有项目文件到暂存区
git add .

# 3. 提交本地代码
git commit -m "feat: initial commit of LaTeX formula editor built with AI Studio"

# 4. 关联您的 GitHub 远程仓库 (替换为您的实际仓库地址)
git remote add origin https://github.com/<your-username>/<your-repo-name>.git

# 5. 推送到 GitHub 主分支
git branch -M main
git push -u origin main
```

---

## 🤖 构建声明 (Built with AI Studio)

本项目由 **[Google AI Studio](https://aistudio.google.com/)** 辅助设计与全栈构建。
- **构建平台**：Google AI Studio Build
- **核心理念**：打造开源、直观、高性能的现代化数学公式编辑环境。
- **免责与开源**：项目代码完全开源，遵循 MIT License，可自由用于学术研究、教学及商业项目。

---

## ⌨️ 常用快捷键

| 快捷键 | 功能说明 |
| :--- | :--- |
| `Tab` | 在视觉模式占位框（分子/分母/根号）间跳至下一项；源码模式跳至下一 `\square` |
| `Shift + Tab` | 视觉模式跳至上一占位框 |
| `←` `→` `↑` `↓` | 视觉模式下在分子分母和表达式前后平滑漫游 |
| `Ctrl + Z` / `⌘ + Z` | 撤销上一步编辑操作 |
| `Ctrl + Y` / `⌘ + Shift + Z` | 重做下一步编辑操作 |

---

## 📄 开源许可证 (License)

本项目采用 [MIT License](LICENSE) 开源许可证。欢迎自由 fork、修改与提交 Pull Request！
