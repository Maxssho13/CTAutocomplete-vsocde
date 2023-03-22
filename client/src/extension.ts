import { TextEncoder } from "util";
import * as vscode from "vscode";
import { PluginConfig, TsLanguageFeaturesApiV0, TsLanguageFeatures } from "../../types";
import { exec } from "child_process";

const pluginConfig: PluginConfig = {
  enabled: false,
};
let tsApi: TsLanguageFeaturesApiV0;

export async function activate(context: vscode.ExtensionContext) {
  let api = await getTsApi();
  if (!api) {
    return vscode.window.showErrorMessage(
      "Chattriggers unable to start. Make sure that typescript language features is enabled.",
    );
  }
  tsApi = api;

  vscode.workspace.onDidChangeConfiguration(
    handleConfigurationChanged,
    null,
    context.subscriptions,
  );

  vscode.window.onDidChangeActiveTextEditor(handleChangeTextEditor, null, context.subscriptions);
  context.subscriptions.push(
    vscode.commands.registerCommand("chattriggers.initialize", handleInitializeCommand),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("chattriggers.setDefaultCreator", handleSetCreatorCommand),
  );

  const enabled = vscode.workspace.getConfiguration("chattriggers").get<boolean>("enabled")!;

  if (enabled) {
    enablePlugin();
  }
  await handleChangeTextEditor();
}

async function handleSetCreatorCommand() {
  const creatorName = await vscode.window.showInputBox({
    prompt: "Default creator name",
    title: "Set default creator name to initialize projects with",
    ignoreFocusOut: true,
    validateInput(value) {
      if (!value || value.trim() !== value) {
        return "Must enter a valid name";
      }
    },
  });

  await vscode.workspace
    .getConfiguration("chattriggers")
    .update("defaultCreator", creatorName, vscode.ConfigurationTarget.Global);
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

  const selectedLanguage = await vscode.window.showQuickPick(["Javascript", "Typescript"], {
    ignoreFocusOut: true,
    placeHolder: "Module language template",
  });
  if (!selectedLanguage) return;

  let configCreator = vscode.workspace
    .getConfiguration("chattriggers")
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

  const initializeGit = await vscode.window.showQuickPick(["Yes", "No"], {
    ignoreFocusOut: true,
    title: "Initialize Empty Git Repository",
    placeHolder: "Initialize Empty Git Repository",
  });
  if (initializeGit == null) return;

  if (initializeGit === "Yes") {
    bootstrapGit();
  }

  enablePlugin();

  // If automatic detection of workspaces isn't enabled and global enabled isn't set,
  // then set workspace enabled to true.
  const configuration = vscode.workspace.getConfiguration("chattriggers");
  if (!configuration.get<boolean>("detectWorkspaces") && !configuration.get<boolean>("enabled")) {
    await configuration.update("enabled", true);
  }

  if (selectedLanguage === "Typescript") {
    await bootstrapTypescript(name, creator);
  } else {
    await bootstrapJavascript(name, creator);
  }
  await handleChangeTextEditor();
}

async function bootstrapGit() {
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;

  exec("git init", { cwd: workspacePath }, async err => {
    if (err) {
      vscode.window.showErrorMessage("Unable to initialize git repository");
      return;
    }

    const workspace = new vscode.WorkspaceEdit();
    const gitIgnorePath = vscode.Uri.file(workspacePath + "/.gitignore");
    workspace.createFile(gitIgnorePath, { ignoreIfExists: true, overwrite: false });
    await vscode.workspace.applyEdit(workspace);
    await vscode.workspace.fs.writeFile(gitIgnorePath, new TextEncoder().encode(".vscode/\ndist/"));
  });
}

