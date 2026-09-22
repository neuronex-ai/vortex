import fs from 'fs-extra';
import path from 'path';
import { app } from 'electron';
import { execa } from 'execa';

export interface Runner {
  name: string;
  path: string;
  type: 'proton' | 'wine';
}

const HEROIC_CONFIG_PATH = path.join(app.getPath('home'), '.config', 'heroic');
const HEROIC_TOOLS_PATH = path.join(HEROIC_CONFIG_PATH, 'tools');
const HEROIC_GAMES_CONFIG_PATH = path.join(HEROIC_CONFIG_PATH, 'GamesConfig');
const SIDELOAD_LIBRARY_PATH = path.join(HEROIC_CONFIG_PATH, 'sideload_apps', 'library.json');
const STEAMGRID_SEARCH_API = 'https://steamgrid.usebottles.com/api/search/';
const ART_FETCH_TIMEOUT_MS = 5000;

interface HeroicWineVersion {
  bin: string;
  name: string;
  type: 'proton' | 'wine';
  wineserver?: string;
}

interface HeroicSideloadInstall {
  executable: string;
  platform: 'windows';
  is_dlc: boolean;
  install_path: string;
}

interface HeroicSideloadGame {
  runner: 'sideload';
  app_name: string;
  title: string;
  install: HeroicSideloadInstall;
  folder_name: string;
  art_cover: string;
  art_square: string;
  is_installed: true;
  canRunOffline: true;
}

interface HeroicSideloadLibrary {
  games: unknown[];
}

export async function getRunners(): Promise<Runner[]> {
  const runners: Runner[] = [];
  const toolsPath = HEROIC_TOOLS_PATH;

  if (!await fs.pathExists(toolsPath)) {
    return runners;
  }

  // Check Proton
  const protonPath = path.join(toolsPath, 'proton');
  if (await fs.pathExists(protonPath)) {
    const dirs = await fs.readdir(protonPath);
    for (const dir of dirs) {
      if (dir.startsWith('.')) continue; // Skip hidden
      // Check for proton script
      const binPath = path.join(protonPath, dir, 'proton');
      if (await fs.pathExists(binPath)) {
        runners.push({
          name: `Proton - ${dir}`,
          path: binPath,
          type: 'proton'
        });
      } else {
        // Fallback: check for dist/bin/wine or similar if proton script missing? 
        // Usually proton builds have 'proton' script.
      }
    }
  }

  // Check Wine
  const winePath = path.join(toolsPath, 'wine');
  if (await fs.pathExists(winePath)) {
    const dirs = await fs.readdir(winePath);
    for (const dir of dirs) {
       if (dir.startsWith('.')) continue;
       const binPath = path.join(winePath, dir, 'bin', 'wine');
       if (await fs.pathExists(binPath)) {
         runners.push({
           name: `Wine - ${dir}`,
           path: binPath,
           type: 'wine'
         });
       }
    }
  }

  return runners;
}

export type MoveGameFolderResult =
  | { status: 'moved'; path: string }
  | { status: 'already-in-target'; path: string }
  | { status: 'destination-exists'; path: string };

export async function moveGameFolder(sourcePath: string, gameName: string): Promise<MoveGameFolderResult> {
  const gamesDir = path.join(app.getPath('home'), 'Games');
  await fs.ensureDir(gamesDir);
  const destPath = path.join(gamesDir, gameName);

  if (await fs.pathExists(destPath)) {
    const normalizedSource = path.resolve(sourcePath);
    const normalizedDest = path.resolve(destPath);
    if (normalizedSource === normalizedDest) {
      return { status: 'already-in-target', path: destPath };
    }
    return { status: 'destination-exists', path: destPath };
  }

  try {
    await fs.move(sourcePath, destPath, { overwrite: true });
  } catch (error: unknown) {
    if (isErrnoException(error) && error.code === 'EXDEV') {
      await fs.copy(sourcePath, destPath, { overwrite: true });
      await fs.remove(sourcePath);
    } else {
      throw error;
    }
  }

  return { status: 'moved', path: destPath };
}

