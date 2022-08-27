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
jest.mock('axios');


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
  describe('initialization', () => {

    test('refunds are not active when disabled', async () => {
      chatbotConfig.automatic_refunds = false;
      await twitch.init(chatbotConfig, token, client_id);
      expect(twitch.refunds_active).toBeFalsy();
      chatbotConfig.automatic_refunds = true;
    });

    test('refunds are not active when client_id is null', async () => {
      await twitch.init(chatbotConfig, token, null);
      expect(twitch.refunds_active).toBeFalsy();
    });

    test('refunds are not active when client_id is missing', async () => {
      await twitch.init(chatbotConfig, token);
      expect(twitch.refunds_active).toBeFalsy();
    });

    test('refunds are active when all are valid', async () => {
      jest.spyOn(twitch, 'validateTwitchToken').mockResolvedValue(null);
      jest.spyOn(twitch, 'getBroadcasterId').mockResolvedValue('broadcaster_id');
      jest.spyOn(twitch, 'checkRewardExistence').mockResolvedValue(null);

      await twitch.init(chatbotConfig, token, client_id);
      expect(twitch.refunds_active).toBeTruthy();
    })
  })


})
