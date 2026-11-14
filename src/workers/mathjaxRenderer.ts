import { mathjax } from '@mathjax/src/js/mathjax.js';
import { TeX } from '@mathjax/src/js/input/tex.js';
import { SVG } from '@mathjax/src/js/output/svg.js';
import { liteAdaptor } from '@mathjax/src/js/adaptors/liteAdaptor.js';
import { RegisterHTMLHandler } from '@mathjax/src/js/handlers/html.js';
import { MathJaxNewcmFont } from '@mathjax/mathjax-newcm-font/js/svg.js';

import '@mathjax/src/js/input/tex/base/BaseConfiguration.js';
import '@mathjax/src/js/input/tex/ams/AmsConfiguration.js';
import '@mathjax/src/js/input/tex/boldsymbol/BoldsymbolConfiguration.js';
import '@mathjax/src/js/input/tex/braket/BraketConfiguration.js';
import '@mathjax/src/js/input/tex/cancel/CancelConfiguration.js';
import '@mathjax/src/js/input/tex/cases/CasesConfiguration.js';
import '@mathjax/src/js/input/tex/color/ColorConfiguration.js';
import '@mathjax/src/js/input/tex/mathtools/MathtoolsConfiguration.js';
import '@mathjax/src/js/input/tex/physics/PhysicsConfiguration.js';
import '@mathjax/src/js/input/tex/extpfeil/ExtpfeilConfiguration.js';
import '@mathjax/src/js/input/tex/mhchem/MhchemConfiguration.js';
import '@mathjax/src/js/input/tex/enclose/EncloseConfiguration.js';
import '@mathjax/src/js/input/tex/newcommand/NewcommandConfiguration.js';
import '@mathjax/src/js/input/tex/unicode/UnicodeConfiguration.js';
import '@mathjax/src/js/input/tex/verb/VerbConfiguration.js';

import { stripOuterMathDelimiters, stripPlaceholdersForExport } from '../core/latex/protocol';
import { analyzeTopLevelMultiline } from '../core/latex/scanner';
import { ExportSvgResult } from '../core/types';

// Static dynamic-import registry so Vite bundles every NewCM dynamic font shard locally (0 CDN).
const DYNAMIC_FONT_LOADERS: Record<string, () => Promise<unknown>> = {
  'accents-b-i.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/accents-b-i.js'),
  'accents.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/accents.js'),
  'arabic.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/arabic.js'),
  'arrows.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/arrows.js'),
  'calligraphic.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/calligraphic.js'),
  'cyrillic-ss.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic-ss.js'),
  'cyrillic.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/cyrillic.js'),
  'double-struck.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/double-struck.js'),
  'fraktur.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/fraktur.js'),
  'greek-ss.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/greek-ss.js'),
  'greek.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/greek.js'),
  'hebrew.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/hebrew.js'),
  'latin-b.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-b.js'),
  'latin-bi.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-bi.js'),
  'latin-i.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin-i.js'),
  'latin.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/latin.js'),
  'marrows.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/marrows.js'),
  'math.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/math.js'),
  'monospace-ex.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-ex.js'),
  'monospace-l.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace-l.js'),
  'monospace.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/monospace.js'),
  'mshapes.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/mshapes.js'),
  'sans-serif-b.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-b.js'),
  'sans-serif-bi.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-bi.js'),
  'sans-serif-ex.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-ex.js'),
  'sans-serif-i.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-i.js'),
  'sans-serif-r.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif-r.js'),
  'sans-serif.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/sans-serif.js'),
  'script.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/script.js'),
  'shapes.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/shapes.js'),
  'symbols-b-i.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols-b-i.js'),
  'symbols.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/symbols.js'),
  'variants.js': () => import('@mathjax/mathjax-newcm-font/js/svg/dynamic/variants.js'),
};

let initialized = false;
let adaptor: ReturnType<typeof liteAdaptor>;
let htmlDocument: ReturnType<typeof mathjax.document>;

function ensureMathJaxInitialized() {
  if (initialized) return;

  mathjax.asyncLoad = async (file: string) => {
    const base = file.split('/').pop() ?? '';
    const loader = DYNAMIC_FONT_LOADERS[base];
    if (loader) {
      return loader();
    }
    throw new Error(`Unsupported offline MathJax dynamic font shard: ${file}`);
  };

  adaptor = liteAdaptor();
  RegisterHTMLHandler(adaptor);

  const tex = new TeX({
    packages: [
      'base',
      'ams',
      'boldsymbol',
      'braket',
      'cancel',
      'cases',
      'color',
      'mathtools',
      'physics',
      'extpfeil',
      'mhchem',
      'enclose',
      'newcommand',
      'unicode',
      'verb',
    ],
  });

  const svg = new SVG({
    fontCache: 'none',
    fontData: MathJaxNewcmFont,
  });

  htmlDocument = mathjax.document('', { InputJax: tex, OutputJax: svg });
  initialized = true;
}

function prepareTexForMathJax(rawLatex: string): string {
  const stripped = stripOuterMathDelimiters(rawLatex);
  const clean = stripPlaceholdersForExport(stripped).trim();
  if (!clean) return '';

  const analysis = analyzeTopLevelMultiline(clean);
  if (analysis.isTopLevelMultiline && !/^\\begin\{/.test(clean)) {
    const env = analysis.hasTopLevelAlignmentAmp ? 'aligned' : 'gathered';
    return `\\begin{${env}}\n${clean}\n\\end{${env}}`;
  }
  return clean;
}

function parseExDimension(svg: string, attr: 'width' | 'height'): number {
  const match = svg.match(new RegExp(`\\b${attr}="([\\d.]+)ex"`));
  return match ? Number.parseFloat(match[1]) : 10;
}

export async function compileTexToSvg(rawLatex: string): Promise<ExportSvgResult> {
  const tex = prepareTexForMathJax(rawLatex);
  if (!tex) {
    return { ok: false, svg: '', widthEx: 0, heightEx: 0, viewBox: '0 0 0 0', error: 'Empty formula' };
  }

  try {
    ensureMathJaxInitialized();
    const node = await mathjax.handleRetriesFor(() =>
      htmlDocument.convert(tex, { display: true })
    );
    const containerHtml = adaptor.innerHTML(node);
    const svgMatch = containerHtml.match(/<svg[\s\S]*<\/svg>/);
    if (!svgMatch) {
      return {
        ok: false,
        svg: '',
        widthEx: 0,
        heightEx: 0,
        viewBox: '0 0 0 0',
        error: 'MathJax did not return SVG output',
      };
    }

    const svg = svgMatch[0];
    const widthEx = parseExDimension(svg, 'width');
    const heightEx = parseExDimension(svg, 'height');
    const vbMatch = svg.match(/viewBox="([^"]+)"/);

    return {
      ok: true,
      svg,
      widthEx,
      heightEx,
      viewBox: vbMatch?.[1] ?? '0 0 100 100',
    };
  } catch (err) {
    return {
      ok: false,
      svg: '',
      widthEx: 0,
      heightEx: 0,
      viewBox: '0 0 0 0',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