async function bootstrapTypescript(moduleName: string, creatorName: string) {
  const workspace = new vscode.WorkspaceEdit();
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;

  const tsconfigPath = vscode.Uri.file(workspacePath + "/tsconfig.json");
  const indexPath = vscode.Uri.file(workspacePath + "/src/index.ts");
  const metadataPath = vscode.Uri.file(workspacePath + "/metadata.json");

  const tsconfig = JSON.stringify(
    {
      compilerOptions: {
        target: "es6",
        module: "commonjs",
        lib: ["es2016"],
        outDir: "dist",
        rootDir: "src",
        strict: true,
        noImplicitAny: false,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
      },
    },
    null,
    2,
  );

  const metadata = JSON.stringify(
    {
      name: moduleName,
      creator: creatorName,
      entry: "dist/index.js",
      version: "0.0.1",
    },
    null,
    2,
  );

  try {
    const createFileConfig = {
      ignoreIfExists: true,
      overwrite: false,
    };
    workspace.createFile(tsconfigPath, createFileConfig);
    workspace.createFile(indexPath, createFileConfig);
    workspace.createFile(metadataPath, createFileConfig);
    await vscode.workspace.applyEdit(workspace);

    await Promise.all([
      vscode.workspace.fs.writeFile(tsconfigPath, new TextEncoder().encode(tsconfig)),
      vscode.workspace.fs.writeFile(metadataPath, new TextEncoder().encode(metadata)),
    ]);
  } catch (e) {
    vscode.window.showErrorMessage("Unable to initialize module.");
    return;
  }
}

async function bootstrapJavascript(moduleName: string, creatorName: string) {
  const workspace = new vscode.WorkspaceEdit();
  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri?.fsPath;

  const indexPath = vscode.Uri.file(workspacePath + "/index.js");
  const metadataPath = vscode.Uri.file(workspacePath + "/metadata.json");

  const metadata = JSON.stringify(
    {
      name: moduleName,
      creator: creatorName,
      entry: "index.js",
      version: "0.0.1",
    },
    null,
    2,
  );

  try {
    const createFileConfig = {
      ignoreIfExists: true,
      overwrite: false,
    };
    workspace.createFile(indexPath, createFileConfig);
    workspace.createFile(metadataPath, createFileConfig);
    await vscode.workspace.applyEdit(workspace);

    await Promise.all([
      vscode.workspace.fs.writeFile(metadataPath, new TextEncoder().encode(metadata)),
    ]);
  } catch (e) {
    vscode.window.showErrorMessage("Unable to initialize module.");
    return;
  }
}

async function handleConfigurationChanged(event: vscode.ConfigurationChangeEvent) {
  if (event.affectsConfiguration("chattriggers.enabled")) {
    const enabled = vscode.workspace.getConfiguration("chattriggers").get<boolean>("enabled")!;

    enabled ? enablePlugin() : disablePlugin();
  }

  if (event.affectsConfiguration("chattriggers.detectWorkspaces")) {
    await handleChangeTextEditor();
  }
}

async function handleChangeTextEditor() {
  const configuration = vscode.workspace.getConfiguration("chattriggers");
  const detectWorkspaces = configuration.get<boolean>("detectWorkspaces");
  const enabledSetting = configuration.get<boolean>("enabled");

  if (enabledSetting) {
    enablePlugin();
    return;
  }

  if (detectWorkspaces) {
    const metadataFile = (await vscode.workspace.findFiles("metadata.json"))[0];
    if (metadataFile != null) {
      enablePlugin();
      return;
    }
  }

  disablePlugin();
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

function enablePlugin() {
  if (!pluginConfig.enabled) {
    showEnableNotification();
  }
  pluginConfig.enabled = true;
  refreshPluginConfig();
}

function disablePlugin() {
  pluginConfig.enabled = false;
  refreshPluginConfig();
}

function showEnableNotification() {
  const progressOptions = {
    location: vscode.ProgressLocation.Notification,
    title: "Enabling Chattriggers...",
    cancellable: false,
  };
  vscode.window.withProgress(progressOptions, async () => {
    await new Promise<void>(resolve => {
      setTimeout(resolve, 2000);
    });
  });
}