export async function addToHeroic(gameName: string, gamePath: string, executablePath: string, runner: Runner, pfxPath: string) {
  const parsedTitle = parseGameTitle(gameName);
  const displayTitle = parsedTitle || gameName;
  const artUrl = await fetchHeroicArt(displayTitle);
  const library = await readSideloadLibrary();
  const appName = pickAppName(library.games, displayTitle, gamePath, executablePath);
  const entry = buildSideloadEntry(appName, displayTitle, gamePath, executablePath, artUrl);
  const updatedGames = upsertSideloadGame(library.games, entry, displayTitle, gamePath, executablePath);

  await fs.ensureDir(path.dirname(SIDELOAD_LIBRARY_PATH));
  await fs.writeJson(SIDELOAD_LIBRARY_PATH, { games: updatedGames }, { spaces: 2 });
  await writeHeroicGameConfig(appName, runner, pfxPath);
}

// Executable runner with Prefix support
export async function runExecutable(
  executablePath: string,
  runner: Runner,
  pfxPath: string,
  onOutput?: (chunk: string) => void,
) {
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        STEAM_COMPAT_DATA_PATH: pfxPath,
        WINEPREFIX: path.join(pfxPath, 'pfx'), // Proton uses this structure usually inside compatdata
    };

    // If using Wine, WINEPREFIX is direct. Proton uses STEAM_COMPAT_DATA_PATH which contains pfx.
    if (runner.type === 'wine') {
         env.WINEPREFIX = pfxPath;
         delete env.STEAM_COMPAT_DATA_PATH;
    }
    
    // For Proton, we sometimes need more envs to simulate Steam
    if (runner.type === 'proton') {
        env.SteamGameId = 'nonsteam';
    }

    const cmd = runner.path;
    let args: string[] = [];

    if (runner.type === 'proton') {
        // Proton needs 'run' command usually
        args = ['run', executablePath];
    } else {
        args = [executablePath];
    }
    
    console.log(`Executing with ${runner.name} (${runner.type}): ${cmd} ${args.join(' ')}`);
    // ensure prefix dir exists
    await fs.ensureDir(pfxPath);
    
    const subprocess = execa(cmd, args, { env, all: true });
    subprocess.all?.on('data', (chunk: Buffer | string) => {
      const text = chunk.toString();
      if (text.length > 0) {
        onOutput?.(text);
      }
    });

    await subprocess;
}

function isErrnoException(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error;
}

async function readSideloadLibrary(): Promise<HeroicSideloadLibrary> {
  try {
    if (!await fs.pathExists(SIDELOAD_LIBRARY_PATH)) {
      return { games: [] };
    }
    const library = await fs.readJson(SIDELOAD_LIBRARY_PATH);
    if (!isRecord(library) || !Array.isArray(library.games)) {
      return { games: [] };
    }
    return { games: library.games };
  } catch {
    return { games: [] };
  }
}

function buildSideloadEntry(
  appName: string,
  gameName: string,
  gamePath: string,
  executablePath: string,
  artUrl: string,
): HeroicSideloadGame {
  return {
    runner: 'sideload',
    app_name: appName,
    title: gameName,
    install: {
      executable: executablePath,
      platform: 'windows',
      is_dlc: false,
      install_path: gamePath,
    },
    folder_name: path.dirname(executablePath),
    art_cover: artUrl,
    art_square: artUrl,
    is_installed: true,
    canRunOffline: true,
  };
}

const HEROIC_DEFAULT_ART_URL =
  'https://raw.githubusercontent.com/Heroic-Games-Launcher/HeroicGamesLauncher/main/src/frontend/assets/heroic_card.jpg';

