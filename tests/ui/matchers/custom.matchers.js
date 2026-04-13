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
      message: () => `Expected text-align to be "${expected}", got "${actual}"`,
    };
  },

  async toHavePanelHidden(locator) {
    const hidden = await locator.evaluate(el => el.hasAttribute('hidden'));
    return {
      pass: hidden,
      message: () => `Expected panel to have [hidden] attribute`,
    };
  },
});

module.exports = { expect };
