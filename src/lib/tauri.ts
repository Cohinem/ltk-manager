import { commands } from "@/lib/bindings";
import type {
  AppErrorResponse as AppError,
  AssetRef,
  BinDocumentId,
  BinEdit,
  ChangeBaseline,
  ChoiceQuery,
  ConvertFolderArgs,
  CreateProjectArgs,
  DeclaredModuleChoice,
  Declaring,
  EditModMetadataArgs,
  ExportScope,
  ExportShape,
  ExtractOptions,
  ExtractTarget,
  HexBinHash,
  HotkeyAction,
  ImportFantomeArgs,
  ImportGitRepoArgs,
  IntegrationAction,
  LaunchTarget,
  MaterialSource,
  MenuConflictPolicy,
  ModStorage,
  ModuleAction,
  PackProjectArgs,
  ParticleDefine,
  ParticleShader,
  PatcherConfig,
  ProblemId,
  ProgramOptions,
  ProjectTextFile,
  ReferenceQuery,
  Revision,
  SandboxRef,
  SaveProjectConfigArgs,
  SearchPreference,
  Settings_Serialize as Settings,
  SurfaceSource,
  Tool,
  UiError,
  UiShader,
  ViewVariant,
  WorkshopFileKind,
} from "@/lib/bindings";
import type { Result } from "@/utils/result";

export type * from "@/lib/bindings";
/* A serde `default` or `skip_serializing_if` splits a type by phase, and a command answers
the serialize side, so that side takes the plain name. An explicit export shadows the star. */
export type {
  AppErrorResponse as AppError,
  BulkInstallResult_Serialize as BulkInstallResult,
  Check_Serialize as Check,
  Config_Serialize as Config,
  DiagnosticReport_Serialize as DiagnosticReport,
  FixPreview_Serialize as FixPreview,
  HashtableUpdateCheck_Serialize as HashtableUpdateCheck,
  HealthCheckBasis_Serialize as HealthCheckBasis,
  HealthSweepReport_Serialize as HealthSweepReport,
  HealthSweepState_Serialize as HealthSweepState,
  Incident_Serialize as Incident,
  InstalledMod_Serialize as InstalledMod,
  ModHealthVerdict_Serialize as ModHealthVerdict,
  ModLicense_Serialize as ModLicense,
  NodeAddress_Serialize as NodeAddress,
  ObjectInfo_Serialize as ObjectInfo,
  PatcherBinaries_Serialize as PatcherBinaries,
  Problem_Serialize as Problem,
  RuleBrief_Serialize as RuleBrief,
  RuleFailure_Serialize as RuleFailure,
  RuleInfo_Serialize as RuleInfo,
  Run_Serialize as Run,
  Settings_Serialize as Settings,
  Site_Serialize as Site,
  StoredVerdict_Serialize as StoredVerdict,
  Verdict_Serialize as Verdict,
} from "@/lib/bindings";
export type { Result } from "@/utils/result";
export { isErr, isOk, match, unwrap, unwrapOr } from "@/utils/result";

type IpcResponse<T> = { ok: true; value: T } | { ok: false; error: AppError };

/**
 * Transform the raw IPC response to our Result type.
 */
function toResult<T>(response: IpcResponse<T>): Result<T> {
  if (response.ok) {
    return { ok: true, value: response.value };
  }
  return { ok: false, error: response.error };
}

