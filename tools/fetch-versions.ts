import * as fs from 'fs';
import * as https from 'https';
import * as path from 'path';

const configPath = path.resolve(__dirname, '../config.json');
const fetchIconsConfigPath = path.resolve(__dirname, './fetch-icons/config.json');

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const fetchIconsConfig = JSON.parse(fs.readFileSync(fetchIconsConfigPath, 'utf8'));
const MATERIAL_PACK_ID = 'material';
const PACK_IDS = [
  'codicons',
  'fontawesome',
  'fabrands',
  'primeicons',
  'bootstrap',
  'material',
  'heroicons',
  'lucide',
  'feather',
  'tabler',
  'remixicon',
  'lineicons',
  'simpleicons',
  'eva',
  'boxicons',
  'iconoir',
  'phosphor'
] as const;

type PackId = typeof PACK_IDS[number];

type VersionTarget = {
  packKey: PackId;
  npmPackage: string;
  cdnKey?: string;
  fetchIconsKey?: string;
  inFetchIcons: boolean;
};

const getLatest = (pkg: string): Promise<string> => new Promise((resolve) => {
  https.get(`https://registry.npmjs.org/${pkg}/latest`, (res) => {
    let body = '';
    res.on('data', c => body += c);
    res.on('end', () => {
      try {
        resolve(JSON.parse(body).version);
      } catch {
        resolve('latest');
      }
    });
    res.on('error', () => resolve('latest'));
  }).on('error', () => resolve('latest'));
});

function initializePackVersions(existing: Record<string, string> | undefined): Record<PackId, string> {
  const versions = {} as Record<PackId, string>;
  for (const packId of PACK_IDS) {
    if (packId === MATERIAL_PACK_ID) {
      versions[packId] = existing?.[packId] ?? '';
      continue;
    }
    versions[packId] = existing?.[packId] ?? '';
  }
  return versions;
}

async function run() {
  const cdnUris: Record<string, string> = config.cdnUris;
  const urls: Record<string, string> = fetchIconsConfig.URLS;
  const nextPackVersions = initializePackVersions(config.packVersions);

  const packages: VersionTarget[] = [
    { packKey: 'codicons', npmPackage: '@vscode/codicons', cdnKey: 'codicons', inFetchIcons: false },
    { packKey: 'fontawesome', npmPackage: '@fortawesome/fontawesome-free', cdnKey: 'fontAwesome', fetchIconsKey: 'fontawesome', inFetchIcons: false },
    { packKey: 'primeicons', npmPackage: 'primeicons', cdnKey: 'primeIcons', fetchIconsKey: 'primeicons', inFetchIcons: false },
    { packKey: 'bootstrap', npmPackage: 'bootstrap-icons', cdnKey: 'bootstrapIcons', fetchIconsKey: 'bootstrap', inFetchIcons: false },
    { packKey: 'heroicons', npmPackage: 'heroicons', cdnKey: 'heroicons', fetchIconsKey: 'heroicons', inFetchIcons: true },
    { packKey: 'lucide', npmPackage: 'lucide-static', cdnKey: 'lucide', fetchIconsKey: 'lucide', inFetchIcons: true },
    { packKey: 'feather', npmPackage: 'feather-icons-css', cdnKey: 'feather', fetchIconsKey: 'feather', inFetchIcons: false },
    { packKey: 'tabler', npmPackage: '@tabler/icons-webfont', cdnKey: 'tabler', fetchIconsKey: 'tabler', inFetchIcons: true },
    { packKey: 'remixicon', npmPackage: 'remixicon', cdnKey: 'remixicon', fetchIconsKey: 'remixicon', inFetchIcons: true },
    { packKey: 'eva', npmPackage: 'eva-icons', cdnKey: 'eva', fetchIconsKey: 'eva', inFetchIcons: false },
    { packKey: 'boxicons', npmPackage: 'boxicons', cdnKey: 'boxicons', fetchIconsKey: 'boxicons', inFetchIcons: true },
    { packKey: 'iconoir', npmPackage: 'iconoir', cdnKey: 'iconoir', fetchIconsKey: 'iconoir', inFetchIcons: true },
    { packKey: 'phosphor', npmPackage: '@phosphor-icons/web', cdnKey: 'phosphor', fetchIconsKey: 'phosphor', inFetchIcons: true },
    { packKey: 'simpleicons', npmPackage: 'simple-icons', fetchIconsKey: 'simpleicons', inFetchIcons: true }
  ];

  for (const { packKey, npmPackage, cdnKey, fetchIconsKey, inFetchIcons } of packages) {
    const version = await getLatest(npmPackage);
    if (!version || version === 'latest') { continue; }

    console.log(`Resolved ${npmPackage} to ${version}`);
    nextPackVersions[packKey] = version;
    if (packKey === 'fontawesome') {
      nextPackVersions.fabrands = version;
    }

    if (cdnKey && cdnUris[cdnKey] && cdnUris[cdnKey].includes('@latest')) {
      cdnUris[cdnKey] = cdnUris[cdnKey].replace('@latest', `@${version}`);
    }

    if (inFetchIcons && fetchIconsKey && urls[fetchIconsKey] && urls[fetchIconsKey].includes('@latest')) {
      urls[fetchIconsKey] = urls[fetchIconsKey].replace('@latest', `@${version}`);
    }
  }

  const extraFetchPackages = [
    { key: 'feather', pkg: 'feather-icons' },
  ];

  for (const { key, pkg } of extraFetchPackages) {
    const version = await getLatest(pkg);
    if (version && version !== 'latest' && urls[key] && urls[key].includes('@latest')) {
      urls[key] = urls[key].replace('@latest', `@${version}`);
      console.log(`Resolved fetch-icons ${pkg} to ${version}`);
    }
  }

  config.packVersions = nextPackVersions;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  fs.writeFileSync(fetchIconsConfigPath, JSON.stringify(fetchIconsConfig, null, 2));
  console.log('Done mapping versions in both config files!');
}

run();
