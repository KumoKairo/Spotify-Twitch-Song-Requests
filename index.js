const express = require('express');

const fs = require('fs');
const YAML = require('yaml');

const tmi = require('tmi.js');
const axios = require('axios').default;

const open = require('open');

const Twitch = require('./twitchcontroller');

const pack = require('./package.json');

let spotifyRefreshToken = '';
let spotifyAccessToken = '';

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const twitchOauthTokenRefunds = process.env.TWITCH_OAUTH_TOKEN_REFUNDS;
const twitchClientId = process.env.TWITCH_CLIENT_ID;
const twitchOauthToken = process.env.TWITCH_OAUTH_TOKEN;

const channelPointsUsageType = 'channel_points';
const commandUsageType = 'command';
const bitsUsageType = 'bits';
const defaultRewardId = 'xxx-xxx-xxx-xxx';
const displayNameTag = 'display-name';

const streamer = 'streamer';
const mod = 'mod';
const vip = 'vip';
const everyone = 'everyone';

const spotifyShareUrlMaker = 'https://open.spotify.com/track/';

const chatbotConfig = setupYamlConfigs();
const expressPort = chatbotConfig.express_port;

// CHECK FOR UPDATES
axios.get("https://api.github.com/repos/KumoKairo/Spotify-Twitch-Song-Requests/releases/latest")
    .then(r => {
        if (r.data.tag_name !== pack.version) {
            console.log(`An update is available at ${r.data.html_url}`);
        }
    }, () => console.log("Failed to check for updates."));

// TWITCH SETUP
const twitchAPI = new Twitch();
twitchAPI.init(chatbotConfig, twitchOauthTokenRefunds, twitchClientId).then(() => chatbotConfig.custom_reward_id = twitchAPI.reward_id);


if(chatbotConfig.usage_type !== channelPointsUsageType && chatbotConfig.usage_type !== commandUsageType) {
    console.log(`Usage type is neither '${channelPointsUsageType}' nor '${commandUsageType}', app will not work. Edit your settings in the 'spotipack_config.yaml' file`);
}


const redirectUri = `http://localhost:${expressPort}/callback`;

const client = new tmi.Client({
    connection: {
        secure: true,
        reconnect: true
    },
    identity: {
        username: chatbotConfig.user_name,
        password: twitchOauthToken
    },
    channels: [ chatbotConfig.channel_name ]
});

client.connect().catch(console.error);

console.log(`Logged in as ${chatbotConfig.user_name}. Working on channel '${chatbotConfig.channel_name}'`);

client.on('message', async (channel, tags, message, self) => {
    if(self) return;
    let messageToLower = message.toLowerCase();
    
    if(chatbotConfig.usage_type === commandUsageType && chatbotConfig.command_alias.includes(messageToLower.split(" ")[0])) {
        await handleSongRequest(channel, tags[displayNameTag], message, true);
    } else if (messageToLower === chatbotConfig.skip_alias) {
        await handleSkipSong(channel, tags);
    }
    else if (chatbotConfig.use_song_command && messageToLower === '!song') {
        await handleTrackName(channel);
    }
});

client.on('redeem', async (channel, username, rewardType, tags, message) => {
    log(`Reward ID: ${rewardType}`);
    if(chatbotConfig.usage_type === channelPointsUsageType && rewardType === chatbotConfig.custom_reward_id) {
        let result = await handleSongRequest(channel, tags[displayNameTag], message, false);
        if(!result) {
            // this is duplicated in handleSongRequest().
            //client.say(chatbotConfig.channel_name, chatbotConfig.song_not_found);
            if (await twitchAPI.refundPoints()) {
                console.log(`${username} redeemed a song request that couldn't be completed. It was refunded automatically.`);
            } else {
                console.log(`${username} redeemed a song request that couldn't be completed. It could not be refunded automatically.`);
            }
        }
    }
});

client.on('cheer', async (channel, state, message) => {
    let bitsParse = parseInt(state.bits);
    let bits = isNaN(bitsParse) ? 0 : bitsParse;

    if(chatbotConfig.usage_type === bitsUsageType
            && message.includes(spotifyShareUrlMaker)
            && bits >= chatbotConfig.minimum_requred_bits) {
        let username = state[displayNameTag];

        let result = await handleSongRequest(channel, username, message, true);
        if(!result) {
            console.log(`${username} tried cheering for the song request, but it failed (broken link or something). You will have to add it manually`);
        }
    }


});

let parseActualSongUrlFromBigMessage = (message) => {
    const regex = new RegExp(`${spotifyShareUrlMaker}[^\\s]+`);
    let match = message.match(regex);
    if (match !== null) {
        return match[0];
    } else {
        return null;
    }
}

