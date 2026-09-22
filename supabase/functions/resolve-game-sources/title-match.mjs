const ROMAN_NUMERALS = new Map([
  ['i','1'],['ii','2'],['iii','3'],['iv','4'],['v','5'],['vi','6'],['vii','7'],['viii','8'],['ix','9'],['x','10'],
  ['xi','11'],['xii','12'],['xiii','13'],['xiv','14'],['xv','15'],['xvi','16'],['xvii','17'],['xviii','18'],['xix','19'],['xx','20'],
]);

function decodeEntities(value) {
  return String(value ?? '')
    .replace(/&#(\d+);/g, (_, code) => {
      try { return String.fromCodePoint(Number(code)); } catch { return ' '; }
    })
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function noiseAnnotation(value) {
  const text = String(value ?? '').toLowerCase();
  return /^\s*(?:19|20)\d{2}(?:\s*[-–—]\s*(?:19|20)\d{2})?\s*$/.test(text)
    || /\b(?:torrent|repack|fitgirl|dodi|steamrip|gog|pt[\s-]?br|traduc|translation|portable|crack|multi\d*|x64|x86|build|version|vers[aã]o|update|dlc|download)\b/i.test(text)
    || /\bv\s*\d+(?:\.\d+)+/i.test(text);
}

export function canonicalGameTitle(value) {
  let text = decodeEntities(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[™®©]/g, '')
    .toLowerCase();

  text = text
    .replace(/\bgame\s+of\s+the\s+year(?:\s+edition)?\b/g, ' goty ')
    .replace(/\bg\.?\s*o\.?\s*t\.?\s*y\.?(?:\s+edition)?\b/g, ' goty ')
    .replace(/\bdefinitive\s+edition\b/g, ' definitive ')
    .replace(/\bcomplete\s+edition\b/g, ' complete ')
    .replace(/\bultimate\s+edition\b/g, ' ultimate ')
    .replace(/\bdeluxe\s+edition\b/g, ' deluxe ')
    .replace(/\bgold\s+edition\b/g, ' gold ')
    .replace(/\banniversary\s+edition\b/g, ' anniversary ')
    .replace(/\bspecial\s+edition\b/g, ' special ');

  text = text.replace(/[\[(\{]([^\])\}]{1,140})[\])\}]/g, (full, inside) =>
    noiseAnnotation(inside) ? ' ' : ` ${inside} `);

  text = text
    .replace(/\bv\s*\d+(?:\.\d+)+(?:[a-z0-9.-]*)?\b/gi, ' ')
    .replace(/\b(?:version|vers[aã]o|build)\s*\d+(?:\.\d+)*(?:[a-z0-9.-]*)?\b/gi, ' ')
    .replace(/\s+[–—-]\s+v\s*\d+[\s\S]*$/gi, ' ')
    .replace(/\b(?:torrent|free\s+download|download|repack|traduc(?:ao|a[oã])|translation|pt[\s-]?br)\b[\s\S]*$/gi, ' ')
    .replace(/[’']/g, '')
    .replace(/&/g, ' and ')
    .replace(/[_:;,.!?/\\|+\-–—]+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ');

  const tokens = text.split(/\s+/).filter(Boolean).map((token) => ROMAN_NUMERALS.get(token) ?? token);
  const filtered = tokens.filter((token) => token !== 'the');
  return filtered.join(' ').replace(/\s+/g, ' ').trim();
}

export function semanticNumberSignature(value) {
  return canonicalGameTitle(value).split(' ').filter((token) => /^\d+$/.test(token));
}

export function sameGameTitle(left, right) {
  const a = canonicalGameTitle(left);
  const b = canonicalGameTitle(right);
  if (!a || !b) return false;

  const aNumbers = semanticNumberSignature(a);
  const bNumbers = semanticNumberSignature(b);
  if (aNumbers.join('|') !== bNumbers.join('|')) return false;

  return a === b;
}
