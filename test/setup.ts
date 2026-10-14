import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Storage exists only in the jsdom environment (some tests opt into `@vitest-environment node`).
afterEach(() => { cleanup(); if (typeof localStorage !== 'undefined') { localStorage.clear(); sessionStorage.clear(); } });
