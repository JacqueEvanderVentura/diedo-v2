export function mapWorkspaceSettingsFromApi(settings) {
  return {
    businessName: settings.name,
    region: settings.locale,
    taxDefault: Number(settings.taxDefaultRate),
    version: settings.version,
  }
}
