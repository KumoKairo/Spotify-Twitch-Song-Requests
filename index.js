const express = require('express');

const fs = require('fs');
const YAML = require('yaml');

const tmi = require('tmi.js');
const axios = require('axios').default;

const open = require('open');

const chatbotConfig = setupYamlConfigs();

const expressPort = chatbotConfig.express_port;

let spotifyRefreshToken = '';
let spotifyAccessToken = '';

const client_id = process.env.SPOTIFY_CLIENT_ID;
const client_secret = process.env.SPOTIFY_CLIENT_SECRET;
const twitchOauthToken = process.env.TWITCH_OAUTH_TOKEN;

const channelPointsUsageType = 'channel_points';
const commandUsageType = 'command';

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

    if(chatbotConfig.usage_type === commandUsageType && messageToLower.startsWith('!songrequest')) {
        await handleSongRequest(channel, tags, message, true);
    } else if (chatbotConfig.use_song_command && messageToLower === '!song') {
        await handleTrackName(channel);
    }
});

client.on('redeem', async (channel, username, rewardType, tags, message) => {
    log(`Reward ID: ${rewardType}`);

    if(chatbotConfig.usage_type === channelPointsUsageType && rewardType === chatbotConfig.custom_reward_id) {
        let result = await handleSongRequest(channel, tags, message, false);
        if(!result) {
            console.log(`${username} redeemed a song request that couldn't be completed. Don't forget to refund it later!`);
        }
    }
});

let handleTrackName = async (channel) => {
    try {
        await printTrackName(channel);
    } catch (error) {
        // Token expired
        if(error?.response?.data?.error?.status === 401) {
            await refreshAccessToken();
            await printTrackName(channel);
        } else {
            client.say(chatbotConfig.channel_name, `Seems like no music is playing right now`);
        }
    }
}

let printTrackName = async (channel) => {
    let spotifyHeaders = getSpotifyHeaders();

    let res = await axios.get(`https://api.spotify.com/v1/me/player/currently-playing`, {
        headers: spotifyHeaders
    });

    let trackId = res.data.item.id;
    let trackInfo = await getTrackInfo(trackId);
    let trackName = trackInfo.name;
    let artists = trackInfo.artists.map(artist => artist.name).join(', ');
    client.say(channel, `${artists} - ${trackName}`);
}

let handleSongRequest = async (channel, tags, message, runAsCommand) => {
    let validatedSongId = validateSongRequest(message, channel, tags, runAsCommand);
        if(!validatedSongId) {
            return false;
        }
        try {
            await addSongToQueue(validatedSongId, channel);
        } catch (error) {
            // Token expired
            if(error?.response?.data?.error?.status === 401) {
                await refreshAccessToken();
                await addSongToQueue(validatedSongId, channel);
            } else {
                return false;
            }
        }

        return true;
}

let validateSongRequest = (message, channel, tags, runAsCommand) => {
    let url = '';
    let usernameParams = {
        username: tags.username
    };

    if(runAsCommand) {
        let splitMessage = message.split(' ');


        if (splitMessage.length < 2) {
            client.say(channel, handleMessageQueries(chatbotConfig.usage_message, usernameParams));
            return false;
        }

        url = splitMessage[1];
    } else {
        url = message;
    }

    if(!url.includes('https://open.spotify.com/track/')) {
        client.say(channel, handleMessageQueries(chatbotConfig.wrong_format_message, usernameParams));
        return false;
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

let addSongToQueue = async (songId, channel) => {
    let spotifyHeaders = getSpotifyHeaders();

    let trackInfo = await getTrackInfo(songId);

    let trackName = trackInfo.name;
    let artists = trackInfo.artists.map(artist => artist.name).join(', ');

    let uri = trackInfo.uri;

    res = await axios.post(`https://api.spotify.com/v1/me/player/queue?uri=${uri}`, {}, { headers: spotifyHeaders });

    let trackParams = {
        artists: artists,
        trackName: trackName
    }

    client.say(channel, handleMessageQueries(chatbotConfig.added_to_queue_message, trackParams));
}

let refreshAccessToken = async () => {
    const params = new URLSearchParams();
    params.append('refresh_token', spotifyRefreshToken);
    params.append('grant_type', 'refresh_token');
    params.append('redirect_uri', `http://localhost:${expressPort}/callback`);

    try {
        let res = await axios.post(`https://accounts.spotify.com/api/token`, params, {
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
    return fileConfig;
};

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