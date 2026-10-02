'use strict';

// Per `node -r` vor src/cronUpdate.js geladen: mockt die API im Kindprozess.
// BBB_MOCK_FAIL_CLUBS="3003,3004" lässt fetchClubTeams für diese Clubs werfen.
const { installApiMocks } = require('./multiClubFixture');
const apiClient = require('../../src/apiClient');

installApiMocks(apiClient, { failClubIds: (process.env.BBB_MOCK_FAIL_CLUBS || '').split(',').filter(Boolean) });
