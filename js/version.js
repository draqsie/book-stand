// Yayımlama sırasında GitHub Actions bu değeri commit kimliğiyle değiştirir.
export const BUILD = '__BUILD_ID__';
export const IS_DEV_BUILD = BUILD.startsWith('__');
