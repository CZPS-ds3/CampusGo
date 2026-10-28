import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { DE } from '../src/de.js';
import { DE_EXTRA } from '../src/de-extra.js';
import { setSettings, t } from '../src/i18n.js';

afterEach(() => setSettings({ lang: 'en', theme: 'light', size: 'm' }));

function sourceFiles(dir) {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.jsx?$/.test(name) && !/^de(-extra)?\.js$/.test(name) ? [full] : [];
  });
}

describe('language, theme and font size', () => {
  it('translates by English key and fills placeholders', () => {
    setSettings({ lang: 'de' });
    expect(t('Start')).toBe("Los geht's");
    expect(t('Question {n}', { n: 3 })).toBe('Frage 3');
    setSettings({ lang: 'en' });
    expect(t('Question {n}', { n: 3 })).toBe('Question 3');
  });

  it('shows the English text when a German one is missing', () => {
    setSettings({ lang: 'de' });
    expect(t('A text nobody translated')).toBe('A text nobody translated');
  });

  it('writes the settings to the page so CSS can follow them', () => {
    setSettings({ lang: 'de', theme: 'dark', size: 'xl' });
    const root = document.documentElement;
    expect(root.dataset.theme).toBe('dark');
    expect(root.lang).toBe('de');
    expect(root.style.getPropertyValue('--fs')).toBe('1.3');
  });

  it('every text passed to t() in the app has a German translation', () => {
    const call = /\bt\(\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/g;
    const missing = new Set();
    for (const file of sourceFiles(join(__dirname, '..', 'src'))) {
      for (const match of readFileSync(file, 'utf8').matchAll(call)) {
        const key = (match[1] ?? match[2]).replace(/\\'/g, "'");
        if (!DE.has(key) && !DE_EXTRA.has(key)) missing.add(key);
      }
    }
    expect([...missing]).toEqual([]);
  });
});
