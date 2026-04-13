'use strict';

class TeamPage {
  constructor(page) {
    this.page = page;
  }

  scheduleTab(name) {
    return this.page.getByRole('tab', { name: new RegExp(name) });
  }

  badges() {
    return this.page.locator('.badge');
  }

  homeBadges() {
    return this.page.locator('.badge--home');
  }

  awayBadges() {
    return this.page.locator('.badge--away');
  }

  nextGameBlock() {
    return this.page.locator('.next-game');
  }

  footer() {
    return this.page.locator('footer[role="contentinfo"]');
  }

  footerLink(href) {
    return this.page.locator(`footer a[href="${href}"]`);
  }

  calSectionHeading(panelId) {
    return this.page.locator(`#${panelId} .cal-section-heading`);
  }

  calHelp(panelId) {
    return this.page.locator(`#${panelId} .cal-help`);
  }

  copyButton(panelId) {
    return this.page.locator(`#${panelId} .btn--copy`);
  }
}

module.exports = { TeamPage };
