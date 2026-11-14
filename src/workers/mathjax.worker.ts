import { compileTexToSvg } from './mathjaxRenderer';

export interface MathJaxWorkerRequest {
  id: number;
  type: 'compile-svg';
  latex: string;
}

export interface MathJaxWorkerResponse {
  id: number;
  ok: boolean;
  svg: string;
  widthEx: number;
  heightEx: number;
  viewBox: string;
  error?: string;
}

self.onmessage = async (event: MessageEvent<MathJaxWorkerRequest>) => {
  const { id, type, latex } = event.data;
  if (type !== 'compile-svg') return;

  const result = await compileTexToSvg(latex);
  const response: MathJaxWorkerResponse = {
    id,
    ...result,
  };
  self.postMessage(response);
};
