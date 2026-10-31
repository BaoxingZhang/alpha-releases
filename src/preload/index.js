"use strict";
const electron = require("electron");
const REVOKED = "MESSAGE_MUTATION_DISPATCH_REVOKED";
const MAX_READ_ATTEMPTS = 3;
async function readPendingMetadata(invoke, pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds))) {
  for (let attempt = 0; attempt < MAX_READ_ATTEMPTS; attempt++) {
    const reply = await invoke();
    if (reply?.status === "ok" && Object.hasOwn(reply, "pending") && reply.pending !== void 0) return reply.pending;
    if (reply?.status !== "revoked") throw new Error("PENDING_METADATA_RESPONSE_INVALID");
    if (attempt + 1 < MAX_READ_ATTEMPTS) await pause(50);
  }
  throw new Error(REVOKED);
}
const IPC_CHANNELS = {
  readAccountDataKey: "alpha:accounts:data-key:read",
  getHttpApiStatus: "alpha:system:http-api-status",
  getHttpApiToken: "alpha:system:http-api-token",
  getHttpApiPushFilter: "alpha:system:http-api-push-filter",
  updateHttpApiPushFilter: "alpha:system:http-api-push-filter-update",
  getAgentSettings: "alpha:agent-settings:get",
  updateAgentSettings: "alpha:agent-settings:update",
  listAgentModels: "alpha:agent-settings:list-models",
  saveAgentProvider: "alpha:agent-settings:save-provider",
  removeAgentProvider: "alpha:agent-settings:remove-provider",
  useAgentModel: "alpha:agent-settings:use-model",
  setAgentToolApproval: "alpha:agent-settings:set-tool-approval",
  saveAgentModelSettings: "alpha:agent-settings:save-model-settings",
  signInAgentChatGpt: "alpha:agent-settings:chatgpt-sign-in",
  cancelAgentChatGptSignIn: "alpha:agent-settings:chatgpt-cancel-sign-in",
  signOutAgentChatGpt: "alpha:agent-settings:chatgpt-sign-out",
  getNetworkProxy: "alpha:network-proxy:get",
  updateNetworkProxy: "alpha:network-proxy:update",
  externalMcpGet: "alpha:external-mcp:get",
  externalMcpConfiguration: "alpha:external-mcp:configuration",
  externalMcpSave: "alpha:external-mcp:save",
  externalMcpSetEnabled: "alpha:external-mcp:set-enabled",
  externalMcpReconnect: "alpha:external-mcp:reconnect",
  externalMcpRemove: "alpha:external-mcp:remove",
  externalMcpTools: "alpha:external-mcp:tools",
  agentChatSession: "alpha:agent-chat:session",
  agentChatThreads: "alpha:agent-chat:threads",
  agentChatHistory: "alpha:agent-chat:history",
  agentChatUpdateThread: "alpha:agent-chat:update-thread",
  agentChatDeleteThread: "alpha:agent-chat:delete-thread",
  agentChatClearThreads: "alpha:agent-chat:clear-threads",
  agentChatEvents: "alpha:agent-chat:events",
  agentChatMemory: "alpha:agent-chat:memory",
  agentChatMemoryAutoUpdate: "alpha:agent-chat:memory-auto-update",
  agentChatMemorySave: "alpha:agent-chat:memory-save",
  agentChatMemoryDelete: "alpha:agent-chat:memory-delete",
  agentChatMemoryClear: "alpha:agent-chat:memory-clear",
  agentChatMemoryInstruct: "alpha:agent-chat:memory-instruct",
  agentChatSend: "alpha:agent-chat:send",
  agentChatReadRequest: "alpha:agent-chat:read-request",
  agentChatReadRun: "alpha:agent-chat:read-run",
  agentChatCancel: "alpha:agent-chat:cancel",
  agentChatApprovals: "alpha:agent-chat:approvals",
  agentChatInspectApproval: "alpha:agent-chat:inspect-approval",
  agentChatDecide: "alpha:agent-chat:decide",
  chatSummaryList: "alpha:chat-summary:list",
  chatSummaryStart: "alpha:chat-summary:start",
  chatSummaryRemove: "alpha:chat-summary:remove",
  chatSummaryPreferences: "alpha:chat-summary:preferences",
  chatSummarySetPreferences: "alpha:chat-summary:set-preferences",
  updateHttpApi: "alpha:system:http-api-update",
  getBackendStatus: "alpha:system:get-backend-status",
  retryBackend: "alpha:system:retry-backend",
  getUpdateStatus: "alpha:system:get-update-status",
  refreshUpdateStatus: "alpha:system:refresh-update-status",
  downloadUpdate: "alpha:system:download-update",
  installUpdate: "alpha:system:install-update",
  discoverAccounts: "alpha:accounts:discover",
  detectAccountDataSources: "alpha:accounts:detect-data-sources",
  chooseAccountDataDirectory: "alpha:accounts:choose-data-directory",
  importDatabaseKey: "alpha:accounts:import-database-key",
  readAccountAvatar: "alpha:accounts:read-avatar",
  acquireDatabaseKey: "alpha:accounts:acquire-database-key",
  watchDatabaseKeyAcquisition: "alpha:accounts:watch-database-key-acquisition",
  listAccounts: "alpha:accounts:list",
  selectAccount: "alpha:accounts:select",
  removeAccount: "alpha:accounts:remove",
  listConversations: "alpha:conversations:list",
  listConversationPage: "alpha:conversations:page",
  getDataRevision: "alpha:conversations:revision",
  getMessageSource: "alpha:messages:source",
  watchLiveData: "alpha:conversations:watch-live",
  unwatchLiveData: "alpha:conversations:unwatch-live",
  liveDataChanged: "alpha:data:changed",
  listMessages: "alpha:messages:list",
  pageMessages: "alpha:messages:page",
  resolveMessageMedia: "alpha:messages:resolve-media",
  startVoiceHistory: "alpha:voice:history-start",
  getVoiceHistory: "alpha:voice:history-status",
  latestVoiceHistory: "alpha:voice:history-latest",
  cancelVoiceHistory: "alpha:voice:history-cancel",
  searchMessages: "alpha:messages:search",
  searchMessagePage: "alpha:messages:search-page",
  searchConversations: "alpha:messages:search-conversations",
  searchMessageContext: "alpha:messages:context",
  applyMessageMutation: "alpha:messages:mutate",
  getPendingMessageMutation: "alpha:messages:mutation-pending",
  acknowledgeMessageMutation: "alpha:messages:mutation-acknowledge",
  getPendingResourceMaintenance: "alpha:messages:resource-maintenance-pending",
  acknowledgeResourceMaintenance: "alpha:messages:resource-maintenance-acknowledge",
  inspectResourceMaintenance: "alpha:messages:resource-maintenance-inspect",
  reconcileResourceMaintenance: "alpha:messages:resource-maintenance-reconcile",
  discoverPendingResourceMaintenance: "alpha:messages:resource-maintenance-discover",
  listContacts: "alpha:contacts:list",
  contactDirectory: "alpha:contacts:directory",
  listMoments: "alpha:moments:list",
  listMomentAuthors: "alpha:moments:authors",
  momentDayCounts: "alpha:moments:day-counts",
  getMomentsAntiDeleteStatus: "alpha:moments:anti-delete-status",
  manageMessageAntiRecall: "alpha:messages:anti-recall-manage",
  listMessageRecallRecords: "alpha:messages:recall-records-list",
  messageAntiRecallStatuses: "alpha:messages:anti-recall-statuses",
  setMomentsAntiDeleteEnabled: "alpha:moments:anti-delete-set-enabled",
  getImageMediaStatus: "alpha:media:image-status",
  readImageMedia: "alpha:media:read-image",
  readPlaybackMedia: "alpha:media:read-playback",
  saveAttachment: "alpha:media:save-attachment",
  saveImageMedia: "alpha:media:save-image",
  showImageViewer: "alpha:media:show-image-viewer",
  imageViewerLocate: "alpha:media:image-viewer-locate",
  imageViewerStep: "alpha:media:image-viewer-step",
  imageViewerFetch: "alpha:media:image-viewer-fetch",
  startCdnMediaFetch: "alpha:media:cdn-fetch-start",
  getCdnMediaFetch: "alpha:media:cdn-fetch-get",
  cancelCdnMediaFetch: "alpha:media:cdn-fetch-cancel",
  showMomentViewer: "alpha:media:show-moment-viewer",
  configureImageKeyAuto: "alpha:media:image-key-auto",
  configureImageKeyMemory: "alpha:media:image-key-memory",
  configureImageKeyManual: "alpha:media:image-key-manual",
  clearImageKey: "alpha:media:image-key-clear",
  startMaterialCapture: "alpha:capture:start",
  watchMaterialCapture: "alpha:capture:watch",
  cancelMaterialCapture: "alpha:capture:cancel",
  materialCaptureComponentDownload: "alpha:capture:component-download",
  materialTextBundle: "alpha:capture:text-bundle",
  listFavorites: "alpha:favorites:list",
  favoritePage: "alpha:favorites:page",
  resolveFavoriteMedia: "alpha:favorites:media",
  favoriteMediaSlots: "alpha:favorites:media-slots",
  contactProfile: "alpha:contacts:profile",
  chooseContactExportPath: "alpha:contacts:export-path",
  exportContacts: "alpha:contacts:export",
  chooseGroupMemberExportPath: "alpha:group-members:export-path",
  exportGroupMembers: "alpha:group-members:export",
  listGeneralRecords: "alpha:general-records:list",
  analyzeConversation: "alpha:conversations:analyze",
  analyzeAnnual: "alpha:analysis:annual",
  startAggregateAnalysis: "alpha:analysis:aggregate-start",
  watchAggregateAnalysis: "alpha:analysis:aggregate-watch",
  cancelAggregateAnalysis: "alpha:analysis:aggregate-cancel",
  loadSavedAggregate: "alpha:analysis:aggregate-saved",
  getAnalyticsPreferences: "alpha:analysis:preferences-get",
  setAnalyticsExcluded: "alpha:analysis:preferences-set-excluded",
  captureReportRegion: "alpha:analysis:report-capture",
  saveReportImages: "alpha:analysis:report-save",
  saveReportImage: "alpha:analysis:report-save-one",
  saveReportText: "alpha:analysis:report-save-text",
  listGroupMembers: "alpha:group-members:list",
  listGroupPinnedMessages: "alpha:group-pins:list",
  locateMessageByServerId: "alpha:messages:locate-by-server-id",
  conversationDayCounts: "alpha:conversations:day-counts",
  browseConversationMessages: "alpha:messages:browse-type",
  browseAccountMedia: "alpha:messages:browse-account-media",
  openAttachment: "alpha:media:open-attachment",
  exportRelationshipReport: "alpha:conversations:export-analysis",
  exportConversation: "alpha:conversations:export",
  chooseChatExportPath: "alpha:conversations:export-path",
  chooseChatExportDirectory: "alpha:conversations:export-directory",
  revealChatExport: "alpha:conversations:export-reveal",
  readChatExportManifest: "alpha:conversations:export-manifest",
  chatExportStats: "alpha:conversations:export-stats",
  chatExportCapabilities: "alpha:chat-export:capabilities",
  chatExportStart: "alpha:chat-export:start",
  chatExportList: "alpha:chat-export:list",
  chatExportWatch: "alpha:chat-export:watch",
  chatExportUnwatch: "alpha:chat-export:unwatch",
  chatExportCancel: "alpha:chat-export:cancel",
  chatExportSnapshot: "alpha:chat-export:snapshot",
  momentExportStart: "alpha:moment-export:start",
  recordExportStart: "alpha:record-export:start",
  startMaterialOfficialExport: "alpha:jobs:start-material-official-export",
  beginMaterialOfficialExport: "alpha:jobs:begin-material-official-export",
  getMaterialOfficialExport: "alpha:jobs:get-material-official-export",
  cancelMaterialOfficialExport: "alpha:jobs:cancel-material-official-export",
  listMaterialOfficialExports: "alpha:jobs:list-material-official-exports",
  previewMaterialOfficialArticles: "alpha:jobs:preview-material-official-articles",
  chooseOfficialExportDirectory: "alpha:jobs:choose-official-export-directory",
  saveOfficialExportDirectory: "alpha:jobs:save-official-export-directory",
  listOfficialScheduleRecords: "alpha:jobs:list-official-schedule-records",
  getOfficialScheduleRecord: "alpha:jobs:get-official-schedule-record",
  cancelOfficialScheduleRecord: "alpha:jobs:cancel-official-schedule-record",
  archiveOfficialScheduleRecord: "alpha:jobs:archive-official-schedule-record",
  listOfficialSchedulePlans: "alpha:jobs:list-official-schedule-plans",
  listChatExportSchedules: "alpha:jobs:list-chat-export-schedules",
  listChatExportRuns: "alpha:jobs:list-chat-export-runs",
  getChatExportRun: "alpha:jobs:get-chat-export-run",
  listChatExportAttempts: "alpha:jobs:list-chat-export-attempts",
  getChatExportAttempt: "alpha:jobs:get-chat-export-attempt",
  retryChatExportAttempt: "alpha:jobs:retry-chat-export-attempt",
  revealChatExportRun: "alpha:jobs:reveal-chat-export-run",
  revealMaterialOfficialExport: "alpha:jobs:reveal-material-official-export",
  getChatExportSchedule: "alpha:jobs:get-chat-export-schedule",
  saveChatExportSchedule: "alpha:jobs:save-chat-export-schedule",
  deleteChatExportSchedule: "alpha:jobs:delete-chat-export-schedule",
  runChatExportScheduleNow: "alpha:jobs:run-chat-export-schedule-now",
  getOfficialSchedulePlan: "alpha:jobs:get-official-schedule-plan",
  saveOfficialSchedulePlan: "alpha:jobs:save-official-schedule-plan",
  getPendingOfficialPlanCreate: "alpha:jobs:get-pending-official-plan-create",
  resolvePendingOfficialPlanCreate: "alpha:jobs:resolve-pending-official-plan-create",
  abandonPendingOfficialPlanCreate: "alpha:jobs:abandon-pending-official-plan-create",
  deleteOfficialSchedulePlan: "alpha:jobs:delete-official-schedule-plan",
  runOfficialSchedulePlanNow: "alpha:jobs:run-official-schedule-plan-now",
  getJob: "alpha:jobs:get",
  watchJob: "alpha:jobs:watch",
  cancelJob: "alpha:jobs:cancel",
  startMaterialTextSend: "alpha:messages:start-material-text",
  listPendingMaterialText: "alpha:messages:list-pending-material-text",
  recoverMaterialText: "alpha:messages:recover-material-text",
  dismissPendingMaterialText: "alpha:messages:dismiss-pending-material-text",
  watchMaterialTextSend: "alpha:messages:watch-material-text",
  cancelMaterialTextSend: "alpha:messages:cancel-material-text",
  closeMaterialTextSession: "alpha:messages:close-material-text-session",
  materialTextChanged: "alpha:messages:material-text-changed",
  getTelemetryStatus: "alpha:telemetry:status",
  setTelemetryConsent: "alpha:telemetry:set-consent",
  flushTelemetry: "alpha:telemetry:flush",
  getNotificationStatus: "alpha:notifications:status",
  setNotificationEnabled: "alpha:notifications:set-enabled",
  getMessageNotificationSettings: "alpha:notifications:message-settings",
  updateMessageNotificationSettings: "alpha:notifications:update-message-settings",
  previewNotification: "alpha:notifications:preview",
  reportNotificationView: "alpha:notifications:view",
  openConversationRequested: "alpha:notifications:open-conversation",
  getAppLogStatus: "alpha:log:status",
  setAppLogEnabled: "alpha:log:set-enabled",
  revealAppLog: "alpha:log:reveal",
  clearAppLog: "alpha:log:clear",
  storageUsage: "alpha:storage:usage",
  cacheDirectory: "alpha:storage:cache-directory",
  chooseCacheDirectory: "alpha:storage:choose-cache-directory",
  cancelCacheDirectoryChange: "alpha:storage:cancel-cache-directory-change",
  cancelStorageUsage: "alpha:storage:cancel-usage",
  clearStorage: "alpha:storage:clear",
  getWindowCloseBehavior: "alpha:window:close-behavior",
  setWindowCloseBehavior: "alpha:window:set-close-behavior",
  getLaunchAtStartup: "alpha:startup:launch-status",
  setLaunchAtStartup: "alpha:startup:set-launch",
  setMainPageActive: "alpha:window:main-page-active",
  rendererReady: "alpha:window:renderer-ready",
  reportAppearance: "alpha:window:report-appearance",
  respondWindowClose: "alpha:window:respond-close",
  windowCloseRequested: "alpha:window:close-requested",
  // Literal copies of WINDOW_CHROME_CHANNELS: this preload must not import that module at
  // runtime, or the viewer preload shares it as a chunk a sandboxed preload cannot load.
  windowChromeControl: "alpha:window-chrome:control",
  windowChromeState: "alpha:window-chrome:state",
  windowChromeChanged: "alpha:window-chrome:changed",
  getApplicationLockStatus: "alpha:security:application-lock-status",
  provisionApplicationLock: "alpha:security:application-lock-provision",
  unlockApplication: "alpha:security:application-unlock",
  lockApplication: "alpha:security:application-lock",
  configureApplicationLock: "alpha:security:application-lock-configure",
  resetApplicationLock: "alpha:security:application-lock-reset",
  getCapabilities: "alpha:license:capabilities",
  activateLicense: "alpha:license:activate",
  refreshLicense: "alpha:license:refresh",
  deactivateLicense: "alpha:license:deactivate",
  inspectVoiceModel: "alpha:voice:inspect-model",
  chooseVoiceModelDirectory: "alpha:voice:choose-model-directory",
  chooseVoiceGpuRuntimeDirectory: "alpha:voice:choose-gpu-runtime-directory",
  transcriptionRuntimeStatus: "alpha:voice:runtime-status",
  installTranscriptionRuntime: "alpha:voice:runtime-install",
  cancelTranscriptionRuntime: "alpha:voice:runtime-cancel",
  voiceModelDownloadStatus: "alpha:voice:model-download-status",
  downloadVoiceModel: "alpha:voice:model-download",
  cancelVoiceModelDownload: "alpha:voice:model-download-cancel",
  transcribeVoice: "alpha:voice:transcribe",
  transcribeVoiceBatch: "alpha:voice:transcribe-batch",
  startPersonaProfile: "alpha:persona:profile-start",
  watchPersonaProfile: "alpha:persona:profile-watch",
  cancelPersonaProfile: "alpha:persona:profile-cancel",
  createPersonaDraft: "alpha:persona:draft-create",
  getPersonaDraftRecovery: "alpha:persona:draft-recovery",
  resolvePersonaDraft: "alpha:persona:draft-resolve",
  recoverPersonaDraft: "alpha:persona:draft-recover",
  getPersonaDraftResult: "alpha:persona:draft-result",
  approvePersonaDraft: "alpha:persona:draft-approve",
  rejectPersonaDraft: "alpha:persona:draft-reject",
  archivePersonaDraft: "alpha:persona:draft-archive",
  listAgentMemoryScopes: "alpha:agent-memory:scopes-list",
  clearAgentMemoryScope: "alpha:agent-memory:scope-clear",
  deleteAgentMemoryScope: "alpha:agent-memory:scope-delete"
};
const WINDOW_PLATFORM = typeof process === "object" && (process.platform === "darwin" || process.platform === "linux") ? process.platform : "win32";
const bridge = Object.freeze({
  chatExport: Object.freeze({
    capabilities: () => electron.ipcRenderer.invoke(IPC_CHANNELS.chatExportCapabilities),
    start: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.chatExportStart, request),
    list: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.chatExportList, accountId),
    watch: (jobId, listener) => {
      const handler = (_event, snapshot) => {
        if (snapshot?.jobId === jobId) listener(snapshot);
      };
      electron.ipcRenderer.on(IPC_CHANNELS.chatExportSnapshot, handler);
      void electron.ipcRenderer.invoke(IPC_CHANNELS.chatExportWatch, jobId).catch(() => void 0);
      let watching = true;
      return () => {
        if (!watching) return;
        watching = false;
        electron.ipcRenderer.removeListener(IPC_CHANNELS.chatExportSnapshot, handler);
        void electron.ipcRenderer.invoke(IPC_CHANNELS.chatExportUnwatch, jobId).catch(() => void 0);
      };
    },
    cancel: (jobId) => electron.ipcRenderer.invoke(IPC_CHANNELS.chatExportCancel, jobId),
    startMoments: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.momentExportStart, request),
    startRecords: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.recordExportStart, request)
  }),
  windowChrome: Object.freeze({
    platform: WINDOW_PLATFORM,
    control: (action, target) => electron.ipcRenderer.invoke(IPC_CHANNELS.windowChromeControl, action, target),
    state: (target) => electron.ipcRenderer.invoke(IPC_CHANNELS.windowChromeState, target),
    onChange: (listener) => {
      const handler = (_event, change) => listener(change);
      electron.ipcRenderer.on(IPC_CHANNELS.windowChromeChanged, handler);
      return () => {
        electron.ipcRenderer.removeListener(IPC_CHANNELS.windowChromeChanged, handler);
      };
    }
  }),
  messageRecall: Object.freeze({
    manage: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.manageMessageAntiRecall, request),
    list: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.listMessageRecallRecords, request),
    statuses: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.messageAntiRecallStatuses, request)
  }),
  agentChat: Object.freeze({
    session: () => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatSession),
    threads: (contextId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatThreads, contextId),
    history: (contextId, threadId, before) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatHistory, contextId, threadId, before),
    updateThread: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatUpdateThread, input),
    deleteThread: (contextId, threadId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatDeleteThread, contextId, threadId),
    clearThreads: (contextId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatClearThreads, contextId),
    events: (runId, after) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatEvents, runId, after),
    memory: (contextId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatMemory, contextId),
    setMemoryAutoUpdate: (contextId, enabled) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatMemoryAutoUpdate, contextId, enabled),
    saveMemory: (draft) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatMemorySave, draft),
    deleteMemory: (contextId, id) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatMemoryDelete, contextId, id),
    clearMemory: (contextId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatMemoryClear, contextId),
    instructMemory: (contextId, instruction) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatMemoryInstruct, contextId, instruction),
    send: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatSend, input),
    readRequest: (requestId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatReadRequest, requestId),
    readRun: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatReadRun, runId),
    cancel: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatCancel, runId),
    approvals: (runId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatApprovals, runId),
    inspectApproval: (approvalId) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatInspectApproval, approvalId),
    decide: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.agentChatDecide, input)
  }),
  chatSummary: Object.freeze({
    list: (accountId, conversationId) => electron.ipcRenderer.invoke(IPC_CHANNELS.chatSummaryList, accountId, conversationId),
    start: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.chatSummaryStart, input),
    remove: (accountId, conversationId, id) => electron.ipcRenderer.invoke(IPC_CHANNELS.chatSummaryRemove, accountId, conversationId, id),
    preferences: () => electron.ipcRenderer.invoke(IPC_CHANNELS.chatSummaryPreferences),
    setPreferences: (value) => electron.ipcRenderer.invoke(IPC_CHANNELS.chatSummarySetPreferences, value)
  }),
  agentSettings: Object.freeze({
    get: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getAgentSettings),
    update: (config) => electron.ipcRenderer.invoke(IPC_CHANNELS.updateAgentSettings, config),
    listModels: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.listAgentModels, request),
    saveProvider: (draft) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveAgentProvider, draft),
    removeProvider: (id) => electron.ipcRenderer.invoke(IPC_CHANNELS.removeAgentProvider, id),
    useModel: (selection) => electron.ipcRenderer.invoke(IPC_CHANNELS.useAgentModel, selection),
    setToolApproval: (update) => electron.ipcRenderer.invoke(IPC_CHANNELS.setAgentToolApproval, update),
    saveModelSettings: (update) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveAgentModelSettings, update),
    signInChatGpt: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.signInAgentChatGpt, request),
    cancelChatGptSignIn: () => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelAgentChatGptSignIn),
    signOutChatGpt: (providerId) => electron.ipcRenderer.invoke(IPC_CHANNELS.signOutAgentChatGpt, providerId)
  }),
  networkProxy: Object.freeze({
    get: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getNetworkProxy),
    update: (settings) => electron.ipcRenderer.invoke(IPC_CHANNELS.updateNetworkProxy, settings)
  }),
  externalMcp: Object.freeze({
    get: () => electron.ipcRenderer.invoke(IPC_CHANNELS.externalMcpGet),
    configuration: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.externalMcpConfiguration, input),
    save: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.externalMcpSave, input),
    setEnabled: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.externalMcpSetEnabled, input),
    reconnect: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.externalMcpReconnect, input),
    remove: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.externalMcpRemove, input),
    tools: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.externalMcpTools, input)
  }),
  system: Object.freeze({
    getHttpApiStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getHttpApiStatus),
    getHttpApiToken: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getHttpApiToken),
    updateHttpApi: (config) => electron.ipcRenderer.invoke(IPC_CHANNELS.updateHttpApi, config),
    getHttpApiPushFilter: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.getHttpApiPushFilter, accountId),
    updateHttpApiPushFilter: (accountId, update) => electron.ipcRenderer.invoke(IPC_CHANNELS.updateHttpApiPushFilter, accountId, update),
    getBackendStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getBackendStatus),
    retryBackend: () => electron.ipcRenderer.invoke(IPC_CHANNELS.retryBackend),
    getUpdateStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getUpdateStatus),
    refreshUpdateStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.refreshUpdateStatus),
    downloadUpdate: () => electron.ipcRenderer.invoke(IPC_CHANNELS.downloadUpdate),
    installUpdate: () => electron.ipcRenderer.invoke(IPC_CHANNELS.installUpdate),
    getTelemetryStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getTelemetryStatus),
    setTelemetryConsent: (decision, categories, consentVersion) => electron.ipcRenderer.invoke(IPC_CHANNELS.setTelemetryConsent, decision, categories, consentVersion),
    flushTelemetry: () => electron.ipcRenderer.invoke(IPC_CHANNELS.flushTelemetry),
    getNotificationStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getNotificationStatus),
    setNotificationEnabled: (enabled) => electron.ipcRenderer.invoke(IPC_CHANNELS.setNotificationEnabled, enabled),
    getMessageNotificationSettings: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.getMessageNotificationSettings, accountId),
    updateMessageNotificationSettings: (accountId, update) => electron.ipcRenderer.invoke(IPC_CHANNELS.updateMessageNotificationSettings, accountId, update),
    previewNotification: () => electron.ipcRenderer.invoke(IPC_CHANNELS.previewNotification),
    reportNotificationView: (view) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.reportNotificationView,
      view ? { accountId: String(view.accountId), conversationId: String(view.conversationId) } : null
    ),
    onOpenConversation: (callback) => {
      const listener = (_event, payload) => callback({ accountId: String(payload?.accountId ?? ""), conversationId: String(payload?.conversationId ?? "") });
      electron.ipcRenderer.on(IPC_CHANNELS.openConversationRequested, listener);
      return () => {
        electron.ipcRenderer.removeListener(IPC_CHANNELS.openConversationRequested, listener);
      };
    },
    getAppLogStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getAppLogStatus),
    setAppLogEnabled: (enabled) => electron.ipcRenderer.invoke(IPC_CHANNELS.setAppLogEnabled, enabled),
    revealAppLog: () => electron.ipcRenderer.invoke(IPC_CHANNELS.revealAppLog),
    clearAppLog: () => electron.ipcRenderer.invoke(IPC_CHANNELS.clearAppLog),
    getWindowCloseBehavior: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getWindowCloseBehavior),
    setWindowCloseBehavior: (behavior) => electron.ipcRenderer.invoke(IPC_CHANNELS.setWindowCloseBehavior, behavior),
    getLaunchAtStartup: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getLaunchAtStartup),
    setLaunchAtStartup: (enabled) => electron.ipcRenderer.invoke(IPC_CHANNELS.setLaunchAtStartup, enabled),
    setMainPageActive: (active) => electron.ipcRenderer.invoke(IPC_CHANNELS.setMainPageActive, active),
    rendererReady: () => electron.ipcRenderer.invoke(IPC_CHANNELS.rendererReady),
    reportAppearance: (theme) => electron.ipcRenderer.invoke(IPC_CHANNELS.reportAppearance, theme),
    respondWindowClose: (action) => electron.ipcRenderer.invoke(IPC_CHANNELS.respondWindowClose, action),
    onWindowCloseRequested: (callback) => {
      const listener = (_event, payload) => callback({ canMinimizeToTray: payload?.canMinimizeToTray === true });
      electron.ipcRenderer.on(IPC_CHANNELS.windowCloseRequested, listener);
      return () => {
        electron.ipcRenderer.removeListener(IPC_CHANNELS.windowCloseRequested, listener);
      };
    }
  }),
  license: Object.freeze({
    capabilities: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getCapabilities),
    activate: (activationCode) => electron.ipcRenderer.invoke(IPC_CHANNELS.activateLicense, activationCode),
    refresh: (forceOnline) => electron.ipcRenderer.invoke(IPC_CHANNELS.refreshLicense, forceOnline),
    deactivate: () => electron.ipcRenderer.invoke(IPC_CHANNELS.deactivateLicense)
  }),
  security: Object.freeze({
    getApplicationLockStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getApplicationLockStatus),
    provisionApplicationLock: () => electron.ipcRenderer.invoke(IPC_CHANNELS.provisionApplicationLock),
    unlockApplication: (password) => electron.ipcRenderer.invoke(IPC_CHANNELS.unlockApplication, password),
    lockApplication: () => electron.ipcRenderer.invoke(IPC_CHANNELS.lockApplication),
    configureApplicationLock: (change) => electron.ipcRenderer.invoke(IPC_CHANNELS.configureApplicationLock, change),
    resetApplicationLock: () => electron.ipcRenderer.invoke(IPC_CHANNELS.resetApplicationLock)
  }),
  accounts: Object.freeze({
    readDataKey: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.readAccountDataKey, request),
    detectDataSources: () => electron.ipcRenderer.invoke(IPC_CHANNELS.detectAccountDataSources),
    chooseDatabaseDirectory: () => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseAccountDataDirectory),
    discover: (sourceLocationId) => electron.ipcRenderer.invoke(IPC_CHANNELS.discoverAccounts, sourceLocationId),
    importDatabaseKey: (accountId, databaseKeyHex) => electron.ipcRenderer.invoke(IPC_CHANNELS.importDatabaseKey, accountId, databaseKeyHex),
    acquireDatabaseKey: (accountId, processId, mode, timeoutSeconds) => electron.ipcRenderer.invoke(IPC_CHANNELS.acquireDatabaseKey, accountId, processId, mode, timeoutSeconds),
    watchDatabaseKeyAcquisition: (accountId, afterEventSeq) => electron.ipcRenderer.invoke(IPC_CHANNELS.watchDatabaseKeyAcquisition, accountId, afterEventSeq),
    readAccountAvatar: (url) => electron.ipcRenderer.invoke(IPC_CHANNELS.readAccountAvatar, url),
    list: () => electron.ipcRenderer.invoke(IPC_CHANNELS.listAccounts),
    select: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.selectAccount, accountId),
    remove: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.removeAccount, accountId)
  }),
  conversations: Object.freeze({
    exportAnalysis: (accountId, conversationId, format) => electron.ipcRenderer.invoke(IPC_CHANNELS.exportRelationshipReport, accountId, conversationId, format),
    page: (accountId, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.listConversationPage, accountId, options),
    revision: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.getDataRevision, accountId),
    watchLive: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.watchLiveData, accountId),
    unwatchLive: () => electron.ipcRenderer.invoke(IPC_CHANNELS.unwatchLiveData),
    onLiveChange: (callback) => {
      const listener = (_event, payload) => callback({ accountId: String(payload?.accountId ?? ""), live: payload?.live === true });
      electron.ipcRenderer.on(IPC_CHANNELS.liveDataChanged, listener);
      return () => {
        electron.ipcRenderer.removeListener(IPC_CHANNELS.liveDataChanged, listener);
      };
    },
    chooseExportDirectory: () => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseChatExportDirectory),
    chooseExportPath: (format, conversationName) => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseChatExportPath, format, conversationName),
    revealExport: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS.revealChatExport, path),
    readExportManifest: (path) => electron.ipcRenderer.invoke(IPC_CHANNELS.readChatExportManifest, path),
    exportStats: (accountId, conversationIds, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.chatExportStats, accountId, conversationIds, options),
    dayCounts: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.conversationDayCounts, ...args),
    list: (accountId, pageSize) => electron.ipcRenderer.invoke(IPC_CHANNELS.listConversations, accountId, pageSize),
    analyze: (accountId, conversationId, maxMessages, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.analyzeConversation, accountId, conversationId, maxMessages, options),
    export: (accountId, conversationId, format, destinationPath, includeMedia = false, range) => electron.ipcRenderer.invoke(IPC_CHANNELS.exportConversation, accountId, conversationId, format, destinationPath, includeMedia, range)
  }),
  jobs: Object.freeze({
    startMaterialOfficialExport: (spec) => electron.ipcRenderer.invoke(IPC_CHANNELS.startMaterialOfficialExport, spec),
    beginMaterialOfficialExport: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.beginMaterialOfficialExport, request),
    getMaterialOfficialExport: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.getMaterialOfficialExport, request),
    cancelMaterialOfficialExport: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelMaterialOfficialExport, request),
    listMaterialOfficialExports: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.listMaterialOfficialExports, request),
    previewMaterialOfficialArticles: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.previewMaterialOfficialArticles, request),
    chooseOfficialExportDirectory: () => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseOfficialExportDirectory),
    saveOfficialExportDirectory: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveOfficialExportDirectory, request),
    listOfficialScheduleRecords: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.listOfficialScheduleRecords, request),
    getOfficialScheduleRecord: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.getOfficialScheduleRecord, request),
    cancelOfficialScheduleRecord: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelOfficialScheduleRecord, request),
    archiveOfficialScheduleRecord: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.archiveOfficialScheduleRecord, request),
    listChatExportRuns: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.listChatExportRuns, request),
    getChatExportRun: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.getChatExportRun, request),
    listChatExportAttempts: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.listChatExportAttempts, request),
    getChatExportAttempt: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.getChatExportAttempt, request),
    retryChatExportAttempt: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.retryChatExportAttempt, request),
    revealChatExportRun: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.revealChatExportRun, request),
    revealMaterialOfficialExport: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.revealMaterialOfficialExport, request),
    listChatExportSchedules: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.listChatExportSchedules, request),
    getChatExportSchedule: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.getChatExportSchedule, request),
    saveChatExportSchedule: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveChatExportSchedule, request),
    deleteChatExportSchedule: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.deleteChatExportSchedule, request),
    runChatExportScheduleNow: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.runChatExportScheduleNow, request),
    listOfficialSchedulePlans: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.listOfficialSchedulePlans, request),
    getOfficialSchedulePlan: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.getOfficialSchedulePlan, request),
    saveOfficialSchedulePlan: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveOfficialSchedulePlan, request),
    getPendingOfficialPlanCreate: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.getPendingOfficialPlanCreate, request),
    resolvePendingOfficialPlanCreate: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.resolvePendingOfficialPlanCreate, request),
    abandonPendingOfficialPlanCreate: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.abandonPendingOfficialPlanCreate, request),
    deleteOfficialSchedulePlan: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.deleteOfficialSchedulePlan, request),
    runOfficialSchedulePlanNow: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.runOfficialSchedulePlanNow, request),
    getJob: (jobId) => electron.ipcRenderer.invoke(IPC_CHANNELS.getJob, jobId),
    watchJob: (jobId, afterEventSeq) => electron.ipcRenderer.invoke(IPC_CHANNELS.watchJob, jobId, afterEventSeq),
    cancelJob: (jobId, reasonCode) => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelJob, jobId, reasonCode)
  }),
  messages: Object.freeze({
    source: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.getMessageSource, ...args),
    resolveMedia: (accountId, token, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.resolveMessageMedia, accountId, token, options),
    page: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.pageMessages, ...args),
    list: (accountId, conversationId, pageSize, ascending) => electron.ipcRenderer.invoke(IPC_CHANNELS.listMessages, accountId, conversationId, pageSize, ascending),
    search: (accountId, query, conversationId, pageSize) => electron.ipcRenderer.invoke(IPC_CHANNELS.searchMessages, accountId, query, conversationId, pageSize),
    searchConversations: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.searchConversations, ...args),
    context: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.searchMessageContext, ...args),
    locateByServerId: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.locateMessageByServerId, ...args),
    browseByType: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.browseConversationMessages, ...args),
    browseAccountMedia: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.browseAccountMedia, ...args),
    // Independent backend: exports verified media metadata only. Empty
    // conversationId scopes the account; this never reads, downloads, or
    // marks media files as ready.
    exportMediaMetadata: (accountId, conversationId, format, destinationPath) => electron.ipcRenderer.invoke(IPC_CHANNELS.exportConversation, accountId, conversationId ?? "", format, destinationPath, false),
    searchPage: (accountId, query, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.searchMessagePage, accountId, query, options),
    mutate: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.applyMessageMutation, request),
    pendingMutation: () => readPendingMetadata(() => electron.ipcRenderer.invoke(IPC_CHANNELS.getPendingMessageMutation)),
    acknowledgeMutation: (operationId) => electron.ipcRenderer.invoke(IPC_CHANNELS.acknowledgeMessageMutation, operationId),
    pendingResourceMaintenance: () => readPendingMetadata(() => electron.ipcRenderer.invoke(IPC_CHANNELS.getPendingResourceMaintenance)),
    acknowledgeResourceMaintenance: (operationId) => electron.ipcRenderer.invoke(IPC_CHANNELS.acknowledgeResourceMaintenance, operationId),
    inspectResourceMaintenance: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.inspectResourceMaintenance, request),
    reconcileResourceMaintenance: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.reconcileResourceMaintenance, request),
    discoverPendingResourceMaintenance: (accountId, limit) => electron.ipcRenderer.invoke(IPC_CHANNELS.discoverPendingResourceMaintenance, accountId, limit),
    startMaterialText: (request) => electron.ipcRenderer.invoke(IPC_CHANNELS.startMaterialTextSend, request),
    listPendingMaterialText: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.listPendingMaterialText, accountId),
    recoverMaterialText: (accountId, runId) => electron.ipcRenderer.invoke(IPC_CHANNELS.recoverMaterialText, accountId, runId),
    dismissPendingMaterialText: (accountId, runId) => electron.ipcRenderer.invoke(IPC_CHANNELS.dismissPendingMaterialText, accountId, runId),
    watchMaterialText: (sendId, afterEventSeq) => electron.ipcRenderer.invoke(IPC_CHANNELS.watchMaterialTextSend, sendId, afterEventSeq),
    cancelMaterialText: (sendId) => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelMaterialTextSend, sendId),
    closeMaterialTextSession: (sessionId) => electron.ipcRenderer.invoke(IPC_CHANNELS.closeMaterialTextSession, sessionId),
    onMaterialTextChanged: (callback) => {
      const listener = (_event, payload) => callback(String(payload?.accountId ?? ""));
      electron.ipcRenderer.on(IPC_CHANNELS.materialTextChanged, listener);
      return () => {
        electron.ipcRenderer.removeListener(IPC_CHANNELS.materialTextChanged, listener);
      };
    }
  }),
  data: Object.freeze({
    contactDirectory: (accountId, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.contactDirectory, accountId, options),
    contacts: (accountId, query, pageSize, offset) => electron.ipcRenderer.invoke(IPC_CHANNELS.listContacts, accountId, query, pageSize, offset),
    moments: (accountId, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.listMoments, accountId, options),
    momentAuthors: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.listMomentAuthors, accountId),
    momentDayCounts: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.momentDayCounts, ...args),
    getMomentsAntiDeleteStatus: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.getMomentsAntiDeleteStatus, accountId),
    setMomentsAntiDeleteEnabled: (accountId, enabled) => electron.ipcRenderer.invoke(IPC_CHANNELS.setMomentsAntiDeleteEnabled, accountId, enabled),
    favorites: (accountId, type, pageSize, offset) => electron.ipcRenderer.invoke(IPC_CHANNELS.listFavorites, accountId, type, pageSize, offset),
    favoritePage: (accountId, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.favoritePage, accountId, options),
    resolveFavoriteMedia: (accountId, token) => electron.ipcRenderer.invoke(IPC_CHANNELS.resolveFavoriteMedia, accountId, token),
    favoriteMediaSlots: (accountId, favoriteId) => electron.ipcRenderer.invoke(IPC_CHANNELS.favoriteMediaSlots, accountId, favoriteId),
    contactProfile: (accountId, username) => electron.ipcRenderer.invoke(IPC_CHANNELS.contactProfile, accountId, username),
    chooseContactExportPath: (format, defaultName) => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseContactExportPath, format, defaultName),
    exportContacts: (accountId, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.exportContacts, accountId, options),
    generalRecords: ((accountId, category) => electron.ipcRenderer.invoke(IPC_CHANNELS.listGeneralRecords, accountId, category)),
    groupMembers: (accountId, chatroomId) => electron.ipcRenderer.invoke(IPC_CHANNELS.listGroupMembers, accountId, chatroomId),
    chooseGroupMemberExportPath: (format, defaultName) => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseGroupMemberExportPath, format, defaultName),
    exportGroupMembers: (accountId, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.exportGroupMembers, accountId, options),
    groupPinnedMessages: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.listGroupPinnedMessages, ...args)
  }),
  analysis: Object.freeze({
    annual: (accountId, year, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.analyzeAnnual, accountId, year, options),
    aggregate: Object.freeze({
      start: (accountId, request) => electron.ipcRenderer.invoke(IPC_CHANNELS.startAggregateAnalysis, accountId, request),
      watch: (analysisId) => electron.ipcRenderer.invoke(IPC_CHANNELS.watchAggregateAnalysis, analysisId),
      cancel: (analysisId) => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelAggregateAnalysis, analysisId),
      saved: (accountId, request) => electron.ipcRenderer.invoke(IPC_CHANNELS.loadSavedAggregate, accountId, request)
    }),
    preferences: Object.freeze({
      get: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.getAnalyticsPreferences, accountId),
      setExcluded: (accountId, revision, excludedConversationIds) => electron.ipcRenderer.invoke(IPC_CHANNELS.setAnalyticsExcluded, accountId, revision, excludedConversationIds)
    }),
    reportExport: Object.freeze({
      capture: (rect, target) => electron.ipcRenderer.invoke(IPC_CHANNELS.captureReportRegion, rect, target),
      save: (folderName, files) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveReportImages, folderName, files),
      saveOne: (file, target) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveReportImage, file, target),
      saveText: (file, target) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveReportText, file, target)
    })
  }),
  media: Object.freeze({
    readPlayback: (accountId, opaqueId) => electron.ipcRenderer.invoke(IPC_CHANNELS.readPlaybackMedia, accountId, opaqueId),
    saveAttachment: (accountId, opaqueId) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveAttachment, accountId, opaqueId),
    openAttachment: (accountId, opaqueId, mode) => electron.ipcRenderer.invoke(IPC_CHANNELS.openAttachment, accountId, opaqueId, mode),
    readImage: (accountId, opaqueId) => electron.ipcRenderer.invoke(IPC_CHANNELS.readImageMedia, accountId, opaqueId),
    saveImage: (accountId, opaqueId) => electron.ipcRenderer.invoke(IPC_CHANNELS.saveImageMedia, accountId, opaqueId),
    showImageViewer: (accountId, opaqueId, view, live) => electron.ipcRenderer.invoke(IPC_CHANNELS.showImageViewer, accountId, opaqueId, view, live),
    onImageViewerLocate: (callback) => {
      const listener = (_event, request) => {
        if (typeof request?.session === "string") callback({ session: request.session });
      };
      electron.ipcRenderer.on(IPC_CHANNELS.imageViewerLocate, listener);
      return () => {
        electron.ipcRenderer.removeListener(IPC_CHANNELS.imageViewerLocate, listener);
      };
    },
    onImageViewerStep: (callback) => {
      const listener = (_event, request) => {
        if (typeof request?.session === "string" && (request.direction === "previous" || request.direction === "next")) callback({ session: request.session, direction: request.direction });
      };
      electron.ipcRenderer.on(IPC_CHANNELS.imageViewerStep, listener);
      return () => {
        electron.ipcRenderer.removeListener(IPC_CHANNELS.imageViewerStep, listener);
      };
    },
    onImageViewerFetch: (callback) => {
      const listener = (_event, request) => {
        if (typeof request?.session === "string" && (request.kind === "original_image" || request.kind === "live_clip")) callback({ session: request.session, kind: request.kind });
      };
      electron.ipcRenderer.on(IPC_CHANNELS.imageViewerFetch, listener);
      return () => {
        electron.ipcRenderer.removeListener(IPC_CHANNELS.imageViewerFetch, listener);
      };
    },
    startCdnMediaFetch: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.startCdnMediaFetch, ...args),
    getCdnMediaFetch: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.getCdnMediaFetch, ...args),
    cancelCdnMediaFetch: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelCdnMediaFetch, ...args),
    showMomentViewer: (accountId, gallery, view) => electron.ipcRenderer.invoke(IPC_CHANNELS.showMomentViewer, accountId, gallery, view),
    getImageStatus: (accountId, verifySample) => electron.ipcRenderer.invoke(IPC_CHANNELS.getImageMediaStatus, accountId, verifySample),
    configureImageKeyAuto: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.configureImageKeyAuto, accountId),
    configureImageKeyMemory: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.configureImageKeyMemory, accountId),
    configureImageKeyManual: (accountId, xorKey, aesKeyHex) => electron.ipcRenderer.invoke(IPC_CHANNELS.configureImageKeyManual, accountId, xorKey, aesKeyHex),
    clearImageKey: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.clearImageKey, accountId)
  }),
  capture: Object.freeze({
    start: (accountId, kind, timeoutSeconds) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.startMaterialCapture,
      accountId,
      kind,
      timeoutSeconds
    ),
    watch: (captureId, afterEventSeq) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.watchMaterialCapture,
      captureId,
      afterEventSeq
    ),
    cancel: (captureId) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.cancelMaterialCapture,
      captureId
    ),
    componentDownload: (kind) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.materialCaptureComponentDownload,
      kind
    ),
    textBundle: (accountId) => electron.ipcRenderer.invoke(IPC_CHANNELS.materialTextBundle, accountId)
  }),
  voice: Object.freeze({
    startHistory: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.startVoiceHistory, ...args),
    historyStatus: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.getVoiceHistory, ...args),
    latestHistory: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.latestVoiceHistory, ...args),
    cancelHistory: (...args) => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelVoiceHistory, ...args),
    inspectModel: (modelId) => electron.ipcRenderer.invoke(IPC_CHANNELS.inspectVoiceModel, modelId),
    chooseModelDirectory: (modelId) => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseVoiceModelDirectory, modelId),
    chooseGpuRuntimeDirectory: () => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseVoiceGpuRuntimeDirectory),
    runtimeStatus: () => electron.ipcRenderer.invoke(IPC_CHANNELS.transcriptionRuntimeStatus),
    installRuntime: () => electron.ipcRenderer.invoke(IPC_CHANNELS.installTranscriptionRuntime),
    cancelRuntime: () => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelTranscriptionRuntime),
    modelDownloadStatus: (modelId) => electron.ipcRenderer.invoke(IPC_CHANNELS.voiceModelDownloadStatus, modelId),
    downloadModel: (modelId, source) => electron.ipcRenderer.invoke(IPC_CHANNELS.downloadVoiceModel, modelId, source),
    cancelModelDownload: (modelId) => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelVoiceModelDownload, modelId),
    transcribe: (accountId, locator, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.transcribeVoice, accountId, locator, options),
    transcribeBatch: (accountId, items, options) => electron.ipcRenderer.invoke(IPC_CHANNELS.transcribeVoiceBatch, accountId, items, options)
  }),
  persona: Object.freeze({
    startProfile: (accountId, conversationId, perspective, options) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.startPersonaProfile,
      accountId,
      conversationId,
      perspective,
      options
    ),
    watchProfile: (buildId) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.watchPersonaProfile,
      buildId
    ),
    cancelProfile: (buildId) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.cancelPersonaProfile,
      buildId
    ),
    createDraft: (input) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.createPersonaDraft,
      input
    ),
    draftRecovery: () => electron.ipcRenderer.invoke(IPC_CHANNELS.getPersonaDraftRecovery),
    resolveDraft: () => electron.ipcRenderer.invoke(IPC_CHANNELS.resolvePersonaDraft),
    recoverDraft: (input) => electron.ipcRenderer.invoke(IPC_CHANNELS.recoverPersonaDraft, input),
    getDraftResult: (runId) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.getPersonaDraftResult,
      runId
    ),
    approveDraft: (runId, resultDigest) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.approvePersonaDraft,
      runId,
      resultDigest
    ),
    rejectDraft: (runId, resultDigest) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.rejectPersonaDraft,
      runId,
      resultDigest
    ),
    archiveDraft: (runId) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.archivePersonaDraft,
      runId
    )
  }),
  storage: Object.freeze({
    cacheDirectory: () => electron.ipcRenderer.invoke(IPC_CHANNELS.cacheDirectory),
    chooseCacheDirectory: () => electron.ipcRenderer.invoke(IPC_CHANNELS.chooseCacheDirectory),
    cancelCacheDirectoryChange: () => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelCacheDirectoryChange),
    usage: () => electron.ipcRenderer.invoke(IPC_CHANNELS.storageUsage),
    cancelUsage: () => electron.ipcRenderer.invoke(IPC_CHANNELS.cancelStorageUsage),
    clear: (request) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.clearStorage,
      { category: String(request?.category ?? ""), ...request?.item === void 0 ? {} : { item: String(request.item) } }
    )
  }),
  agentMemory: Object.freeze({
    listScopes: (profileId, limit) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.listAgentMemoryScopes,
      profileId,
      limit
    ),
    clearScope: (profileId, scope) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.clearAgentMemoryScope,
      profileId,
      scope
    ),
    deleteScope: (scopeId, profileId) => electron.ipcRenderer.invoke(
      IPC_CHANNELS.deleteAgentMemoryScope,
      scopeId,
      profileId
    )
  })
});
electron.contextBridge.exposeInMainWorld("alpha", bridge);
