import { TextEncoder } from "util";
import * as vscode from "vscode";
import { PluginConfig, TsLanguageFeaturesApiV0, TsLanguageFeatures } from "../../types";

const pluginConfig: PluginConfig = {
  enabled: false,
};
let tsApi: TsLanguageFeaturesApiV0;

export async function activate(context: vscode.ExtensionContext) {
  let api = await getTsApi();
  if (!api) {
    return vscode.window.showErrorMessage(
      "CTAutocomplete unable to start. Make sure that typescript language features is enabled.",
    );
  }
  tsApi = api;

  vscode.workspace.onDidChangeConfiguration(
    handleConfigurationChanged,
    null,
    context.subscriptions,
  );

  vscode.workspace.onDidChangeTextDocument(handleChangeTextDocument, null, context.subscriptions);
  context.subscriptions.push(
    vscode.commands.registerCommand("vsctautocomplete.initialize", handleInitializeCommand),
  );

  const enabled = vscode.workspace.getConfiguration("vsctautocomplete").get<boolean>("enabled")!;
  if (enabled) {
    showEnableNotification();
    pluginConfig.enabled = true;
    refreshPluginConfig();
  }
}

async function handleInitializeCommand() {
  const name = await vscode.window.showInputBox({
    prompt: "Name to initialize CT module with",
    ignoreFocusOut: true,
    placeHolder: "Module name",
    validateInput(value) {
      if (!value || value.trim() !== value) {
        return "Must enter a valid name";
      }
    },
  });
  if (!name) {
    return;
  }

  const selectedLanguage = await vscode.window.showQuickPick(["Javascript", "Typescript(WIP)"], {
    ignoreFocusOut: true,
    placeHolder: "Module language template",
  });
  if (!selectedLanguage) return;

  let configCreator = vscode.workspace
    .getConfiguration("vsctautocomplete")
    .get<string>("defaultCreator");

  let creator;
  if (configCreator === "" || configCreator === undefined) {
    creator = await vscode.window.showInputBox({
      ignoreFocusOut: true,
      prompt: "Creator",
      validateInput(value) {
        if (!value || value.trim() !== value) {
          return "Must enter a valid name";
        }
      },
    });
  } else {
    creator = configCreator;
  }

  if (!creator) return;

  pluginConfig.enabled = true;
  refreshPluginConfig();
  await handleChangeTextDocument();

  const configuration = vscode.workspace.getConfiguration("vsctautocomplete");
  // If automatic detection of workspaces isn't enabled and global enabled isn't set,
  // then set workspace enabled to true.
  if (!configuration.get<boolean>("detectWorkspaces") && !configuration.get<boolean>("enabled")) {
    configuration.update("enabled", true);
  }

  let workspace = new vscode.WorkspaceEdit();
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;
  const metadataPath = vscode.Uri.file(workspacePath + "/metadata.json");

  let metadataContent;
  let indexPath;

  if (selectedLanguage === "Typescript(WIP)") {
    const tsconfigPath = vscode.Uri.file(workspacePath + "/tsconfig.json");
    const tsconfigContent = `\
{
  "compilerOptions": {
    "target": "es6",
    "module": "commonjs",
    "lib": ["es2016"],
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "noImplicitAny": false,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
`;
    try {
      workspace.createFile(tsconfigPath, {
        ignoreIfExists: true,
        overwrite: false,
      });
      await vscode.workspace.applyEdit(workspace);
      workspace = new vscode.WorkspaceEdit();

      await vscode.workspace.fs.writeFile(tsconfigPath, new TextEncoder().encode(tsconfigContent));
    } catch (e) {
      vscode.window.showErrorMessage("Unable to initialize module.");
      return;
    }

    indexPath = vscode.Uri.file(workspacePath + "/src/index.ts");

    metadataContent = `\
{
  "name": "${name}",
  "creator": "${creator}",
  "entry": "dist/index.js",
  "version": "0.0.1"
}
`;
  } else {
    indexPath = vscode.Uri.file(workspacePath + "/index.js");

    metadataContent = `\
{
  "name": "${name}",
  "creator": "${creator}",
  "entry": "index.js",
  "version": "0.0.1"
}
`;
  }

  try {
    workspace.createFile(indexPath, {
      ignoreIfExists: true,
      overwrite: false,
    });
    // If the edit doesn't succeed, create a new editing instance for metadata.
    await vscode.workspace.applyEdit(workspace);
    workspace = new vscode.WorkspaceEdit();

    workspace.createFile(metadataPath, {
      ignoreIfExists: true,
      overwrite: false,
    });
    await vscode.workspace.applyEdit(workspace);

    await vscode.workspace.fs.writeFile(metadataPath, new TextEncoder().encode(metadataContent));
  } catch (e) {
    vscode.window.showErrorMessage("Unable to initialize module.");
    return;
  }
}

async function handleConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
  if (event.affectsConfiguration("vsctautocomplete.enabled")) {
    const enabled = vscode.workspace.getConfiguration("vsctautocomplete").get<boolean>("enabled")!;

    if (enabled && !pluginConfig.enabled) {
      showEnableNotification();
    }
    pluginConfig.enabled = enabled;
    refreshPluginConfig();
  }

  if (event.affectsConfiguration("vsctautocomplete.detectWorkspaces")) {
    await handleChangeTextDocument();
  }
}

async function handleChangeTextDocument() {
  const configuration = vscode.workspace.getConfiguration("vsctautocomplete");
  const detectWorkspaces = configuration.get<boolean>("detectWorkspaces");
  const enabledSetting = configuration.get<boolean>("enabled");

  if (!enabledSetting && detectWorkspaces) {
    let metadata = (await vscode.workspace.findFiles("metadata.json"))[0];

    if (!metadata && pluginConfig.enabled) {
      pluginConfig.enabled = false;
      refreshPluginConfig();
    } else if (metadata && !pluginConfig.enabled) {
      pluginConfig.enabled = true;
      refreshPluginConfig();
      showEnableNotification();
    }
    return;
  }

  if (!enabledSetting && !detectWorkspaces) {
    pluginConfig.enabled = false;
    refreshPluginConfig();
  }

  if (enabledSetting) {
    pluginConfig.enabled = true;
    refreshPluginConfig();
  }
}

export function deactivate() {}

async function getTsApi() {
  const extension = vscode.extensions.getExtension<TsLanguageFeatures>(
    "vscode.typescript-language-features",
  );
  if (!extension) {
    vscode.window.showErrorMessage("Error while setting up typescript language server");
    return;
  }

  await extension.activate();
  if (!extension.exports || !extension.exports.getAPI) {
    vscode.window.showErrorMessage("Error while setting up typescript language server");
    return;
  }
  const api = extension.exports.getAPI(0);
  return api;
}

function refreshPluginConfig() {
  tsApi.configurePlugin("tsserver-plugin", pluginConfig);
}

function showEnableNotification() {
  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "Enabling CTAutocomplete...",
    cancellable: false,
  };
  vscode.window.withProgress(progressOptions, async () => {
    await new Promise<void>(resolve => {
      setTimeout(resolve, 4000);
    });
  });
}
