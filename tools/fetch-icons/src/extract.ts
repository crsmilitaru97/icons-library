import { CONSTANTS, fetchJson, fetchText } from './shared.js';

export const URLS = CONSTANTS.URLS;
export type ExtractorFn = () => Promise<string[]>;

const fetchIconsFromCss = async (url: string, regex: RegExp): Promise<string[]> => {
  const css = await fetchText(url);
  const names = new Set<string>();
  let match;
  while ((match = regex.exec(css)) !== null) {
    names.add(match[1]);
  }
  return Array.from(names);
};

const createCssExtractor = (key: keyof typeof URLS, regex: RegExp): ExtractorFn => {
  return async () => fetchIconsFromCss(URLS[key], regex);
};

const createJsonExtractor = (
  url: string,
  extractNames: (data: unknown) => string[]
): ExtractorFn => {
  return async () => {
    const data = await fetchJson(url);
    return extractNames(data);
  };
};

const extractFileName = (path: string): string => {
  const parts = path.split('/');
  const fileName = parts[parts.length - 1] || '';
  return fileName.replace('.svg', '');
};

export const extractors: Record<string, ExtractorFn> = {
  codicons: createJsonExtractor(URLS.codicons, (data) => {
    const allNames = new Set<string>();
    Object.values(data as Record<string, string[]>).forEach(names => names.forEach(n => allNames.add(n)));
    return Array.from(allNames);
  }),
  fontawesome: async () => {
    const yml = await fetchText(URLS.fontawesome);
    const names: string[] = [];
    const lines = yml.split('\n');
    let currentIcon = '';
    let isBrand = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^'?([a-z0-9-]+)'?:$/);
      if (match) {
        if (currentIcon && !isBrand) {
          names.push(currentIcon);
        }
        currentIcon = match[1];
        isBrand = false;
      }
      if (line.trim() === '- brands') {
        isBrand = true;
      }
    }
    if (currentIcon && !isBrand) { names.push(currentIcon); }
    return names;
  },
  fabrands: async () => {
    const yml = await fetchText(URLS.fontawesome);
    const names: string[] = [];
    const lines = yml.split('\n');
    let currentIcon = '';
    let isBrand = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(/^'?([a-z0-9-]+)'?:$/);
      if (match) {
        if (currentIcon && isBrand) {
          names.push(currentIcon);
        }
        currentIcon = match[1];
        isBrand = false;
      }
      if (line.trim() === '- brands') {
        isBrand = true;
      }
    }
    if (currentIcon && isBrand) { names.push(currentIcon); }
    return names;
  },
  bootstrap: createJsonExtractor(URLS.bootstrap, (data) => Object.keys(data as object)),
  heroicons: createJsonExtractor(URLS.heroicons, (data) => {
    const d = data as { files?: { path: string }[] };
    const files = d.files || [];
    return files
      .filter(f => f.path.endsWith('.svg'))
      .map(f => extractFileName(f.path));
  }),
  material: async () => {
    const text = await fetchText(URLS.material);
    const data = JSON.parse(text.replace(/^\)]}'?\s*/, '')) as { icons?: { name: string }[] };
    return data?.icons?.map(icon => icon.name) || [];
  },
  simpleicons: createJsonExtractor(URLS.simpleicons, (data) => {
    const d = data as { icons?: { slug?: string; title: string }[] } | { slug?: string; title: string }[];
    const icons = Array.isArray(d) ? d : (d.icons || []);
    if (icons.length === 0) { return []; }
    return icons.map(icon => icon.slug || icon.title.toLowerCase().replace(/\s+/g, '-'));
  }),
  primeicons: createCssExtractor('primeicons', /\.pi-([a-z0-9-]+):+before/g),
  feather: createJsonExtractor(URLS.feather, (data) => Object.keys(data as object)),
  lucide: createCssExtractor('lucide', /\.icon-([a-z0-9-]+):+before/g),
  tabler: createCssExtractor('tabler', /\.ti-([a-z0-9-]+):+before/g),
  remixicon: createCssExtractor('remixicon', /\.ri-([a-z0-9-]+):+before/g),
  lineicons: createCssExtractor('lineicons', /\.lni-([a-z0-9-]+):+before/g),
  eva: createCssExtractor('eva', /\.eva-([a-z0-9-]+):+before/g),
  boxicons: createCssExtractor('boxicons', /\.(bx[sl]?-[a-z0-9-]+):+before/g),
  iconoir: createCssExtractor('iconoir', /\.iconoir-([a-z0-9-]+):+before/g),
  phosphor: createCssExtractor('phosphor', /\.ph-([a-z0-9-]+):+before/g)
};
