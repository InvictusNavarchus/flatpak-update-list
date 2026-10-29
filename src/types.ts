export interface FlatpakInstalledItem {
  name: string;
  application_id: string;
  version?: string;
  branch: string;
  arch: string;
  active_commit?: string;
  latest_commit?: string;
  installation: string;
  origin: string;
}

export interface FlatpakRemoteItem {
  name: string;
  application_id: string;
  version?: string;
  branch: string;
  arch: string;
  commit?: string;
  download_size?: string;
  origin: string;
}

export interface UpdateComparison {
  id: string;
  name: string;
  currentVersion: string;
  availableVersion: string;
  currentCommit: string;
  availableCommit: string;
  downloadSize: string;
  origin: string;
  installation: string;
  arch: string;
  branch: string;
  /** A possible rebuild inferred from equal refreshed catalog versions, not proof. */
  isRebuild: boolean;
  isVersionBump: boolean;
  versionMetadataCached: boolean;
}

export interface CliOptions {
  all?: boolean;
  cached?: boolean;
  user?: boolean;
  system?: boolean;
  json?: boolean;
}
