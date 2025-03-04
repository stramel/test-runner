import { join } from 'path';
import { normalizeStories, getProjectRoot } from '@storybook/core-common';
import { getStorybookMain } from './getStorybookMain';

export const getStorybookMetadata = () => {
  const workingDir = getProjectRoot();
  const configDir = process.env.STORYBOOK_CONFIG_DIR;

  const main = getStorybookMain(configDir);
  const normalizedStoriesEntries = normalizeStories(main.stories, {
    configDir,
    workingDir,
  }).map((specifier) => ({
    ...specifier,
    importPathMatcher: new RegExp(specifier.importPathMatcher),
  }));

  const storiesPaths = normalizedStoriesEntries
    .map((entry) => entry.directory + '/' + entry.files)
    .map((dir) => join(workingDir, dir))
    .join(';');

  // @ts-ignore -- this is added in @storybook/core-common@6.5, which we don't depend on
  const lazyCompilation = !!main?.core?.builder?.options?.lazyCompilation;

  return {
    configDir,
    workingDir,
    storiesPaths,
    normalizedStoriesEntries,
    lazyCompilation,
  };
};
