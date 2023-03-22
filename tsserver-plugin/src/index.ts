import path = require("path");
import ts = require("typescript/lib/tsserverlibrary");
import { PluginConfig } from "../../types";

let config: PluginConfig = {
  enabled: false,
};

function init(modules: { typescript: typeof ts }) {
  const completionsPath = path.join(__dirname, "../index.d.ts");

  let pluginInfo: ts.server.PluginCreateInfo;

  function create(info: ts.server.PluginCreateInfo) {
    pluginInfo = info;

    function log(message: string) {
      info.project.projectService.logger.info(message);
    }

    log(`Starting Chattriggers Typescript plugin ${info.project.getCurrentDirectory()}`);

    function setupDecorator() {
      // Set up decorator object
      const proxy = Object.create(null);
      for (let k of Object.keys(info.languageService)) {
        const x = (info.languageService as any)[k];
        proxy[k] = (...args: Array<{}>) => x.apply(info.languageService, args);
      }
      return proxy as typeof info.languageService;
    }
    const proxy = setupDecorator();

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

    return proxy;
  }

  function onConfigurationChanged(cfg: PluginConfig) {
    config = cfg;
    pluginInfo.project.markAsDirty();
    pluginInfo.project.refreshDiagnostics();
  }

  return { create, onConfigurationChanged };
}

export = init;
