import path = require("path");
import ts = require("typescript/lib/tsserverlibrary");
import { PluginConfig } from "../../types";

let config: PluginConfig = {
  enabled: false,
};

function init(modules: { typescript: typeof import("typescript/lib/tsserverlibrary") }) {
  const completionsPath = path.join(__dirname, "../../lib/index.d.ts");
  const ts = modules.typescript;

  let logger: ts.server.Logger;

  let pluginInfo: ts.server.PluginCreateInfo;

  function create(info: ts.server.PluginCreateInfo) {
    logger = info.project.projectService.logger;
    pluginInfo = info;

    const getScriptFileNames = info.languageServiceHost.getScriptFileNames.bind(
      info.languageServiceHost,
    );
    info.languageServiceHost.getScriptFileNames = () => {
      const scriptFileNames = getScriptFileNames();
      if (config.enabled && !scriptFileNames.includes(completionsPath)) {
        scriptFileNames.push(completionsPath);
      }

      return scriptFileNames;
    };

    return info.languageService;
  }

  function onConfigurationChanged(cfg: PluginConfig) {
    config = cfg;
    pluginInfo.project.markAsDirty();
    pluginInfo.project.refreshDiagnostics();
  }

  return { create, onConfigurationChanged };
}

export = init;