let handleTrackName = async (channel) => {
    try {
        await printTrackName(channel);
    } catch (error) {
        // Token expired
        if(error?.response?.data?.error?.status === 401) {
            await refreshAccessToken();
            await printTrackName(channel);
        } else {
            client.say(chatbotConfig.channel_name, 'Seems like no music is playing right now');
        }
    }
}

let printTrackName = async (channel) => {
    let spotifyHeaders = getSpotifyHeaders();

    let res = await axios.get('https://api.spotify.com/v1/me/player/currently-playing', {
        headers: spotifyHeaders
    });

    let trackId = res.data.item.id;
    let trackInfo = await getTrackInfo(trackId);
    let trackName = trackInfo.name;
    let artists = trackInfo.artists.map(artist => artist.name).join(', ');
    client.say(channel, `${artists} - ${trackName}`);
}

let handleSongRequest = async (channel, username, message) => {
    let validatedSongId = await validateSongRequest(message, channel);
    if(!validatedSongId) {
        client.say(channel, `${username}, I was unable to find anything.`);
        return false;
    }

    return await addValidatedSongToQueue(validatedSongId, channel, username);
}

let addValidatedSongToQueue = async (songId, channel, callerUsername) => {
    try {
        await addSongToQueue(songId, channel, callerUsername);
    } catch (error) {
        // Token expired
        if(error?.response?.data?.error?.status === 401) {
            await refreshAccessToken();
            await addSongToQueue(songId, channel, callerUsername);
        }
        // No action was received from the Spotify user recently, need to print a message to make them poke Spotify
        if(error?.response?.data?.error?.status === 404) {
            client.say(channel, `Hey, ${channel}! You forgot to actually use Spotify this time. Please open it and play some music, then I will be able to add songs to the queue`);
            return false;
        }
        if(error?.response?.status === 403) {
            client.say(channel, `It looks like you don't have Spotify Premium. Spotify doesn't allow adding songs to the Queue without having Spotify Premium OSFrog`);
            return false;
        }
        else {
            console.log('ERROR WHILE REACHING SPOTIFY');
            console.log(error?.response?.data);
            console.log(error?.response?.status);
            return false;
        }
    }

    return true;
}

let searchTrackID = async (searchString) => {
    // Excluding command aliases from the query string
    chatbotConfig.command_alias.forEach(alias => {
        searchString = searchString.replace(alias, '');
    });

    let spotifyHeaders = getSpotifyHeaders();
    searchString = searchString.replace(/-/, ' ');
    searchString = searchString.replace(/ by /, ' ');
    searchString = encodeURIComponent(searchString);
    const searchResponse = await axios.get(`https://api.spotify.com/v1/search?q=${searchString}&type=track`, {
        headers: spotifyHeaders
    });
    return searchResponse.data.tracks.items[0]?.id;
}

let validateSongRequest = async (message, channel) => {
    // If it contains a link, just use it as is
    let url = parseActualSongUrlFromBigMessage(message) ?? '';

    // If the message doesn't contain a link, we take it and trying to search for the song name
    if(!url.includes(spotifyShareUrlMaker)) {
        try {
            return await searchTrackID(message);
        } catch (error) {
            // Token expired
            if(error?.response?.data?.error?.status === 401) {
                await refreshAccessToken();
                await validateSongRequest(message, channel);
            } else {
                return false;
            }
        }
    }

    return getTrackId(url);
}

let getTrackId = (url) => {
    return url.split('/').pop().split('?')[0];
}

let getTrackInfo = async (trackId) => {
    let spotifyHeaders = getSpotifyHeaders();
    let trackInfo = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
        headers: spotifyHeaders
    });
    return trackInfo.data;
}

let addSongToQueue = async (songId, channel, callerUsername) => {
    let spotifyHeaders = getSpotifyHeaders();

    let trackInfo = await getTrackInfo(songId);

    let trackName = trackInfo.name;
    let artists = trackInfo.artists.map(artist => artist.name).join(', ');

    let uri = trackInfo.uri;

    res = await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${uri}`, {}, { headers: spotifyHeaders });

    let trackParams = {
        artists: artists,
        trackName: trackName,
        username: callerUsername
    }

    client.say(channel, handleMessageQueries(chatbotConfig.added_to_queue_message, trackParams));
}

let refreshAccessToken = async () => {
    const params = new URLSearchParams();
    params.append('refresh_token', spotifyRefreshToken);
    params.append('grant_type', 'refresh_token');
    params.append('redirect_uri', `http://localhost:${expressPort}/callback`);

    try {
        let res = await axios.post('https://accounts.spotify.com/api/token', params, {
            headers: {
                'Content-Type':'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64')
            }
        });
        spotifyAccessToken = res.data.access_token;
    } catch (error) {
        console.log(`Error refreshing token: ${error.message}`);
    }
}

