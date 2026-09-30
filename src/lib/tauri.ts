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
  ProjectMetadata,
  SearchPreference,
  Settings_Serialize as Settings,
  SurfaceSource,
  Tool,
  UiError,
  UiShader,
  ViewVariant,
  WorkshopFileKind,
} from "@/lib/bindings";
import { commands as appUpdate } from "@/lib/ipc/appUpdate";
import { commands as bin } from "@/lib/ipc/bin";
import { commands as game } from "@/lib/ipc/game";
import { commands as library } from "@/lib/ipc/library";
import { commands as objects } from "@/lib/ipc/objects";
import { commands as workshop } from "@/lib/ipc/workshop";
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

/** A project's metadata and the project it is written to. */
export type SaveProjectConfigArgs = ProjectMetadata & { projectPath: string };
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
  getInstalledMods: () => library.getInstalledMods().then(toResult),
  installMod: (filePath: string) => library.installMod(filePath).then(toResult),
  installMods: (filePaths: string[]) => library.installMods(filePaths).then(toResult),
  updateMod: (modId: string, filePath: string) => library.updateMod(modId, filePath).then(toResult),
  uninstallMod: (modId: string) => library.uninstallMod(modId).then(toResult),
  exportMods: (scope: ExportScope, shape: ExportShape, destination: string) =>
    library.exportMods(scope, shape, destination).then(toResult),
  toggleMod: (modId: string, enabled: boolean) => library.toggleMod(modId, enabled).then(toResult),
  getModThumbnail: (modId: string) => library.getModThumbnail(modId).then(toResult),
  getModThumbnails: (modIds: readonly string[]) =>
    library.getModThumbnails([...modIds]).then(toResult),
  getModReadme: (modId: string) => library.getModReadme(modId).then(toResult),
  getModLicenseText: (modId: string) => library.getModLicenseText(modId).then(toResult),
  getStorageDirectory: () => library.getStorageDirectory().then(toResult),
  reorderMods: (modIds: string[]) => library.reorderMods(modIds).then(toResult),
  setModLayers: (modId: string, layerStates: Record<string, boolean>) =>
    library.setModLayers(modId, layerStates).then(toResult),
  enableModWithLayers: (modId: string, layerStates: Record<string, boolean>) =>
    library.enableModWithLayers(modId, layerStates).then(toResult),
  editModMetadata: (modId: string, metadata: EditModMetadataArgs) =>
    library.editModMetadata(modId, metadata).then(toResult),
  setModStorage: (modId: string, storage: ModStorage) =>
    library.setModStorage(modId, storage).then(toResult),
  getAllModWadReports: () => library.getAllModWadReports().then(toResult),
  analyzeModWads: (modId: string) => library.analyzeModWads(modId).then(toResult),
  checkModHealth: (modId: string) => library.checkModHealth(modId).then(toResult),
  /** Re-check `modIds`, or every mod in the library when none are named. */
  sweepModHealth: (modIds?: string[]) => library.sweepModHealth(modIds ?? null).then(toResult),
  repairMod: (modId: string) => library.repairMod(modId).then(toResult),
  repairMods: (modIds: string[]) => library.repairMods(modIds).then(toResult),
  getModHealthVerdicts: () => library.getModHealthVerdicts().then(toResult),
  getHealthSweep: () => library.getHealthSweep().then(toResult),
  getHealthCheckReadiness: () => library.getHealthCheckReadiness().then(toResult),
  cancelModHealthRun: () => library.cancelModHealthRun().then(toResult),
  /**
   * Time a health pass over the real library, into the dev console.
   *
   * Registered only in a debug build. `repair` runs the real repair, which
   * rewrites the mods it can fix and keeps no way back.
   */
  timeModHealth: (repair: boolean) => library.timeModHealth(repair).then(toResult),

  // Migration
  scanCslolMods: (directory: string) => library.scanCslolMods(directory).then(toResult),
  importCslolMods: (directory: string, selectedFolders: string[]) =>
    library.importCslolMods(directory, selectedFolders).then(toResult),
  getLayoutMigrationState: () => library.getLayoutMigrationState().then(toResult),

  // Inspector

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

  // Profiles
  listModProfiles: () => library.listModProfiles().then(toResult),
  getActiveModProfile: () => library.getActiveModProfile().then(toResult),
  createModProfile: (name: string) => library.createModProfile(name).then(toResult),
  deleteModProfile: (profileId: string) => library.deleteModProfile(profileId).then(toResult),
  switchModProfile: (profileId: string) => library.switchModProfile(profileId).then(toResult),
  renameModProfile: (profileId: string, newName: string) =>
    library.renameModProfile(profileId, newName).then(toResult),

  // Folders
  getFolders: () => library.getFolders().then(toResult),
  getFolderOrder: () => library.getFolderOrder().then(toResult),
  createFolder: (name: string) => library.createFolder(name).then(toResult),
  renameFolder: (folderId: string, newName: string) =>
    library.renameFolder(folderId, newName).then(toResult),
  deleteFolder: (folderId: string) => library.deleteFolder(folderId).then(toResult),
  moveModToFolder: (modId: string, folderId: string) =>
    library.moveModToFolder(modId, folderId).then(toResult),
  toggleFolder: (folderId: string, enabled: boolean) =>
    library.toggleFolder(folderId, enabled).then(toResult),
  reorderFolderMods: (folderId: string, modIds: string[]) =>
    library.reorderFolderMods(folderId, modIds).then(toResult),
  reorderFolders: (folderOrder: string[]) => library.reorderFolders(folderOrder).then(toResult),

  // Hashtables
  getHashtableCacheStatus: () => game.getHashtableCacheStatus().then(toResult),
  checkHashtableUpdates: () => game.checkHashtableUpdates().then(toResult),
  syncHashtables: (force: boolean) => game.syncHashtables(force).then(toResult),

  // Game WADs
  getGameWads: () => game.getGameWads().then(toResult),
  readGameWad: (wadName: string) => game.readGameWad(wadName).then(toResult),

  // Game index
  getGameIndex: () => game.getGameIndex().then(toResult),
  readGameDir: (path: string) => game.readGameDir(path).then(toResult),
  refreshGameIndex: () => game.refreshGameIndex().then(toResult),
  searchGameIndex: (query: string) =>
    game.searchGameIndex(query, { kind: "palette" }).then(toResult),
  findInGameIndex: (pattern: string, regex: boolean) =>
    game.findInGameIndex(pattern, regex).then(toResult),

  // Extract to disk
  planGameExtract: (targets: ExtractTarget[], kinds: WorkshopFileKind[] | null) =>
    game.planGameExtract(targets, kinds).then(toResult),
  // Resolves to null when an extract was already in flight - a redundant click.
  extractGameFiles: (targets: ExtractTarget[], options: ExtractOptions) =>
    game.extractGameFiles(targets, options).then(toResult),
  // Resolves to false when nothing was in flight, which is what a Cancel
  // pressed just as the run finished looks like.
  cancelExtract: () => game.cancelExtract().then(toResult),

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
      bin.binOpen(sandbox, asset, entry).then(toResult),
    openVariant: (sandbox: SandboxRef, asset: AssetRef, base: AssetRef, path: string) =>
      bin.binOpenVariant(sandbox, asset, base, path).then(toResult),
    children: (
      document: BinDocumentId,
      entry: string,
      path: string,
      offset: number,
      limit: number,
    ) => bin.binChildren(document, entry, path, offset, limit).then(toResult),
    read: (document: BinDocumentId, entry: string, paths: readonly string[]) =>
      bin.binRead(document, entry, [...paths]).then(toResult),
    find: (document: BinDocumentId, entry: string | null, query: string) =>
      bin.binFind(document, entry, query).then(toResult),
    edit: (document: BinDocumentId, edit: BinEdit) => bin.binEdit(document, edit).then(toResult),
    choices: (document: BinDocumentId, query: ChoiceQuery) =>
      bin.binChoices(document, query).then(toResult),
    copyValue: (document: BinDocumentId, entry: string, path: string) =>
      bin.binCopyValue(document, entry, path).then(toResult),
    save: (document: BinDocumentId) => bin.binSave(document).then(toResult),
    reload: (document: BinDocumentId) => bin.binReload(document).then(toResult),
    undo: (document: BinDocumentId) => bin.binHistory(document, "undo").then(toResult),
    redo: (document: BinDocumentId) => bin.binHistory(document, "redo").then(toResult),
    changes: (document: BinDocumentId, baseline: ChangeBaseline) =>
      bin.binChanges(document, baseline).then(toResult),
    revert: (document: BinDocumentId, entry: string, path: string, baseline: ChangeBaseline) =>
      bin.binRevert(document, entry, path, baseline).then(toResult),
    declared: (document: BinDocumentId) => bin.binDeclared(document).then(toResult),
    overrides: (document: BinDocumentId) => bin.binOverrides(document).then(toResult),
    declareInto: (document: BinDocumentId, layer: string, module: DeclaredModuleChoice) =>
      bin.binDeclareInto(document, layer, module).then(toResult),
    setDeclaring: (document: BinDocumentId, declaring: Declaring) =>
      bin.binSetDeclaring(document, declaring).then(toResult),
    rowDeclaration: (document: BinDocumentId, entry: string, path: string) =>
      bin.binRowDeclaration(document, entry, path).then(toResult),
    roots: (document: BinDocumentId) => bin.binRoots(document).then(toResult),
    dependencies: (document: BinDocumentId) => bin.binDependencies(document).then(toResult),
    close: (document: BinDocumentId) => bin.binClose(document).then(toResult),
    classSchema: (classHash: string) => bin.classSchema(classHash).then(toResult),
    derivedClasses: (classHash: string) => bin.derivedClasses(classHash).then(toResult),
    classDocs: (classHash: string) => bin.classDocs(classHash).then(toResult),
    syncMetaDocs: () => bin.syncMetaDocs().then(toResult),
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
    search: (query: string) => objects.searchObjectIndex(query).then(toResult),
    warm: () => objects.warmObjectIndex().then(toResult),
    drop: () => objects.dropObjectIndex().then(toResult),
    declared: (
      sandbox: SandboxRef,
      objectHashes: readonly string[],
      document: BinDocumentId | null = null,
    ) => objects.declaredObjects(sandbox, [...objectHashes], document).then(toResult),
    dir: (prefix: string) => objects.objectDir(prefix).then(toResult),
    spells: (character: string) => objects.characterSpells(character).then(toResult),
    classCount: (classHash: HexBinHash) => objects.classObjectCount(classHash).then(toResult),
    find: (pattern: string, regex: boolean, cls: string | null) =>
      objects.findObjects(pattern, regex, cls).then(toResult),
    references: (query: ReferenceQuery, project: string | null) =>
      objects.findReferences(query, project).then(toResult),
    cancelWalk: () => objects.cancelReferenceWalk().then(toResult),
    locateGameFiles: (paths: readonly string[]) => game.locateGameFiles([...paths]).then(toResult),
    searchGamePaths: (query: string, preference: SearchPreference) =>
      game.searchGameIndex(query, { kind: "pathField", preference }).then(toResult),
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
    check: () => appUpdate.checkUpdate().then(toResult),
    download: () => appUpdate.downloadUpdate().then(toResult),
    install: () => appUpdate.installUpdate().then(toResult),
    discard: () => appUpdate.discardUpdate().then(toResult),
  },

  // A project's ignore rules.
  ignoreRules: {
    read: (projectPath: string, at: string | null) =>
      workshop.getProjectIgnoreRules(projectPath, at).then(toResult),
    recommended: () => workshop.recommendedIgnoreRules().then(toResult),
    save: (projectPath: string, at: string | null, text: string) =>
      workshop.saveProjectIgnoreRules(projectPath, at, text).then(toResult),
    addRecommended: (projectPath: string) =>
      workshop.addRecommendedIgnoreRules(projectPath).then(toResult),
  },

  // Folders opened as projects from anywhere on disk.
  projectFolders: {
    inspect: (path: string) => workshop.inspectProjectFolder(path).then(toResult),
    open: (path: string) => workshop.openProjectFolder(path).then(toResult),
    recordOpened: (path: string) => workshop.recordProjectOpened(path).then(toResult),
    list: () => workshop.getOpenedProjectFolders().then(toResult),
    forget: (path: string) => workshop.forgetProjectFolder(path).then(toResult),
    relocate: (oldPath: string, newPath: string) =>
      workshop.relocateProjectFolder(oldPath, newPath).then(toResult),
    convert: (args: ConvertFolderArgs) => workshop.convertFolderToProject(args).then(toResult),
    addAll: (paths: readonly string[]) => workshop.addProjectFolders([...paths]).then(toResult),
  },

  // Watches on an open project's layers, which announce `layer-files-changed`.
  layerWatch: {
    acquire: (projectPath: string) => workshop.watchProjectLayers(projectPath).then(toResult),
    release: (projectPath: string) => workshop.unwatchProjectLayers(projectPath).then(toResult),
  },

  // A project's root text files.
  projectText: {
    read: (projectPath: string, file: ProjectTextFile) =>
      workshop.getProjectText(projectPath, file).then(toResult),
    save: (projectPath: string, file: ProjectTextFile, text: string, expected: Revision | null) =>
      workshop.saveProjectText(projectPath, file, text, expected).then(toResult),
  },

  // A project's game data declarations.
  declarations: {
    outline: (projectPath: string) => workshop.declarationsOutline(projectPath).then(toResult),
    /** A module action with no document to undo it, for a view of the manifest itself. */
    moduleAction: (projectPath: string, layer: string, action: ModuleAction) =>
      bin.declarationsModuleAction(projectPath, layer, action).then(toResult),
  },

  // Workshop
  getWorkshopProjects: () => workshop.getWorkshopProjects().then(toResult),
  createWorkshopProject: (args: CreateProjectArgs) =>
    workshop.createProject({ kind: "new", args }).then(toResult),
  getWorkshopProject: (projectPath: string) =>
    workshop.getWorkshopProject(projectPath).then(toResult),
  getProjectContentTree: (projectPath: string) =>
    workshop.getProjectContentTree(projectPath).then(toResult),
  saveProjectConfig: ({ projectPath, ...metadata }: SaveProjectConfigArgs) =>
    workshop.editProject(projectPath, { kind: "metadata", metadata }).then(toResult),
  renameWorkshopProject: (projectPath: string, newName: string) =>
    workshop.renameWorkshopProject(projectPath, newName).then(toResult),
  deleteWorkshopProject: (projectPath: string) =>
    workshop.deleteWorkshopProject(projectPath).then(toResult),
  packWorkshopProject: (args: PackProjectArgs) => workshop.packWorkshopProject(args).then(toResult),
  importFromModpkg: (filePath: string) =>
    workshop.createProject({ kind: "modpkg", filePath }).then(toResult),
  peekFantome: (filePath: string) => workshop.peekFantome(filePath).then(toResult),
  importFromFantome: (args: ImportFantomeArgs) =>
    workshop.createProject({ kind: "fantome", args }).then(toResult),
  importFromGitRepo: (args: ImportGitRepoArgs) =>
    workshop.createProject({ kind: "gitRepo", args }).then(toResult),
  validateProject: (projectPath: string) => workshop.validateProject(projectPath).then(toResult),
  analyzeProject: (projectPath: string) => workshop.analyzeProject(projectPath).then(toResult),
  fixProblems: (projectPath: string, problems: ProblemId[]) =>
    workshop.fixProblems(projectPath, problems).then(toResult),
  setProjectThumbnail: (projectPath: string, imagePath: string) =>
    workshop.editProject(projectPath, { kind: "setThumbnail", imagePath }).then(toResult),
  removeProjectThumbnail: (projectPath: string) =>
    workshop.editProject(projectPath, { kind: "removeThumbnail" }).then(toResult),
  getProjectThumbnail: (thumbnailPath: string) =>
    workshop.getProjectThumbnail(thumbnailPath).then(toResult),
  saveLayerStringOverrides: (
    projectPath: string,
    layerName: string,
    stringOverrides: Record<string, Record<string, string>>,
  ) =>
    workshop
      .editProject(projectPath, {
        kind: "stringOverrides",
        layer: layerName,
        overrides: stringOverrides,
      })
      .then(toResult),
  searchStringKeys: (query: string, limit?: number) =>
    game.searchStringKeys(query, limit ?? null).then(toResult),
  lookupStringValues: (keys: string[]) => game.lookupStringValues(keys).then(toResult),
  getLayerContentPath: (projectPath: string, layerName: string) =>
    workshop.getLayerContentPath(projectPath, layerName).then(toResult),
  getLayerInfo: (projectPath: string, layerNames: string[]) =>
    workshop.getLayerInfo(projectPath, layerNames).then(toResult),
  createProjectLayer: (
    projectPath: string,
    name: string,
    displayName?: string,
    description?: string,
  ) =>
    workshop
      .editProject(projectPath, {
        kind: "createLayer",
        name,
        displayName: displayName ?? null,
        description: description ?? null,
      })
      .then(toResult),
  renameProjectLayer: (projectPath: string, layerName: string, newDisplayName: string) =>
    workshop
      .editProject(projectPath, {
        kind: "renameLayer",
        layer: layerName,
        displayName: newDisplayName,
      })
      .then(toResult),
  deleteProjectLayer: (projectPath: string, layerName: string) =>
    workshop.editProject(projectPath, { kind: "deleteLayer", layer: layerName }).then(toResult),
  reorderProjectLayers: (projectPath: string, layerNames: string[]) =>
    workshop.editProject(projectPath, { kind: "reorderLayers", layers: layerNames }).then(toResult),
  updateLayerDescription: (projectPath: string, layerName: string, description?: string) =>
    workshop
      .editProject(projectPath, {
        kind: "describeLayer",
        layer: layerName,
        description: description ?? null,
      })
      .then(toResult),
  addFilesToLayer: (projectPath: string, layerName: string, sources: string[]) =>
    workshop.addFilesToLayer(projectPath, layerName, sources).then(toResult),
  deleteLayerContent: (projectPath: string, layerName: string, relativePath: string) =>
    workshop.deleteLayerContent(projectPath, layerName, relativePath).then(toResult),
  // The editor state file is opaque to the backend, so both sides are strings.
  getProjectEditorState: (projectPath: string) =>
    workshop.getProjectEditorState(projectPath).then(toResult),
  saveProjectEditorState: (projectPath: string, content: string) =>
    workshop.saveProjectEditorState(projectPath, content).then(toResult),
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
