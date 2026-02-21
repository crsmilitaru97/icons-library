import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

interface Config {
  cdnUris: Record<string, string>;
  packDisplayNames: Record<string, string>;
  packVersions?: Record<string, string>;
}

type IconPackContent = Record<string, string[]>;
type VerificationStatus = 'ok' | 'warning' | 'failed' | 'error';

interface VerificationResult {
  status: VerificationStatus;
  missingIcons: string[];
  note?: string;
}

const HEROICONS_SVG_VERSION = '2.2.0';

async function fetchUrl(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        const location = res.headers.location;
        if (!location) {
          reject(new Error(`Redirect without location for ${url}`));
          return;
        }
        let nextUrl = location;
        if (!nextUrl.startsWith('http')) {
          const parsed = new URL(url);
          nextUrl = `${parsed.protocol}//${parsed.host}${nextUrl}`;
        }
        fetchUrl(nextUrl).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`Failed to fetch ${url}: ${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

const CSS_CDN_KEY_BY_PACK: Record<string, string> = {
  codicons: 'codicons',
  primeicons: 'primeIcons',
  fontawesome: 'fontAwesome',
  fabrands: 'fontAwesome',
  bootstrap: 'bootstrapIcons',
  lucide: 'lucide',
  feather: 'feather',
  tabler: 'tabler',
  remixicon: 'remixicon',
  lineicons: 'lineicons',
  eva: 'eva',
  boxicons: 'boxicons',
  iconoir: 'iconoir',
  phosphor: 'phosphor'
};

const CSS_RENDERER_PATTERNS: Record<string, (name: string) => string[]> = {
  codicons: (n) => [`.codicon-${n}`],
  primeicons: (n) => [`.pi-${n}`],
  fontawesome: (n) => [n.startsWith('fa-') ? `.${n}` : `.fa-${n}`],
  fabrands: (n) => [n.startsWith('fa-') ? `.${n}` : `.fa-${n}`],
  bootstrap: (n) => [`.bi-${n}`],
  lucide: (n) => [`.lucide-${n}`, `.icon-${n}`],
  feather: (n) => [`.fe-${n}`, `.ft-${n}`, `.feather-${n}`],
  tabler: (n) => [`.ti-${n}`, `.ti-ti-${n}`, `.ti-${n.replace('-filled', '')}`],
  remixicon: (n) => [`.ri-${n}`],
  lineicons: (n) => [`.lni-${n}`],
  eva: (n) => [`.eva-${n}`],
  boxicons: (n) => {
    if (n.startsWith('bx-') || n.startsWith('bxs-') || n.startsWith('bxl-')) {
      return [`.${n}`];
    }
    return [`.bx-${n}`];
  },
  iconoir: (n) => [`.iconoir-${n}`],
  phosphor: (n) => [`.ph-${n}`]
};

function parseJson<T>(raw: string, context: string): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid JSON in ${context}: ${message}`);
  }
}

function getStatus(missingCount: number, total: number): VerificationStatus {
  if (missingCount === 0) {
    return 'ok';
  }
  if (missingCount === total) {
    return 'failed';
  }
  return 'warning';
}

function getStatusLabel(status: VerificationStatus): string {
  if (status === 'ok') {
    return '\u001b[32mOK\u001b[0m';
  }
  if (status === 'warning') {
    return '\u001b[33mWARNING\u001b[0m';
  }
  if (status === 'failed') {
    return '\u001b[31mFAILED\u001b[0m';
  }
  return '\u001b[31mERROR\u001b[0m';
}

function writeMissing(packName: string, missing: string[]) {
  if (missing.length > 0) {
    fs.writeFileSync(`missing-${packName}.txt`, missing.join('\n'));
  }
}

async function verifyCssPack(packName: string, iconNames: string[], config: Config): Promise<VerificationResult> {
  const cdnKey = CSS_CDN_KEY_BY_PACK[packName];
  const cdnUrl = cdnKey ? config.cdnUris[cdnKey] : undefined;
  if (!cdnUrl) {
    return { status: 'error', missingIcons: [], note: `Missing CDN mapping for pack "${packName}"` };
  }

  const patterns = CSS_RENDERER_PATTERNS[packName];
  if (!patterns) {
    return { status: 'error', missingIcons: [], note: `Missing CSS verification pattern for "${packName}"` };
  }

  const css = await fetchUrl(cdnUrl);
  const missing: string[] = [];

  for (const name of iconNames) {
    const candidates = patterns(name);
    const found = candidates.some(candidate => css.includes(candidate));
    if (!found) {
      missing.push(name);
    }
  }

  return {
    status: getStatus(missing.length, iconNames.length),
    missingIcons: missing
  };
}

async function verifySimpleIcons(iconNames: string[], config: Config): Promise<VerificationResult> {
  const version = config.packVersions?.simpleicons;
  const dataUrl = version
    ? `https://unpkg.com/simple-icons@${version}/data/simple-icons.json`
    : 'https://unpkg.com/simple-icons/data/simple-icons.json';
  const data = parseJson<Array<{ slug?: string }>>(await fetchUrl(dataUrl), `simple-icons metadata (${dataUrl})`);
  const slugs = new Set(data.map(entry => entry.slug).filter((slug): slug is string => typeof slug === 'string'));
  const missing = iconNames.filter(name => !slugs.has(name));

  return {
    status: getStatus(missing.length, iconNames.length),
    missingIcons: missing,
    note: `checked against simple-icons@${version ?? 'latest'} metadata`
  };
}

