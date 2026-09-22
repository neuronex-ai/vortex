import { exec } from 'child_process';
import { dialog, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs-extra';
import { getRunners, moveGameFolder, runExecutable, Runner, addToHeroic } from './utils/runner';

interface InstallGamePayload {
  sourcePath: string;
  gameName: string;
  executable: string;
  runner: Runner;
  addToHeroicLib: boolean;
}

type InstallGameErrorCode =
  | 'DESTINATION_EXISTS'
  | 'EXECUTABLE_NOT_FOUND'
  | 'INSTALL_FAILED';

interface InstallGameFailure {
  success: false;
  error: {
    code: InstallGameErrorCode;
    message: string;
    destinationPath?: string;
  };
}

interface InstallGameSuccess {
  success: true;
  path: string;
  reusedExistingFolder: boolean;
}

type InstallGameResult = InstallGameSuccess | InstallGameFailure;

export function setupHandlers() {
  ipcMain.handle('get-runners', async () => {
    try {
      return await getRunners();
    } catch (error) {
      console.error('Failed to get runners:', error);
      return [];
    }
  });

  ipcMain.handle('select-directory', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory'],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const dirPath = result.filePaths[0];
    const name = path.basename(dirPath).replace(/[^\w\s.-]/g, '');
    const executables = await findExecutables(dirPath);
    const readme = await findReadme(dirPath);

    return {
      path: dirPath,
      name,
      executables,
      readme,
    };
  });

  ipcMain.handle(
    'install-game',
    async (
      event,
      { sourcePath, gameName, executable, runner, addToHeroicLib }: InstallGamePayload,
    ): Promise<InstallGameResult> => {
      const sender = event.sender;

      try {
        sender.send('install-progress', { stage: 'moving', message: 'Preparing game files...' });
        const moveResult = await moveGameFolder(sourcePath, gameName);

        if (moveResult.status === 'destination-exists') {
          return {
            success: false,
            error: {
              code: 'DESTINATION_EXISTS',
              message: `Destination already exists: ${moveResult.path}`,
              destinationPath: moveResult.path,
            },
          };
        }

        const reusedExistingFolder = moveResult.status === 'already-in-target';
        const destPath = moveResult.path;
        sender.send(
          'install-log',
          reusedExistingFolder
            ? `> Using existing folder: ${destPath}\n`
            : `> Moved game files to: ${destPath}\n`,
        );

        sender.send('install-progress', { stage: 'configuring', message: 'Configuring executables...' });
        const destExePath = path.join(destPath, executable);
        if (!await fs.pathExists(destExePath)) {
          return {
            success: false,
            error: {
              code: 'EXECUTABLE_NOT_FOUND',
              message: `Selected executable not found after move: ${executable}`,
              destinationPath: destPath,
            },
          };
        }

        await fs.chmod(destExePath, '755');

        const pfxPath = path.join(destPath, 'pfx');
        await fs.ensureDir(pfxPath);

        sender.send('install-progress', { stage: 'redist', message: 'Searching for redistributables...' });
        const redistDirs = [
          path.join(destPath, '_CommonRedist'),
          path.join(destPath, 'Redist'),
        ];

        const redistExes: string[] = [];
        for (const redistDir of redistDirs) {
          if (await fs.pathExists(redistDir)) {
            const files = await findRedistExecutables(redistDir);
            redistExes.push(...files);
          }
        }

        if (redistExes.length === 0) {
          sender.send('install-log', '> No redistributables found.\n');
        }

        for (const redistExe of redistExes) {
          const redistName = path.basename(redistExe);
          sender.send('install-progress', {
            stage: 'redist',
            message: `Running ${redistName} (check spawned installer windows)...`,
          });
          sender.send('install-log', `> Running ${redistName}\n`);

          try {
            await runExecutable(redistExe, runner, pfxPath, (chunk) => {
              sender.send('install-log', chunk);
            });
            sender.send('install-log', `> Finished ${redistName}\n`);
          } catch (error: unknown) {
            const message = toErrorMessage(error);
            console.error(`Failed to run redist ${redistExe}:`, error);
            sender.send('install-log', `[ERROR] ${redistName} failed: ${message}\n`);
          }
        }

        if (addToHeroicLib) {
          sender.send('install-progress', { stage: 'heroic', message: 'Adding to Heroic Games Launcher...' });
          try {
            await addToHeroic(gameName, destPath, destExePath, runner, pfxPath);
            sender.send('install-log', '> Added to Heroic library.\n');
          } catch (error: unknown) {
            const message = toErrorMessage(error);
            console.error('Failed to add to heroic:', error);
            sender.send('install-log', `[ERROR] Failed to add to Heroic: ${message}\n`);
          }
        }

        sender.send('install-progress', { stage: 'done', message: 'Installation complete!' });
        return {
          success: true,
          path: destPath,
          reusedExistingFolder,
        };
      } catch (error: unknown) {
        const message = toErrorMessage(error);
        console.error('Installation failed:', error);
        return {
          success: false,
          error: {
            code: 'INSTALL_FAILED',
            message,
          },
        };
      }
    },
  );

  ipcMain.handle('open-heroic', async () => {
    exec('heroic', (error) => {
      if (error) {
        console.error('Failed to launch Heroic:', error);
      }
    });
  });
}

// Helper to find executables recursively
async function findExecutables(dir: string): Promise<string[]> {
  const exes: string[] = [];

  async function search(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'pfx' || entry.name === '_CommonRedist' || entry.name === 'Redist') {
          continue;
        }
        await search(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        exes.push(path.relative(dir, fullPath));
      }
    }
  }

  await search(dir);
  return exes;
}

async function findRedistExecutables(dir: string): Promise<string[]> {
  const exes: string[] = [];

  async function search(currentDir: string) {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await search(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        exes.push(fullPath);
      }
    }
  }

  await search(dir);
  return exes;
}


async function findReadme(dir: string): Promise<string | null> {
  const candidates = ['Read_Me_Instructions.txt', 'README.txt', 'readme.txt'];
  for (const candidate of candidates) {
    const filePath = path.join(dir, candidate);
    if (await fs.pathExists(filePath)) {
      return fs.readFile(filePath, 'utf-8');
    }
  }
  return null;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