function upsertSideloadGame(
  games: unknown[],
  entry: HeroicSideloadGame,
  gameName: string,
  gamePath: string,
  executablePath: string,
): unknown[] {
  const updated: unknown[] = [];
  let inserted = false;

  for (const game of games) {
    if (matchesSideloadEntry(game, gameName, gamePath, executablePath)) {
      if (!inserted) {
        updated.push(entry);
        inserted = true;
      }
      continue;
    }
    updated.push(game);
  }

  if (!inserted) {
    updated.push(entry);
  }

  return updated;
}

function pickAppName(
  games: unknown[],
  gameName: string,
  gamePath: string,
  executablePath: string,
): string {
  const used = new Set<string>();
  let matchedAppName: string | null = null;

  for (const game of games) {
    const appName = readAppName(game);
    if (appName) {
      used.add(appName);
    }
    if (matchesSideloadEntry(game, gameName, gamePath, executablePath) && appName) {
      matchedAppName = appName;
    }
  }

  if (matchedAppName) {
    return matchedAppName;
  }

  const base = buildAppNameBase(gameName);
  if (!used.has(base)) {
    return base;
  }

  let suffix = 2;
  while (used.has(`${base}-${suffix}`)) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function buildAppNameBase(gameName: string): string {
  const slug = gameName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `steamrip-${slug || 'game'}`;
}

function readAppName(game: unknown): string | null {
  const record = asRecord(game);
  if (!record) {
    return null;
  }

  const appName = readString(record, 'app_name') ?? readString(record, 'appName');
  return appName ?? null;
}

function matchesSideloadEntry(
  game: unknown,
  gameName: string,
  gamePath: string,
  executablePath: string,
): boolean {
  const record = asRecord(game);
  if (!record) {
    return false;
  }

  const install = asRecord(record.install);
  const title = readString(record, 'title');
  const existingExecutable = install ? readString(install, 'executable') : null;
  const folderName = readString(record, 'folder_name');
  const workingDir = install ? readString(install, 'workingDir') : null;

  const executableMatches = existingExecutable
    ? pathsEqual(existingExecutable, executablePath)
    : false;
  const folderMatches = (folderName ? pathsEqual(folderName, gamePath) : false)
    || (workingDir ? pathsEqual(workingDir, gamePath) : false);
  const titleMatches = title === gameName;

  return executableMatches || (titleMatches && folderMatches);
}

function pathsEqual(left: string, right: string): boolean {
  return path.resolve(left) === path.resolve(right);
}

async function writeHeroicGameConfig(
  appName: string,
  runner: Runner,
  pfxPath: string,
): Promise<void> {
  const gameConfigPath = path.join(HEROIC_GAMES_CONFIG_PATH, `${appName}.json`);
  const currentConfig = await readJsonObject(gameConfigPath);
  const currentAppConfig = asRecord(currentConfig[appName]) ?? {};
  const wineVersion = await toHeroicWineVersion(runner);

  const nextConfig: Record<string, unknown> = {
    ...currentConfig,
    [appName]: {
      ...currentAppConfig,
      wineVersion,
      winePrefix: pfxPath,
    },
    version: 'v0',
    explicit: true,
  };

  await fs.ensureDir(HEROIC_GAMES_CONFIG_PATH);
  await fs.writeJson(gameConfigPath, nextConfig, { spaces: 2 });
}

async function toHeroicWineVersion(runner: Runner): Promise<HeroicWineVersion> {
  if (runner.type === 'proton') {
    return {
      bin: runner.path,
      name: runner.name,
      type: 'proton',
    };
  }

  const version: HeroicWineVersion = {
    bin: runner.path,
    name: runner.name,
    type: 'wine',
  };

  const wineserverPath = path.join(path.dirname(runner.path), 'wineserver');
  if (await fs.pathExists(wineserverPath)) {
    version.wineserver = wineserverPath;
  }

  return version;
}

async function readJsonObject(filePath: string): Promise<Record<string, unknown>> {
  try {
    if (!await fs.pathExists(filePath)) {
      return {};
    }
    const parsed = await fs.readJson(filePath);
    return asRecord(parsed) ?? {};
  } catch {
    return {};
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) {
    return null;
  }
  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' ? value : null;
}

async function fetchHeroicArt(gameTitle: string): Promise<string> {
  if (!gameTitle) {
    return HEROIC_DEFAULT_ART_URL;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ART_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${STEAMGRID_SEARCH_API}${encodeURIComponent(gameTitle)}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return HEROIC_DEFAULT_ART_URL;
    }

    const body = await response.text();
    const parsed = tryParseJson(body);
    if (typeof parsed === 'string' && isLikelyUrl(parsed)) {
      return parsed;
    }

    if (isRecord(parsed)) {
      const image = readString(parsed, 'url') ?? readString(parsed, 'image');
      if (image && isLikelyUrl(image)) {
        return image;
      }
    }

    return HEROIC_DEFAULT_ART_URL;
  } catch {
    return HEROIC_DEFAULT_ART_URL;
  } finally {
    clearTimeout(timeout);
  }
}

