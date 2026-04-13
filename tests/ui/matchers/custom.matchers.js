'use strict';

const { expect } = require('@playwright/test');

expect.extend({
  async toHaveTextAlign(locator, expected) {
    const actual = await locator.evaluate(el =>
      window.getComputedStyle(el).textAlign
    );
    const pass = actual === expected;
    return {
      pass,
      message: () => pass
        ? `Expected text-align NOT to be "${expected}"`
        : `Expected text-align to be "${expected}", got "${actual}"`,
    };
  },

  async toHavePanelHidden(locator) {
    const hidden = await locator.evaluate(el => el.hasAttribute('hidden'));
    return {
      pass: hidden,
      message: () => hidden
        ? 'Expected panel NOT to have [hidden] attribute'
        : 'Expected panel to have [hidden] attribute',
    };
  },
});

module.exports = { expect };
