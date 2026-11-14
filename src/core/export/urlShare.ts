import { ContentBlock, DelimiterMode, DocMode } from '../types';

export interface DecodedSharePayload {
  mode: DocMode;
  singleLatex: string;
  blocks: ContentBlock[];
  delimiterMode: DelimiterMode;
}

const VALID_DELIMITERS = new Set<DelimiterMode>(['none', 'inline', 'display', 'equation']);

function encodeBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function decodeBase64Url(encoded: string): string {
  const padded =
    encoded.replace(/-/g, '+').replace(/_/g, '/') +
    '='.repeat((4 - (encoded.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function defaultIdFactory(prefix = 'shared', index = 0): string {
  return `${prefix}-${index + 1}-${Date.now().toString(36)}`;
}

export function encodeFormulaToUrlHash(
  input:
    | string
    | {
        mode: DocMode;
        singleLatex: string;
        blocks: ContentBlock[];
        delimiterMode?: DelimiterMode;
      },
  baseUrl = ''
): string {
  const cleanBase = baseUrl.split('#')[0];

  if (typeof input === 'string') {
    return `${cleanBase}#tex=b64.${encodeBase64Url(input)}`;
  }

  const delimiterMode: DelimiterMode = input.delimiterMode ?? 'none';
  if (input.mode === 'single' && delimiterMode === 'none') {
    return `${cleanBase}#tex=b64.${encodeBase64Url(input.singleLatex)}`;
  }

  const compactDoc = {
    v: 1,
    m: input.mode,
    d: delimiterMode,
    s: input.singleLatex,
    b: input.blocks.map((block) =>
      block.type === 'text'
        ? { t: 't', c: block.content }
        : { t: 'm', l: block.latex }
    ),
  };

  return `${cleanBase}#doc=b64.${encodeBase64Url(JSON.stringify(compactDoc))}`;
}

export function parseFormulaFromLocation(
  loc: string | { hash?: string; search?: string } | null | undefined,
  idFactory: (index: number, type: 'text' | 'math') => string = (index, type) =>
    defaultIdFactory(type === 'text' ? 'txt' : 'math', index)
): DecodedSharePayload | null {
  if (!loc) return null;

  const rawHash = typeof loc === 'string' ? loc : (loc.hash ?? '');
  const trimmedHash = rawHash.trim().replace(/^#/, '');
  if (!trimmedHash) return null;

  const params = new URLSearchParams(trimmedHash);
  const docParam = params.get('doc');
  if (docParam) {
    try {
      const jsonText = docParam.startsWith('b64.')
        ? decodeBase64Url(docParam.slice(4))
        : docParam;
      const parsed = JSON.parse(jsonText) as {
        v?: number;
        m?: string;
        d?: string;
        s?: string;
        b?: Array<{ t?: string; c?: string; l?: string }>;
      };
      if (parsed && typeof parsed === 'object') {
        const mode: DocMode = parsed.m === 'mixed' ? 'mixed' : 'single';
        const delimiterMode: DelimiterMode =
          parsed.d && VALID_DELIMITERS.has(parsed.d as DelimiterMode)
            ? (parsed.d as DelimiterMode)
            : 'none';
        const singleLatex = typeof parsed.s === 'string' ? parsed.s : '';
        const blocks: ContentBlock[] = [];
        if (Array.isArray(parsed.b)) {
          parsed.b.forEach((item, index) => {
            if (!item || typeof item !== 'object') return;
            if (item.t === 't' && typeof item.c === 'string') {
              blocks.push({ id: idFactory(index, 'text'), type: 'text', content: item.c });
            } else if (item.t === 'm' && typeof item.l === 'string') {
              blocks.push({ id: idFactory(index, 'math'), type: 'math', latex: item.l });
            }
          });
        }
        if (singleLatex.length > 0 || blocks.length > 0) {
          const safeBlocks =
            blocks.length > 0
              ? blocks
              : [
                  { id: idFactory(0, 'text'), type: 'text' as const, content: '' },
                  { id: idFactory(1, 'math'), type: 'math' as const, latex: singleLatex },
                ];
          return {
            mode,
            singleLatex:
              singleLatex ||
              (safeBlocks.find((b): b is Extract<ContentBlock, { type: 'math' }> => b.type === 'math')?.latex ?? ''),
            blocks: safeBlocks,
            delimiterMode,
          };
        }
      }
    } catch {
      return null;
    }
  }

  const texParam = params.get('tex');
  if (texParam !== null) {
    try {
      const latex = texParam.startsWith('b64.')
        ? decodeBase64Url(texParam.slice(4))
        : texParam;
      if (latex.trim().length > 0) {
        return {
          mode: 'single',
          singleLatex: latex,
          delimiterMode: 'none',
          blocks: [
            { id: idFactory(0, 'text'), type: 'text', content: '' },
            { id: idFactory(1, 'math'), type: 'math', latex },
          ],
        };
      }
    } catch {
      return null;
    }
  }

  return null;
}
