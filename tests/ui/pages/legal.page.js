'use strict';

class LegalPage {
  constructor(page) {
    this.page = page;
  }

  heading() {
    return this.page.locator('h1');
  }

  bodyText() {
    return this.page.locator('main');
  }
}

module.exports = { LegalPage };