function parseGameTitle(rawName: string): string {
  let value = rawName.trim();
  value = value.replace(/\.(zip|rar|7z|iso)$/i, ' ');
  value = value.replace(/[_]+/g, ' ');
  value = value.replace(/[.-]+/g, ' ');

  value = value.replace(/\[([^\]]*)\]|\(([^)]*)\)|\{([^}]*)\}/g, (
    _match,
    squareGroup: string | undefined,
    roundGroup: string | undefined,
    curlyGroup: string | undefined,
  ) => {
    const group = squareGroup ?? roundGroup ?? curlyGroup ?? '';
    return hasReleaseNoise(group) ? ' ' : ` ${group} `;
  });

  value = value.replace(RELEASE_NOISE_RE, ' ');
  value = value.replace(/\b(com|net|org|info)\b/gi, ' ');

  value = expandCommonEditions(value);
  value = value.replace(/\s+/g, ' ').trim();
  return toTitleCase(value);
}

const RELEASE_NOISE_RE =
  /\b(steamrip|fitgirl|repack|dodi|elamigos|gog[-\s]?games?|xatab|portable|pre[-\s]?installed|crack(?:ed)?|rune|tenoke|codex|empress|goldberg|build|v\d+)\b/gi;
const RELEASE_NOISE_CHECK_RE =
  /\b(steamrip|fitgirl|repack|dodi|elamigos|gog[-\s]?games?|xatab|portable|pre[-\s]?installed|crack(?:ed)?|rune|tenoke|codex|empress|goldberg|build|v\d+)\b/i;

function hasReleaseNoise(text: string): boolean {
  return RELEASE_NOISE_CHECK_RE.test(text);
}

function expandCommonEditions(text: string): string {
  return text
    .replace(/\bGOTY\b/gi, 'Game of the Year Edition')
    .replace(/\bDE\b/gi, 'Definitive Edition')
    .replace(/\bDC\b/gi, "Director's Cut")
    .replace(/\bEE\b/gi, 'Enhanced Edition')
    .replace(/\bJE\b/gi, 'Juggernaut Edition')
    .replace(/\bULT(?:IMATE)?\b/gi, 'Ultimate Edition');
}

function toTitleCase(text: string): string {
  const words = text.split(' ').filter(Boolean);
  const smallWords = new Set(['a', 'an', 'and', 'as', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);

  return words
    .map((word, index) => {
      if (/^\d+$/.test(word)) {
        return word;
      }

      if (/^[ivxlcdm]+$/i.test(word)) {
        return word.toUpperCase();
      }

      const lower = word.toLowerCase();
      if (index > 0 && smallWords.has(lower)) {
        return lower;
      }

      if (/^[a-z]{2,3}$/i.test(word) && !smallWords.has(lower)) {
        return lower.toUpperCase();
      }

      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function tryParseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function isLikelyUrl(value: string): boolean {
  return /^https?:\/\/\S+/i.test(value);
}
