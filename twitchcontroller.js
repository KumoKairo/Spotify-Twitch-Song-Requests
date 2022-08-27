const axios = require('axios').default;
const { ToadScheduler, SimpleIntervalJob, AsyncTask } = require('toad-scheduler');

module.exports = class Twitch {
    reward_id; // custom reward id
    broadcaster_id; // broadcaster id needed for many api calls
    scheduler; // scheduler, validates our token hourly
    token;
    client_id;
    refunds_active; // false if refunds are disabled due to an error or by config file

    constructor() {
        this.refunds_active = true;
    }

    /**
     * Async constructor
     * @param chatbotConfig - settings
     * @param token - twitch oauth token
     * @param id - twitch client id
     */
    async init(chatbotConfig, token, id) {
        this.client_id = id;
        this.token = token;

        // refunds are off
        if (!chatbotConfig.automatic_refunds) {
            this.refunds_active = false;
            this.reward_id = chatbotConfig.custom_reward_id;
            return;
        }

        if (this.client_id == null) {
            console.log("Client_id not found -> refunds will not work.");
            this.reward_id = chatbotConfig.custom_reward_id;
            this.refunds_active = false;
            return;
        }
        if (this.token == null) {
            console.log("Refund not found -> refunds will not work.");
            this.reward_id = chatbotConfig.custom_reward_id;
            this.refunds_active = false;
            return;
        }



        // twitch api states we need to validate once per hour
        this.scheduler = new ToadScheduler();

        // check tokens
        let validateTask = new AsyncTask('ValidateTwitchToken', async () => {
            await this.validateTwitchToken()
        });
        let validate = new SimpleIntervalJob({ hours: 1, runImmediately: true }, validateTask);
        this.scheduler.addSimpleIntervalJob(validate);

        // validation failed - disabling refunds.
        if (!this.refunds_active) {
            console.log("Refunds were enabled, but token validation failed.");
            console.log("Falling back to default reward_id.");
            this.reward_id = chatbotConfig.custom_reward_id;
            return;
        }

        this.broadcaster_id = await this.getBroadcasterId(chatbotConfig.channel_name);
        await this.checkRewardExistence(chatbotConfig);
    }

    /**
     * Formats auth headers
     * @returns {{Authorization: string, "Client-ID": string}}
     */
    getTwitchHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'Client-ID': this.client_id
        };
    }

    /**
     * Check if we have created a reward in a past session. If so, we will use that reward.
     * Otherwise we will create a new reward.
     * @param chatbotConfig - for settings in order to create a new reward
     */
    async checkRewardExistence(chatbotConfig) {
        try {
            let res = await axios.get('https://api.twitch.tv/helix/channel_points/custom_rewards', {
                params: {
                    'broadcaster_id': this.broadcaster_id,
                    'only_manageable_rewards': true
                },
                headers: this.getTwitchHeaders()
            });
            if (res.data.data.length === 0) {
                await this.createReward(chatbotConfig.custom_reward_name, chatbotConfig.custom_reward_cost);
            }
            else {
                this.reward_id = res.data.data[0].id;
            }
        } catch (error) {
            console.log(error);
        }
    }

    /**
     * Validate our OAuth token. If this fails, it will prepare to fallback to the refundless program
     */
    async validateTwitchToken() {
        try {
            let res = await axios.get('https://id.twitch.tv/oauth2/validate', {
                headers: { 'Authorization': `OAuth ${this.token}` },
                validateStatus: function (status) {
                    return [401, 200].includes(status);
                }
            })
            if (res.status === 401) {
                console.log(res.data);
                console.log('Twitch token validation failed. Have you revoked the token?');
                console.log('Refunds will not work.');
                this.scheduler.stop();
            } else if (res.status === 200 && !res.data['scopes'].includes('channel:manage:redemptions')) {
                console.log('For refunds to work, please make sure to add "channel:manage:redemptions" to the OAuth scopes.');
                this.scheduler.stop();
            }
        } catch (error) {
            this.refunds_active = false;
            console.log(error);
        }
    }

    /**
     * Refunds points, returns true is successful, false otherwise.
     * @returns {Promise<boolean>}
     */
    async refundPoints() {
        // refunds not activated.
        if (!this.refunds_active) { return false; }
        try {
            let id = await this.getLastRedemptionId();
            if (id == null) { return false; }
            await axios.patch(`https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions`,
                { 'status': 'CANCELED' },
                {
                    params: {
                        'id': id,
                        'broadcaster_id': this.broadcaster_id,
                        'reward_id': this.reward_id
                    },
                    headers: this.getTwitchHeaders()
                });
            return true;
        } catch (error) {
            return false;
        }

    }

    /**
     * Creates a new channel point reward
     * @param name - name of the new reward
     * @param cost - cost of the new reward
     */
    async createReward(name, cost) {
        try {
            let res = await axios.post('https://api.twitch.tv/helix/channel_points/custom_rewards',
                {
                    'title': name,
                    'cost': parseInt(cost),
                    'is_user_input_required': true
                },
                {
                    params: { 'broadcaster_id': this.broadcaster_id },
                    headers: this.getTwitchHeaders()
                });
            this.reward_id = res.data.data.id;
        } catch (error) {
            console.log(error);
        }
    }

    /**
     * Gets current broadcaster_id from channel_name
     * @param broadcaster_name
     */
    async getBroadcasterId(broadcaster_name) {
        try {
            let res = await axios.get('https://api.twitch.tv/helix/users',
                {
                    params: { 'login': broadcaster_name },
                    headers: this.getTwitchHeaders(),
                    validateStatus: function (status) {
                        return status < 500;
                    }
                });
            if (res.status === 200) {
                return res.data.data[0].id;
            }
            // this is fatal and many parts will not work without this, means twitch oauth is broken
            console.log("Failed to get broadcaster ID!");
            console.log("This likely means your OAuth token is invalid. Please check your token. If this error persists, contact devs.");
        } catch (error) {
            console.log(error);
        }
    }

    /**
     * Gets the id of the last redemption for use in refundPoints()
     * @returns {Promise<string>}
     */
    async getLastRedemptionId() {
        try {
            let res = await axios.get('https://api.twitch.tv/helix/channel_points/custom_rewards/redemptions', {
                params: {
                    'broadcaster_id': this.broadcaster_id,
                    'reward_id': this.reward_id,
                    'status': 'UNFULFILLED',
                    'sort': 'NEWEST',
                    'first': 1
                },
                headers: this.getTwitchHeaders()
            });
            // Check that the returned array isn't empty
            if (res.data.data.length == 0) {
                console.error(`The redemptions array was empty. ` +
                    `Please make sure that you have not enabled 'skip redemption requests queue.'`);
                return;
            }
            // If the last redeemed ID was over a minute ago, something is wrong.
            if (Date.now - Date.parse(res.data.data[0].redeemed_at) < 60_000) {
                console.error(`The latest reward was redeemed over a minute ago. Please contact the devs.`);
                return;
            }
            return res.data.data[0].id;
        } catch (error) {
            console.log(error);
        }

    }
}
