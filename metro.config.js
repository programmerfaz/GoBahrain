const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// moti → framer-motion can nest its own react; two copies break hooks.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
};

const reactNativeMapsWebStub = path.resolve(projectRoot, 'src/shims/react-native-maps.web.js');
const upstreamResolveRequest = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && moduleName === 'react-native-maps') {
    return { type: 'sourceFile', filePath: reactNativeMapsWebStub };
  }
  if (typeof upstreamResolveRequest === 'function') {
    return upstreamResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
