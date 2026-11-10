import type { ReactNode } from 'react';

export class ConvexReactClient {}
export const ConvexProviderWithAuth = ({ children }: { children: ReactNode }) => children;
export const ConvexProvider = ({ children }: { children: ReactNode }) => children;
export const useConvex = () => null;

const encoder = (text: string) => `data:text/plain;base64,${btoa(text)}`;

export const MOCK_FILES = [
  {
    id: 'att-1',
    name: 'field-notes.md',
    ext: 'md',
    kind: 'text',
    size: 43,
    createdAt: Date.now() - 60_000,
    url: encoder('# Field notes\n\nValidation on field photos.\n'),
  },
  {
    id: 'att-2',
    name: 'run-metrics.csv',
    ext: 'csv',
    kind: 'sheet',
    size: 60,
    createdAt: Date.now() - 120_000,
    url: encoder('run,accuracy,f1\nr1,0.914,0.908\nr2,0.902,0.895\n'),
  },
  {
    id: 'att-3',
    name: 'signed-handoff.pdf',
    ext: 'pdf',
    kind: 'pdf',
    size: 16,
    createdAt: Date.now() - 180_000,
    url: encoder('%PDF-1.4\n% demo\n'),
  },
];

export function useQuery() {
  return MOCK_FILES;
}

export function useMutation() {
  return async () => undefined;
}

export function useAction() {
  return async () => ({ sent: false, configured: false });
}
