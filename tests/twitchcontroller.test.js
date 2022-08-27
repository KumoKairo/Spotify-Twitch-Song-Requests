/**
 * This file contains a test suite for the Twitch class in twitchcontroller.js
 * Feel free to add more tests whenever bugs are found.
 */

/**
 * Setup
 */
const { default: axios } = require('axios');
const Twitch = require('../twitchcontroller');

const token = 'testToken';
const client_id = 'testClientId';
const chatbotConfig = {
  automatic_refunds: true,
  custom_reward_id: '123-123-123'
}

/**
 * Axios mock responses
 */
// TODO: move these to separate file
jest.mock('axios');

const successfulGetLastRedemptionId = {
  'data': {
    'data': [
      {
        'broadcaster_name': 'corebyte',
        'broadcaster_login': 'corebyte',
        'broadcaster_id': '11111',
        'id': '11111',
        'user_id': '11111',
        'user_name': 'corebyte',
        'user_input': '',
        'status': 'UNFULFILLED',
        'redeemed_at': (new Date).toISOString(),
        'reward': {
          'id': '11111',
          'title': 'reward_title',
          'prompt': '',
          'cost': 500
        }
      }
    ]
  }
}
const failedEmptyGetLastRedemptionId = {
  'data': {
    'data': []
  }
}
const failedPastGetLastRedemptionId = {
  'data': {
    'data': [
      {
        'broadcaster_name': 'corebyte',
        'broadcaster_login': 'corebyte',
        'broadcaster_id': '11111',
        'id': '11111',
        'user_id': '11111',
        'user_name': 'corebyte',
        'user_input': '',
        'status': 'UNFULFILLED',
        'redeemed_at': (new Date(2020, 1, 1)).toISOString(),
        'reward': {
          'id': '11111',
          'title': 'reward_title',
          'prompt': '',
          'cost': 500
        }
      }
    ]
  }
}


describe('Twitch', () => {
  let twitch;
  beforeEach(() => {
    twitch = new Twitch();
  });
  afterEach(() => {
    if (twitch.scheduler) {
      twitch.scheduler.stop();
    }
    jest.clearAllTimers();
    jest.clearAllMocks();
  });

  describe('#init', () => {
    describe('refunds are disabled', () => {
      it('has refunds disabled in config', async () => {
        chatbotConfig.automatic_refunds = false;
        await twitch.init(chatbotConfig, token, client_id);
        expect(twitch.refunds_active).toBeFalsy();
        chatbotConfig.automatic_refunds = true;
      });

      it('has no client_id', async () => {
        await twitch.init(chatbotConfig, token, null);
        expect(twitch.refunds_active).toBeFalsy();
      });

      it('has no token', async () => {
        await twitch.init(chatbotConfig);
        expect(twitch.refunds_active).toBeFalsy();
      });

    });
    it('is successful', async () => {
      jest.spyOn(twitch, 'validateTwitchToken').mockResolvedValue(null);
      jest.spyOn(twitch, 'getBroadcasterId').mockResolvedValue('broadcaster_id');
      jest.spyOn(twitch, 'checkRewardExistence').mockResolvedValue(null);

      await twitch.init(chatbotConfig, token, client_id);
      expect(twitch.refunds_active).toBeTruthy();
    })
  });


  describe('#getLastRedemptionId', () => {
    beforeEach(() => {
      jest.spyOn(twitch, 'getTwitchHeaders').mockReturnValue({});
    });
    afterEach(() => {
      jest.clearAllMocks();
    })
    it('has a valid response', async () => {
      axios.get.mockResolvedValueOnce(successfulGetLastRedemptionId);
      expect(await twitch.getLastRedemptionId()).toBe('11111');
    });
  });
  describe('is not a valid response', () => {
    it('is an empty array', async () => {
      axios.get.mockResolvedValueOnce(failedEmptyGetLastRedemptionId);
      expect(await twitch.getLastRedemptionId()).toBeNull();
    });
    it('is is a past redemption', async () => {
      axios.get.mockResolvedValueOnce(failedPastGetLastRedemptionId);
      expect(await twitch.getLastRedemptionId()).toBeNull();
    });
  });


});
