import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Button from './Button';

describe('pixel button accessibility', () => {
  test('actions use keyboard-accessible buttons with non-submit type', () => {
    const html = renderToStaticMarkup(
      createElement(Button, { imgUrl: '/icon.svg', children: '帮助' }),
    );
    expect(html).toContain('<button');
    expect(html).toContain('type="button"');
    expect(html).toContain('alt="" aria-hidden="true"');
    expect(html).not.toContain('<a');
  });
  test('real navigation keeps its destination and anchor semantics', () => {
    const html = renderToStaticMarkup(
      createElement(Button, {
        href: 'https://github.com/kiva-9/ai-town',
        imgUrl: '/icon.svg',
        children: '项目',
      }),
    );
    expect(html).toContain('<a');
    expect(html).toContain('href="https://github.com/kiva-9/ai-town"');
    expect(html).not.toContain('<button');
  });
});
