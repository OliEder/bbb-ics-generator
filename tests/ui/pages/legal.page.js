'use strict';

class LegalPage {
  constructor(page) {
    this.page = page;
  }

  heading() {
    return this.page.locator('h1');
  }

  async bodyText() {
    return this.page.locator('main').innerText();
  }
}

module.exports = { LegalPage };
