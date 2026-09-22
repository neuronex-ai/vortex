export interface Runner {
  name: string;
  path: string;
  type: 'proton' | 'wine';
}

export interface GameInfo {
  path: string;
  name: string;
  executables: string[];
  readme: string | null;
}

export interface InstallProgress {
  stage: 'moving' | 'configuring' | 'redist' | 'heroic' | 'done';
  message: string;
}

export interface InstallGamePayload {
  sourcePath: string;
  gameName: string;
  executable: string;
  runner: Runner;
  addToHeroicLib: boolean;
}

export type InstallGameErrorCode =
  | 'DESTINATION_EXISTS'
  | 'EXECUTABLE_NOT_FOUND'
  | 'INSTALL_FAILED';

export interface InstallGameFailure {
  success: false;
  error: {
    code: InstallGameErrorCode;
    message: string;
    destinationPath?: string;
  };
}

export interface InstallGameSuccess {
  success: true;
  path: string;
  reusedExistingFolder: boolean;
}

export type InstallGameResult = InstallGameSuccess | InstallGameFailure;

declare global {
  interface Window {
    api: {
      getRunners(): Promise<Runner[]>;
      selectDirectory(): Promise<GameInfo | null>;
      installGame(payload: InstallGamePayload): Promise<InstallGameResult>;
      openHeroic(): Promise<void>;
      onInstallProgress(callback: (progress: InstallProgress) => void): () => void;
      onInstallLog(callback: (log: string) => void): () => void;
    };
  }
}
