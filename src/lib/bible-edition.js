export const BIBLE_EDITION = Object.freeze({
  id: 'blivre',
  revision: 'blivre-2018-2026-11-15',
  title: 'Bíblia Livre (2018)',
  abbreviation: 'BLIVRE',
  language: 'pt-BR',
  source: 'eBible.org',
  sourceUrl: 'https://ebible.org/porbr2018/',
  credits: '© 2018 Diego Santos, Mario Sérgio e Marco Teles',
  license: 'CC BY 4.0',
  licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
});

// A different edition must never reuse a chapter saved by the old providers.
export const bibleCacheKey = (book, chapter) => `ls_bible_${BIBLE_EDITION.revision}_${book}_${chapter}`;
