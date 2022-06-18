export interface PluginConfig {
  enabled: boolean;
}

export interface TsLanguageFeatures {
  getAPI(version: 0): TsLanguageFeaturesApiV0 | undefined;
}

export interface TsLanguageFeaturesApiV0 {
  configurePlugin(pluginId: string, configuration: PluginConfig): void;
}
