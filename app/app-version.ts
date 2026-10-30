declare const __APP_VERSION__: string;
export const APP_VERSION = typeof __APP_VERSION__ === "undefined" ? "sviluppo" : __APP_VERSION__;
