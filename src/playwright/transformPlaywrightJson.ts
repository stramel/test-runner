import * as t from '@babel/types';
import generate from '@babel/generator';
import { ComponentTitle, StoryId, StoryName, toId } from '@storybook/csf';

import { testPrefixer } from './transformPlaywright';
import { getTagOptions } from '../util/getTagOptions';

const makeTest = ({
  entry,
  shouldSkip,
  metaOrStoryPlay,
}: {
  entry: V4Entry;
  shouldSkip: boolean;
  metaOrStoryPlay: boolean;
}): t.Statement => {
  const result: any = testPrefixer({
    name: t.stringLiteral(entry.name),
    title: t.stringLiteral(entry.title),
    id: t.stringLiteral(entry.id),
    // FIXME
    storyExport: t.identifier(entry.id),
  });

  const stmt = result[1] as t.ExpressionStatement;
  return t.expressionStatement(
    t.callExpression(shouldSkip ? t.identifier('it.skip') : t.identifier('it'), [
      t.stringLiteral(!!metaOrStoryPlay ? 'play-test' : 'smoke-test'),
      stmt.expression,
    ])
  );
};

const makeDescribe = (title: string, stmts: t.Statement[]) => {
  return t.expressionStatement(
    t.callExpression(t.identifier('describe'), [
      t.stringLiteral(title),
      t.arrowFunctionExpression([], t.blockStatement(stmts)),
    ])
  );
};

type V4Entry = {
  type?: 'story' | 'docs';
  id: StoryId;
  name: StoryName;
  title: ComponentTitle;
  tags: string[];
};
type V4Index = {
  v: 4;
  entries: Record<StoryId, V4Entry>;
};

type V3Story = Omit<V4Entry, 'type'> & { parameters?: Record<string, any> };
type V3StoriesIndex = {
  v: 3;
  stories: Record<StoryId, V3Story>;
};
const isV3DocsOnly = (stories: V3Story[]) => stories.length === 1 && stories[0].name === 'Page';

function v3TitleMapToV4TitleMap(titleIdToStories: Record<string, V3Story[]>) {
  return Object.fromEntries(
    Object.entries(titleIdToStories).map(([id, stories]) => [
      id,
      stories.map(
        ({ parameters, ...story }) =>
          ({
            type: isV3DocsOnly(stories) ? 'docs' : 'story',
            ...story,
          } as V4Entry)
      ),
    ])
  );
}

function groupByTitleId<T extends { title: ComponentTitle }>(entries: T[]) {
  return entries.reduce((acc, entry) => {
    const titleId = toId(entry.title);
    acc[titleId] = acc[titleId] || [];
    acc[titleId].push(entry);
    return acc;
  }, {} as { [key: string]: T[] });
}

/**
 * Generate one test file per component so that Jest can
 * run them in parallel.
 */
export const transformPlaywrightJson = (index: Record<string, any>) => {
  let titleIdToEntries: Record<string, V4Entry[]>;
  if (index.v === 3) {
    const titleIdToStories = groupByTitleId<V3Story>(
      Object.values((index as V3StoriesIndex).stories)
    );
    titleIdToEntries = v3TitleMapToV4TitleMap(titleIdToStories);
  } else if (index.v === 4) {
    // TODO: Once Storybook 8.0 is released, we should only support v4 and higher
    titleIdToEntries = groupByTitleId<V4Entry>(Object.values((index as V4Index).entries));
  } else {
    throw new Error(`Unsupported version ${index.v}`);
  }

  const { includeTags, excludeTags, skipTags } = getTagOptions();

  const titleIdToTest = Object.entries(titleIdToEntries).reduce((acc, [titleId, entries]) => {
    const stories = entries.filter((s) => s.type !== 'docs');
    if (stories.length) {
      const storyTests = stories
        .filter((story) => {
          // If includeTags is passed, check if the story has any of them - else include by default
          const isIncluded =
            includeTags.length === 0 || includeTags.some((tag) => story.tags?.includes(tag));

          // If excludeTags is passed, check if the story does not have any of them
          const isNotExcluded = excludeTags.every((tag) => !story.tags?.includes(tag));

          return isIncluded && isNotExcluded;
        })
        .map((story) => {
          const shouldSkip = skipTags.some((tag) => story.tags?.includes(tag));

          return makeDescribe(story.name, [
            makeTest({
              entry: story,
              shouldSkip,
              metaOrStoryPlay: story.tags?.includes('play-fn'),
            }),
          ]);
        });
      const program = t.program([makeDescribe(stories[0].title, storyTests)]) as babel.types.Node;

      const { code } = generate(program, {});

      acc[titleId] = code;
    }
    return acc;
  }, {} as { [key: string]: string });

  return titleIdToTest;
};
