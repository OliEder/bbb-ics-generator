'use strict';

class IndexPage {
  constructor(page) {
    this.page = page;
  }

  spotlightTab(name) {
    return this.page.getByRole('tab', { name });
  }

  spotlightPanel(id) {
    return this.page.locator(`#${id}`);
  }

  teaserRows() {
    return this.page.locator('.teaser-result');
  }

  teaserOpponent() {
    return this.page.locator('.teaser-opponent').first();
  }

  footerLink(href) {
    return this.page.locator(`footer a[href="${href}"]`);
  }

  footer() {
    return this.page.locator('footer[role="contentinfo"]');
  }
}

module.exports = { IndexPage };