// API functions
export const api = {
  integrations: {
    status: () => commands.integrationStatus().then(toResult),
    release: (tool: Tool) => commands.integrationRelease(tool).then(toResult),
    change: (tool: Tool, action: IntegrationAction, conflicts: MenuConflictPolicy) =>
      commands.changeIntegration(tool, action, conflicts).then(toResult),
    cancel: (operationId: string) => commands.cancelIntegrationDownload(operationId).then(toResult),
  },
  getAppInfo: () => commands.getAppInfo().then(toResult),
  getPlatformSupport: () => commands.getPlatformSupport().then(toResult),
  showMainWindow: () => commands.showMainWindow().then(toResult),
  listReleases: (page: number) => commands.listReleases(page).then(toResult),
  listAnnouncements: () => commands.listAnnouncements().then(toResult),
  listNotices: () => commands.listNotices().then(toResult),

  // Settings
  getSettings: () => commands.getSettings().then(toResult),
  getDefaultSettings: () => commands.getDefaultSettings().then(toResult),
  saveSettings: (settings: Settings) => commands.saveSettings(settings).then(toResult),
  autoDetectLeaguePath: () => commands.autoDetectLeaguePath().then(toResult),
  validateLeaguePath: (path: string) => commands.validateLeaguePath(path).then(toResult),
  checkSetupRequired: () => commands.checkSetupRequired().then(toResult),
  detectLeagueRunAsAdmin: () => commands.detectLeagueRunAsAdmin().then(toResult),
  listAvailableWads: () => commands.listAvailableWads().then(toResult),
  listForcibleMapSkins: () => commands.listForcibleMapSkins().then(toResult),
  listMapDecorations: () => commands.listMapDecorations().then(toResult),

  // Mods
  getInstalledMods: () => commands.getInstalledMods().then(toResult),
  installMod: (filePath: string) => commands.installMod(filePath).then(toResult),
  installMods: (filePaths: string[]) => commands.installMods(filePaths).then(toResult),
  updateMod: (modId: string, filePath: string) =>
    commands.updateMod(modId, filePath).then(toResult),
  uninstallMod: (modId: string) => commands.uninstallMod(modId).then(toResult),
  exportMods: (scope: ExportScope, shape: ExportShape, destination: string) =>
    commands.exportMods(scope, shape, destination).then(toResult),
  toggleMod: (modId: string, enabled: boolean) => commands.toggleMod(modId, enabled).then(toResult),
  getModThumbnail: (modId: string) => commands.getModThumbnail(modId).then(toResult),
  getModThumbnails: (modIds: readonly string[]) =>
    commands.getModThumbnails([...modIds]).then(toResult),
  getModReadme: (modId: string) => commands.getModReadme(modId).then(toResult),
  getModLicenseText: (modId: string) => commands.getModLicenseText(modId).then(toResult),
  getStorageDirectory: () => commands.getStorageDirectory().then(toResult),
  reorderMods: (modIds: string[]) => commands.reorderMods(modIds).then(toResult),
  setModLayers: (modId: string, layerStates: Record<string, boolean>) =>
    commands.setModLayers(modId, layerStates).then(toResult),
  enableModWithLayers: (modId: string, layerStates: Record<string, boolean>) =>
    commands.enableModWithLayers(modId, layerStates).then(toResult),
  editModMetadata: (modId: string, metadata: EditModMetadataArgs) =>
    commands.editModMetadata(modId, metadata).then(toResult),
  setModStorage: (modId: string, storage: ModStorage) =>
    commands.setModStorage(modId, storage).then(toResult),
  getModWadReport: (modId: string) => commands.getModWadReport(modId).then(toResult),
  getAllModWadReports: () => commands.getAllModWadReports().then(toResult),
  analyzeModWads: (modId: string) => commands.analyzeModWads(modId).then(toResult),
  checkModHealth: (modId: string) => commands.checkModHealth(modId).then(toResult),
  /** Re-check `modIds`, or every mod in the library when none are named. */
  sweepModHealth: (modIds?: string[]) => commands.sweepModHealth(modIds ?? null).then(toResult),
  repairMod: (modId: string) => commands.repairMod(modId).then(toResult),
  repairMods: (modIds: string[]) => commands.repairMods(modIds).then(toResult),
  getModHealthVerdicts: () => commands.getModHealthVerdicts().then(toResult),
  getHealthSweep: () => commands.getHealthSweep().then(toResult),
  getHealthCheckReadiness: () => commands.getHealthCheckReadiness().then(toResult),
  cancelModHealthRun: () => commands.cancelModHealthRun().then(toResult),
  /**
   * Time a health pass over the real library, into the dev console.
   *
   * Registered only in a debug build. `repair` runs the real repair, which
   * rewrites the mods it can fix and keeps no way back.
   */
  timeModHealth: (repair: boolean) => commands.timeModHealth(repair).then(toResult),

  // Migration
  scanCslolMods: (directory: string) => commands.scanCslolMods(directory).then(toResult),
  importCslolMods: (directory: string, selectedFolders: string[]) =>
    commands.importCslolMods(directory, selectedFolders).then(toResult),
  getLayoutMigrationState: () => commands.getLayoutMigrationState().then(toResult),

  // Inspector
  inspectModpkg: (filePath: string) => commands.inspectModpkg(filePath).then(toResult),

  // Patcher
  startPatcher: (config: PatcherConfig) => commands.startPatcher(config).then(toResult),
  stopPatcher: () => commands.stopPatcher().then(toResult),
  rebuildOverlay: () => commands.rebuildOverlay().then(toResult),
  getPatcherStatus: () => commands.getPatcherStatus().then(toResult),
  getLinkedBinOffenders: () => commands.getLinkedBinOffenders().then(toResult),
  getChecksumMismatches: () => commands.getChecksumMismatches().then(toResult),

  // Launcher
  // Resolves to null when a launch was already in flight - a redundant click.
  launchLeague: (target?: LaunchTarget) => commands.launchLeague(target ?? null).then(toResult),
  // Resolves to false when nothing was in flight, which is what a Cancel
  // pressed just as the request landed looks like.
  cancelLaunch: () => commands.cancelLaunch().then(toResult),
  stopLeague: () => commands.stopLeague().then(toResult),
  getLaunchAvailability: () => commands.getLaunchAvailability().then(toResult),
  // Also starts following the session it reports, so a game already in progress
  // when the app opened still reaches the session events.
  getLeagueSession: () => commands.getLeagueSession().then(toResult),

  // Hotkeys
  pauseHotkeys: () => commands.pauseHotkeys().then(toResult),
  resumeHotkeys: () => commands.resumeHotkeys().then(toResult),
  setHotkey: (action: HotkeyAction, accelerator: string | null) =>
    commands.setHotkey(action, accelerator).then(toResult),
  killLeague: () => commands.killLeague().then(toResult),

  // Profiles
  listModProfiles: () => commands.listModProfiles().then(toResult),
  getActiveModProfile: () => commands.getActiveModProfile().then(toResult),
  createModProfile: (name: string) => commands.createModProfile(name).then(toResult),
  deleteModProfile: (profileId: string) => commands.deleteModProfile(profileId).then(toResult),
  switchModProfile: (profileId: string) => commands.switchModProfile(profileId).then(toResult),
  renameModProfile: (profileId: string, newName: string) =>
    commands.renameModProfile(profileId, newName).then(toResult),

  // Folders
  getFolders: () => commands.getFolders().then(toResult),
  getFolderOrder: () => commands.getFolderOrder().then(toResult),
  createFolder: (name: string) => commands.createFolder(name).then(toResult),
  renameFolder: (folderId: string, newName: string) =>
    commands.renameFolder(folderId, newName).then(toResult),
  deleteFolder: (folderId: string) => commands.deleteFolder(folderId).then(toResult),
  moveModToFolder: (modId: string, folderId: string) =>
    commands.moveModToFolder(modId, folderId).then(toResult),
  toggleFolder: (folderId: string, enabled: boolean) =>
    commands.toggleFolder(folderId, enabled).then(toResult),
  reorderFolderMods: (folderId: string, modIds: string[]) =>
    commands.reorderFolderMods(folderId, modIds).then(toResult),
  reorderFolders: (folderOrder: string[]) => commands.reorderFolders(folderOrder).then(toResult),

  // Hashtables
  getHashtableCacheStatus: () => commands.getHashtableCacheStatus().then(toResult),
  checkHashtableUpdates: () => commands.checkHashtableUpdates().then(toResult),
  syncHashtables: (force: boolean) => commands.syncHashtables(force).then(toResult),

  // Game WADs
  getGameWads: () => commands.getGameWads().then(toResult),
  readGameWad: (wadName: string) => commands.readGameWad(wadName).then(toResult),

  // Game index
  getGameIndex: () => commands.getGameIndex().then(toResult),
  readGameDir: (path: string) => commands.readGameDir(path).then(toResult),
  refreshGameIndex: () => commands.refreshGameIndex().then(toResult),
  searchGameIndex: (query: string) => commands.searchGameIndex(query).then(toResult),
  findInGameIndex: (pattern: string, regex: boolean) =>
    commands.findInGameIndex(pattern, regex).then(toResult),

  // Extract to disk
  planGameExtract: (targets: ExtractTarget[], kinds: WorkshopFileKind[] | null) =>
    commands.planGameExtract(targets, kinds).then(toResult),
  // Resolves to null when an extract was already in flight - a redundant click.
  extractGameFiles: (targets: ExtractTarget[], options: ExtractOptions) =>
    commands.extractGameFiles(targets, options).then(toResult),
  // Resolves to false when nothing was in flight, which is what a Cancel
  // pressed just as the run finished looks like.
  cancelExtract: () => commands.cancelExtract().then(toResult),

  // Asset preview
  readAssetInfo: (asset: AssetRef) => commands.readAssetInfo(asset).then(toResult),
  saveAssetCopy: (asset: AssetRef, destination: string) =>
    commands.saveAssetCopy(asset, destination).then(toResult),

  // Ritobin
  detectRitobinIntegration: () => commands.detectRitobinIntegration().then(toResult),
  openAssetInRitobin: (asset: AssetRef, name?: string) =>
    commands.openAssetInRitobin(asset, name ?? null).then(toResult),

  // Deep Link
  deepLinkInstallMod: (
    url: string,
    name?: string | null,
    author?: string | null,
    source?: string | null,
  ) =>
    commands.deepLinkInstallMod(url, name ?? null, author ?? null, source ?? null).then(toResult),
  takePendingDeepLink: () => commands.takePendingDeepLink().then(toResult),

  // Shell
  revealInExplorer: (path: string) => commands.revealInExplorer(path).then(toResult),
  minimizeToTray: () => commands.minimizeToTray().then(toResult),

  // Storage
  detectStorageMedium: (path: string) => commands.detectStorageMedium(path).then(toResult),

  // The bin editor and the class reads over its documents.
  bin: {
    open: (sandbox: SandboxRef, asset: AssetRef, entry: string | null) =>
      commands.binOpen(sandbox, asset, entry).then(toResult),
    openVariant: (sandbox: SandboxRef, asset: AssetRef, base: AssetRef, path: string) =>
      commands.binOpenVariant(sandbox, asset, base, path).then(toResult),
    children: (
      document: BinDocumentId,
      entry: string,
      path: string,
      offset: number,
      limit: number,
    ) => commands.binChildren(document, entry, path, offset, limit).then(toResult),
    read: (document: BinDocumentId, entry: string, paths: readonly string[]) =>
      commands.binRead(document, entry, [...paths]).then(toResult),
    find: (document: BinDocumentId, entry: string | null, query: string) =>
      commands.binFind(document, entry, query).then(toResult),
    edit: (document: BinDocumentId, edit: BinEdit) =>
      commands.binEdit(document, edit).then(toResult),
    choices: (document: BinDocumentId, query: ChoiceQuery) =>
      commands.binChoices(document, query).then(toResult),
    copyValue: (document: BinDocumentId, entry: string, path: string) =>
      commands.binCopyValue(document, entry, path).then(toResult),
    save: (document: BinDocumentId) => commands.binSave(document).then(toResult),
    reload: (document: BinDocumentId) => commands.binReload(document).then(toResult),
    undo: (document: BinDocumentId) => commands.binUndo(document).then(toResult),
    redo: (document: BinDocumentId) => commands.binRedo(document).then(toResult),
    changes: (document: BinDocumentId, baseline: ChangeBaseline) =>
      commands.binChanges(document, baseline).then(toResult),
    revert: (document: BinDocumentId, entry: string, path: string, baseline: ChangeBaseline) =>
      commands.binRevert(document, entry, path, baseline).then(toResult),
    declared: (document: BinDocumentId) => commands.binDeclared(document).then(toResult),
    overrides: (document: BinDocumentId) => commands.binOverrides(document).then(toResult),
    declareInto: (document: BinDocumentId, layer: string, module: DeclaredModuleChoice) =>
      commands.binDeclareInto(document, layer, module).then(toResult),
    setDeclaring: (document: BinDocumentId, declaring: Declaring) =>
      commands.binSetDeclaring(document, declaring).then(toResult),
    rowDeclaration: (document: BinDocumentId, entry: string, path: string) =>
      commands.binRowDeclaration(document, entry, path).then(toResult),
    roots: (document: BinDocumentId) => commands.binRoots(document).then(toResult),
    dependencies: (document: BinDocumentId) => commands.binDependencies(document).then(toResult),
    close: (document: BinDocumentId) => commands.binClose(document).then(toResult),
    classSchema: (classHash: string) => commands.classSchema(classHash).then(toResult),
    derivedClasses: (classHash: string) => commands.derivedClasses(classHash).then(toResult),
    classDocs: (classHash: string) => commands.classDocs(classHash).then(toResult),
    syncMetaDocs: () => commands.syncMetaDocs().then(toResult),
    readVfxSystem: (document: BinDocumentId, entry: string) =>
      commands.readVfxSystem(document, entry).then(toResult),
    vfxTemplates: () => commands.vfxTemplates().then(toResult),
    readUiView: (
      document: BinDocumentId,
      entry: string,
      scene: BinDocumentId | null,
      variant: ViewVariant | null,
    ) => commands.readUiView(document, entry, scene, variant).then(toResult),
    readUiSceneView: (document: BinDocumentId, entry: string) =>
      commands.readUiSceneView(document, entry).then(toResult),
    readUiFont: (document: BinDocumentId, entry: string) =>
      commands.readUiFont(document, entry).then(toResult),
    readUiFontCatalog: (document: BinDocumentId) =>
      commands.readUiFontCatalog(document).then(toResult),
    readUiMaterialPrograms: (documents: readonly BinDocumentId[], entries: readonly string[]) =>
      commands.readUiMaterialPrograms([...documents], [...entries]).then(toResult),
    readUiPrograms: (document: BinDocumentId | null, shaders: readonly UiShader[]) =>
      commands.readUiPrograms(document, [...shaders]).then(toResult),
    readUiLoadout: (document: BinDocumentId) => commands.readUiLoadout(document).then(toResult),
    atlasExportSprite: (
      texture: AssetRef,
      uv: readonly [number, number, number, number],
      destination: string,
    ) => commands.atlasExportSprite(texture, [...uv], destination).then(toResult),
    atlasImportFontFile: (document: BinDocumentId, source: string) =>
      commands.atlasImportFontFile(document, source).then(toResult),
    atlasImportSprite: (
      document: BinDocumentId,
      sheet: string,
      source: string,
      replace: string | null,
    ) => commands.atlasImportSprite(document, sheet, source, replace).then(toResult),
    atlasMakeSurface: (
      document: BinDocumentId,
      sheet: string,
      name: string,
      source: SurfaceSource,
    ) => commands.atlasMakeSurface(document, sheet, name, source).then(toResult),
    atlasPatchSprite: (
      document: BinDocumentId,
      page: string,
      uv: readonly [number, number, number, number],
      source: string,
    ) => commands.atlasPatchSprite(document, page, [...uv], source).then(toResult),
    atlasSheet: (document: BinDocumentId, sheet: string) =>
      commands.atlasSheet(document, sheet).then(toResult),
    readSkin: (document: BinDocumentId, entry: string) =>
      commands.readSkin(document, entry).then(toResult),
    readMaterialPrograms: (
      source: MaterialSource,
      entries: readonly string[],
      options: ProgramOptions,
    ) => commands.readMaterialPrograms(source, [...entries], options).then(toResult),
    readEmbeddedMaterialProgram: (
      source: MaterialSource,
      entry: string,
      path: string,
      options: ProgramOptions,
    ) => commands.readEmbeddedMaterialProgram(source, entry, path, options).then(toResult),
    readDefaultSkinnedProgram: (document: BinDocumentId, options: ProgramOptions) =>
      commands.readDefaultSkinnedProgram(document, options).then(toResult),
    readParticleProgram: (
      document: BinDocumentId | null,
      shader: ParticleShader,
      defines: readonly ParticleDefine[],
      options: ProgramOptions,
    ) => commands.readParticleProgram(document, shader, [...defines], options).then(toResult),
    bakeSkinTangents: (document: BinDocumentId, entry: string) =>
      commands.bakeSkinTangents(document, entry).then(toResult),
    readMap: (document: BinDocumentId | null, map: string, materials: string[]) =>
      commands.readMap(document, map, materials).then(toResult),
    readMapParticles: (document: BinDocumentId) =>
      commands.readMapParticles(document).then(toResult),
    readMapCharacters: (document: BinDocumentId) =>
      commands.readMapCharacters(document).then(toResult),
    readMapVariants: (document: BinDocumentId, entry: string) =>
      commands.readMapVariants(document, entry).then(toResult),
    readMapOutline: (document: BinDocumentId) => commands.readMapOutline(document).then(toResult),
    locateFilesNear: (sandbox: SandboxRef, paths: readonly string[]) =>
      commands.locateFilesNear(sandbox, [...paths]).then(toResult),
    locateMapFiles: (sandbox: SandboxRef, map: string) =>
      commands.locateMapFiles(sandbox, map).then(toResult),
    readAnimationGraph: (document: BinDocumentId, entry: string) =>
      commands.readAnimationGraph(document, entry).then(toResult),
    readClipHeader: (asset: AssetRef) => commands.readClipHeader(asset).then(toResult),
    readSpell: (document: BinDocumentId, entry: string) =>
      commands.readSpell(document, entry).then(toResult),
  },

  // The object index and the install lookups a bin page makes.
  objects: {
    search: (query: string) => commands.searchObjectIndex(query).then(toResult),
    warm: () => commands.warmObjectIndex().then(toResult),
    drop: () => commands.dropObjectIndex().then(toResult),
    declared: (
      sandbox: SandboxRef,
      objectHashes: readonly string[],
      document: BinDocumentId | null = null,
    ) => commands.declaredObjects(sandbox, [...objectHashes], document).then(toResult),
    dir: (prefix: string) => commands.objectDir(prefix).then(toResult),
    spells: (character: string) => commands.characterSpells(character).then(toResult),
    classCount: (classHash: HexBinHash) => commands.classObjectCount(classHash).then(toResult),
    find: (pattern: string, regex: boolean, cls: string | null) =>
      commands.findObjects(pattern, regex, cls).then(toResult),
    references: (query: ReferenceQuery, project: string | null) =>
      commands.findReferences(query, project).then(toResult),
    cancelWalk: () => commands.cancelReferenceWalk().then(toResult),
    locateGameFiles: (paths: readonly string[]) =>
      commands.locateGameFiles([...paths]).then(toResult),
    searchGamePaths: (query: string, preference: SearchPreference) =>
      commands.searchGamePaths(query, preference).then(toResult),
  },

  // Diagnostics. The generated `commands` object is flat, so the module boundary lives here.
  diagnostics: {
    run: () => commands.runDiagnostics().then(toResult),
    openElevatedTerminal: (withBanner: boolean) =>
      commands.openElevatedTerminal(withBanner).then(toResult),
    listIncidents: () => commands.listIncidents().then(toResult),
    dismissIncident: (id: string) => commands.dismissIncident(id).then(toResult),
    dismissAllIncidents: () => commands.dismissAllIncidents().then(toResult),
    revealGameLog: (id: string) => commands.revealGameLog(id).then(toResult),
    incidentReport: (id: string, hints: string[]) =>
      commands.incidentReport(id, hints).then(toResult),
    incidentToken: (id: string) => commands.incidentToken(id).then(toResult),
    decodeIncidentToken: (token: string) => commands.decodeIncidentToken(token).then(toResult),
    telemetryIdentity: () => commands.telemetryIdentity().then(toResult),
    resetTelemetrySecret: () => commands.resetTelemetrySecret().then(toResult),
    trackUiError: (error: UiError) => commands.trackUiError(error).then(toResult),
  },

  // Launcher.
  launcher: {
    checkInstallMismatch: () => commands.checkInstallMismatch().then(toResult),
    switchLeagueInstall: (installRoot: string) =>
      commands.switchLeagueInstall(installRoot).then(toResult),
  },

  // The app's own update.
  updater: {
    check: () => commands.checkUpdate().then(toResult),
    download: () => commands.downloadUpdate().then(toResult),
    install: () => commands.installUpdate().then(toResult),
    discard: () => commands.discardUpdate().then(toResult),
  },

  // A project's ignore rules.
  ignoreRules: {
    read: (projectPath: string, at: string | null) =>
      commands.getProjectIgnoreRules(projectPath, at).then(toResult),
    recommended: () => commands.recommendedIgnoreRules().then(toResult),
    save: (projectPath: string, at: string | null, text: string) =>
      commands.saveProjectIgnoreRules(projectPath, at, text).then(toResult),
    addRecommended: (projectPath: string) =>
      commands.addRecommendedIgnoreRules(projectPath).then(toResult),
  },

  // Folders opened as projects from anywhere on disk.
  projectFolders: {
    inspect: (path: string) => commands.inspectProjectFolder(path).then(toResult),
    open: (path: string) => commands.openProjectFolder(path).then(toResult),
    recordOpened: (path: string) => commands.recordProjectOpened(path).then(toResult),
    list: () => commands.getOpenedProjectFolders().then(toResult),
    forget: (path: string) => commands.forgetProjectFolder(path).then(toResult),
    relocate: (oldPath: string, newPath: string) =>
      commands.relocateProjectFolder(oldPath, newPath).then(toResult),
    convert: (args: ConvertFolderArgs) => commands.convertFolderToProject(args).then(toResult),
    addAll: (paths: readonly string[]) => commands.addProjectFolders([...paths]).then(toResult),
  },

  // Watches on an open project's layers, which announce `layer-files-changed`.
  layerWatch: {
    acquire: (projectPath: string) => commands.watchProjectLayers(projectPath).then(toResult),
    release: (projectPath: string) => commands.unwatchProjectLayers(projectPath).then(toResult),
  },

  // A project's root text files.
  projectText: {
    read: (projectPath: string, file: ProjectTextFile) =>
      commands.getProjectText(projectPath, file).then(toResult),
    save: (projectPath: string, file: ProjectTextFile, text: string, expected: Revision | null) =>
      commands.saveProjectText(projectPath, file, text, expected).then(toResult),
  },

  // A project's game data declarations.
  declarations: {
    outline: (projectPath: string) => commands.declarationsOutline(projectPath).then(toResult),
    /** A module action with no document to undo it, for a view of the manifest itself. */
    moduleAction: (projectPath: string, layer: string, action: ModuleAction) =>
      commands.declarationsModuleAction(projectPath, layer, action).then(toResult),
  },

  // Workshop
  getWorkshopProjects: () => commands.getWorkshopProjects().then(toResult),
  createWorkshopProject: (args: CreateProjectArgs) =>
    commands.createWorkshopProject(args).then(toResult),
  getWorkshopProject: (projectPath: string) =>
    commands.getWorkshopProject(projectPath).then(toResult),
  getProjectContentTree: (projectPath: string) =>
    commands.getProjectContentTree(projectPath).then(toResult),
  saveProjectConfig: (args: SaveProjectConfigArgs) =>
    commands.saveProjectConfig(args).then(toResult),
  renameWorkshopProject: (projectPath: string, newName: string) =>
    commands.renameWorkshopProject(projectPath, newName).then(toResult),
  deleteWorkshopProject: (projectPath: string) =>
    commands.deleteWorkshopProject(projectPath).then(toResult),
  packWorkshopProject: (args: PackProjectArgs) => commands.packWorkshopProject(args).then(toResult),
  importFromModpkg: (filePath: string) => commands.importFromModpkg(filePath).then(toResult),
  peekFantome: (filePath: string) => commands.peekFantome(filePath).then(toResult),
  importFromFantome: (args: ImportFantomeArgs) => commands.importFromFantome(args).then(toResult),
  importFromGitRepo: (args: ImportGitRepoArgs) => commands.importFromGitRepo(args).then(toResult),
  validateProject: (projectPath: string) => commands.validateProject(projectPath).then(toResult),
  analyzeProject: (projectPath: string) => commands.analyzeProject(projectPath).then(toResult),
  fixProblems: (projectPath: string, problems: ProblemId[]) =>
    commands.fixProblems(projectPath, problems).then(toResult),
  setProjectThumbnail: (projectPath: string, imagePath: string) =>
    commands.setProjectThumbnail(projectPath, imagePath).then(toResult),
  removeProjectThumbnail: (projectPath: string) =>
    commands.removeProjectThumbnail(projectPath).then(toResult),
  getProjectThumbnail: (thumbnailPath: string) =>
    commands.getProjectThumbnail(thumbnailPath).then(toResult),
  saveLayerStringOverrides: (
    projectPath: string,
    layerName: string,
    stringOverrides: Record<string, Record<string, string>>,
  ) => commands.saveLayerStringOverrides(projectPath, layerName, stringOverrides).then(toResult),
  searchStringKeys: (query: string, limit?: number) =>
    commands.searchStringKeys(query, limit ?? null).then(toResult),
  lookupStringValues: (keys: string[]) => commands.lookupStringValues(keys).then(toResult),
  getLayerContentPath: (projectPath: string, layerName: string) =>
    commands.getLayerContentPath(projectPath, layerName).then(toResult),
  getLayerInfo: (projectPath: string, layerNames: string[]) =>
    commands.getLayerInfo(projectPath, layerNames).then(toResult),
  createProjectLayer: (
    projectPath: string,
    name: string,
    displayName?: string,
    description?: string,
  ) =>
    commands
      .createProjectLayer(projectPath, name, displayName ?? null, description ?? null)
      .then(toResult),
  renameProjectLayer: (projectPath: string, layerName: string, newDisplayName: string) =>
    commands.renameProjectLayer(projectPath, layerName, newDisplayName).then(toResult),
  deleteProjectLayer: (projectPath: string, layerName: string) =>
    commands.deleteProjectLayer(projectPath, layerName).then(toResult),
  reorderProjectLayers: (projectPath: string, layerNames: string[]) =>
    commands.reorderProjectLayers(projectPath, layerNames).then(toResult),
  updateLayerDescription: (projectPath: string, layerName: string, description?: string) =>
    commands.updateLayerDescription(projectPath, layerName, description ?? null).then(toResult),
  addFilesToLayer: (projectPath: string, layerName: string, sources: string[]) =>
    commands.addFilesToLayer(projectPath, layerName, sources).then(toResult),
  deleteLayerContent: (projectPath: string, layerName: string, relativePath: string) =>
    commands.deleteLayerContent(projectPath, layerName, relativePath).then(toResult),
  // The editor state file is opaque to the backend, so both sides are strings.
  getProjectEditorState: (projectPath: string) =>
    commands.getProjectEditorState(projectPath).then(toResult),
  saveProjectEditorState: (projectPath: string, content: string) =>
    commands.saveProjectEditorState(projectPath, content).then(toResult),
};

/**
 * Open the file manager on `path`, for a control with nowhere to put a failure.
 *
 * A reveal the shell refuses is a dead click and nothing worse, so this logs and
 * returns rather than growing an error surface onto every caller. Both the
 * refusal and a rejected `invoke` land in the log.
 */
export function revealPath(path: string): void {
  void api.revealInExplorer(path).then(
    (result) => {
      if (!result.ok) console.error("Could not reveal", path, result.error);
    },
    (error: unknown) => console.error("Could not reveal", path, error),
  );
}
