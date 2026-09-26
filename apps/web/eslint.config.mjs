import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  ...compat.extends('next/core-web-vitals'),
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  { rules: { 'react-hooks/exhaustive-deps': 'off', '@next/next/no-img-element': 'off', 'react/no-unescaped-entities': 'off' } },
];