function getSpotifyHeaders() {
    return {
        'Authorization': `Bearer ${spotifyAccessToken}`
    };
}

// SPOTIFY CONNECTIONG STUFF
let app = express();

app.get('/login', (req, res) => {
    const scope = 'user-modify-playback-state user-read-currently-playing';
    const authParams = new URLSearchParams();
    authParams.append('response_type', 'code');
    authParams.append('client_id', client_id);
    authParams.append('redirect_uri', redirectUri);
    authParams.append('scope', scope);
    res.redirect(`https://accounts.spotify.com/authorize?${authParams}`);
});

app.get('/callback', async (req, res) => {
    let code = req.query.code || null;

    if (!code) {
        // Print error
        return;
    }

    const params = new URLSearchParams();
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    params.append('grant_type', 'authorization_code');

    const config = {
        headers: {
            'Authorization': 'Basic ' + Buffer.from(client_id + ':' + client_secret).toString('base64'),
            'Content-Type':'application/x-www-form-urlencoded'
        }
    };

    let tokenResponse = await axios.post('https://accounts.spotify.com/api/token', params, config);

    if (!tokenResponse.statusCode === 200) {
        // Print error
        return;
    }

    spotifyAccessToken = tokenResponse.data.access_token;
    spotifyRefreshToken = tokenResponse.data.refresh_token;

    res.send('Tokens refreshed successfully. You can close this tab');
});

app.listen(expressPort);

console.log(`App is running. Visit http://localhost:${expressPort}/login to refresh the tokens if the page didn't open automatically`);
open(`http://localhost:${expressPort}/login`);

function setupYamlConfigs () {
    const configFile = fs.readFileSync('spotipack_config.yaml', 'utf8');
    let fileConfig = YAML.parse(configFile);

    fileConfig = checkIfSetupIsCorrect(fileConfig);

    return fileConfig;
}

function checkIfSetupIsCorrect(fileConfig) {
    if (fileConfig.usage_type === channelPointsUsageType && fileConfig.custom_reward_id === defaultRewardId) {
        console.log(`!ERROR!: You have set 'usage_type' to 'channel_points', but didn't provide a custom Reward ID. Refer to the manual to get the Reward ID value, or change the usage type`);
    }
    // check if we have any aliases if we are using commands
    if (fileConfig.usage_type === commandUsageType && fileConfig.command_alias.length === 0) {
        console.log(`!ERROR!: You have set 'usage_type' to 'command', but didn't provide any command aliases. Please add an alias to be able to request songs`);
    }
    else {
        for (let i = 0; i < fileConfig.command_alias.length - 1; i++) {
            fileConfig.command_alias[i] = fileConfig.command_alias[i].toLowerCase();
        }
    }
    return fileConfig;
}

function handleMessageQueries (message, params) {
    let newMessage = message;

    if (params.username) {
        newMessage = newMessage.replace('$(username)', params.username);
    }
    if (params.trackName) {
        newMessage = newMessage.replace('$(trackName)', params.trackName);
    }
    if (params.artists) {
        newMessage = newMessage.replace('$(artists)', params.artists);
    }

    return newMessage;
}

function log(message) {
    if(chatbotConfig.logs) {
        console.log(message);
    }
}

async function handleSkipSong(channel, tags) {
    try {
        let userNameClean = tags[displayNameTag].toLowerCase();

        // If the user is the streamer 
        let userCanSkip = chatbotConfig.channel_name.toLowerCase() === userNameClean;
        
        // Or if it's a mod
        userCanSkip |= chatbotConfig.skip_user_level.includes(mod) && tags.mod;
        
        // Or if it's a VIP
        userCanSkip |= chatbotConfig.skip_user_level.includes(vip) && tags.badges?.vip === '1';
        
        // Or if the tag is set to "everyone"
        userCanSkip |= chatbotConfig.skip_user_level.includes(everyone);

        if(userCanSkip) {
            console.log(`${tags[displayNameTag]} skipped the song`);
            let spotifyHeaders = getSpotifyHeaders();
            res = await axios.post('https://api.spotify.com/v1/me/player/next', {}, { headers: spotifyHeaders });
        }
    } catch (error) {
        console.log(error);
        // Skipping the error for now, let the users spam it
        // 403 error of not having premium is the same as with the request,
        // ^ TODO get one place to handle common Spotify error codes
    }
}
