import { commands } from "@/lib/bindings";
import type {
  AssetRef,
  BinDocumentId,
  CreateProjectArgs,
  ExtractOptions,
  ExtractTarget,
  ImportFantomeArgs,
  ImportGitRepoArgs,
  LaunchTarget,
  MaterialSource,
  ParticleDefine,
  ParticleShader,
  ProgramOptions,
  SandboxRef,
  ProjectMetadata,
  SearchPreference,
  UiShader,
  WadSource,
  WorkshopFileKind,
} from "@/lib/bindings";
import { commands as appUpdate } from "@/lib/ipc/appUpdate";
import { commands as bin } from "@/lib/ipc/bin";
import { commands as game } from "@/lib/ipc/game";
import { commands as library } from "@/lib/ipc/library";
import { commands as objects } from "@/lib/ipc/objects";
import { commands as preview } from "@/lib/ipc/preview";
import { commands as workshop } from "@/lib/ipc/workshop";
import { map as mapResult } from "@/utils/result";

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

// API functions
export const api = {
  integrations: {
    status: commands.integrationStatus,
    release: commands.integrationRelease,
    change: commands.changeIntegration,
    cancel: commands.cancelIntegrationDownload,
    fileTypeStatus: commands.fileTypeStatus,
    openDefaultApps: commands.openDefaultApps,
  },
  getAppInfo: commands.getAppInfo,
  getPlatformSupport: commands.getPlatformSupport,
  showMainWindow: commands.showMainWindow,
  listReleases: commands.listReleases,
  listAnnouncements: commands.listAnnouncements,
  listNotices: commands.listNotices,

  // Settings
  getSettings: commands.getSettings,
  getDefaultSettings: commands.getDefaultSettings,
  saveSettings: commands.saveSettings,
  autoDetectLeaguePath: commands.autoDetectLeaguePath,
  validateLeaguePath: commands.validateLeaguePath,
  checkSetupRequired: commands.checkSetupRequired,
  detectLeagueRunAsAdmin: commands.detectLeagueRunAsAdmin,
  listAvailableWads: commands.listAvailableWads,
  listForcibleMapSkins: commands.listForcibleMapSkins,
  listMapDecorations: commands.listMapDecorations,

  // Mods
  getInstalledMods: library.getInstalledMods,
  installMod: library.installMod,
  installMods: library.installMods,
  updateMod: library.updateMod,
  uninstallMod: library.uninstallMod,
  exportMods: library.exportMods,
  toggleMod: library.toggleMod,
  getModThumbnail: library.getModThumbnail,
  getModThumbnails: (modIds: readonly string[]) => library.getModThumbnails([...modIds]),
  getModReadme: library.getModReadme,
  getModLicenseText: library.getModLicenseText,
  getStorageDirectory: library.getStorageDirectory,
  reorderMods: library.reorderMods,
  setModLayers: (modId: string, layerStates: Record<string, boolean>) =>
    library.setModLayers(modId, layerStates),
  enableModWithLayers: (modId: string, layerStates: Record<string, boolean>) =>
    library.enableModWithLayers(modId, layerStates),
  editModMetadata: library.editModMetadata,
  setModStorage: library.setModStorage,
  getAllModWadReports: library.getAllModWadReports,
  analyzeModWads: library.analyzeModWads,
  checkModHealth: library.checkModHealth,
  /** Re-check `modIds`, or every mod in the library when none are named. */
  sweepModHealth: (modIds?: string[]) => library.sweepModHealth(modIds ?? null),
  repairMod: library.repairMod,
  repairMods: library.repairMods,
  getModHealthVerdicts: library.getModHealthVerdicts,
  getHealthSweep: library.getHealthSweep,
  getHealthCheckReadiness: library.getHealthCheckReadiness,
  cancelModHealthRun: library.cancelModHealthRun,
  /**
   * Time a health pass over the real library, into the dev console.
   *
   * Registered only in a debug build. `repair` runs the real repair, which
   * rewrites the mods it can fix and keeps no way back.
   */
  timeModHealth: library.timeModHealth,

  // Migration
  scanCslolMods: library.scanCslolMods,
  importCslolMods: library.importCslolMods,
  getLayoutMigrationState: library.getLayoutMigrationState,

  // Inspector

  // Patcher
  startPatcher: commands.startPatcher,
  stopPatcher: commands.stopPatcher,
  rebuildOverlay: commands.rebuildOverlay,
  getPatcherStatus: commands.getPatcherStatus,
  getLinkedBinOffenders: commands.getLinkedBinOffenders,
  getChecksumMismatches: commands.getChecksumMismatches,

  // Launcher
  // Resolves to null when a launch was already in flight - a redundant click.
  launchLeague: (target?: LaunchTarget) => commands.launchLeague(target ?? null),
  // Resolves to false when nothing was in flight, which is what a Cancel
  // pressed just as the request landed looks like.
  cancelLaunch: commands.cancelLaunch,
  stopLeague: commands.stopLeague,
  getLaunchAvailability: commands.getLaunchAvailability,
  // Also starts following the session it reports, so a game already in progress
  // when the app opened still reaches the session events.
  getLeagueSession: commands.getLeagueSession,

  // Hotkeys
  pauseHotkeys: commands.pauseHotkeys,
  resumeHotkeys: commands.resumeHotkeys,
  setHotkey: commands.setHotkey,

  // Profiles
  listModProfiles: library.listModProfiles,
  getActiveModProfile: library.getActiveModProfile,
  createModProfile: library.createModProfile,
  deleteModProfile: library.deleteModProfile,
  switchModProfile: library.switchModProfile,
  renameModProfile: library.renameModProfile,

  // Folders
  getFolders: library.getFolders,
  getFolderOrder: library.getFolderOrder,
  createFolder: library.createFolder,
  renameFolder: library.renameFolder,
  deleteFolder: library.deleteFolder,
  moveModToFolder: library.moveModToFolder,
  toggleFolder: library.toggleFolder,
  reorderFolderMods: library.reorderFolderMods,
  reorderFolders: library.reorderFolders,

  // Hashtables
  getHashtableCacheStatus: game.getHashtableCacheStatus,
  checkHashtableUpdates: game.checkHashtableUpdates,
  syncHashtables: game.syncHashtables,

  // Game and LCU WADs
  getGameWads: game.getGameWads,
  readGameWad: (source: WadSource, wadName: string) => game.readGameWad(wadName, source),

  // Game and LCU index
  getGameIndex: game.getGameIndex,
  readGameDir: (source: WadSource, path: string) => game.readGameDir(path, source),
  refreshGameIndex: game.refreshGameIndex,
  searchGameIndex: (query: string) => game.searchGameIndex(query, { kind: "palette" }),
  findInGameIndex: (source: WadSource, pattern: string, regex: boolean) =>
    game.findInGameIndex(pattern, regex, source),

  // Extract to disk
  planGameExtract: (
    source: WadSource,
    targets: ExtractTarget[],
    kinds: WorkshopFileKind[] | null,
  ) => game.planGameExtract(targets, kinds, source),
  // Resolves to null when an extract was already in flight - a redundant click.
  extractGameFiles: (source: WadSource, targets: ExtractTarget[], options: ExtractOptions) =>
    game.extractGameFiles(targets, options, source),
  // Resolves to false when nothing was in flight, which is what a Cancel
  // pressed just as the run finished looks like.
  cancelExtract: game.cancelExtract,

  // Asset preview
  readAssetInfo: preview.readAssetInfo,
  saveAssetCopy: preview.saveAssetCopy,

  // Ritobin
  detectRitobinIntegration: preview.detectRitobinIntegration,
  openAssetInRitobin: (asset: AssetRef, name?: string) =>
    preview.openAssetInRitobin(asset, name ?? null),

  // Deep Link
  deepLinkInstallMod: (
    url: string,
    name?: string | null,
    author?: string | null,
    source?: string | null,
  ) => commands.deepLinkInstallMod(url, name ?? null, author ?? null, source ?? null),
  takePendingDeepLink: commands.takePendingDeepLink,
  takePendingOpenedFiles: commands.takePendingOpenedFiles,

  // Shell
  revealInExplorer: commands.revealInExplorer,
  minimizeToTray: commands.minimizeToTray,

  // Storage
  detectStorageMedium: commands.detectStorageMedium,

  // The bin editor and the class reads over its documents.
  bin: {
    open: bin.binOpen,
    openVariant: bin.binOpenVariant,
    children: bin.binChildren,
    read: (document: BinDocumentId, entry: string, paths: readonly string[]) =>
      bin.binRead(document, entry, [...paths]),
    find: bin.binFind,
    edit: bin.binEdit,
    choices: bin.binChoices,
    copyValue: bin.binCopyValue,
    save: bin.binSave,
    reload: bin.binReload,
    undo: (document: BinDocumentId) => bin.binHistory(document, "undo"),
    redo: (document: BinDocumentId) => bin.binHistory(document, "redo"),
    changes: bin.binChanges,
    revert: bin.binRevert,
    declared: bin.binDeclared,
    overrides: bin.binOverrides,
    declareInto: bin.binDeclareInto,
    setDeclaring: bin.binSetDeclaring,
    rowDeclaration: bin.binRowDeclaration,
    roots: bin.binRoots,
    dependencies: bin.binDependencies,
    close: bin.binClose,
    classSchema: bin.classSchema,
    derivedClasses: bin.derivedClasses,
    classDocs: bin.classDocs,
    syncMetaDocs: bin.syncMetaDocs,
    readVfxSystem: preview.readVfxSystem,
    vfxTemplates: preview.vfxTemplates,
    readUiView: commands.readUiView,
    readUiSceneView: commands.readUiSceneView,
    readUiFont: commands.readUiFont,
    readUiFontCatalog: commands.readUiFontCatalog,
    readUiMaterialPrograms: (documents: readonly BinDocumentId[], entries: readonly string[]) =>
      commands.readUiMaterialPrograms([...documents], [...entries]),
    readUiPrograms: (document: BinDocumentId | null, shaders: readonly UiShader[]) =>
      commands.readUiPrograms(document, [...shaders]),
    readUiLoadout: commands.readUiLoadout,
    readUiTooltips: commands.readUiTooltips,
    readUiCharacters: commands.readUiCharacters,
    atlasExportSprite: (
      texture: AssetRef,
      uv: readonly [number, number, number, number],
      destination: string,
    ) => commands.atlasExportSprite(texture, [...uv], destination),
    atlasImportFontFile: commands.atlasImportFontFile,
    atlasImportSprite: commands.atlasImportSprite,
    atlasMakeSurface: commands.atlasMakeSurface,
    atlasPatchSprite: (
      document: BinDocumentId,
      page: string,
      uv: readonly [number, number, number, number],
      source: string,
    ) => commands.atlasPatchSprite(document, page, [...uv], source),
    atlasSheet: commands.atlasSheet,
    readSkin: preview.readSkin,
    readMaterialPrograms: (
      source: MaterialSource,
      entries: readonly string[],
      options: ProgramOptions,
    ) =>
      preview.readMaterialPrograms(
        source,
        entries.map((entry) => ({ kind: "object" as const, entry })),
        options,
      ),
    readEmbeddedMaterialProgram: (
      source: MaterialSource,
      entry: string,
      path: string,
      options: ProgramOptions,
    ) =>
      preview
        .readMaterialPrograms(source, [{ kind: "embedded", entry, path }], options)
        .then((result) => mapResult(result, ([program]) => program ?? null)),
    readDefaultSkinnedProgram: (document: BinDocumentId, options: ProgramOptions) =>
      preview.readEngineProgram({ kind: "defaultSkinned", document }, options),
    readParticleProgram: (
      document: BinDocumentId | null,
      shader: ParticleShader,
      defines: readonly ParticleDefine[],
      options: ProgramOptions,
    ) =>
      preview.readEngineProgram(
        { kind: "particle", document, shader, defines: [...defines] },
        options,
      ),
    bakeSkinTangents: preview.bakeSkinTangents,
    readMap: preview.readMap,
    readMapParticles: preview.readMapParticles,
    readMapCharacters: preview.readMapCharacters,
    readMapVariants: preview.readMapVariants,
    readMapOutline: preview.readMapOutline,
    locateFilesNear: (sandbox: SandboxRef, paths: readonly string[]) =>
      preview.locateFilesNear(sandbox, [...paths]),
    locateMapFiles: preview.locateMapFiles,
    readAnimationGraph: preview.readAnimationGraph,
    readClipHeader: preview.readClipHeader,
    readSpell: preview.readSpell,
  },

  // The object index and the install lookups a bin page makes.
  objects: {
    search: objects.searchObjectIndex,
    warm: objects.warmObjectIndex,
    drop: objects.dropObjectIndex,
    declared: (
      sandbox: SandboxRef,
      objectHashes: readonly string[],
      document: BinDocumentId | null = null,
    ) => objects.declaredObjects(sandbox, [...objectHashes], document),
    dir: objects.objectDir,
    spells: objects.characterSpells,
    classCount: objects.classObjectCount,
    find: objects.findObjects,
    references: objects.findReferences,
    cancelWalk: objects.cancelReferenceWalk,
    locateGameFiles: (paths: readonly string[]) => game.locateGameFiles([...paths]),
    searchGamePaths: (query: string, preference: SearchPreference) =>
      game.searchGameIndex(query, { kind: "pathField", preference }),
  },

  // Diagnostics. The generated `commands` object is flat, so the module boundary lives here.
  diagnostics: {
    run: commands.runDiagnostics,
    openElevatedTerminal: commands.openElevatedTerminal,
    listIncidents: commands.listIncidents,
    dismissIncident: commands.dismissIncident,
    dismissAllIncidents: commands.dismissAllIncidents,
    revealGameLog: commands.revealGameLog,
    incidentReport: commands.incidentReport,
    incidentToken: commands.incidentToken,
    decodeIncidentToken: commands.decodeIncidentToken,
    telemetryIdentity: commands.telemetryIdentity,
    resetTelemetrySecret: commands.resetTelemetrySecret,
    trackUiError: commands.trackUiError,
  },

  // Launcher.
  launcher: {
    checkInstallMismatch: commands.checkInstallMismatch,
    switchLeagueInstall: commands.switchLeagueInstall,
  },

  // The app's own update.
  updater: {
    check: appUpdate.checkUpdate,
    download: appUpdate.downloadUpdate,
    install: appUpdate.installUpdate,
    discard: appUpdate.discardUpdate,
  },

  // A project's ignore rules.
  ignoreRules: {
    read: workshop.getProjectIgnoreRules,
    recommended: workshop.recommendedIgnoreRules,
    save: workshop.saveProjectIgnoreRules,
    addRecommended: workshop.addRecommendedIgnoreRules,
  },

  // Folders opened as projects from anywhere on disk.
  projectFolders: {
    inspect: workshop.inspectProjectFolder,
    open: workshop.openProjectFolder,
    recordOpened: workshop.recordProjectOpened,
    list: workshop.getOpenedProjectFolders,
    forget: workshop.forgetProjectFolder,
    relocate: workshop.relocateProjectFolder,
    convert: workshop.convertFolderToProject,
    addAll: (paths: readonly string[]) => workshop.addProjectFolders([...paths]),
  },

  // Watches on an open project's layers, which announce `layer-files-changed`.
  layerWatch: {
    acquire: workshop.watchProjectLayers,
    release: workshop.unwatchProjectLayers,
  },

  // A project's root text files.
  projectText: {
    read: workshop.getProjectText,
    save: workshop.saveProjectText,
  },

  // A project's game data declarations.
  declarations: {
    outline: workshop.declarationsOutline,
    /** A module action with no document to undo it, for a view of the manifest itself. */
    moduleAction: bin.declarationsModuleAction,
  },

  // Workshop
  getWorkshopProjects: workshop.getWorkshopProjects,
  createWorkshopProject: (args: CreateProjectArgs) => workshop.createProject({ kind: "new", args }),
  getWorkshopProject: workshop.getWorkshopProject,
  getProjectContentTree: workshop.getProjectContentTree,
  saveProjectConfig: ({ projectPath, ...metadata }: SaveProjectConfigArgs) =>
    workshop.editProject(projectPath, { kind: "metadata", metadata }),
  renameWorkshopProject: workshop.renameWorkshopProject,
  deleteWorkshopProject: workshop.deleteWorkshopProject,
  packWorkshopProject: workshop.packWorkshopProject,
  importFromModpkg: (filePath: string) => workshop.createProject({ kind: "modpkg", filePath }),
  peekFantome: workshop.peekFantome,
  importFromFantome: (args: ImportFantomeArgs) => workshop.createProject({ kind: "fantome", args }),
  importFromGitRepo: (args: ImportGitRepoArgs) => workshop.createProject({ kind: "gitRepo", args }),
  validateProject: workshop.validateProject,
  analyzeProject: workshop.analyzeProject,
  fixProblems: workshop.fixProblems,
  setProjectThumbnail: (projectPath: string, imagePath: string) =>
    workshop.editProject(projectPath, { kind: "setThumbnail", imagePath }),
  removeProjectThumbnail: (projectPath: string) =>
    workshop.editProject(projectPath, { kind: "removeThumbnail" }),
  getProjectThumbnail: workshop.getProjectThumbnail,
  saveLayerStringOverrides: (
    projectPath: string,
    layerName: string,
    stringOverrides: Record<string, Record<string, string>>,
  ) =>
    workshop.editProject(projectPath, {
      kind: "stringOverrides",
      layer: layerName,
      overrides: stringOverrides,
    }),
  searchStringKeys: (query: string, limit?: number) => game.searchStringKeys(query, limit ?? null),
  lookupStringValues: game.lookupStringValues,
  readChampions: game.readChampions,
  getLayerContentPath: workshop.getLayerContentPath,
  getLayerInfo: workshop.getLayerInfo,
  createProjectLayer: (
    projectPath: string,
    name: string,
    displayName?: string,
    description?: string,
  ) =>
    workshop.editProject(projectPath, {
      kind: "createLayer",
      name,
      displayName: displayName ?? null,
      description: description ?? null,
    }),
  renameProjectLayer: (projectPath: string, layerName: string, newDisplayName: string) =>
    workshop.editProject(projectPath, {
      kind: "renameLayer",
      layer: layerName,
      displayName: newDisplayName,
    }),
  deleteProjectLayer: (projectPath: string, layerName: string) =>
    workshop.editProject(projectPath, { kind: "deleteLayer", layer: layerName }),
  reorderProjectLayers: (projectPath: string, layerNames: string[]) =>
    workshop.editProject(projectPath, { kind: "reorderLayers", layers: layerNames }),
  updateLayerDescription: (projectPath: string, layerName: string, description?: string) =>
    workshop.editProject(projectPath, {
      kind: "describeLayer",
      layer: layerName,
      description: description ?? null,
    }),
  addFilesToLayer: workshop.addFilesToLayer,
  deleteLayerContent: workshop.deleteLayerContent,
  // The editor state file is opaque to the backend, so both sides are strings.
  getProjectEditorState: workshop.getProjectEditorState,
  saveProjectEditorState: workshop.saveProjectEditorState,
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
