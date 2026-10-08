/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import AILabScreen from '../src/screens/AILabScreen';

test('AILabScreen renders the AI Test Lab', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<AILabScreen />);
  });
  const json = JSON.stringify(tree?.toJSON());
  expect(json).toContain('AI Test Lab');
});
