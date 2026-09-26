// Metro: نماذج ثلاثية الأبعاد (GLB) تُعامل كملفات أصول
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.resolver.assetExts.push('glb', 'gltf');

module.exports = config;
