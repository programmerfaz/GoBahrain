const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// moti → framer-motion can nest its own react; two copies break hooks.
config.resolver.extraNodeModules = {
  react: path.resolve(projectRoot, 'node_modules/react'),
};

module.exports = config;