async function verifyHeroicons(iconNames: string[]): Promise<VerificationResult> {
  const metaUrl = `https://unpkg.com/heroicons@${HEROICONS_SVG_VERSION}/24/outline/?meta`;
  const meta = parseJson<{ files?: Array<{ path?: string }> }>(await fetchUrl(metaUrl), `heroicons metadata (${metaUrl})`);
  const files = Array.isArray(meta.files) ? meta.files : [];
  const available = new Set(
    files
      .map(file => file.path)
      .filter((filePath): filePath is string => typeof filePath === 'string' && filePath.endsWith('.svg'))
      .map(filePath => path.basename(filePath, '.svg'))
  );

  if (available.size === 0) {
    return {
      status: 'error',
      missingIcons: [],
      note: `No SVG files discovered in ${metaUrl}`
    };
  }

  const missing = iconNames.filter(name => !available.has(name));
  return {
    status: getStatus(missing.length, iconNames.length),
    missingIcons: missing,
    note: `checked against heroicons@${HEROICONS_SVG_VERSION} metadata`
  };
}

async function verifyMaterial(iconNames: string[]): Promise<VerificationResult> {
  const metadataUrl = 'https://fonts.google.com/metadata/icons';
  const raw = await fetchUrl(metadataUrl);
  const jsonStart = raw.indexOf('{');
  if (jsonStart < 0) {
    return {
      status: 'error',
      missingIcons: [],
      note: `Unexpected payload format from ${metadataUrl}`
    };
  }

  const payload = parseJson<{ icons?: Array<{ name?: string }> }>(raw.slice(jsonStart), 'Material metadata');
  const icons = Array.isArray(payload.icons) ? payload.icons : [];
  const available = new Set(
    icons
      .map(icon => icon.name)
      .filter((name): name is string => typeof name === 'string')
  );

  const missing = iconNames.filter(name => !available.has(name));
  return {
    status: getStatus(missing.length, iconNames.length),
    missingIcons: missing,
    note: 'checked against Google Material metadata'
  };
}

async function verifyPack(packName: string, iconNames: string[], config: Config): Promise<VerificationResult> {
  if (packName === 'simpleicons') {
    return verifySimpleIcons(iconNames, config);
  }
  if (packName === 'heroicons') {
    return verifyHeroicons(iconNames);
  }
  if (packName === 'material') {
    return verifyMaterial(iconNames);
  }
  return verifyCssPack(packName, iconNames, config);
}

async function verify() {
  const rootDir = process.cwd();
  const configPath = path.join(rootDir, 'config.json');
  const packsDir = path.join(rootDir, 'packs');

  const config = parseJson<Config>(fs.readFileSync(configPath, 'utf-8'), configPath);
  const packFiles = fs.readdirSync(packsDir).filter(f => f.endsWith('.json'));

  console.log(`Verifying ${packFiles.length} packs...\n`);

  const summary = {
    ok: 0,
    warning: 0,
    failed: 0,
    error: 0
  };

  for (const file of packFiles) {
    const packName = file.replace('.json', '');

    try {
      const packData = parseJson<IconPackContent>(fs.readFileSync(path.join(packsDir, file), 'utf-8'), file);
      const iconNames = Object.keys(packData);
      const result = await verifyPack(packName, iconNames, config);
      const missingCount = result.missingIcons.length;

      if (result.status === 'ok') {
        summary.ok++;
        console.log(`[${packName}] ${getStatusLabel(result.status)} (${iconNames.length} icons${result.note ? `, ${result.note}` : ''})`);
      } else if (result.status === 'warning' || result.status === 'failed') {
        summary[result.status]++;
        writeMissing(packName, result.missingIcons);
        console.log(`[${packName}] ${getStatusLabel(result.status)}: ${missingCount}/${iconNames.length} missing${result.note ? `, ${result.note}` : ''}.`);
        console.log(`    Missing: ${result.missingIcons.slice(0, 5).join(', ')}${result.missingIcons.length > 5 ? '...' : ''}`);
      } else {
        summary.error++;
        console.log(`[${packName}] ${getStatusLabel(result.status)}: ${result.note ?? 'Unknown verification error'}`);
      }
    } catch (error) {
      summary.error++;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[${packName}] ${getStatusLabel('error')}: ${message}`);
    }
  }

  const hasIssues = summary.warning > 0 || summary.failed > 0 || summary.error > 0;
  console.log(`\nSummary: ${summary.ok} ok, ${summary.warning} warning, ${summary.failed} failed, ${summary.error} error.`);
  console.log(hasIssues ? 'Verification failed.' : 'Verification complete.');
  process.exit(hasIssues ? 1 : 0);
}

verify().catch((err) => {
  console.error(err);
  process.exit(1);
});
