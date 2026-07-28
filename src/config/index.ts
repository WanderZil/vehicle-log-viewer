const metaEnv: Record<string, string | undefined> =
  (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ??
  {};

export const envConfigs = {
  get app_url() {
    return metaEnv.VITE_APP_URL ?? 'http://localhost:3000';
  },
  get app_name() {
    return metaEnv.VITE_APP_NAME ?? 'Vehicle Log Viewer';
  },
  get app_description() {
    return metaEnv.VITE_APP_DESCRIPTION ?? 'Browser-based CAN log viewer';
  },
  get app_logo() {
    if (metaEnv.VITE_APP_LOGO) return metaEnv.VITE_APP_LOGO;
    const base = metaEnv.BASE_URL || '/';
    return `${base}logo.svg`.replace(/\/{2,}/g, '/');
  },
  get commercial_url() {
    return metaEnv.VITE_COMMERCIAL_URL ?? '';
  },
  get locale() {
    return metaEnv.VITE_DEFAULT_LOCALE ?? 'en';
  },
};
