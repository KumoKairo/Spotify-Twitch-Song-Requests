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
  refunds_active: true,
  custom_reward_id: '123-123-123'
}

/**
 * Axios mock responses
 */
jest.mock('axios');
//


describe('Twitch', () => {
  describe('initialization', () => {
    test('refunds are not active when disabled', async () => {
      const twitch = new Twitch();
      chatbotConfig.refunds_active = false;
      await twitch.init(chatbotConfig, token, client_id);
      expect(twitch.refunds_active).toBeFalsy();
      chatbotConfig.refunds_active = true;
    });

    test('refunds are not active when client_id is null', async () => {
      const twitch = new Twitch();
      await twitch.init(chatbotConfig, token, null);
      expect(twitch.refunds_active).toBeFalsy();
    });

    test('refunds are not active when client_id is missing', async () => {
      const twitch = new Twitch();
      await twitch.init(chatbotConfig, token);
      expect(twitch.refunds_active).toBeFalsy();
    });

    test('refunds are active when all are valid', async () => {
      const twitch = new Twitch();
      axios.get.mockResolvedValue({
        'data' :
          {
            id: '1'
          },
          'scopes' : ['channel:manage:redemptions']
      });
      debugger;
      await twitch.init(chatbotConfig, token, client_id);
      expect(twitch.refunds_active).toBeTruthy();
    })
  })


})
